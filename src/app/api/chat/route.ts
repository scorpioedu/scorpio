import { withAuthorizedRequest, type AuthorizedContext } from "@/lib/auth-verify";
import { errorResponse } from "@/lib/api-errors";
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import chatbotConfig from '@/lib/chatbot-config.json';
import { getNavigationResponse } from '@/lib/ai/chatbot';
import { checkBudget, recordUsage } from '@/lib/usage-limit';
import { parseJsonBody } from '@/lib/api-schema';
import { navigationChatBody } from '@/lib/schemas/api-bodies';

async function handlePost(req: NextRequest, { requestId }: AuthorizedContext) {
  try {
    const parsed = await parseJsonBody(req, navigationChatBody, { message: 'Missing required fields' });
    if (!parsed.ok) return parsed.response;
    const { message, userRole, userId } = parsed.data;

    if (!adminDb) {
      return NextResponse.json({ error: 'Database not initialized' }, { status: 500 });
    }

    // 1. Resolve OrganizationId from User ID
    const userDoc = await adminDb.collection("users").doc(userId).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }
    const userData = userDoc.data();
    let organizationId = userData?.organizationId;

    // Fallback: students may not have organizationId directly — inherit from teacher
    if (!organizationId && userData?.teacherId) {
      const teacherDoc = await adminDb.collection("users").doc(userData.teacherId).get();
      organizationId = teacherDoc.data()?.organizationId;
    }

    if (!organizationId) {
      return NextResponse.json({ error: "You must be enrolled in an active Scorpio Network to use AI features." }, { status: 403 });
    }

    console.log(`[NavAI] Message from ${userId} (${userRole}), Org: ${organizationId}`);

    // 2. Check Budget for Organization
    const budgetCheck = await checkBudget(organizationId, "navigation");
    if (!budgetCheck.allowed) {
      return NextResponse.json({ error: budgetCheck.error }, { status: 403 });
    }

    // AI Response using centralized logic in gemini.ts ---
    const features = userRole === 'teacher' ? chatbotConfig.teacherFeatures : chatbotConfig.studentFeatures;
    const featuresContext = features.map(f => `- ${f.label} (${f.path}) - ${f.description}`).join('\n');
    
    const result = await getNavigationResponse(
      message,
      userRole,
      featuresContext,
      chatbotConfig.systemPrompt
    );

    // Record precise token-based usage
    if (result.usage) {
      await recordUsage(organizationId, "navigation", result.usage.inputTokens, result.usage.outputTokens);
    }

    return NextResponse.json({ 
      text: result.text,
      suggestedPrompts: userRole === 'teacher' 
        ? chatbotConfig.teacherSuggestedPrompts 
        : chatbotConfig.studentSuggestedPrompts
    });

  } catch (error: unknown) {
    return errorResponse(error, 'chat', requestId);
  }
}

export const POST = withAuthorizedRequest(handlePost, {"identityField": "userId", "teacher": false, "feature": "navigation", "rateLimit": "chat"});
