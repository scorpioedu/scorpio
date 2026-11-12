import { mapWithConcurrency, isStuckSubmission, STUCK_AFTER_MS } from '../functions/src/grading-runner';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('mapWithConcurrency', () => {
  test('keeps result order even when later items finish first', async () => {
    const delays = [30, 5, 20, 1, 10];
    const result = await mapWithConcurrency(delays, 3, async (delay, i) => { await sleep(delay); return i; });
    expect(result).toEqual([0, 1, 2, 3, 4]);
  });

  test('never exceeds the concurrency limit', async () => {
    let active = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 10 }, (_, i) => i), 3, async () => { active++; peak = Math.max(peak, active); await sleep(5); active--; });
    expect(peak).toBe(3);
  });

  test('propagates a failure', async () => {
    await expect(mapWithConcurrency([1, 2, 3], 3, async n => { if (n === 2) throw new Error('boom'); return n; })).rejects.toThrow('boom');
  });

  test('handles empty input', async () => {
    expect(await mapWithConcurrency([], 3, async () => 1)).toEqual([]);
  });
});

describe('mapWithConcurrency failure handling', () => {
  test('stops starting new work after a failure and waits for in-flight calls before rejecting', async () => {
    const started: number[] = [];
    let inFlight = 0;
    await expect(mapWithConcurrency([0, 1, 2, 3, 4, 5, 6, 7], 3, async n => {
      started.push(n);
      inFlight++;
      try {
        await sleep(n === 0 ? 5 : 40);
        if (n === 0) throw new Error('first fails');
        return n;
      } finally { inFlight--; }
    })).rejects.toThrow('first fails');
    expect(inFlight).toBe(0);
    expect(started).toEqual([0, 1, 2]);
  });
});

describe('isStuckSubmission', () => {
  const ts = (ms: number) => ({ toMillis: () => ms });
  const now = 10_000_000;
  test('old submitted and ungraded is stuck', () => expect(isStuckSubmission({ status: 'submitted', graded: false, submittedAt: ts(now - STUCK_AFTER_MS - 1) }, now)).toBe(true));
  test('recent submission is not stuck', () => expect(isStuckSubmission({ status: 'submitted', submittedAt: ts(now - 1000) }, now)).toBe(false));
  test('graded or non-submitted is not stuck', () => {
    expect(isStuckSubmission({ status: 'graded', graded: true, submittedAt: ts(0) }, now)).toBe(false);
    expect(isStuckSubmission({ status: 'pending_review', submittedAt: ts(0) }, now)).toBe(false);
  });
  test('missing submittedAt is not stuck', () => expect(isStuckSubmission({ status: 'submitted' }, now)).toBe(false));
});
