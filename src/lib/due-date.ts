/**
 * A stored due date. New assignments hold a Firestore Timestamp (`toDate`), but legacy and imported ones can
 * hold a Date, an ISO string, epoch milliseconds or a serialized Timestamp (`seconds` / `_seconds`).
 */
export type DueDateLike =
  | { toDate?: () => Date; seconds?: number; _seconds?: number }
  | Date
  | string
  | number;

/** The due date as a valid Date, or null when there is none or it cannot be read. */
export function parseDueDate(dueDate: DueDateLike | null | undefined): Date | null {
  let date: Date | null = null;
  if (dueDate instanceof Date) {
    date = dueDate;
  } else if (typeof dueDate === 'string') {
    date = dueDate.trim() ? new Date(dueDate) : null;
  } else if (typeof dueDate === 'number') {
    date = new Date(dueDate);
  } else if (dueDate && typeof dueDate === 'object') {
    if (typeof dueDate.toDate === 'function') date = dueDate.toDate();
    else {
      const seconds = dueDate.seconds ?? dueDate._seconds;
      if (typeof seconds === 'number') date = new Date(seconds * 1000);
    }
  }
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

/**
 * A submission is late when the assignment has a readable due date and `now` is strictly after it.
 * An unreadable value counts as "no due date" rather than blocking or flagging the submission.
 */
export function isSubmissionLate(dueDate: DueDateLike | null | undefined, now: Date): boolean {
  const due = parseDueDate(dueDate);
  return !!due && now > due;
}
