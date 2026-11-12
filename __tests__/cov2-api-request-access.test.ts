import { NextRequest, NextResponse } from 'next/server';

type Doc = Record<string, unknown> | undefined;
const docs = new Map<string, Doc>();
const txSets: Array<{ path: string; data: Record<string, unknown> }> = [];
const txUpdates: Array<{ path: string; data: Record<string, unknown> }> = [];
const updates: Array<{ path: string; data: Record<string, unknown> }> = [];
let listDocs: Array<{ id: string; data: Record<string, unknown> }> = [];
let pendingDuplicate = false;
let txThrows = false;

jest.mock('../src/lib/firebase-admin', () => ({
  adminFieldWithValue: { serverTimestamp: () => 'SERVER_TS' },
  adminDb: {
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      if (txThrows) throw new Error('tx failed');
      return fn({
        get: async (ref: { get: () => Promise<unknown> }) => ref.get(),
        set: (ref: { path: string }, data: Record<string, unknown>) => { txSets.push({ path: ref.path, data }); },
        update: (ref: { path: string }, data: Record<string, unknown>) => { txUpdates.push({ path: ref.path, data }); },
      });
    },
    collection: (name: string) => {
      const query: Record<string, unknown> = {};
      for (const m of ['orderBy', 'limit', 'where']) query[m] = () => query;
      query.get = async () => name === 'accessRequests' && listDocs.length
        ? { empty: false, docs: listDocs.map(d => ({ id: d.id, data: () => d.data })) }
        : { empty: !pendingDuplicate, docs: [] };
      return Object.assign(query, {
        doc: (id: string = 'auto-id') => ({
          id,
          path: `${name}/${id}`,
          get: async () => ({ exists: docs.has(`${name}/${id}`), data: () => docs.get(`${name}/${id}`) }),
          update: async (data: Record<string, unknown>) => { updates.push({ path: `${name}/${id}`, data }); },
        }),
      });
    },
  },
}));

// Admin gating is covered in admin-routes.test.ts; here the wrapped handler runs directly.
jest.mock('../src/lib/auth-verify', () => ({
  withAuthorizedRequest: (handler: (req: NextRequest) => Promise<Response>) => (req: NextRequest) => handler(req),
}));
const mockEnforce = jest.fn();
jest.mock('../src/lib/rate-limit', () => ({ enforceRateLimit: (...a: unknown[]) => mockEnforce(...a) }));

import { POST } from '../src/app/api/auth/request-access/route';

const call = (body: unknown) =>
  POST(new NextRequest('https://scorpio.test/api/auth/request-access', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }));
const valid = { name: ' Ada ', email: ' Ada@Example.COM ', institution: ' MIT ', role: ' Teacher ' };

