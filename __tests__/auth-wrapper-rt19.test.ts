/**
 * RT-19 / E-016: gaps left by auth-verify.test.ts and auth-wrapper-rt13.test.ts, found by mutation testing
 * src/lib/auth-verify.ts (multi-byte size cap, org inheritance, lock timing, rate-limit hook, cookie parsing).
 */
import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { billingContext } from '../src/lib/billing-context';
jest.mock('../src/lib/firebase-admin', () => ({ adminAuth: { verifyIdToken: jest.fn(), verifySessionCookie: jest.fn() }, adminDb: { collection: jest.fn(), runTransaction: jest.fn() } }));
jest.mock('../src/lib/rate-limit', () => ({ enforceRateLimit: jest.fn() }));
import { adminAuth, adminDb } from '../src/lib/firebase-admin';
import { enforceRateLimit } from '../src/lib/rate-limit';
import { authenticateRequest, verifyCallerIdentity, withAuthorizedRequest } from '../src/lib/auth-verify';

const verify = adminAuth.verifyIdToken as jest.Mock;
const verifySession = adminAuth.verifySessionCookie as jest.Mock;
const collection = adminDb.collection as jest.Mock;
const runTransaction = adminDb.runTransaction as jest.Mock;
const limiter = enforceRateLimit as jest.Mock;
const bearer = { Authorization: 'Bearer valid' };

type Doc = Record<string, unknown> | undefined;
let store: Record<string, Record<string, Doc>>;
let userReads: string[];
let deleted: string[];
let lockWrites: Array<{ path: string; data: { expiresAt: Date } }>;

const post = (body: string | undefined, headers: Record<string, string> = bearer) =>
  new NextRequest('https://scorpio.test/api/x', { method: 'POST', headers, body });
const json = (body: unknown, headers: Record<string, string> = bearer) => post(JSON.stringify(body), headers);
const ok = () => jest.fn<Promise<Response>, [NextRequest, unknown?]>(async () => NextResponse.json({ ok: true }));
const read = async (res: Response) => ({ status: res.status, body: await res.json() });

