import { reserveBudget, settleBudget, estimateMaximumCost } from "./metering";
import * as admin from "firebase-admin";
import { onDocumentUpdated, onDocumentCreated } from "firebase-functions/v2/firestore";
import { GoogleGenAI } from "@google/genai";
import { defineSecret } from "firebase-functions/params";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import { GRADING_CONCURRENCY, GRADING_MEMORY, GRADING_TIMEOUT_SECONDS, mapWithConcurrency, processGradingWith, sweepStuckSubmissions } from "./grading-runner";

const resendApiKey = defineSecret("RESEND_API_KEY");

// Initialize the modern Google Gen AI SDK configured for Vertex AI
const client = new GoogleGenAI({
    vertexai: true,
    project: process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID,
    location: "us-central1"
});

/**
 * SCRUB PII - Ported from src/lib/gemini.ts
 */
function scrubPII(text: string, studentNames: string[] = []): string {
  if (!text) return text;

  let scrubbed = text
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL]")
    .replace(/(\+\d{1,2}\s?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/g, "[PHONE]")
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[ID]")
    .replace(/\b(ID|Student\s?#?|ID\s?#?):?\s?\d{5,9}\b/gi, "[STUDENT_ID]")
    .replace(/\b\d+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}\s+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Ct|Court|Ter|Terrace|Way)\.?\b/gi, "[ADDRESS]")
    .replace(/(?:DOB|Birth|Born)(?:\s+on)?\s*[:\-]?\s*(\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b|\b[A-Z][a-z]{2,8}\s+\d{1,2},?\s+\d{4}\b)/gi, "[BIRTH_DATE]")
    .replace(/\b(19|20)\d{2}[\/\-]\d{1,2}[\/\-]\d{1,2}\b/g, "[DATE]")
    .replace(/\b\d{1,2}[\/\-]\d{1,2}[\/\-](19|20)\d{2}\b/g, "[DATE]")
    .replace(/\b(?:\d[ -]*?){13,16}\b/g, "[SENSITIVE]");

  if (studentNames.length > 0) {
    const nameParts = new Set<string>();
    studentNames.forEach(fullName => {
      if (!fullName) return;
      nameParts.add(fullName);
      const split = fullName.split(/\s+/);
      if (split.length > 1) {
        split.forEach(part => {
          if (part.length > 2 && !['and', 'the', 'with'].includes(part.toLowerCase())) {
            nameParts.add(part);
          }
        });
      }
    });

    const sortedParts = Array.from(nameParts).sort((a, b) => b.length - a.length);

    sortedParts.forEach((name) => {
      if (name && name.length > 2) {
        const nameRegex = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        scrubbed = scrubbed.replace(nameRegex, "[NAME]");
      }
    });
  }

  return scrubbed;
}

/**
 * GRADE RESPONSE - Re-implemented using modern @google/genai SDK
 */
