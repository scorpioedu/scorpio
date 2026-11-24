/**
 * RT-21 characterization: pins the decisions of checkBudget (pre-check) and reserveBudget (enforcement)
 * across the credit-balance table (free allowance, bonus, paid, reserved, monthly cap), including where the two diverge.
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

const past = new Date(Date.now() - 86400e3).toISOString();
const future = new Date(Date.now() + 86400e3 * 30).toISOString();
// A network with no spend yet: the free $1 for this month is untouched.
const base = { aiFreeMonth: month, aiFreeUsedCents: 0, aiUsageReserved: 0 };

describe('network lookup (same in both callers)', () => {
  test('missing organization is rejected by both', async () => {
    expect(await preCheck(undefined)).toBe(false);
    expect(await reserve(undefined)).toBe(false);
  });

  test('no organization id is rejected by the pre-check', async () => {
    expect((await checkBudget(undefined)).allowed).toBe(false);
    expect((await checkBudget(null)).allowed).toBe(false);
  });

  test('subscription status and plan no longer matter', async () => {
    for (const org of [
      { ...base, subscriptionStatus: 'canceled', planId: 'free' },
      { ...base, subscriptionStatus: undefined, planId: 'department_network' },
    ]) {
      expect(await preCheck(org)).toBe(true);
      expect(await reserve(org)).toBe(true);
    }
  });
});

describe('balance table', () => {
  // [label, org overrides, checkBudget, reserveBudget(cost 1)]
  test.each<[string, Record<string, unknown>, boolean, boolean]>([
    ['free allowance only, unused', {}, true, true],
    ['free allowance only, new month (stale free counter)', { aiFreeMonth: '2000-01', aiFreeUsedCents: 100 }, true, true],
    ['free allowance partly used', { aiFreeUsedCents: 60 }, true, true],
    ['free allowance used up, nothing else', { aiFreeUsedCents: 100 }, false, false],
    ['free used up, unexpired bonus', { aiFreeUsedCents: 100, aiBonusCents: 500, aiBonusExpiresAt: future }, true, true],
    ['free used up, bonus with no expiry', { aiFreeUsedCents: 100, aiBonusCents: 500 }, true, true],
    ['free used up, bonus expired', { aiFreeUsedCents: 100, aiBonusCents: 500, aiBonusExpiresAt: past }, false, false],
    ['free used up, paid balance', { aiFreeUsedCents: 100, aiPaidCents: 300 }, true, true],
    ['free used up, paid negative after refund', { aiFreeUsedCents: 100, aiPaidCents: -50 }, false, false],
    ['free left but paid negative after refund covers it', { aiFreeUsedCents: 50, aiPaidCents: -50 }, false, false],
    ['free left, paid slightly negative', { aiFreeUsedCents: 0, aiPaidCents: -40 }, true, true],
    ['reserved counts: everything reserved', { aiFreeUsedCents: 100, aiPaidCents: 200, aiUsageReserved: 200 }, false, false],
    ['reserved counts: some still available', { aiFreeUsedCents: 100, aiPaidCents: 200, aiUsageReserved: 150 }, true, true],
    ['reserved counts: free allowance fully reserved', { aiUsageReserved: 100 }, false, false],
    ['available 0.5c, cost 1', { aiFreeUsedCents: 99.5 }, true, false], // DIVERGES (cost-aware)
    ['monthly cap not reached', { aiPaidCents: 1000, aiBudgetLimit: 500, aiUsageMonth: month, aiUsageCurrent: 100 }, true, true],
    ['monthly cap reached (over it)', { aiPaidCents: 1000, aiBudgetLimit: 500, aiUsageMonth: month, aiUsageCurrent: 501 }, false, false],
    ['monthly cap hit exactly: both refuse (pre-check treats spend at the cap as reached)', { aiPaidCents: 1000, aiBudgetLimit: 500, aiUsageMonth: month, aiUsageCurrent: 500 }, false, false],
    ['monthly cap: reserved counts', { aiPaidCents: 1000, aiBudgetLimit: 500, aiUsageMonth: month, aiUsageCurrent: 400, aiUsageReserved: 101 }, false, false],
    ['monthly cap: last cent is cost-aware', { aiPaidCents: 1000, aiBudgetLimit: 500, aiUsageMonth: month, aiUsageCurrent: 499.5 }, true, false], // DIVERGES (cost-aware)
    ['monthly cap: stale usage month is ignored', { aiPaidCents: 1000, aiBudgetLimit: 500, aiUsageMonth: '2000-01', aiUsageCurrent: 500 }, true, true],
    ['monthly cap 0 means no cap', { aiPaidCents: 1000, aiBudgetLimit: 0, aiUsageMonth: month, aiUsageCurrent: 99999 }, true, true],
  ])('%s', async (_label, overrides, pre, res) => {
    const org = { ...base, ...overrides };
    expect(await preCheck(org)).toBe(pre);
    expect(await reserve(org)).toBe(res);
  });
});

describe('per-user limits', () => {
  const org = { ...base, aiPaidCents: 10000, aiTutorLimitPerStudent: 5, aiNotebookLimitPerStudent: 3 };
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
