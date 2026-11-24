/**
 * The single AI budget policy (RT-21, findings B-003 / E-007), rewritten for the credit model (SCO-14).
 *
 * Every network has an AI balance made of three buckets, spent in this order:
 *   1. free:  FREE_MONTHLY_CENTS each calendar month (UTC), no rollover
 *   2. bonus: referral, welcome, pilot and admin credit (aiBonusCents), expires at aiBonusExpiresAt
 *   3. paid:  deposits and invoices (aiPaidCents), never expires; may dip below zero after a refund
 * aiBudgetLimit, when above zero, is an optional monthly spend cap the owner sets on that balance.
 *
 * Pure and dependency-free: the Next.js pre-check (`checkBudget` in src/lib/usage-limit.ts), the
 * transactional enforcement point (`reserveBudget` in ./metering.ts) and client UI all call it.
 * Callers map `reason` to their own user-facing message.
 */

export type BudgetDenial = "budget_exhausted" | "monthly_cap_reached" | "user_allowance_reached";

export interface BudgetOrg {
  planId?: string;
  /** Optional monthly spend cap in cents; 0 or missing means no cap. */
  aiBudgetLimit?: number;
  /** Spend in the month named by aiUsageMonth. */
  aiUsageCurrent?: number;
  aiUsageMonth?: string;
  aiUsageReserved?: number;
  aiFreeMonth?: string;
  aiFreeUsedCents?: number;
  aiBonusCents?: number;
  /** ISO string or Firestore Timestamp-like; bonus counts as zero after it. */
  aiBonusExpiresAt?: unknown;
  aiPaidCents?: number;
  aiTutorLimitPerStudent?: number;
  aiNotebookLimitPerStudent?: number;
}

export interface BudgetUser {
  usageMonth?: string;
  tutorUsageCurrent?: number;
  aiNotebookUsageCurrent?: number;
}

export type BudgetDecision = { allowed: true } | { allowed: false; reason: BudgetDenial };

/** Free AI every network gets each month. */
export const FREE_MONTHLY_CENTS = 100;

/**
 * Below this, a teacher sees the low-balance banner and gets one email. Not $1: a network on the
 * free allowance alone is always under $1 once it has used a cent.
 */
export const LOW_BALANCE_CENTS = 25;

/** Bonus credit lasts this long after the most recent bonus grant. */
export const BONUS_LIFETIME_DAYS = 365;

/** Deposit bounds, in cents. */
export const MIN_DEPOSIT_CENTS = 500;
export const MAX_DEPOSIT_CENTS = 50_000;

/**
 * Polar's Starter fee (5% + 50c, plus 1.5% for non-US cards) comes out of a deposit, since credit
 * is sold at cost with no markup. Used for the estimate shown before paying; the webhook credits
 * the order's real net amount when Polar reports one.
 */
export const POLAR_FEE_PERCENT = 5;
export const POLAR_FEE_FIXED_CENTS = 50;

export function depositCreditCents(amountCents: number): number {
  if (!(amountCents > 0)) return 0;
  const fee = Math.round(amountCents * (POLAR_FEE_PERCENT / 100)) + POLAR_FEE_FIXED_CENTS;
  return Math.max(0, amountCents - fee);
}

/** Admin grants (pilots, invoices, fixes) are clamped here so a typo cannot grant a fortune. */
export const MAX_ADMIN_GRANT_CENTS = 100_000;

/** @deprecated Kept for the admin pilots route; pilots now receive bonus credit. */
export const PILOT_PLAN_BUDGET_CAP_CENTS = 10_000;

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

// Gemini 3.8 Flash text rates in cents/token.
// Introductory through Dec 31, 2026: $0.75/1M input, $3.75/1M output
// Standard starting Jan 1, 2027: $1.50/1M input, $7.50/1M output
export function getActiveTokenRates(now: number = Date.now()): { input: number; output: number } {
  const isStandardPost2026 = now >= 1798761600000; // 2027-01-01T00:00:00.000Z
  return isStandardPost2026
    ? { input: 0.00015, output: 0.00075 }
    : { input: 0.000075, output: 0.000375 };
}

/** Average Raise hint in production (Nov 2026): 648 input and 183 output tokens. */
export function raiseHintCents(now: number = Date.now()): number {
  const r = getActiveTokenRates(now);
  return 648 * r.input + 183 * r.output;
}

/** Rough number of Raise hints a balance buys, for display only. */
export function estimateHints(cents: number, now: number = Date.now()): number {
  if (!(cents > 0)) return 0;
  const n = cents / raiseHintCents(now);
  return n >= 1000 ? Math.round(n / 100) * 100 : Math.floor(n);
}

