/** Pure rules for the student emails (student-emails.ts): who gets what, and when. No Firebase imports. */

type Doc = Record<string, unknown> | undefined;

const SITE = "https://scorpioedu.org";
/** Due dates carry no time zone of their own; the pilots are in the US, as in the teacher digest. */
export const EMAIL_TIME_ZONE = "America/Los_Angeles";
const HOUR = 60 * 60 * 1000;

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Firestore Timestamp, Date or epoch ms -> ms; null when there is no usable time. */
export function millis(value: unknown): number | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value && typeof (value as { toMillis?: unknown }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  return null;
}

/** Student emails are on unless the teacher turned them off in Settings. */
export function teacherSendsStudentEmails(teacher: Doc): boolean {
  const prefs = teacher?.preferences as Record<string, unknown> | undefined;
  return prefs?.disableAssignmentEmails !== true;
}

/** A student can turn off every Scorpio email to themselves in Settings. */
export function studentWantsEmails(student: Doc): boolean {
  const prefs = student?.preferences as Record<string, unknown> | undefined;
  return prefs?.disableStudentEmails !== true;
}

/** Students see it: not hidden (archived), not a shared course pool, and owned by a teacher. */
export function isVisibleToStudents(assignment: Doc): boolean {
  if (!assignment || assignment.archivedAt) return false;
  if (assignment.visibility === "global") return false;
  const teacherId = text(assignment.teacherId);
  return Boolean(teacherId) && !teacherId!.includes("/");
}

/** The due date has already passed: no "new assignment" email for it. */
export function isPastDue(assignment: Doc, now: number): boolean {
  const due = millis(assignment?.dueDate);
  return due !== null && due <= now;
}

/** Courses copies made with `hidden` are archived in the same write that creates them. */
const CREATED_HIDDEN_WINDOW_MS = 60 * 1000;
function createdHidden(assignment: Doc): boolean {
  const archived = millis(assignment?.archivedAt);
  const created = millis(assignment?.createdAt);
  return archived !== null && created !== null && Math.abs(archived - created) <= CREATED_HIDDEN_WINDOW_MS;
}

/**
 * A hidden copy (cloned from Courses with `hidden`) that the teacher has just assigned. The create
 * trigger skipped it because students could not see it yet. Restoring an assignment the teacher
 * archived later (including Undo after Archive) is not a new assignment and sends nothing.
 */
export function justAssigned(before: Doc, after: Doc, now: number): boolean {
  return (
    createdHidden(before) && isVisibleToStudents(after) && !after?.emailsSentAt && !isPastDue(after, now)
  );
}

/** "Wed, Nov 25 at 11:59 PM PST" */
export function dueLabel(dueMs: number, timeZone = EMAIL_TIME_ZONE): string {
  const date = new Date(dueMs);
  const day = date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone,
  });
  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  });
  return `${day} at ${time}`;
}

/** "today" or "tomorrow" for a due date inside the reminder window, by the calendar in `timeZone`. */
export function dueDayWord(dueMs: number, now: number, timeZone = EMAIL_TIME_ZONE): string {
  const day = (ms: number) => new Date(ms).toLocaleDateString("en-CA", { timeZone });
  return day(dueMs) === day(now) ? "today" : "tomorrow";
}

/** Reminders go out once, between 24 hours and 1 hour before the due time. */
export const REMINDER_LEAD_MS = 24 * HOUR;
const REMINDER_LAST_CALL_MS = 1 * HOUR;
/** No reminder for work students were told about this recently: the first email is enough. */
const QUIET_AFTER_ANNOUNCE_MS = 12 * HOUR;

export function needsReminder(assignment: Doc, now: number): boolean {
  if (!isVisibleToStudents(assignment) || assignment?.reminderSentAt) return false;
  const due = millis(assignment?.dueDate);
  if (due === null || due - now > REMINDER_LEAD_MS || due - now < REMINDER_LAST_CALL_MS) return false;
  const announced = Math.max(millis(assignment?.createdAt) ?? 0, millis(assignment?.emailsSentAt) ?? 0);
  return now - announced >= QUIET_AFTER_ANNOUNCE_MS;
}

/** Statuses that mean the student has handed the work in. */
const HANDED_IN = new Set(["submitted", "graded", "pending_review"]);
export function handedIn(submission: Doc): boolean {
  return HANDED_IN.has(String(submission?.status));
}

/**
 * The teacher has just finished grading work that was waiting for them. Auto-graded work is not
 * emailed: the student sees that score on screen the moment they turn it in.
 */
export function reviewedResult(
  before: Doc,
  after: Doc,
): { studentId: string; assignmentId: string; earned: number | null; total: number | null; percent: number | null } | null {
  if (!after || after.graded !== true || before?.graded === true) return null;
  if (after.teacherGraded === undefined) return null;
  const studentId = text(after.studentId);
  const assignmentId = text(after.assignmentId);
  if (!studentId || !assignmentId || studentId.includes("/") || assignmentId.includes("/")) return null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    studentId,
    assignmentId,
    earned: num(after.earnedPoints),
    total: num(after.totalPoints),
    percent: num(after.score),
  };
}

/** "Dana Rivera" -> "Dana"; empty when there is no usable name. */
export function firstName(name: unknown): string {
  return text(name)?.split(/\s+/)[0] ?? "";
}

export function assignmentLink(id: string): string {
  return `${SITE}/student/assignment-view?${new URLSearchParams({ id })}`;
}

export function resultsLink(id: string): string {
  return `${SITE}/student/assignment-view?${new URLSearchParams({ id, from: "grades" })}`;
}

export function problemCount(assignment: Doc): number {
  return Array.isArray(assignment?.questions) ? assignment.questions.length : 0;
}
