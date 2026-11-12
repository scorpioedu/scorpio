/**
 * RT-19 / E-007: checkBudget's user-facing contract (messages, lookups, failure modes) and recordUsage.
 * The allow/deny decision table lives in budget-policy.test.ts and budget-characterization.test.ts;
 * this file pins what checkBudget tells the caller and which documents it reads.
 */
const orgs: Record<string, Record<string, unknown> | undefined> = {};
const users: Record<string, Record<string, unknown> | undefined> = {};
const reads: string[] = [];
let dbAvailable = true;
let failReads = false;

jest.mock('../src/lib/firebase-admin', () => ({
  get adminDb() {
    if (!dbAvailable) return null;
    return {
      collection: (name: string) => ({
        doc: (id: string) => ({
          get: async () => {
            reads.push(`${name}/${id}`);
            if (failReads) throw new Error('firestore down');
            const data = (name === 'organizations' ? orgs : users)[id];
            return { exists: data !== undefined, data: () => data };
          },
        }),
      }),
    };
  },
}));

import { checkBudget, recordUsage } from '../src/lib/usage-limit';

const month = new Date().toISOString().slice(0, 7);
const activeFree = { subscriptionStatus: 'active', planId: 'free', aiBudgetLimit: 50, aiUsageCurrent: 0, aiUsageReserved: 0 };
const activePaid = { subscriptionStatus: 'active', planId: 'dept', aiBudgetLimit: 1250, aiUsageCurrent: 0, aiUsageReserved: 0, aiTutorLimitPerStudent: 7, aiNotebookLimitPerStudent: 4 };

