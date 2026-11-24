import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { validateEvent } from "@polar-sh/sdk/webhooks";
import { createHash } from "node:crypto";
import { grantCredit } from "../../../../../functions/src/credits";
import { orderCreditCents, type PolarOrderData as OrderData } from "@/lib/polar-credit";

const validOrgId = (id: unknown): id is string =>
  typeof id === "string" && id.length > 0 && !id.includes("/");

async function handleOrderPaid(order: OrderData) {
  const orgId = order.metadata?.organizationId;
  if (order.metadata?.kind !== "ai_credit" || !validOrgId(orgId) || !order.paid) return;
  const cents = orderCreditCents(order);
  if (cents <= 0) return;
  await grantCredit(adminDb, {
    organizationId: orgId,
    bucket: "paid",
    cents,
    kind: "deposit",
    reason: `Deposit of $${((Number(order.netAmount) || 0) / 100).toFixed(2)}`,
    externalId: order.id,
    actorUid: order.metadata?.userId ?? null,
    meta: {
      orderId: order.id,
      netAmount: order.netAmount ?? null,
      platformFeeAmount: order.platformFeeAmount ?? null,
      currency: order.currency ?? null,
    },
  });
}

/**
 * A refund removes the matching share of the credit that order added. `refundedAmount` is
 * cumulative, so each step is keyed by it and only the new part is debited. The paid bucket may go
 * below zero if the credit was already spent; AI then pauses until it is topped up.
 */
async function handleOrderRefunded(order: OrderData) {
  const orgId = order.metadata?.organizationId;
  if (order.metadata?.kind !== "ai_credit" || !validOrgId(orgId)) return;
  const net = Number(order.netAmount) || 0;
  const refundedNow = Number(order.refundedAmount) || 0;
  if (net <= 0 || refundedNow <= 0) return;

  const previous = await adminDb
    .collection("organizations")
    .doc(orgId)
    .collection("credit_ledger")
    .where("meta.orderId", "==", order.id)
    .where("kind", "==", "refund")
    .get();
  const refundedBefore = previous.docs.reduce(
    (max, d) => Math.max(max, Number(d.data().meta?.refundedAmount) || 0),
    0,
  );
  const delta = Math.min(refundedNow, net) - refundedBefore;
  if (delta <= 0) return;

  const cents = -(orderCreditCents(order) * (delta / net));
  await grantCredit(adminDb, {
    organizationId: orgId,
    bucket: "paid",
    cents,
    kind: "refund",
    reason: `Refund of $${(delta / 100).toFixed(2)}`,
    externalId: `${order.id}-r${refundedNow}`,
    meta: { orderId: order.id, refundedAmount: refundedNow },
  });
}

export async function POST(req: Request) {
  const body = await req.text();
  let event;
  try {
    event = validateEvent(body, Object.fromEntries(req.headers), process.env.POLAR_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  if (event.type === "order.paid" || event.type === "order.refunded") {
    try {
      const order = event.data as unknown as OrderData;
      if (event.type === "order.paid") await handleOrderPaid(order);
      else await handleOrderRefunded(order);
      return NextResponse.json({ received: true });
    } catch (error) {
      console.error(`[polar-webhook] ${event.type} failed:`, error instanceof Error ? error.message : "unknown");
      return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
    }
  }

  // Legacy Department subscriptions: kept only until the last one has ended (SCO-15).
  if (!event.type.startsWith("subscription.")) return NextResponse.json({ received: true });
  const sub = event.data as {
    id: string;
    customerId: string;
    status: string;
    modifiedAt?: Date;
    createdAt: Date;
    metadata?: { organizationId?: string; planId?: string };
  };
  const orgId = sub.metadata?.organizationId;
  if (!validOrgId(orgId)) return NextResponse.json({ received: true });
  const eventId = createHash("sha256")
    .update(req.headers.get("webhook-id") || body)
    .digest("hex");
  try {
    await adminDb.runTransaction(async (tx) => {
      const seenRef = adminDb.collection("billing_events").doc(eventId);
      const ref = adminDb.collection("organizations").doc(orgId);
      const seen = await tx.get(seenRef);
      const org = (await tx.get(ref)).data();
      if (seen.exists || !org) return;
      const modified = new Date(sub.modifiedAt || sub.createdAt).getTime();
      if (!Number.isFinite(modified) || modified < (org.billingUpdatedAt || 0)) return;
      tx.update(ref, {
        polarCustomerId: sub.customerId,
        subscriptionId: sub.id,
        subscriptionStatus: sub.status,
        billingUpdatedAt: modified,
      });
      tx.create(seenRef, { processedAt: new Date(), type: event.type });
    });
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
