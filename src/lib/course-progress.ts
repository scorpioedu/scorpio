// Class progress on a course roadmap: per set, who has submitted and how they scored; per unit, the
// most common misconceptions with a rule-based re-teach suggestion. Pure: the route
// (/api/teacher/courses/progress) loads the data. The suggestions come from fixed rules over the
// misconception data. A later version may have the AI write them; see docs/courses.md.
import { DEFAULT_AP_COURSE, apTopicLabel } from "@/data/ap";
import { curriculumSet, getCurriculum } from "@/data/curricula";
import { setsTargeting } from "@/data/curricula/profiles";
import {
  buildInsightsReport,
  eventCourse,
  parseCourseScopedId,
  type InsightEvent,
} from "@/lib/insights";
import { keyUnit } from "@/lib/curriculum-plan";

export interface ProgressAssignment {
  id: string;
  curriculumSetKey?: unknown;
  /** The copy's due date; without one nothing is ever overdue. */
  dueDate?: Date | null;
}

export interface ProgressSubmission {
  assignmentId: string;
  studentId: string;
  status?: unknown;
  graded?: unknown;
  score?: unknown;
  /** Answers the teacher must check after an answer-key change (see regrade.ts). */
  reviewQuestions?: unknown;
}

export interface SetProgress {
  key: string;
  assignmentId: string;
  /** Students who handed it in (anything but a draft). */
  submitted: number;
  graded: number;
  /** Waiting for the teacher's review. */
  pending: number;
  /** Mean percent over graded submissions, or null when none is graded. */
  averageScore: number | null;
  /** Students on the roster with nothing handed in after the due date has passed. */
  overdue: number;
  /** Students whose handed-in work has answers to check after an answer-key change. */
  needsReview: number;
}

/** Who is in the class and what time it is, for `overdue`. Without a roster nothing is overdue. */
export interface ProgressContext {
  roster?: readonly string[];
  now?: Date;
}

const isGraded = (s: ProgressSubmission) => s.status === "graded" || s.graded === true;

/** One entry per course set the class has been assigned (its first copy when there are two). */
export function buildSetProgress(
  assignments: ProgressAssignment[],
  submissions: ProgressSubmission[],
  context: ProgressContext = {},
): Record<string, SetProgress> {
  const roster = context.roster ?? [];
  const now = (context.now ?? new Date()).getTime();
  const byAssignment = new Map<string, ProgressSubmission[]>();
  for (const s of submissions) {
    if (s.status === "draft") continue;
    byAssignment.set(s.assignmentId, [...(byAssignment.get(s.assignmentId) ?? []), s]);
  }
  const out: Record<string, SetProgress> = {};
  for (const a of assignments) {
    const key = a.curriculumSetKey;
    if (typeof key !== "string" || out[key]) continue;
    const subs = byAssignment.get(a.id) ?? [];
    const scores = subs
      .filter((s) => isGraded(s) && typeof s.score === "number" && Number.isFinite(s.score))
      .map((s) => s.score as number);
    const handedIn = new Set(subs.map((s) => s.studentId));
    const pastDue = a.dueDate instanceof Date && a.dueDate.getTime() < now;
    out[key] = {
      key,
      assignmentId: a.id,
      submitted: handedIn.size,
      graded: new Set(subs.filter(isGraded).map((s) => s.studentId)).size,
      pending: new Set(subs.filter((s) => s.status === "pending_review").map((s) => s.studentId))
        .size,
      averageScore: scores.length
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : null,
      overdue: pastDue ? roster.filter((id) => !handedIn.has(id)).length : 0,
      needsReview: new Set(
        subs
          .filter((s) => Array.isArray(s.reviewQuestions) && s.reviewQuestions.length > 0)
          .map((s) => s.studentId),
      ).size,
    };
  }
  return out;
}

/** Students with graded or pending work per unit: the denominator for "8 of 24 students". */
export function studentsByUnit(
  assignments: ProgressAssignment[],
  submissions: ProgressSubmission[],
): Record<number, number> {
  const unitOf = new Map<string, number>();
  for (const a of assignments)
    if (typeof a.curriculumSetKey === "string") unitOf.set(a.id, keyUnit(a.curriculumSetKey));
  const students = new Map<number, Set<string>>();
  for (const s of submissions) {
    const unit = unitOf.get(s.assignmentId);
    if (unit === undefined || !(isGraded(s) || s.status === "pending_review")) continue;
    if (!students.has(unit)) students.set(unit, new Set());
    students.get(unit)!.add(s.studentId);
  }
  return Object.fromEntries([...students.entries()].map(([u, set]) => [u, set.size]));
}

export type ReteachAction = "whole-class" | "small-group" | "individual";

export interface ReteachPractice {
  key: string;
  title: string;
  /** Problems in the set whose wrong answers target the misconception. */
  problems: number;
  assigned: boolean;
}

