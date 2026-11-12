import { NextRequest, NextResponse } from 'next/server';

type Doc = Record<string, unknown> | undefined;
const mockDocs = new Map<string, Doc>();
const mockWrites: Array<{ op: string; path: string; data?: unknown }> = [];
const mockQueryLog: string[] = [];
let mockListDocs: Array<{ data: () => Record<string, unknown> }> = [];
let mockDbNull = false;
let mockAuditThrows = false;
const mockVerifyIdToken = jest.fn();
const mockEnforce = jest.fn();

jest.mock('../src/lib/firebase-admin', () => ({
  adminFieldWithValue: { serverTimestamp: () => 'SERVER_TS' },
  adminAuth: { verifyIdToken: (...a: unknown[]) => mockVerifyIdToken(...a), verifySessionCookie: jest.fn() },
  get adminDb() {
    if (mockDbNull) return null;
    return {
      collection: (name: string) => {
        const query: Record<string, unknown> = {};
        for (const m of ['orderBy', 'limit']) query[m] = (...a: unknown[]) => { mockQueryLog.push(`${m}:${a.join(',')}`); return query; };
        query.get = async () => ({ docs: mockListDocs });
        return Object.assign(query, {
          add: async (d: unknown) => {
            if (mockAuditThrows) throw new Error('audit down');
            mockWrites.push({ op: 'add', path: name, data: d });
            return { id: 'audit1' };
          },
          doc: (id: string) => ({
            get: async () => ({ exists: mockDocs.get(`${name}/${id}`) !== undefined, data: () => mockDocs.get(`${name}/${id}`) }),
            set: async (d: unknown) => { mockWrites.push({ op: 'set', path: `${name}/${id}`, data: d }); },
            update: async (d: unknown) => { mockWrites.push({ op: 'update', path: `${name}/${id}`, data: d }); },
          }),
        });
      },
    };
  },
}));
jest.mock('../src/lib/rate-limit', () => ({ enforceRateLimit: (...a: unknown[]) => mockEnforce(...a) }));

import { POST } from '../src/app/api/auth/teacher-code/route';

const call = (body: unknown, headers: Record<string, string> = {}) =>
  POST(new NextRequest('https://scorpio.test/api/auth/teacher-code', { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) }));
const admin = { Authorization: 'Bearer t' };
const asAdmin = () => mockVerifyIdToken.mockResolvedValue({ uid: 'root', admin: true });
const ts = (iso: string) => ({ toDate: () => new Date(iso) });

