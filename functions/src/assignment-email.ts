/** Pure helpers for the assignment-created email trigger (K-002). */

import { studentWantsEmails } from "./student-email-rules";

export interface StudentDoc {
  id?: string;
  data(): Record<string, unknown> | undefined;
}

/**
 * Students who should be told about an assignment. When the assignment belongs to a course
 * only students enrolled in that course (users.courseId) are kept; assignments without a
 * course keep the previous behaviour of notifying all of the teacher's students. Students who
 * turned emails off in Settings are left out. Each result carries the student's id as `uid`.
 */
export function selectRecipients(students: StudentDoc[], courseId: unknown): Array<Record<string, unknown>> {
  return students
    .map((doc): Record<string, unknown> => ({ ...(doc.data() ?? {}), uid: doc.id }))
    .filter(student => typeof student.email === "string" && student.email !== "")
    .filter(student => studentWantsEmails(student))
    .filter(student => !courseId || student.courseId === courseId);
}

/** Runs `task` over `items` with at most `limit` in flight. */
export async function mapWithConcurrency<T>(items: T[], limit: number, task: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      await task(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
