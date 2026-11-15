/**
 * Behavior tests for eight API route handlers, run through the real withAuthorizedRequest wrapper (token check,
 * rate limit, teacher/identity gates) against an in-memory Firestore. Only Firebase, the limiter, usage metering,
 * storage and the AI clients are mocked.
 */
import { NextRequest } from 'next/server';

type Doc = Record<string, unknown>;
interface Write { op: string; path: string; data?: Doc; opts?: unknown }
interface Filter { f: string; op: string; v: unknown }
interface Query { col: string; filters: Filter[]; where: (f: string, op: string, v: unknown) => Query; limit: () => Query; orderBy: () => Query; get: () => Promise<ReturnType<FakeDb['run']>> }

class FakeDb {
  docs = new Map<string, Doc>();
  writes: Write[] = [];
  batches = 0;
  failIn = false;
  failTx: Error | null = null;
  private n = 0;

  seed(path: string, data: Doc) { this.docs.set(path, data); }

  snap(path: string) {
    const data = this.docs.get(path);
    const [col, id] = path.split('/');
    return { id, exists: data !== undefined, data: () => data, ref: this.ref(col, id) };
  }

  ref(col: string, id: string) {
    const path = `${col}/${id}`;
    return {
      id, path,
      get: async () => this.snap(path),
      set: async (data: Doc, opts?: unknown) => this.apply({ op: 'set', path, data, opts }),
      update: async (data: Doc) => this.apply({ op: 'update', path, data }),
      delete: async () => this.apply({ op: 'delete', path }),
    };
  }

  apply(w: Write) {
    const existing = this.docs.get(w.path);
    if (w.op === 'create' && existing) throw new Error(`already exists: ${w.path}`);
    if (w.op === 'update' && !existing) throw new Error(`missing: ${w.path}`);
    if (w.op === 'delete') this.docs.delete(w.path);
    else if (w.op === 'set' && !(w.opts as { merge?: boolean } | undefined)?.merge) this.docs.set(w.path, w.data!);
    else this.docs.set(w.path, { ...existing, ...w.data });
    this.writes.push(w);
  }

  query(col: string, filters: Filter[]): Query {
    const q: Query = {
      col, filters,
      where: (f, op, v) => this.query(col, [...filters, { f, op, v }]),
      limit: () => q,
      orderBy: () => q,
      get: async () => this.run(q),
    };
    return q;
  }

  run(q: { col: string; filters: Filter[] }) {
    if (this.failIn && q.filters.some(x => x.op === 'in')) throw new Error('index missing');
    const docs = [...this.docs.entries()]
      .filter(([path, d]) => path.startsWith(`${q.col}/`) && !path.slice(q.col.length + 1).includes('/')
        && q.filters.every(x => x.op === 'in' ? (x.v as unknown[]).includes(d[x.f]) : d[x.f] === x.v))
      .map(([path]) => this.snap(path));
    return { docs, size: docs.length, empty: docs.length === 0 };
  }

  collection = (col: string) => ({
    doc: (id: string = `auto-${++this.n}`) => this.ref(col, id),
    where: (f: string, op: string, v: unknown) => this.query(col, [{ f, op, v }]),
  });

  runTransaction = async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
    if (this.failTx) throw this.failTx;
    const pending: Write[] = [];
    const tx = {
      get: async (x: { path?: string; col?: string; filters?: Filter[] }) =>
        x.path ? this.snap(x.path) : this.run(x as { col: string; filters: Filter[] }),
      set: (r: { path: string }, data: Doc, opts?: unknown) => { pending.push({ op: 'set', path: r.path, data, opts }); },
      update: (r: { path: string }, data: Doc) => { pending.push({ op: 'update', path: r.path, data }); },
      create: (r: { path: string }, data: Doc) => { pending.push({ op: 'create', path: r.path, data }); },
      delete: (r: { path: string }) => { pending.push({ op: 'delete', path: r.path }); },
    };
    const result = await fn(tx);
    pending.forEach(w => this.apply(w));
    return result;
  };

  batch = () => {
    const pending: Write[] = [];
    return {
      set: (r: { path: string }, data: Doc, opts?: unknown) => { pending.push({ op: 'set', path: r.path, data, opts }); },
      delete: (r: { path: string }) => { pending.push({ op: 'delete', path: r.path }); },
      commit: async () => { this.batches++; pending.forEach(w => this.apply(w)); },
    };
  };
}

let mockDb: FakeDb;
const mockVerifyIdToken = jest.fn();
const mockEnforce = jest.fn();
const mockDelete = jest.fn();
const mockFile = jest.fn<{ delete: typeof mockDelete }, [string]>(() => ({ delete: mockDelete }));
const mockBucket = jest.fn<{ file: typeof mockFile }, [string | undefined]>(() => ({ file: mockFile }));
const mockCheckBudget = jest.fn();
const mockRecordUsage = jest.fn();
const mockPortfolio = jest.fn();
const mockLimitsHelp = jest.fn();
const mockParse = jest.fn();

jest.mock('../src/lib/firebase-admin', () => ({
  get adminDb() { return mockDb; },
  adminAuth: { verifyIdToken: (...a: unknown[]) => mockVerifyIdToken(...a), verifySessionCookie: jest.fn() },
  adminFieldWithValue: { serverTimestamp: () => 'SERVER_TS' },
}));
jest.mock('../src/lib/rate-limit', () => ({ enforceRateLimit: (...a: unknown[]) => mockEnforce(...a) }));
jest.mock('../src/lib/usage-limit', () => ({
  checkBudget: (...a: unknown[]) => mockCheckBudget(...a),
  recordUsage: (...a: unknown[]) => mockRecordUsage(...a),
}));
jest.mock('../src/lib/ai/network', () => ({
  generateStudentPortfolio: (...a: unknown[]) => mockPortfolio(...a),
  getNetworkLimitsHelp: (...a: unknown[]) => mockLimitsHelp(...a),
}));
jest.mock('../src/lib/ai/assignment', () => ({ parseQuestionsFromText: (...a: unknown[]) => mockParse(...a) }));
jest.mock('firebase-admin/storage', () => ({ getStorage: () => ({ bucket: (n?: string) => mockBucket(n) }) }));

