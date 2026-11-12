import { NextRequest } from 'next/server';

type Doc = Record<string, unknown> | undefined;
const mockDocs = new Map<string, Doc>();
const mockUpdates: Array<{ path: string; data: Record<string, unknown> }> = [];

jest.mock('../src/lib/firebase-admin', () => ({
  adminDb: {
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => ({ exists: mockDocs.has(`${name}/${id}`), data: () => mockDocs.get(`${name}/${id}`) }),
        update: async (d: Record<string, unknown>) => { mockUpdates.push({ path: `${name}/${id}`, data: d }); },
      }),
      where: () => ({ where: () => ({ get: async () => ({ docs: [] }) }) }),
    }),
  },
}));
jest.mock('../src/lib/auth-verify', () => ({
  withAuthorizedRequest: (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) =>
    (req: NextRequest) => handler(req, { requestId: 'req-1' }),
}));
jest.mock('../src/lib/ai/grading', () => ({ gradeResponse: jest.fn() }));
const mockCheckBudget = jest.fn();
const mockRecordUsage = jest.fn();
jest.mock('../src/lib/usage-limit', () => ({
  checkBudget: (...a: unknown[]) => mockCheckBudget(...a),
  recordUsage: (...a: unknown[]) => mockRecordUsage(...a),
}));

import { POST } from '../src/app/api/grade/route';

const call = (body: unknown) =>
  POST(new NextRequest('https://scorpio.test/api/grade', { method: 'POST', body: JSON.stringify(body) }));

beforeEach(() => {
  mockDocs.clear();
  mockUpdates.length = 0;
  mockCheckBudget.mockReset().mockResolvedValue({ allowed: true });
  mockRecordUsage.mockReset().mockResolvedValue(undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('POST /api/grade sparse documents', () => {
  test('a submission document that exists without data is an invalid submission (400)', async () => {
    mockDocs.set('submissions/s1', undefined);
    const res = await call({ submissionId: 's1' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid submission data');
    expect(mockUpdates).toEqual([]);
  });

  test('a student whose teacher profile no longer exists has no organization (403)', async () => {
    mockDocs.set('submissions/s1', { assignmentId: 'a1', studentId: 'stu1' });
    mockDocs.set('users/stu1', { role: 'student', teacherId: 'gone' });
    const res = await call({ submissionId: 's1' });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/No organization/);
    expect(mockCheckBudget).not.toHaveBeenCalled();
  });

  test('a teacher document that exists without data gives no organization (403)', async () => {
    mockDocs.set('submissions/s1', { assignmentId: 'a1', studentId: 'stu1' });
    mockDocs.set('users/stu1', { role: 'student', teacherId: 't1' });
    mockDocs.set('users/t1', undefined);
    const res = await call({ submissionId: 's1' });
    expect(res.status).toBe(403);
    expect(mockCheckBudget).not.toHaveBeenCalled();
  });

  test('a submission with no answers on an assignment with no questions scores 0 and is marked graded', async () => {
    mockDocs.set('submissions/s1', { assignmentId: 'a1', studentId: 'stu1' });
    mockDocs.set('users/stu1', { role: 'student', organizationId: 'org1' });
    mockDocs.set('assignments/a1', { teacherId: 'teacher1' });
    const res = await call({ submissionId: 's1' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, score: 0 });
    expect(mockUpdates).toHaveLength(1);
    expect(mockUpdates[0].path).toBe('submissions/s1');
    expect(mockUpdates[0].data).toMatchObject({ score: 0, totalPoints: 0, earnedPoints: 0, answers: [], graded: true, status: 'graded' });
    expect(mockRecordUsage).not.toHaveBeenCalled();
  });
});
