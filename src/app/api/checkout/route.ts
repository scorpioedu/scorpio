import { withAuthorizedRequest, type AuthorizedContext } from "@/lib/auth-verify";
import { errorResponse } from "@/lib/api-errors";
import { NextRequest, NextResponse } from "next/server";
import { polar } from "@/lib/polar";
import { adminDb } from "@/lib/firebase-admin";
import { parseJsonBody } from "@/lib/api-schema";
import { checkoutBody } from "@/lib/schemas/api-bodies";

/**
 * Starts a Polar checkout for an AI credit deposit (SCO-15). One pay-what-you-want product
 * (POLAR_CREDIT_PRODUCT_ID, minimum $5) with the amount pre-set; the paid order is credited to the
 * network by the Polar webhook. Any member of the network may top it up.
 */
async function handlePost(req: NextRequest, { requestId }: AuthorizedContext) {
  try {
    const parsed = await parseJsonBody(req, checkoutBody, {
      message: "Choose an amount between $5 and $500.",
    });
    if (!parsed.ok) return parsed.response;
    const { userId, organizationId, amountCents } = parsed.data;

    if (!adminDb) {
      return NextResponse.json({ error: "Server configuration error: database unavailable" }, { status: 500 });
    }

    const [orgDoc, userDoc] = await Promise.all([
      adminDb.collection("organizations").doc(organizationId).get(),
      adminDb.collection("users").doc(userId).get(),
    ]);
    if (!orgDoc.exists) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }
    const orgData = orgDoc.data();
    const isOwner = orgData?.ownerId === userId;
    const isMember = userDoc.data()?.organizationId === organizationId;
    if (!isOwner && !isMember) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const productId = process.env.POLAR_CREDIT_PRODUCT_ID;
    if (!productId) {
      console.error("[checkout] POLAR_CREDIT_PRODUCT_ID is not set.");
      // `error` is pinned by a characterization test; `message` (read first by the billing page) stays generic.
      return NextResponse.json(
        { error: "Configuration Error", message: "Top-ups are not available right now.", requestId },
        { status: 400 },
      );
    }

    try {
      const result = await polar.checkouts.create({
        products: [productId],
        amount: amountCents,
        successUrl: `${process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin}/teacher/network/billing?success=true`,
        metadata: {
          kind: "ai_credit",
          organizationId: String(organizationId),
          userId: String(userId),
        },
        ...(userDoc.data()?.email ? { customerEmail: String(userDoc.data()?.email) } : {}),
      });

      if (!result?.url) {
        return NextResponse.json({ error: "No checkout URL returned from Polar" }, { status: 500 });
      }
      return NextResponse.json({ url: result.url });
    } catch (polarError: unknown) {
      // Upstream message and body stay in the log; the billing page shows `error` (RT-17, C-009).
      console.error(
        `[checkout] Polar checkout failed (requestId=${requestId}):`,
        polarError instanceof Error ? polarError.name : "unknown",
      );
      return NextResponse.json({ error: "We could not start checkout. Please try again.", requestId }, { status: 502 });
    }
  } catch (error: unknown) {
    return errorResponse(error, "checkout", requestId);
  }
}

export const POST = withAuthorizedRequest(handlePost, { identityField: "userId", teacher: true, rateLimit: "checkout" });
