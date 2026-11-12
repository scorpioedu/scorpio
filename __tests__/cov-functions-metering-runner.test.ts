// Behavioural tests for functions/src/metering.ts, grading-runner.ts and reservations.ts
// against a small in-memory Firestore fake (no network, no firebase-admin).
import type { firestore } from 'firebase-admin';
import {
  estimateMaximumCost, getActiveTokenRates, releaseStaleReservations, reserveBudget, settleBudget,
  STALE_RESERVATION_MS,
} from '../functions/src/metering';
import {
  GRADING_LEASE_MS, isStuckSubmission, mapWithConcurrency, processGradingWith, STUCK_AFTER_MS, sweepStuckSubmissions,
} from '../functions/src/grading-runner';

type Doc = Record<string, unknown>;

/** Dates read back carry toMillis() like Firestore Timestamps do. */
const shim = (v: unknown): unknown => {
  if (v instanceof Date) return Object.assign(new Date(v.getTime()), { toMillis: () => v.getTime() });
  return v;
};
const present = (d: Doc | undefined): Doc | undefined => (d ? Object.fromEntries(Object.entries(d).map(([k, v]) => [k, shim(v)])) : undefined);
const raw = (v: unknown) => (v instanceof Date ? v.getTime() : v);

class FakeDb {
  store = new Map<string, Doc>();
  failGet = new Set<string>();
  txCount = 0;
  seed(path: string, data: Doc) { this.store.set(path, data); }
  private snap(path: string) {
    const id = path.split('/')[1];
    const data = this.store.get(path);
    return { id, exists: data !== undefined, data: () => present(data), ref: this.docRef(path) };
  }
  docRef(path: string) {
    return {
      path,
      id: path.split('/')[1],
      get: async () => {
        if (this.failGet.has(path)) throw new Error(`read failed ${path}`);
        return this.snap(path);
      },
      update: async (u: Doc) => { this.store.set(path, { ...this.store.get(path), ...u }); },
      delete: async () => { this.store.delete(path); },
    };
  }
  collection(name: string) {
    const build = (filters: Array<[string, string, unknown]>, order: string | undefined, lim: number, after: string | undefined) => ({
      where: (f: string, op: string, v: unknown) => build([...filters, [f, op, v]], order, lim, after),
      orderBy: (f: string) => build(filters, f, lim, after),
      limit: (n: number) => build(filters, order, n, after),
      startAfter: (d: { id: string }) => build(filters, order, lim, d.id),
      get: async () => {
        let entries = [...this.store.entries()].filter(([p]) => p.startsWith(`${name}/`));
        entries = entries.filter(([, d]) => filters.every(([f, op, v]) => (op === '==' ? raw(d[f]) === raw(v) : (raw(d[f]) as number) < (raw(v) as number))));
        if (order) entries.sort((a, b) => (raw(a[1][order]) as number) - (raw(b[1][order]) as number));
        if (after) entries = entries.slice(entries.findIndex(([p]) => p === `${name}/${after}`) + 1);
        entries = entries.slice(0, lim);
        const docs = entries.map(([p]) => this.snap(p));
        return { docs, size: docs.length, empty: docs.length === 0 };
      },
    });
    return { doc: (id: string) => this.docRef(`${name}/${id}`), ...build([], undefined, Infinity, undefined) };
  }
  async runTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    this.txCount++;
    const writes: Array<() => void> = [];
    const tx = {
      get: async (ref: { get: () => Promise<unknown> }) => ref.get(),
      update: (ref: { path: string }, u: Doc) => writes.push(() => {
        if (!this.store.has(ref.path)) throw new Error(`update of missing ${ref.path}`);
        this.store.set(ref.path, { ...this.store.get(ref.path), ...u });
      }),
      set: (ref: { path: string }, d: Doc) => writes.push(() => { this.store.set(ref.path, d); }),
      create: (ref: { path: string }, d: Doc) => writes.push(() => {
        if (this.store.has(ref.path)) throw new Error(`already exists ${ref.path}`);
        this.store.set(ref.path, d);
      }),
      delete: (ref: { path: string }) => writes.push(() => { this.store.delete(ref.path); }),
    };
    const result = await fn(tx);
    writes.forEach(w => w());
    return result;
  }
}

const asDb = (db: FakeDb) => db as unknown as firestore.Firestore;

