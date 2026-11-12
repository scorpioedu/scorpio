import * as admin from 'firebase-admin';
import { processGradingWith, sweepStuckSubmissions, GRADING_LEASE_MS, STUCK_AFTER_MS } from '../../functions/src/grading-runner';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Emulator required');
const app = admin.initializeApp({ projectId: 'demo-scorpio-security' }, 'grading-runner-test');
const db = app.firestore();
afterAll(async () => { await app.delete(); });

const ago = (ms: number) => new Date(Date.now() - ms);
const seed = (id: string, data: Record<string, unknown>) => db.collection('submissions').doc(id).set({ assignmentId: 'a-ai', studentId: 's', graded: false, ...data });

describe('processGradingWith', () => {
  test('rejected grading ends pending_review with the lock deleted', async () => {
    await seed('rej', { status: 'submitted' });
    await processGradingWith(db, 'rej', async () => { throw new Error('model offline'); });
    const sub = (await db.collection('submissions').doc('rej').get()).data()!;
    expect(sub.status).toBe('pending_review');
    expect(sub.graded).toBe(false);
    expect((await db.collection('grading_locks').doc('rej').get()).exists).toBe(false);
  });

  test('grades the freshly read submission, not the trigger snapshot', async () => {
    await seed('fresh', { status: 'submitted', answers: [{ questionId: 'q', answer: 'new' }] });
    const grade = jest.fn(async () => undefined);
    await processGradingWith(db, 'fresh', grade);
    expect(grade).toHaveBeenCalledWith('fresh', expect.objectContaining({ answers: [{ questionId: 'q', answer: 'new' }] }));
  });

  test('lease outlives the 540s timeout by 60s', async () => {
    await seed('lease', { status: 'submitted' });
    let expiresMs = 0;
    await processGradingWith(db, 'lease', async () => { expiresMs = (await db.collection('grading_locks').doc('lease').get()).data()!.expiresAt.toMillis(); });
    expect(GRADING_LEASE_MS).toBe(600000);
    expect(expiresMs - Date.now()).toBeGreaterThan(590000);
    expect(expiresMs - Date.now()).toBeLessThanOrEqual(600000);
  });

  test('a live lease prevents a second run', async () => {
    await seed('held', { status: 'submitted' });
    await db.collection('grading_locks').doc('held').set({ expiresAt: new Date(Date.now() + 60000) });
    const grade = jest.fn(async () => undefined);
    await processGradingWith(db, 'held', grade);
    expect(grade).not.toHaveBeenCalled();
  });
});

describe('sweepStuckSubmissions', () => {
  beforeAll(async () => {
    await db.collection('assignments').doc('a-ai').set({ gradingType: 'ai' });
    await db.collection('assignments').doc('a-manual').set({ gradingType: 'manual' });
    await seed('sw-stuck', { status: 'submitted', submittedAt: ago(STUCK_AFTER_MS + 60000) });
    await db.collection('grading_locks').doc('sw-stuck').set({ expiresAt: ago(1000) });
    await seed('sw-recent', { status: 'submitted', submittedAt: ago(5 * 60000) });
    await seed('sw-manual', { status: 'submitted', submittedAt: ago(STUCK_AFTER_MS + 60000), assignmentId: 'a-manual' });
    await seed('sw-graded', { status: 'graded', graded: true, submittedAt: ago(STUCK_AFTER_MS + 60000) });
  });

  test('moves only old AI-graded submissions to pending_review and clears their lock', async () => {
    const swept = await sweepStuckSubmissions(db);
    expect(swept).toEqual(['sw-stuck']);
    const status = async (id: string) => (await db.collection('submissions').doc(id).get()).data()!.status;
    expect(await status('sw-stuck')).toBe('pending_review');
    expect(await status('sw-recent')).toBe('submitted');
    expect(await status('sw-manual')).toBe('submitted');
    expect(await status('sw-graded')).toBe('graded');
    expect((await db.collection('grading_locks').doc('sw-stuck').get()).exists).toBe(false);
  });

  test('old manual-grading submissions cannot starve AI ones out of the scan', async () => {
    for (const n of [1, 2, 3]) await seed(`st-manual-${n}`, { status: 'submitted', submittedAt: ago(STUCK_AFTER_MS * 10 + n * 1000), assignmentId: 'a-manual' });
    await seed('st-ai', { status: 'submitted', submittedAt: ago(STUCK_AFTER_MS * 5) });
    const swept = await sweepStuckSubmissions(db, Date.now(), { pageSize: 2, maxPages: 5 });
    expect(swept).toEqual(['st-ai']);
  });
});
