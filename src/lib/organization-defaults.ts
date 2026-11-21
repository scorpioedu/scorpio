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
export type OrganizationCreationPath = "register" | "membership";

const PRESETS = {
  register: {
    planId: "free",
    subscriptionStatus: "active",
    aiUsageCurrent: 0,
    aiBudgetLimit: 50,
    baseMonthlyFee: 0,
  },
  membership: { planId: "free", subscriptionStatus: "none", aiUsageCurrent: 0, aiBudgetLimit: 0 },
} as const;

export function newOrganizationDefaults(path: OrganizationCreationPath) {
  return { ...PRESETS[path] };
}

export const DEFAULT_PILOT_BUDGET_CENTS = 1000;
export const DEFAULT_PILOT_COHORT = "fall-2026";

export interface PilotGrant {
  cohort?: string;
  budgetCents?: number;
  endsAt?: string | null;
  note?: string | null;
}

/** Fields on a teacherInviteCodes doc that make the redeeming teacher's new network a pilot. */
export function pilotInviteFields(grant: PilotGrant = {}) {
  return {
    isPilot: true,
    pilot: {
      cohort: grant.cohort || DEFAULT_PILOT_COHORT,
      budgetCents: grant.budgetCents ?? DEFAULT_PILOT_BUDGET_CENTS,
      endsAt: grant.endsAt ?? null,
    },
  };
}

/**
 * Fields that make a network a pilot: an active plan that counts as paid (isDepartmentPlanOrg),
 * with the budget an admin granted. evaluateBudget clamps it at PILOT_PLAN_BUDGET_CAP_CENTS.
 */
export function pilotOrganizationFields(
  grant: PilotGrant,
  source: "admin" | "invite",
  now: Date = new Date(),
) {
  const budgetCents = grant.budgetCents ?? DEFAULT_PILOT_BUDGET_CENTS;
  return {
    planId: "pilot",
    subscriptionStatus: "active",
    aiBudgetLimit: budgetCents,
    pilot: {
      cohort: grant.cohort || DEFAULT_PILOT_COHORT,
      status: "active",
      startedAt: now.toISOString(),
      endsAt: grant.endsAt ?? null,
      budgetCents,
      note: grant.note ?? null,
      source,
    },
  };
}