beforeEach(() => {
  mockDocs.clear();
  mockWrites.length = 0;
  mockQueryLog.length = 0;
  mockListDocs = [];
  mockDbNull = false;
  mockAuditThrows = false;
  mockVerifyIdToken.mockReset();
  mockEnforce.mockReset().mockResolvedValue(null);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('teacher-code admin actions', () => {
  beforeEach(asAdmin);

  test('generate stores a 30-day SCORP code and returns it', async () => {
    const before = Date.now();
    const res = await call({ action: 'generate', label: '  Dept A  ', organizationId: 'org1' }, admin);
    const { code } = await res.json();
    expect(res.status).toBe(200);
    expect(code).toMatch(/^SCORP-[0-9A-F]{4}-[0-9A-F]{4}$/);
    const stored = mockWrites.find(w => w.path === `teacherInviteCodes/${code}`)!;
    expect(stored.data).toMatchObject({ code, label: 'Dept A', organizationId: 'org1', isUsed: false, createdAt: 'SERVER_TS', usedBy: null });
    const days = ((stored.data as { expiresAt: Date }).expiresAt.getTime() - before) / 86400000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);
    expect(mockWrites.some(w => w.path === 'admin_audit' && (w.data as { outcome: string }).outcome === 'allowed')).toBe(true);
  });

  test('generate defaults label and organisation to null', async () => {
    const { code } = await (await call({ action: 'generate' }, admin)).json();
    expect(mockWrites.find(w => w.path === `teacherInviteCodes/${code}`)!.data).toMatchObject({ label: null, organizationId: null });
  });

  test('list serialises timestamps, plain dates and missing values', async () => {
    mockListDocs = [
      { data: () => ({ code: 'A', label: 'x', isUsed: true, createdAt: ts('2030-01-01T00:00:00Z'), expiresAt: new Date('2030-02-01T00:00:00Z'), usedAt: ts('2030-01-05T00:00:00Z'), usedByEmail: 'u@example.test' }) },
      { data: () => ({ code: 'B', label: null, isUsed: false, expiresAt: ts('2031-01-01T00:00:00Z') }) },
      { data: () => ({ code: 'C', isUsed: false }) },
    ];
    const json = await (await call({ action: 'list' }, admin)).json();
    expect(mockQueryLog).toEqual(['orderBy:createdAt,desc', 'limit:100']);
    expect(json.codes[0]).toMatchObject({ code: 'A', createdAt: '2030-01-01T00:00:00.000Z', expiresAt: '2030-02-01T00:00:00.000Z', usedAt: '2030-01-05T00:00:00.000Z', usedByEmail: 'u@example.test' });
    expect(json.codes[1]).toMatchObject({ createdAt: null, expiresAt: '2031-01-01T00:00:00.000Z', usedAt: null });
    expect(json.codes[2]).toMatchObject({ createdAt: null, expiresAt: null, usedAt: null });
  });

  test('revoke 400 without a code, 404 for an unknown code', async () => {
    expect((await call({ action: 'revoke' }, admin)).status).toBe(400);
    const res = await call({ action: 'revoke', code: 'scorp-0000' }, admin);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Code not found' });
  });

  test('revoke normalises the code and marks it used', async () => {
    mockDocs.set('teacherInviteCodes/SCORP-1', { code: 'SCORP-1' });
    const res = await call({ action: 'revoke', code: ' scorp-1 ' }, admin);
    expect(await res.json()).toEqual({ success: true });
    expect(mockWrites.find(w => w.op === 'update')).toEqual({ op: 'update', path: 'teacherInviteCodes/SCORP-1', data: { isUsed: true, revokedAt: 'SERVER_TS' } });
  });

  test('admin actions are rate limited per uid under the write budget', async () => {
    mockEnforce.mockResolvedValue(NextResponse.json({ error: 'slow down' }, { status: 429 }));
    const res = await call({ action: 'list' }, admin);
    expect(res.status).toBe(429);
    expect(mockEnforce.mock.calls[0].slice(1)).toEqual(['write', 'root']);
  });

  test('401 without credentials and 403 for a non-admin; nothing is written for the action', async () => {
    expect((await call({ action: 'generate' })).status).toBe(401);
    mockVerifyIdToken.mockResolvedValue({ uid: 'teacher1' });
    expect((await call({ action: 'generate' }, admin)).status).toBe(403);
    expect(mockWrites.filter(w => w.path !== 'admin_audit')).toHaveLength(0);
  });

  test('500 and no action when the audit record cannot be written', async () => {
    mockAuditThrows = true;
    const res = await call({ action: 'generate' }, admin);
    expect(res.status).toBe(500);
    expect(mockWrites).toHaveLength(0);
  });

  test('a database failure inside an action is a generic 500', async () => {
    mockDocs.set('teacherInviteCodes/X', {});
    mockListDocs = new Proxy([], { get() { throw new Error('firestore detail'); } });
    const res = await call({ action: 'list' }, admin);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('firestore detail');
  });
});

describe('teacher-code public actions', () => {
  test('validate 400 when the code is missing', async () => {
    const res = await call({ action: 'validate' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ valid: false, reason: 'Missing code' });
  });

  test('validate is rate limited by client IP under the teacherCode budget', async () => {
    mockEnforce.mockResolvedValue(NextResponse.json({ error: 'slow down' }, { status: 429 }));
    const res = await call({ action: 'validate', code: 'SCORP-1' });
    expect(res.status).toBe(429);
    expect(mockEnforce.mock.calls[0][1]).toBe('teacherCode');
    expect(mockEnforce.mock.calls[0]).toHaveLength(2);
  });

  test('validate reports unknown, used, expired, and valid codes', async () => {
    expect(await (await call({ action: 'validate', code: 'scorp-1' })).json()).toEqual({ valid: false, reason: 'Invalid code' });
    mockDocs.set('teacherInviteCodes/SCORP-1', { isUsed: true });
    expect(await (await call({ action: 'validate', code: 'scorp-1' })).json()).toEqual({ valid: false, reason: 'Code already used' });
    mockDocs.set('teacherInviteCodes/SCORP-1', { isUsed: false, expiresAt: new Date(Date.now() - 1000) });
    expect(await (await call({ action: 'validate', code: 'scorp-1' })).json()).toEqual({ valid: false, reason: 'Code expired' });
    mockDocs.set('teacherInviteCodes/SCORP-1', { isUsed: false, expiresAt: ts('2001-01-01T00:00:00Z') });
    expect(await (await call({ action: 'validate', code: 'scorp-1' })).json()).toEqual({ valid: false, reason: 'Code expired' });
    mockDocs.set('teacherInviteCodes/SCORP-1', { isUsed: false, expiresAt: new Date(Date.now() + 86400000), organizationId: 'org9' });
    expect(await (await call({ action: 'validate', code: ' scorp-1 ' })).json()).toEqual({ valid: true, organizationId: 'org9' });
  });

  test('validate accepts a code with no expiry and no organisation', async () => {
    mockDocs.set('teacherInviteCodes/SCORP-2', { isUsed: false });
    expect(await (await call({ action: 'validate', code: 'SCORP-2' })).json()).toEqual({ valid: true, organizationId: null });
  });

  test('markUsed is gone (410) and does not require admin', async () => {
    const res = await call({ action: 'markUsed', code: 'SCORP-1' });
    expect(res.status).toBe(410);
    expect(mockWrites).toHaveLength(0);
  });

  test('unknown action is a 400', async () => {
    const res = await call({ action: 'nope' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Unknown action');
  });

  test('an unparseable body falls through to the public handler and fails generically', async () => {
    const res = await call('not json');
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: 'Internal server error' });
  });

  test('503-style 500 when Firebase Admin is not initialised', async () => {
    mockDbNull = true;
    const res = await call({ action: 'validate', code: 'SCORP-1' });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/Firebase Admin not initialized/);
  });
});
