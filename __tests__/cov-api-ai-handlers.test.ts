// Handler-level tests for the AI / support / billing routes. The auth wrapper is replaced by a pass-through
// (its behaviour is covered by auth-wrapper-rt13/19 and rate-limit-routes); everything else is real.
import { NextRequest } from 'next/server';

type Doc = Record<string, unknown> | undefined;
const mockDocs = new Map<string, Doc>();
const mockWrites: Array<{ op: string; path: string; data?: unknown }> = [];
let mockQueryDocs: Array<{ id: string; data: () => Record<string, unknown> }> = [];
let mockQueryLog: string[] = [];
let mockDbNull = false;
let mockSetThrows = false;
let mockPolarNull = false;

jest.mock('../src/lib/firebase-admin', () => {
  const query: Record<string, unknown> = {};
  for (const m of ['where', 'orderBy', 'startAfter', 'limit']) {
    query[m] = (...args: unknown[]) => { mockQueryLog.push(`${m}:${args.map(String).join(',')}`); return query; };
  }
  query.get = async () => ({ docs: mockQueryDocs });
  return {
    adminFieldWithValue: { increment: (n: number) => ({ increment: n }) },
    get adminDb() {
      if (mockDbNull) return null;
      return {
        collection: (name: string) => Object.assign(Object.create(query), {
          doc: (id: string) => ({
            get: async () => { const data = mockDocs.get(`${name}/${id}`); return { exists: data !== undefined, data: () => data }; },
            set: async (d: unknown) => { if (mockSetThrows) throw new Error('write failed'); mockWrites.push({ op: 'set', path: `${name}/${id}`, data: d }); },
            update: async (d: unknown) => { mockWrites.push({ op: 'update', path: `${name}/${id}`, data: d }); },
          }),
        }),
      };
    },
  };
});

const mockVerifyCaller = jest.fn();
jest.mock('../src/lib/auth-verify', () => ({
  withAuthorizedRequest: (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) =>
    (req: NextRequest) => handler(req, { caller: { uid: 'u1' }, profile: {}, organizationId: '', body: {}, requestId: 'req-1' }),
  verifyCallerIdentity: (...a: unknown[]) => mockVerifyCaller(...a),
}));

const mockGenerateQuestions = jest.fn();
jest.mock('../src/lib/ai/assignment', () => ({ generateAssignmentQuestions: (...a: unknown[]) => mockGenerateQuestions(...a) }));
const mockSynthRubric = jest.fn();
jest.mock('../src/lib/ai/grading', () => ({ synthesizeRubric: (...a: unknown[]) => mockSynthRubric(...a) }));
const mockNav = jest.fn();
jest.mock('../src/lib/ai/chatbot', () => ({ getNavigationResponse: (...a: unknown[]) => mockNav(...a) }));
const mockNotebook = jest.fn();
jest.mock('../src/lib/ai/notebook', () => ({ getNotebookAssistantResponse: (...a: unknown[]) => mockNotebook(...a) }));
const mockExplain = jest.fn();
const mockSolve = jest.fn();
jest.mock('../src/lib/ai/tutor', () => ({
  explainPhysicsConcept: (...a: unknown[]) => mockExplain(...a),
  helpSolveProblem: (...a: unknown[]) => mockSolve(...a),
}));
const mockCheckBudget = jest.fn();
const mockRecordUsage = jest.fn();
jest.mock('../src/lib/usage-limit', () => ({
  checkBudget: (...a: unknown[]) => mockCheckBudget(...a),
  recordUsage: (...a: unknown[]) => mockRecordUsage(...a),
}));
const mockCheckoutCreate = jest.fn();
jest.mock('../src/lib/polar', () => ({
  get polar() { return mockPolarNull ? null : { checkouts: { create: (...a: unknown[]) => mockCheckoutCreate(...a) } }; },
}));

