/**
 * Initial fields for a newly created organization document, per creation path.
 *
 * Credit model (SCO-14): every network is active from the start and gets the monthly free
 * allowance (FREE_MONTHLY_CENTS in functions/src/budget-policy.ts), whichever way it was created.
 * `aiBudgetLimit` is now the owner's optional monthly spend cap, 0 = none. Both paths are kept
 * as names so callers and tests read the same as before; they no longer differ.
 */
export type OrganizationCreationPath = "register" | "membership";

const BASE = {
  planId: "free",
  subscriptionStatus: "active",
  aiUsageCurrent: 0,
  aiBudgetLimit: 0,
  aiBonusCents: 0,
  aiPaidCents: 0,
} as const;

export function newOrganizationDefaults(_path: OrganizationCreationPath) {
  return { ...BASE };
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
 * Fields that make a network a pilot. A pilot's AI comes as bonus credit (budgetCents), lasting
 * until the pilot's end date or 12 months, whichever is later. `pilot.grantedCents` totals every
 * pilot grant so the admin page can show spend against it. Use on a NEW network (bonus is set,
 * not added); for an existing one, grant credit with grantCredit instead.
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
    aiBonusCents: budgetCents,
    aiBonusExpiresAt: pilotBonusExpiry(grant.endsAt ?? null, now),
    pilot: {
      cohort: grant.cohort || DEFAULT_PILOT_COHORT,
      status: "active",
      startedAt: now.toISOString(),
      endsAt: grant.endsAt ?? null,
      budgetCents,
      grantedCents: budgetCents,
      note: grant.note ?? null,
      source,
    },
  };
}

/** Later of the pilot end date and 12 months from now, as an ISO string. */
export function pilotBonusExpiry(endsAt: string | null, now: Date = new Date()): string {
  const year = now.getTime() + 365 * 864e5;
  const ends = endsAt ? Date.parse(endsAt) : NaN;
  return new Date(Number.isFinite(ends) ? Math.max(ends, year) : year).toISOString();
}
