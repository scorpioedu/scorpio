import { NextRequest } from 'next/server';

type Doc = Record<string, unknown> | undefined;
const docs = new Map<string, Doc>();
const sets: Array<{ path: string; data: Record<string, unknown>; opts: unknown }> = [];
let sessionDocs: Array<{ messages?: Array<{ role: string; content: string }> }> = [];
let dbNull = false;

jest.mock('../src/lib/firebase-admin', () => ({
  adminFieldWithValue: { serverTimestamp: () => 'SERVER_TS' },
  get adminDb() {
    if (dbNull) return null;
    return {
      collection: (name: string) => {
        const q: Record<string, unknown> = {};
        for (const m of ['where', 'orderBy', 'limit']) q[m] = () => q;
        q.get = async () => ({ docs: sessionDocs.map(d => ({ data: () => d })) });
        return Object.assign(q, {
          doc: (id: string) => ({
            get: async () => ({ exists: docs.has(`${name}/${id}`), data: () => docs.get(`${name}/${id}`) }),
            set: async (data: Record<string, unknown>, opts: unknown) => { sets.push({ path: `${name}/${id}`, data, opts }); },
          }),
        });
      },
    };
  },
}));
jest.mock('../src/lib/auth-verify', () => ({
  withAuthorizedRequest: (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) =>
    (req: NextRequest) => handler(req, { requestId: 'req-1' }),
}));
const mockGenerate = jest.fn();
jest.mock('../src/lib/ai/network', () => ({ generateStudentPortfolio: (...a: unknown[]) => mockGenerate(...a) }));
const mockCheckBudget = jest.fn();
const mockRecordUsage = jest.fn();
jest.mock('../src/lib/usage-limit', () => ({
  checkBudget: (...a: unknown[]) => mockCheckBudget(...a),
  recordUsage: (...a: unknown[]) => mockRecordUsage(...a),
}));

import { POST } from '../src/app/api/teacher/network/portfolio/route';

const call = (body: unknown) =>
  POST(new NextRequest('https://scorpio.test/api/teacher/network/portfolio', { method: 'POST', body: JSON.stringify(body) }));
const ids = { teacherId: 't1', studentId: 'stu1', organizationId: 'org1' };
const portfolio = { strengths: ['s'], weaknesses: ['w'], masteryLevel: 'mid', aiSummary: 'sum' };

beforeEach(() => {
  docs.clear();
  sets.length = 0;
  sessionDocs = [];
  dbNull = false;
  docs.set('users/t1', { role: 'teacher', organizationId: 'org1' });
  docs.set('users/stu1', { role: 'student', displayName: 'Ada' });
  mockGenerate.mockReset().mockResolvedValue({ portfolio, usage: { inputTokens: 5, outputTokens: 6 } });
  mockCheckBudget.mockReset().mockResolvedValue({ allowed: true });
  mockRecordUsage.mockReset().mockResolvedValue(undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('portfolio request validation and authorization', () => {
  test.each(['teacherId', 'studentId', 'organizationId'])('missing %s is 400', async field => {
    const res = await call({ ...ids, [field]: undefined });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing required fields' });
  });

  test('a missing database is 503', async () => {
    dbNull = true;
    const res = await call(ids);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'Service unavailable' });
  });

  test('an unknown teacher is 403', async () => {
    docs.delete('users/t1');
    const res = await call(ids);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/Invalid teacher profile/);
  });

  test('a teacher document that exists without data is 403', async () => {
    docs.set('users/t1', undefined);
    const res = await call(ids);
    expect(res.status).toBe(403);
    expect(mockCheckBudget).not.toHaveBeenCalled();
  });

  test('a student document that exists without data is 404', async () => {
    docs.set('users/stu1', undefined);
    expect((await call(ids)).status).toBe(404);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  test('a user that is not a teacher is 403', async () => {
    docs.set('users/t1', { role: 'student', organizationId: 'org1' });
    expect((await call(ids)).status).toBe(403);
  });

  test('a teacher in another network is 403 and the budget is not consulted', async () => {
    docs.set('users/t1', { role: 'teacher', organizationId: 'other' });
    const res = await call(ids);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/not in network/);
    expect(mockCheckBudget).not.toHaveBeenCalled();
  });

  test('a refused budget is 403 with its message and nothing is generated', async () => {
    mockCheckBudget.mockResolvedValue({ allowed: false, error: 'No budget' });
    const res = await call(ids);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'No budget' });
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  test('an unknown student is 404', async () => {
    docs.delete('users/stu1');
    expect((await call(ids)).status).toBe(404);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  test('a user that is not a student is 404', async () => {
    docs.set('users/stu1', { role: 'teacher' });
    expect((await call(ids)).status).toBe(404);
  });
});

describe('portfolio generation', () => {
  test('stores the portfolio merged under the student id and returns it with a client date', async () => {
    const res = await call(ids);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.portfolio).toMatchObject({ studentId: 'stu1', organizationId: 'org1', teacherId: 't1', ...portfolio });
    expect(sets).toHaveLength(1);
    expect(sets[0]).toMatchObject({ path: 'portfolios/stu1', opts: { merge: true } });
    expect(sets[0].data).toMatchObject({ lastUpdated: 'SERVER_TS', aiSummary: 'sum' });
    expect(mockRecordUsage).toHaveBeenCalledWith('org1', 'portfolio', 5, 6, 't1');
  });

  test('the student name falls back from displayName to name to a placeholder', async () => {
    await call(ids);
    docs.set('users/stu1', { role: 'student', name: 'Grace' });
    await call(ids);
    docs.set('users/stu1', { role: 'student' });
    await call(ids);
    expect(mockGenerate.mock.calls.map(c => c[0])).toEqual(['Ada', 'Grace', 'Unknown Student']);
  });

  test('sessions are passed oldest first and a session without messages contributes none', async () => {
    sessionDocs = [
      { messages: [{ role: 'user', content: 'newest' }] },
      {},
      { messages: [{ role: 'assistant', content: 'oldest' }] },
    ];
    await call(ids);
    expect(mockGenerate.mock.calls[0][1]).toEqual([
      { role: 'assistant', content: 'oldest' },
      { role: 'user', content: 'newest' },
    ]);
  });

  test('history over 50 messages is trimmed to the most recent 50', async () => {
    sessionDocs = [{ messages: Array.from({ length: 60 }, (_, i) => ({ role: 'user', content: `m${i}` })) }];
    await call(ids);
    const history = mockGenerate.mock.calls[0][1] as Array<{ content: string }>;
    expect(history).toHaveLength(50);
    expect(history[0].content).toBe('m10');
    expect(history[49].content).toBe('m59');
  });

  test('a result without usage skips usage recording but still saves', async () => {
    mockGenerate.mockResolvedValue({ portfolio });
    const res = await call(ids);
    expect(res.status).toBe(200);
    expect(mockRecordUsage).not.toHaveBeenCalled();
    expect(sets).toHaveLength(1);
  });

  test('a generation failure is a 5xx and saves nothing', async () => {
    mockGenerate.mockRejectedValue(new Error('model down'));
    const res = await call(ids);
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(sets).toEqual([]);
  });
});