describe('token rates and cost estimate', () => {
  afterEach(() => jest.useRealTimers());

  test('introductory rates apply through 2026', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-12-31T23:59:59Z'));
    expect(getActiveTokenRates()).toEqual({ input: 0.000075, output: 0.000375 });
  });

  test('standard rates apply from 2027-01-01', () => {
    jest.useFakeTimers().setSystemTime(new Date('2027-01-01T00:00:00Z'));
    expect(getActiveTokenRates()).toEqual({ input: 0.00015, output: 0.00075 });
  });

  test('estimateMaximumCost adds a 1 KiB overhead to the input bytes', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-01T00:00:00Z'));
    expect(estimateMaximumCost(1000, 1024)).toBeCloseTo(2024 * 0.000075 + 1024 * 0.000375, 10);
  });
});

describe('reserveBudget', () => {
  const org = { subscriptionStatus: 'active', aiBudgetLimit: 100, aiUsageCurrent: 10, aiUsageReserved: 5 };

  test.each([
    ['empty organization id', '', 1],
    ['zero cost', 'org1', 0],
    ['negative cost', 'org1', -1],
    ['NaN cost', 'org1', NaN],
    ['infinite cost', 'org1', Infinity],
  ])('rejects %s before touching Firestore', async (_n, orgId, cost) => {
    const db = new FakeDb();
    await expect(reserveBudget(asDb(db), orgId, 'grading', undefined, cost)).rejects.toThrow('Invalid AI budget reservation');
    expect(db.txCount).toBe(0);
  });

  test('creates a pending reservation and raises the organization hold', async () => {
    const db = new FakeDb();
    db.seed('organizations/org1', { ...org });
    const id = await reserveBudget(asDb(db), 'org1', 'grading', undefined, 3);
    expect(db.store.get('organizations/org1')).toMatchObject({ aiUsageReserved: 8 });
    expect(db.store.get(`ai_reservations/${id}`)).toMatchObject({ organizationId: 'org1', userId: null, type: 'grading', maxCost: 3, status: 'pending' });
  });

  test('holds start from zero when the organization has no reserved field', async () => {
    const db = new FakeDb();
    db.seed('organizations/org1', { subscriptionStatus: 'active', aiBudgetLimit: 100 });
    await reserveBudget(asDb(db), 'org1', 'grading', undefined, 2);
    expect(db.store.get('organizations/org1')).toMatchObject({ aiUsageReserved: 2 });
  });

  test.each([
    ['inactive subscription', { ...org, subscriptionStatus: 'canceled' }, 'AI subscription is not active'],
    ['missing organization', undefined, 'AI subscription is not active'],
    ['exhausted budget', { ...org, aiUsageCurrent: 99 }, 'Insufficient AI budget for this request'],
  ])('denies %s and writes nothing', async (_n, orgDoc, message) => {
    const db = new FakeDb();
    if (orgDoc) db.seed('organizations/org1', orgDoc);
    await expect(reserveBudget(asDb(db), 'org1', 'grading', undefined, 3)).rejects.toThrow(message);
    expect([...db.store.keys()].some(k => k.startsWith('ai_reservations/'))).toBe(false);
  });

  test('tutor reservations increment the per-user counter for the current month', async () => {
    const db = new FakeDb();
    const month = new Date().toISOString().slice(0, 7);
    db.seed('organizations/org1', { ...org, aiTutorLimitPerStudent: 5 });
    db.seed('users/u1', { usageMonth: month, tutorUsageCurrent: 2, aiNotebookUsageCurrent: 1 });
    const id = await reserveBudget(asDb(db), 'org1', 'tutor', 'u1', 1);
    expect(db.store.get('users/u1')).toEqual({ usageMonth: month, tutorUsageCurrent: 3, aiNotebookUsageCurrent: 1 });
    expect(db.store.get(`ai_reservations/${id}`)).toMatchObject({ userId: 'u1', type: 'tutor' });
  });

  test('a new month resets both user counters before counting the request', async () => {
    const db = new FakeDb();
    const month = new Date().toISOString().slice(0, 7);
    db.seed('organizations/org1', { ...org, aiNotebookLimitPerStudent: 5 });
    db.seed('users/u1', { usageMonth: '2000-01', tutorUsageCurrent: 9, aiNotebookUsageCurrent: 9 });
    await reserveBudget(asDb(db), 'org1', 'notebook', 'u1', 1);
    expect(db.store.get('users/u1')).toEqual({ usageMonth: month, tutorUsageCurrent: 0, aiNotebookUsageCurrent: 1 });
  });

  test('the per-user allowance denies once reached', async () => {
    const db = new FakeDb();
    const month = new Date().toISOString().slice(0, 7);
    db.seed('organizations/org1', { ...org, aiTutorLimitPerStudent: 2 });
    db.seed('users/u1', { usageMonth: month, tutorUsageCurrent: 2 });
    await expect(reserveBudget(asDb(db), 'org1', 'tutor', 'u1', 1)).rejects.toThrow('Your monthly AI allowance has been reached');
  });

  test('a user id without a stored user doc or without a counter type leaves users untouched', async () => {
    const db = new FakeDb();
    db.seed('organizations/org1', { ...org });
    await reserveBudget(asDb(db), 'org1', 'tutor', 'ghost', 1);
    await reserveBudget(asDb(db), 'org1', 'grading', 'ghost', 1);
    expect(db.store.has('users/ghost')).toBe(false);
  });
});

