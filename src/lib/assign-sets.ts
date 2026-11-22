// Copying course sets into a class with school-day due dates. Used by the first-run page and
// /teacher/courses. The scheduling is pure; the network call is injected so it can be tested.
import { scheduleDueDates } from "./first-run";
import type { SchoolDayTest } from "./school-calendar";
import { DEFAULT_SET_SIZE, MIN_SET_SIZE } from "@/data/curricula";

export interface AssignableSet {
  /** The published global waypoint to copy. */
  sourceId: string;
  /** Curriculum set key ("4A"). */
  key: string;
  title: string;
  /** How many problems the published set holds; absent reads as the default size. */
  poolSize?: number;
  /** The class has an archived copy of this set with this many problems (assigning can restore it). */
  archivedCount?: number;
}

export interface PlannedAssignment extends AssignableSet {
  due: Date;
  /**
   * Problems the teacher chose for the class's copy (the first `count` of the set). Absent when no
   * choice was offered: the server then gives the default.
   */
  count?: number;
  /**
   * The exact problems the teacher chose in the assign dialog, as positions in the set (in order).
   * Absent: the set's usual pick for `count`.
   */
  pick?: number[];
}

/**
 * The sizes a teacher can choose for a set with `poolSize` problems: any number from 3 up to the
 * whole pool, starting at 5 (or the whole pool when it is smaller).
 */
export function setSizeOptions(poolSize: number): { min: number; max: number; default: number } {
  const max = Math.max(0, Math.floor(poolSize));
  return { min: Math.min(MIN_SET_SIZE, max), max, default: Math.min(DEFAULT_SET_SIZE, max) };
}

/** What the assign dialog's "Problems per set" control offers for the sets being assigned. */
export interface SizeChoice {
  /** False while no set has more than the default number of problems: there is nothing to choose. */
  offered: boolean;
  min: number;
  /** The largest pool among the sets. */
  max: number;
  /** What the control starts on: the class's last choice when it fits, else the default. */
  initial: number;
}

export function sizeChoice(sets: AssignableSet[], remembered?: number | null): SizeChoice {
  const pools = sets.map((s) => s.poolSize ?? DEFAULT_SET_SIZE);
  const max = Math.max(0, ...pools);
  const options = setSizeOptions(max);
  const initial =
    typeof remembered === "number" && Number.isInteger(remembered)
      ? Math.min(Math.max(remembered, options.min), options.max)
      : options.default;
  return { offered: max > DEFAULT_SET_SIZE, min: options.min, max, initial };
}

/** Sets with fewer problems than the teacher chose: each gets all it has. */
export function cappedSets(sets: AssignableSet[], count: number): AssignableSet[] {
  return sets.filter((s) => (s.poolSize ?? DEFAULT_SET_SIZE) < count);
}

/** The number of problems a set's copy will have for a chosen count (never more than its pool). */
export function sizeFor(set: AssignableSet, count: number | undefined): number {
  return Math.min(count ?? DEFAULT_SET_SIZE, set.poolSize ?? DEFAULT_SET_SIZE);
}

/**
 * Due dates for the sets that are not assigned yet, in the order given. Sets whose key is in
 * `alreadyAssigned` are skipped and do not use up a due date, so the first remaining set lands on `start`.
 */
export function planAssignments(
  sets: AssignableSet[],
  alreadyAssigned: ReadonlySet<string>,
  start: Date,
  spacing: number,
  isSchoolDay?: SchoolDayTest,
): PlannedAssignment[] {
  const todo = sets.filter((s) => !alreadyAssigned.has(s.key));
  const dates = scheduleDueDates(start, todo.length, spacing, isSchoolDay);
  return todo.map((s, i) => ({ ...s, due: dates[i] }));
}

/**
 * Whether assigning a set brings back the class's archived copy of it (with its students' work)
 * instead of making a new copy. With no number chosen it always does, as it always has. With one, only
 * a copy of exactly that size is brought back: a copy of another size stays archived, work and all,
 * and the class gets a new copy of the size the teacher asked for.
 */
export function restoresArchived(
  item: PlannedAssignment,
  archived: { questionCount?: number } | undefined,
): boolean {
  if (!archived) return false;
  // Problems chosen by hand are a new copy: the archived one may hold others.
  if (item.pick) return false;
  return item.count === undefined || archived.questionCount === sizeFor(item, item.count);
}

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

/** Copy one set into a class (answer key copied server-side) keeping its own title. Returns the copy's id. */
export async function cloneSetToClass(
  fetcher: Fetcher,
  courseId: string,
  item: PlannedAssignment,
  /** Create the copy hidden from students (archived) until the teacher assigns it. */
  hidden = false,
): Promise<string> {
  const res = await fetcher("/api/assignments/clone", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Keep the set's own title: students see it, and "(Copy)" means nothing to them.
    body: JSON.stringify({
      sourceId: item.sourceId,
      courseId,
      title: item.title,
      dueDate: item.due.toISOString(),
      ...(item.count !== undefined ? { count: item.count } : {}),
      ...(item.pick ? { pick: item.pick } : {}),
      ...(hidden ? { hidden: true } : {}),
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Could not assign this unit.");
  return typeof body.id === "string" ? body.id : "";
}

/**
 * Run a plan one set at a time and stop at the first failure (the error is thrown). `onDone` is called
 * after each copy, so a caller can remember progress and plan again for the rest.
 */
export async function runAssignments(
  plan: PlannedAssignment[],
  copy: (item: PlannedAssignment) => Promise<unknown>,
  onDone?: (item: PlannedAssignment) => void,
): Promise<void> {
  for (const item of plan) {
    await copy(item);
    onDone?.(item);
  }
}
