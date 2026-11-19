import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { withAuthorizedRequest } from "@/lib/auth-verify";
import { adminDb, adminFieldWithValue } from "@/lib/firebase-admin";
import { mergeAnswerKey, splitAssignmentQuestions } from "@/lib/assignment-security";
import { parseJsonBody } from "@/lib/api-schema";
import { cloneAssignmentBody } from "@/lib/schemas/api-bodies";
import { errorResponse } from "@/lib/api-errors";
import { parseAssignmentDefaults } from "@/lib/assignment-defaults";
import {
  assertValidAnswerKeys,
  assignmentAccess,
  normalizeForkedAnswer,
  stripQuestionKey,
} from "@/lib/answer-key-access";
import {
  PlanGateError,
  assertCanCloneAssignment,
  planGateResponse,
  resolveCallerPlan,
} from "@/lib/plan-gates";

/** Settings copied from the source; everything else (owner, class, sharing, due date) belongs to the copy. */
const COPIED_FIELDS = [
  "description",
  "topic",
  "timeLimit",
  "requireWorkSubmission",
  "enableTabDetection",
  "lockdownMode",
  "allowAIHelp",
  "allowCalculator",
  "totalPoints",
  "type",
  "googleFormLink",
  "apCourse",
  "apUnit",
  "apTopics",
  "curriculumId",
  "curriculumSetKey",
  "curriculumSequence",
] as const;

/**
 * POST /api/assignments/clone { sourceId, courseId?, title?, dueDate? } -> { id }
 * Copies an assignment the caller can read (own, global, or shared with their network) into a new
 * private assignment they own. The answer key is copied server-side (assignment_keys/{sourceId} ->
 * assignment_keys/{newId}) and is never returned. Free plans may copy their own assignments and every
 * global waypoint; department (network) waypoints need a Department License (403 { code: 'plan_upgrade_required', feature, hasNoOrg }).
 */
export const POST = withAuthorizedRequest(
  async (req, { caller, profile, requestId }) => {
    const parsed = await parseJsonBody(req, cloneAssignmentBody, { message: "Invalid request" });
    if (!parsed.ok) return parsed.response;
    const { sourceId, courseId, title, dueDate } = parsed.data;

    const sourceRef = adminDb.collection("assignments").doc(sourceId);
    const source = (await sourceRef.get()).data();
    if (!source || !assignmentAccess(source, caller.uid, profile))
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    let classDefaults: ReturnType<typeof parseAssignmentDefaults> = null;
    if (courseId) {
      const course = (await adminDb.collection("courses").doc(courseId).get()).data();
      if (course?.teacherId !== caller.uid)
        return NextResponse.json({ error: "Invalid class" }, { status: 403 });
      classDefaults = parseAssignmentDefaults(course.assignmentDefaults);
    }

    let split: ReturnType<typeof splitAssignmentQuestions>;
    let rubric: string;
    try {
      assertCanCloneAssignment({
        plan: await resolveCallerPlan(profile.organizationId),
        source,
        callerUid: caller.uid,
      });
      const key = (await adminDb.collection("assignment_keys").doc(sourceId).get()).data();
      const merged = mergeAnswerKey(source, key);
      rubric = typeof merged.rubric === "string" ? merged.rubric : "";
      // New question ids; each answer moves with its question, so the copy's key matches its questions.
      const questions = merged.questions.map((question) => {
        const { type, answer } = normalizeForkedAnswer(
          question,
          String(question.correctAnswer ?? ""),
        );
        const copy: Record<string, unknown> = {
          ...stripQuestionKey(question),
          id: randomUUID(),
          correctAnswer: answer,
        };
        if (Array.isArray(question.distractors)) copy.distractors = question.distractors;
        if (type !== undefined) copy.type = type;
        if (copy.points === undefined) copy.points = 10;
        return copy;
      });
      assertValidAnswerKeys(questions);
      split = splitAssignmentQuestions(questions);
    } catch (error) {
      if (error instanceof PlanGateError) return planGateResponse(error);
      return errorResponse(error, "assignments/clone", requestId);
    }

    const copied: Record<string, unknown> = {};
    for (const field of COPIED_FIELDS)
      if (source[field] !== undefined) copied[field] = source[field];
    const ref = adminDb.collection("assignments").doc();
    const batch = adminDb.batch();
    batch.set(ref, {
      ...copied,
      // The source's own title: students see it, and a "(Copy)" suffix means nothing to them.
      title:
        title ?? (typeof source.title === "string" && source.title ? source.title : "Untitled"),
      gradingType:
        typeof source.gradingType === "string" && source.gradingType ? source.gradingType : "ai",
      // The class's own settings win over the source's, so every assignment in it behaves alike.
      // No class time limit leaves the source's own limit (e.g. a timed unit test) alone.
      ...(classDefaults
        ? { ...classDefaults, timeLimit: classDefaults.timeLimit ?? copied.timeLimit ?? null }
        : {}),
      teacherId: caller.uid,
      organizationId: profile.organizationId || null,
      courseId: courseId || null,
      visibility: "private",
      questions: split.publicQuestions,
      rubric: null,
      answerKeySeparated: true,
      forkedFrom: sourceId,
      forkCount: 0,
      dueDate: dueDate ? new Date(dueDate) : null,
      createdAt: new Date(),
    });
    batch.set(adminDb.collection("assignment_keys").doc(ref.id), {
      answers: split.answers,
      ...(Object.keys(split.distractors).length ? { distractors: split.distractors } : {}),
      rubric,
      teacherId: caller.uid,
    });
    if (source.teacherId !== caller.uid)
      batch.update(sourceRef, { forkCount: adminFieldWithValue.increment(1) });
    await batch.commit();
    return NextResponse.json({ id: ref.id });
  },
  { teacher: true, rateLimit: "write" },
);
