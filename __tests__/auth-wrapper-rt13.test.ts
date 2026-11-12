import { NextRequest, NextResponse } from 'next/server';
import { billingContext } from '../src/lib/billing-context';
jest.mock('../src/lib/firebase-admin', () => ({ adminAuth: { verifyIdToken: jest.fn(), verifySessionCookie: jest.fn() }, adminDb: { collection: jest.fn(), runTransaction: jest.fn() } }));
import { adminAuth, adminDb } from '../src/lib/firebase-admin';
import { withAuthorizedRequest } from '../src/lib/auth-verify';

const verify = adminAuth.verifyIdToken as jest.Mock;
const collection = adminDb.collection as jest.Mock;
const runTransaction = adminDb.runTransaction as jest.Mock;
const bearer = { Authorization: 'Bearer valid' };

type Doc = Record<string, unknown> | undefined;
let store: Record<string, Record<string, Doc>>;
let deleted: string[];
let sets: string[];

const post = (body: string | undefined, headers: Record<string, string> = bearer, path = '/api/x') =>
  new NextRequest(`https://scorpio.test${path}`, { method: 'POST', headers, body });
const json = (body: unknown, headers: Record<string, string> = bearer, path = '/api/x') => post(JSON.stringify(body), headers, path);
type TestHandler = (req: NextRequest, ctx?: unknown) => Promise<Response>;
const ok = () => jest.fn<Promise<Response>, Parameters<TestHandler>>(async () => NextResponse.json({ ok: true }));
const read = async (res: Response) => ({ status: res.status, body: await res.json() });

beforeEach(() => {
  jest.resetAllMocks();
  store = {
    users: {
      t1: { role: 'teacher', organizationId: 'org1' },
      t2: { role: 'teacher', organizationId: 'org2' },
      s1: { role: 'student', teacherId: 't1' },
      s2: { role: 'student', teacherId: 't2' },
      orphan: { role: 'student' },
    },
    assignments: { a1: { teacherId: 't1' } },
    submissions: { sub1: { assignmentId: 'a1' }, sub2: { assignmentId: 'missing' } },
    grading_locks: {},
  };
  deleted = []; sets = [];
  collection.mockImplementation((name: string) => ({
    doc: (id: string) => ({
      get: async () => ({ data: () => store[name]?.[id] }),
      delete: async () => { deleted.push(`${name}/${id}`); },
      _path: `${name}/${id}`,
    }),
  }));
  runTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({
    get: async (ref: { get: () => Promise<unknown> }) => ref.get(),
    set: (ref: { _path: string }) => { sets.push(ref._path); },
  }));
});