function toMillis(value: unknown): number | null {
  if (!value) return null;
  if (typeof value === "string") {
    const t = Date.parse(value);
    return Number.isFinite(t) ? t : null;
  }
  if (value instanceof Date) return value.getTime();
  const v = value as { toMillis?: () => number; seconds?: number; _seconds?: number };
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v.seconds === "number") return v.seconds * 1000;
  if (typeof v._seconds === "number") return v._seconds * 1000;
  return null;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export interface BalanceSummary {
  month: string;
  freeLeftCents: number;
  /** Unexpired bonus (0 once expired). */
  bonusCents: number;
  bonusExpiresAt: number | null;
  /** May be negative after a refund. */
  paidCents: number;
  reservedCents: number;
  /** free + bonus + paid - reserved, floored at 0. */
  availableCents: number;
  monthSpendCents: number;
  /** 0 = no cap. */
  monthlyCapCents: number;
}

export function summarizeBalance(
  org: BudgetOrg | null | undefined,
  month: string = currentUsageMonth(),
  now: Date = new Date(),
): BalanceSummary {
  const o = org ?? {};
  const freeUsed = o.aiFreeMonth === month ? num(o.aiFreeUsedCents) : 0;
  const freeLeftCents = Math.max(0, FREE_MONTHLY_CENTS - freeUsed);
  const expires = toMillis(o.aiBonusExpiresAt);
  const bonusLive = expires === null || expires > now.getTime();
  const bonusCents = bonusLive ? Math.max(0, num(o.aiBonusCents)) : 0;
  const paidCents = num(o.aiPaidCents);
  const reservedCents = Math.max(0, num(o.aiUsageReserved));
  return {
    month,
    freeLeftCents,
    bonusCents,
    bonusExpiresAt: bonusLive ? expires : null,
    paidCents,
    reservedCents,
    availableCents: Math.max(0, freeLeftCents + bonusCents + paidCents - reservedCents),
    monthSpendCents: o.aiUsageMonth === month ? num(o.aiUsageCurrent) : 0,
    monthlyCapCents: Math.max(0, num(o.aiBudgetLimit)),
  };
}

/**
 * Decide whether `org` may spend on a request of `type`.
 * `maxCost` is the cents about to be reserved; pass 0 for a pre-check (spend is refused once the
 * balance is empty). Per-user counters only count for the month they were written in.
 */
export function evaluateBudget(
  org: BudgetOrg | null | undefined,
  user: BudgetUser | null | undefined,
  type: string | undefined,
  maxCost = 0,
  month: string = currentUsageMonth(),
  now: Date = new Date(),
): BudgetDecision {
  if (!org) return { allowed: false, reason: "budget_exhausted" };
  const b = summarizeBalance(org, month, now);
  if (b.availableCents <= 0 || b.availableCents < maxCost) {
    return { allowed: false, reason: "budget_exhausted" };
  }
  if (b.monthlyCapCents > 0) {
    const projected = b.monthSpendCents + b.reservedCents + maxCost;
    // A pre-check (maxCost 0) at exactly the cap is refused too: the next call would pass it.
    if (projected > b.monthlyCapCents || (maxCost <= 0 && projected >= b.monthlyCapCents)) {
      return { allowed: false, reason: "monthly_cap_reached" };
    }
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

export interface BucketSpend {
  free: number;
  bonus: number;
  paid: number;
}

/**
 * Split a settled cost across the buckets: free first, then unexpired bonus, then paid.
 * Whatever free and bonus cannot cover lands on paid, even below zero (a reservation estimate
 * can undershoot slightly); the next pre-check then refuses until the balance is topped up.
 */
export function splitSpend(
  org: BudgetOrg | null | undefined,
  cost: number,
  month: string = currentUsageMonth(),
  now: Date = new Date(),
): BucketSpend {
  const b = summarizeBalance(org, month, now);
  let left = Math.max(0, cost);
  const free = Math.min(left, b.freeLeftCents);
  left -= free;
  const bonus = Math.min(left, b.bonusCents);
  left -= bonus;
  return { free, bonus, paid: left };
}

/** A pilot has ended when an admin ended it or its end date has passed. */
export function pilotHasEnded(
  pilot: { status?: string; endsAt?: string | null } | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!pilot || pilot.status !== "active") return true;
  if (!pilot.endsAt) return false;
  const ends = Date.parse(pilot.endsAt);
  return Number.isFinite(ends) && ends <= now.getTime();
}