export interface UnitMisconception {
  tag: string;
  label: string;
  description: string;
  studentCount: number;
  /** Share of the unit's students with graded work, 0..1. */
  studentShare: number;
  topics: { id: string; label: string }[];
  action: ReteachAction;
  /** Sets that target it: unassigned ones from this unit first (new practice), then assigned ones (to go over). */
  practice: ReteachPractice[];
  suggestion: string;
}

export interface UnitInsight {
  unit: number;
  studentsInScope: number;
  top: UnitMisconception[];
}

const TOP_PER_UNIT = 3;
/** Share of students at which a misconception is worth class time, and at which a group is enough. */
export const WHOLE_CLASS_SHARE = 0.4;
export const SMALL_GROUP_SHARE = 0.2;

export function reteachAction(studentCount: number, share: number): ReteachAction {
  if (share >= WHOLE_CLASS_SHARE && studentCount >= 3) return "whole-class";
  if (share >= SMALL_GROUP_SHARE && studentCount >= 2) return "small-group";
  return "individual";
}

const ACTION_TEXT: Record<ReteachAction, string> = {
  "whole-class": "Re-teach to the whole class",
  "small-group": "Pull a small group",
  individual: "Check in with these students one to one",
};

/** The sentence a teacher reads. Built from fixed rules so it is the same every time. */
export function reteachSuggestion(m: Omit<UnitMisconception, "suggestion">): string {
  const parts = [
    `${ACTION_TEXT[m.action]}${m.topics.length ? `: revisit ${m.topics[0].label}` : ""}.`,
  ];
  const fresh = m.practice.filter((p) => !p.assigned);
  const done = m.practice.filter((p) => p.assigned);
  if (fresh.length)
    parts.push(
      `For more practice, assign ${fresh
        .slice(0, 2)
        .map((p) => `${p.key} (${p.title})`)
        .join(" or ")}, which targets it.`,
    );
  if (done.length)
    parts.push(
      `Go over the missed problems in ${done
        .slice(0, 3)
        .map((p) => p.key)
        .join(", ")}.`,
    );
  return parts.join(" ");
}

/**
 * The top misconceptions per unit for one class. `events` must already be the class's own events.
 * Units with no events are left out.
 */
export function buildUnitInsights(
  curriculumId: string,
  events: InsightEvent[],
  context: {
    studentsByUnit: Record<number, number>;
    /** Set keys the class has been assigned. */
    assignedKeys: readonly string[];
    /** Set keys the class skips; never suggested. */
    skippedKeys?: readonly string[];
  },
): UnitInsight[] {
  const course = getCurriculum(curriculumId)?.apCourse;
  const assigned = new Set(context.assignedKeys);
  const skipped = new Set(context.skippedKeys ?? []);
  // A class may hold work from another AP course (it switched, or the teacher added sets by hand);
  // unit numbers repeat between courses, so only this course's events count.
  const own = events.filter((e) => eventCourse(e) === (course ?? DEFAULT_AP_COURSE));
  const units = [...new Set(own.map((e) => e.apUnit).filter((u): u is number => !!u))].sort(
    (a, b) => a - b,
  );
  return units.map((unit) => {
    const report = buildInsightsReport(
      own,
      { apUnit: unit, apCourse: course },
      {},
      {
        studentsInScope: context.studentsByUnit[unit] ?? 0,
      },
    );
    const top = report.top.slice(0, TOP_PER_UNIT).map((row) => {
      const practice = setsTargeting(curriculumId, row.tag)
        // New practice comes only from this unit: a set from a unit the class has not reached
        // would need material it has not been taught. Sets already assigned can be gone over.
        .filter((s) => assigned.has(s.key) || (keyUnit(s.key) === unit && !skipped.has(s.key)))
        .map((s) => ({
          key: s.key,
          title: curriculumSet(curriculumId, s.key)?.title ?? s.key,
          problems: s.problems,
          assigned: assigned.has(s.key),
        }))
        // New practice first; among assigned sets, this unit's before others.
        .sort(
          (a, b) =>
            Number(a.assigned) - Number(b.assigned) ||
            Number(keyUnit(b.key) === unit) - Number(keyUnit(a.key) === unit) ||
            b.problems - a.problems,
        );
      const base = {
        tag: row.tag,
        label: row.label,
        description: row.description,
        studentCount: row.studentCount,
        studentShare: row.studentShare,
        topics: row.topics.slice(0, 2).map((t) => {
          const id = parseCourseScopedId(t.id).id;
          return { id, label: apTopicLabel(id, course) };
        }),
        action: reteachAction(row.studentCount, row.studentShare),
        practice,
      };
      return { ...base, suggestion: reteachSuggestion(base) };
    });
    return { unit, studentsInScope: report.totals.studentsInScope, top };
  });
}