import { POST as generatePost } from '../src/app/api/ai/generate/route';
import { POST as rubricPost } from '../src/app/api/ai/synthesize-rubric/route';
import { POST as titlePost } from '../src/app/api/ai/generate-title/route';
import { POST as navPost } from '../src/app/api/chat/route';
import { POST as notebookPost } from '../src/app/api/notebook/chat/route';
import { POST as tutorPost } from '../src/app/api/student/tutor/route';
import { POST as checkoutPost } from '../src/app/api/checkout/route';
import { POST as supportPost } from '../src/app/api/support/report/route';
import { POST as adminFirestorePost } from '../src/app/api/admin/firestore/route';

type Post = (req: NextRequest) => Promise<Response>;
const call = (post: Post, body: unknown, headers: Record<string, string> = {}) =>
  post(new NextRequest('https://scorpio.test/api/x', { method: 'POST', headers, body: JSON.stringify(body) }));

beforeEach(() => {
  mockDocs.clear();
  mockWrites.length = 0;
  mockQueryDocs = [];
  mockQueryLog = [];
  mockDbNull = false;
  mockSetThrows = false;
  mockPolarNull = false;
  for (const m of [mockVerifyCaller, mockGenerateQuestions, mockSynthRubric, mockNav, mockNotebook, mockExplain, mockSolve, mockCheckoutCreate, mockRecordUsage]) m.mockReset();
  mockCheckBudget.mockReset().mockResolvedValue({ allowed: true });
  mockVerifyCaller.mockResolvedValue({ authorized: true });
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('POST /api/ai/generate-title', () => {
  test('returns the fixed title', async () => {
    const res = await call(titlePost, {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ title: 'Physics conversation' });
  });
});

describe('POST /api/ai/generate', () => {
  const body = { topic: 'Kinematics', count: 3, difficulty: 'easy', questionType: 'text', userId: 'u1', context: 'ctx' };

  test.each([[{ userId: 'u1' }], [{ topic: 't' }]])('400 when topic or userId missing (%j)', async partial => {
    const res = await call(generatePost, partial);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Missing required fields');
  });

  test('503 when the database is unavailable', async () => {
    mockDbNull = true;
    expect((await call(generatePost, body)).status).toBe(503);
  });

  test('404 when the user profile does not exist', async () => {
    const res = await call(generatePost, body);
    expect(res.status).toBe(404);
    expect(mockGenerateQuestions).not.toHaveBeenCalled();
  });

  test('403 when the user has no organisation', async () => {
    mockDocs.set('users/u1', { role: 'teacher' });
    const res = await call(generatePost, body);
    expect(res.status).toBe(403);
    expect(mockCheckBudget).not.toHaveBeenCalled();
  });

  test('403 with the budget message when the budget is spent', async () => {
    mockDocs.set('users/u1', { organizationId: 'o1' });
    mockCheckBudget.mockResolvedValue({ allowed: false, error: 'Over budget' });
    const res = await call(generatePost, body);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Over budget' });
    expect(mockGenerateQuestions).not.toHaveBeenCalled();
  });

  test('returns questions and records usage', async () => {
    mockDocs.set('users/u1', { organizationId: 'o1' });
    mockGenerateQuestions.mockResolvedValue({ questions: [{ id: 'q' }], usage: { inputTokens: 5, outputTokens: 6 } });
    const res = await call(generatePost, body);
    expect(await res.json()).toEqual({ questions: [{ id: 'q' }] });
    expect(mockGenerateQuestions).toHaveBeenCalledWith('Kinematics', 3, 'easy', 'text', 'ctx');
    expect(mockCheckBudget).toHaveBeenCalledWith('o1', 'generation');
    expect(mockRecordUsage).toHaveBeenCalledWith('o1', 'generation', 5, 6);
  });

  test('zero-fills missing token counts', async () => {
    mockDocs.set('users/u1', { organizationId: 'o1' });
    mockGenerateQuestions.mockResolvedValue({ questions: [], usage: {} });
    await call(generatePost, body);
    expect(mockRecordUsage).toHaveBeenCalledWith('o1', 'generation', 0, 0);
  });

  test('a usage-recording failure does not fail the request', async () => {
    mockDocs.set('users/u1', { organizationId: 'o1' });
    mockGenerateQuestions.mockResolvedValue({ questions: [{ id: 'q' }], usage: { inputTokens: 1, outputTokens: 1 } });
    mockRecordUsage.mockRejectedValue(new Error('ledger down'));
    expect((await call(generatePost, body)).status).toBe(200);
  });

  test('no usage means nothing is recorded', async () => {
    mockDocs.set('users/u1', { organizationId: 'o1' });
    mockGenerateQuestions.mockResolvedValue({ questions: [] });
    await call(generatePost, body);
    expect(mockRecordUsage).not.toHaveBeenCalled();
  });

  test('a provider failure becomes a generic 500', async () => {
    mockDocs.set('users/u1', { organizationId: 'o1' });
    mockGenerateQuestions.mockRejectedValue(new Error('secret upstream text'));
    const res = await call(generatePost, body);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('secret upstream text');
  });
});

describe('POST /api/ai/synthesize-rubric', () => {
  const body = { questionText: 'Why?', topic: 'Optics', userId: 'u1' };

  test('400 when questionText or userId missing', async () => {
    expect((await call(rubricPost, { userId: 'u1' })).status).toBe(400);
    expect((await call(rubricPost, { questionText: 'x' })).status).toBe(400);
  });

  test('503 when the database is unavailable', async () => {
    mockDbNull = true;
    expect((await call(rubricPost, body)).status).toBe(503);
  });

  test('404 for an unknown user and 403 without an organisation', async () => {
    expect((await call(rubricPost, body)).status).toBe(404);
    mockDocs.set('users/u1', {});
    expect((await call(rubricPost, body)).status).toBe(403);
  });

  test('403 when the budget is spent', async () => {
    mockDocs.set('users/u1', { organizationId: 'o1' });
    mockCheckBudget.mockResolvedValue({ allowed: false, error: 'Over budget' });
    const res = await call(rubricPost, body);
    expect(res.status).toBe(403);
    expect(mockSynthRubric).not.toHaveBeenCalled();
  });

  test('returns the rubric and records usage', async () => {
    mockDocs.set('users/u1', { organizationId: 'o1' });
    mockSynthRubric.mockResolvedValue({ text: 'RUBRIC', usage: { inputTokens: 2, outputTokens: 3 } });
    const res = await call(rubricPost, body);
    expect(await res.json()).toEqual({ rubric: 'RUBRIC' });
    expect(mockSynthRubric).toHaveBeenCalledWith('Why?', 'Optics');
    expect(mockRecordUsage).toHaveBeenCalledWith('o1', 'generation', 2, 3);
  });

  test('defaults the topic and tolerates a usage-recording failure', async () => {
    mockDocs.set('users/u1', { organizationId: 'o1' });
    mockSynthRubric.mockResolvedValue({ text: 'R', usage: { inputTokens: 1, outputTokens: 1 } });
    mockRecordUsage.mockRejectedValue(new Error('ledger down'));
    const res = await call(rubricPost, { questionText: 'Why?', userId: 'u1' });
    expect(res.status).toBe(200);
    expect(mockSynthRubric).toHaveBeenCalledWith('Why?', 'General Scientific Query');
  });

  test('no usage means nothing is recorded; provider failure is a generic 500', async () => {
    mockDocs.set('users/u1', { organizationId: 'o1' });
    mockSynthRubric.mockResolvedValueOnce({ text: 'R' });
    await call(rubricPost, body);
    expect(mockRecordUsage).not.toHaveBeenCalled();
    mockSynthRubric.mockRejectedValueOnce(new Error('boom'));
    const res = await call(rubricPost, body);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('boom');
  });
});

describe('POST /api/chat (navigation assistant)', () => {
  const body = { message: 'where is X', userRole: 'student', userId: 'u1' };

  test('400 when a required field is missing', async () => {
    expect((await call(navPost, { message: 'hi', userId: 'u1' })).status).toBe(400);
  });

  test('500 when the database is unavailable', async () => {
    mockDbNull = true;
    expect((await call(navPost, body)).status).toBe(500);
  });

  test('404 when the user does not exist', async () => {
    expect((await call(navPost, body)).status).toBe(404);
  });

  test('403 when neither user nor teacher has an organisation', async () => {
    mockDocs.set('users/u1', { teacherId: 't1' });
    mockDocs.set('users/t1', {});
    const res = await call(navPost, body);
    expect(res.status).toBe(403);
    expect(mockNav).not.toHaveBeenCalled();
  });

  test('403 for a user with no teacher and no organisation', async () => {
    mockDocs.set('users/u1', {});
    expect((await call(navPost, body)).status).toBe(403);
  });

  test('403 when the budget is spent', async () => {
    mockDocs.set('users/u1', { organizationId: 'o1' });
    mockCheckBudget.mockResolvedValue({ allowed: false, error: 'No budget' });
    const res = await call(navPost, body);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'No budget' });
  });

  test('student gets student prompts; usage billed to the inherited teacher organisation', async () => {
    mockDocs.set('users/u1', { teacherId: 't1' });
    mockDocs.set('users/t1', { organizationId: 'teacherOrg' });
    mockNav.mockResolvedValue({ text: 'go there', usage: { inputTokens: 4, outputTokens: 9 } });
    const res = await call(navPost, body);
    const json = await res.json();
    expect(json.text).toBe('go there');
    expect(Array.isArray(json.suggestedPrompts)).toBe(true);
    expect(mockNav.mock.calls[0][0]).toBe('where is X');
    expect(mockNav.mock.calls[0][1]).toBe('student');
    expect(mockCheckBudget).toHaveBeenCalledWith('teacherOrg', 'navigation');
    expect(mockRecordUsage).toHaveBeenCalledWith('teacherOrg', 'navigation', 4, 9);
  });

  test('teacher role uses a different feature list and prompts; no usage means no record', async () => {
    mockDocs.set('users/u1', { organizationId: 'o1' });
    mockNav.mockResolvedValue({ text: 'ok' });
    const teacher = await (await call(navPost, { ...body, userRole: 'teacher' })).json();
    const student = await (await call(navPost, body)).json();
    expect(teacher.suggestedPrompts).not.toEqual(student.suggestedPrompts);
    expect(mockNav.mock.calls[0][2]).not.toBe(mockNav.mock.calls[1][2]);
    expect(mockRecordUsage).not.toHaveBeenCalled();
  });

  test('a provider failure is a generic 500', async () => {
    mockDocs.set('users/u1', { organizationId: 'o1' });
    mockNav.mockRejectedValue(new Error('upstream detail'));
    const res = await call(navPost, body);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('upstream detail');
  });
});

