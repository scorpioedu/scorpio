// Study progress: what a student has practised, what they got right, which misconceptions they hit,
// and which topics are due for review. Pure and dependency-free, so the API routes, the pages and
// the tests share one set of rules. Stored as one document per student, `study_progress/{uid}`,
// written only by the server (POST /api/study/check).
//
// Review is scheduled per topic, not per problem: a student who saw a problem's worked solution
// remembers that problem, so a review serves a different problem from the same topic.
//
// - A wrong answer puts its topic in review at box 0, due the next day.
// - A right answer on a topic in review moves it up one box; after the last box it leaves review.
// - A right answer on a topic not in review changes nothing but the counts.

/** Days until a topic in each box comes back. A right answer in the last box ends its review. */
export const REVIEW_INTERVAL_DAYS = [1, 3, 7, 14] as const;
/** Active days kept for the streak. */
const MAX_DAYS = 60;
const DAY_MS = 86_400_000;

/** "ap-physics-1:3.4": a course's topic. Topic numbers repeat between courses, so the course is part of it. */
export type TopicKey = string;
/** "<course set id>:<question id>". */
export type ProblemKey = string;

export interface ProblemRecord {
  topic: TopicKey;
  /** The latest answer was right. */
  correct: boolean;
  tries: number;
  /** ISO time of the latest answer. */
  at: string;
}

export interface TopicReview {
  /** Index into REVIEW_INTERVAL_DAYS. */
  box: number;
  /** ISO time the topic is next due. */
  due: string;
}

export interface MisconceptionRecord {
  count: number;
  at: string;
}

export interface StudyProgress {
  problems: Record<ProblemKey, ProblemRecord>;
  review: Record<TopicKey, TopicReview>;
  misconceptions: Record<string, MisconceptionRecord>;
  /** "YYYY-MM-DD" (UTC) days with at least one answer, oldest first. */
  days: string[];
  /** Topics whose lesson the student has opened: the ISO time of the latest opening. */
  read: Record<TopicKey, string>;
  updatedAt: string | null;
}

export interface Attempt {
  problem: ProblemKey;
  topic: TopicKey;
  correct: boolean;
  /** Misconception tag ids the answer matched (wrong answers only). */
  misconceptions: string[];
  now: Date;
}

export const topicKey = (courseId: string, topicId: string): TopicKey => `${courseId}:${topicId}`;
export const problemKey = (setId: string, questionId: string): ProblemKey =>
  `${setId}:${questionId}`;

export function splitTopicKey(key: TopicKey): { courseId: string; topicId: string } {
  const i = key.lastIndexOf(":");
  return { courseId: key.slice(0, i), topicId: key.slice(i + 1) };
}

export function emptyProgress(): StudyProgress {
  return { problems: {}, review: {}, misconceptions: {}, days: [], read: {}, updatedAt: null };
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Reads a stored document defensively: anything malformed is dropped, never thrown. */
export function parseProgress(data: unknown): StudyProgress {
  const out = emptyProgress();
  if (!isObject(data)) return out;
  if (isObject(data.problems))
    for (const [k, v] of Object.entries(data.problems))
      if (isObject(v) && typeof v.topic === "string" && typeof v.at === "string")
        out.problems[k] = {
          topic: v.topic,
          correct: v.correct === true,
          tries: typeof v.tries === "number" && v.tries > 0 ? v.tries : 1,
          at: v.at,
        };
  if (isObject(data.review))
    for (const [k, v] of Object.entries(data.review))
      if (isObject(v) && typeof v.box === "number" && typeof v.due === "string")
        out.review[k] = {
          box: Math.min(Math.max(Math.trunc(v.box), 0), REVIEW_INTERVAL_DAYS.length - 1),
          due: v.due,
        };
  if (isObject(data.misconceptions))
    for (const [k, v] of Object.entries(data.misconceptions))
      if (isObject(v) && typeof v.count === "number" && typeof v.at === "string")
        out.misconceptions[k] = { count: v.count, at: v.at };
  if (Array.isArray(data.days))
    out.days = data.days.filter((d): d is string => typeof d === "string").slice(-MAX_DAYS);
  if (isObject(data.read))
    for (const [k, v] of Object.entries(data.read)) if (typeof v === "string") out.read[k] = v;
  if (typeof data.updatedAt === "string") out.updatedAt = data.updatedAt;
  return out;
}

const dayOf = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, days: number) => new Date(d.getTime() + days * DAY_MS).toISOString();