describe('settleBudget', () => {
  const seedReservation = (db: FakeDb, extra: Doc = {}, orgExtra: Doc = {}) => {
    db.seed('organizations/org1', { aiUsageReserved: 10, aiUsageCurrent: 1, aiUsageTotalCents: 4, ...orgExtra });
    db.seed('ai_reservations/r1', { organizationId: 'org1', userId: 'u1', type: 'grading', maxCost: 6, status: 'pending', ...extra });
  };

  test.each([[-1, 0], [0, -1], [NaN, 1], [1, Infinity]])('rejects invalid usage (%p, %p)', async (i, o) => {
    const db = new FakeDb();
    await expect(settleBudget(asDb(db), 'r1', i, o)).rejects.toThrow('Invalid provider usage');
    expect(db.txCount).toBe(0);
  });

  test('releases the hold, books actual cost, and writes analytics', async () => {
    const db = new FakeDb();
    seedReservation(db);
    await settleBudget(asDb(db), 'r1', 1000, 200);
    const cost = 1000 * 0.000075 + 200 * 0.000375;
    const orgDoc = db.store.get('organizations/org1') as Doc;
    expect(orgDoc.aiUsageReserved).toBe(4);
    expect(orgDoc.aiUsageCurrent as number).toBeCloseTo(1 + cost, 8);
    expect(orgDoc.aiUsageTotalCents as number).toBeCloseTo(4 + cost, 8);
    expect(db.store.get('ai_reservations/r1')).toMatchObject({ status: 'settled' });
    expect(db.store.get('usage_analytics/r1')).toMatchObject({ organizationId: 'org1', userId: 'u1', type: 'grading', inputTokens: 1000, outputTokens: 200 });
    expect(db.store.has('billing_outbox/r1')).toBe(false);
  });

  test('an organization with a Polar customer gets a pending billing outbox row', async () => {
    const db = new FakeDb();
    seedReservation(db, {}, { polarCustomerId: 'cus_1' });
    await settleBudget(asDb(db), 'r1', 1000, 200);
    expect(db.store.get('billing_outbox/r1')).toMatchObject({ customerId: 'cus_1', organizationId: 'org1', status: 'pending', attempts: 0, inputTokens: 1000, outputTokens: 200 });
  });

  test('zero-cost usage creates no outbox row even for Polar customers', async () => {
    const db = new FakeDb();
    seedReservation(db, {}, { polarCustomerId: 'cus_1' });
    await settleBudget(asDb(db), 'r1', 0, 0);
    expect(db.store.has('billing_outbox/r1')).toBe(false);
    expect(db.store.get('ai_reservations/r1')).toMatchObject({ status: 'settled', costCents: 0 });
  });

  test('the organization hold never goes below zero', async () => {
    const db = new FakeDb();
    seedReservation(db, { maxCost: 50 });
    await settleBudget(asDb(db), 'r1', 10, 10);
    expect((db.store.get('organizations/org1') as Doc).aiUsageReserved).toBe(0);
  });

  test('settling a missing or already-settled reservation is a no-op', async () => {
    const db = new FakeDb();
    seedReservation(db, { status: 'settled' });
    await settleBudget(asDb(db), 'r1', 1000, 200);
    await settleBudget(asDb(db), 'missing', 1000, 200);
    expect((db.store.get('organizations/org1') as Doc).aiUsageReserved).toBe(10);
    expect(db.store.has('usage_analytics/r1')).toBe(false);
  });

  test('a missing organization fails the settlement and keeps the reservation pending', async () => {
    const db = new FakeDb();
    db.seed('ai_reservations/r1', { organizationId: 'gone', userId: null, type: 'grading', maxCost: 1, status: 'pending' });
    await expect(settleBudget(asDb(db), 'r1', 1, 1)).rejects.toThrow('Network missing during usage settlement');
    expect(db.store.get('ai_reservations/r1')).toMatchObject({ status: 'pending' });
  });
});