describe('POST /api/notebook/chat', () => {
  const body = { messages: [{ role: 'user', content: 'Help' }], notebookContent: 'notes', studentId: 's1' };
  const seedOrg = (org: Doc = {}) => {
    mockDocs.set('users/s1', { organizationId: 'o1', displayName: 'Ada' });
    mockDocs.set('organizations/o1', org);
  };

  test('500 when the database is unavailable', async () => {
    mockDbNull = true;
    expect((await call(notebookPost, body)).status).toBe(500);
  });

  test('400 for an empty message list', async () => {
    const res = await call(notebookPost, { ...body, messages: [] });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Missing required parameters');
  });

  test('404 when the student profile is missing', async () => {
    expect((await call(notebookPost, body)).status).toBe(404);
  });

  test('403 when no organisation can be resolved', async () => {
    mockDocs.set('users/s1', { teacherId: 't1' });
    mockDocs.set('users/t1', {});
    expect((await call(notebookPost, body)).status).toBe(403);
  });

  test('403 when the network notebook quota is used up (custom limit)', async () => {
    seedOrg({ notebookLimit: 5, notebookUsageCurrent: 5 });
    const res = await call(notebookPost, body);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/monthly notebook AI limit/);
    expect(mockNotebook).not.toHaveBeenCalled();
  });

  test('default limit of 50 applies when the organisation sets none', async () => {
    seedOrg({ notebookUsageCurrent: 50 });
    expect((await call(notebookPost, body)).status).toBe(403);
  });

  test('403 with the budget message when the token budget is spent', async () => {
    seedOrg();
    mockCheckBudget.mockResolvedValue({ allowed: false, error: 'Student cap reached' });
    const res = await call(notebookPost, body);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Student cap reached' });
    expect(mockCheckBudget).toHaveBeenCalledWith('o1', 'notebook', 's1');
    expect(mockWrites).toHaveLength(0);
  });

  test('returns content, records usage and increments the notebook counter', async () => {
    seedOrg({ notebookUsageCurrent: 3 });
    mockNotebook.mockResolvedValue({ content: 'answer', usage: { inputTokens: 8, outputTokens: 2 } });
    const res = await call(notebookPost, body);
    expect(await res.json()).toEqual({ content: 'answer' });
    expect(mockRecordUsage).toHaveBeenCalledWith('o1', 'notebook', 8, 2, 's1');
    expect(mockWrites).toEqual([{ op: 'update', path: 'organizations/o1', data: { notebookUsageCurrent: { increment: 1 } } }]);
  });

  test('scrubs the student name from messages sent to the model and inherits the teacher organisation', async () => {
    mockDocs.set('users/s1', { teacherId: 't1', displayName: 'Ada Lovelace' });
    mockDocs.set('users/t1', { organizationId: 'o1' });
    mockDocs.set('organizations/o1', {});
    mockNotebook.mockResolvedValue({ content: 'ok' });
    await call(notebookPost, { messages: [{ role: 'user', content: 'My name is Ada Lovelace' }], notebookContent: 'Ada Lovelace notes', studentId: 's1' });
    const [sentMessages, sentNotebook] = mockNotebook.mock.calls[0];
    expect(JSON.stringify(sentMessages)).not.toContain('Ada Lovelace');
    expect(sentNotebook).not.toContain('Ada Lovelace');
    expect(mockRecordUsage).not.toHaveBeenCalled();
  });

  test('a provider failure is a generic 500', async () => {
    seedOrg();
    mockNotebook.mockRejectedValue(new Error('upstream detail'));
    const res = await call(notebookPost, body);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('upstream detail');
  });
});