import { NextResponse } from 'next/server';
import { POST as membership } from '../src/app/api/teacher/network/membership/route';
import { POST as portfolio } from '../src/app/api/teacher/network/portfolio/route';
import { POST as register } from '../src/app/api/auth/register/route';
import { POST as chatLimits } from '../src/app/api/chat/limits/route';
import { POST as cleanup } from '../src/app/api/teacher/students/cleanup/route';
import { POST as courses } from '../src/app/api/courses/route';
import { POST as enrollment } from '../src/app/api/student/enrollment/route';
import { POST as aiParse } from '../src/app/api/ai/parse/route';

const req = (body: unknown, authed = true) => new NextRequest('https://scorpio.test/api/x', {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(authed ? { Authorization: 'Bearer good' } : {}) },
  body: JSON.stringify(body),
});
const json = async (res: Response) => res.json();
const future = () => ({ toDate: () => new Date(Date.now() + 86_400_000) });
const past = () => ({ toDate: () => new Date(Date.now() - 86_400_000) });
const writesTo = (path: string) => mockDb.writes.filter(w => w.path === path);

beforeEach(() => {
  mockDb = new FakeDb();
  mockVerifyIdToken.mockReset().mockResolvedValue({ uid: 't1', email: 't1@school.test' });
  mockEnforce.mockReset().mockResolvedValue(null);
  mockDelete.mockReset().mockResolvedValue(undefined);
  mockFile.mockClear();
  mockBucket.mockClear();
  mockCheckBudget.mockReset().mockResolvedValue({ allowed: true });
  mockRecordUsage.mockReset().mockResolvedValue(undefined);
  mockPortfolio.mockReset();
  mockLimitsHelp.mockReset();
  mockParse.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

const limited = () => NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '30' } });

/** Shared gate behaviour for routes wrapped by withAuthorizedRequest. */
function gateTests(name: string, route: (r: NextRequest) => Promise<Response>, body: Doc, kind: string, teacherOnly: boolean, uid = 't1') {
  describe(`${name} gate`, () => {
    test('401 without credentials, and nothing is read or written', async () => {
      mockVerifyIdToken.mockRejectedValue(new Error('bad'));
      const res = await route(req(body, false));
      expect(res.status).toBe(401);
      expect(await json(res)).toEqual({ error: 'Authentication required' });
      expect(mockDb.writes).toEqual([]);
    });

    test('429 with Retry-After when the limiter rejects, charged to the caller uid', async () => {
      mockEnforce.mockResolvedValue(limited());
      const res = await route(req(body));
      expect(res.status).toBe(429);
      expect(res.headers.get('Retry-After')).toBe('30');
      expect(mockEnforce).toHaveBeenCalledWith(expect.anything(), kind, uid);
      expect(mockDb.writes).toEqual([]);
    });

    test('403 when the caller has no profile', async () => {
      mockDb.docs.delete('users/t1');
      mockDb.docs.delete('users/s1');
      const res = await route(req(body));
      expect(res.status).toBe(403);
      expect(await json(res)).toEqual({ error: 'Access denied' });
    });

    if (teacherOnly) {
      test('403 when the caller is a student', async () => {
        mockDb.seed('users/t1', { role: 'student' });
        const res = await route(req(body));
        expect(res.status).toBe(403);
        expect(await json(res)).toEqual({ error: 'Access denied' });
        expect(mockDb.writes).toEqual([]);
      });
    }
  });
}

