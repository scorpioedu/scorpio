// Worked solutions (assignment_solutions/{id}) are server-only: no client can read or write the doc,
// and they reach a student only through GET /api/assignments/{id}/solutions once their work is
// graded and the due date has passed.
import { NextRequest } from 'next/server';
import * as admin from 'firebase-admin';
import fs from 'node:fs';
import { initializeTestEnvironment, assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
jest.mock('../../src/lib/firebase-admin', () => {
  const admin = jest.requireActual<typeof import('firebase-admin')>('firebase-admin');
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Emulator required');
  if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-scorpio-security' });
  return { adminDb: admin.firestore(), adminFieldWithValue: admin.firestore.FieldValue,
    adminAuth: { verifyIdToken: async (token: string) => ({ uid: token, email: `${token}@example.test`, auth_time: Math.floor(Date.now() / 1000) }) } };
});
jest.mock('../../src/lib/rate-limit', () => ({ enforceRateLimit: async () => null, checkRateLimit: async () => ({ allowed: true }) }));
import { GET as getSolutions } from '../../src/app/api/assignments/[id]/solutions/route';
import { adminDb } from '../../src/lib/firebase-admin';

const DAY = 24 * 60 * 60 * 1000;
const solutions = async (id: string, user: string) =>
  getSolutions(new NextRequest(`http://localhost/api/assignments/${id}/solutions`, { headers: { Authorization: `Bearer ${user}` } }));

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-scorpio-security', firestore: {
    host: '127.0.0.1', port: Number((process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8188').split(':').pop()),
    rules: fs.readFileSync('firestore.rules', 'utf8') } });
  const assignment = (dueDate: Date) => ({ teacherId: 'asOwner', courseId: 'asClass', answerKeySeparated: true, visibility: 'private', dueDate,
    title: 'Set', questions: [{ id: 'q1', text: 'Pick', type: 'multiple-choice', options: ['a', 'b'], points: 2 }] });
  await Promise.all([
    adminDb.collection('users').doc('asOwner').set({ role: 'teacher', organizationId: 'asOrg' }),
    adminDb.collection('users').doc('asStudent').set({ role: 'student', courseId: 'asClass', teacherId: 'asOwner' }),
    adminDb.collection('users').doc('asOther').set({ role: 'student', courseId: 'asElsewhere', teacherId: 'asNobody' }),
    adminDb.collection('courses').doc('asClass').set({ teacherId: 'asOwner' }),
    adminDb.collection('assignments').doc('asPast').set(assignment(new Date(Date.now() - DAY))),
    adminDb.collection('assignments').doc('asFuture').set(assignment(new Date(Date.now() + DAY))),
    ...['asPast', 'asFuture'].flatMap(id => [
      adminDb.collection('assignment_keys').doc(id).set({ answers: { q1: 'SECRET-KEY' }, teacherId: 'asOwner' }),
      adminDb.collection('assignment_solutions').doc(id).set({ solutions: { q1: 'SECRET-WORKED' }, teacherId: 'asOwner' }),
      adminDb.collection('submissions').doc(`asStudent_${id}`).set({ assignmentId: id, studentId: 'asStudent', status: 'graded', graded: true, answers: [] }),
    ]),
  ]);
}, 30000);
afterAll(async () => {
  await env.cleanup();
  await Promise.all(admin.apps.filter(Boolean).map(app => app!.delete()));
});

test('rules: nobody reads assignment_solutions directly, not even the owner or an enrolled, graded student', async () => {
  for (const db of [env.authenticatedContext('asOwner').firestore(), env.authenticatedContext('asStudent').firestore(),
    env.authenticatedContext('asOther').firestore(), env.unauthenticatedContext().firestore()]) {
    await assertFails(getDoc(doc(db, 'assignment_solutions/asPast')));
    await assertFails(getDoc(doc(db, 'assignment_solutions/asFuture')));
    await assertFails(getDocs(collection(db, 'assignment_solutions')));
  }
});

test('rules: nobody writes assignment_solutions directly', async () => {
  for (const uid of ['asOwner', 'asStudent']) {
    const db = env.authenticatedContext(uid).firestore();
    await assertFails(setDoc(doc(db, 'assignment_solutions/asPast'), { solutions: { q1: 'x' } }));
    await assertFails(setDoc(doc(db, 'assignment_solutions/asNew'), { solutions: { q1: 'x' } }));
    await assertFails(deleteDoc(doc(db, 'assignment_solutions/asPast')));
  }
});

test('route: a graded, enrolled student gets the solution after the due date and nothing before it', async () => {
  const after = await solutions('asPast', 'asStudent');
  expect(after.status).toBe(200);
  expect(await after.json()).toEqual({ solutions: { q1: { answer: 'SECRET-KEY', solution: 'SECRET-WORKED' } } });
  const before = await solutions('asFuture', 'asStudent');
  expect(before.status).toBe(200);
  const text = await before.text();
  expect(text).not.toMatch(/SECRET/);
  expect(JSON.parse(text)).toMatchObject({ solutions: {}, pending: 'due' });
});

test('route: a student outside the class is refused; the owner always reads', async () => {
  const outsider = await solutions('asPast', 'asOther');
  expect(outsider.status).toBe(403);
  expect(await outsider.text()).not.toMatch(/SECRET/);
  expect((await solutions('asMissing', 'asOther')).status).toBe(403);
  expect(await (await solutions('asFuture', 'asOwner')).json()).toEqual({ solutions: { q1: { answer: 'SECRET-KEY', solution: 'SECRET-WORKED' } } });
});
