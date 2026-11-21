// Pure row-building for the student Grades page (it replaced "My Submissions") (RT-29 / I-014).
// The page used to call getDoc() for every submission inside every onSnapshot callback.
// Now the listener only stores raw submissions; assignments are fetched once per id and cached,
// and these functions derive the displayed rows from both.

type DateLike = { toDate?: () => Date } | string | number | Date | null | undefined;

export interface SubmissionData {
  assignmentId?: string;
  answers?: unknown[];
  submittedAt?: DateLike;
  graded?: boolean;
  score?: number | null;
  feedback?: string;
  status?: string;
}

export interface RawSubmission {
  id: string;
  data: SubmissionData;
}

export interface AssignmentInfo {
  title?: string;
  courseId?: string;
  teacherId?: string;
}

export interface SubmissionRow {
  id: string;
  assignmentId: string;
  assignmentTitle: string;
  answers: unknown[];
  submittedAt: Date | null;
  graded: boolean;
  score: number | null;
  feedback?: string;
  status?: string;
}

export interface StudentScope {
  courseId?: string | null;
  teacherId?: string | null;
}

/** Distinct assignment ids referenced by the submissions, in first-seen order. */
export function assignmentIdsOf(submissions: readonly RawSubmission[]): string[] {
  const ids = new Set<string>();
  for (const { data } of submissions) {
    if (typeof data.assignmentId === "string" && data.assignmentId) ids.add(data.assignmentId);
  }
  return Array.from(ids);
}

/**
 * Reads each assignment once. A read that throws (Firestore rules deny legacy, deleted or other-class
 * assignments) counts as "unavailable" (null) so one bad assignment cannot hide the student's other grades.
 */
export async function loadAssignments(
  ids: readonly string[],
  fetchOne: (id: string) => Promise<AssignmentInfo | null>,
  onError: (id: string, error: unknown) => void = () => {},
): Promise<Map<string, AssignmentInfo | null>> {
  const entries = await Promise.all(ids.map(async (id): Promise<[string, AssignmentInfo | null]> => {
    try {
      return [id, await fetchOne(id)];
    } catch (error) {
      onError(id, error);
      return [id, null];
    }
  }));
  return new Map(entries);
}

function toDate(value: DateLike): Date | null {
  if (!value) return null;
  if (typeof value === "object" && !(value instanceof Date) && typeof value.toDate === "function") return value.toDate();
  return new Date(value as string | number | Date);
}

/**
 * Same filtering/mapping the page applied inline: drop submissions whose assignment is missing/unreadable
 * (null or absent in the map) or outside the student's class/teacher, drop drafts, newest first.
 */
export function buildSubmissionRows(
  submissions: readonly RawSubmission[],
  assignments: ReadonlyMap<string, AssignmentInfo | null>,
  scope: StudentScope,
): SubmissionRow[] {
  const rows: SubmissionRow[] = [];
  for (const { id, data } of submissions) {
    const assignment = data.assignmentId ? assignments.get(data.assignmentId) : undefined;
    if (!assignment) continue;

    if (scope.courseId) {
      if (assignment.courseId !== scope.courseId) continue;
    } else if (scope.teacherId && assignment.teacherId && scope.teacherId !== assignment.teacherId) {
      continue;
    }

    const status = data.status || (data.graded ? "graded" : "submitted");
    if (status === "draft") continue;

    rows.push({
      id,
      assignmentId: data.assignmentId as string,
      assignmentTitle: assignment.title as string,
      answers: data.answers || [],
      submittedAt: toDate(data.submittedAt),
      graded: data.graded || false,
      score: data.score ?? null,
      feedback: data.feedback ?? "",
      status,
    });
  }
  rows.sort((a, b) => (b.submittedAt ? b.submittedAt.getTime() : 0) - (a.submittedAt ? a.submittedAt.getTime() : 0));
  return rows;
}