// ---------------------------------------------------------------------------------------------------------------
describe('POST /api/teacher/network/membership', () => {
  gateTests('membership', membership, { action: 'create', name: 'N' }, 'write', true);
  const call = (b: Doc) => membership(req(b));

  describe('create', () => {
    beforeEach(() => mockDb.seed('users/t1', { role: 'teacher' }));

    test('creates a free, zero-budget network owned by the caller and links the profile', async () => {
      const res = await call({ action: 'create', name: '  Riverside  ' });
      expect(res.status).toBe(200);
      expect(await json(res)).toEqual({ success: true });
      expect(writesTo('organizations/auto-1')).toEqual([expect.objectContaining({
        op: 'set',
        data: expect.objectContaining({
          id: 'auto-1', name: 'Riverside', ownerId: 't1', ownerEmail: 't1@school.test',
          planId: 'free', subscriptionStatus: 'none', aiBudgetLimit: 0, createdAt: expect.any(Date),
        }),
      })]);
      expect(writesTo('users/t1')).toEqual([{ op: 'update', path: 'users/t1', data: { organizationId: 'auto-1' } }]);
    });

    test('truncates the network name to 120 characters', async () => {
      await call({ action: 'create', name: 'x'.repeat(200) });
      expect((writesTo('organizations/auto-1')[0].data as { name: string }).name).toHaveLength(120);
    });

    test.each([[''], ['   '], [undefined]])('rejects a name of %p with 400 and no writes', async name => {
      const res = await call({ action: 'create', name });
      expect(res.status).toBe(400);
      expect(await json(res)).toEqual({ error: 'Leave your current network first' });
      expect(mockDb.writes).toEqual([]);
    });

    test.each([['name', 42], ['code', 7], ['memberId', 5]])('a non-string %s is a schema 400 with no writes', async (field, value) => {
      const res = await call({ action: 'create', [field]: value });
      expect(res.status).toBe(400);
      expect(await json(res)).toEqual(expect.objectContaining({ error: 'Invalid request body', fields: [expect.objectContaining({ path: field })] }));
      expect(mockDb.writes).toEqual([]);
    });

    test('rejects a teacher who already belongs to a network', async () => {
      mockDb.seed('users/t1', { role: 'teacher', organizationId: 'org1' });
      mockDb.seed('organizations/org1', { ownerId: 'other' });
      const res = await call({ action: 'create', name: 'Second' });
      expect(res.status).toBe(400);
      expect(mockDb.writes).toEqual([]);
    });
  });

  describe('join', () => {
    beforeEach(() => {
      mockDb.seed('users/t1', { role: 'teacher' });
      mockDb.seed('organizations/org1', { ownerId: 'o1' });
      mockDb.seed('teacherInviteCodes/ABC123', { organizationId: 'org1', isUsed: false, expiresAt: future() });
    });

    test('a valid invite (case-insensitive) joins the network and is consumed', async () => {
      const res = await call({ action: 'join', code: ' abc123 ' });
      expect(res.status).toBe(200);
      expect(writesTo('users/t1')).toEqual([{ op: 'update', path: 'users/t1', data: { organizationId: 'org1' } }]);
      expect(writesTo('teacherInviteCodes/ABC123')).toEqual([expect.objectContaining({
        op: 'update', data: { isUsed: true, usedBy: 't1', usedAt: expect.any(Date) },
      })]);
    });

    test('a teacher already in a network must leave first', async () => {
      mockDb.seed('users/t1', { role: 'teacher', organizationId: 'org9' });
      mockDb.seed('organizations/org9', {});
      const res = await call({ action: 'join', code: 'ABC123' });
      expect(res.status).toBe(400);
      expect(await json(res)).toEqual({ error: 'Leave your current network first' });
    });

    test.each([[undefined], [''], ['  '], ['A/B']])('rejects code %p', async code => {
      const res = await call({ action: 'join', code });
      expect(res.status).toBe(400);
      expect(await json(res)).toEqual({ error: 'A network-linked teacher invite code is required' });
    });

    test.each([
      ['unknown', 'NOPE99'],
      ['used', 'USED11'],
      ['expired', 'OLD111'],
      ['without expiry', 'NOEXP1'],
      ['not linked to a network', 'NOORG1'],
    ])('rejects an invite that is %s', async (_label, code) => {
      mockDb.seed('teacherInviteCodes/USED11', { organizationId: 'org1', isUsed: true, expiresAt: future() });
      mockDb.seed('teacherInviteCodes/OLD111', { organizationId: 'org1', isUsed: false, expiresAt: past() });
      mockDb.seed('teacherInviteCodes/NOEXP1', { organizationId: 'org1', isUsed: false });
      mockDb.seed('teacherInviteCodes/NOORG1', { isUsed: false, expiresAt: future() });
      const res = await call({ action: 'join', code });
      expect(res.status).toBe(400);
      expect(await json(res)).toEqual({ error: 'Invalid network invite' });
      expect(mockDb.writes).toEqual([]);
    });

    test('rejects an invite whose network no longer exists', async () => {
      mockDb.docs.delete('organizations/org1');
      const res = await call({ action: 'join', code: 'ABC123' });
      expect(await json(res)).toEqual({ error: 'Network not found' });
      expect(res.status).toBe(400);
    });

    test('rejects joining a network that already has 50 teachers', async () => {
      for (let i = 0; i < 50; i++) mockDb.seed(`users/m${i}`, { role: 'teacher', organizationId: 'org1' });
      const res = await call({ action: 'join', code: 'ABC123' });
      expect(res.status).toBe(400);
      expect(await json(res)).toEqual({ error: 'Network teacher capacity reached' });
      expect(mockDb.writes).toEqual([]);
    });
  });

  describe('leave and remove', () => {
    beforeEach(() => {
      mockDb.seed('users/t1', { role: 'teacher', organizationId: 'org1' });
      mockDb.seed('users/o1', { role: 'teacher', organizationId: 'org1' });
      mockDb.seed('organizations/org1', { ownerId: 'o1', planId: 'free' });
    });

    test('a member leaves: only their organizationId is cleared', async () => {
      const res = await call({ action: 'leave' });
      expect(res.status).toBe(200);
      expect(mockDb.writes).toEqual([{ op: 'update', path: 'users/t1', data: { organizationId: null } }]);
    });

    test('a member cannot leave while students are still enrolled with them', async () => {
      mockDb.seed('users/s1', { role: 'student', teacherId: 't1' });
      const res = await call({ action: 'leave' });
      expect(res.status).toBe(400);
      expect(await json(res)).toEqual({ error: 'Reassign or remove enrolled students before leaving the network' });
      expect(mockDb.writes).toEqual([]);
    });

    test('the owner cannot leave while other members remain', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'o1' });
      const res = await call({ action: 'leave' });
      expect(await json(res)).toEqual({ error: 'Transfer network ownership before leaving' });
      expect(res.status).toBe(400);
    });

    describe('sole owner', () => {
      beforeEach(() => {
        mockDb.docs.delete('users/t1');
        mockVerifyIdToken.mockResolvedValue({ uid: 'o1' });
      });

      test('on the free plan disbands the network: profile cleared and organization deleted', async () => {
        const res = await call({ action: 'leave' });
        expect(res.status).toBe(200);
        expect(mockDb.writes).toEqual([
          { op: 'update', path: 'users/o1', data: { organizationId: null } },
          { op: 'delete', path: 'organizations/org1' },
        ]);
      });

      test('with an active paid subscription must cancel first', async () => {
        mockDb.seed('organizations/org1', { ownerId: 'o1', planId: 'pro', subscriptionStatus: 'active' });
        const res = await call({ action: 'leave' });
        expect(res.status).toBe(400);
        expect(await json(res)).toEqual({ error: 'Cancel the network subscription before disbanding' });
        expect(mockDb.writes).toEqual([]);
      });

      test('with a canceled paid subscription may disband', async () => {
        mockDb.seed('organizations/org1', { ownerId: 'o1', planId: 'pro', subscriptionStatus: 'canceled' });
        const res = await call({ action: 'leave' });
        expect(res.status).toBe(200);
        expect(writesTo('organizations/org1')).toEqual([{ op: 'delete', path: 'organizations/org1' }]);
      });
    });

    test('the owner removes a member', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'o1' });
      const res = await call({ action: 'remove', memberId: 't1' });
      expect(res.status).toBe(200);
      expect(mockDb.writes).toEqual([{ op: 'update', path: 'users/t1', data: { organizationId: null } }]);
    });

    test('a non-owner cannot remove anyone', async () => {
      mockDb.seed('users/t2', { role: 'teacher', organizationId: 'org1' });
      const res = await call({ action: 'remove', memberId: 't2' });
      expect(res.status).toBe(400);
      expect(await json(res)).toEqual({ error: 'Only the owner can remove members' });
      expect(mockDb.writes).toEqual([]);
    });

    test.each([[undefined], ['a/b']])('remove rejects memberId %p', async memberId => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'o1' });
      const res = await call({ action: 'remove', memberId });
      expect(res.status).toBe(400);
      expect(await json(res)).toEqual({ error: 'Invalid member' });
    });

    test('remove rejects a user who belongs to a different network', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'o1' });
      mockDb.seed('users/x1', { role: 'teacher', organizationId: 'org2' });
      const res = await call({ action: 'remove', memberId: 'x1' });
      expect(await json(res)).toEqual({ error: 'Invalid member' });
      expect(mockDb.writes).toEqual([]);
    });

    test('leave with no network is rejected', async () => {
      mockDb.seed('users/t1', { role: 'teacher' });
      const res = await call({ action: 'leave' });
      expect(res.status).toBe(400);
      expect(await json(res)).toEqual({ error: 'Invalid member' });
    });
  });

  test('an unknown action is rejected', async () => {
    mockDb.seed('users/t1', { role: 'teacher' });
    const res = await call({ action: 'explode' });
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ error: 'Unknown action' });
  });

  test('an unexpected Firestore failure is a generic 500 with a request id and no detail', async () => {
    mockDb.seed('users/t1', { role: 'teacher' });
    mockDb.failTx = new Error('secret internal detail');
    const res = await call({ action: 'create', name: 'X' });
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body).toEqual({ error: 'Internal server error', requestId: expect.any(String) });
    expect(JSON.stringify(body)).not.toContain('secret');
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('POST /api/teacher/network/portfolio', () => {
  const body = { teacherId: 't1', studentId: 's1', organizationId: 'org1' };
  gateTests('portfolio', portfolio, body, 'portfolio', true);

  const result = {
    portfolio: { strengths: ['algebra'], weaknesses: ['proofs'], masteryLevel: 'Intermediate', aiSummary: 'Doing well' },
    usage: { inputTokens: 100, outputTokens: 40 },
  };
  beforeEach(() => {
    mockDb.seed('users/t1', { role: 'teacher', organizationId: 'org1' });
    mockDb.seed('users/s1', { role: 'student', teacherId: 't1', displayName: 'Sam Lee' });
    mockPortfolio.mockResolvedValue(result);
  });

  test('generates, records usage against the teacher and merges the portfolio document', async () => {
    mockDb.seed('tutor_sessions/b', { studentId: 's1', messages: [{ role: 'user', content: 'newer' }] });
    mockDb.seed('tutor_sessions/a', { studentId: 's1', messages: [{ role: 'user', content: 'older' }, { role: 'assistant', content: 'reply' }] });
    mockDb.seed('tutor_sessions/other', { studentId: 'zz', messages: [{ role: 'user', content: 'not mine' }] });

    const res = await portfolio(req(body));
    expect(res.status).toBe(200);
    const out = await json(res);
    expect(out.success).toBe(true);
    expect(out.portfolio).toEqual({
      studentId: 's1', organizationId: 'org1', teacherId: 't1', lastUpdated: expect.any(String),
      strengths: ['algebra'], weaknesses: ['proofs'], masteryLevel: 'Intermediate', aiSummary: 'Doing well',
    });
    expect(mockCheckBudget).toHaveBeenCalledWith('org1', 'portfolio');
    expect(mockPortfolio).toHaveBeenCalledWith('Sam Lee', [
      { role: 'user', content: 'older' }, { role: 'assistant', content: 'reply' }, { role: 'user', content: 'newer' },
    ]);
    expect(mockRecordUsage).toHaveBeenCalledWith('org1', 'portfolio', 100, 40, 't1');
    expect(writesTo('portfolios/s1')).toEqual([{
      op: 'set', path: 'portfolios/s1', opts: { merge: true },
      data: {
        studentId: 's1', organizationId: 'org1', teacherId: 't1', lastUpdated: 'SERVER_TS',
        strengths: ['algebra'], weaknesses: ['proofs'], masteryLevel: 'Intermediate', aiSummary: 'Doing well',
      },
    }]);
  });

  test('keeps only the most recent 50 messages', async () => {
    const messages = Array.from({ length: 60 }, (_, i) => ({ role: 'user', content: `m${i}` }));
    mockDb.seed('tutor_sessions/a', { studentId: 's1', messages });
    await portfolio(req(body));
    const sent = mockPortfolio.mock.calls[0][1] as { content: string }[];
    expect(sent).toHaveLength(50);
    expect(sent[0].content).toBe('m10');
    expect(sent[49].content).toBe('m59');
  });

  test('a session without messages contributes nothing', async () => {
    mockDb.seed('tutor_sessions/a', { studentId: 's1' });
    await portfolio(req(body));
    expect(mockPortfolio).toHaveBeenCalledWith('Sam Lee', []);
  });

  test.each([
    [{ name: 'Sam Name' }, 'Sam Name'],
    [{}, 'Unknown Student'],
  ])('student name falls back for profile %j', async (extra, expected) => {
    mockDb.seed('users/s1', { role: 'student', teacherId: 't1', ...extra });
    await portfolio(req(body));
    expect(mockPortfolio.mock.calls[0][0]).toBe(expected);
  });

  test('skips usage recording when the model reports none', async () => {
    mockPortfolio.mockResolvedValue({ portfolio: result.portfolio });
    const res = await portfolio(req(body));
    expect(res.status).toBe(200);
    expect(mockRecordUsage).not.toHaveBeenCalled();
    expect(writesTo('portfolios/s1')).toHaveLength(1);
  });

  test('403 with the budget message, before any generation or write', async () => {
    mockCheckBudget.mockResolvedValue({ allowed: false, error: 'AI budget exhausted' });
    const res = await portfolio(req(body));
    expect(res.status).toBe(403);
    expect(await json(res)).toEqual({ error: 'AI budget exhausted' });
    expect(mockPortfolio).not.toHaveBeenCalled();
    expect(mockDb.writes).toEqual([]);
  });

  test('404 when the target user is not a student', async () => {
    mockDb.seed('users/s1', { role: 'teacher', teacherId: 't1' });
    const res = await portfolio(req(body));
    expect(res.status).toBe(404);
    expect(await json(res)).toEqual({ error: 'Student not found' });
    expect(mockPortfolio).not.toHaveBeenCalled();
  });

  test('403 when the student belongs to another teacher in another network', async () => {
    mockDb.seed('users/s1', { role: 'student', teacherId: 't9' });
    mockDb.seed('users/t9', { role: 'teacher', organizationId: 'org2' });
    const res = await portfolio(req(body));
    expect(res.status).toBe(403);
    expect(mockPortfolio).not.toHaveBeenCalled();
  });

  test('403 when the body names a different network than the caller belongs to', async () => {
    const res = await portfolio(req({ ...body, organizationId: 'org2' }));
    expect(res.status).toBe(403);
    expect(mockCheckBudget).not.toHaveBeenCalled();
  });

  test('403 when the body teacherId is not the caller', async () => {
    const res = await portfolio(req({ ...body, teacherId: 'someone-else' }));
    expect(res.status).toBe(403);
    expect(await json(res)).toEqual({ error: 'Account mismatch' });
  });

  test('a model failure is a generic 500 and nothing is saved', async () => {
    mockPortfolio.mockRejectedValue(new Error('gemini exploded'));
    const res = await portfolio(req(body));
    expect(res.status).toBe(500);
    expect(await json(res)).toEqual({ error: 'Internal server error', requestId: expect.any(String) });
    expect(mockDb.writes).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('POST /api/auth/register', () => {
  beforeEach(() => {
    mockVerifyIdToken.mockResolvedValue({ uid: 'u1', email: 'u1@school.test' });
    mockDb.seed('courses/c1', { code: 'PHYS101', name: 'Physics', teacherId: 't1' });
    mockDb.seed('users/t1', { role: 'teacher', organizationId: 'org1' });
  });
  const call = (b: Doc) => register(req(b));

  test('401 without credentials', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('bad'));
    const res = await register(req({ role: 'student', name: 'A' }, false));
    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({ error: 'Authentication required' });
  });

  test('429 from the limiter is returned as is and nothing is written', async () => {
    mockEnforce.mockResolvedValue(limited());
    const res = await call({ role: 'student', name: 'A' });
    expect(res.status).toBe(429);
    expect(mockEnforce).toHaveBeenCalledWith(expect.anything(), 'register', 'u1');
    expect(writesTo('users/u1')).toEqual([]);
  });

  test.each([
    ['unknown role', { role: 'admin', name: 'A' }],
    ['missing name', { role: 'student' }],
    ['blank name', { role: 'student', name: '   ' }],
    ['overlong name', { role: 'student', name: 'x'.repeat(121) }],
  ])('400 for %s', async (_label, b) => {
    const res = await call(b);
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual(expect.objectContaining({ error: 'Invalid profile' }));
    expect(mockDb.writes).toEqual([]);
  });

  test.each([['a/b'], ['x'.repeat(129)]])('400 for code %p', async code => {
    const res = await call({ role: 'student', name: 'A', code });
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ error: 'Invalid code' });
  });

  test('400 when a profile already exists, without overwriting it', async () => {
    mockDb.seed('users/u1', { role: 'student', displayName: 'Old' });
    const res = await call({ role: 'student', name: 'New' });
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ error: 'Profile already exists; sign in instead' });
    expect(mockDb.docs.get('users/u1')).toEqual({ role: 'student', displayName: 'Old' });
  });

  describe('students', () => {
    test('with a valid class code join the class, teacher and network', async () => {
      const res = await call({ role: 'student', name: '  Sam  ', code: ' phys101 ' });
      expect(res.status).toBe(200);
      expect(await json(res)).toEqual({ success: true });
      const profile = {
        uid: 'u1', email: 'u1@school.test', displayName: 'Sam', role: 'student',
        organizationId: 'org1', teacherId: 't1', courseId: 'c1',
        createdAt: expect.any(Date), lastLoginAt: expect.any(Date),
      };
      expect(mockDb.docs.get('users/u1')).toEqual(profile);
      expect(mockDb.docs.get('students/u1')).toEqual({ ...profile, name: 'Sam' });
    });

    test('without a code get an unattached profile', async () => {
      const res = await call({ role: 'student', name: 'Sam' });
      expect(res.status).toBe(200);
      expect(mockDb.docs.get('users/u1')).toEqual(expect.objectContaining({ organizationId: null, teacherId: null, courseId: null }));
    });

    test('an unknown class code is rejected and no profile is created', async () => {
      const res = await call({ role: 'student', name: 'Sam', code: 'NOSUCH' });
      expect(res.status).toBe(400);
      expect(await json(res)).toEqual({ error: 'A valid class code is required' });
      expect(mockDb.writes).toEqual([]);
    });
  });

  describe('teachers', () => {
    test('need an invite code', async () => {
      const res = await call({ role: 'teacher', name: 'Tia' });
      expect(res.status).toBe(400);
      expect(await json(res)).toEqual({ error: 'A teacher invite code is required' });
    });

    test('a standalone invite creates a personal network owned by the new teacher and consumes the invite', async () => {
      mockDb.seed('teacherInviteCodes/INV1', { isUsed: false, expiresAt: future() });
      const res = await call({ role: 'teacher', name: 'Tia', code: 'inv1' });
      expect(res.status).toBe(200);
      expect(mockDb.docs.get('organizations/auto-1')).toEqual(expect.objectContaining({
        id: 'auto-1', name: "Tia's Network", ownerId: 'u1', ownerEmail: 'u1@school.test',
        planId: 'free', subscriptionStatus: 'active', aiBudgetLimit: 50,
      }));
      expect(mockDb.docs.get('users/u1')).toEqual(expect.objectContaining({ role: 'teacher', organizationId: 'auto-1' }));
      expect(mockDb.docs.get('teachers/u1')).toEqual(expect.objectContaining({ name: 'Tia', displayName: 'Tia' }));
      expect(mockDb.docs.get('teacherInviteCodes/INV1')).toEqual(expect.objectContaining({
        isUsed: true, usedBy: 'u1', usedByEmail: 'u1@school.test',
      }));
    });

    test('a network-linked invite joins that network without creating a new one', async () => {
      mockDb.seed('organizations/org1', { ownerId: 'o1' });
      mockDb.seed('teacherInviteCodes/INV2', { organizationId: 'org1', isUsed: false, expiresAt: future() });
      const res = await call({ role: 'teacher', name: 'Tia', code: 'INV2' });
      expect(res.status).toBe(200);
      expect(mockDb.docs.get('users/u1')).toEqual(expect.objectContaining({ organizationId: 'org1' }));
      expect([...mockDb.docs.keys()].filter(k => k.startsWith('organizations/'))).toEqual(['organizations/org1']);
    });

    test.each([
      ['unknown', undefined],
      ['used', { isUsed: true, expiresAt: future() }],
      ['expired', { isUsed: false, expiresAt: past() }],
      ['without expiry', { isUsed: false }],
    ])('rejects an invite that is %s', async (_label, invite) => {
      if (invite) mockDb.seed('teacherInviteCodes/BAD1', invite);
      const res = await call({ role: 'teacher', name: 'Tia', code: 'BAD1' });
      expect(res.status).toBe(400);
      expect(await json(res)).toEqual({ error: 'Invalid or expired invite code' });
      expect(mockDb.writes).toEqual([]);
    });

    test('rejects an invite for a network that no longer exists', async () => {
      mockDb.seed('teacherInviteCodes/GONE', { organizationId: 'ghost', isUsed: false, expiresAt: future() });
      const res = await call({ role: 'teacher', name: 'Tia', code: 'GONE' });
      expect(await json(res)).toEqual({ error: 'Network no longer exists' });
      expect(mockDb.writes).toEqual([]);
    });

    test('rejects joining a full network', async () => {
      mockDb.seed('organizations/org1', {});
      mockDb.seed('teacherInviteCodes/FULL', { organizationId: 'org1', isUsed: false, expiresAt: future() });
      for (let i = 0; i < 50; i++) mockDb.seed(`users/m${i}`, { role: 'teacher', organizationId: 'org1' });
      const res = await call({ role: 'teacher', name: 'Tia', code: 'FULL' });
      expect(await json(res)).toEqual({ error: 'Network teacher capacity reached' });
      expect(res.status).toBe(400);
    });
  });

  test('an unexpected failure is a generic 500', async () => {
    mockDb.failTx = new Error('db down');
    const res = await call({ role: 'student', name: 'Sam' });
    expect(res.status).toBe(500);
    expect(await json(res)).toEqual({ error: 'Internal server error', requestId: expect.any(String) });
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('POST /api/chat/limits', () => {
  const body = { userId: 't1', message: 'How many students?' };
  gateTests('chat limits', chatLimits, body, 'limitsChat', true);

  const org = { name: 'Riverside', planId: 'pro', aiBudgetLimit: 500, aiUsageCurrent: 120, notebookLimitPerStudent: 5, aiNotebookLimitPerStudent: 3, aiTutorLimitPerStudent: 2 };
  beforeEach(() => {
    mockDb.seed('users/t1', { role: 'teacher', organizationId: 'org1' });
    mockDb.seed('users/t2', { role: 'teacher', organizationId: 'org1' });
    mockDb.seed('users/s1', { role: 'student', teacherId: 't1' });
    mockDb.seed('users/s2', { role: 'student', teacherId: 't2' });
    mockDb.seed('users/s3', { role: 'student', teacherId: 'unrelated' });
    mockDb.seed('organizations/org1', org);
    mockLimitsHelp.mockResolvedValue({ text: 'You have 2 students', usage: { inputTokens: 12, outputTokens: 7 } });
  });

  test('answers using network context, counts the network students and records usage', async () => {
    const res = await chatLimits(req({ ...body, chatHistory: [{ role: 'user', content: 'hi' }] }));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ text: 'You have 2 students' });
    expect(mockCheckBudget).toHaveBeenCalledWith('org1', 'navigation');
    expect(mockLimitsHelp).toHaveBeenCalledWith('How many students?', [{ role: 'user', content: 'hi' }], {
      orgName: 'Riverside', planId: 'pro', aiBudgetLimit: 500, aiUsageCurrent: 120,
      notebookLimitPerStudent: 5, aiNotebookLimitPerStudent: 3, aiTutorLimitPerStudent: 2, studentCount: 2,
    });
    expect(mockRecordUsage).toHaveBeenCalledWith('org1', 'navigation', 12, 7);
  });

  test('fills defaults for a sparse organization and a missing chat history', async () => {
    mockDb.seed('organizations/org1', {});
    await chatLimits(req(body));
    expect(mockLimitsHelp).toHaveBeenCalledWith('How many students?', [], {
      orgName: 'Your Network', planId: 'free', aiBudgetLimit: 0, aiUsageCurrent: 0,
      notebookLimitPerStudent: 0, aiNotebookLimitPerStudent: 0, aiTutorLimitPerStudent: 0, studentCount: 2,
    });
  });

  test('does not record usage when none is reported', async () => {
    mockLimitsHelp.mockResolvedValue({ text: 'ok' });
    const res = await chatLimits(req(body));
    expect(await json(res)).toEqual({ text: 'ok' });
    expect(mockRecordUsage).not.toHaveBeenCalled();
  });

  test('a failing student count is logged and reported as zero, not an error', async () => {
    mockDb.failIn = true;
    const res = await chatLimits(req(body));
    expect(res.status).toBe(200);
    expect(mockLimitsHelp.mock.calls[0][2]).toEqual(expect.objectContaining({ studentCount: 0 }));
    expect(console.error).toHaveBeenCalledWith('Student count error:', expect.any(Error));
  });

  test('400 when the message is missing', async () => {
    const res = await chatLimits(req({ userId: 't1' }));
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual(expect.objectContaining({ error: 'Missing required fields' }));
    expect(mockLimitsHelp).not.toHaveBeenCalled();
  });

  test('403 when the body userId is not the caller', async () => {
    const res = await chatLimits(req({ ...body, userId: 't2' }));
    expect(res.status).toBe(403);
    expect(await json(res)).toEqual({ error: 'Account mismatch' });
  });

  test('403 when the caller has no network', async () => {
    mockDb.seed('users/t1', { role: 'teacher' });
    const res = await chatLimits(req(body));
    expect(res.status).toBe(403);
    expect(await json(res)).toEqual({ error: 'No network associated with this account' });
  });

  test('403 with the budget message when the budget is exhausted', async () => {
    mockCheckBudget.mockResolvedValue({ allowed: false, error: 'Budget used up' });
    const res = await chatLimits(req(body));
    expect(res.status).toBe(403);
    expect(await json(res)).toEqual({ error: 'Budget used up' });
    expect(mockLimitsHelp).not.toHaveBeenCalled();
  });

  test('404 when the organization document is missing', async () => {
    mockDb.docs.delete('organizations/org1');
    const res = await chatLimits(req(body));
    expect(res.status).toBe(404);
    expect(await json(res)).toEqual({ error: 'Organization not found' });
  });

  test('a model failure is a generic 500 and no usage is recorded', async () => {
    mockLimitsHelp.mockRejectedValue(new Error('upstream'));
    const res = await chatLimits(req(body));
    expect(res.status).toBe(500);
    expect(await json(res)).toEqual({ error: 'Internal server error', requestId: expect.any(String) });
    expect(mockRecordUsage).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('POST /api/teacher/students/cleanup', () => {
  const body = { studentId: 's1' };
  gateTests('cleanup', cleanup, body, 'write', true);

  const fileUrl = (object: string) => `https://firebasestorage.googleapis.com/v0/b/bkt/o/${encodeURIComponent(object)}?alt=media`;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = 'bkt';
    mockDb.seed('users/t1', { role: 'teacher' });
    mockDb.seed('users/s1', { role: 'student', teacherId: 't1' });
    mockDb.seed('students/s1', { teacherId: 't1' });
    mockDb.seed('assignments/a1', { teacherId: 't1', courseId: 'c1' });
    mockDb.seed('assignments/a2', { teacherId: 't1', courseId: 'c2' });
    mockDb.seed('assignments/other', { teacherId: 't9', courseId: 'c1' });
    mockDb.seed('submissions/sub1', { studentId: 's1', assignmentId: 'a1', workFiles: [
      { url: fileUrl('submissions/s1/work.pdf') },
      { url: fileUrl('submissions/another-student/steal.pdf') },
      { url: 'https://example.test/no-object-segment' },
    ] });
    mockDb.seed('submissions/sub2', { studentId: 's1', assignmentId: 'a2' });
    mockDb.seed('submissions/sub3', { studentId: 's1', assignmentId: 'other', workFiles: [{ url: fileUrl('submissions/s1/theirs.pdf') }] });
    mockDb.seed('submissions/sub4', { studentId: 'someone', assignmentId: 'a1' });
  });
  const deleted = () => mockDb.writes.filter(w => w.op === 'delete').map(w => w.path).sort();

  test.each([[undefined], [12], ['a/b']])('400 for studentId %p', async studentId => {
    const res = await cleanup(req({ studentId }));
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual(expect.objectContaining({ error: 'Invalid student' }));
  });

  test('403 for a student who is not enrolled with this teacher; nothing is deleted', async () => {
    mockDb.seed('users/s1', { role: 'student', teacherId: 't9' });
    const res = await cleanup(req(body));
    expect(res.status).toBe(403);
    expect(await json(res)).toEqual({ error: 'Access denied' });
    expect(mockDb.writes).toEqual([]);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  test('deletes only this teacher\'s submissions for the student, plus the student\'s own storage objects', async () => {
    const res = await cleanup(req(body));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ success: true });
    expect(deleted()).toEqual(['submissions/sub1', 'submissions/sub2']);
    expect(mockBucket).toHaveBeenCalledWith('bkt');
    expect(mockFile.mock.calls).toEqual([['submissions/s1/work.pdf']]);
    expect(mockDelete).toHaveBeenCalledWith({ ignoreNotFound: true });
    expect(mockDb.docs.get('users/s1')).toEqual({ role: 'student', teacherId: 't1' });
  });

  test('limits deletion to one course when courseId is given', async () => {
    const res = await cleanup(req({ ...body, courseId: 'c2' }));
    expect(res.status).toBe(200);
    expect(deleted()).toEqual(['submissions/sub2']);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  test('unlink also clears teacher, course and network on both student documents', async () => {
    await cleanup(req({ ...body, unlink: true }));
    const cleared = { teacherId: null, courseId: null, organizationId: null };
    expect(mockDb.writes.filter(w => w.op === 'set')).toEqual([
      { op: 'set', path: 'users/s1', data: cleared, opts: { merge: true } },
      { op: 'set', path: 'students/s1', data: cleared, opts: { merge: true } },
    ]);
    expect(mockDb.docs.get('users/s1')).toEqual({ role: 'student', ...cleared });
  });

  test('deletes submissions in batches of at most 400', async () => {
    for (let i = 0; i < 401; i++) mockDb.seed(`submissions/bulk${i}`, { studentId: 's1', assignmentId: 'a1' });
    await cleanup(req(body));
    expect(mockDb.batches).toBe(2);
    expect(deleted()).toHaveLength(403);
  });

  test('with nothing to delete it commits no batch', async () => {
    for (const k of ['submissions/sub1', 'submissions/sub2', 'submissions/sub3']) mockDb.docs.delete(k);
    const res = await cleanup(req(body));
    expect(res.status).toBe(200);
    expect(mockDb.batches).toBe(0);
  });

  test('a storage failure aborts with 500 before any Firestore deletion', async () => {
    mockDelete.mockRejectedValue(new Error('storage down'));
    const res = await cleanup(req(body));
    expect(res.status).toBe(500);
    expect(await json(res)).toEqual({ error: 'Internal server error', requestId: expect.any(String) });
    expect(deleted()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('POST /api/courses', () => {
  const body = { name: 'Physics', code: 'PHYS101' };
  gateTests('courses', courses, body, 'write', true);

  beforeEach(() => mockDb.seed('users/t1', { role: 'teacher', organizationId: 'org1' }));

  test('creates the class and reserves its code atomically', async () => {
    const res = await courses(req({ name: '  Physics  ', code: 'PHYS101' }));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ id: 'auto-1' });
    expect(mockDb.writes).toEqual([
      { op: 'create', path: 'course_codes/PHYS101', data: { courseId: 'auto-1' } },
      { op: 'create', path: 'courses/auto-1', data: {
        name: 'Physics', code: 'PHYS101', teacherId: 't1', organizationId: 'org1', createdAt: expect.any(String),
      } },
    ]);
  });

  test('truncates the class name to 120 characters', async () => {
    await courses(req({ name: 'n'.repeat(300), code: 'PHYS101' }));
    expect((mockDb.docs.get('courses/auto-1') as { name: string }).name).toHaveLength(120);
  });

  test.each([[''], ['   '], [5], [undefined]])('400 for name %p', async name => {
    const res = await courses(req({ name, code: 'PHYS101' }));
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual(expect.objectContaining({ error: 'Enter a class name' }));
  });

  test.each([['short'], ['has space'], ['bad/slash'], ['x'.repeat(65)], [123456], [undefined]])('400 for code %p', async code => {
    const res = await courses(req({ name: 'Physics', code }));
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual(expect.objectContaining({ error: 'Use a class code of 6–64 letters, numbers, dashes, or underscores' }));
    expect(mockDb.writes).toEqual([]);
  });

  test('400 when the teacher has not joined a network', async () => {
    mockDb.seed('users/t1', { role: 'teacher' });
    const res = await courses(req(body));
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ error: 'Join a network first' });
  });

  test('400 when the code is already reserved', async () => {
    mockDb.seed('course_codes/PHYS101', { courseId: 'old' });
    const res = await courses(req(body));
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ error: 'Class code already exists' });
    expect(mockDb.writes).toEqual([]);
  });

  test('400 when a legacy course already uses the code without a reservation', async () => {
    mockDb.seed('courses/legacy', { code: 'PHYS101' });
    const res = await courses(req(body));
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ error: 'Class code already exists' });
    expect(mockDb.writes).toEqual([]);
  });

  test('a transaction failure is a generic 500', async () => {
    mockDb.failTx = new Error('contention');
    const res = await courses(req(body));
    expect(res.status).toBe(500);
    expect(await json(res)).toEqual({ error: 'Internal server error', requestId: expect.any(String) });
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('POST /api/student/enrollment', () => {
  gateTests('enrollment', enrollment, { code: 'PHYS101' }, 'write', false, 's1');

  const cleared = { teacherId: null, courseId: null, organizationId: null };
  beforeEach(() => {
    mockVerifyIdToken.mockResolvedValue({ uid: 's1' });
    mockDb.seed('users/s1', { role: 'student' });
    mockDb.seed('students/s1', { role: 'student' });
    mockDb.seed('courses/c1', { code: 'PHYS101', name: 'Physics', teacherId: 't1' });
    mockDb.seed('users/t1', { role: 'teacher', organizationId: 'org1' });
  });

  test('joins the class and mirrors the enrollment onto users and students', async () => {
    const res = await enrollment(req({ code: 'phys101' }));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ success: true });
    const enrolled = { teacherId: 't1', courseId: 'c1', organizationId: 'org1' };
    expect(mockDb.writes).toEqual([
      { op: 'set', path: 'users/s1', data: enrolled, opts: { merge: true } },
      { op: 'set', path: 'students/s1', data: enrolled, opts: { merge: true } },
    ]);
  });

  test('re-joining the class the student is already in succeeds', async () => {
    mockDb.seed('users/s1', { role: 'student', courseId: 'c1' });
    const res = await enrollment(req({ code: 'PHYS101' }));
    expect(res.status).toBe(200);
  });

  test('409 when the student already belongs to a different class', async () => {
    mockDb.seed('users/s1', { role: 'student', courseId: 'other' });
    const res = await enrollment(req({ code: 'PHYS101' }));
    expect(res.status).toBe(409);
    expect(await json(res)).toEqual({ error: 'You already belong to another class. Manage your enrollment from your dashboard.' });
    expect(mockDb.writes).toEqual([]);
  });

  test.each([['NOSUCH'], [undefined], ['a/b']])('400 for class code %p', async code => {
    const res = await enrollment(req({ code }));
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ error: 'This class code is invalid or the class is no longer available.' });
    expect(mockDb.writes).toEqual([]);
  });

  test('403 for a non-student account', async () => {
    mockDb.seed('users/s1', { role: 'teacher' });
    const res = await enrollment(req({ code: 'PHYS101' }));
    expect(res.status).toBe(403);
    expect(await json(res)).toEqual({ error: 'Student account required' });
    expect(mockDb.writes).toEqual([]);
  });

  test('leave clears the enrollment without needing a code', async () => {
    mockDb.seed('users/s1', { role: 'student', courseId: 'c1', teacherId: 't1', organizationId: 'org1' });
    const res = await enrollment(req({ action: 'leave' }));
    expect(res.status).toBe(200);
    expect(mockDb.writes).toEqual([
      { op: 'set', path: 'users/s1', data: cleared, opts: { merge: true } },
      { op: 'set', path: 'students/s1', data: cleared, opts: { merge: true } },
    ]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('POST /api/ai/parse', () => {
  const body = { userId: 't1', text: '1. What is 2+2?' };
  gateTests('ai parse', aiParse, body, 'parse', true);

  beforeEach(() => {
    mockDb.seed('users/t1', { role: 'teacher', organizationId: 'org1' });
    mockParse.mockResolvedValue({ questions: [{ id: 'q1', text: 'What is 2+2?' }], usage: { inputTokens: 30, outputTokens: 9 } });
  });

  test('returns parsed questions and records usage for the organization', async () => {
    const res = await aiParse(req(body));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ questions: [{ id: 'q1', text: 'What is 2+2?' }] });
    expect(mockCheckBudget).toHaveBeenCalledWith('org1', 'generation');
    expect(mockParse).toHaveBeenCalledWith('1. What is 2+2?');
    expect(mockRecordUsage).toHaveBeenCalledWith('org1', 'parse', 30, 9);
  });

  test('missing token counts record as zero', async () => {
    mockParse.mockResolvedValue({ questions: [], usage: {} });
    await aiParse(req(body));
    expect(mockRecordUsage).toHaveBeenCalledWith('org1', 'parse', 0, 0);
  });

  test('no usage reported means nothing is recorded', async () => {
    mockParse.mockResolvedValue({ questions: [] });
    const res = await aiParse(req(body));
    expect(await json(res)).toEqual({ questions: [] });
    expect(mockRecordUsage).not.toHaveBeenCalled();
  });

  test('400 when text is missing', async () => {
    const res = await aiParse(req({ userId: 't1' }));
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual(expect.objectContaining({ error: 'Missing required fields' }));
    expect(mockParse).not.toHaveBeenCalled();
  });

  test('403 when the body userId is not the caller', async () => {
    const res = await aiParse(req({ ...body, userId: 'other' }));
    expect(res.status).toBe(403);
    expect(await json(res)).toEqual({ error: 'Account mismatch' });
  });

  test('403 when the teacher has no organization', async () => {
    mockDb.seed('users/t1', { role: 'teacher' });
    const res = await aiParse(req(body));
    expect(res.status).toBe(403);
    expect(await json(res)).toEqual({ error: 'No organization found for user' });
  });

  test('403 with the budget message and no model call when over budget', async () => {
    mockCheckBudget.mockResolvedValue({ allowed: false, error: 'Over budget' });
    const res = await aiParse(req(body));
    expect(res.status).toBe(403);
    expect(await json(res)).toEqual({ error: 'Over budget' });
    expect(mockParse).not.toHaveBeenCalled();
  });

  test('a parser failure is a generic 500 and no usage is recorded', async () => {
    mockParse.mockRejectedValue(new Error('model error'));
    const res = await aiParse(req(body));
    expect(res.status).toBe(500);
    expect(await json(res)).toEqual({ error: 'Internal server error', requestId: expect.any(String) });
    expect(mockRecordUsage).not.toHaveBeenCalled();
  });
});
