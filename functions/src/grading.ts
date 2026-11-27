import { reserveBudget, settleBudget, estimateMaximumCost } from "./metering";
import * as admin from "firebase-admin";
import { onDocumentUpdated, onDocumentCreated } from "firebase-functions/v2/firestore";
import { GoogleGenAI } from "@google/genai";
import { defineSecret } from "firebase-functions/params";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import { scrubPII } from "./pii";
import { gradeWithModel, GradeResult } from "./grading-schema";
import {
  GRADING_CONCURRENCY,
  GRADING_MEMORY,
  GRADING_TIMEOUT_SECONDS,
  isAutoGraded,
  processGradingWith,
  sweepStuckSubmissions,
} from "./grading-runner";
import {
  DRAFT_REVIEW_REASON,
  draftDocument,
  gradeSubmissionAnswers,
  holdAiDrafts,
  needsAi,
  type AiGrader,
  type GradableQuestion,
  type SubmittedAnswer,
} from "./grading-core";
import { recordMisconceptionEvents } from "./misconception-events";
import { evaluateBudget } from "./budget-policy";
import { nonDefaultApCourse, type ApCourseKey } from "./misconceptions";

const resendApiKey = defineSecret("RESEND_API_KEY");

// Initialize the modern Google Gen AI SDK configured for Vertex AI
const client = new GoogleGenAI({
  vertexai: true,
  project: process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID,
  location: "us-central1",
});

/**
 * GRADE RESPONSE - Re-implemented using modern @google/genai SDK
 */