beforeEach(() => {
  for (const k of Object.keys(orgs)) delete orgs[k];
  for (const k of Object.keys(users)) delete users[k];
  reads.length = 0;
  dbAvailable = true;
  failReads = false;
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('checkBudget preconditions', () => {
  test.each([[undefined], [null], ['']])('organizationId %p requires a Department License and reads nothing', async id => {
    expect(await checkBudget(id as string | undefined | null, 'grading')).toEqual({ allowed: false, error: 'AI Features require a Department License.' });
    expect(reads).toEqual([]);
  });

  test('no database -> "Database not initialized"', async () => {
    dbAvailable = false;
    expect(await checkBudget('o', 'grading')).toEqual({ allowed: false, error: 'Database not initialized' });
  });

  test('unknown organization -> "Scorpio Network not found." and no user read', async () => {
    expect(await checkBudget('ghost', 'tutor', 'u')).toEqual({ allowed: false, error: 'Scorpio Network not found.' });
    expect(reads).toEqual(['organizations/ghost']);
  });

  test('a Firestore failure fails closed with "System check failed" and is logged', async () => {
    failReads = true;
    expect(await checkBudget('o', 'grading')).toEqual({ allowed: false, error: 'System check failed' });
    expect(console.error).toHaveBeenCalledWith('Error in checkBudget:', expect.any(Error));
  });
});

describe('checkBudget decisions and messages', () => {
  test('an active org under budget is allowed with no error', async () => {
    orgs.o = activeFree;
    expect(await checkBudget('o', 'grading')).toEqual({ allowed: true });
  });

  test.each(['canceled', 'revoked', 'past_due', 'none', undefined])('subscription status %p -> "no longer active"', async status => {
    orgs.o = { ...activePaid, subscriptionStatus: status };
    expect(await checkBudget('o', 'grading')).toEqual({ allowed: false, error: 'Your subscription is no longer active.' });
  });

  test('free plan out of budget points at the Department License upgrade', async () => {
    orgs.o = { ...activeFree, aiUsageCurrent: 50 };
    expect(await checkBudget('o', 'grading')).toEqual({
      allowed: false,
      error: 'Free starter AI budget reached. Upgrade to a Department License in Network settings for unlimited AI access.',
    });
  });

  test('an org with no planId is treated as free in the message', async () => {
    orgs.o = { subscriptionStatus: 'active', aiBudgetLimit: 50, aiUsageCurrent: 50 };
    expect((await checkBudget('o', 'grading')).error).toMatch(/^Free starter AI budget reached/);
  });

  test('paid plan out of budget quotes the limit in dollars', async () => {
    orgs.o = { ...activePaid, aiUsageCurrent: 1250 };
    expect(await checkBudget('o', 'grading')).toEqual({
      allowed: false,
      error: 'Monthly AI budget ($12.50) reached. Please increase your limit in Network settings.',
    });
  });

  test('a paid plan with no budget configured quotes $0.00', async () => {
    orgs.o = { subscriptionStatus: 'active', planId: 'dept' };
    expect((await checkBudget('o', 'grading')).error).toBe('Monthly AI budget ($0.00) reached. Please increase your limit in Network settings.');
  });

  test('reserved spend counts against the budget', async () => {
    orgs.o = { ...activePaid, aiUsageCurrent: 1000, aiUsageReserved: 250 };
    expect((await checkBudget('o', 'grading')).allowed).toBe(false);
  });

  test('a tutor allowance message names the Raise limit', async () => {
    orgs.o = activePaid;
    users.u = { usageMonth: month, tutorUsageCurrent: 7 };
    expect(await checkBudget('o', 'tutor', 'u')).toEqual({
      allowed: false,
      error: 'You have used all 7 of your Raise messages for this period. Contact your teacher to increase your allowance.',
    });
  });

  test('a notebook allowance message names the notebook limit', async () => {
    orgs.o = activePaid;
    users.u = { usageMonth: month, aiNotebookUsageCurrent: 4 };
    expect(await checkBudget('o', 'notebook', 'u')).toEqual({
      allowed: false,
      error: 'You have reached your limit of 4 AI notebook interactions for this period.',
    });
  });

  test('a student under their allowance is allowed; last month\'s usage does not count', async () => {
    orgs.o = activePaid;
    users.u = { usageMonth: month, tutorUsageCurrent: 6 };
    expect((await checkBudget('o', 'tutor', 'u')).allowed).toBe(true);
    users.u = { usageMonth: '1999-01', tutorUsageCurrent: 700 };
    expect((await checkBudget('o', 'tutor', 'u')).allowed).toBe(true);
  });

  test('a student with no user document is not limited per student', async () => {
    orgs.o = activePaid;
    expect((await checkBudget('o', 'tutor', 'missing')).allowed).toBe(true);
  });

  test('per-student allowance applies only to tutor and notebook', async () => {
    orgs.o = activePaid;
    users.u = { usageMonth: month, tutorUsageCurrent: 700, aiNotebookUsageCurrent: 700 };
    expect((await checkBudget('o', 'grading', 'u')).allowed).toBe(true);
    expect((await checkBudget('o', undefined, 'u')).allowed).toBe(true);
  });

  test('the org budget is checked before the per-student allowance', async () => {
    orgs.o = { ...activePaid, aiUsageCurrent: 1250 };
    users.u = { usageMonth: month, tutorUsageCurrent: 7 };
    expect((await checkBudget('o', 'tutor', 'u')).error).toMatch(/^Monthly AI budget/);
  });
});

describe('checkBudget lookups', () => {
  test('without a userId only the organization is read', async () => {
    orgs.o = activePaid;
    await checkBudget('o', 'tutor');
    expect(reads).toEqual(['organizations/o']);
  });

  test('with a userId the organization then the user are read', async () => {
    orgs.o = activePaid;
    users.u = {};
    await checkBudget('o', 'tutor', 'u');
    expect(reads).toEqual(['organizations/o', 'users/u']);
  });
});

describe('recordUsage', () => {
  test('is a no-op that reports success (usage is settled transactionally by the provider call)', async () => {
    expect(await recordUsage('o', 'grading', 100, 50, 'u')).toEqual({ success: true });
    expect(await recordUsage(undefined, 'grading', 0, 0)).toEqual({ success: true });
    expect(reads).toEqual([]);
  });
});
