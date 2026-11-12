import { reserveBudget, settleBudget, estimateMaximumCost } from "./metering";
import * as admin from "firebase-admin";
import { onDocumentUpdated, onDocumentCreated } from "firebase-functions/v2/firestore";
import { GoogleGenAI } from "@google/genai";
import { defineSecret } from "firebase-functions/params";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import { scrubPII } from "./pii";
import { gradeWithModel, GradeResult } from "./grading-schema";
import { GRADING_CONCURRENCY, GRADING_MEMORY, GRADING_TIMEOUT_SECONDS, mapWithConcurrency, processGradingWith, sweepStuckSubmissions } from "./grading-runner";

const resendApiKey = defineSecret("RESEND_API_KEY");

// Initialize the modern Google Gen AI SDK configured for Vertex AI
const client = new GoogleGenAI({
    vertexai: true,
    project: process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID,
    location: "us-central1"
});

/**
 * GRADE RESPONSE - Re-implemented using modern @google/genai SDK
 */
async function gradeResponseAI(
  question: string,
  answer: string,
  rubric?: string,
  studentNames: string[] = [],
  organizationId: string = ""
): Promise<GradeResult> {
  try {
    if (!question || !answer) {
      return { score: 0, feedback: "Missing question or answer text for grading.", reasoning: "", needsReview: false };
    }

    return await gradeWithModel(
      { question, answer, rubric },
      async (request) => {
        // Same choke-point rule as callGeminiDirect: nothing leaves unscrubbed (patterns only; roster names
        // were already masked in the inputs and must not hit our own template words). Idempotent, so the
        // already-scrubbed question/answer/rubric inside the prompt are unchanged.
        const systemInstruction = scrubPII(request.systemInstruction);
        const userPrompt = scrubPII(request.userPrompt);
        const promptBytes = Buffer.byteLength(systemInstruction) + Buffer.byteLength(userPrompt);
        if (promptBytes > 100000) throw new Error('Submission is too long for AI grading');
        const reservation = await reserveBudget(admin.firestore(), organizationId, 'grading', undefined, estimateMaximumCost(promptBytes, 1024));
        // Modern @google/genai syntax
        const result = await client.models.generateContent({
          model: "gemini-3.8-flash",
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          config: {
            systemInstruction,
            maxOutputTokens: 1024,
            thinkingConfig: { thinkingBudget: 0 },
            temperature: 0.1,
            responseMimeType: "application/json",
          }
        });

        if (!result.usageMetadata) throw new Error('Provider usage missing; reservation retained');
        await settleBudget(admin.firestore(), reservation, result.usageMetadata.promptTokenCount || 0,
          (result.usageMetadata.candidatesTokenCount || 0) + (result.usageMetadata.thoughtsTokenCount || 0));
        return {
          text: result.text || "",
          usage: {
            inputTokens: result.usageMetadata.promptTokenCount || 0,
            outputTokens: result.usageMetadata.candidatesTokenCount || 0
          }
        };
      },
      { scrub: (text) => scrubPII(text, studentNames), defaultFeedback: "Submission received and pending final review." }
    );
  } catch (error: unknown) {
    logger.error("Error in gradeResponseAI", { error: error instanceof Error ? error.message : String(error) });
    throw new Error("AI grading unavailable; manual review required");
  }
}

interface GradableQuestion { id: string; text: string; type?: string; points?: number; correctAnswer?: string }
interface SubmittedAnswer { questionId: string; answer: string; [field: string]: unknown }

/**
 * MAIN GRADING PROCESSOR
 */
