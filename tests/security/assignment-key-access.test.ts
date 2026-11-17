// Sprint 1: answer keys reach only the owning teacher, through the API (route handlers against the
// emulator) and through direct client reads (firestore.rules on assignment_keys).
import { NextRequest } from 'next/server';
import * as admin from 'firebase-admin';
import fs from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';
jest.mock('../../src/lib/firebase-admin', () => {
  const admin = jest.requireActual<typeof import('firebase-admin')>('firebase-admin');
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Emulator required');
  if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-scorpio-security' });
  return { adminDb: admin.firestore(), adminFieldWithValue: admin.firestore.FieldValue,
    adminAuth: { verifyIdToken: async (token: string) => ({ uid: token, email: `${token}@example.test`, auth_time: Math.floor(Date.now() / 1000) }) } };
});
jest.mock('../../src/lib/rate-limit', () => ({ enforceRateLimit: async () => null, checkRateLimit: async () => ({ allowed: true }) }));
import { POST as createAssignment, GET as getAssignment } from '../../src/app/api/assignments/route';
import { POST as cloneAssignment } from '../../src/app/api/assignments/clone/route';
import { adminDb } from '../../src/lib/firebase-admin';

const post = (path: string, user: string, body: unknown) =>
  new NextRequest(`http://localhost/api/${path}`, { method: 'POST', headers: { Authorization: `Bearer ${user}` }, body: JSON.stringify(body) });
const get = async (id: string, user: string) =>
  getAssignment(new NextRequest(`http://localhost/api/assignments?id=${id}`, { headers: { Authorization: `Bearer ${user}` } }));

let env: RulesTestEnvironment;
let globalId = '';
let networkId = '';
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-scorpio-security', firestore: {
    host: '127.0.0.1', port: Number((process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8188').split(':').pop()),
    rules: fs.readFileSync('firestore.rules', 'utf8') } });
  await Promise.all([
    adminDb.collection('users').doc('akOwner').set({ role: 'teacher', organizationId: 'akOrgA' }),
    adminDb.collection('users').doc('akColleague').set({ role: 'teacher', organizationId: 'akOrgA' }),
    adminDb.collection('users').doc('akOutsider').set({ role: 'teacher', organizationId: 'akOrgB' }),
    adminDb.collection('organizations').doc('akOrgA').set({ planId: 'department-monthly', subscriptionStatus: 'active' }),
    adminDb.collection('organizations').doc('akOrgB').set({ planId: 'department-monthly', subscriptionStatus: 'active' }),
  ]);
  const body = (visibility: string) => ({ title: `Key ${visibility}`, visibility, rubric: 'SECRET-RUBRIC', gradingType: 'manual', questions: [
    { id: 'q1', text: 'Pick', type: 'multiple-choice', options: ['a', 'b'], correctAnswer: 'b', points: 2 },
    { id: 'q2', text: 'Say', type: 'short-answer', correctAnswer: 'SECRET-ANSWER', points: 3 },
  ] });
  const g = await createAssignment(post('assignments', 'akOwner', body('global')));
  const n = await createAssignment(post('assignments', 'akOwner', body('network')));
  expect([g.status, n.status]).toEqual([200, 200]);
  globalId = (await g.json()).id;
  networkId = (await n.json()).id;
}, 30000);
afterAll(async () => {
  await env.cleanup();
  await Promise.all(admin.apps.filter(Boolean).map(app => app!.delete()));
});

const expectNoKey = (json: { rubric?: unknown; questions: Array<Record<string, unknown>> }) => {
  expect(json).not.toHaveProperty('rubric');
  for (const q of json.questions) expect(q).not.toHaveProperty('correctAnswer');
  expect(JSON.stringify(json)).not.toMatch(/SECRET/);
};

test('a teacher from another organization gets the global assignment without answers or rubric', async () => {
  const res = await get(globalId, 'akOutsider');
  expect(res.status).toBe(200);
  expectNoKey(await res.json());
});

test('a same-organization teacher who is not the owner gets the network assignment without answers', async () => {
  const res = await get(networkId, 'akColleague');
  expect(res.status).toBe(200);
  expectNoKey(await res.json());
  expect((await get(networkId, 'akOutsider')).status).toBe(403);
});

test('the owner gets the key', async () => {
  const json = await (await get(globalId, 'akOwner')).json();
  expect(json.rubric).toBe('SECRET-RUBRIC');
  expect(json.questions.map((q: { correctAnswer: string }) => q.correctAnswer)).toEqual(['b', 'SECRET-ANSWER']);
});

test('rules: only the owner can read assignment_keys directly', async () => {
  await assertSucceeds(getDoc(doc(env.authenticatedContext('akOwner').firestore(), `assignment_keys/${globalId}`)));
  await assertFails(getDoc(doc(env.authenticatedContext('akOutsider').firestore(), `assignment_keys/${globalId}`)));
  await assertFails(getDoc(doc(env.authenticatedContext('akColleague').firestore(), `assignment_keys/${networkId}`)));
});

test('clone: another organization teacher gets a private copy whose key is stored, not returned', async () => {
  const res = await cloneAssignment(post('assignments/clone', 'akOutsider', { sourceId: globalId }));
  expect(res.status).toBe(200);
  const text = await res.text();
  expect(text).not.toMatch(/SECRET|correctAnswer/);
  const { id } = JSON.parse(text);
  const copy = (await adminDb.collection('assignments').doc(id).get()).data()!;
  expect(copy).toMatchObject({ teacherId: 'akOutsider', visibility: 'private', answerKeySeparated: true, forkedFrom: globalId, organizationId: 'akOrgB' });
  const key = (await adminDb.collection('assignment_keys').doc(id).get()).data()!;
  expect(key.teacherId).toBe('akOutsider');
  expect(key.rubric).toBe('SECRET-RUBRIC');
  expect(copy.questions.map((q: { id: string }) => key.answers[q.id])).toEqual(['b', 'SECRET-ANSWER']);
  expect((await adminDb.collection('assignments').doc(globalId).get()).data()!.forkCount).toBe(1);
  // The new owner can now read the copied key; the original author cannot.
  await assertSucceeds(getDoc(doc(env.authenticatedContext('akOutsider').firestore(), `assignment_keys/${id}`)));
  await assertFails(getDoc(doc(env.authenticatedContext('akOwner').firestore(), `assignment_keys/${id}`)));
});
