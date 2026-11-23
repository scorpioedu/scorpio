/** Pure rules for the weekly teacher digest (teacher-digest.ts). No Firebase imports. */

import { MISCONCEPTION_TAGS } from "./misconceptions";

const DAY_MS = 24 * 60 * 60 * 1000;
export const DIGEST_WINDOW_MS = 7 * DAY_MS;
const MAX_ROWS = 5;
const MAX_MISCONCEPTIONS = 3;

export interface DigestAssignment {
  id: string;
  title: string;
  courseId: string | null;
  /** Millis, or null when the assignment has no due date. */
  dueMs: number | null;
  /** Everyone who has turned it in so far (not just this week); drafts excluded. */
  turnedIn: number;
}

export interface DigestInput {
  now: number;
  /** Class assignments that are not archived. */
  assignments: DigestAssignment[];
  enrolledByCourse: Map<string, number>;
  /** assignmentId of each piece of work turned in during the window. */
  weekSubmissions: string[];
  /** Submissions waiting for the teacher's review, any age. */
  toReview: number;
  /** This week's final misconception events. */
  events: Array<{ tag: string; studentId: string }>;
}

export interface DigestRow {
  title: string;
  turnedIn: number;
  enrolled: number;
  /** "Due Tue, Dec 1", "Was due Mon, Nov 23" or "No due date". */
  due: string;
  /** Past due with students still missing. */
  behind: boolean;
}

export interface Digest {
  turnedInThisWeek: number;
  rows: DigestRow[];
  toReview: number;
  misconceptions: Array<{ label: string; students: number }>;
}

const LABELS = new Map(MISCONCEPTION_TAGS.map((t) => [t.id, t.label]));

function dueText(dueMs: number | null, now: number, timeZone: string): string {
  if (dueMs === null) return "No due date";
  const day = new Date(dueMs).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone,
  });
  return `${dueMs < now ? "Was due" : "Due"} ${day}`;
}

/**
 * What the teacher's week looked like, or null when there is nothing worth an email: no work came
 * in, nothing is waiting for review, and no assignment that just came due is missing work.
 */
export function buildDigest(input: DigestInput, timeZone = "America/Los_Angeles"): Digest | null {
  const { now } = input;
  const since = now - DIGEST_WINDOW_MS;
  const weekCount = new Map<string, number>();
  for (const id of input.weekSubmissions) weekCount.set(id, (weekCount.get(id) ?? 0) + 1);

  const rows = input.assignments
    .map((a) => {
      const enrolled = a.courseId ? (input.enrolledByCourse.get(a.courseId) ?? 0) : 0;
      const dueThisWeek = a.dueMs !== null && a.dueMs >= since && a.dueMs <= now;
      const dueNextWeek = a.dueMs !== null && a.dueMs > now && a.dueMs <= now + DIGEST_WINDOW_MS;
      const behind = dueThisWeek && enrolled > a.turnedIn;
      return { a, enrolled, behind, relevant: weekCount.has(a.id) || dueThisWeek || dueNextWeek };
    })
    .filter((r) => r.relevant && r.enrolled > 0)
    // Missing work first, then by due date; undated assignments last.
    .sort(
      (x, y) =>
        Number(y.behind) - Number(x.behind) ||
        (x.a.dueMs ?? Infinity) - (y.a.dueMs ?? Infinity) ||
        x.a.title.localeCompare(y.a.title),
    );

  const turnedInThisWeek = input.weekSubmissions.length;
  if (turnedInThisWeek === 0 && input.toReview === 0 && !rows.some((r) => r.behind)) return null;

  const studentsByTag = new Map<string, Set<string>>();
  for (const e of input.events) {
    if (!LABELS.has(e.tag)) continue;
    const set = studentsByTag.get(e.tag) ?? new Set<string>();
    set.add(e.studentId);
    studentsByTag.set(e.tag, set);
  }
  const misconceptions = [...studentsByTag.entries()]
    .map(([tag, set]) => ({ label: LABELS.get(tag)!, students: set.size }))
    .sort((x, y) => y.students - x.students || x.label.localeCompare(y.label))
    .slice(0, MAX_MISCONCEPTIONS);

  return {
    turnedInThisWeek,
    toReview: input.toReview,
    misconceptions,
    rows: rows.slice(0, MAX_ROWS).map((r) => ({
      title: r.a.title,
      // A student who left the class can leave more work than students; never show "5 of 4".
      turnedIn: Math.min(r.a.turnedIn, r.enrolled),
      enrolled: r.enrolled,
      due: dueText(r.a.dueMs, now, timeZone),
      behind: r.behind,
    })),
  };
}

export function digestSubject(d: Digest): string {
  if (d.turnedInThisWeek > 0)
    return `Your week on Scorpio: ${d.turnedInThisWeek} ${d.turnedInThisWeek === 1 ? "submission" : "submissions"}`;
  if (d.toReview > 0) return `Scorpio: ${d.toReview} waiting for your review`;
  return "Scorpio: work is still missing from your class";
}

/** One digest per teacher per run day: the key the send is claimed under. */
export function digestKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}
