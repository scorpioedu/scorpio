import { withAuthorizedRequest, type AuthorizedContext } from "@/lib/auth-verify";
import { errorResponse } from "@/lib/api-errors";
import { NextRequest, NextResponse } from "next/server";
import { polar } from "@/lib/polar";
import { adminDb } from "@/lib/firebase-admin";
import { parseJsonBody } from "@/lib/api-schema";
import { checkoutBody } from "@/lib/schemas/api-bodies";

async function handlePost(req: NextRequest, { requestId }: AuthorizedContext) {
  try {
    const parsed = await parseJsonBody(req, checkoutBody, { message: "Missing required fields" });
    if (!parsed.ok) return parsed.response;
    const { userId, organizationId, planId } = parsed.data;

    if (!adminDb) {
      return NextResponse.json({ error: "Server configuration error: database unavailable" }, { status: 500 });
    }

    // 1. Verify organization exists and user is the owner
    const orgDoc = await adminDb.collection("organizations").doc(organizationId).get();
    if (!orgDoc.exists) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }
    const orgData = orgDoc.data();
    if (orgData?.ownerId !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // 2. Define Polar Product IDs
    const products: Record<string, string | undefined> = {
      standard_monthly: process.env.POLAR_MONTHLY_ID,
      standard_yearly: process.env.POLAR_YEARLY_ID,
      // Transition fallbacks
      pro_monthly: process.env.POLAR_MONTHLY_ID,
      pro_yearly: process.env.POLAR_YEARLY_ID,
      scorpio_monthly: process.env.POLAR_MONTHLY_ID,
      scorpio_yearly: process.env.POLAR_YEARLY_ID,
      scorpio_pro: process.env.POLAR_PRODUCT_ID,
      department_monthly: process.env.POLAR_MONTHLY_ID,
      department_yearly: process.env.POLAR_YEARLY_ID,
      department_network: process.env.POLAR_PRODUCT_ID,
    };

    const productId = products[planId];
    if (!productId) {
      console.error(`Missing Polar ID for plan: ${planId}. Check .env.local.`);
      // `error` is pinned by a characterization test; `message` (read first by the billing page) no longer echoes env/plan details.
      return NextResponse.json({ error: "Configuration Error", message: "This plan is not available for checkout right now.", requestId }, { status: 400 });
    }

    // 3. Create Polar Checkout Session
    try {
      if (!polar) {
        return NextResponse.json({ error: "Polar SDK not initialized" }, { status: 500 });
      }

      // In @polar-sh/sdk v0.44.0, you must use the `products` array with Price IDs
      // Ensure POLAR_PRODUCT_ID in .env.local is a Price ID (starts with pri_)
      const checkoutOptions: any = {
        products: [productId], 
        successUrl: `${process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin}/teacher/network?success=true`,
        includeConfirmationEmail: true,
        metadata: {
          organizationId: String(organizationId),
          userId: String(userId),
          planId: String(planId),
        },
      };

      if (orgData?.ownerEmail) {
        checkoutOptions.customerEmail = orgData.ownerEmail;
      }

      const result = await polar.checkouts.create(checkoutOptions);

      if (!result || !result.url) {
        return NextResponse.json({ error: "No checkout URL returned from Polar" }, { status: 500 });
      }

      return NextResponse.json({ url: result.url });
    } catch (polarError: any) {
      // Upstream message and body stay in the log; the billing page shows `error` (RT-17, C-009).
      console.error(`[checkout] Polar checkout failed (requestId=${requestId}):`, polarError instanceof Error ? polarError.name : "unknown");
      return NextResponse.json({ error: "We could not start checkout. Please try again.", requestId }, { status: 502 });
    }
  } catch (error: unknown) {
    return errorResponse(error, "checkout", requestId);
  }
}

export const POST = withAuthorizedRequest(handlePost, {"identityField": "userId", "teacher": true, "rateLimit": "checkout"});
