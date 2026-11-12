/** In-memory Firestore double for the Polar webhook route: documents plus a log of every write. */
export interface FakeBillingDb {
  docs: Record<string, Record<string, unknown> | undefined>;
  writes: string[];
  failTransaction: boolean;
  db: {
    collection: (name: string) => { doc: (id: string) => { path: string } };
    runTransaction: (fn: (tx: unknown) => Promise<void>) => Promise<void>;
  };
}

export function createFakeBillingDb(): FakeBillingDb {
  const state: FakeBillingDb = {
    docs: {},
    writes: [],
    failTransaction: false,
    db: {
      collection: (name: string) => ({ doc: (id: string) => ({ path: `${name}/${id}` }) }),
      runTransaction: async fn => {
        if (state.failTransaction) throw new Error('transaction aborted');
        const tx = {
          get: async (ref: { path: string }) => ({ exists: state.docs[ref.path] !== undefined, data: () => state.docs[ref.path] }),
          update: (ref: { path: string }, data: Record<string, unknown>) => {
            state.writes.push(`update ${ref.path}`);
            state.docs[ref.path] = { ...state.docs[ref.path], ...data };
          },
          create: (ref: { path: string }, data: Record<string, unknown>) => {
            state.writes.push(`create ${ref.path}`);
            state.docs[ref.path] = data;
          },
        };
        await fn(tx);
      },
    },
  };
  return state;
}
