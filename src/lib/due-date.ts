/** Anything with a Firestore Timestamp-like `toDate`; plain dates, strings and missing values are "no due date". */
export interface DueDateLike {
  toDate?: () => Date;
}

/**
 * A submission is late when the assignment has a due date and `now` is strictly after it.
 * Extracted verbatim from src/app/api/submissions/route.ts (E-002).
 */
export function isSubmissionLate(dueDate: DueDateLike | null | undefined, now: Date): boolean {
  const due = dueDate?.toDate?.();
  return !!due && now > due;
}
