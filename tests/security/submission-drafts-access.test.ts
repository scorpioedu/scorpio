// AI grades a teacher has not released (submission_drafts/{submissionId}) are read only by the
// assignment's teacher and never by the student they are about: firestore.rules.
import * as admin from 'firebase-admin';
import fs from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Emulator required');
if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-scorpio-security' });
const adminDb = admin.firestore();

let env: RulesTestEnvironment;
const as = (uid: string) => env.authenticatedContext(uid).firestore();
const draft = { assignmentId: 'sdAssignment', studentId: 'sdStudent', answers: { q1: { score: 7, feedback: 'UNRELEASED-AI-FEEDBACK' } } };

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-scorpio-security', firestore: {
    host: '127.0.0.1', port: Number((process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8188').split(':').pop()),
    rules: fs.readFileSync('firestore.rules', 'utf8') } });
  await Promise.all([
    adminDb.collection('users').doc('sdTeacher').set({ role: 'teacher', organizationId: 'sdOrg' }),
    adminDb.collection('users').doc('sdColleague').set({ role: 'teacher', organizationId: 'sdOrg' }),
    adminDb.collection('users').doc('sdStudent').set({ role: 'student', teacherId: 'sdTeacher', courseId: 'sdCourse' }),
    adminDb.collection('assignments').doc('sdAssignment').set({ teacherId: 'sdTeacher', courseId: 'sdCourse', title: 'Held' }),
    adminDb.collection('submissions').doc('sdSubmission').set({ assignmentId: 'sdAssignment', studentId: 'sdStudent', status: 'pending_review', graded: false, answers: [{ questionId: 'q1', answer: 'mine', reviewFlag: 'Waiting for your teacher' }] }),
  ]);
}, 30000);
beforeEach(async () => {
  await adminDb.collection('submission_drafts').doc('sdSubmission').set(draft);
});
afterAll(async () => {
  await env.cleanup();
  await Promise.all(admin.apps.filter(Boolean).map(app => app!.delete()));
});

test('the student can read their own held submission, which carries nothing from the AI', async () => {
  const snap = await assertSucceeds(getDoc(doc(as('sdStudent'), 'submissions', 'sdSubmission')));
  expect(JSON.stringify(snap.data())).not.toMatch(/UNRELEASED/);
});

test('the student cannot read, list, change or delete the draft of their own submission', async () => {
  const db = as('sdStudent');
  await assertFails(getDoc(doc(db, 'submission_drafts', 'sdSubmission')));
  await assertFails(getDocs(query(collection(db, 'submission_drafts'), where('studentId', '==', 'sdStudent'))));
  await assertFails(updateDoc(doc(db, 'submission_drafts', 'sdSubmission'), { answers: {} }));
  await assertFails(deleteDoc(doc(db, 'submission_drafts', 'sdSubmission')));
});

test('a signed-out visitor and another teacher cannot read the draft', async () => {
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'submission_drafts', 'sdSubmission')));
  await assertFails(getDoc(doc(as('sdColleague'), 'submission_drafts', 'sdSubmission')));
  await assertFails(deleteDoc(doc(as('sdColleague'), 'submission_drafts', 'sdSubmission')));
});

test("the assignment's teacher reads the draft and removes it on release, but cannot write one", async () => {
  const db = as('sdTeacher');
  const snap = await assertSucceeds(getDoc(doc(db, 'submission_drafts', 'sdSubmission')));
  expect(snap.data()?.answers.q1.score).toBe(7);
  await assertFails(setDoc(doc(db, 'submission_drafts', 'sdOther'), draft));
  await assertFails(updateDoc(doc(db, 'submission_drafts', 'sdSubmission'), { answers: {} }));
  await assertFails(getDocs(collection(db, 'submission_drafts')));
  await assertSucceeds(deleteDoc(doc(db, 'submission_drafts', 'sdSubmission')));
});

test('a teacher may ask for a draft that does not exist; a student may not', async () => {
  const snap = await assertSucceeds(getDoc(doc(as('sdTeacher'), 'submission_drafts', 'sdNone')));
  expect(snap.exists()).toBe(false);
  await assertFails(getDoc(doc(as('sdStudent'), 'submission_drafts', 'sdNone')));
});
