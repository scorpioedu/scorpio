// Which of a teacher's assignment documents count as their current assignments. My Assignments
// ("All but archived") and the Dashboard (assignment count, Recent assignments) use the same rule,
// so the two pages agree.

export interface ListableAssignment {
  visibility?: unknown;
  curriculumSetKey?: unknown;
  courseId?: unknown;
  archivedAt?: unknown;
}

/**
 * A published course set: the library every teacher assigns from. It belongs to the admin who
 * published it and is managed in Admin → Content; the copies assigned to a class carry a courseId.
 */
export function isLibrarySet(a: ListableAssignment): boolean {
  return a.visibility === "global" && !!a.curriculumSetKey && typeof a.courseId !== "string";
}

/** Archived on its own, or put away with its class. */
export function isPutAway(a: ListableAssignment, archivedClassIds: ReadonlySet<string>): boolean {
  return (
    a.archivedAt != null || (typeof a.courseId === "string" && archivedClassIds.has(a.courseId))
  );
}

/** One of the teacher's own assignments that is not archived and not in an archived class. */
export function isCurrentAssignment(
  a: ListableAssignment,
  archivedClassIds: ReadonlySet<string>,
): boolean {
  return !isLibrarySet(a) && !isPutAway(a, archivedClassIds);
}

/** Milliseconds for a Firestore Timestamp, Date, ISO string or epoch number; 0 when missing. */
export function timeOf(v: unknown): number {
  if (!v) return 0;
  if (typeof (v as { toMillis?: unknown }).toMillis === "function")
    return (v as { toMillis: () => number }).toMillis();
  if (v instanceof Date) return v.getTime();
  if (typeof v === "string" || typeof v === "number") {
    const t = new Date(v).getTime();
    return Number.isFinite(t) ? t : 0;
  }
  if (typeof (v as { seconds?: unknown }).seconds === "number")
    return (v as { seconds: number }).seconds * 1000;
  return 0;
}