async function gradeResponseAI(
  question: string,
  answer: string,
  rubric?: string,
  studentNames: string[] = [],
  organizationId: string = "",
  reference?: string,
  apCourse?: ApCourseKey,
): Promise<GradeResult> {
  try {
    if (!question || !answer) {
      return {
        score: 0,
        feedback: "Missing question or answer text for grading.",
        reasoning: "",
        misconceptions: [],
        needsReview: false,
      };
    }

    return await gradeWithModel(
      { question, answer, rubric, reference, apCourse },
      async (request) => {
        // Same choke-point rule as callGeminiDirect: nothing leaves unscrubbed (patterns only; roster names
        // were already masked in the inputs and must not hit our own template words). Idempotent, so the
        // already-scrubbed question/answer/rubric inside the prompt are unchanged.
        const systemInstruction = scrubPII(request.systemInstruction);
        const userPrompt = scrubPII(request.userPrompt);
        const promptBytes = Buffer.byteLength(systemInstruction) + Buffer.byteLength(userPrompt);
        if (promptBytes > 100000) throw new Error("Submission is too long for AI grading");
        const reservation = await reserveBudget(
          admin.firestore(),
          organizationId,
          "grading",
          undefined,
          estimateMaximumCost(promptBytes, 1024),
        );
        // Modern @google/genai syntax
        const result = await client.models.generateContent({
          model: "gemini-3.8-flash",
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          config: {
            systemInstruction,
            maxOutputTokens: 1024,
            thinkingConfig: { thinkingBudget: 0 },
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        });

        if (!result.usageMetadata) throw new Error("Provider usage missing; reservation retained");
        await settleBudget(
          admin.firestore(),
          reservation,
          result.usageMetadata.promptTokenCount || 0,
          (result.usageMetadata.candidatesTokenCount || 0) +
            (result.usageMetadata.thoughtsTokenCount || 0),
        );
        return {
          text: result.text || "",
          usage: {
            inputTokens: result.usageMetadata.promptTokenCount || 0,
            outputTokens: result.usageMetadata.candidatesTokenCount || 0,
          },
        };
      },
      {
        scrub: (text) => scrubPII(text, studentNames),
        defaultFeedback: "Submission received and pending final review.",
      },
    );
  } catch (error: unknown) {
    logger.error("Error in gradeResponseAI", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error("AI grading unavailable; manual review required");
  }
}

/**
 * MAIN GRADING PROCESSOR
 */
async function gradeSubmission(submissionId: string, submissionData: admin.firestore.DocumentData) {
  const db = admin.firestore();
  const assignmentId = submissionData.assignmentId;
  const studentId = submissionData.studentId;

  const assignmentSnap = await db.collection("assignments").doc(assignmentId).get();
  if (!assignmentSnap.exists) return;
  const assignmentData = assignmentSnap.data();
  if (!isAutoGraded(assignmentData)) return;

  const key = (await db.collection("assignment_keys").doc(assignmentId).get()).data();
  const questions = ((assignmentData?.questions || []) as GradableQuestion[]).map((q) => ({
    ...q,
    correctAnswer: key?.answers?.[q.id] ?? q.correctAnswer,
    distractors: key?.distractors?.[q.id],
  }));
  const answers: SubmittedAnswer[] = submissionData?.answers || [];
  const globalRubric = key?.rubric || assignmentData?.rubric || "";

  // Multiple choice, true/false and numeric answers never need the AI, so they are graded even
  // without an AI budget. Free-response answers are flagged for the teacher when there is none.
  let aiGrader: AiGrader | undefined;
  if (needsAi(questions, answers)) {
    const studentData = (await db.collection("users").doc(studentId).get()).data();
    let organizationId = studentData?.organizationId;
    if (!organizationId && studentData?.role === "student" && studentData?.teacherId) {
      const teacherDoc = await db.collection("users").doc(studentData.teacherId).get();
      organizationId = teacherDoc.data()?.organizationId;
    }
    const org = organizationId
      ? (await db.collection("organizations").doc(organizationId).get()).data()
      : undefined;
    // The network's credit (free monthly allowance, bonus, paid) and its optional monthly cap. Each
    // call is still reserved and settled by gradeResponseAI; this only avoids starting without any.
    const budgetOk = evaluateBudget(org, null, "grading").allowed;
    if (!organizationId) logger.error("No organization found for grading budget", { submissionId });
    if (budgetOk) {
      const studentNames = await rosterNames(db, studentData, submissionId);
      aiGrader = (input) =>
        gradeResponseAI(
          input.question,
          input.answer,
          input.rubric,
          studentNames,
          organizationId,
          input.reference,
          input.apCourse,
        );
    }
  }

  const result = await gradeSubmissionAnswers(questions, answers, {
    aiGrader,
    globalRubric,
    apCourse: nonDefaultApCourse(assignmentData?.apCourse),
    concurrency: GRADING_CONCURRENCY,
    defaultFeedback: "Submission received and pending final review.",
  });

  const recordEvents = (final: boolean) =>
    recordMisconceptionEvents(
      db,
      {
        submissionId,
        studentId,
        assignmentId,
        assignment: assignmentData,
        answers: result.answers,
        final,
      },
      (error) =>
        logger.error("Failed to record misconception events", {
          submissionId,
          error: error instanceof Error ? error.message : String(error),
        }),
    );

  // Anything the AI scored is a draft: it waits in submission_drafts (teacher-only) and the
  // submission, which the student can read, holds nothing from the AI until the teacher saves.
  const hold = holdAiDrafts(result.answers);
  if (hold.held > 0 || result.reviewReasons.length > 0) {
    if (Object.keys(hold.drafts).length > 0) {
      await db
        .collection("submission_drafts")
        .doc(submissionId)
        .set(draftDocument({ assignmentId, studentId }, hold.drafts));
    }
    const reason =
      result.reviewReasons.length === 0
        ? DRAFT_REVIEW_REASON
        : aiGrader || !result.reviewReasons.every((r) => r.startsWith("AI grading unavailable"))
          ? result.reviewReasons[0]
          : "AI budget unavailable";
    await db.collection("submissions").doc(submissionId).update({
      answers: hold.answers,
      earnedPoints: hold.earnedPoints,
      totalPoints: result.totalPoints,
      graded: false,
      status: "pending_review",
      gradingError: reason,
    });
    await recordEvents(false);
    logger.info("Submission waits for the teacher", {
      submissionId,
      heldAnswers: hold.held,
      drafts: Object.keys(hold.drafts).length,
      flaggedAnswers: result.reviewReasons.length,
    });
    return;
  }

  await db.collection("submissions").doc(submissionId).update({
    score: result.score,
    totalPoints: result.totalPoints,
    earnedPoints: result.earnedPoints,
    answers: result.answers,
    graded: true,
    status: "graded",
    gradedAt: new Date(),
  });

  await recordEvents(true);
  logger.info("Successfully graded submission", { submissionId, aiCalls: result.aiCalls });
}

async function rosterNames(
  db: admin.firestore.Firestore,
  studentData: admin.firestore.DocumentData | undefined,
  submissionId: string,
): Promise<string[]> {
  const names: string[] = [];
  try {
    const teacherId = studentData?.teacherId;
    if (teacherId) {
      const studentsSnapshot = await db
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
    logger.error("Error resolving student names", {
      submissionId,
      error: e instanceof Error ? e.message : String(e),
    });
  }
  return names;
}

/**
 * FIRESTORE TRIGGERS
 */
async function processGrading(submissionId: string) {
  await processGradingWith(admin.firestore(), submissionId, gradeSubmission);
}

export const onSubmissionCreated = onDocumentCreated(
  {
    document: "submissions/{submissionId}",
    secrets: [resendApiKey],
    timeoutSeconds: GRADING_TIMEOUT_SECONDS,
    memory: GRADING_MEMORY,
  },
  async (event) => {
    const submissionData = event.data?.data();
    if (submissionData && submissionData.status === "submitted" && !submissionData.graded) {
      await processGrading(event.params.submissionId);
    }
  },
);

export const onSubmissionUpdated = onDocumentUpdated(
  {
    document: "submissions/{submissionId}",
    secrets: [resendApiKey],
    timeoutSeconds: GRADING_TIMEOUT_SECONDS,
    memory: GRADING_MEMORY,
  },
  async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();

    if (
      afterData &&
      afterData.status === "submitted" &&
      beforeData?.status !== "submitted" &&
      !afterData.graded
    ) {
      await processGrading(event.params.submissionId);
    }
  },
);

/**
 * Safety net: a platform timeout or crash skips the trigger's catch block, so periodically move
 * AI submissions stuck in `submitted` to `pending_review` for teacher attention.
 */
export const sweepStuckGrading = onSchedule(
  {
    schedule: "every 15 minutes",
    timeoutSeconds: 120,
    memory: "256MiB",
  },
  async () => {
    await sweepStuckSubmissions(admin.firestore());
  },
);
