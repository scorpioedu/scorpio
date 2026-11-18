import * as fs from 'fs';
import * as admin from 'firebase-admin';
import { initializeTestEnvironment, assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { recordMisconceptionEvents, MISCONCEPTION_EVENTS } from '../../functions/src/misconception-events';
import { gradeSubmissionAnswers } from '../../functions/src/grading-core';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Emulator required');
const app = admin.initializeApp({ projectId: 'demo-scorpio-security' }, 'misconception-events-test');
const db = app.firestore();
let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-scorpio-security', firestore: {
    host: process.env.FIRESTORE_EMULATOR_HOST!.split(':')[0], port: Number(process.env.FIRESTORE_EMULATOR_HOST!.split(':')[1]),
    rules: fs.readFileSync('firestore.rules', 'utf8') } });
  await db.doc('users/meTeacher').set({ role: 'teacher', organizationId: 'meOrg' });
  await db.doc('users/meStudent').set({ role: 'student', teacherId: 'meTeacher', organizationId: 'meOrg' });
});
afterAll(async () => { await env.cleanup(); await app.delete(); });

const assignment = {
  title: 'Momentum HW', teacherId: 'meTeacher', organizationId: 'meOrg', courseId: 'meCourse', apUnit: 4, apTopics: ['4.3'],
  questions: [
    { id: 'q1', text: 'Final speed after the carts stick?', type: 'numeric', points: 10, apTopic: '4.3' },
    { id: 'q2', text: 'Which is conserved?', type: 'multiple-choice', points: 10, options: ['momentum only', 'kinetic energy only', 'both'] },
  ],
};
const keyed = assignment.questions.map((q) => ({
  ...q,
  correctAnswer: q.id === 'q1' ? '2 m/s' : 'momentum only',
  distractors: q.id === 'q1'
    ? [{ answer: '4 m/s', misconception: 'momentum-kinetic-energy-confusion' }]
    : [{ answer: 'both', misconception: 'momentum-kinetic-energy-confusion' }, { answer: 'kinetic energy only', misconception: 'momentum-kinetic-energy-confusion' }],
}));

test('a graded submission records one event per misconception in Firestore; regrading replaces them', async () => {
  const graded = await gradeSubmissionAnswers(keyed, [{ questionId: 'q1', answer: '4 m/s' }, { questionId: 'q2', answer: 'both' }]);
  expect(graded.answers.map((a) => (a as { misconceptions: string[] }).misconceptions)).toEqual([
    ['momentum-kinetic-energy-confusion'], ['momentum-kinetic-energy-confusion'],
  ]);
  const ctx = { submissionId: 'meSub1', studentId: 'meStudent', assignmentId: 'meA1', assignment, answers: graded.answers, final: true };
  expect(await recordMisconceptionEvents(db, ctx)).toBe(2);
  const snap = await db.collection(MISCONCEPTION_EVENTS).where('submissionId', '==', 'meSub1').get();
  expect(snap.docs.map((d) => d.data()).map((e) => [e.questionId, e.tag, e.apTopic, e.apUnit, e.teacherId, e.courseId]).sort()).toEqual([
    ['q1', 'momentum-kinetic-energy-confusion', '4.3', 4, 'meTeacher', 'meCourse'],
    ['q2', 'momentum-kinetic-energy-confusion', '4.3', 4, 'meTeacher', 'meCourse'],
  ]);

  // The teacher fixes the answer and regrades: the q2 event goes away.
  const regraded = await gradeSubmissionAnswers(keyed, [{ questionId: 'q1', answer: '4 m/s' }, { questionId: 'q2', answer: 'momentum only' }]);
  expect(await recordMisconceptionEvents(db, { ...ctx, answers: regraded.answers })).toBe(1);
  const after = await db.collection(MISCONCEPTION_EVENTS).where('submissionId', '==', 'meSub1').get();
  expect(after.docs.map((d) => d.data().questionId)).toEqual(['q1']);
});

test('rules: no client, not even the owning teacher, can read or write misconception events', async () => {
  await db.collection(MISCONCEPTION_EVENTS).doc('meProbe').set({ teacherId: 'meTeacher', studentId: 'meStudent', tag: 'other' });
  for (const uid of ['meTeacher', 'meStudent']) {
    const fs_ = env.authenticatedContext(uid).firestore();
    await assertFails(getDoc(doc(fs_, `${MISCONCEPTION_EVENTS}/meProbe`)));
    await assertFails(getDocs(query(collection(fs_, MISCONCEPTION_EVENTS), where('teacherId', '==', 'meTeacher'))));
    await assertFails(setDoc(doc(fs_, `${MISCONCEPTION_EVENTS}/meForged`), { teacherId: 'meTeacher', tag: 'other' }));
  }
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), `${MISCONCEPTION_EVENTS}/meProbe`)));
});