beforeEach(() => {
  jest.resetAllMocks();
  store = {
    users: {
      t1: { role: 'teacher', organizationId: 'org1' },
      s1: { role: 'student', teacherId: 't1' },
      sOwnOrg: { role: 'student', teacherId: 't1', organizationId: 'studentOrg' },
      tNoOrg: { role: 'teacher' },
      sNoOrgTeacher: { role: 'student', teacherId: 'tNoOrg' },
      sGhostTeacher: { role: 'student', teacherId: 'ghost' },
      loner: { role: 'student' },
    },
    assignments: { a1: { teacherId: 't1' } },
    submissions: { sub1: { assignmentId: 'a1' }, noAssignment: {} },
    grading_locks: {},
  };
  userReads = []; deleted = []; lockWrites = [];
  collection.mockImplementation((name: string) => ({
    doc: (id: string) => ({
      get: async () => { if (name === 'users') userReads.push(id); return { data: () => store[name]?.[id] }; },
      delete: async () => { deleted.push(`${name}/${id}`); },
      _path: `${name}/${id}`,
    }),
  }));
  runTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({
    get: async (ref: { get: () => Promise<unknown> }) => ref.get(),
    set: (ref: { _path: string }, data: { expiresAt: Date }) => { lockWrites.push({ path: ref._path, data }); },
  }));
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

describe('request size cap counts bytes, not characters', () => {
  beforeEach(() => verify.mockResolvedValue({ uid: 's1' }));
  // {"p":"<pad>"} has 8 bytes of JSON syntax around the pad.
  const body = (chars: number, ch: string) => JSON.stringify({ p: ch.repeat(chars) });

  test('250,000 two-byte characters is over 500,000 bytes -> 413 although its string length is under the cap', async () => {
    const raw = body(250000, 'é');
    expect(raw.length).toBeLessThan(500000);
    expect(Buffer.byteLength(raw)).toBeGreaterThan(500000);
    const h = ok();
    expect((await withAuthorizedRequest(h)(post(raw))).status).toBe(413);
    expect(h).not.toHaveBeenCalled();
  });

  test('a multi-byte body of exactly 500,000 bytes is accepted', async () => {
    const raw = body((500000 - 8) / 2, 'é');
    expect(Buffer.byteLength(raw)).toBe(500000);
    expect((await withAuthorizedRequest(ok())(post(raw))).status).toBe(200);
  });

  test('the size check runs before JSON parsing: an oversized non-JSON body is 413, not 400', async () => {
    expect((await withAuthorizedRequest(ok())(post('x'.repeat(500001)))).status).toBe(413);
  });

  test('the size check runs before any profile read', async () => {
    await withAuthorizedRequest(ok())(post(body(500000, 'x')));
    expect(userReads).toEqual([]);
  });
});

describe('identityField', () => {
  beforeEach(() => verify.mockResolvedValue({ uid: 's1' }));
  test('matching uid -> handler runs', async () => {
    const h = ok();
    expect((await withAuthorizedRequest(h, { identityField: 'studentId' })(json({ studentId: 's1' }))).status).toBe(200);
    expect(h).toHaveBeenCalledTimes(1);
  });
  test('absent field -> 403', async () => {
    expect((await withAuthorizedRequest(ok(), { identityField: 'studentId' })(json({ other: 's1' }))).status).toBe(403);
  });
  test('non-string match (number) -> 403', async () => {
    expect((await withAuthorizedRequest(ok(), { identityField: 'studentId' })(json({ studentId: 1 }))).status).toBe(403);
  });
  test('no identityField option -> body is not compared with the uid', async () => {
    expect((await withAuthorizedRequest(ok())(json({ userId: 'someone-else' }))).status).toBe(200);
  });
  test('the identity check happens before the profile is read', async () => {
    await withAuthorizedRequest(ok(), { identityField: 'studentId' })(json({ studentId: 'other' }));
    expect(userReads).toEqual([]);
  });
});

describe('profile and teacher gate', () => {
  test('teacher option lets a teacher through and passes the profile to the handler', async () => {
    verify.mockResolvedValue({ uid: 't1' });
    const h = ok();
    await withAuthorizedRequest(h, { teacher: true })(json({}));
    expect(h.mock.calls[0][1]).toMatchObject({ profile: { role: 'teacher', organizationId: 'org1' } });
  });
  test('without the teacher option a student is allowed', async () => {
    verify.mockResolvedValue({ uid: 's1' });
    expect((await withAuthorizedRequest(ok())(json({}))).status).toBe(200);
  });
  test('role must be exactly "teacher"', async () => {
    store.users.odd = { role: 'Teacher' };
    verify.mockResolvedValue({ uid: 'odd' });
    expect((await withAuthorizedRequest(ok(), { teacher: true })(json({}))).status).toBe(403);
  });
  test('admin claim without a profile gets an empty profile and organizationId ""', async () => {
    verify.mockResolvedValue({ uid: 'op', admin: true });
    collection.mockImplementation((name: string) => name === 'admin_audit'
      ? { add: async () => ({ id: 'a' }) }
      : { doc: () => ({ get: async () => ({ data: () => undefined }) }) });
    const h = ok();
    expect((await withAuthorizedRequest(h, { admin: true })(json({}))).status).toBe(200);
    expect(h.mock.calls[0][1]).toMatchObject({ profile: {}, organizationId: '' });
  });
  test('an admin claim does not satisfy the teacher option when there is no profile', async () => {
    verify.mockResolvedValue({ uid: 'op', admin: true });
    collection.mockImplementation((name: string) => name === 'admin_audit'
      ? { add: async () => ({ id: 'a' }) }
      : { doc: () => ({ get: async () => ({ data: () => undefined }) }) });
    expect((await withAuthorizedRequest(ok(), { admin: true, teacher: true })(json({}))).status).toBe(403);
  });
});

describe('organization inheritance', () => {
  const orgSeenBy = async (uid: string) => {
    verify.mockResolvedValue({ uid });
    const seen: Array<string | undefined> = [];
    const h = jest.fn(async () => { seen.push(billingContext.getStore()?.organizationId); return NextResponse.json({ ok: true }); });
    const res = await withAuthorizedRequest(h)(json({}));
    return { status: res.status, org: seen[0], ctx: h };
  };
  test("own organization wins over the teacher's and the teacher is not even read", async () => {
    const r = await orgSeenBy('sOwnOrg');
    expect(r.org).toBe('studentOrg');
    expect(userReads).toEqual(['sOwnOrg']);
  });
  test("a student without an organization reads the teacher's once and inherits it", async () => {
    const r = await orgSeenBy('s1');
    expect(r.org).toBe('org1');
    expect(userReads).toEqual(['s1', 't1']);
  });
  test('teacher without an organization -> "" (no inheritance from the student)', async () => {
    expect((await orgSeenBy('tNoOrg')).org).toBe('');
  });
  test('student whose teacher has no organization -> ""', async () => {
    expect((await orgSeenBy('sNoOrgTeacher')).org).toBe('');
  });
  test('student whose teacher document is missing -> "" and no error', async () => {
    const r = await orgSeenBy('sGhostTeacher');
    expect(r.status).toBe(200);
    expect(r.org).toBe('');
  });
  test('profile with neither organization nor teacher -> "" and no teacher lookup', async () => {
    const r = await orgSeenBy('loner');
    expect(r.org).toBe('');
    expect(userReads).toEqual(['loner']);
  });
  test('context.organizationId matches the billing context', async () => {
    verify.mockResolvedValue({ uid: 's1' });
    const h = ok();
    await withAuthorizedRequest(h)(json({}));
    expect(h.mock.calls[0][1]).toMatchObject({ organizationId: 'org1' });
  });
});

describe('submission resource', () => {
  const opts = { teacher: true, resource: 'submission' as const };
  beforeEach(() => verify.mockResolvedValue({ uid: 't1' }));

  test('submission with no assignmentId -> 403', async () => {
    expect((await withAuthorizedRequest(ok(), opts)(json({ submissionId: 'noAssignment' }))).status).toBe(403);
  });
  test('without the teacher option a non-owner is still denied by assignment ownership', async () => {
    verify.mockResolvedValue({ uid: 's1' });
    expect((await withAuthorizedRequest(ok(), { resource: 'submission' })(json({ submissionId: 'sub1' }))).status).toBe(403);
  });
  test('denied requests never take the lock', async () => {
    verify.mockResolvedValue({ uid: 'someoneElse' });
    store.users.someoneElse = { role: 'teacher' };
    await withAuthorizedRequest(ok(), opts)(json({ submissionId: 'sub1' }));
    expect(runTransaction).not.toHaveBeenCalled();
  });

  describe('grading lock timing', () => {
    beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-11-01T10:00:00Z')); });

    test('the lock is held for 15 minutes from now', async () => {
      await withAuthorizedRequest(ok(), opts)(json({ submissionId: 'sub1' }));
      expect(lockWrites).toHaveLength(1);
      expect(lockWrites[0].path).toBe('grading_locks/sub1');
      expect(lockWrites[0].data.expiresAt.getTime()).toBe(Date.now() + 15 * 60 * 1000);
    });
    test('a lock expiring exactly now is expired and can be taken', async () => {
      store.grading_locks.sub1 = { expiresAt: { toMillis: () => Date.now() } };
      expect((await withAuthorizedRequest(ok(), opts)(json({ submissionId: 'sub1' }))).status).toBe(200);
    });
    test('a lock expiring in 1 ms is still live -> 409', async () => {
      store.grading_locks.sub1 = { expiresAt: { toMillis: () => Date.now() + 1 } };
      expect((await withAuthorizedRequest(ok(), opts)(json({ submissionId: 'sub1' }))).status).toBe(409);
    });
    test('a lock document without expiresAt does not block', async () => {
      store.grading_locks.sub1 = {};
      expect((await withAuthorizedRequest(ok(), opts)(json({ submissionId: 'sub1' }))).status).toBe(200);
    });
    test('the 409 path neither writes a lock nor deletes the holder\'s lock', async () => {
      store.grading_locks.sub1 = { expiresAt: { toMillis: () => Date.now() + 60000 } };
      await withAuthorizedRequest(ok(), opts)(json({ submissionId: 'sub1' }));
      expect(lockWrites).toEqual([]);
      expect(deleted).toEqual([]);
    });
  });

  test('ungraded (graded: false) submission still runs the handler', async () => {
    store.submissions.sub1 = { assignmentId: 'a1', graded: false, score: 3 };
    const h = ok();
    expect(await read(await withAuthorizedRequest(h, opts)(json({ submissionId: 'sub1' })))).toEqual({ status: 200, body: { ok: true } });
    expect(h).toHaveBeenCalledTimes(1);
  });
  test('a failing lock transaction is a 500 with a request id and the handler is not called', async () => {
    runTransaction.mockRejectedValue(new Error('contention'));
    const h = ok();
    const res = await read(await withAuthorizedRequest(h, opts)(json({ submissionId: 'sub1' })));
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
    expect(typeof res.body.requestId).toBe('string');
    expect(h).not.toHaveBeenCalled();
  });
  test('a failure to release the lock is surfaced as a 500', async () => {
    collection.mockImplementation((name: string) => ({
      doc: (id: string) => ({
        get: async () => ({ data: () => store[name]?.[id] }),
        delete: async () => { throw new Error('delete failed'); },
        _path: `${name}/${id}`,
      }),
    }));
    expect((await withAuthorizedRequest(ok(), opts)(json({ submissionId: 'sub1' }))).status).toBe(500);
  });
  test('the handler error is logged without leaking into the response, with the request id', async () => {
    const h = jest.fn(async () => { throw new Error('db password=hunter2'); });
    const res = await read(await withAuthorizedRequest(h, opts)(json({ submissionId: 'sub1' })));
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining(`requestId=${res.body.requestId}`), 'db password=hunter2');
  });
});