describe('POST /api/student/tutor', () => {
  const body = { message: 'Why?', userId: 's1', role: 'student', mode: 'concept', chatHistory: [], assignmentContext: 'ctx' };
  const seedStudent = (extra: Record<string, unknown> = {}) =>
    mockDocs.set('users/s1', { organizationId: 'o1', teacherId: 't1', displayName: 'Ada', ...extra });

  test.each([
    [{ ...body, message: '' }],
    [{ ...body, userId: '' }],
    [{ ...body, role: 'teacher' }],
  ])('401 for an invalid request (%j)', async invalid => {
    const res = await call(tutorPost, invalid);
    expect(res.status).toBe(401);
    expect(mockVerifyCaller).not.toHaveBeenCalled();
  });

  test('403 when the caller identity does not match', async () => {
    mockVerifyCaller.mockResolvedValue({ authorized: false, error: 'Valid authentication for this account is required' });
    const res = await call(tutorPost, body);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Valid authentication for this account is required' });
  });

  test('503 when the database is unavailable', async () => {
    mockDbNull = true;
    expect((await call(tutorPost, body)).status).toBe(503);
  });

  test('404 for an unknown user', async () => {
    expect((await call(tutorPost, body)).status).toBe(404);
  });

  test('403 when no organisation can be resolved', async () => {
    seedStudent({ organizationId: undefined, teacherId: undefined });
    expect((await call(tutorPost, body)).status).toBe(403);
    mockDocs.set('users/s1', { teacherId: 't1' });
    mockDocs.set('users/t1', {});
    expect((await call(tutorPost, body)).status).toBe(403);
  });

  test('403 when the budget is spent', async () => {
    seedStudent();
    mockCheckBudget.mockResolvedValue({ allowed: false, error: 'Limit hit' });
    const res = await call(tutorPost, body);
    expect(res.status).toBe(403);
    expect(mockCheckBudget).toHaveBeenCalledWith('o1', 'tutor', 's1');
    expect(mockExplain).not.toHaveBeenCalled();
  });

  test('concept mode explains with the classmates scrubbed and records usage', async () => {
    seedStudent();
    mockQueryDocs = [{ id: 'a', data: () => ({ displayName: 'Bob' }) }, { id: 'b', data: () => ({ name: 'Cy' }) }, { id: 'c', data: () => ({}) }];
    mockExplain.mockResolvedValue({ text: 'think about force', usage: { inputTokens: 3, outputTokens: 4 } });
    const res = await call(tutorPost, body);
    expect(await res.json()).toEqual({ response: 'think about force' });
    expect(mockExplain).toHaveBeenCalledWith('Why?', [], 'FULL', ['Bob', 'Cy', 'Ada']);
    expect(mockSolve).not.toHaveBeenCalled();
    expect(mockRecordUsage).toHaveBeenCalledWith('o1', 'tutor', 3, 4, 's1');
  });

  test('other modes use the problem helper; own name is not duplicated; no usage is not billed', async () => {
    seedStudent();
    mockQueryDocs = [{ id: 'a', data: () => ({ displayName: 'Ada' }) }];
    mockSolve.mockResolvedValue({ text: 'step 1' });
    const res = await call(tutorPost, { ...body, mode: 'problem' });
    expect(await res.json()).toEqual({ response: 'step 1' });
    expect(mockSolve).toHaveBeenCalledWith('Why?', [], 'STRICT_CONCISE', 'ctx', ['Ada']);
    expect(mockRecordUsage).not.toHaveBeenCalled();
  });

  test('queries the caller own id as teacher when the student has no teacher', async () => {
    seedStudent({ teacherId: undefined });
    mockExplain.mockResolvedValue({ text: 'x' });
    await call(tutorPost, body);
    expect(mockQueryLog).toContain('where:teacherId,==,s1');
  });

  test('tutoring continues if the class roster cannot be read', async () => {
    seedStudent();
    const original = mockQueryDocs;
    mockQueryDocs = new Proxy(original, { get() { throw new Error('roster failed'); } });
    mockExplain.mockResolvedValue({ text: 'x' });
    const res = await call(tutorPost, body);
    expect(res.status).toBe(200);
    expect(mockExplain.mock.calls[0][3]).toEqual([]);
  });

  test('a provider failure is a generic 500', async () => {
    seedStudent();
    mockExplain.mockRejectedValue(new Error('upstream detail'));
    const res = await call(tutorPost, body);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('upstream detail');
  });
});

