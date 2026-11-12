import type { firestore } from 'firebase-admin';
import * as logger from 'firebase-functions/logger';

// Deliberately free of runtime firebase-admin imports so the lease/sweep logic can
// run against any Firestore instance (emulator tests, production) without a second
// copy of the SDK's Timestamp class. Dates are accepted by Firestore as timestamps.

export const GRADING_TIMEOUT_SECONDS = 540;
export const GRADING_MEMORY = '1GiB' as const;
export const GRADING_CONCURRENCY = 3;
// Lease outlives the platform timeout so a live run can never lose its lock to a second run.
export const GRADING_LEASE_MS = (GRADING_TIMEOUT_SECONDS + 60) * 1000;
export const STUCK_AFTER_MS = 20 * 60 * 1000;
export const SWEEP_BATCH_SIZE = 200;
const FAILURE_MESSAGE = 'AI grading unavailable; teacher review required';

export type SubmissionData = firestore.DocumentData;

/** Runs `fn` over `items` with at most `limit` in flight; results keep input order. */
export async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}

/**
 * Acquires the grading lease, re-reads the submission inside the transaction and grades the
 * fresh copy. Any failure routes the submission to teacher review; the lease is always released.
 */
export async function processGradingWith(
  db: firestore.Firestore,
  submissionId: string,
  grade: (submissionId: string, submission: SubmissionData) => Promise<void>,
): Promise<void> {
  const ref = db.collection('submissions').doc(submissionId);
  const lease = db.collection('grading_locks').doc(submissionId);
  const current = await db.runTransaction(async tx => {
    const data = (await tx.get(ref)).data();
    const lock = (await tx.get(lease)).data();
    if (!data || data.graded || (lock?.expiresAt?.toMillis() || 0) > Date.now()) return null;
    tx.set(lease, { expiresAt: new Date(Date.now() + GRADING_LEASE_MS) });
    return data;
  });
  if (!current) return;
  try {
    await grade(submissionId, current);
  } catch (error) {
    logger.error('Grading failed; routing to teacher review', { submissionId, error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error) });
    await ref.update({ graded: false, status: 'pending_review', gradingError: FAILURE_MESSAGE });
  } finally {
    await lease.delete();
  }
}

/** True when an AI-graded submission has sat in `submitted` past the stuck threshold. */
export function isStuckSubmission(submission: SubmissionData | undefined, nowMs: number): boolean {
  if (!submission || submission.status !== 'submitted' || submission.graded) return false;
  const submittedMs: number | undefined = submission.submittedAt?.toMillis?.();
  return submittedMs !== undefined && nowMs - submittedMs > STUCK_AFTER_MS;
}

/**
 * Moves AI-graded submissions stuck in `submitted` (e.g. after a platform timeout) to
 * `pending_review`. Manually graded assignments legitimately stay `submitted`, so they are skipped.
 * Returns the ids that were moved.
 */
export async function sweepStuckSubmissions(db: firestore.Firestore, nowMs: number = Date.now()): Promise<string[]> {
  const cutoff = new Date(nowMs - STUCK_AFTER_MS);
  const candidates = await db.collection('submissions')
    .where('status', '==', 'submitted')
    .where('submittedAt', '<', cutoff)
    .limit(SWEEP_BATCH_SIZE)
    .get();
  const aiAssignment = new Map<string, boolean>();
  const swept: string[] = [];
  for (const doc of candidates.docs) {
    try {
      const assignmentId: unknown = doc.data().assignmentId;
      if (typeof assignmentId !== 'string' || !assignmentId) continue;
      if (!aiAssignment.has(assignmentId)) {
        const snap = await db.collection('assignments').doc(assignmentId).get();
        aiAssignment.set(assignmentId, snap.data()?.gradingType === 'ai');
      }
      if (!aiAssignment.get(assignmentId)) continue;
      const lease = db.collection('grading_locks').doc(doc.id);
      const moved = await db.runTransaction(async tx => {
        const fresh = (await tx.get(doc.ref)).data();
        const lock = (await tx.get(lease)).data();
        if (!isStuckSubmission(fresh, nowMs) || (lock?.expiresAt?.toMillis() || 0) > nowMs) return false;
        tx.update(doc.ref, { graded: false, status: 'pending_review', gradingError: 'AI grading timed out; teacher review required' });
        tx.delete(lease);
        return true;
      });
      if (moved) swept.push(doc.id);
    } catch (error) {
      logger.error('Failed to sweep stuck submission', { submissionId: doc.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  if (swept.length > 0) logger.warn('Moved stuck submissions to pending_review', { count: swept.length, submissionIds: swept });
  return swept;
}
