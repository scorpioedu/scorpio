import { NextRequest } from 'next/server';

type Doc = Record<string, unknown> | undefined;
const docs = new Map<string, Doc>();
const updates: Array<{ path: string; data: Record<string, unknown> }> = [];
let dbNull = false;

jest.mock('../src/lib/firebase-admin', () => ({
  adminFieldWithValue: { increment: (n: number) => ({ increment: n }) },
  get adminDb() {
    if (dbNull) return null;
    return {
      collection: (name: string) => ({
        doc: (id: string) => ({
          get: async () => ({ exists: docs.has(`${name}/${id}`), data: () => docs.get(`${name}/${id}`) }),
          update: async (data: Record<string, unknown>) => { updates.push({ path: `${name}/${id}`, data }); },
        }),
      }),
    };
  },
}));
jest.mock('../src/lib/auth-verify', () => ({
  withAuthorizedRequest: (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) =>
    (req: NextRequest) => handler(req, { requestId: 'req-1' }),
}));
const mockScrub = jest.fn();
jest.mock('../src/lib/ai/utils', () => ({ scrubPII: (...a: unknown[]) => mockScrub(...a) }));
const mockAssistant = jest.fn();
jest.mock('../src/lib/ai/notebook', () => ({ getNotebookAssistantResponse: (...a: unknown[]) => mockAssistant(...a) }));
const mockCheckBudget = jest.fn();
const mockRecordUsage = jest.fn();
jest.mock('../src/lib/usage-limit', () => ({
  checkBudget: (...a: unknown[]) => mockCheckBudget(...a),
  recordUsage: (...a: unknown[]) => mockRecordUsage(...a),
}));

import { POST } from '../src/app/api/notebook/chat/route';

const call = (body: unknown) =>
  POST(new NextRequest('https://scorpio.test/api/notebook/chat', { method: 'POST', body: JSON.stringify(body) }));
const messages = [{ role: 'user', content: 'what is a vector?' }];
const base = { messages, studentId: 'stu1' };

beforeEach(() => {
  docs.clear();
  updates.length = 0;
  dbNull = false;
  mockScrub.mockReset().mockImplementation((text: string, names: string[]) => `scrubbed(${text}|${names.join(',')})`);
  mockAssistant.mockReset().mockResolvedValue({ content: 'answer', usage: { inputTokens: 3, outputTokens: 4 } });
  mockCheckBudget.mockReset().mockResolvedValue({ allowed: true });
  mockRecordUsage.mockReset().mockResolvedValue({ success: true });
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('notebook chat organization resolution', () => {
  test('rejects a body without messages as 400', async () => {
    const res = await call({ studentId: 'stu1' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Missing required parameters');
  });

  test('a missing database is a 500', async () => {
    dbNull = true;
    const res = await call(base);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Database not initialized' });
  });

  test('an unknown student is 404', async () => {
    const res = await call(base);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Student profile not found' });
  });

  test('a student document with no readable data and no organization is 403', async () => {
    // exists but data() is undefined: both optional lookups fall through to "not enrolled"
    docs.set('users/stu1', undefined);
    const res = await call(base);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/must be enrolled/);
    expect(mockCheckBudget).not.toHaveBeenCalled();
  });

  test('a student with neither organization nor teacher is 403', async () => {
    docs.set('users/stu1', { displayName: 'Ada' });
    const res = await call(base);
    expect(res.status).toBe(403);
    expect(mockAssistant).not.toHaveBeenCalled();
  });

  test('a teacher without an organization leaves the student unenrolled (403)', async () => {
    docs.set('users/stu1', { teacherId: 't1' });
    docs.set('users/t1', {});
    const res = await call(base);
    expect(res.status).toBe(403);
  });

  test('a student inherits the organization from the teacher', async () => {
    docs.set('users/stu1', { teacherId: 't1', displayName: 'Ada' });
    docs.set('users/t1', { organizationId: 'orgT' });
    docs.set('organizations/orgT', {});
    const res = await call(base);
    expect(res.status).toBe(200);
    expect(mockCheckBudget).toHaveBeenCalledWith('orgT', 'notebook', 'stu1');
    expect(updates[0].path).toBe('organizations/orgT');
  });

  test('a teacher id whose profile is missing does not grant an organization', async () => {
    docs.set('users/stu1', { teacherId: 'gone' });
    const res = await call(base);
    expect(res.status).toBe(403);
  });
});

describe('notebook chat limits and generation', () => {
  beforeEach(() => {
    docs.set('users/stu1', { organizationId: 'org1', displayName: 'Ada' });
  });

  test('an organization document with no data uses the default limit of 50 and generates', async () => {
    // organizations/org1 not seeded: data() is undefined so defaults apply
    const res = await call(base);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ content: 'answer' });
  });

  test('usage at the default limit of 50 is refused', async () => {
    docs.set('organizations/org1', { notebookUsageCurrent: 50 });
    const res = await call(base);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/monthly notebook AI limit/);
    expect(mockAssistant).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });

  test('an explicit limit is honoured over the default', async () => {
    docs.set('organizations/org1', { notebookLimit: 3, notebookUsageCurrent: 3 });
    expect((await call(base)).status).toBe(403);
    docs.set('organizations/org1', { notebookLimit: 3, notebookUsageCurrent: 2 });
    expect((await call(base)).status).toBe(200);
  });

  test('a refused budget check returns its error as 403 without generating', async () => {
    docs.set('organizations/org1', {});
    mockCheckBudget.mockResolvedValue({ allowed: false, error: 'Budget gone' });
    const res = await call(base);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Budget gone' });
    expect(mockAssistant).not.toHaveBeenCalled();
  });

  test('scrubs messages and notebook content with the student name, records usage and increments the counter', async () => {
    docs.set('organizations/org1', {});
    const res = await call({ ...base, notebookContent: 'my notes' });
    expect(res.status).toBe(200);
    expect(mockAssistant).toHaveBeenCalledWith(
      [{ role: 'user', content: 'scrubbed(what is a vector?|Ada)' }],
      'scrubbed(my notes|Ada)',
    );
    expect(mockRecordUsage).toHaveBeenCalledWith('org1', 'notebook', 3, 4, 'stu1');
    expect(updates).toEqual([{ path: 'organizations/org1', data: { notebookUsageCurrent: { increment: 1 } } }]);
  });

  test('null notebook content and a missing display name scrub against an empty name', async () => {
    docs.set('users/stu1', { organizationId: 'org1' });
    docs.set('organizations/org1', {});
    await call({ ...base, notebookContent: null });
    expect(mockScrub).toHaveBeenCalledWith(undefined, ['']);
    expect(mockScrub).toHaveBeenCalledWith('what is a vector?', ['']);
  });

  test('a response without usage skips usage recording but still increments the counter', async () => {
    docs.set('organizations/org1', {});
    mockAssistant.mockResolvedValue({ content: 'no usage' });
    const res = await call(base);
    expect(await res.json()).toEqual({ content: 'no usage' });
    expect(mockRecordUsage).not.toHaveBeenCalled();
    expect(updates).toHaveLength(1);
  });

  test('a generation failure is reported through errorResponse as a 5xx', async () => {
    docs.set('organizations/org1', {});
    mockAssistant.mockRejectedValue(new Error('model down'));
    const res = await call(base);
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(updates).toEqual([]);
  });
});