describe('releaseStaleReservations', () => {
  const now = new Date('2026-06-01T12:00:00Z');
  const old = new Date(now.getTime() - STALE_RESERVATION_MS - 1000);
  const fresh = new Date(now.getTime() - 1000);

  test('expires only old pending reservations and releases their holds', async () => {
    const db = new FakeDb();
    db.seed('organizations/org1', { aiUsageReserved: 10 });
    db.seed('ai_reservations/old', { organizationId: 'org1', maxCost: 4, status: 'pending', createdAt: old });
    db.seed('ai_reservations/fresh', { organizationId: 'org1', maxCost: 3, status: 'pending', createdAt: fresh });
    db.seed('ai_reservations/done', { organizationId: 'org1', maxCost: 2, status: 'settled', createdAt: old });
    expect(await releaseStaleReservations(asDb(db), now)).toBe(1);
    expect(db.store.get('ai_reservations/old')).toMatchObject({ status: 'expired' });
    expect(db.store.get('ai_reservations/fresh')).toMatchObject({ status: 'pending' });
    expect((db.store.get('organizations/org1') as Doc).aiUsageReserved).toBe(6);
  });

  test('a stale reservation whose organization is gone is still expired', async () => {
    const db = new FakeDb();
    db.seed('ai_reservations/old', { organizationId: 'gone', maxCost: 4, status: 'pending', createdAt: old });
    expect(await releaseStaleReservations(asDb(db), now)).toBe(1);
    expect(db.store.get('ai_reservations/old')).toMatchObject({ status: 'expired' });
  });

  test('returns 0 when nothing is stale', async () => {
    expect(await releaseStaleReservations(asDb(new FakeDb()), now)).toBe(0);
  });

  test('a reservation settled between the query and the transaction is not counted', async () => {
    const db = new FakeDb();
    db.seed('ai_reservations/old', { organizationId: 'org1', maxCost: 4, status: 'pending', createdAt: old });
    const realRun = db.runTransaction.bind(db);
    db.runTransaction = async fn => {
      db.store.set('ai_reservations/old', { ...(db.store.get('ai_reservations/old') as Doc), status: 'settled' });
      return realRun(fn);
    };
    expect(await releaseStaleReservations(asDb(db), now)).toBe(0);
  });

  test('defaults "now" to the current time', async () => {
    const db = new FakeDb();
    db.seed('organizations/org1', { aiUsageReserved: 1 });
    db.seed('ai_reservations/old', { organizationId: 'org1', maxCost: 1, status: 'pending', createdAt: new Date(Date.now() - STALE_RESERVATION_MS - 5000) });
    expect(await releaseStaleReservations(asDb(db))).toBe(1);
  });
});

describe('expireStaleReservations schedule handler', () => {
  test('it expires stale reservations in the admin firestore when it runs', async () => {
    const db = new FakeDb();
    db.seed('organizations/org1', { aiUsageReserved: 5 });
    db.seed('ai_reservations/old', { organizationId: 'org1', maxCost: 5, status: 'pending', createdAt: new Date(Date.now() - STALE_RESERVATION_MS - 5000) });
    await jest.isolateModulesAsync(async () => {
      jest.doMock(require.resolve('../functions/node_modules/firebase-admin'), () => ({ firestore: () => db }));
      const mod = await import('../functions/src/reservations');
      await (mod.expireStaleReservations as unknown as { run: () => Promise<void> }).run();
    });
    expect(db.store.get('ai_reservations/old')).toMatchObject({ status: 'expired' });
    expect((db.store.get('organizations/org1') as Doc).aiUsageReserved).toBe(0);
  });
});

