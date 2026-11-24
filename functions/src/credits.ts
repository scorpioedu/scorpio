import type { firestore } from 'firebase-admin';
import { BONUS_LIFETIME_DAYS } from './budget-policy';

/**
 * The one way credit enters or leaves a network's balance outside of AI spend (SCO-14).
 * Each call writes the bucket change and an `organizations/{id}/credit_ledger` doc in one
 * transaction. With `externalId` the ledger doc id is derived from it, so a retried webhook or
 * a re-run migration never applies twice.
 */

export type CreditBucket = 'bonus' | 'paid';

export type CreditKind =
  | 'deposit' // Polar order paid
  | 'refund' // Polar refund (negative)
  | 'invoice' // school paid by invoice, entered by an admin
  | 'referral' // referrer reward
  | 'welcome' // new teacher bonus
  | 'migration' // switch to the credit model
  | 'admin' // manual grant or correction (either sign)
  | 'expire'; // bonus expiry (negative)

export interface GrantInput {
  organizationId: string;
  bucket: CreditBucket;
  /** Whole or fractional cents; negative removes credit. */
  cents: number;
  kind: CreditKind;
  /** Short human reason, shown in the teacher's history. */
  reason: string;
  /** Stable id from the source (Polar order id, referral id, migration tag) for idempotency. */
  externalId?: string;
  actorUid?: string | null;
  meta?: Record<string, unknown>;
}

export interface GrantResult {
  applied: boolean;
  ledgerId: string;
}

const LEDGER_ID_SAFE = /[^A-Za-z0-9_-]/g;

export function ledgerIdFor(kind: CreditKind, externalId: string): string {
  return `${kind}-${externalId}`.replace(LEDGER_ID_SAFE, '_').slice(0, 200);
}

export async function grantCredit(
  db: firestore.Firestore,
  input: GrantInput,
  now: Date = new Date(),
): Promise<GrantResult> {
  const { organizationId, bucket, cents, kind } = input;
  if (!organizationId || organizationId.includes('/')) throw new Error('Invalid network');
  if (!Number.isFinite(cents) || cents === 0) throw new Error('Invalid credit amount');
  if (bucket !== 'bonus' && bucket !== 'paid') throw new Error('Invalid credit bucket');

  const orgRef = db.collection('organizations').doc(organizationId);
  const ledgerCol = orgRef.collection('credit_ledger');
  const ledgerRef = input.externalId ? ledgerCol.doc(ledgerIdFor(kind, input.externalId)) : ledgerCol.doc();

  return db.runTransaction(async (tx) => {
    const [orgSnap, ledgerSnap] = await Promise.all([tx.get(orgRef), tx.get(ledgerRef)]);
    if (ledgerSnap.exists) return { applied: false, ledgerId: ledgerRef.id };
    if (!orgSnap.exists) throw new Error('Network not found');
    applyCreditInTx(tx, orgRef, orgSnap.data() ?? {}, ledgerRef, input, now);
    return { applied: true, ledgerId: ledgerRef.id };
  });
}

/**
 * The bucket change and ledger doc of a grant, for a caller already inside a transaction that has
 * read the network (`org`). The caller owns idempotency (ledgerRef must not exist yet).
 * `bonusExpiresAt` lets a pilot grant last until its end date when that is later than 12 months.
 */
export function applyCreditInTx(
  tx: firestore.Transaction,
  orgRef: firestore.DocumentReference,
  org: Record<string, unknown>,
  ledgerRef: firestore.DocumentReference,
  input: GrantInput,
  now: Date = new Date(),
  bonusExpiresAt?: string,
): void {
  const { bucket, cents, kind } = input;
  const update: Record<string, unknown> = { creditUpdatedAt: now };
  if (bucket === 'paid') {
    update.aiPaidCents = (Number(org.aiPaidCents) || 0) + cents;
  } else {
    const expiresMs = toMillis(org.aiBonusExpiresAt);
    const expired = expiresMs !== null && expiresMs <= now.getTime();
    const current = expired ? 0 : Number(org.aiBonusCents) || 0;
    update.aiBonusCents = Math.max(0, current + cents);
    if (cents > 0) {
      // Each new bonus grant restarts the clock on the whole bonus bucket.
      const fresh = now.getTime() + BONUS_LIFETIME_DAYS * 864e5;
      const wanted = bonusExpiresAt ? Date.parse(bonusExpiresAt) : NaN;
      update.aiBonusExpiresAt = new Date(Number.isFinite(wanted) ? Math.max(wanted, fresh) : fresh).toISOString();
    }
  }
  tx.update(orgRef, update);
  tx.create(ledgerRef, {
    kind,
    bucket,
    cents,
    reason: input.reason,
    externalId: input.externalId ?? null,
    actorUid: input.actorUid ?? null,
    meta: input.meta ?? null,
    createdAt: now,
  });
}

function toMillis(value: unknown): number | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const t = Date.parse(value);
    return Number.isFinite(t) ? t : null;
  }
  if (value instanceof Date) return value.getTime();
  const v = value as { toMillis?: () => number };
  return typeof v.toMillis === 'function' ? v.toMillis() : null;
}
