/**
 * Pure rules for the one-off move to the credit model (SCO-17), shared by scripts/migrate-credits.mjs
 * and scripts/send-credits-announcement.mjs. No imports, so Node can load it directly (type stripping).
 * Keep the bucket arithmetic identical to applyCreditInTx in ./credits.ts.
 */

export const MIGRATION_TAG = "migration-2026-11";
/** credits.ts ledgerIdFor("migration", MIGRATION_TAG) */
export const MIGRATION_LEDGER_ID = `migration-${MIGRATION_TAG}`;
export const BONUS_LIFETIME_DAYS = 365;

export const FREE_THANKS_CENTS = 500;
export const YEARLY_THANKS_CENTS = 1000;
export const OTHER_THANKS_CENTS = 500;

export type MigrationGroup = "free" | "pilot" | "yearly" | "other";

export interface MigrationOrg {
  planId?: unknown;
  subscriptionStatus?: unknown;
  aiBudgetLimit?: unknown;
  aiUsageCurrent?: unknown;
  aiBonusCents?: unknown;
  aiBonusExpiresAt?: unknown;
  aiPaidCents?: unknown;
  pilot?: { endsAt?: string | null; grantedCents?: number } | null;
  polarSubscriptionId?: unknown;
  subscriptionId?: unknown;
}

export interface MigrationPlan {
  group: MigrationGroup;
  /** Cents added to the bonus bucket (0 for a pilot that spent everything). */
  grantCents: number;
  reason: string;
  /** Breakdown for the ledger meta. */
  parts: { unspentCents: number; thanksCents: number };
  /** New totals after the grant. */
  newBonusCents: number;
  newBonusExpiresAt: string | null;
  newPlanId: string;
  /** Fields to set on the organization doc (dot paths allowed). */
  orgUpdate: Record<string, unknown>;
  warnings: string[];
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const floorCents = (v: number) => Math.floor(Math.max(0, v) * 100 + 1e-9) / 100;

function toMillis(value: unknown): number | null {
  if (!value) return null;
  if (typeof value === "string") {
    const t = Date.parse(value);
    return Number.isFinite(t) ? t : null;
  }
  if (value instanceof Date) return value.getTime();
  const v = value as { toMillis?: () => number };
  return typeof v.toMillis === "function" ? v.toMillis() : null;
}

export function migrationGroupFor(org: MigrationOrg): MigrationGroup {
  const plan = String(org.planId ?? "free");
  if (plan === "pilot") return "pilot";
  if (plan === "standard_yearly") return "yearly";
  if (plan === "free" || plan === "") return "free";
  return "other";
}

export function migrationPlanFor(org: MigrationOrg, now: Date = new Date()): MigrationPlan {
  const group = migrationGroupFor(org);
  const limit = num(org.aiBudgetLimit);
  const used = num(org.aiUsageCurrent);
  const unspent = floorCents(limit - used);
  const warnings: string[] = [];

  let unspentCents = 0;
  let thanksCents = 0;
  let reason = "Thanks for being an early Scorpio teacher";
  let wantedExpiry: string | undefined;
  switch (group) {
    case "free":
      thanksCents = FREE_THANKS_CENTS;
      break;
    case "pilot":
      unspentCents = unspent;
      reason = "Remaining pilot AI, now credit on your balance";
      if (org.pilot?.endsAt) wantedExpiry = org.pilot.endsAt;
      break;
    case "yearly":
      unspentCents = unspent;
      thanksCents = YEARLY_THANKS_CENTS;
      reason = "Unspent plan AI plus a thank-you for being early";
      break;
    default:
      thanksCents = OTHER_THANKS_CENTS;
      warnings.push(`unrecognised plan "${String(org.planId)}", treated as free`);
  }
  if ((group === "yearly" || group === "other") && (org.polarSubscriptionId || org.subscriptionId)) {
    warnings.push("has a Polar subscription id: cancel it in Polar");
  }

  const grantCents = unspentCents + thanksCents;

  // Same arithmetic as applyCreditInTx.
  const expiresMs = toMillis(org.aiBonusExpiresAt);
  const expired = expiresMs !== null && expiresMs <= now.getTime();
  const current = expired ? 0 : num(org.aiBonusCents);
  const newBonusCents = Math.max(0, current + grantCents);
  let newBonusExpiresAt: string | null = expiresMs !== null && !expired ? new Date(expiresMs).toISOString() : null;
  if (grantCents > 0) {
    const fresh = now.getTime() + BONUS_LIFETIME_DAYS * 864e5;
    const wanted = wantedExpiry ? Date.parse(wantedExpiry) : NaN;
    newBonusExpiresAt = new Date(Number.isFinite(wanted) ? Math.max(wanted, fresh) : fresh).toISOString();
  }

  const newPlanId = group === "pilot" ? String(org.planId) : "free";
  const orgUpdate: Record<string, unknown> = {
    subscriptionStatus: "active",
    aiBudgetLimit: 0,
    aiBonusCents: newBonusCents,
    planId: newPlanId,
    creditUpdatedAt: now,
    creditMigration: {
      tag: MIGRATION_TAG,
      group,
      at: now.toISOString(),
      previousPlanId: org.planId ?? null,
      previousSubscriptionStatus: org.subscriptionStatus ?? null,
      previousBudgetLimit: limit,
      previousUsage: used,
      grantCents,
    },
  };
  if (org.aiPaidCents === undefined || org.aiPaidCents === null) orgUpdate.aiPaidCents = 0;
  if (newBonusExpiresAt) orgUpdate.aiBonusExpiresAt = newBonusExpiresAt;
  if (group === "pilot") orgUpdate["pilot.grantedCents"] = limit;

  return {
    group,
    grantCents,
    reason,
    parts: { unspentCents, thanksCents },
    newBonusCents,
    newBonusExpiresAt,
    newPlanId,
    orgUpdate,
    warnings,
  };
}

/** The credit_ledger document for a plan (kind "migration", bucket "bonus"). */
export function migrationLedgerDoc(plan: MigrationPlan, now: Date = new Date()) {
  return {
    kind: "migration",
    bucket: "bonus",
    cents: plan.grantCents,
    reason: plan.reason,
    externalId: MIGRATION_TAG,
    actorUid: null,
    meta: { group: plan.group, ...plan.parts },
    createdAt: now,
  };
}
