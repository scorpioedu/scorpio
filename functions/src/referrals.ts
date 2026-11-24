/**
 * Teacher referral payout (SCO-18). When a referred teacher has results and at least five enrolled
 * students, the referrer's network gets $5 and the colleague's network $2, once per referred teacher.
 * Called from the first-results and student-enrolled triggers in teacher-emails.ts; every call is
 * safe to repeat because credit is idempotent (externalId) and `referralPaidAt` closes the referral.
 */

import * as React from "react";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { grantCredit } from "./credits";
import { sendEmail } from "./lib/email";
import { TeacherNoticeEmail } from "./templates/TeacherNoticeEmail";
import { firstName } from "./teacher-email-rules";
import {
  PERMANENT_SKIPS,
  referralCentsThisYear,
  referralDecision,
  referralExternalIds,
} from "./referral-rules";

const BILLING = "https://scorpioedu.org/teacher/network/billing";
const REPLY_TO = "rushil@scorpioedu.org";

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

export async function payReferralIfEligible(
  referredUid: string,
  opts: { apiKey: string; now?: Date },
): Promise<void> {
  const db = admin.firestore();
  const now = opts.now ?? new Date();
  const referredRef = db.collection("users").doc(referredUid);
  const referred = (await referredRef.get()).data();
  if (!referred || referred.role !== "teacher") return;
  const referrerUid = str(referred.invite?.referredBy);
  if (!referrerUid || referrerUid.includes("/")) return;
  if (referred.referralPaidAt || referred.referralClosedReason) return;

  const referrerRef = db.collection("users").doc(referrerUid);
  const referrer = (await referrerRef.get()).data();
  const referrerOrgId = str(referrer?.organizationId);
  const referredOrgId = str(referred.organizationId);

  // Cheap checks first: skip the queries for referrals that cannot pay yet.
  const early = referralDecision({
    referredUid,
    referrerUid: referrer ? referrerUid : null,
    referrerOrgId,
    referredOrgId,
    alreadyPaid: false,
    hasResults: true,
    enrolledStudents: Number.MAX_SAFE_INTEGER,
    referrerCentsThisYear: 0,
  });
  if (!early.pay) {
    if (PERMANENT_SKIPS.has(early.reason))
      await referredRef.update({ referralClosedReason: early.reason });
    return;
  }

  const [roster, results] = await Promise.all([
    db
      .collection("users")
      .where("teacherId", "==", referredUid)
      .where("role", "==", "student")
      .count()
      .get(),
    db
      .collection("submissions")
      .where("teacherId", "==", referredUid)
      .where("status", "in", ["graded", "pending_review"])
      .limit(1)
      .get(),
  ]);
  const ledger = await db
    .collection("organizations")
    .doc(referrerOrgId!)
    .collection("credit_ledger")
    .where("kind", "==", "referral")
    .where("meta.referrerUid", "==", referrerUid)
    .get();

  const decision = referralDecision({
    referredUid,
    referrerUid,
    referrerOrgId,
    referredOrgId,
    alreadyPaid: false,
    hasResults: !results.empty,
    enrolledStudents: roster.data().count,
    referrerCentsThisYear: referralCentsThisYear(
      ledger.docs.map((d) => d.data()),
      referrerUid,
      now,
    ),
  });
  if (!decision.pay) return;

  const ids = referralExternalIds(referredUid);
  const colleagueName = str(referred.displayName) ?? "A colleague";
  let referrerGrant = { applied: false };
  if (decision.referrerCents > 0) {
    referrerGrant = await grantCredit(
      db,
      {
        organizationId: referrerOrgId!,
        bucket: "bonus",
        cents: decision.referrerCents,
        kind: "referral",
        reason: `${colleagueName} got their first class results`,
        externalId: ids.referrer,
        meta: { referrerUid, referredUid, year: now.getUTCFullYear() },
      },
      now,
    );
  }
  await grantCredit(
    db,
    {
      organizationId: referredOrgId!,
      bucket: "bonus",
      cents: decision.welcomeCents,
      kind: "welcome",
      reason: "Welcome credit for joining Scorpio through a colleague",
      externalId: ids.welcome,
      meta: { referrerUid, referredUid },
    },
    now,
  );
  await referredRef.update({ referralPaidAt: now });
  logger.info("Referral paid", { referredUid, referrerUid, referrerCents: decision.referrerCents });

  if (!referrerGrant.applied || typeof referrer?.email !== "string" || !referrer.email) return;
  const name = firstName(referrer.displayName);
  await sendEmail({
    apiKey: opts.apiKey,
    replyTo: REPLY_TO,
    to: referrer.email,
    subject: "You earned $5 of AI credit",
    react: React.createElement(TeacherNoticeEmail, {
      preview: "A colleague you invited is up and running.",
      headline: "You earned $5 of AI credit",
      greeting: name ? `Hi ${name},` : "Hi,",
      paragraphs: [
        `${colleagueName} just got their first class results on Scorpio, so we added $5 of AI to your balance. Thanks for spreading the word.`,
      ],
      action: { label: "See your balance", link: BILLING },
      footer: "You get this when a colleague you invited gets their first class results.",
    }),
  });
}
