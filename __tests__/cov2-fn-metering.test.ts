// Edge-case behaviour of functions/src/metering.ts: organization documents with no usage counters yet and
// stale reservations whose organization has been deleted. In-memory Firestore fake; no network.
import type { firestore } from 'firebase-admin';
import { releaseStaleReservations, settleBudget, getActiveTokenRates } from '../functions/src/metering';

type Doc = Record<string, unknown>;

class FakeDb {
  store = new Map<string, Doc>();
  seed(path: string, data: Doc) { this.store.set(path, data); }
  private snap(path: string) {
    const data = this.store.get(path);
    return { id: path.split('/')[1], data: () => data };
  }
  collection(name: string) {
    const ref = (id: string) => ({ path: `${name}/${id}` });
    return {
      doc: ref,
      where() { return this; },
      limit() { return this; },
    };
  }
  async runTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    const writes: Array<() => void> = [];
    const tx = {
      get: async (ref: { path: string }) => this.snap(ref.path),
      update: (ref: { path: string }, u: Doc) => writes.push(() => { this.store.set(ref.path, { ...this.store.get(ref.path), ...u }); }),
      create: (ref: { path: string }, d: Doc) => writes.push(() => { this.store.set(ref.path, d); }),
    };
    const result = await fn(tx);
    writes.forEach(w => w());
    return result;
  }
}

/** Fake whose reservations query returns the pending reservations older than the cutoff, once. */
class StaleDb extends FakeDb {
  collection(name: string) {
    const base = super.collection(name);
    if (name !== 'ai_reservations') return base;
    let served = false;
    const query = {
      doc: base.doc,
      where: () => query,
      limit: () => query,
      get: async () => {
        const docs = served ? [] : [...this.store.entries()].filter(([p, d]) => p.startsWith('ai_reservations/') && d.status === 'pending')
          .map(([p]) => ({ id: p.split('/')[1] }));
        served = true;
        return { docs, size: docs.length, empty: docs.length === 0 };
      },
    };
    return query;
  }
}

const asDb = (db: FakeDb) => db as unknown as firestore.Firestore;

describe('settleBudget with an organization that has no counters yet', () => {
  it('starts every counter from zero and never lets the reserved hold go negative', async () => {
    const db = new FakeDb();
    db.seed('organizations/org1', { subscriptionStatus: 'active' });
    db.seed('ai_reservations/r1', { organizationId: 'org1', userId: 'u1', type: 'grading', maxCost: 0.5, status: 'pending' });
    await settleBudget(asDb(db), 'r1', 1000, 100);
    const cost = 1000 * getActiveTokenRates().input + 100 * getActiveTokenRates().output;
    const org = db.store.get('organizations/org1') as Doc;
    expect(org.aiUsageReserved).toBe(0);
    expect(org.aiUsageCurrent as number).toBeCloseTo(cost, 10);
    expect(org.aiUsageTotalCents as number).toBeCloseTo(cost, 10);
    expect(db.store.get('ai_reservations/r1')).toMatchObject({ status: 'settled' });
    expect(db.store.has('billing_outbox/r1')).toBe(false);
  });

  it('never queues a billing outbox row, and releases each hold', async () => {
    const db = new FakeDb();
    db.seed('organizations/org1', { polarCustomerId: 'cus_1', aiUsageReserved: 1 });
    db.seed('ai_reservations/r1', { organizationId: 'org1', type: 'grading', maxCost: 0.5, status: 'pending' });
    db.seed('ai_reservations/r2', { organizationId: 'org1', type: 'grading', maxCost: 0.25, status: 'pending' });
    await settleBudget(asDb(db), 'r1', 0, 0);
    await settleBudget(asDb(db), 'r2', 10, 10);
    expect(db.store.has('billing_outbox/r1')).toBe(false);
    expect(db.store.has('billing_outbox/r2')).toBe(false);
    expect((db.store.get('organizations/org1') as Doc).aiUsageReserved).toBe(0.25);
  });

  it('rejects settlement when the organization is gone and leaves the reservation pending', async () => {
    const db = new FakeDb();
    db.seed('ai_reservations/r1', { organizationId: 'gone', type: 'grading', maxCost: 0.5, status: 'pending' });
    await expect(settleBudget(asDb(db), 'r1', 1, 1)).rejects.toThrow('Network missing during usage settlement');
    expect(db.store.get('ai_reservations/r1')).toMatchObject({ status: 'pending' });
  });
});

describe('releaseStaleReservations edge cases', () => {
  it('expires a reservation whose organization no longer exists without touching other documents', async () => {
    const db = new StaleDb();
    db.seed('ai_reservations/r1', { organizationId: 'gone', maxCost: 1, status: 'pending' });
    expect(await releaseStaleReservations(asDb(db))).toBe(1);
    expect(db.store.get('ai_reservations/r1')).toMatchObject({ status: 'expired' });
    expect(db.store.has('organizations/gone')).toBe(false);
  });

  it('floors an organization with no reserved counter at zero', async () => {
    const db = new StaleDb();
    db.seed('organizations/org1', { subscriptionStatus: 'active' });
    db.seed('ai_reservations/r1', { organizationId: 'org1', maxCost: 2, status: 'pending' });
    expect(await releaseStaleReservations(asDb(db))).toBe(1);
    expect((db.store.get('organizations/org1') as Doc).aiUsageReserved).toBe(0);
  });

  it('skips a reservation that was settled between the query and the transaction', async () => {
    const db = new StaleDb();
    db.seed('ai_reservations/r1', { organizationId: 'org1', maxCost: 2, status: 'pending' });
    const original = db.runTransaction.bind(db);
    db.runTransaction = async fn => {
      db.store.set('ai_reservations/r1', { organizationId: 'org1', maxCost: 2, status: 'settled' });
      return original(fn);
    };
    expect(await releaseStaleReservations(asDb(db))).toBe(0);
    expect(db.store.get('ai_reservations/r1')).toMatchObject({ status: 'settled' });
  });
});
