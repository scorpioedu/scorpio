import { withAuthorizedRequest, type AuthorizedContext } from "@/lib/auth-verify";
import { errorResponse } from "@/lib/api-errors";
import { NextRequest, NextResponse } from "next/server";
import { diagramsOn, explainPhysicsConcept, helpSolveProblem } from "@/lib/ai/tutor";
import { isApCourseId } from "@/data/ap";
import { adminDb } from "@/lib/firebase-admin";
import { checkBudget, recordUsage } from "@/lib/usage-limit";
import { verifyCallerIdentity } from "@/lib/auth-verify";
import { parseJsonBody } from "@/lib/api-schema";
import { tutorBody } from "@/lib/schemas/api-bodies";

async function handlePost(req: NextRequest, { requestId }: AuthorizedContext) {
  try {
    const parsed = await parseJsonBody(req, tutorBody, { message: "Invalid request body" });
    if (!parsed.ok) return parsed.response;
    const { message, userId, role, mode, chatHistory, assignmentContext, assignmentId } = parsed.data;

    if (!message || !userId || role !== "student") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const authCheck = await verifyCallerIdentity(req, userId);
    if (!authCheck.authorized) {
      return NextResponse.json({ error: authCheck.error }, { status: 403 });
    }

    if (!adminDb) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
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
      return NextResponse.json({ error: "You must be enrolled in an active Scorpio Network to use Raise." }, { status: 403 });
    }

    // 2.5 Resolve Student Names for PII Scrubbing
    let studentNames: string[] = [];
    try {
      // Get all students for the teacher to mask fellow student names in the conversation
      const teacherId = userData?.teacherId || userId;
      const studentsSnapshot = await adminDb.collection("users")
        .where("teacherId", "==", teacherId)
        .where("role", "==", "student")
        .get();
      
      studentNames = studentsSnapshot.docs.map(doc => doc.data().displayName || doc.data().name).filter(Boolean);
      
      // Also include current user just in case
      if (userData?.displayName && !studentNames.includes(userData.displayName)) {
        studentNames.push(userData.displayName);
      }
    } catch (e) {
      console.error("Error resolving student names for scrubbing:", e);
    }

    // 2. Check Budget for Organization AND Student specific limits
    const budgetCheck = await checkBudget(organizationId, "tutor", userId);
    if (!budgetCheck.allowed) {
      return NextResponse.json({ error: budgetCheck.error }, { status: 403 });
    }

    // 2.6 The assignment's AP course, read from the assignment itself (the client only names the
    // assignment). It only narrows the diagram reference, so it is looked up only when diagrams are
    // on, and anything unexpected (no id, another teacher's assignment, no course) means "unknown".
    let course: string | undefined;
    if (mode !== "concept" && assignmentId && !assignmentId.includes("/")) {
      try {
        const assignment = diagramsOn()
          ? (await adminDb.collection("assignments").doc(assignmentId).get()).data()
          : undefined;
        if (
          assignment &&
          userData?.teacherId &&
          assignment.teacherId === userData.teacherId &&
          isApCourseId(assignment.apCourse)
        )
          course = assignment.apCourse;
      } catch (e) {
        console.error("Error resolving assignment course for tutor:", e);
      }
    }

    // 3. Perform AI Operation
    const result = mode === "concept" 
      ? await explainPhysicsConcept(message, chatHistory, "FULL", studentNames)
      : await helpSolveProblem(message, chatHistory, "STRICT_CONCISE", assignmentContext ?? undefined, studentNames, ...(course ? [course] : []));

    // 4. Record usage if possible
    if (result.usage) {
      await recordUsage(
        organizationId, 
        "tutor", 
        result.usage.inputTokens, 
        result.usage.outputTokens,
        userId
      );
    }

    return NextResponse.json({ response: result.text });
  } catch (error) {
    // AiProviderError/AiBudgetError -> 502/503 with generic text; the client shows a retry state and stores nothing.
    return errorResponse(error, "tutor", requestId);
  }
}

export const POST = withAuthorizedRequest(handlePost, {"identityField": "userId", "teacher": false, "feature": "tutor", "rateLimit": "tutor"});
