// Class progress on a course roadmap: per set, who has submitted and how they scored; per unit, the
// most common misconceptions with a rule-based re-teach suggestion. Pure: the route
// (/api/teacher/courses/progress) loads the data. The suggestions come from fixed rules over the
// misconception data. A later version may have the AI write them; see docs/courses.md.
import { apTopicLabel } from "@/data/ap";
import { curriculumSet } from "@/data/curricula";
import { setsTargeting } from "@/data/curricula/profiles";
import { buildInsightsReport, type InsightEvent } from "@/lib/insights";
import { keyUnit } from "@/lib/curriculum-plan";

export interface ProgressAssignment {
  id: string;
  curriculumSetKey?: unknown;
}

export interface ProgressSubmission {
  assignmentId: string;
  studentId: string;
  status?: unknown;
  graded?: unknown;
  score?: unknown;
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
}

const isGraded = (s: ProgressSubmission) => s.status === "graded" || s.graded === true;

/** One entry per course set the class has been assigned (its first copy when there are two). */
export function buildSetProgress(
  assignments: ProgressAssignment[],
  submissions: ProgressSubmission[],
): Record<string, SetProgress> {
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
    out[key] = {
      key,
      assignmentId: a.id,
      submitted: new Set(subs.map((s) => s.studentId)).size,
      graded: new Set(subs.filter(isGraded).map((s) => s.studentId)).size,
      pending: new Set(subs.filter((s) => s.status === "pending_review").map((s) => s.studentId))
        .size,
      averageScore: scores.length
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : null,
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
  /** Course sets that target it: unassigned ones first (new practice), then assigned ones (to go over). */
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
  const assigned = new Set(context.assignedKeys);
  const skipped = new Set(context.skippedKeys ?? []);
  const units = [...new Set(events.map((e) => e.apUnit).filter((u): u is number => !!u))].sort(
    (a, b) => a - b,
  );
  return units.map((unit) => {
    const report = buildInsightsReport(
      events,
      { apUnit: unit },
      {},
      {
        studentsInScope: context.studentsByUnit[unit] ?? 0,
      },
    );
    const top = report.top.slice(0, TOP_PER_UNIT).map((row) => {
      const practice = setsTargeting(curriculumId, row.tag)
        .filter((s) => !skipped.has(s.key) || assigned.has(s.key))
        .map((s) => ({
          key: s.key,
          title: curriculumSet(curriculumId, s.key)?.title ?? s.key,
          problems: s.problems,
          assigned: assigned.has(s.key),
        }))
        // New practice first; within each group, sets from this unit before others.
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
        topics: row.topics.slice(0, 2).map((t) => ({ id: t.id, label: apTopicLabel(t.id) })),
        action: reteachAction(row.studentCount, row.studentShare),
        practice,
      };
      return { ...base, suggestion: reteachSuggestion(base) };
    });
    return { unit, studentsInScope: report.totals.studentsInScope, top };
  });
}
