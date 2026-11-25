// "Read the lessons first": an assignment with `readFirst: true` asks each student to read the
// lessons for its AP topics (src/data/guides) before its problems open. Which lessons those are is
// worked out here, the same way on the server (the lesson-reads route) and in the browser.
import { apCourseOf } from "@/data/ap";
import { CURRICULA } from "@/data/curricula";
import { hasUnitGuide } from "@/lib/guides";

/** The fields of an assignment doc that say which lessons go with it. */
export interface ReadFirstSource {
  readFirst?: unknown;
  curriculumId?: unknown;
  apCourse?: unknown;
  apTopics?: unknown;
  questions?: unknown;
}

/** The course whose lessons go with an assignment: its own course, or the one its AP tags name. */
export function lessonCourse(a: ReadFirstSource): string | null {
  if (typeof a.curriculumId === "string" && CURRICULA.some((c) => c.id === a.curriculumId))
    return a.curriculumId;
  if (typeof a.apCourse !== "string") return null;
  const course = apCourseOf(a.apCourse);
  return CURRICULA.find((c) => c.apCourse === course)?.id ?? null;
}

const topicUnit = (topic: string) => Number(topic.split(".")[0]);
const isTopic = (t: unknown): t is string => typeof t === "string" && /^\d{1,2}\.\d{1,2}$/.test(t);

/**
 * The topics an assignment's lessons cover, in order: its AP topics, or (untagged) its questions'
 * own topics, keeping only those whose unit has lessons. Empty: there is nothing to read.
 */
export function lessonTopics(a: ReadFirstSource): string[] {
  const course = lessonCourse(a);
  if (!course) return [];
  const tagged = Array.isArray(a.apTopics) ? a.apTopics.filter(isTopic) : [];
  const fromQuestions = Array.isArray(a.questions)
    ? a.questions.map((q) => (q && typeof q === "object" ? q.apTopic : null)).filter(isTopic)
    : [];
  const topics = [...new Set(tagged.length ? tagged : fromQuestions)];
  return topics
    .filter((t) => hasUnitGuide(course, topicUnit(t)))
    .sort(
      (x, y) => topicUnit(x) - topicUnit(y) || Number(x.split(".")[1]) - Number(y.split(".")[1]),
    );
}

/** The lessons a student must read before the problems open; empty when the assignment asks none. */
export function readFirstTopics(a: ReadFirstSource): string[] {
  return a.readFirst === true ? lessonTopics(a) : [];
}

/** The units the topics belong to, in order (each unit's lessons are one file). */
export function lessonUnits(topics: string[]): number[] {
  return [...new Set(topics.map(topicUnit))];
}

/** A student's reads, by topic: when each lesson was marked read (ISO time). */
export type LessonReads = Record<string, string>;

/** True when every lesson in `topics` has been marked read. */
export function readAll(topics: string[], reads: LessonReads | null | undefined): boolean {
  return topics.every((t) => !!reads?.[t]);
}

/**
 * Whether a student may start the problems: every lesson asked for is read, or none is asked for.
 * `reads` is null until the server has answered. `unavailable` (the lessons or the reads could not
 * be loaded) opens Start too: our failure never stops a student working.
 */
export function mayStart(
  required: string[],
  reads: LessonReads | null,
  unavailable: boolean,
): boolean {
  if (unavailable || required.length === 0) return true;
  return reads !== null && readAll(required, reads);
}

/** Where read marks are kept: one doc per student and assignment, written by the server only. */
export const LESSON_READS = "lesson_reads";
export const lessonReadsDocId = (assignmentId: string, studentId: string) =>
  `${assignmentId}_${studentId}`;