// RT-13 / G-004, E-016: characterisation of every branch of withAuthorizedRequest (status + body).
describe('withAuthorizedRequest characterisation', () => {
  describe('authentication', () => {
    test('no credentials -> 401', async () => {
      expect(await read(await withAuthorizedRequest(ok())(post('{}', {})))).toEqual({ status: 401, body: { error: 'Authentication required' } });
    });
    test('invalid or expired token -> 401', async () => {
      verify.mockRejectedValue(new Error('auth/id-token-expired'));
      expect(await read(await withAuthorizedRequest(ok())(json({})))).toEqual({ status: 401, body: { error: 'Authentication required' } });
    });
  });

  describe('body handling', () => {
    beforeEach(() => verify.mockResolvedValue({ uid: 's1' }));
    test('body of exactly 500000 bytes is accepted', async () => {
      const raw = JSON.stringify({ pad: 'x'.repeat(500000 - 10) });
      expect(Buffer.byteLength(raw)).toBe(500000);
      expect((await withAuthorizedRequest(ok())(post(raw))).status).toBe(200);
    });
    test('body of 500001 bytes -> 413', async () => {
      const h = ok();
      const raw = JSON.stringify({ pad: 'x'.repeat(500001 - 10) });
      expect(Buffer.byteLength(raw)).toBe(500001);
      expect(await read(await withAuthorizedRequest(h)(post(raw)))).toEqual({ status: 413, body: { error: 'Request too large' } });
      expect(h).not.toHaveBeenCalled();
    });
    test('invalid JSON -> 400 and the handler is not called', async () => {
      const h = ok();
      const res = await read(await withAuthorizedRequest(h)(post('{not json')));
      expect(res.status).toBe(400);
      expect(typeof res.body.error).toBe('string');
      expect(h).not.toHaveBeenCalled();
    });
  });

  describe('identity, profile and role', () => {
    test('identityField mismatch -> 403 Account mismatch', async () => {
      verify.mockResolvedValue({ uid: 's1' });
      expect(await read(await withAuthorizedRequest(ok(), { identityField: 'userId' })(json({ userId: 'other' })))).toEqual({ status: 403, body: { error: 'Account mismatch' } });
    });
    test('missing profile -> 403 Access denied', async () => {
      verify.mockResolvedValue({ uid: 'ghost' });
      expect(await read(await withAuthorizedRequest(ok())(json({})))).toEqual({ status: 403, body: { error: 'Access denied' } });
    });
    test('student on a teacher route -> 403 Access denied', async () => {
      verify.mockResolvedValue({ uid: 's1' });
      expect(await read(await withAuthorizedRequest(ok(), { teacher: true })(json({})))).toEqual({ status: 403, body: { error: 'Access denied' } });
    });
    test('teacher on a teacher route -> 200', async () => {
      verify.mockResolvedValue({ uid: 't1' });
      expect(await read(await withAuthorizedRequest(ok(), { teacher: true })(json({})))).toEqual({ status: 200, body: { ok: true } });
    });
    test('the handler can read the request body itself', async () => {
      verify.mockResolvedValue({ uid: 's1' });
      const h = jest.fn(async (r: NextRequest) => NextResponse.json(await r.json()));
      expect(await read(await withAuthorizedRequest(h)(json({ hello: 'w' })))).toEqual({ status: 200, body: { hello: 'w' } });
    });
  });

  describe('submission resource', () => {
    const opts = { teacher: true, resource: 'submission' as const };
    beforeEach(() => verify.mockResolvedValue({ uid: 't1' }));
    test.each([[{}], [{ submissionId: 5 }], [{ submissionId: 'a/b' }]])('invalid submissionId %j -> 400', async body => {
      expect(await read(await withAuthorizedRequest(ok(), opts)(json(body)))).toEqual({ status: 400, body: { error: 'Invalid submission' } });
    });
    test('unknown submission -> 403', async () => {
      expect(await read(await withAuthorizedRequest(ok(), opts)(json({ submissionId: 'nope' })))).toEqual({ status: 403, body: { error: 'Access denied' } });
    });
    test('submission whose assignment is missing -> 403', async () => {
      expect((await withAuthorizedRequest(ok(), opts)(json({ submissionId: 'sub2' }))).status).toBe(403);
    });
    test('assignment owned by another teacher -> 403', async () => {
      verify.mockResolvedValue({ uid: 't2' });
      expect((await withAuthorizedRequest(ok(), opts)(json({ submissionId: 'sub1' }))).status).toBe(403);
    });
    test('owner acquires the lock, runs the handler and releases the lock', async () => {
      expect(await read(await withAuthorizedRequest(ok(), opts)(json({ submissionId: 'sub1' })))).toEqual({ status: 200, body: { ok: true } });
      expect(sets).toEqual(['grading_locks/sub1']);
      expect(deleted).toEqual(['grading_locks/sub1']);
    });
    test('live lock -> 409 and the handler is not called', async () => {
      store.grading_locks.sub1 = { expiresAt: { toMillis: () => Date.now() + 60000 } };
      const h = ok();
      expect(await read(await withAuthorizedRequest(h, opts)(json({ submissionId: 'sub1' })))).toEqual({ status: 409, body: { error: 'Grading is already in progress' } });
      expect(h).not.toHaveBeenCalled();
    });
    test('expired lock is taken over', async () => {
      store.grading_locks.sub1 = { expiresAt: { toMillis: () => Date.now() - 1 } };
      expect((await withAuthorizedRequest(ok(), opts)(json({ submissionId: 'sub1' }))).status).toBe(200);
    });
    test('already graded submission short-circuits with the stored score', async () => {
      store.submissions.sub1 = { assignmentId: 'a1', graded: true, score: 7 };
      const h = ok();
      expect(await read(await withAuthorizedRequest(h, opts)(json({ submissionId: 'sub1' })))).toEqual({ status: 200, body: { success: true, score: 7 } });
      expect(h).not.toHaveBeenCalled();
      expect(deleted).toEqual(['grading_locks/sub1']);
    });
  });

  describe('portfolio resource', () => {
    const opts = { teacher: true, resource: 'portfolio' as const };
    beforeEach(() => verify.mockResolvedValue({ uid: 't1' }));
    test.each([[{ organizationId: 'org1' }], [{ studentId: 'a/b', organizationId: 'org1' }]])('invalid studentId %j -> 400', async body => {
      expect(await read(await withAuthorizedRequest(ok(), opts)(json(body)))).toEqual({ status: 400, body: { error: 'Invalid student' } });
    });
    test('own student in own organization -> 200', async () => {
      expect((await withAuthorizedRequest(ok(), opts)(json({ studentId: 's1', organizationId: 'org1' }))).status).toBe(200);
    });
    test('organizationId not matching the caller -> 403', async () => {
      expect((await withAuthorizedRequest(ok(), opts)(json({ studentId: 's1', organizationId: 'org2' }))).status).toBe(403);
    });
    test('student of a teacher in the same organization -> 200', async () => {
      store.users.t3 = { role: 'teacher', organizationId: 'org1' };
      store.users.s3 = { role: 'student', teacherId: 't3' };
      expect((await withAuthorizedRequest(ok(), opts)(json({ studentId: 's3', organizationId: 'org1' }))).status).toBe(200);
    });
    test('student of a teacher in another organization -> 403', async () => {
      expect(await read(await withAuthorizedRequest(ok(), opts)(json({ studentId: 's2', organizationId: 'org1' })))).toEqual({ status: 403, body: { error: 'Access denied' } });
    });
    test('unknown student -> 403', async () => {
      expect((await withAuthorizedRequest(ok(), opts)(json({ studentId: 'nobody', organizationId: 'org1' }))).status).toBe(403);
    });
    test('caller without an organization -> 403', async () => {
      verify.mockResolvedValue({ uid: 'orphanT' });
      store.users.orphanT = { role: 'teacher' };
      expect((await withAuthorizedRequest(ok(), opts)(json({ studentId: 's1', organizationId: 'org1' }))).status).toBe(403);
    });
  });

  describe('billing context', () => {
    const capture = () => {
      const seen: Array<{ organizationId?: string; userId?: string; type?: string }> = [];
      const h = jest.fn(async () => { seen.push({ ...billingContext.getStore()! }); return NextResponse.json({ ok: true }); });
      return { seen, h };
    };
    test('own organization id is used', async () => {
      verify.mockResolvedValue({ uid: 't1' });
      const { seen, h } = capture();
      await withAuthorizedRequest(h)(json({}));
      expect(seen[0]).toEqual({ organizationId: 'org1', userId: 't1', type: 'navigation' });
    });
    test("a student without an organization inherits their teacher's", async () => {
      verify.mockResolvedValue({ uid: 's1' });
      const { seen, h } = capture();
      await withAuthorizedRequest(h)(json({}));
      expect(seen[0].organizationId).toBe('org1');
    });
    test('no organization anywhere -> empty string', async () => {
      verify.mockResolvedValue({ uid: 'orphan' });
      const { seen, h } = capture();
      await withAuthorizedRequest(h)(json({}));
      expect(seen[0].organizationId).toBe('');
    });
    test('submission and portfolio resources map to grading and portfolio', async () => {
      verify.mockResolvedValue({ uid: 't1' });
      const { seen, h } = capture();
      await withAuthorizedRequest(h, { resource: 'submission' })(json({ submissionId: 'sub1' }));
      await withAuthorizedRequest(h, { resource: 'portfolio' })(json({ studentId: 's1', organizationId: 'org1' }));
      expect(seen.map(s => s.type)).toEqual(['grading', 'portfolio']);
    });
  });
});

