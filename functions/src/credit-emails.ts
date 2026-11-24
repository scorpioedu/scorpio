/** Credit-model emails. Today: one low-balance warning per network per month. */

import * as React from "react";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import { sendEmail } from "./lib/email";
import { TeacherNoticeEmail } from "./templates/TeacherNoticeEmail";
import { firstName } from "./teacher-email-rules";
import { BILLING_LINK, crossedLowBalance, formatBalance, lowBalanceParagraph } from "./credit-email-rules";

const resendApiKey = defineSecret("RESEND_API_KEY");
const REPLY_TO = "rushil@scorpioedu.org";

/** Whoever sets lowBalanceEmailMonth to this month first sends; retries and racing writes skip. */
async function claimMonth(ref: admin.firestore.DocumentReference, month: string): Promise<boolean> {
  return admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get("lowBalanceEmailMonth") === month) return false;
    tx.update(ref, { lowBalanceEmailMonth: month });
    return true;
  });
}

/** A network's balance just dropped under LOW_BALANCE_CENTS: tell the owner, once a month. */
export const onLowBalance = onDocumentUpdated(
  { document: "organizations/{orgId}", secrets: [resendApiKey] },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    const crossed = crossedLowBalance(before, after);
    if (!crossed || !event.data || !after) return;
    if (after.lowBalanceEmailMonth === crossed.month) return;

    const db = admin.firestore();
    const ownerId = typeof after.ownerId === "string" && after.ownerId && !after.ownerId.includes("/") ? after.ownerId : null;
    const owner = ownerId ? (await db.collection("users").doc(ownerId).get()).data() : undefined;
    if (owner?.preferences?.disableCreditEmails === true) return;
    const to =
      typeof owner?.email === "string" && owner.email
        ? owner.email
        : typeof after.ownerEmail === "string" && after.ownerEmail
          ? after.ownerEmail
          : null;
    if (!to) return;

    if (!(await claimMonth(event.data.after.ref, crossed.month))) return;
    const name = firstName(owner?.displayName);
    const sent = await sendEmail({
      apiKey: resendApiKey.value(),
      replyTo: REPLY_TO,
      to,
      subject: "Your Scorpio AI balance is low",
      tag: "low-balance",
      react: React.createElement(TeacherNoticeEmail, {
        preview: `Your network's AI balance is down to ${formatBalance(crossed.availableCents)}.`,
        greeting: name ? `Hi ${name},` : "Hi,",
        paragraphs: [lowBalanceParagraph(crossed.availableCents)],
        action: { label: "Top up", link: BILLING_LINK },
        footer:
          "You get this at most once a month. Reply to this email if you would rather not get it.",
      }),
    });
    if (sent) logger.info("Low-balance email sent", { organizationId: event.params.orgId });
  },
);
