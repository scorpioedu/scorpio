/** Pure rules for the low-balance email (credit-emails.ts). */
import { LOW_BALANCE_CENTS, currentUsageMonth, summarizeBalance, type BudgetOrg } from "./budget-policy";

export const BILLING_LINK = "https://scorpioedu.org/teacher/network/billing";

/**
 * True when this write took the network from at-or-above the low-balance line to below it, and the
 * network has spent this month (so a brand-new network that never spent is not nagged).
 */
export function crossedLowBalance(
  before: BudgetOrg | undefined,
  after: BudgetOrg | undefined,
  now: Date = new Date(),
): { month: string; availableCents: number } | null {
  if (!before || !after) return null;
  const month = currentUsageMonth(now);
  const b = summarizeBalance(before, month, now);
  const a = summarizeBalance(after, month, now);
  if (b.availableCents < LOW_BALANCE_CENTS || a.availableCents >= LOW_BALANCE_CENTS) return null;
  if (a.monthSpendCents <= 0) return null;
  return { month, availableCents: a.availableCents };
}

export const formatBalance = (cents: number) => `$${(Math.max(0, cents) / 100).toFixed(2)}`;

export function lowBalanceParagraph(availableCents: number): string {
  return `Your network's AI balance is down to ${formatBalance(availableCents)}. Raise and AI grading pause at $0; everything else keeps working. You get $1 free again on the 1st, or you can top up from $5.`;
}