describe('portfolio resource', () => {
  const opts = { teacher: true, resource: 'portfolio' as const };
  beforeEach(() => verify.mockResolvedValue({ uid: 't1' }));
  test('studentId that is not a string -> 400', async () => {
    expect((await withAuthorizedRequest(ok(), opts)(json({ studentId: 5, organizationId: 'org1' }))).status).toBe(400);
  });
  test('student without a teacher -> 403', async () => {
    expect((await withAuthorizedRequest(ok(), opts)(json({ studentId: 'loner', organizationId: 'org1' }))).status).toBe(403);
  });
  test("student whose teacher doc is missing and who is not the caller's -> 403", async () => {
    expect((await withAuthorizedRequest(ok(), opts)(json({ studentId: 'sGhostTeacher', organizationId: 'org1' }))).status).toBe(403);
  });
  test('missing body organizationId -> 403', async () => {
    expect((await withAuthorizedRequest(ok(), opts)(json({ studentId: 's1' }))).status).toBe(403);
  });
  test("the caller's own student is allowed even if the student's teacher record has no organization", async () => {
    store.users.t1 = { role: 'teacher', organizationId: 'org1' };
    store.users.sNoOrgTeacher = { role: 'student', teacherId: 't1' };
    expect((await withAuthorizedRequest(ok(), opts)(json({ studentId: 'sNoOrgTeacher', organizationId: 'org1' }))).status).toBe(200);
  });
  test('a colleague with a matching organization may read another teacher\'s student; a mismatch may not', async () => {
    store.users.t9 = { role: 'teacher', organizationId: 'org1' };
    store.users.s9 = { role: 'student', teacherId: 't9' };
    expect((await withAuthorizedRequest(ok(), opts)(json({ studentId: 's9', organizationId: 'org1' }))).status).toBe(200);
    store.users.t9 = { role: 'teacher', organizationId: 'other' };
    expect((await withAuthorizedRequest(ok(), opts)(json({ studentId: 's9', organizationId: 'org1' }))).status).toBe(403);
  });
  test('a teacher without an organization is never allowed, even when the request also omits it', async () => {
    verify.mockResolvedValue({ uid: 'tNoOrg' });
    store.users.sx = { role: 'student', teacherId: 'tNoOrg' };
    expect((await withAuthorizedRequest(ok(), opts)(json({ studentId: 'sx' }))).status).toBe(403);
  });
});

