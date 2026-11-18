import type { firestore } from "firebase-admin";
import { MISCONCEPTION_IDS, apCourseKey, isUnitOfCourse, type ApCourseKey } from "./misconceptions";

// One document per (submission, question, misconception tag) in the server-only
// `misconception_events` collection (no client rule matches it, so Firestore denies all client
// access). The teacher insights API aggregates these with the Admin SDK, scoped to the caller.
// Shared by the Cloud Function and the Next.js grade route; free of runtime firebase-admin imports
// (like grading-runner.ts) so it works against any Firestore instance.

export const MISCONCEPTION_EVENTS = "misconception_events";
const MAX_EVENTS_PER_SUBMISSION = 400; // stays under the 500-write batch limit with deletes split out

export interface MisconceptionEvent {
  submissionId: string;
  assignmentId: string;
  assignmentTitle: string;
  studentId: string;
  teacherId: string;
  organizationId: string | null;
  courseId: string | null;
  questionId: string;
  tag: string;
  /**
   * The AP course `apUnit` and `apTopic` belong to (unit numbers repeat between courses). Null when
   * there is no unit. Events written before courses were recorded have no field: AP Physics 1.
   */
  apCourse: ApCourseKey | null;
  /** Unit of that course, from the question's topic or the assignment's unit. */
  apUnit: number | null;
  /** AP topic id such as "4.2", when the question or assignment names exactly one. */
  apTopic: string | null;
  /** 0..1 of the question's points. */
  scoreFraction: number | null;
  method: string | null;
  note: string | null;
  /** False while the submission waits for teacher review. */
  final: boolean;
  createdAt: Date;
}

interface AnswerLike {
  questionId?: unknown;
  score?: unknown;
  maxPoints?: unknown;
  method?: unknown;
  misconceptions?: unknown;
  misconceptionNotes?: unknown;
}

interface QuestionLike {
  id?: unknown;
  apTopic?: unknown;
}

export interface EventContext {
  submissionId: string;
  studentId: string;
  assignmentId: string;
  assignment: firestore.DocumentData | undefined;
  answers: readonly unknown[];
  final: boolean;
  now?: Date;
}

const TOPIC_ID = /^(\d{1,2})\.(\d{1,2})$/;

/** The unit a topic id names, when that unit is in the course ("4.2" -> 4). */
function unitOfTopic(topic: unknown, course: ApCourseKey): number | null {
  const m = typeof topic === "string" ? topic.match(TOPIC_ID) : null;
  return m && isUnitOfCourse(Number(m[1]), course) ? Number(m[1]) : null;
}

/** Pure: the events a graded submission produces. Unknown tags are dropped. */
export function buildMisconceptionEvents(ctx: EventContext): MisconceptionEvent[] {
  const a = ctx.assignment || {};
  const questions = new Map<string, QuestionLike>(
    (Array.isArray(a.questions) ? (a.questions as QuestionLike[]) : [])
      .filter((q) => q && typeof q.id === "string")
      .map((q) => [q.id as string, q]),
  );
  const course = apCourseKey(a.apCourse);
  const assignmentTopics: string[] = Array.isArray(a.apTopics)
    ? a.apTopics.filter((t: unknown): t is string => unitOfTopic(t, course) !== null)
    : [];
  const assignmentUnit = isUnitOfCourse(a.apUnit, course)
    ? a.apUnit
    : assignmentTopics.length
      ? unitOfTopic(assignmentTopics[0], course)
      : null;
  const now = ctx.now ?? new Date();
  const events: MisconceptionEvent[] = [];
  for (const raw of ctx.answers) {
    const ans = raw as AnswerLike;
    if (!ans || typeof ans.questionId !== "string" || !Array.isArray(ans.misconceptions)) continue;
    const q = questions.get(ans.questionId);
    const questionTopic =
      typeof q?.apTopic === "string" && unitOfTopic(q.apTopic, course) !== null ? q.apTopic : null;
    const apTopic = questionTopic ?? (assignmentTopics.length === 1 ? assignmentTopics[0] : null);
    const apUnit = unitOfTopic(apTopic, course) ?? assignmentUnit;
    const maxPoints = typeof ans.maxPoints === "number" ? ans.maxPoints : 0;
    const scoreFraction =
      typeof ans.score === "number" && maxPoints > 0
        ? Math.round((ans.score / maxPoints) * 100) / 100
        : null;
    const notes = Array.isArray(ans.misconceptionNotes)
      ? ans.misconceptionNotes.filter((n): n is string => typeof n === "string")
      : [];
    const seen = new Set<string>();
    for (const tag of ans.misconceptions) {
      if (typeof tag !== "string" || !MISCONCEPTION_IDS.has(tag) || seen.has(tag)) continue;
      seen.add(tag);
      events.push({
        submissionId: ctx.submissionId,
        assignmentId: ctx.assignmentId,
        assignmentTitle: typeof a.title === "string" ? a.title.slice(0, 200) : "",
        studentId: ctx.studentId,
        teacherId: typeof a.teacherId === "string" ? a.teacherId : "",
        organizationId: typeof a.organizationId === "string" ? a.organizationId : null,
        courseId: typeof a.courseId === "string" && a.courseId ? a.courseId : null,
        questionId: ans.questionId,
        tag,
        apCourse: apUnit === null ? null : course,
        apUnit,
        apTopic,
        scoreFraction,
        method: typeof ans.method === "string" ? ans.method : null,
        note: tag === "other" && notes.length ? notes.join("; ").slice(0, 300) : null,
        final: ctx.final,
        createdAt: now,
      });
      if (events.length >= MAX_EVENTS_PER_SUBMISSION) return events;
    }
  }
  return events;
}

/** Firestore-safe id: one event per (submission, question, tag), so regrading overwrites. */
export function eventId(
  e: Pick<MisconceptionEvent, "submissionId" | "questionId" | "tag">,
): string {
  return `${e.submissionId}__${e.questionId}__${e.tag}`.replace(/\//g, "_").slice(0, 1400);
}

/**
 * Replaces the submission's events with the ones its latest grade produces. Never throws: the
 * report is secondary to the grade, so a failure here is logged by the caller via `onError`.
 */
export async function recordMisconceptionEvents(
  db: firestore.Firestore,
  ctx: EventContext,
  onError: (error: unknown) => void = () => {},
): Promise<number> {
  try {
    const col = db.collection(MISCONCEPTION_EVENTS);
    const events = buildMisconceptionEvents(ctx);
    const keep = new Set(events.map(eventId));
    const existing = await col.where("submissionId", "==", ctx.submissionId).get();
    const stale = existing.docs.filter((d) => !keep.has(d.id));
    for (let i = 0; i < stale.length; i += 400) {
      const batch = db.batch();
      for (const d of stale.slice(i, i + 400)) batch.delete(d.ref);
      await batch.commit();
    }
    if (events.length) {
      const batch = db.batch();
      for (const e of events) batch.set(col.doc(eventId(e)), e);
      await batch.commit();
    }
    return events.length;
  } catch (error) {
    onError(error);
    return 0;
  }
}
