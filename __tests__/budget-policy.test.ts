import { evaluateBudget } from '../functions/src/budget-policy';

const MONTH = '2026-11';
const base = { subscriptionStatus: 'active', planId: 'free', aiBudgetLimit: 50, aiUsageCurrent: 0, aiUsageReserved: 0 };
const reason = (d: ReturnType<typeof evaluateBudget>) => (d.allowed ? 'allowed' : d.reason);

describe('evaluateBudget subscription status', () => {
  test.each([
    ['active', 'allowed'],
    ['trialing', 'allowed'],
    ['canceled', 'subscription_inactive'],
    ['revoked', 'subscription_inactive'],
    ['past_due', 'subscription_inactive'],
    ['none', 'subscription_inactive'],
    [undefined, 'subscription_inactive'],
  ])('%s -> %s', (status, expected) => {
    expect(reason(evaluateBudget({ ...base, subscriptionStatus: status }, null, 'grading', 1, MONTH))).toBe(expected);
  });

  test.each([[null], [undefined]])('missing org (%s) is inactive', org => {
    expect(reason(evaluateBudget(org, null, 'grading', 1, MONTH))).toBe('subscription_inactive');
  });
});

describe('evaluateBudget org budget', () => {
  test.each<[string, Record<string, unknown>, number, string]>([
    ['free within 50c', {}, 1, 'allowed'],
    ['free: cost would exceed limit', { aiUsageCurrent: 49.5 }, 1, 'budget_exhausted'],
    ['free: cost exactly reaches limit', { aiUsageCurrent: 49 }, 1, 'allowed'],
    ['free: reserved counts', { aiUsageCurrent: 25, aiUsageReserved: 25 }, 0, 'budget_exhausted'],
    ['free: zero limit', { aiBudgetLimit: 0 }, 0, 'budget_exhausted'],
    ['free: configured limit capped at 50c', { aiBudgetLimit: 500, aiUsageCurrent: 50 }, 0, 'budget_exhausted'],
    ['paid: uses configured limit', { planId: 'dept', aiBudgetLimit: 500, aiUsageCurrent: 100 }, 1, 'allowed'],
    ['paid: exhausted', { planId: 'dept', aiBudgetLimit: 500, aiUsageCurrent: 500 }, 0, 'budget_exhausted'],
    ['paid: zero limit is not unlimited', { planId: 'dept', aiBudgetLimit: 0 }, 0, 'budget_exhausted'],
    ['no planId is not capped at 50c', { planId: undefined, aiBudgetLimit: 500, aiUsageCurrent: 100 }, 1, 'allowed'],
    ['pre-check (cost 0) just under limit', { aiUsageCurrent: 49.9 }, 0, 'allowed'],
  ])('%s', (_label, overrides, cost, expected) => {
    expect(reason(evaluateBudget({ ...base, ...overrides }, null, 'grading', cost, MONTH))).toBe(expected);
  });
});

describe('evaluateBudget per-user limits', () => {
  const org = { ...base, planId: 'dept', aiBudgetLimit: 10000, aiTutorLimitPerStudent: 5, aiNotebookLimitPerStudent: 3 };
  test.each<[string, string, Record<string, unknown> | null, string]>([
    ['tutor under', 'tutor', { usageMonth: MONTH, tutorUsageCurrent: 4 }, 'allowed'],
    ['tutor at limit', 'tutor', { usageMonth: MONTH, tutorUsageCurrent: 5 }, 'user_allowance_reached'],
    ['tutor stale month resets', 'tutor', { usageMonth: '2026-10', tutorUsageCurrent: 5 }, 'allowed'],
    ['notebook at limit', 'notebook', { usageMonth: MONTH, aiNotebookUsageCurrent: 3 }, 'user_allowance_reached'],
    ['notebook ignores tutor counter', 'notebook', { usageMonth: MONTH, tutorUsageCurrent: 99 }, 'allowed'],
    ['other types have no per-user limit', 'grading', { usageMonth: MONTH, tutorUsageCurrent: 99 }, 'allowed'],
    ['no user doc', 'tutor', null, 'allowed'],
  ])('%s', (_label, type, user, expected) => {
    expect(reason(evaluateBudget(org, user, type, 1, MONTH))).toBe(expected);
  });

  test('allowance 0 is unlimited per student', () => {
    expect(reason(evaluateBudget({ ...org, aiTutorLimitPerStudent: 0 }, { usageMonth: MONTH, tutorUsageCurrent: 999 }, 'tutor', 1, MONTH))).toBe('allowed');
  });
});