async function gradeResponseAI(
  question: string,
  answer: string,
  rubric?: string,
  studentNames: string[] = [],
  organizationId: string = ""
): Promise<{
  score: number,
  feedback: string,
  reasoning?: string,
  usage?: { inputTokens: number, outputTokens: number }
}> {
  try {
    if (!question || !answer) {
      return { score: 0, feedback: "Missing question or answer text for grading." };
    }

    const prompt = `You are an expert Physics professor and evaluator.
    Your goal is to grade student responses with scientific rigor.

    QUESTION:
    "${scrubPII(question, studentNames)}"

    ${rubric ? `GRADING RUBRIC / CORRECT REFERENCE:\n"${scrubPII(rubric, studentNames)}"` : ''}

    STUDENT SUBMISSION:
    "${scrubPII(answer, studentNames)}"

    INSTRUCTIONS:
    1. UNIT SENSITIVITY: In physics, numbers without units are meaningless. If the numerical value is correct but units are missing or incorrect (e.g., Joules instead of Watts), penalize the score by 10-20%.
    2. VECTOR QUANTITIES: For vectors (Force, Velocity, Acceleration, Momentum), ensure the direction is identified if the question requires it.
    3. SIGNIFICANT FIGURES: Check if the precision of the answer is reasonable given the inputs.
    4. ERROR CARRIED FORWARD: If a student uses an incorrect answer from a previous part correctly in the current part, award full credit for the current part's logic.
    5. CALCULATION ERRORS: If the student shows correct logical derivation but makes a minor math error, award 50-70% partial credit.
    6. Provide a score from 0.0 to 10.0 (decimals allowed).
    7. Generate "technical_reasoning": Explain precisely why the score was given, citing units, vectors, or logic.
    8. Generate "student_feedback": Provide instructional feedback that helps correct physics misconceptions.
    9. Identify "misconceptions": List specific physics misunderstandings (e.g., "confusing mass with weight").

    Return ONLY a JSON object:
    {
      "score": number,
      "technical_reasoning": string,
      "student_feedback": string,
      "misconceptions": string[]
    }`;

    if (Buffer.byteLength(prompt) > 100000) throw new Error('Submission is too long for AI grading');
    const reservation = await reserveBudget(admin.firestore(), organizationId, 'grading', undefined, estimateMaximumCost(Buffer.byteLength(prompt), 1024));
    // Modern @google/genai syntax
    const result = await client.models.generateContent({
      model: "gemini-3.8-flash",
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        maxOutputTokens: 1024,
        thinkingConfig: { thinkingBudget: 0 },
        temperature: 0.1,
        responseMimeType: "application/json",
      }
    });

    if (!result.usageMetadata) throw new Error('Provider usage missing; reservation retained');
    await settleBudget(admin.firestore(), reservation, result.usageMetadata.promptTokenCount || 0,
      (result.usageMetadata.candidatesTokenCount || 0) + (result.usageMetadata.thoughtsTokenCount || 0));
    // Modern @google/genai response parsing
    const text = result.text || "";

    if (!text) {
        throw new Error("Empty response from @google/genai");
    }

    const startIdx = text.indexOf('{');
    const endIdx = text.lastIndexOf('}');
    if (startIdx === -1 || endIdx === -1) {
        throw new Error("Invalid response format: No JSON object found in AI output.");
    }

    const data = JSON.parse(text.substring(startIdx, endIdx + 1));

    if (!data || typeof data !== 'object') {
        throw new Error("Invalid response format from @google/genai");
    }

    if (typeof data.score !== "number" || !Number.isFinite(data.score)) throw new Error("Invalid score");
    let score = 0;
    if (typeof data.score === 'number') {
        score = Math.min(10, Math.max(0, data.score));
    } else if (typeof data.score === 'string') {
        if (data.score.includes('/')) {
            const parts = data.score.split('/');
            score = (parseFloat(parts[0]) / (parseFloat(parts[1]) || 10)) * 10;
        } else {
            score = parseFloat(data.score) || 0;
        }
    }

    return {
        score,
        feedback: data.student_feedback || data.feedback || "Submission received and pending final review.",
        reasoning: data.technical_reasoning || data.reasoning || "",
        usage: {
            inputTokens: result.usageMetadata?.promptTokenCount || 0,
            outputTokens: result.usageMetadata?.candidatesTokenCount || 0
        }
    };
  } catch (error: any) {
    logger.error("Error in gradeResponseAI", { error: error instanceof Error ? error.message : String(error) });
    throw new Error("AI grading unavailable; manual review required");
  }
}

/**
 * MAIN GRADING PROCESSOR
 */
async function gradeSubmission(submissionId: string, submissionData: any) {
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
    const questions = (assignmentData?.questions || []).map((q: any) => ({ ...q, correctAnswer: key?.answers?.[q.id] ?? q.correctAnswer }));
    const answers = submissionData?.answers || [];
    const globalRubric = key?.rubric || assignmentData?.rubric || "";

    let totalScore = 0;
    let maxScore = 0;
    for (const q of questions) maxScore += (q.points || 10);

    let totalPromptTokens = 0;
    let totalCandidateTokens = 0;

    const gradedAnswers = await mapWithConcurrency(answers, GRADING_CONCURRENCY, async (ans: any) => {
        const question = questions.find((q: any) => q.id === ans.questionId);
        if (!question) return ans;

        const points = question.points || 10;
        let score = 0;
        let feedback = "";
        let reasoning = "";

        if ((question.type === "text" || question.type === "short-answer") && ans.answer) {
            const combinedRubric = [question.correctAnswer, globalRubric].filter(Boolean).join("\n\nGlobal Assignment Rubric:\n");
            const result = await gradeResponseAI(question.text, ans.answer, combinedRubric, studentNames, organizationId);
            feedback = result.feedback;
            reasoning = result.reasoning || "";
            if (result.usage) {
                totalPromptTokens += result.usage.inputTokens;
                totalCandidateTokens += result.usage.outputTokens;
            }
            score = (result.score / 10) * points;
        } else if (question.correctAnswer && (question.type === "multiple-choice" || question.type === "true-false")) {
            const isCorrect = ans.answer.trim().toLowerCase() === question.correctAnswer.trim().toLowerCase();
            score = isCorrect ? points : 0;
            feedback = isCorrect ? "Correct!" : `Incorrect. The correct answer was: ${question.correctAnswer}`;
        }

        totalScore += score;
        return { ...ans, feedback, reasoning, score, maxPoints: points };
    });

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