// RT-13: changed semantics (these were red before the fix).
describe('withAuthorizedRequest RT-13 semantics', () => {
  beforeEach(() => {
    verify.mockResolvedValue({ uid: 't1' });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  test('an empty POST body reaches the handler, which can read it as {}', async () => {
    const h = jest.fn(async (r: NextRequest) => NextResponse.json({ got: await r.json() }));
    expect(await read(await withAuthorizedRequest(h)(post(undefined)))).toEqual({ status: 200, body: { got: {} } });
  });
  test('a whitespace-only body is also treated as {}', async () => {
    expect((await withAuthorizedRequest(ok())(post('  \n'))).status).toBe(200);
  });
  test('empty body still fails an identityField check with 403, not 400', async () => {
    expect((await withAuthorizedRequest(ok(), { identityField: 'userId' })(post(undefined))).status).toBe(403);
  });
  test('invalid JSON is 400 "Invalid JSON"', async () => {
    expect(await read(await withAuthorizedRequest(ok())(post('{oops')))).toEqual({ status: 400, body: { error: 'Invalid JSON' } });
  });
  test.each(['null', '5', '[1]', '"s"'])('non-object JSON %s is 400', async raw => {
    expect((await withAuthorizedRequest(ok())(post(raw))).status).toBe(400);
  });
  test('a handler that throws returns 500 with a request id and no internal detail', async () => {
    const h = jest.fn(async () => { throw new Error('secret internals'); });
    const res = await read(await withAuthorizedRequest(h)(post('{}')));
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
    expect(typeof res.body.requestId).toBe('string');
    expect(JSON.stringify(res.body)).not.toContain('secret');
  });
  test('a profile lookup failure is 500, not 400', async () => {
    collection.mockImplementation(() => ({ doc: () => ({ get: async () => { throw new Error('firestore down'); } }) }));
    expect((await withAuthorizedRequest(ok())(post('{}'))).status).toBe(500);
  });
  test('a throwing grading handler is 500 and still releases the lock', async () => {
    const h = jest.fn(async () => { throw new Error('boom'); });
    const res = await withAuthorizedRequest(h, { teacher: true, resource: 'submission' })(post(JSON.stringify({ submissionId: 'sub1' }), bearer, '/api/grade'));
    expect(res.status).toBe(500);
    expect(deleted).toEqual(['grading_locks/sub1']);
  });
  test('handlers receive caller, profile, organizationId and parsed body in context', async () => {
    const h = ok();
    await withAuthorizedRequest(h)(json({ a: 1 }));
    expect(h.mock.calls[0][1]).toEqual(expect.objectContaining({
      caller: expect.objectContaining({ uid: 't1' }),
      profile: { role: 'teacher', organizationId: 'org1' },
      organizationId: 'org1',
      body: { a: 1 },
    }));
  });
  test('an explicit feature option is the billing type; without it the default is navigation', async () => {
    const types: Array<string | undefined> = [];
    const h = jest.fn(async () => { types.push(billingContext.getStore()?.type); return NextResponse.json({ ok: true }); });
    await withAuthorizedRequest(h, { feature: 'ai-generate' })(post('{}', bearer, '/api/ai/generate'));
    await withAuthorizedRequest(h)(post('{}', bearer, '/api/ai/generate'));
    expect(types).toEqual(['ai-generate', 'navigation']);
  });
  test('path no longer decides the feature: tutor and notebook paths need an explicit option', async () => {
    const types: Array<string | undefined> = [];
    const h = jest.fn(async () => { types.push(billingContext.getStore()?.type); return NextResponse.json({ ok: true }); });
    await withAuthorizedRequest(h, { feature: 'tutor' })(post('{}', bearer, '/api/student/tutor'));
    await withAuthorizedRequest(h, { feature: 'notebook' })(post('{}', bearer, '/api/notebook/chat'));
    await withAuthorizedRequest(h)(post('{}', bearer, '/api/student/tutor'));
    expect(types).toEqual(['tutor', 'notebook', 'navigation']);
  });
});
