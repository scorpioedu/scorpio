import { NextResponse } from "next/server";
import { withAuthorizedRequest } from "@/lib/auth-verify";
import { adminDb } from "@/lib/firebase-admin";
import { referralCodeFor } from "@/lib/referral";

/**
 * GET /api/teacher/referral -> { code, link, stats: { invited, activated, earnedCents } }
 *
 * The teacher's referral code (created on first call) and how their invitations are going.
 * `invited` = access requests that came through the link, `activated` = referred teachers who
 * reached the payout bar, `earnedCents` = referral credit in their network's ledger.
 */
export const GET = withAuthorizedRequest(
  async (req, { caller, profile, organizationId }) => {
    const code = referralCodeFor(caller.uid);
    if (profile.referralCode !== code)
      await adminDb.collection("users").doc(caller.uid).update({ referralCode: code });

    const [invited, referred, ledger] = await Promise.all([
      adminDb.collection("accessRequests").where("referredBy", "==", caller.uid).count().get(),
      adminDb.collection("users").where("invite.referredBy", "==", caller.uid).limit(200).get(),
      organizationId
        ? adminDb
            .collection("organizations")
            .doc(organizationId)
            .collection("credit_ledger")
            .where("kind", "==", "referral")
            .where("meta.referrerUid", "==", caller.uid)
            .get()
        : null,
    ]);
    const earnedCents = (ledger?.docs ?? []).reduce(
      (sum, d) => sum + Math.max(0, Number(d.data().cents) || 0),
      0,
    );
    const origin = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    return NextResponse.json({
      code,
      link: `${origin}/request-access?ref=${code}`,
      stats: {
        invited: invited.data().count,
        activated: referred.docs.filter((d) => !!d.data().referralPaidAt).length,
        earnedCents,
      },
    });
  },
  { teacher: true, rateLimit: "write" },
);
