// A student's progress through the course their class follows, for the student dashboard. Pure.
// Only the student's own work is used; nothing about classmates.
import { apUnitLabel } from "@/data/ap";
import { getCurriculum } from "@/data/curricula";
import { keyUnit, normalisePlan, unitOrder } from "@/lib/curriculum-plan";

export interface RoadmapAssignment {
  id: string;
  title?: string;
  dueDate?: Date | null;
  curriculumSetKey?: unknown;
  /** The course the set came from. Set keys repeat between courses, so other courses are ignored. */
  curriculumId?: unknown;
}

export interface RoadmapSubmission {
  assignmentId: string;
  status?: unknown;
  graded?: unknown;
  score?: unknown;
}

export type StudentUnitState = "done" | "current" | "upcoming" | "not-assigned";

export interface StudentUnit {
  unit: number;
  label: string;
  /** Sets the class plans to do in this unit (skipped ones left out, assigned ones always counted). */
  planned: number;
  assigned: number;
  done: number;
  /** Mean percent over the student's graded sets in the unit. */
  averageScore: number | null;
  state: StudentUnitState;
  /** The assigned set the student has not handed in that is due first. */
  next: { id: string; title: string; dueDate: Date | null } | null;
}

export interface StudentRoadmap {
  courseName: string;
  units: StudentUnit[];
  done: number;
  planned: number;
  /** The set to do next across the course: the one due first. */
  upNext: StudentUnit["next"];
}

const dueTime = (a: { dueDate?: Date | null }) =>
  a.dueDate ? a.dueDate.getTime() : Number.MAX_SAFE_INTEGER;

/**
 * Units in the class's order with the student's progress. Returns null when the course is unknown.
 * A unit is "current" when it is the first with assigned work left, "done" when everything assigned
 * is handed in and nothing planned is still to come, "upcoming" when work is assigned but an earlier
 * unit is current, and "not-assigned" when the teacher has not assigned any of it yet.
 */
export function buildStudentRoadmap(
  curriculumId: unknown,
  plan: unknown,
  assignments: RoadmapAssignment[],
  submissions: RoadmapSubmission[],
): StudentRoadmap | null {
  const curriculum = getCurriculum(curriculumId);
  if (!curriculum) return null;
  const { order, skipped } = normalisePlan(curriculum.id, plan);
  const position = new Map(order.map((k, i) => [k, i]));
  const byKey = new Map<string, RoadmapAssignment>();
  for (const a of assignments)
    if (
      (a.curriculumId === undefined || a.curriculumId === curriculum.id) &&
      typeof a.curriculumSetKey === "string" &&
      position.has(a.curriculumSetKey) &&
      !byKey.has(a.curriculumSetKey)
    )
      byKey.set(a.curriculumSetKey, a);
  const handedIn = new Map<string, RoadmapSubmission>();
  for (const s of submissions) if (s.status !== "draft") handedIn.set(s.assignmentId, s);

  let currentFound = false;
  const units: StudentUnit[] = [];
  for (const unit of unitOrder(order)) {
    const keys = order.filter((k) => keyUnit(k) === unit);
    const plannedKeys = keys.filter((k) => byKey.has(k) || !skipped.includes(k));
    if (plannedKeys.length === 0) continue;
    const assigned = plannedKeys.filter((k) => byKey.has(k));
    const doneKeys = assigned.filter((k) => handedIn.has(byKey.get(k)!.id));
    const scores = doneKeys
      .map((k) => handedIn.get(byKey.get(k)!.id)!)
      .filter((s) => (s.graded === true || s.status === "graded") && typeof s.score === "number")
      .map((s) => s.score as number);
    // What to do next is what is due first; sets with the same (or no) date keep roadmap order.
    const nextKey = assigned
      .filter((k) => !handedIn.has(byKey.get(k)!.id))
      .sort((x, y) => dueTime(byKey.get(x)!) - dueTime(byKey.get(y)!))[0];
    const nextAssignment = nextKey ? byKey.get(nextKey)! : null;
    let state: StudentUnitState;
    if (assigned.length === 0) state = "not-assigned";
    else if (nextKey) {
      state = currentFound ? "upcoming" : "current";
      currentFound = true;
    } else state = doneKeys.length === plannedKeys.length ? "done" : "current";
    units.push({
      unit,
      label: apUnitLabel(unit, curriculum.apCourse),
      planned: plannedKeys.length,
      assigned: assigned.length,
      done: doneKeys.length,
      averageScore: scores.length
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : null,
      state,
      next: nextAssignment
        ? {
            id: nextAssignment.id,
            title: nextAssignment.title || "Assignment",
            dueDate: nextAssignment.dueDate ?? null,
          }
        : null,
    });
  }
  return {
    courseName: curriculum.name,
    units,
    done: units.reduce((n, u) => n + u.done, 0),
    planned: units.reduce((n, u) => n + u.planned, 0),
    upNext:
      units
        .map((u) => u.next)
        .filter((n): n is NonNullable<StudentUnit["next"]> => n !== null)
        .sort((x, y) => dueTime(x) - dueTime(y))[0] ?? null,
  };
}