async function gradeSubmission(submissionId: string, submissionData: admin.firestore.DocumentData) {
    const db = admin.firestore();
    const assignmentId = submissionData.assignmentId;
    const studentId = submissionData.studentId;

    const studentDoc = await db.collection("users").doc(studentId).get();
    const studentData = studentDoc.data();
    let organizationId = studentData?.organizationId;

    if (!organizationId && studentData?.role === "student" && studentData?.teacherId) {
        const teacherDoc = await db.collection("users").doc(studentData.teacherId).get();
        organizationId = teacherDoc.data()?.organizationId;
    }

    if (!organizationId) {
        logger.error("No organization found for grading budget", { submissionId });
        return;
    }

    let studentNames: string[] = [];
    try {
        const teacherId = studentData?.teacherId;
        if (teacherId) {
            const studentsSnapshot = await db.collection("users")
                .where("teacherId", "==", teacherId)
                .where("role", "==", "student")
                .get();
            studentNames = studentsSnapshot.docs.map(doc => doc.data().displayName || doc.data().name).filter(Boolean);
        }
        const currentName = studentData?.displayName || studentData?.name;
        if (currentName && !studentNames.includes(currentName)) studentNames.push(currentName);
    } catch (e) { logger.error("Error resolving student names", { submissionId, error: e instanceof Error ? e.message : String(e) }); }

    const assignmentSnap = await db.collection('assignments').doc(assignmentId).get();
    if (!assignmentSnap.exists) return;
    const assignmentData = assignmentSnap.data();
    if (assignmentData?.gradingType !== 'ai') return;
    const org = (await db.collection('organizations').doc(organizationId).get()).data();
    if (!org || !['active','trialing'].includes(org.subscriptionStatus) || (org.aiBudgetLimit || 0) <= (org.aiUsageCurrent || 0)) {
      await db.collection('submissions').doc(submissionId).update({ status: 'pending_review', gradingError: 'AI budget unavailable', graded: false });
      return;
    }
    const key = (await db.collection('assignment_keys').doc(assignmentId).get()).data();
    const questions = ((assignmentData?.questions || []) as GradableQuestion[]).map((q) => ({ ...q, correctAnswer: key?.answers?.[q.id] ?? q.correctAnswer }));
    const answers = submissionData?.answers || [];
    const globalRubric = key?.rubric || assignmentData?.rubric || "";

    let totalScore = 0;
    let maxScore = 0;
    for (const q of questions) maxScore += (q.points || 10);

    let totalPromptTokens = 0;
    let totalCandidateTokens = 0;
    const reviewReasons: string[] = [];

    const gradedAnswers = await mapWithConcurrency(answers, GRADING_CONCURRENCY, async (ans: SubmittedAnswer) => {
        const question = questions.find((q) => q.id === ans.questionId);
        if (!question) return ans;

        const points = question.points || 10;
        let score = 0;
        let feedback = "";
        let reasoning = "";

        if ((question.type === "text" || question.type === "short-answer") && ans.answer) {
            const combinedRubric = [question.correctAnswer, globalRubric].filter(Boolean).join("\n\nGlobal Assignment Rubric:\n");
            const result = await gradeResponseAI(question.text, ans.answer, combinedRubric, studentNames, organizationId);
            if (result.usage) {
                totalPromptTokens += result.usage.inputTokens;
                totalCandidateTokens += result.usage.outputTokens;
            }
            if (result.needsReview) {
                // Suspected injection / implausible full marks: no score is recorded, a teacher decides.
                reviewReasons.push(result.reviewReason || "Teacher review required");
                return { ...ans, reviewFlag: result.reviewReason || "Teacher review required", aiSuggestedScore: (result.score / 10) * points, maxPoints: points };
            }
            feedback = result.feedback;
            reasoning = result.reasoning || "";
            score = (result.score / 10) * points;
        } else if (question.correctAnswer && (question.type === "multiple-choice" || question.type === "true-false")) {
            const isCorrect = ans.answer.trim().toLowerCase() === question.correctAnswer.trim().toLowerCase();
            score = isCorrect ? points : 0;
            feedback = isCorrect ? "Correct!" : `Incorrect. The correct answer was: ${question.correctAnswer}`;
        }

        totalScore += score;
        return { ...ans, feedback, reasoning, score, maxPoints: points };
    });

    if (reviewReasons.length > 0) {
        await db.collection('submissions').doc(submissionId).update({
            answers: gradedAnswers,
            graded: false,
            status: 'pending_review',
            gradingError: reviewReasons[0]
        });
        logger.warn("Submission routed to teacher review", { submissionId, flaggedAnswers: reviewReasons.length });
        return;
    }

    const finalScore = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;

    await db.collection('submissions').doc(submissionId).update({
        score: finalScore,
        totalPoints: maxScore,
        earnedPoints: totalScore,
        answers: gradedAnswers,
        graded: true,
        status: 'graded',
        gradedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    logger.info("Successfully graded submission", { submissionId });

    // --- EMAIL NOTIFICATION (DISABLED) ---
    // if (studentData?.email && finalScore !== undefined) {
    //     try {
    //         const courseName = "Scorpio Platform"; // Future improvement: fetch class name if available
    //         await sendEmail({
    //             apiKey: resendApiKey.value(),
    //             to: studentData.email,
    //             subject: `Your Grade is Available: ${assignmentData?.title || 'Assignment'} - ${finalScore}%`,
    //             react: React.createElement(GradeAvailableEmail, {
    //                 studentName: studentData.displayName || studentData.name || "Student",
    //                 assignmentName: assignmentData?.title || 'Assignment',
    //                 courseName,
    //                 score: finalScore,
    //                 maxScore: 100, // finalScore is currently normalized to 100 percentage points above
    //                 link: `https://scorpioedu.org/dashboard/student/assignments/${assignmentId}`
    //             })
    //         });
    //         console.log(`Grade available email successfully triggered for ${studentData.email}`);
    //     } catch (error) {
    //         console.error("Failed to send grade notification email:", error);
    //     }
    // }
}

/**
 * FIRESTORE TRIGGERS
 */
async function processGrading(submissionId: string) {
  await processGradingWith(admin.firestore(), submissionId, gradeSubmission);
}

export const onSubmissionCreated = onDocumentCreated({
    document: "submissions/{submissionId}",
    secrets: [resendApiKey],
    timeoutSeconds: GRADING_TIMEOUT_SECONDS,
    memory: GRADING_MEMORY
}, async (event) => {
    const submissionData = event.data?.data();
    if (submissionData && submissionData.status === 'submitted' && !submissionData.graded) {
        await processGrading(event.params.submissionId);
    }
});

export const onSubmissionUpdated = onDocumentUpdated({
    document: "submissions/{submissionId}",
    secrets: [resendApiKey],
    timeoutSeconds: GRADING_TIMEOUT_SECONDS,
    memory: GRADING_MEMORY
}, async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();

    if (afterData && afterData.status === 'submitted' && beforeData?.status !== 'submitted' && !afterData.graded) {
        await processGrading(event.params.submissionId);
    }
});

/**
 * Safety net: a platform timeout or crash skips the trigger's catch block, so periodically move
 * AI submissions stuck in `submitted` to `pending_review` for teacher attention.
 */
export const sweepStuckGrading = onSchedule({
    schedule: "every 15 minutes",
    timeoutSeconds: 120,
    memory: "256MiB"
}, async () => {
    await sweepStuckSubmissions(admin.firestore());
});
