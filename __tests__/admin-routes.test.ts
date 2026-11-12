import { NextRequest } from 'next/server';

const verifyIdToken = jest.fn();
const audits: Array<Record<string, unknown>> = [];
const emptySnap = { docs: [], empty: true };
const query: Record<string, unknown> = {};
for (const m of ['orderBy', 'limit', 'where', 'startAfter']) query[m] = () => query;
query.get = async () => emptySnap;
const docRef = {
  get: async () => ({ exists: false, data: () => undefined }),
  set: async () => undefined,
  update: async () => undefined,
};
jest.mock('../src/lib/firebase-admin', () => ({
  adminAuth: { verifyIdToken: (...a: unknown[]) => verifyIdToken(...a), verifySessionCookie: jest.fn() },
  adminFieldWithValue: { serverTimestamp: () => 'ts' },
  adminDb: {
    collection: (name: string) => name === 'admin_audit'
      ? { add: async (d: Record<string, unknown>) => { audits.push(d); return { id: 'x' }; } }
      : Object.assign({ doc: () => docRef, add: async () => ({ id: 'n1' }) }, query),
  },
}));
jest.mock('../src/lib/ai/tutor', () => ({
  explainPhysicsConcept: async () => ({ text: 'ok' }),
  helpSolveProblem: async () => ({ text: 'ok' }),
}));

import { POST as firestorePost } from '../src/app/api/admin/firestore/route';
import { POST as teacherCodePost } from '../src/app/api/auth/teacher-code/route';
import { POST as requestAccessPost } from '../src/app/api/auth/request-access/route';
import { POST as researchPost } from '../src/app/api/research/respond/route';

type Post = (req: NextRequest) => Promise<Response>;
const call = (url: string, headers: Record<string, string>, body: unknown) =>
  new NextRequest(`https://scorpio.test${url}`, { method: 'POST', headers, body: JSON.stringify(body) });
const asNonAdmin = () => verifyIdToken.mockResolvedValue({ uid: 'teacher1' });
const asAdmin = () => verifyIdToken.mockResolvedValue({ uid: 'root', admin: true });
const bearer = { Authorization: 'Bearer t' };

const adminCalls: Array<[string, string, Post, unknown]> = [
  ['firestore listCollections', '/api/admin/firestore', firestorePost, { action: 'listCollections' }],
  ['firestore queryCollection', '/api/admin/firestore', firestorePost, { action: 'queryCollection', collectionName: 'users' }],
  ['teacher-code generate', '/api/auth/teacher-code', teacherCodePost, { action: 'generate' }],
  ['teacher-code list', '/api/auth/teacher-code', teacherCodePost, { action: 'list' }],
  ['teacher-code revoke', '/api/auth/teacher-code', teacherCodePost, { action: 'revoke', code: 'SCORP-1' }],
  ['request-access list', '/api/auth/request-access', requestAccessPost, { action: 'list' }],
  ['request-access approve', '/api/auth/request-access', requestAccessPost, { action: 'approve', id: 'r1' }],
  ['request-access reject', '/api/auth/request-access', requestAccessPost, { action: 'reject', id: 'r1' }],
  ['research respond', '/api/research/respond', researchPost, { message: 'hi', mode: 'concept', level: 'FULL' }],
];

beforeEach(() => {
  jest.clearAllMocks();
  audits.length = 0;
  process.env.ADMIN_SECRET = 'legacy-secret';
});
afterAll(() => { delete process.env.ADMIN_SECRET; });

describe.each(adminCalls)('%s', (_name, url, post, body) => {
  test('401 without credentials', async () => {
    expect((await post(call(url, {}, body))).status).toBe(401);
  });
  test('403 for a signed-in non-admin, even with the legacy secret header', async () => {
    asNonAdmin();
    expect((await post(call(url, { ...bearer, 'x-admin-secret': 'legacy-secret' }, body))).status).toBe(403);
  });
  test('legacy secret alone is rejected', async () => {
    expect((await post(call(url, { 'x-admin-secret': 'legacy-secret' }, body))).status).toBe(401);
  });
  test('admin-claim user is not rejected and the call is audited', async () => {
    asAdmin();
    const res = await post(call(url, { ...bearer, 'x-forwarded-for': '198.51.100.7' }, body));
    expect([200, 404, 409]).toContain(res.status);
    const allowed = audits.filter(a => a.outcome === 'allowed');
    expect(allowed).toHaveLength(1);
    expect(allowed[0]).toEqual(expect.objectContaining({ uid: 'root', route: url }));
  });
});

describe('public actions stay public', () => {
  test('teacher-code validate needs no credentials', async () => {
    const res = await teacherCodePost(call('/api/auth/teacher-code', {}, { action: 'validate', code: 'SCORP-X' }));
    expect(res.status).toBe(200);
    expect(audits).toHaveLength(0);
  });
  test('request-access submit needs no credentials', async () => {
    const res = await requestAccessPost(call('/api/auth/request-access', {}, { name: 'A', email: 'a@b.co', institution: 'I', role: 'Teacher' }));
    expect(res.status).toBe(200);
  });
});
