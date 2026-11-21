import { withAuthorizedRequest, type AuthorizedContext } from "@/lib/auth-verify";
import { errorResponse } from "@/lib/api-errors";
import { NextRequest, NextResponse } from "next/server";
import { generateAssignmentQuestions } from "@/lib/ai/assignment";
import { adminDb } from "@/lib/firebase-admin";
import { checkBudget, recordUsage } from "@/lib/usage-limit";
import { parseJsonBody } from "@/lib/api-schema";
import { aiGenerateBody } from "@/lib/schemas/api-bodies";

async function handlePost(req: NextRequest, { requestId }: AuthorizedContext) {
  try {
    const parsed = await parseJsonBody(req, aiGenerateBody, { message: "Missing required fields" });
    if (!parsed.ok) return parsed.response;
    const { topic, count, difficulty, questionType, userId, context } = parsed.data;

    if (!adminDb) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    // 1. Resolve OrganizationId from User ID (Teacher-only feature usually)
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

    // 3. Perform AI Generation. One request makes up to ceil(count / 10) + 1 generation calls and
    //    one answer-check call per batch; each call reserves and settles its own budget (ai/config.ts),
    //    and the whole request costs one "generate" rate-limit token.
    const result = await generateAssignmentQuestions(topic, count, difficulty, questionType, context ?? undefined);

    // 4. Record usage (Silent fail to not block response)
    if (result.usage) {
      try {
        await recordUsage(
          organizationId, 
          "generation", 
          result.usage.inputTokens || 0, 
          result.usage.outputTokens || 0
        );
      } catch (usageError) {
        console.error("Failed to record usage:", usageError);
      }
    }

    // Each question carries `answerCheck` ("agrees" | "disagrees" | "unchecked") for the editor;
    // `message` is set when fewer questions were made than asked for.
    return NextResponse.json({
      questions: result.questions,
      ...(result.message ? { message: result.message } : {}),
    });
  } catch (error: unknown) {
    return errorResponse(error, "ai-generate", requestId);
  }
}

export const POST = withAuthorizedRequest(handlePost, {"identityField": "userId", "teacher": true, "feature": "ai-generate", "rateLimit": "generate"});
