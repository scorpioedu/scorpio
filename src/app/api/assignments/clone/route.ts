import { pickSetProblems } from "@/lib/set-pick";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { withAuthorizedRequest } from "@/lib/auth-verify";
import { adminDb, adminFieldWithValue } from "@/lib/firebase-admin";
import { mergeAnswerKey, splitAssignmentQuestions } from "@/lib/assignment-security";
import { parseJsonBody } from "@/lib/api-schema";
import { cloneAssignmentBody } from "@/lib/schemas/api-bodies";
import { errorResponse } from "@/lib/api-errors";
import { parseAssignmentDefaults } from "@/lib/assignment-defaults";
import { DEFAULT_SET_SIZE } from "@/data/curricula";
import {
  assertValidAnswerKeys,
  assignmentAccess,
  normalizeForkedAnswer,
  stripQuestionKey,
} from "@/lib/answer-key-access";

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

/** Worked solutions by question id, server-only (no Firestore rule matches it). Written at publish. */
const SOLUTIONS = "assignment_solutions";

/**
 * POST /api/assignments/clone { sourceId, courseId?, title?, dueDate?, count?, pick?, hidden? } -> { id }
 * Copies an assignment the caller can read (own, global, or shared with their network) into a new
 * private assignment they own. The answer key is copied server-side (assignment_keys/{sourceId} ->
 * assignment_keys/{newId}) and is never returned. Everyone may copy their own assignments, every
 * global waypoint and the waypoints shared with their network.
 *
 * A published course set (global, with a curriculumSetKey) is a pool: the copy gets its first `count`
 * problems, or the first 5 when no count is sent, and never more than the pool holds; `pick` names
 * the exact problems instead (positions in the pool, in the copy's order). `hidden` creates the copy
 * archived, so students do not see it until the teacher assigns it. `readFirst` has students read the
 * lessons for the copy's topics before its problems open (src/lib/read-first.ts). Every other
 * source is copied whole and `count` is ignored. The key, the distractors and the worked solutions
 * (assignment_solutions/{sourceId} -> assignment_solutions/{newId}) are copied for the copied
 * questions only.
 */
export const POST = withAuthorizedRequest(
  async (req, { caller, profile, requestId }) => {
    const parsed = await parseJsonBody(req, cloneAssignmentBody, { message: "Invalid request" });
    if (!parsed.ok) return parsed.response;
    const { sourceId, courseId, title, dueDate, count, pick, hidden, readFirst } = parsed.data;

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

    const isCourseSet =
      source.visibility === "global" && typeof source.curriculumSetKey === "string";
    let split: ReturnType<typeof splitAssignmentQuestions>;
    let rubric: string;
    let totalPoints: number | undefined;
    let apTopics: string[] | undefined;
    const solutions: Record<string, string> = {};
    try {
      const key = (await adminDb.collection("assignment_keys").doc(sourceId).get()).data();
      const merged = mergeAnswerKey(source, key);
      rubric = typeof merged.rubric === "string" ? merged.rubric : "";
      // New question ids; each answer moves with its question, so the copy's key matches its questions.
      let wanted = merged.questions;
      if (isCourseSet && pick) {
        if (new Set(pick).size !== pick.length || pick.some((i) => i >= merged.questions.length))
          return NextResponse.json({ error: "Unknown problem in this set" }, { status: 400 });
        wanted = pick.map((i) => merged.questions[i]);
      } else if (isCourseSet) wanted = pickSetProblems(merged.questions, count ?? DEFAULT_SET_SIZE);
      const stored = (await adminDb.collection(SOLUTIONS).doc(sourceId).get()).data()?.solutions;
      const sourceSolutions: Record<string, unknown> =
        stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
      const questions = wanted.map((question) => {
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
        const solution = typeof question.id === "string" ? sourceSolutions[question.id] : undefined;
        if (typeof solution === "string" && solution) solutions[copy.id as string] = solution;
        return copy;
      });
      assertValidAnswerKeys(questions);
      split = splitAssignmentQuestions(questions);
      if (isCourseSet) {
        // The copy's own total: a copy with fewer problems than the pool is worth fewer points.
        totalPoints = questions.reduce(
          (sum, q) => sum + (typeof q.points === "number" ? q.points : 0),
          0,
        );
        // Topics of the problems actually copied (a short copy may not reach every topic of the set).
        const topics = new Set<unknown>(questions.map((q) => q.apTopic));
        if (
          questions.length < merged.questions.length &&
          Array.isArray(source.apTopics) &&
          [...topics].every((t) => typeof t === "string")
        ) {
          const kept = source.apTopics.filter((t: unknown) => topics.has(t));
          if (kept.length) apTopics = kept;
        }
      }
    } catch (error) {
      return errorResponse(error, "assignments/clone", requestId);
    }

    const copied: Record<string, unknown> = {};
    for (const field of COPIED_FIELDS)
      if (source[field] !== undefined) copied[field] = source[field];
    if (totalPoints !== undefined) copied.totalPoints = totalPoints;
    if (apTopics !== undefined) copied.apTopics = apTopics;
    const ref = adminDb.collection("assignments").doc();
    const batch = adminDb.batch();
    batch.set(ref, {
      ...copied,
      // The source's own title: students see it, and a "(Copy)" suffix means nothing to them.
      title:
        title ?? (typeof source.title === "string" && source.title ? source.title : "Untitled"),
      gradingType:
        typeof source.gradingType === "string" && source.gradingType ? source.gradingType : "ai",
      // Always written. An assignment with no lockdown field opens locked for students (the old
      // default, kept so live assignments don't change), so a new copy must say it is off.
      lockdownMode: copied.lockdownMode === true,
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
      ...(hidden ? { archivedAt: new Date() } : {}),
      ...(readFirst ? { readFirst: true } : {}),
    });
    batch.set(adminDb.collection("assignment_keys").doc(ref.id), {
      answers: split.answers,
      ...(Object.keys(split.distractors).length ? { distractors: split.distractors } : {}),
      rubric,
      teacherId: caller.uid,
    });
    if (Object.keys(solutions).length)
      batch.set(adminDb.collection(SOLUTIONS).doc(ref.id), { solutions, teacherId: caller.uid });
    if (source.teacherId !== caller.uid)
      batch.update(sourceRef, { forkCount: adminFieldWithValue.increment(1) });
    await batch.commit();
    return NextResponse.json({ id: ref.id });
  },
  { teacher: true, rateLimit: "write" },
);