describe('POST /api/checkout', () => {
  const body = { userId: 'u1', organizationId: 'o1', planId: 'department_monthly' };
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.POLAR_MONTHLY_ID = 'price_monthly';
    process.env.POLAR_PRODUCT_ID = 'price_product';
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.test';
    mockDocs.set('organizations/o1', { ownerId: 'u1', ownerEmail: 'owner@example.test' });
  });
  afterEach(() => { process.env = { ...saved }; });

  test('400 for a malformed body', async () => {
    const res = await call(checkoutPost, { userId: 'u1' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Missing required fields');
  });

  test('500 when the database is unavailable', async () => {
    mockDbNull = true;
    expect((await call(checkoutPost, body)).status).toBe(500);
  });

  test('404 for an unknown organisation, 403 for a non-owner', async () => {
    mockDocs.delete('organizations/o1');
    expect((await call(checkoutPost, body)).status).toBe(404);
    mockDocs.set('organizations/o1', { ownerId: 'someone-else' });
    expect((await call(checkoutPost, body)).status).toBe(403);
    expect(mockCheckoutCreate).not.toHaveBeenCalled();
  });

  test('400 with a generic message when the plan has no configured product', async () => {
    const res = await call(checkoutPost, { ...body, planId: 'no_such_plan' });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Configuration Error');
    expect(json.message).toBe('This plan is not available for checkout right now.');
    expect(json.requestId).toBe('req-1');
    expect(JSON.stringify(json)).not.toContain('no_such_plan');
  });

  test('400 when the mapped environment variable is unset', async () => {
    delete process.env.POLAR_MONTHLY_ID;
    expect((await call(checkoutPost, body)).status).toBe(400);
  });

  test('500 when the Polar SDK is unavailable', async () => {
    mockPolarNull = true;
    const res = await call(checkoutPost, body);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Polar SDK not initialized' });
  });

  test('creates a checkout with metadata, owner email and the configured success URL', async () => {
    mockCheckoutCreate.mockResolvedValue({ url: 'https://polar.example.test/c/1' });
    const res = await call(checkoutPost, body);
    expect(await res.json()).toEqual({ url: 'https://polar.example.test/c/1' });
    expect(mockCheckoutCreate).toHaveBeenCalledWith({
      products: ['price_monthly'],
      successUrl: 'https://app.example.test/teacher/network?success=true',
      includeConfirmationEmail: true,
      metadata: { organizationId: 'o1', userId: 'u1', planId: 'department_monthly' },
      customerEmail: 'owner@example.test',
    });
  });

  test('falls back to the request origin and omits the email when the owner has none', async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    mockDocs.set('organizations/o1', { ownerId: 'u1' });
    mockCheckoutCreate.mockResolvedValue({ url: 'https://polar.example.test/c/2' });
    await call(checkoutPost, { ...body, planId: 'department_network' });
    const options = mockCheckoutCreate.mock.calls[0][0];
    expect(options.successUrl).toBe('https://scorpio.test/teacher/network?success=true');
    expect(options.products).toEqual(['price_product']);
    expect(options).not.toHaveProperty('customerEmail');
  });

  test('500 when Polar returns no URL', async () => {
    mockCheckoutCreate.mockResolvedValue({});
    const res = await call(checkoutPost, body);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('No checkout URL returned from Polar');
  });

  test('502 with generic text when Polar throws, never echoing the upstream error', async () => {
    mockCheckoutCreate.mockRejectedValue(new Error('polar secret detail'));
    const res = await call(checkoutPost, body);
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toBe('We could not start checkout. Please try again.');
    expect(JSON.stringify(json)).not.toContain('polar secret detail');
  });

  test('502 also when a non-Error value is thrown', async () => {
    mockCheckoutCreate.mockRejectedValue('weird');
    expect((await call(checkoutPost, body)).status).toBe(502);
  });
});

