/** Pure payout rules for teacher referrals (referrals.ts). No Firebase imports. */

export const REFERRER_CENTS = 500;
export const WELCOME_CENTS = 200;
/** Most referral credit one referrer can earn in a calendar year (UTC). */
export const ANNUAL_CAP_CENTS = 5000;
/** Students the referred teacher needs enrolled before anyone is paid. */
export const MIN_STUDENTS = 5;

export interface LedgerEntry {
  kind?: unknown;
  cents?: unknown;
  createdAt?: unknown;
  meta?: unknown;
}

function yearOf(value: unknown): number | null {
  let ms: number | null = null;
  if (value instanceof Date) ms = value.getTime();
  else if (typeof value === "string") ms = Date.parse(value);
  else if (typeof value === "number") ms = value;
  else if (value && typeof (value as { toMillis?: unknown }).toMillis === "function")
    ms = (value as { toMillis: () => number }).toMillis();
  return ms !== null && Number.isFinite(ms) ? new Date(ms).getUTCFullYear() : null;
}

/** Referral credit this referrer has already earned in `now`'s calendar year. */
export function referralCentsThisYear(
  entries: LedgerEntry[],
  referrerUid: string,
  now: Date,
): number {
  const year = now.getUTCFullYear();
  let total = 0;
  for (const e of entries) {
    if (e.kind !== "referral") continue;
    const meta = e.meta as { referrerUid?: unknown } | null | undefined;
    if (meta?.referrerUid !== referrerUid) continue;
    if (yearOf(e.createdAt) !== year) continue;
    const cents = Number(e.cents);
    if (Number.isFinite(cents) && cents > 0) total += cents;
  }
  return total;
}

export interface ReferralInput {
  referredUid: string;
  referrerUid: string | null | undefined;
  referrerOrgId: string | null | undefined;
  referredOrgId: string | null | undefined;
  alreadyPaid: boolean;
  hasResults: boolean;
  enrolledStudents: number;
  referrerCentsThisYear: number;
}

export type ReferralSkip =
  | "no_referrer"
  | "already_paid"
  | "self"
  | "no_network"
  | "same_network"
  | "no_results"
  | "too_few_students";

export type ReferralDecision =
  | { pay: false; reason: ReferralSkip }
  | { pay: true; referrerCents: number; welcomeCents: number };

/**
 * `no_results` and `too_few_students` are "not yet" and can be re-checked later; `self` and
 * `same_network` can never become payable. At the annual cap the referrer gets 0 but the new
 * colleague's welcome credit is still paid.
 */
export function referralDecision(i: ReferralInput): ReferralDecision {
  if (!i.referrerUid) return { pay: false, reason: "no_referrer" };
  if (i.alreadyPaid) return { pay: false, reason: "already_paid" };
  if (i.referrerUid === i.referredUid) return { pay: false, reason: "self" };
  if (!i.referrerOrgId || !i.referredOrgId) return { pay: false, reason: "no_network" };
  if (i.referrerOrgId === i.referredOrgId) return { pay: false, reason: "same_network" };
  if (!i.hasResults) return { pay: false, reason: "no_results" };
  if (i.enrolledStudents < MIN_STUDENTS) return { pay: false, reason: "too_few_students" };
  const room = ANNUAL_CAP_CENTS - i.referrerCentsThisYear;
  return {
    pay: true,
    referrerCents: room >= REFERRER_CENTS ? REFERRER_CENTS : 0,
    welcomeCents: WELCOME_CENTS,
  };
}

export function referralExternalIds(referredUid: string) {
  return { referrer: `referral-${referredUid}`, welcome: `welcome-${referredUid}` };
}

/** Reasons that can never change, so the referral is closed rather than re-checked on every event. */
export const PERMANENT_SKIPS: ReadonlySet<ReferralSkip> = new Set(["self", "same_network"]);
