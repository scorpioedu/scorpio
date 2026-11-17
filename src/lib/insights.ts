// Aggregates misconception events (functions/src/misconception-events.ts) into the class
// misconception report shown at /teacher/insights. Pure: the API route loads the events.

import { apUnitLabel, apTopicLabel, misconceptionTag } from "@/data/ap";

export interface InsightEvent {
  submissionId: string;
  assignmentId: string;
  assignmentTitle?: string;
  studentId: string;
  courseId: string | null;
  questionId: string;
  tag: string;
  apUnit: number | null;
  apTopic: string | null;
  final?: boolean;
}

export interface InsightFilters {
  courseId?: string;
  assignmentId?: string;
  apUnit?: number;
  /** Include submissions still waiting for teacher review. Default true. */
  includePending?: boolean;
}

export interface TagRow {
  tag: string;
  label: string;
  description: string;
  category: "conceptual" | "procedural";
  /** Distinct students who showed it. Ranks the list. */
  studentCount: number;
  /** Answers that showed it. */
  answerCount: number;
  /** Share of students in scope (who have any graded work in scope) who showed it, 0..1. */
  studentShare: number;
  students: { id: string; name: string }[];
  assignments: { id: string; title: string; studentCount: number }[];
  topics: { id: string; label: string; studentCount: number }[];
}

export interface GroupRow {
  id: string;
  label: string;
  studentCount: number;
  top: { tag: string; label: string; studentCount: number }[];
}

export interface InsightsReport {
  totals: {
    students: number;
    /** Students with graded work in scope (the share denominator). */
    studentsInScope: number;
    submissions: number;
    answers: number;
    tags: number;
  };
  top: TagRow[];
  byAssignment: GroupRow[];
  byUnit: GroupRow[];
  byClass: GroupRow[];
}

const MAX_STUDENTS_LISTED = 50;
const GROUP_TOP = 3;

function label(tag: string) {
  return misconceptionTag(tag)?.label ?? tag;
}

export function filterEvents(events: InsightEvent[], f: InsightFilters): InsightEvent[] {
  return events.filter(
    (e) =>
      (!f.courseId || e.courseId === f.courseId) &&
      (!f.assignmentId || e.assignmentId === f.assignmentId) &&
      (f.apUnit === undefined || e.apUnit === f.apUnit) &&
      (f.includePending !== false || e.final !== false),
  );
}

function groupTop(events: InsightEvent[]) {
  const byTag = new Map<string, Set<string>>();
  for (const e of events) {
    if (!byTag.has(e.tag)) byTag.set(e.tag, new Set());
    byTag.get(e.tag)!.add(e.studentId);
  }
  return [...byTag.entries()]
    .map(([tag, s]) => ({ tag, label: label(tag), studentCount: s.size }))
    .sort((a, b) => b.studentCount - a.studentCount || a.label.localeCompare(b.label))
    .slice(0, GROUP_TOP);
}

function groups(
  events: InsightEvent[],
  key: (e: InsightEvent) => string | null,
  name: (id: string, sample: InsightEvent) => string,
): GroupRow[] {
  const map = new Map<string, InsightEvent[]>();
  for (const e of events) {
    const k = key(e);
    if (k === null) continue;
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(e);
  }
  return [...map.entries()]
    .map(([id, list]) => ({
      id,
      label: name(id, list[0]),
      studentCount: new Set(list.map((e) => e.studentId)).size,
      top: groupTop(list),
    }))
    .sort((a, b) => b.studentCount - a.studentCount || a.label.localeCompare(b.label));
}

/**
 * Ranks misconceptions by the number of distinct students who showed them, most common first.
 * `studentsInScope` is how many students have graded work in the filtered scope (the denominator
 * for the share); when unknown, the number of students with any event is used.
 */
export function buildInsightsReport(
  allEvents: InsightEvent[],
  filters: InsightFilters = {},
  names: Record<string, string> = {},
  context: { classNames?: Record<string, string>; studentsInScope?: number } = {},
): InsightsReport {
  const events = filterEvents(allEvents, filters);
  const students = new Set(events.map((e) => e.studentId));
  const denominator = Math.max(context.studentsInScope ?? 0, students.size);

  const byTag = new Map<string, InsightEvent[]>();
  for (const e of events) {
    if (!byTag.has(e.tag)) byTag.set(e.tag, []);
    byTag.get(e.tag)!.push(e);
  }

  const top: TagRow[] = [...byTag.entries()].map(([tag, list]) => {
    const meta = misconceptionTag(tag);
    const tagStudents = [...new Set(list.map((e) => e.studentId))];
    const perAssignment = new Map<string, { title: string; students: Set<string> }>();
    const perTopic = new Map<string, Set<string>>();
    for (const e of list) {
      const a = perAssignment.get(e.assignmentId) ?? {
        title: e.assignmentTitle || "Untitled assignment",
        students: new Set<string>(),
      };
      a.students.add(e.studentId);
      perAssignment.set(e.assignmentId, a);
      if (e.apTopic) {
        if (!perTopic.has(e.apTopic)) perTopic.set(e.apTopic, new Set());
        perTopic.get(e.apTopic)!.add(e.studentId);
      }
    }
    return {
      tag,
      label: meta?.label ?? tag,
      description: meta?.description ?? "",
      category: meta?.category ?? "conceptual",
      studentCount: tagStudents.length,
      answerCount: list.length,
      studentShare: denominator ? Math.round((tagStudents.length / denominator) * 100) / 100 : 0,
      students: tagStudents
        .map((id) => ({ id, name: names[id] || "Student" }))
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, MAX_STUDENTS_LISTED),
      assignments: [...perAssignment.entries()]
        .map(([id, a]) => ({ id, title: a.title, studentCount: a.students.size }))
        .sort((a, b) => b.studentCount - a.studentCount),
      topics: [...perTopic.entries()]
        .map(([id, s]) => ({ id, label: apTopicLabel(id), studentCount: s.size }))
        .sort((a, b) => b.studentCount - a.studentCount || a.id.localeCompare(b.id)),
    };
  });
  // Conceptual misconceptions first among ties: they are what the report is for.
  top.sort(
    (a, b) =>
      b.studentCount - a.studentCount ||
      b.answerCount - a.answerCount ||
      (a.category === b.category ? 0 : a.category === "conceptual" ? -1 : 1) ||
      a.label.localeCompare(b.label),
  );

  return {
    totals: {
      students: students.size,
      studentsInScope: denominator,
      submissions: new Set(events.map((e) => e.submissionId)).size,
      answers: new Set(events.map((e) => `${e.submissionId}/${e.questionId}`)).size,
      tags: byTag.size,
    },
    top,
    byAssignment: groups(
      events,
      (e) => e.assignmentId,
      (_id, e) => e.assignmentTitle || "Untitled assignment",
    ),
    byUnit: groups(
      events,
      (e) => (e.apUnit ? String(e.apUnit) : null),
      (id) => apUnitLabel(Number(id)),
    ),
    byClass: groups(
      events,
      (e) => e.courseId,
      (id) => context.classNames?.[id] || "Class",
    ),
  };
}