describe('POST /api/support/report', () => {
  test.each([[{}], [{ description: '   ' }], [{ description: 42 }]])('400 without a usable description (%j)', async b => {
    const res = await call(supportPost, b);
    expect(res.status).toBe(400);
    expect(mockWrites).toHaveLength(0);
  });

  test('stores a bug ticket with defaults and returns its id', async () => {
    const res = await call(supportPost, { description: '  The page crashes  ' }, { 'user-agent': 'jest-agent' });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.ticketId).toMatch(/^SC-BUG-[0-9A-Z]{4}\d{4}$/);
    expect(mockWrites).toHaveLength(1);
    expect(mockWrites[0].path).toBe(`support_tickets/${json.ticketId}`);
    expect(mockWrites[0].data).toMatchObject({
      description: 'The page crashes', title: 'BUG: The page crashes...', category: 'bug', priority: 'normal',
      userRole: 'student', userId: null, status: 'open', screenshots: [], userAgent: 'jest-agent',
    });
  });

  test('feature and other categories use their own prefixes; explicit title and agent are kept; screenshots capped at 3', async () => {
    const feature = await (await call(supportPost, { description: 'd', category: 'feature', title: ' My title ', userAgent: 'ua', screenshots: ['a', 'b', 'c', 'd'] })).json();
    expect(feature.ticketId).toMatch(/^SC-FEAT-/);
    expect(mockWrites[0].data).toMatchObject({ title: 'My title', userAgent: 'ua', screenshots: ['a', 'b', 'c'] });
    const other = await (await call(supportPost, { description: 'd', category: 'question', screenshots: 'nope' })).json();
    expect(other.ticketId).toMatch(/^SC-SUP-/);
    expect(mockWrites[1].data).toMatchObject({ screenshots: [], userAgent: 'Unknown' });
  });

  test('503 without storing when the database is unavailable', async () => {
    mockDbNull = true;
    const res = await call(supportPost, { description: 'd' });
    expect(res.status).toBe(503);
    expect((await res.json()).requestId).toBe('req-1');
  });

  test('503 when the write fails, with no internal detail in the body', async () => {
    mockSetThrows = true;
    const res = await call(supportPost, { description: 'd' });
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toContain('write failed');
  });

  test('a body that is not JSON is a generic 500', async () => {
    const res = await supportPost(new NextRequest('https://scorpio.test/api/x', { method: 'POST', body: 'not json' }));
    expect(res.status).toBe(500);
  });
});