describe('rateLimit option', () => {
  test('the limiter is charged with the verified uid after authentication', async () => {
    verify.mockResolvedValue({ uid: 's1' });
    limiter.mockResolvedValue(null);
    const req = json({});
    expect((await withAuthorizedRequest(ok(), { rateLimit: 'write' })(req)).status).toBe(200);
    expect(limiter).toHaveBeenCalledWith(req, 'write', 's1');
  });
  test('a 429 from the limiter is returned as is and nothing else runs', async () => {
    verify.mockResolvedValue({ uid: 's1' });
    limiter.mockResolvedValue(NextResponse.json({ error: 'slow down' }, { status: 429 }));
    const h = ok();
    expect(await read(await withAuthorizedRequest(h, { rateLimit: 'write' })(json({})))).toEqual({ status: 429, body: { error: 'slow down' } });
    expect(h).not.toHaveBeenCalled();
    expect(userReads).toEqual([]);
  });
  test('unauthenticated requests are rejected before the limiter is charged', async () => {
    expect((await withAuthorizedRequest(ok(), { rateLimit: 'write' })(post('{}', {}))).status).toBe(401);
    expect(limiter).not.toHaveBeenCalled();
  });
  test('routes without the option never touch the limiter', async () => {
    verify.mockResolvedValue({ uid: 's1' });
    await withAuthorizedRequest(ok())(json({}));
    expect(limiter).not.toHaveBeenCalled();
  });
});

