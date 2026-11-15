import { withAuthorizedRequest, type AuthorizedContext } from "@/lib/auth-verify";
import { errorResponse } from "@/lib/api-errors";
import { NextRequest, NextResponse } from "next/server";
import { parseQuestionsFromText } from "@/lib/ai/assignment";
import { adminDb } from "@/lib/firebase-admin";
import { checkBudget, recordUsage } from "@/lib/usage-limit";
import { parseJsonBody } from "@/lib/api-schema";
import { aiParseBody } from "@/lib/schemas/api-bodies";

async function handlePost(req: NextRequest, { requestId }: AuthorizedContext) {
  try {
    const parsed = await parseJsonBody(req, aiParseBody, { message: "Missing required fields" });
    if (!parsed.ok) return parsed.response;
    const { text, userId } = parsed.data;

    if (!adminDb) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    // 1. Resolve OrganizationId from User ID
    const userDoc = await adminDb.collection("users").doc(userId).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }
    const userData = userDoc.data();
    const organizationId = userData?.organizationId;

    if (!organizationId) {
      return NextResponse.json({ error: "No organization found for user" }, { status: 403 });
    }

    // 2. Check Budget for Organization
    const budgetCheck = await checkBudget(organizationId, "generation");
    if (!budgetCheck.allowed) {
      return NextResponse.json({ error: budgetCheck.error }, { status: 403 });
    }

    // 3. Perform AI Parsing
    const result = await parseQuestionsFromText(text);

    // 4. Record cumulative usage from result or totalPromptTokens/totalCandidateTokens logic inside the function
    // For simplicity, we'll assume the result already summed usage. 
    // In gemini.ts, parseQuestionsFromText returns combined usage.
    if (result.usage) {
      await recordUsage(
        organizationId, 
        "parse", 
        result.usage.inputTokens || 0, 
        result.usage.outputTokens || 0
      );
    }

    return NextResponse.json({ questions: result.questions });
  } catch (error: unknown) {
    return errorResponse(error, "ai-parse", requestId);
  }
}

export const POST = withAuthorizedRequest(handlePost, {"identityField": "userId", "teacher": true, "feature": "ai-parse", "rateLimit": "parse"});