/** The progress after one answer. Does not change `progress`. */
export function recordAttempt(progress: StudyProgress, attempt: Attempt): StudyProgress {
  const { problem, topic, correct, now } = attempt;
  const at = now.toISOString();
  const prev = progress.problems[problem];
  const problems = {
    ...progress.problems,
    [problem]: { topic, correct, tries: (prev?.tries ?? 0) + 1, at },
  };

  const review = { ...progress.review };
  const current = review[topic];
  if (!correct) review[topic] = { box: 0, due: addDays(now, REVIEW_INTERVAL_DAYS[0]) };
  else if (current) {
    const box = current.box + 1;
    if (box >= REVIEW_INTERVAL_DAYS.length) delete review[topic];
    else review[topic] = { box, due: addDays(now, REVIEW_INTERVAL_DAYS[box]) };
  }

  const misconceptions = { ...progress.misconceptions };
  if (!correct)
    for (const tag of new Set(attempt.misconceptions))
      misconceptions[tag] = { count: (misconceptions[tag]?.count ?? 0) + 1, at };

  const today = dayOf(now);
  const days = progress.days.at(-1) === today ? progress.days : [...progress.days, today];
  return {
    problems,
    review,
    misconceptions,
    days: days.slice(-MAX_DAYS),
    read: progress.read,
    updatedAt: at,
  };
}

/** The progress after the student opened these topics' lessons. Does not change `progress`. */
export function recordRead(progress: StudyProgress, topics: TopicKey[], now: Date): StudyProgress {
  if (topics.length === 0) return progress;
  const at = now.toISOString();
  const read = { ...progress.read };
  for (const t of topics) read[t] = at;
  return { ...progress, read, updatedAt: at };
}

/** The topic the student touched last, by reading or answering, and which it was. */
export function lastActivity(
  progress: StudyProgress,
): { topic: TopicKey; kind: "read" | "practice"; at: string } | null {
  let best: { topic: TopicKey; kind: "read" | "practice"; at: string } | null = null;
  for (const p of Object.values(progress.problems))
    if (!best || p.at > best.at) best = { topic: p.topic, kind: "practice", at: p.at };
  for (const [topic, at] of Object.entries(progress.read))
    if (!best || at > best.at) best = { topic, kind: "read", at };
  return best;
}

/** Topics due for review now, the longest overdue first. */
export function dueTopics(progress: StudyProgress, now: Date): TopicKey[] {
  return Object.entries(progress.review)
    .filter(([, r]) => new Date(r.due).getTime() <= now.getTime())
    .sort(([, a], [, b]) => a.due.localeCompare(b.due))
    .map(([k]) => k);
}

/** The date the next review falls due (ISO), or null when nothing is in review. */
export function nextReviewAt(progress: StudyProgress): string | null {
  const dues = Object.values(progress.review).map((r) => r.due);
  return dues.length ? dues.sort()[0] : null;
}

export type TopicLevel = "new" | "learning" | "practised" | "strong";

export interface TopicStats {
  /** Different problems answered. */
  attempted: number;
  /** Different problems whose latest answer was right. */
  correct: number;
  level: TopicLevel;
  inReview: boolean;
  /** The lesson has been opened. */
  read: boolean;
}

/**
 * One topic's standing. "strong": at least 4 problems, at least 80% right, not in review.
 * "practised": at least 2 problems with at least 60% right. Anything answered is at least "learning".
 */
export function topicStats(progress: StudyProgress, topic: TopicKey): TopicStats {
  let attempted = 0;
  let correct = 0;
  for (const p of Object.values(progress.problems))
    if (p.topic === topic) {
      attempted++;
      if (p.correct) correct++;
    }
  const inReview = topic in progress.review;
  const ratio = attempted ? correct / attempted : 0;
  const level: TopicLevel =
    attempted === 0
      ? "new"
      : attempted >= 4 && ratio >= 0.8 && !inReview
        ? "strong"
        : attempted >= 2 && ratio >= 0.6
          ? "practised"
          : "learning";
  return { attempted, correct, level, inReview, read: topic in progress.read };
}

/** Consecutive active days ending today or yesterday (UTC). */
export function streak(progress: StudyProgress, now: Date): number {
  const days = new Set(progress.days);
  let cursor = new Date(`${dayOf(now)}T00:00:00Z`);
  if (!days.has(dayOf(cursor))) cursor = new Date(cursor.getTime() - DAY_MS);
  let n = 0;
  while (days.has(dayOf(cursor))) {
    n++;
    cursor = new Date(cursor.getTime() - DAY_MS);
  }
  return n;
}

/** The misconceptions hit most often, then most recently. */
export function topMisconceptions(
  progress: StudyProgress,
  limit = 5,
): { id: string; count: number; at: string }[] {
  return Object.entries(progress.misconceptions)
    .map(([id, m]) => ({ id, ...m }))
    .sort((a, b) => b.count - a.count || b.at.localeCompare(a.at))
    .slice(0, limit);
}
