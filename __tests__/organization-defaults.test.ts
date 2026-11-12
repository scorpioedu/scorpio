import { newOrganizationDefaults } from '../src/lib/organization-defaults';

// Pins today's behaviour (audit G-003). The membership preset differing from register is an
// UNDECIDED owner question, see docs/quality-audit/remediation/HUMAN-TODO.md.
describe('newOrganizationDefaults', () => {
  test("'register' preset: active free network with a 50 cent starter budget", () => {
    expect(newOrganizationDefaults('register')).toEqual({
      planId: 'free', subscriptionStatus: 'active', aiUsageCurrent: 0, aiBudgetLimit: 50, baseMonthlyFee: 0,
    });
  });

  test("'membership' preset: free network with status 'none' and zero budget", () => {
    expect(newOrganizationDefaults('membership')).toEqual({
      planId: 'free', subscriptionStatus: 'none', aiUsageCurrent: 0, aiBudgetLimit: 0,
    });
  });

  test('returns a fresh object each call', () => {
    expect(newOrganizationDefaults('register')).not.toBe(newOrganizationDefaults('register'));
  });
});