describe('authenticateRequest and verifyCallerIdentity', () => {
  const withCookie = (value: string) => post('{}', { cookie: `__session=${encodeURIComponent(value)}` });
  test('verifyCallerIdentity returns authorized: true for the matching account', async () => {
    verify.mockResolvedValue({ uid: 's1' });
    expect(await verifyCallerIdentity(json({}), 's1')).toEqual({ authorized: true });
  });
  test('verifyCallerIdentity gives a generic error for a mismatch', async () => {
    verify.mockResolvedValue({ uid: 's1' });
    expect(await verifyCallerIdentity(json({}), 's2')).toEqual({ authorized: false, error: 'Valid authentication for this account is required' });
  });
  test('an Authorization header that is not a Bearer token falls through to the cookie', async () => {
    verifySession.mockResolvedValue({ uid: 'c1' });
    const req = new NextRequest('https://scorpio.test/api/x', { method: 'POST', headers: { Authorization: 'Basic abc', cookie: '__session=tok' }, body: '{}' });
    expect(await authenticateRequest(req)).toEqual({ uid: 'c1' });
    expect(verify).not.toHaveBeenCalled();
    expect(verifySession).toHaveBeenCalledWith('tok', true);
  });
  test('the bearer is taken after exactly "Bearer "', async () => {
    verify.mockResolvedValue({ uid: 'b1' });
    await authenticateRequest(post('{}', { Authorization: 'Bearer abc.def' }));
    expect(verify).toHaveBeenCalledWith('abc.def', true);
  });
  test('a bearer that fails verification does not fall back to a cookie', async () => {
    verify.mockRejectedValue(new Error('expired'));
    verifySession.mockResolvedValue({ uid: 'c1' });
    expect(await authenticateRequest(post('{}', { Authorization: 'Bearer bad', cookie: '__session=tok' }))).toBeNull();
    expect(verifySession).not.toHaveBeenCalled();
  });
  test('no bearer and no cookie -> null without calling Firebase', async () => {
    expect(await authenticateRequest(post('{}', {}))).toBeNull();
    expect(verify).not.toHaveBeenCalled();
    expect(verifySession).not.toHaveBeenCalled();
  });
  test('an empty cookie value -> null', async () => {
    expect(await authenticateRequest(post('{}', { cookie: '__session=' }))).toBeNull();
    expect(verifySession).not.toHaveBeenCalled();
  });
  test('a packed cookie whose token is not a string -> null', async () => {
    expect(await authenticateRequest(withCookie(JSON.stringify({ token: 5 })))).toBeNull();
    expect(await authenticateRequest(withCookie(JSON.stringify({ token: '' })))).toBeNull();
    expect(await authenticateRequest(withCookie(JSON.stringify({ role: 'teacher' })))).toBeNull();
    expect(verifySession).not.toHaveBeenCalled();
  });
  test('a packed cookie with broken JSON -> null', async () => {
    expect(await authenticateRequest(withCookie('{broken'))).toBeNull();
  });
  test('a revoked session cookie -> null', async () => {
    verifySession.mockRejectedValue(new Error('auth/session-cookie-revoked'));
    expect(await authenticateRequest(post('{}', { cookie: '__session=tok' }))).toBeNull();
  });
});

