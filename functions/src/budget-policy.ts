/**
 * The single AI budget policy (RT-21, findings B-003 / E-007).
 *
 * Pure and dependency-free so both the Next.js pre-check (`checkBudget` in src/lib/usage-limit.ts)
 * and the transactional enforcement point (`reserveBudget` in ./metering.ts) can call it.
 * Callers map `reason` to their own user-facing message.
 */

export type BudgetDenial = "subscription_inactive" | "budget_exhausted" | "user_allowance_reached";

export interface BudgetOrg {
  subscriptionStatus?: string;
  planId?: string;
  aiBudgetLimit?: number;
  aiUsageCurrent?: number;
  aiUsageReserved?: number;
  aiTutorLimitPerStudent?: number;
  aiNotebookLimitPerStudent?: number;
  pilot?: { status?: string; endsAt?: string | null } | null;
}

export interface BudgetUser {
  usageMonth?: string;
  tutorUsageCurrent?: number;
  aiNotebookUsageCurrent?: number;
}

export type BudgetDecision = { allowed: true } | { allowed: false; reason: BudgetDenial };

/** Free networks can never hold more than this many cents of AI budget, whatever aiBudgetLimit says. */
export const FREE_PLAN_BUDGET_CAP_CENTS = 50;

/** Pilot networks are granted budget by an admin; this ceiling stops a typo from granting more. */
export const PILOT_PLAN_BUDGET_CAP_CENTS = 10_000;

export const ACTIVE_SUBSCRIPTION_STATUSES = ["active", "trialing"];

const USER_COUNTERS: Record<
  string,
  { counter: keyof BudgetUser; allowance: keyof BudgetOrg } | undefined
> = {
  tutor: { counter: "tutorUsageCurrent", allowance: "aiTutorLimitPerStudent" },
  notebook: { counter: "aiNotebookUsageCurrent", allowance: "aiNotebookLimitPerStudent" },
};

export function currentUsageMonth(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

/**
 * Decide whether `org` may spend on a request of `type`.
 * `maxCost` is the cents about to be reserved; pass 0 for a pre-check (spend is refused once the
 * budget is already exhausted, and a zero limit never allows spend).
 * Per-user counters only count for the month they were written in.
 */
export function evaluateBudget(
  org: BudgetOrg | null | undefined,
  user: BudgetUser | null | undefined,
  type: string | undefined,
  maxCost = 0,
  month: string = currentUsageMonth(),
  now: Date = new Date(),
): BudgetDecision {
  if (!org || !ACTIVE_SUBSCRIPTION_STATUSES.includes(org.subscriptionStatus ?? "")) {
    return { allowed: false, reason: "subscription_inactive" };
  }
  if (org.planId === "pilot" && pilotHasEnded(org.pilot, now)) {
    return { allowed: false, reason: "subscription_inactive" };
  }
  const configured = org.aiBudgetLimit || 0;
  const limit = Math.min(configured, planBudgetCap(org.planId));
  const used = (org.aiUsageCurrent || 0) + (org.aiUsageReserved || 0);
  if (limit <= 0 || used >= limit || used + maxCost > limit) {
    return { allowed: false, reason: "budget_exhausted" };
  }
  const rule = type ? USER_COUNTERS[type] : undefined;
  if (rule && user) {
    const allowance = Number(org[rule.allowance]) || 0;
    const usage = user.usageMonth === month ? Number(user[rule.counter]) || 0 : 0;
    if (allowance > 0 && usage >= allowance) {
      return { allowed: false, reason: "user_allowance_reached" };
    }
  }
  return { allowed: true };
}

/** The most budget a plan can ever hold, whatever aiBudgetLimit says (Infinity for paid plans). */
export function planBudgetCap(planId: string | undefined): number {
  if (planId === "free") return FREE_PLAN_BUDGET_CAP_CENTS;
  if (planId === "pilot") return PILOT_PLAN_BUDGET_CAP_CENTS;
  return Infinity;
}

/** A pilot has ended when an admin ended it or its end date has passed. */
export function pilotHasEnded(pilot: BudgetOrg["pilot"], now: Date = new Date()): boolean {
  if (!pilot || pilot.status !== "active") return true;
  if (!pilot.endsAt) return false;
  const ends = Date.parse(pilot.endsAt);
  return Number.isFinite(ends) && ends <= now.getTime();
}
