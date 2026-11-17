// Copying course sets into a class with school-day due dates. Used by the first-run page and
// /teacher/courses. The scheduling is pure; the network call is injected so it can be tested.
import { scheduleDueDates } from "./first-run";

export interface AssignableSet {
  /** The published global waypoint to copy. */
  sourceId: string;
  /** Curriculum set key ("4A"). */
  key: string;
  title: string;
}

export interface PlannedAssignment extends AssignableSet {
  due: Date;
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
): PlannedAssignment[] {
  const todo = sets.filter((s) => !alreadyAssigned.has(s.key));
  const dates = scheduleDueDates(start, todo.length, spacing);
  return todo.map((s, i) => ({ ...s, due: dates[i] }));
}

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

/** Copy one set into a class (answer key copied server-side) keeping its own title. */
export async function cloneSetToClass(
  fetcher: Fetcher,
  courseId: string,
  item: PlannedAssignment,
): Promise<void> {
  const res = await fetcher("/api/assignments/clone", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Keep the set's own title: students see it, and "(Copy)" means nothing to them.
    body: JSON.stringify({
      sourceId: item.sourceId,
      courseId,
      title: item.title,
      dueDate: item.due.toISOString(),
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Could not assign this unit.");
}

/**
 * Run a plan one set at a time and stop at the first failure (the error is thrown). `onDone` is called
 * after each copy, so a caller can remember progress and plan again for the rest.
 */
export async function runAssignments(
  plan: PlannedAssignment[],
  copy: (item: PlannedAssignment) => Promise<void>,
  onDone?: (item: PlannedAssignment) => void,
): Promise<void> {
  for (const item of plan) {
    await copy(item);
    onDone?.(item);
  }
}
