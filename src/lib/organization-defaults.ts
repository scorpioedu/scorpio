/**
 * Initial fields for a newly created organization document, per creation path.
 *
 * KNOWN DIVERGENCE (audit G-003, RT-21): the two paths intentionally still differ.
 *  - 'register'   (/api/auth/register):                  'active' with a 50 cent starter AI budget.
 *  - 'membership' (/api/teacher/network/membership):     'none' with a 0 budget, so AI is refused
 *    (evaluateBudget treats a non-active status or a zero limit as no spend).
 * The owner has not decided what a newly created free network should get. To align them, change
 * the 'membership' preset below (one line each) and update __tests__/organization-defaults.test.ts.
 * See docs/quality-audit/remediation/HUMAN-TODO.md.
 */
export type OrganizationCreationPath = 'register' | 'membership';

const PRESETS = {
  register: { planId: 'free', subscriptionStatus: 'active', aiUsageCurrent: 0, aiBudgetLimit: 50, baseMonthlyFee: 0 },
  membership: { planId: 'free', subscriptionStatus: 'none', aiUsageCurrent: 0, aiBudgetLimit: 0 },
} as const;

export function newOrganizationDefaults(path: OrganizationCreationPath) {
  return { ...PRESETS[path] };
}
