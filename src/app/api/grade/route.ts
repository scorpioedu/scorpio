import { mergeAnswerKey } from "@/lib/assignment-security";
import { withAuthorizedRequest, type AuthorizedContext } from "@/lib/auth-verify";
import { errorResponse } from "@/lib/api-errors";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { gradeResponse } from "@/lib/ai/grading";
import { checkBudget, recordUsage } from "@/lib/usage-limit";
import { parseJsonBody } from "@/lib/api-schema";
import { gradeBody } from "@/lib/schemas/api-bodies";
import {
  gradeSubmissionAnswers,
  needsAi,
  type AiGrader,
  type GradableQuestion,
  type SubmittedAnswer,
} from "../../../../functions/src/grading-core";
import { recordMisconceptionEvents } from "../../../../functions/src/misconception-events";

async function handlePost(req: NextRequest, { requestId }: AuthorizedContext) {
  if (!adminDb) {
    console.error("Firebase Admin not initialized");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  try {
    const parsed = await parseJsonBody(req, gradeBody, { message: "Missing submissionId" });
    if (!parsed.ok) return parsed.response;
    const { submissionId } = parsed.data;

    // 1. Fetch Submission
    const submissionRef = adminDb.collection("submissions").doc(submissionId);
    const submissionSnap = await submissionRef.get();

    if (!submissionSnap.exists) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    const submissionData = submissionSnap.data();
    const assignmentId = submissionData?.assignmentId;
    const studentId = submissionData?.studentId;

    if (!assignmentId || !studentId) {
      return NextResponse.json({ error: "Invalid submission data" }, { status: 400 });
    }

    // 2. Fetch Assignment and its server-only answer key
    const assignmentSnap = await adminDb.collection("assignments").doc(assignmentId).get();
    if (!assignmentSnap.exists) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }
    const key = (await adminDb.collection("assignment_keys").doc(assignmentId).get()).data();
    const assignmentData = mergeAnswerKey(assignmentSnap.data()!, key);
    const questions = (assignmentData?.questions || []) as GradableQuestion[];
    const answers: SubmittedAnswer[] = submissionData?.answers || [];

    // 3. Only free-response answers reach the AI, so the budget and roster lookups are only needed then.
    let aiGrader: AiGrader | undefined;
    let organizationId: string | undefined;
    if (needsAi(questions, answers)) {
      const studentDoc = await adminDb.collection("users").doc(studentId).get();
      const studentData = studentDoc.exists ? studentDoc.data() : null;
      organizationId = studentData?.organizationId;
      // Fallback: If student doesn't have an organization, inherit from teacher
      if (!organizationId && studentData?.role === "student" && studentData?.teacherId) {
        const teacherDoc = await adminDb.collection("users").doc(studentData.teacherId).get();
        if (teacherDoc.exists) organizationId = teacherDoc.data()?.organizationId;
      }
      if (!organizationId) {
        return NextResponse.json(
          { error: "No organization found for grading budget." },
          { status: 403 },
        );
      }
      const budgetCheck = await checkBudget(organizationId, "grading");
      if (!budgetCheck.allowed) {
        return NextResponse.json({ error: budgetCheck.error }, { status: 403 });
      }
      const studentNames = await rosterNames(studentData);
      aiGrader = (input) =>
        gradeResponse(
          input.question,
          input.answer,
          input.rubric,
          studentNames,
          input.reference,
        ).then((r) => ({ ...r, reasoning: r.reasoning || "" }));
    }

    // 4. Grade (deterministic checks first, AI only where needed)
    let result: Awaited<ReturnType<typeof gradeSubmissionAnswers>>;
    try {
      result = await gradeSubmissionAnswers(questions, answers, {
        aiGrader,
        globalRubric: assignmentData?.rubric || "",
      });
    } catch (e) {
      console.error("AI Grading failed", e instanceof Error ? e.message : String(e));
      if (!submissionData?.graded)
        await submissionRef.update({
          status: "pending_review",
          gradingError: "AI grading unavailable",
          graded: false,
        });
      return NextResponse.json(
        { error: "AI grading failed. The existing grade was preserved; review manually or retry." },
        { status: 502 },
      );
    }

    const recordEvents = (final: boolean) =>
      recordMisconceptionEvents(
        adminDb,
        {
          submissionId,
          studentId,
          assignmentId,
          assignment: assignmentSnap.data(),
          answers: result.answers,
          final,
        },
        (e) =>
          console.error(
            "Failed to record misconception events",
            e instanceof Error ? e.message : String(e),
          ),
      );

    if (organizationId && (result.usage.inputTokens > 0 || result.usage.outputTokens > 0)) {
      await recordUsage(
        organizationId,
        "grading",
        result.usage.inputTokens,
        result.usage.outputTokens,
      );
    }

    if (result.reviewReasons.length > 0) {
      // Suspected prompt injection, implausible full marks or a missing key: never auto-finalise.
      if (!submissionData?.graded) {
        await submissionRef.update({
          answers: result.answers,
          status: "pending_review",
          gradingError: result.reviewReasons[0],
          graded: false,
        });
        await recordEvents(false);
      }
      return NextResponse.json(
        { success: false, pendingReview: true, reason: result.reviewReasons[0] },
        { status: 200 },
      );
    }

    // 5. Update Submission
    await submissionRef.update({
      score: result.score,
      totalPoints: result.totalPoints,
      earnedPoints: result.earnedPoints,
      answers: result.answers,
      graded: true,
      status: "graded",
      gradedAt: new Date(),
    });
    await recordEvents(true);

    return NextResponse.json({ success: true, score: result.score });
  } catch (error: unknown) {
    return errorResponse(error, "grade", requestId);
  }
}

/** Names of the student's classmates and the student, masked before any text reaches the AI. */
async function rosterNames(
  studentData: FirebaseFirestore.DocumentData | null | undefined,
): Promise<string[]> {
  const names: string[] = [];
  try {
    const teacherId = studentData?.teacherId;
    if (teacherId) {
      const studentsSnapshot = await adminDb
        .collection("users")
        .where("teacherId", "==", teacherId)
        .where("role", "==", "student")
        .get();
      names.push(
        ...studentsSnapshot.docs
          .map((doc) => doc.data().displayName || doc.data().name)
          .filter(Boolean),
      );
    }
    const currentName = studentData?.displayName || studentData?.name;
    if (currentName && !names.includes(currentName)) names.push(currentName);
  } catch (e) {
    console.error("Error resolving student names for scrubbing:", e);
  }
  return names;
}

export const POST = withAuthorizedRequest(handlePost, {
  identityField: undefined,
  teacher: true,
  resource: "submission",
  rateLimit: "grade",
});