describe('mapWithConcurrency', () => {
  test('keeps input order and never exceeds the concurrency limit', async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async (n, i) => {
      inFlight++; peak = Math.max(peak, inFlight);
      await new Promise(r => setTimeout(r, 5 - (i % 3)));
      inFlight--;
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50, 60]);
    expect(peak).toBe(2);
  });

  test('an empty list resolves to an empty array', async () => {
    expect(await mapWithConcurrency([], 3, async () => 1)).toEqual([]);
  });

  test('after the first failure no new items start, in-flight work finishes, and the first error is thrown', async () => {
    const started: number[] = [];
    let finished = 0;
    await expect(mapWithConcurrency([0, 1, 2, 3, 4], 2, async n => {
      started.push(n);
      if (n === 0) throw new Error('boom0');
      await new Promise(r => setTimeout(r, 10));
      finished++;
      if (n === 1) throw new Error('boom1');
      return n;
    })).rejects.toThrow('boom0');
    expect(started).toEqual([0, 1]);
    expect(finished).toBe(1);
  });
});

describe('processGradingWith', () => {
  const seedSub = (db: FakeDb, extra: Doc = {}) => db.seed('submissions/s1', { status: 'submitted', graded: false, ...extra });

  test('grades the fresh copy, holds a lease while grading and releases it after', async () => {
    const db = new FakeDb();
    seedSub(db);
    const before = Date.now();
    const grade = jest.fn(async () => {
      const lease = db.store.get('grading_locks/s1') as { expiresAt: Date };
      expect(lease.expiresAt.getTime()).toBeGreaterThanOrEqual(before + GRADING_LEASE_MS);
    });
    await processGradingWith(asDb(db), 's1', grade);
    expect(grade).toHaveBeenCalledWith('s1', expect.objectContaining({ status: 'submitted' }));
    expect(db.store.has('grading_locks/s1')).toBe(false);
  });

  test.each([
    ['missing submission', undefined],
    ['already graded', { status: 'graded', graded: true }],
  ])('%s is skipped without grading', async (_n, sub) => {
    const db = new FakeDb();
    if (sub) db.seed('submissions/s1', sub);
    const grade = jest.fn();
    await processGradingWith(asDb(db), 's1', grade);
    expect(grade).not.toHaveBeenCalled();
  });

  test('a live lease blocks a second run and is left in place', async () => {
    const db = new FakeDb();
    seedSub(db);
    db.seed('grading_locks/s1', { expiresAt: new Date(Date.now() + 60_000) });
    const grade = jest.fn();
    await processGradingWith(asDb(db), 's1', grade);
    expect(grade).not.toHaveBeenCalled();
    expect(db.store.has('grading_locks/s1')).toBe(true);
  });

  test('an expired lease can be taken over', async () => {
    const db = new FakeDb();
    seedSub(db);
    db.seed('grading_locks/s1', { expiresAt: new Date(Date.now() - 1000) });
    const grade = jest.fn(async () => undefined);
    await processGradingWith(asDb(db), 's1', grade);
    expect(grade).toHaveBeenCalledTimes(1);
  });

  test('a grading error routes the submission to teacher review and still releases the lease', async () => {
    const db = new FakeDb();
    seedSub(db);
    await processGradingWith(asDb(db), 's1', async () => { throw new Error('model down'); });
    expect(db.store.get('submissions/s1')).toMatchObject({ graded: false, status: 'pending_review', gradingError: 'AI grading unavailable; teacher review required' });
    expect(db.store.has('grading_locks/s1')).toBe(false);
  });

  test('a non-Error rejection is handled the same way', async () => {
    const db = new FakeDb();
    seedSub(db);
    await processGradingWith(asDb(db), 's1', async () => { throw 'plain string'; });
    expect(db.store.get('submissions/s1')).toMatchObject({ status: 'pending_review' });
  });
});

describe('isStuckSubmission', () => {
  const ts = (ms: number) => ({ toMillis: () => ms });
  const now = 10_000_000_000;

  test('a submitted, ungraded submission older than the threshold is stuck', () => {
    expect(isStuckSubmission({ status: 'submitted', graded: false, submittedAt: ts(now - STUCK_AFTER_MS - 1) }, now)).toBe(true);
  });

  test.each([
    ['undefined', undefined],
    ['wrong status', { status: 'graded', submittedAt: ts(0) }],
    ['already graded', { status: 'submitted', graded: true, submittedAt: ts(0) }],
    ['no submittedAt', { status: 'submitted' }],
    ['submittedAt without toMillis', { status: 'submitted', submittedAt: {} }],
    ['too recent', { status: 'submitted', submittedAt: ts(now - STUCK_AFTER_MS) }],
  ])('%s is not stuck', (_n, sub) => {
    expect(isStuckSubmission(sub, now)).toBe(false);
  });
});