describe('POST /api/admin/firestore', () => {
  const doc = (id: string, data: Record<string, unknown>) => ({ id, data: () => data });

  test('500 when the database is unavailable', async () => {
    mockDbNull = true;
    expect((await call(adminFirestorePost, { action: 'listCollections' })).status).toBe(500);
  });

  test('lists the allow-listed collections', async () => {
    const json = await (await call(adminFirestorePost, { action: 'listCollections' })).json();
    expect(json.collections).toContain('users');
    expect(json.collections).not.toContain('admin_audit');
  });

  test.each([[{ action: 'queryCollection' }], [{ action: 'queryCollection', collectionName: 'admin_audit' }]])('400 for a missing or disallowed collection (%j)', async b => {
    const res = await call(adminFirestorePost, b);
    expect(res.status).toBe(400);
    expect(mockQueryLog).toHaveLength(0);
  });

  test('400 for an unknown action', async () => {
    const res = await call(adminFirestorePost, { action: 'delete' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Unknown action');
  });

  test('queries with filter, normalises timestamps and reports paging state', async () => {
    mockQueryDocs = [doc('a', { n: 1, at: { _seconds: 0, _nanoseconds: 0 } }), doc('b', { n: 2 })];
    const json = await (await call(adminFirestorePost, { action: 'queryCollection', collectionName: 'users', filterField: 'role', filterValue: 'teacher', limit: 2 })).json();
    expect(json.docs).toEqual([{ id: 'a', n: 1, at: '1970-01-01T00:00:00.000Z' }, { id: 'b', n: 2 }]);
    expect(json.lastDocId).toBe('b');
    expect(json.hasMore).toBe(true);
    expect(mockQueryLog).toEqual(['where:role,==,teacher', 'orderBy:__name__,asc', 'limit:2']);
  });

  test('ignores an empty filter, caps the limit at 100 and reports an empty last page', async () => {
    const json = await (await call(adminFirestorePost, { action: 'queryCollection', collectionName: 'users', filterField: 'role', filterValue: '', limit: 500 })).json();
    expect(json).toEqual({ docs: [], lastDocId: null, hasMore: false });
    expect(mockQueryLog).toEqual(['orderBy:__name__,asc', 'limit:100']);
  });

  test('resumes after a cursor document when it exists and ignores a missing one', async () => {
    mockDocs.set('users/cursor', { n: 0 });
    await call(adminFirestorePost, { action: 'queryCollection', collectionName: 'users', lastDocId: 'cursor' });
    expect(mockQueryLog.some(l => l.startsWith('startAfter'))).toBe(true);
    mockQueryLog = [];
    await call(adminFirestorePost, { action: 'queryCollection', collectionName: 'users', lastDocId: 'gone' });
    expect(mockQueryLog.some(l => l.startsWith('startAfter'))).toBe(false);
  });

  test('an unexpected failure is a generic 500', async () => {
    const res = await adminFirestorePost(new NextRequest('https://scorpio.test/api/x', { method: 'POST', body: '{bad' }));
    expect(res.status).toBe(500);
  });
});