// Mutation survivors from the first Stryker run: response bodies, log labels and audit field shapes.
describe('error bodies, log labels and audit records', () => {
  const adds: Array<Record<string, unknown>> = [];
  const auditing = (profile: Doc) => (name: string) => name === 'admin_audit'
    ? { add: async (doc: Record<string, unknown>) => { adds.push(doc); return { id: 'a' }; } }
    : { doc: () => ({ get: async () => ({ data: () => profile }) }) };
  beforeEach(() => { adds.length = 0; });

  test('403 for a non-admin names the problem', async () => {
    verify.mockResolvedValue({ uid: 's1' });
    collection.mockImplementation(auditing({ role: 'student' }));
    expect(await read(await withAuthorizedRequest(ok(), { admin: true })(json({})))).toEqual({ status: 403, body: { error: 'Admin access required' } });
  });
  test('an audit write failure is a 500 "Unable to record audit entry"', async () => {
    verify.mockResolvedValue({ uid: 'op', admin: true });
    collection.mockImplementation(() => ({ add: async () => { throw new Error('down'); } }));
    expect(await read(await withAuthorizedRequest(ok(), { admin: true })(json({})))).toEqual({ status: 500, body: { error: 'Unable to record audit entry' } });
  });
  test('non-object JSON is rejected with "Invalid request body"', async () => {
    verify.mockResolvedValue({ uid: 's1' });
    expect(await read(await withAuthorizedRequest(ok())(post('[1]')))).toEqual({ status: 400, body: { error: 'Invalid request body' } });
  });
  test('audit records store action and collection only when they are strings, else null', async () => {
    verify.mockResolvedValue({ uid: 'op', admin: true });
    collection.mockImplementation(auditing({ role: 'teacher' }));
    await withAuthorizedRequest(ok(), { admin: true })(json({ action: 'delete', collectionName: 'users' }));
    await withAuthorizedRequest(ok(), { admin: true })(json({ action: 5, collectionName: { a: 1 } }));
    await withAuthorizedRequest(ok(), { admin: true })(json({}));
    expect(adds.map(a => [a.action, a.collection])).toEqual([['delete', 'users'], [null, null], [null, null]]);
  });
  test('the audit IP hash is 16 hex chars and differs between callers; a missing IP is hashed as "unknown-ip"', async () => {
    verify.mockResolvedValue({ uid: 'op', admin: true });
    collection.mockImplementation(auditing({ role: 'teacher' }));
    await withAuthorizedRequest(ok(), { admin: true })(json({}, { ...bearer, 'x-vercel-forwarded-for': '203.0.113.5' }));
    await withAuthorizedRequest(ok(), { admin: true })(json({}, { ...bearer, 'x-vercel-forwarded-for': '203.0.113.6' }));
    await withAuthorizedRequest(ok(), { admin: true })(json({}));
    const hashes = adds.map(a => a.ipHash as string);
    for (const h of hashes) expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(new Set(hashes).size).toBe(3);
    expect(hashes[2]).toBe(createHash('sha256').update('unknown-ip').digest('hex').slice(0, 16));
  });
  test('audit records the route, method and caller', async () => {
    verify.mockResolvedValue({ uid: 'op', admin: true });
    collection.mockImplementation(auditing({ role: 'teacher' }));
    await withAuthorizedRequest(ok(), { admin: true })(json({}));
    expect(adds[0]).toMatchObject({ uid: 'op', route: '/api/x', method: 'POST', outcome: 'allowed' });
  });
  test('a whitespace-only body is normalised to {} for handlers that read it', async () => {
    verify.mockResolvedValue({ uid: 's1' });
    const h = jest.fn(async (r: NextRequest) => NextResponse.json({ got: await r.json() }));
    expect(await read(await withAuthorizedRequest(h)(post('   ')))).toEqual({ status: 200, body: { got: {} } });
  });
  test('a graded-lookup on a submission document that vanished runs the handler', async () => {
    verify.mockResolvedValue({ uid: 't1' });
    let reads = 0;
    collection.mockImplementation((name: string) => ({
      doc: (id: string) => ({
        get: async () => ({ data: () => (name === 'submissions' && ++reads > 1 ? undefined : store[name]?.[id]) }),
        delete: async () => undefined,
        _path: `${name}/${id}`,
      }),
    }));
    const h = ok();
    expect((await withAuthorizedRequest(h, { teacher: true, resource: 'submission' })(json({ submissionId: 'sub1' }))).status).toBe(200);
    expect(h).toHaveBeenCalledTimes(1);
  });
  test('the cookie jar without __session is unauthenticated', async () => {
    expect((await withAuthorizedRequest(ok())(post('{}', { cookie: 'other=1' }))).status).toBe(401);
  });

  describe('log labels identify which phase failed', () => {
    const labelOf = () => (console.error as jest.Mock).mock.calls[0][0] as string;
    test('authorization failure', async () => {
      verify.mockResolvedValue({ uid: 's1' });
      collection.mockImplementation(() => ({ doc: () => ({ get: async () => { throw new Error('x'); } }) }));
      const res = await read(await withAuthorizedRequest(ok())(json({})));
      expect(res.body.error).toBe('Internal server error');
      expect(labelOf()).toContain('authorization failed');
    });
    test('handler failure', async () => {
      verify.mockResolvedValue({ uid: 's1' });
      await withAuthorizedRequest(jest.fn(async () => { throw new Error('x'); }))(json({}));
      expect(labelOf()).toContain('handler threw');
    });
    test('grading lock failure', async () => {
      verify.mockResolvedValue({ uid: 't1' });
      runTransaction.mockRejectedValue(new Error('x'));
      await withAuthorizedRequest(ok(), { teacher: true, resource: 'submission' })(json({ submissionId: 'sub1' }));
      expect(labelOf()).toContain('grading lock failed');
    });
    test('a non-Error throw is logged as is', async () => {
      verify.mockResolvedValue({ uid: 's1' });
      await withAuthorizedRequest(jest.fn(async () => { throw 'plain string'; }))(json({}));
      expect((console.error as jest.Mock).mock.calls[0][1]).toBe('plain string');
    });
  });
});
