/** In-memory stand-in for the slice of Firestore that checkRateLimit uses (collection/doc, runTransaction). */
export interface FakeDb {
  docs: Map<string, Record<string, unknown>>;
  /** When set, runTransaction rejects with this error (simulates a Firestore outage). */
  failWith: Error | null;
  transactions: number;
  collection: (name: string) => { doc: (id: string) => { _path: string } };
  runTransaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>;
}

export function createFakeDb(): FakeDb {
  let queue: Promise<void> = Promise.resolve();
  const db: FakeDb = {
    docs: new Map(),
    failWith: null,
    transactions: 0,
    collection: (name) => ({ doc: (id) => ({ _path: `${name}/${id}` }) }),
    // Firestore retries contended transactions, which is equivalent to running them one at a time.
    runTransaction: (fn) => {
      const run = async () => {
        db.transactions++;
        if (db.failWith) throw db.failWith;
        return fn({
          get: async (ref: { _path: string }) => {
            const data = db.docs.get(ref._path);
            return { exists: data !== undefined, data: () => data };
          },
          set: (ref: { _path: string }, value: Record<string, unknown>) => {
            db.docs.set(ref._path, {
              ...(db.docs.get(ref._path) ?? {}),
              ...value,
            });
          },
        });
      };
      const result = queue.then(run, run);
      queue = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };
  return db;
}
