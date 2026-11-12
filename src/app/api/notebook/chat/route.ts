import { scrubPII } from "@/lib/ai/utils";
import { withAuthorizedRequest, type AuthorizedContext } from "@/lib/auth-verify";
import { errorResponse } from "@/lib/api-errors";
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminFieldWithValue } from '@/lib/firebase-admin';
import { checkBudget, recordUsage } from '@/lib/usage-limit';
import { getNotebookAssistantResponse } from "@/lib/ai/notebook";
import { parseJsonBody } from '@/lib/api-schema';
import { notebookChatBody } from '@/lib/schemas/api-bodies';

async function handlePost(req: NextRequest, { requestId }: AuthorizedContext) {
  if (!adminDb) {
    return NextResponse.json({ error: 'Database not initialized' }, { status: 500 });
  }

  try {
    const parsed = await parseJsonBody(req, notebookChatBody, { message: 'Missing required parameters' });
    if (!parsed.ok) return parsed.response;
    const { messages, studentId } = parsed.data;
    const notebookContent = parsed.data.notebookContent ?? undefined;

    // 1. Resolve Organization for budget
    const studentDoc = await adminDb.collection("users").doc(studentId).get();
    if (!studentDoc.exists) {
        return NextResponse.json({ error: "Student profile not found" }, { status: 404 });
    }
    const studentData = studentDoc.data();
    let organizationId = studentData?.organizationId;

    // Fallback: students may not have organizationId directly — inherit from teacher
    if (!organizationId && studentData?.teacherId) {
      const teacherDoc = await adminDb.collection("users").doc(studentData.teacherId).get();
      organizationId = teacherDoc.data()?.organizationId;
    }

    if (!organizationId) {
        return NextResponse.json({ error: "You must be enrolled in an active Scorpio Network to use notebook AI features." }, { status: 403 });
    }

    // 2. Check Notebook Budget
    const orgRef = adminDb.collection("organizations").doc(organizationId);
    const orgSnap = await orgRef.get();
    const orgData = orgSnap.data();

    const notebookLimit = orgData?.notebookLimit || 50;
    const notebookUsage = orgData?.notebookUsageCurrent || 0;

    if (notebookUsage >= notebookLimit) {
        return NextResponse.json({ error: "The monthly notebook AI limit for your network has been reached." }, { status: 403 });
    }

    const budgetCheck = await checkBudget(organizationId, "notebook", studentId);
    if (budgetCheck.allowed) {
        // 3. Generate AI Response using centralized gemini helper
        const result = await getNotebookAssistantResponse(messages.map(m => ({ ...m, content: scrubPII(m.content, [studentData?.displayName || ""]) })), scrubPII(notebookContent as string, [studentData?.displayName || ""]));
        const responseText = result.content;

        // 4. Record Usage and Increment Notebook Count
        if (result.usage) {
            await recordUsage(
              organizationId, 
              "notebook", 
              result.usage.inputTokens, 
              result.usage.outputTokens,
              studentId
            );
        }

        await orgRef.update({
            notebookUsageCurrent: adminFieldWithValue.increment(1)
        });

        return NextResponse.json({ content: responseText });
    }

    return NextResponse.json({ error: budgetCheck.error }, { status: 403 });

  } catch (error: unknown) {
    return errorResponse(error, 'notebook-chat', requestId);
  }
}

export const POST = withAuthorizedRequest(handlePost, {"identityField": "studentId", "teacher": false, "feature": "notebook", "rateLimit": "notebook"});
