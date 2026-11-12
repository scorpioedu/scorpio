/**
 * RT-21 characterization: pins the decisions of checkBudget (pre-check) and reserveBudget (enforcement)
 * across the status/plan/budget table, including where the two diverge.
 */
const orgs: Record<string, Record<string, unknown> | undefined> = {};
const users: Record<string, Record<string, unknown> | undefined> = {};

jest.mock('../src/lib/firebase-admin', () => ({
  adminDb: {
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => {
          const data = (name === 'organizations' ? orgs : users)[id];
          return { exists: data !== undefined, data: () => data };
        },
      }),
    }),
  },
}));

import { checkBudget } from '../src/lib/usage-limit';
import { reserveBudget } from '../functions/src/metering';

/** Minimal Firestore double for reserveBudget's single transaction. */
function fakeDb() {
  const ref = (col: string, id: string) => ({ col, id });
  return {
    collection: (col: string) => ({ doc: (id: string = 'new') => ref(col, id) }),
    runTransaction: async (fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        get: async (r: { col: string; id: string }) => ({ data: () => (r.col === 'organizations' ? orgs : users)[r.id] }),
        update: () => undefined,
        create: () => undefined,
      };
      await fn(tx);
    },
  } as never;
}

const month = new Date().toISOString().slice(0, 7);
const preCheck = async (org: Record<string, unknown> | undefined, type?: string, user?: Record<string, unknown>) => {
  orgs.o = org;
  users.u = user;
  return (await checkBudget('o', type, user ? 'u' : undefined)).allowed;
};
const reserve = async (org: Record<string, unknown> | undefined, type = 'grading', user?: Record<string, unknown>, cost = 1) => {
  orgs.o = org;
  users.u = user;
  try {
    await reserveBudget(fakeDb(), 'o', type, user ? 'u' : undefined, cost);
    return true;
  } catch {
    return false;
  }
};

const base = { subscriptionStatus: 'active', planId: 'free', aiBudgetLimit: 50, aiUsageCurrent: 0, aiUsageReserved: 0 };

describe('subscription status (same in both callers)', () => {
  test.each([
    ['active', true],
    ['trialing', true],
    ['canceled', false],
    ['revoked', false],
    ['past_due', false],
    ['none', false],
    [undefined, false],
  ])('status %s -> allowed=%s', async (status, expected) => {
    const org = { ...base, subscriptionStatus: status };
    expect(await preCheck(org)).toBe(expected);
    expect(await reserve(org)).toBe(expected);
  });

  test('missing organization is rejected by both', async () => {
    expect(await preCheck(undefined)).toBe(false);
    expect(await reserve(undefined)).toBe(false);
  });
});

describe('budget table', () => {
  // [label, org overrides, checkBudget, reserveBudget(cost 1)]
  test.each<[string, Record<string, unknown>, boolean, boolean]>([
    ['free, 50c limit, unused', {}, true, true],
    ['free, limit 0 (membership default)', { aiBudgetLimit: 0 }, false, false],
    ['free, usage at limit', { aiUsageCurrent: 50 }, false, false],
    ['free, reserved counts towards limit', { aiUsageCurrent: 20, aiUsageReserved: 30 }, false, false],
    ['free, limit 500 above the 50c cap, usage 100', { aiBudgetLimit: 500, aiUsageCurrent: 100 }, false, false], // RT-21: pre-check was true, now matches enforcement
    ['free, limit 500, usage 10', { aiBudgetLimit: 500, aiUsageCurrent: 10 }, true, true],
    ['paid, limit 1000, unused', { planId: 'dept', aiBudgetLimit: 1000 }, true, true],
    ['paid, usage at limit', { planId: 'dept', aiBudgetLimit: 1000, aiUsageCurrent: 1000 }, false, false],
    ['paid, limit 0 (pre-check used to treat as unlimited)', { planId: 'dept', aiBudgetLimit: 0 }, false, false], // RT-21: pre-check was true, now matches enforcement
    ['no planId, limit 0', { planId: undefined, aiBudgetLimit: 0 }, false, false],
    ['no planId, limit 1000, usage 100 (pre-check treats as free, reserve as paid)', { planId: undefined, aiBudgetLimit: 1000, aiUsageCurrent: 100 }, true, true],
    ['no planId, limit 1000, usage 999.5 and cost 1', { planId: undefined, aiBudgetLimit: 1000, aiUsageCurrent: 999.5 }, true, false], // DIVERGES (cost-aware)
  ])('%s', async (_label, overrides, pre, res) => {
    const org = { ...base, ...overrides };
    expect(await preCheck(org)).toBe(pre);
    expect(await reserve(org)).toBe(res);
  });
});

describe('per-user limits', () => {
  const org = { ...base, planId: 'dept', aiBudgetLimit: 10000, aiTutorLimitPerStudent: 5, aiNotebookLimitPerStudent: 3 };
  test.each<[string, string, Record<string, unknown> | undefined, boolean]>([
    ['tutor under allowance', 'tutor', { usageMonth: month, tutorUsageCurrent: 4 }, true],
    ['tutor at allowance', 'tutor', { usageMonth: month, tutorUsageCurrent: 5 }, false],
    ['tutor at allowance but stale month', 'tutor', { usageMonth: '2000-01', tutorUsageCurrent: 5 }, true],
    ['notebook under allowance', 'notebook', { usageMonth: month, aiNotebookUsageCurrent: 2 }, true],
    ['notebook at allowance', 'notebook', { usageMonth: month, aiNotebookUsageCurrent: 3 }, false],
    ['notebook limit ignores tutor counter', 'notebook', { usageMonth: month, tutorUsageCurrent: 99 }, true],
    ['grading ignores per-user limits', 'grading', { usageMonth: month, tutorUsageCurrent: 99 }, true],
  ])('%s', async (_label, type, user, expected) => {
    expect(await preCheck(org, type, user)).toBe(expected);
    expect(await reserve(org, type, user)).toBe(expected);
  });

  test('allowance 0 means unlimited per student', async () => {
    const open = { ...org, aiTutorLimitPerStudent: 0 };
    const user = { usageMonth: month, tutorUsageCurrent: 1000 };
    expect(await preCheck(open, 'tutor', user)).toBe(true);
    expect(await reserve(open, 'tutor', user)).toBe(true);
  });
});
