/** Pure rules for the teacher onboarding emails (teacher-emails.ts). No Firebase imports. */

type Doc = Record<string, unknown> | undefined;

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** An access request that has just been approved and has a code and an address to send it to. */
export function approvedRequest(
  before: Doc,
  after: Doc,
): { email: string; name: string; code: string } | null {
  if (!after || after.status !== "approved" || before?.status === "approved") return null;
  const email = text(after.email);
  const code = text(after.generatedCode);
  if (!email || !code) return null;
  return { email, code, name: text(after.name) ?? "" };
}

/** The teacher a student has just been enrolled with, or null when the write did not enroll anyone. */
export function newEnrollment(
  before: Doc,
  after: Doc,
): { teacherId: string; courseId: string | null } | null {
  const teacherId = text(after?.teacherId);
  if (!teacherId || teacherId.includes("/")) return null;
  const courseId = text(after?.courseId);
  if (before && text(before.teacherId) === teacherId && text(before.courseId) === courseId)
    return null;
  return { teacherId, courseId };
}

const RESULT_STATES = new Set(["graded", "pending_review"]);

/**
 * A submission that has just become something the teacher can look at: graded, or waiting for
 * their review. Drafts and work still being graded do not count.
 */
export function newResult(
  before: Doc,
  after: Doc,
): { teacherId: string; needsReview: boolean } | null {
  const status = text(after?.status);
  if (!status || !RESULT_STATES.has(status)) return null;
  if (before && RESULT_STATES.has(String(before.status))) return null;
  const teacherId = text(after?.teacherId);
  if (!teacherId || teacherId.includes("/")) return null;
  return { teacherId, needsReview: status === "pending_review" };
}

/** "Dana Rivera" -> "Dana"; empty when there is no usable name. */
export function firstName(name: unknown): string {
  return text(name)?.split(/\s+/)[0] ?? "";
}

const SITE = "https://scorpioedu.org";

export function signupLink(code: string): string {
  return `${SITE}/signup?${new URLSearchParams({ teacherInvite: code })}`;
}

export const TEACHER_HOME = `${SITE}/teacher`;
export const TEACHER_GRADES = `${SITE}/teacher/grades`;