describe('sweepStuckSubmissions', () => {
  const now = new Date('2026-06-01T12:00:00Z').getTime();
  const longAgo = (mins: number) => new Date(now - mins * 60_000);

  test('moves stuck AI submissions to pending_review, clears the lease, and skips manual ones', async () => {
    const db = new FakeDb();
    db.seed('assignments/ai', { gradingType: 'ai' });
    db.seed('assignments/manual', { gradingType: 'manual' });
    db.seed('submissions/a', { status: 'submitted', assignmentId: 'ai', submittedAt: longAgo(60) });
    db.seed('submissions/b', { status: 'submitted', assignmentId: 'manual', submittedAt: longAgo(61) });
    db.seed('submissions/c', { status: 'submitted', assignmentId: 'ai', submittedAt: longAgo(5) });
    db.seed('submissions/d', { status: 'submitted', submittedAt: longAgo(62) });
    db.seed('grading_locks/a', { expiresAt: new Date(now - 1000) });
    expect(await sweepStuckSubmissions(asDb(db), now)).toEqual(['a']);
    expect(db.store.get('submissions/a')).toMatchObject({ status: 'pending_review', graded: false, gradingError: 'AI grading timed out; teacher review required' });
    expect(db.store.has('grading_locks/a')).toBe(false);
    expect(db.store.get('submissions/b')).toMatchObject({ status: 'submitted' });
    expect(db.store.get('submissions/c')).toMatchObject({ status: 'submitted' });
  });

  test('a submission under a live grading lease is left alone', async () => {
    const db = new FakeDb();
    db.seed('assignments/ai', { gradingType: 'ai' });
    db.seed('submissions/a', { status: 'submitted', assignmentId: 'ai', submittedAt: longAgo(60) });
    db.seed('grading_locks/a', { expiresAt: new Date(now + 60_000) });
    expect(await sweepStuckSubmissions(asDb(db), now)).toEqual([]);
    expect(db.store.get('submissions/a')).toMatchObject({ status: 'submitted' });
  });

  test('pages past manual submissions so they cannot starve AI ones', async () => {
    const db = new FakeDb();
    db.seed('assignments/ai', { gradingType: 'ai' });
    db.seed('assignments/manual', { gradingType: 'manual' });
    db.seed('submissions/m1', { status: 'submitted', assignmentId: 'manual', submittedAt: longAgo(100) });
    db.seed('submissions/m2', { status: 'submitted', assignmentId: 'manual', submittedAt: longAgo(90) });
    db.seed('submissions/a', { status: 'submitted', assignmentId: 'ai', submittedAt: longAgo(80) });
    expect(await sweepStuckSubmissions(asDb(db), now, { pageSize: 2, maxPages: 3 })).toEqual(['a']);
  });

  test('maxPages bounds the scan', async () => {
    const db = new FakeDb();
    db.seed('assignments/manual', { gradingType: 'manual' });
    db.seed('assignments/ai', { gradingType: 'ai' });
    db.seed('submissions/m1', { status: 'submitted', assignmentId: 'manual', submittedAt: longAgo(100) });
    db.seed('submissions/m2', { status: 'submitted', assignmentId: 'manual', submittedAt: longAgo(90) });
    db.seed('submissions/a', { status: 'submitted', assignmentId: 'ai', submittedAt: longAgo(80) });
    expect(await sweepStuckSubmissions(asDb(db), now, { pageSize: 2, maxPages: 1 })).toEqual([]);
  });

  test('one failing submission is logged and does not stop the sweep', async () => {
    const db = new FakeDb();
    db.seed('assignments/bad', { gradingType: 'ai' });
    db.seed('assignments/ai', { gradingType: 'ai' });
    db.seed('submissions/x', { status: 'submitted', assignmentId: 'bad', submittedAt: longAgo(100) });
    db.seed('submissions/a', { status: 'submitted', assignmentId: 'ai', submittedAt: longAgo(60) });
    db.failGet.add('assignments/bad');
    expect(await sweepStuckSubmissions(asDb(db), now)).toEqual(['a']);
    expect(db.store.get('submissions/x')).toMatchObject({ status: 'submitted' });
  });

  test('defaults nowMs to the current time', async () => {
    expect(await sweepStuckSubmissions(asDb(new FakeDb()))).toEqual([]);
  });
});
