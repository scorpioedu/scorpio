// The seeded-waypoint leak: answers stored inline on global assignment docs are readable by any
// teacher through the client SDK. tools/answer-key-migration.cjs moves them to assignment_keys.
import * as admin from 'firebase-admin';
import fs from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { migrateAnswerKeys } = require('../../tools/answer-key-migration.cjs');

let env: RulesTestEnvironment;
let db: admin.firestore.Firestore;
const documentId = admin.firestore.FieldPath.documentId();
const SEEDED = {
  teacherId: 'system-seed', visibility: 'global', title: 'Seeded kinematics',
  questions: [
    { type: 'multiple-choice', text: 'Area under v-t?', options: ['Acceleration', 'Displacement'], answer: 'MIG-SECRET-MC' },
    { type: 'numerical', text: 'Final velocity?', answer: 'MIG-SECRET-18 m/s' },
  ],
};

beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Emulator required');
  if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-scorpio-security' });
  db = admin.firestore();
  env = await initializeTestEnvironment({ projectId: 'demo-scorpio-security', firestore: {
    host: '127.0.0.1', port: Number((process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8188').split(':').pop()),
    rules: fs.readFileSync('firestore.rules', 'utf8') } });
  await db.collection('users').doc('migTeacher').set({ role: 'teacher', organizationId: 'migOrg' });
  await db.collection('assignments').doc('migSeeded').set(SEEDED);
  await db.collection('assignments').doc('migClean').set({ teacherId: 'migTeacher', visibility: 'private', answerKeySeparated: true, rubric: null, questions: [{ id: 'a', text: 'x', type: 'text' }] });
});
afterAll(async () => {
  await env.cleanup();
  await Promise.all(admin.apps.filter(Boolean).map(app => app!.delete()));
});

const teacherRead = (path: string) => getDoc(doc(env.authenticatedContext('migTeacher').firestore(), path));

test('before migration, any teacher can read seeded answers straight from the assignment doc', async () => {
  const snap = await assertSucceeds(teacherRead('assignments/migSeeded'));
  expect(JSON.stringify(snap.data())).toContain('MIG-SECRET');
});

test('a dry run reports the leaking doc and writes nothing', async () => {
  const ids = await migrateAnswerKeys(db, { documentId });
  expect(ids).toContain('migSeeded');
  expect(ids).not.toContain('migClean');
  expect((await db.collection('assignment_keys').doc('migSeeded').get()).exists).toBe(false);
  expect(JSON.stringify((await db.collection('assignments').doc('migSeeded').get()).data())).toContain('MIG-SECRET');
});

test('after --apply the answers are only in the owner-only key, and a second run is a no-op', async () => {
  const ids = await migrateAnswerKeys(db, { apply: true, documentId, pageSize: 1 });
  expect(ids).toContain('migSeeded');

  const publicDoc = (await assertSucceeds(teacherRead('assignments/migSeeded'))).data();
  expect(JSON.stringify(publicDoc)).not.toContain('MIG-SECRET');
  expect(publicDoc).toMatchObject({ answerKeySeparated: true, rubric: null });
  expect(publicDoc!.questions.map((q: { id: string; type: string }) => [q.id, q.type])).toEqual([['q1', 'multiple-choice'], ['q2', 'numeric']]);

  await assertFails(teacherRead('assignment_keys/migSeeded'));
  const key = (await db.collection('assignment_keys').doc('migSeeded').get()).data();
  expect(key).toEqual({ answers: { q1: 'MIG-SECRET-MC', q2: 'MIG-SECRET-18 m/s' }, rubric: '', teacherId: 'system-seed' });

  expect(await migrateAnswerKeys(db, { apply: true, documentId })).not.toContain('migSeeded');
});