beforeEach(() => {
  docs.clear();
  txSets.length = 0;
  txUpdates.length = 0;
  updates.length = 0;
  listDocs = [];
  pendingDuplicate = false;
  txThrows = false;
  mockEnforce.mockReset().mockResolvedValue(null);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('request-access routing and envelope', () => {
  test('rate-limited public submission returns the limiter response and writes nothing', async () => {
    mockEnforce.mockResolvedValue(NextResponse.json({ error: 'slow down' }, { status: 429 }));
    const res = await call(valid);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'slow down' });
    expect(txSets).toEqual([]);
  });

  test('a JSON null body is not mistaken for an admin action and is rejected as invalid', async () => {
    const res = await call('null');
    expect(res.status).toBe(400);
    expect(mockEnforce).toHaveBeenCalledWith(expect.anything(), 'requestAccess');
  });

  test('an unparseable body is rejected with Invalid JSON', async () => {
    const res = await call('{not json');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON' });
  });

  test('a non-string action falls to the public path and fails action validation', async () => {
    const res = await call({ action: 5 });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid action' });
  });

  test('an unknown string action is rejected', async () => {
    const res = await call({ action: 'delete' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid action' });
  });
});

describe('request-access list', () => {
  test('maps timestamps, message and generated code when present', async () => {
    const created = new Date('2026-01-02T03:04:05.000Z');
    const reviewed = new Date('2026-02-03T04:05:06.000Z');
    listDocs = [{
      id: 'r1',
      data: {
        name: 'Ada', email: 'a@b.co', institution: 'MIT', role: 'Teacher', message: 'hello', status: 'approved',
        createdAt: { toDate: () => created }, reviewedAt: { toDate: () => reviewed }, generatedCode: 'SCORP-AAAA-BBBB',
      },
    }];
    const res = await call({ action: 'list' });
    expect(res.status).toBe(200);
    expect((await res.json()).requests).toEqual([{
      id: 'r1', name: 'Ada', email: 'a@b.co', institution: 'MIT', role: 'Teacher', message: 'hello', status: 'approved',
      createdAt: '2026-01-02T03:04:05.000Z', reviewedAt: '2026-02-03T04:05:06.000Z', generatedCode: 'SCORP-AAAA-BBBB',
    }]);
  });

  test('absent optional fields become null, and non-timestamp dates become null', async () => {
    listDocs = [
      { id: 'r2', data: { name: 'B', email: 'b@b.co', institution: 'I', role: 'T', status: 'pending' } },
      { id: 'r3', data: { name: 'C', email: 'c@b.co', institution: 'I', role: 'T', status: 'pending', createdAt: 'plain-string', reviewedAt: {} } },
    ];
    const body = await (await call({ action: 'list' })).json();
    for (const r of body.requests) {
      expect(r.message).toBeNull();
      expect(r.createdAt).toBeNull();
      expect(r.reviewedAt).toBeNull();
      expect(r.generatedCode).toBeNull();
    }
    expect(body.requests.map((r: { id: string }) => r.id)).toEqual(['r2', 'r3']);
  });
});

describe('request-access approve and reject', () => {
  test('approve without an id is 400 Missing request id', async () => {
    const res = await call({ action: 'approve' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Missing request id');
  });

  test('approve of an unknown request is 404 and issues no code', async () => {
    const res = await call({ action: 'approve', id: 'ghost' });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Request not found' });
    expect(txSets).toEqual([]);
  });

  test('approve of a non-pending request is 409', async () => {
    docs.set('accessRequests/r1', { status: 'approved', name: 'Ada', institution: 'MIT' });
    const res = await call({ action: 'approve', id: 'r1' });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Request is not pending' });
    expect(txSets).toEqual([]);
  });

  test('approve of a pending request writes an invite code and marks the request approved', async () => {
    docs.set('accessRequests/r1', { status: 'pending', name: 'Ada', institution: 'MIT' });
    const res = await call({ action: 'approve', id: 'r1' });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.code).toMatch(/^SCORP-[0-9A-F]{4}-[0-9A-F]{4}$/);
    expect(txSets).toHaveLength(1);
    expect(txSets[0].path).toBe(`teacherInviteCodes/${body.code}`);
    expect(txSets[0].data).toMatchObject({ code: body.code, label: 'Ada — MIT', isUsed: false, requestId: 'r1', organizationId: null });
    expect(txUpdates).toEqual([{ path: 'accessRequests/r1', data: { status: 'approved', reviewedAt: 'SERVER_TS', generatedCode: body.code } }]);
  });

  test('reject without an id is 400', async () => {
    const res = await call({ action: 'reject' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Missing request id');
  });

  test('reject of an unknown request is 404 and updates nothing', async () => {
    const res = await call({ action: 'reject', id: 'ghost' });
    expect(res.status).toBe(404);
    expect(updates).toEqual([]);
  });

  test('reject of an existing request marks it rejected', async () => {
    docs.set('accessRequests/r1', { status: 'pending' });
    const res = await call({ action: 'reject', id: 'r1' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(updates).toEqual([{ path: 'accessRequests/r1', data: { status: 'rejected', reviewedAt: 'SERVER_TS' } }]);
  });
});

describe('request-access public submission', () => {
  test.each([
    ['missing field', { name: 'A', email: 'a@b.co', institution: 'I' }],
    ['blank name', { ...valid, name: '   ' }],
    ['blank email', { ...valid, email: ' ' }],
    ['blank institution', { ...valid, institution: '' }],
    ['blank role', { ...valid, role: '\t' }],
  ])('%s is 400 Missing required fields.', async (_label, body) => {
    const res = await call(body);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Missing required fields.');
    expect(txSets).toEqual([]);
  });

  test('a malformed email is 400 Invalid email address.', async () => {
    const res = await call({ ...valid, email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid email address.' });
  });

  test('a duplicate pending request is 409 and writes nothing', async () => {
    pendingDuplicate = true;
    const res = await call(valid);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/pending request already exists/);
    expect(txSets).toEqual([]);
  });

  test('a new request is stored trimmed, lowercased, with a null message when absent', async () => {
    const res = await call(valid);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(txSets).toHaveLength(1);
    expect(txSets[0].data).toMatchObject({
      name: 'Ada', email: 'ada@example.com', institution: 'MIT', role: 'Teacher', message: null, status: 'pending', generatedCode: null,
    });
  });

  test('a blank-only message is stored as null and a real one is trimmed', async () => {
    await call({ ...valid, message: '   ' });
    await call({ ...valid, message: '  hi there ' });
    expect(txSets.map(s => s.data.message)).toEqual([null, 'hi there']);
  });

  test('a transaction failure is 500 with a generic message', async () => {
    txThrows = true;
    const res = await call(valid);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'An unexpected error occurred. Please try again.' });
  });
});
