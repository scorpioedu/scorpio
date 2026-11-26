// The problems Study practises with: every problem of the published course sets (global waypoints
// with a `curriculumSetKey`), with its key, distractor tags and worked solution. Server only: the
// keys never leave the server except as the reply to an answer (POST /api/study/check).
//
// Study shows each answer and worked solution as soon as a problem is answered, so a set that is
// homework somewhere must not be practised: a set is left out while any class has it open. "Open"
// is a class copy (POST /api/assignments/clone writes `forkedFrom` = the set and `courseId` = the
// class) whose due date is still ahead or not set yet, hidden ("assign later") copies included.
// A teacher's library copy with no class does not count. Copies of copies are followed back to the
// published set. The problems are cached for a while; which sets are open is checked every minute,
// so a set leaves Study within a minute of being assigned.
import { adminDb } from "@/lib/firebase-admin";
import { mergeAnswerKey } from "@/lib/assignment-security";
import { parseDueDate } from "@/lib/due-date";
import {
  checkChoice,
  checkNumeric,
  effectiveType,
  parseNumericKey,
  type GradableQuestion,
} from "../../../functions/src/grading-core";
import { misconceptionTag } from "../../../functions/src/misconceptions";
import { problemKey, topicKey, type ProblemKey, type TopicKey } from "./progress";

export interface PoolProblem {
  key: ProblemKey;
  setId: string;
  questionId: string;
  /** Curriculum id, e.g. "ap-physics-1". */
  courseId: string;
  unit: number;
  /** AP topic id, e.g. "3.4". */
  topicId: string;
  topic: TopicKey;
  type: "numeric" | "multiple-choice";
  text: string;
  options?: string[];
  question: GradableQuestion;
  solution: string | null;
}

/** What a student sees before answering: no key, no tags, no solution. */
export interface PublicProblem {
  key: ProblemKey;
  courseId: string;
  unit: number;
  topicId: string;
  type: "numeric" | "multiple-choice";
  text: string;
  options?: string[];
}

export interface CheckOutcome {
  correct: boolean;
  /** 0..1: numeric answers with a unit slip get part credit. */
  fraction: number;
  feedback: string;
  misconception: { id: string; label: string; description: string } | null;
  misconceptions: string[];
  answer: string;
  solution: string | null;
}

const CONTENT_TTL_MS = 30 * 60_000;
const OPEN_TTL_MS = 60_000;
/** How many copy-of-a-copy steps are followed back to a published set. */
const MAX_FORK_DEPTH = 4;

type Data = FirebaseFirestore.DocumentData;
type Cached<T> = { at: number; value: Promise<T> } | null;
let content: Cached<Map<ProblemKey, PoolProblem>> = null;
let open: Cached<Set<string>> = null;

/** Reuses a cached promise while it is fresh; a failed load is tried again on the next request. */
function cachedLoad<T>(
  slot: Cached<T>,
  set: (c: Cached<T>) => void,
  ttl: number,
  now: Date,
  load: () => Promise<T>,
): Promise<T> {
  if (slot && now.getTime() - slot.at <= ttl) return slot.value;
  const value = load();
  const entry = { at: now.getTime(), value };
  set(entry);
  value.catch(() => set(null));
  return value;
}

/** Whether a copy is homework that is still to come or still due in a class. */
function isOpenClassCopy(copy: Data, now: Date): boolean {
  if (typeof copy.courseId !== "string" || !copy.courseId) return false;
  const due = parseDueDate(copy.dueDate);
  return !due || due.getTime() > now.getTime();
}

/** The published sets (of `setIds`) that some class has open, following copies of copies. */
export async function findOpenSets(setIds: string[], now: Date): Promise<Set<string>> {
  const found = new Set<string>();
  // Each copy's id -> the published set it came from.
  let frontier = new Map(setIds.map((id) => [id, id]));
  for (let depth = 0; depth < MAX_FORK_DEPTH && frontier.size > 0; depth++) {
    const next = new Map<string, string>();
    const ids = [...frontier.keys()];
    for (let i = 0; i < ids.length; i += 30) {
      const copies = await adminDb
        .collection("assignments")
        .where("forkedFrom", "in", ids.slice(i, i + 30))
        .get();
      for (const doc of copies.docs) {
        const copy = doc.data();
        const root = frontier.get(copy.forkedFrom);
        if (!root) continue;
        if (isOpenClassCopy(copy, now)) found.add(root);
        next.set(doc.id, root);
      }
    }
    frontier = next;
  }
  return found;
}

async function loadContent(): Promise<Map<ProblemKey, PoolProblem>> {
  const globals = await adminDb.collection("assignments").where("visibility", "==", "global").get();
  const sets = globals.docs.filter(
    (d) =>
      typeof d.data().curriculumSetKey === "string" && typeof d.data().curriculumId === "string",
  );
  const ids = sets.map((d) => d.id);
  const [keys, solutions] = await Promise.all([
    Promise.all(ids.map((id) => adminDb.collection("assignment_keys").doc(id).get())),
    Promise.all(ids.map((id) => adminDb.collection("assignment_solutions").doc(id).get())),
  ]);

  const pool = new Map<ProblemKey, PoolProblem>();
  sets.forEach((doc, i) => {
    const set = doc.data();
    const merged = mergeAnswerKey(set as never, keys[i].data() as never);
    const worked: Data = solutions[i].data()?.solutions ?? {};
    for (const raw of merged.questions as Data[]) {
      const q = raw as GradableQuestion;
      const type = effectiveType(q);
      if (type !== "numeric" && type !== "multiple-choice") continue;
      if (type === "numeric" && !parseNumericKey(q.correctAnswer)) continue;
      if (type === "multiple-choice" && (!Array.isArray(q.options) || q.options.length < 2))
        continue;
      const topicId = typeof q.apTopic === "string" ? q.apTopic : "";
      const unit = Number(topicId.split(".")[0]);
      if (!topicId || !Number.isFinite(unit) || typeof q.id !== "string") continue;
      const key = problemKey(doc.id, q.id);
      pool.set(key, {
        key,
        setId: doc.id,
        questionId: q.id,
        courseId: set.curriculumId,
        unit,
        topicId,
        topic: topicKey(set.curriculumId, topicId),
        type,
        text: String(q.text ?? ""),
        ...(type === "multiple-choice" ? { options: (q.options as unknown[]).map(String) } : {}),
        question: q,
        solution: typeof worked[q.id] === "string" && worked[q.id].trim() ? worked[q.id] : null,
      });
    }
  });
  return pool;
}

/** Every problem Study may serve right now: the published sets that no class has open. */
export async function loadPool(now = new Date()): Promise<Map<ProblemKey, PoolProblem>> {
  const all = await cachedLoad(content, (c) => (content = c), CONTENT_TTL_MS, now, loadContent);
  const setIds = [...new Set([...all.values()].map((p) => p.setId))];
  const held = await cachedLoad(
    open,
    (c) => (open = c),
    OPEN_TTL_MS,
    now,
    () => findOpenSets(setIds, now),
  );
  if (held.size === 0) return all;
  return new Map([...all].filter(([, p]) => !held.has(p.setId)));
}

/** For tests. */
export function resetPoolCache() {
  content = null;
  open = null;
}

export function publicProblem(p: PoolProblem): PublicProblem {
  return {
    key: p.key,
    courseId: p.courseId,
    unit: p.unit,
    topicId: p.topicId,
    type: p.type,
    text: p.text,
    ...(p.options ? { options: p.options } : {}),
  };
}

/**
 * "1,5 m/s" -> "1.5 m/s": a comma used as the decimal point, as many students write it. A comma
 * before exactly three digits after a non-zero whole number ("1,500 N") is a thousands separator
 * and is left alone; so is anything that already has a decimal point. Study only: homework grading
 * is unchanged.
 */
export function decimalComma(answer: string): string {
  if (answer.includes(".")) return answer;
  return answer.replace(/(-?\d+),(\d+)(?![\d,])/g, (whole, int: string, frac: string) =>
    frac.length === 3 && !/^-?0$/.test(int) ? whole : `${int}.${frac}`,
  );
}

/** Grades one answer the way homework is graded (no AI): exact choice, or a quantity within tolerance. */
export function checkAnswer(p: PoolProblem, answer: string): CheckOutcome {
  let result =
    p.type === "multiple-choice"
      ? checkChoice(answer, p.question)
      : checkNumeric(decimalComma(answer), p.question);
  if (!result)
    result = {
      fraction: 0,
      feedback: "Enter a number, with its unit if it has one.",
      misconceptions: [],
    };
  const tag = result.misconceptions.map(misconceptionTag).find(Boolean);
  return {
    correct: result.fraction >= 1,
    fraction: result.fraction,
    feedback: result.feedback,
    misconception: tag ? { id: tag.id, label: tag.label, description: tag.description } : null,
    misconceptions: result.misconceptions,
    answer: String(p.question.correctAnswer ?? ""),
    solution: p.solution,
  };
}

/**
 * Up to `count` problems, those the student has not answered first, then those answered longest ago,
 * mixing problem order with `seed` so the same topic does not always open on the same problem.
 */
export function pickProblems(
  candidates: PoolProblem[],
  count: number,
  answeredAt: (key: ProblemKey) => string | undefined,
  seed: number,
): PoolProblem[] {
  const shuffled = candidates
    .map((p, i) => ({ p, r: hash(`${seed}:${p.key}:${i}`) }))
    .sort((a, b) => a.r - b.r)
    .map(({ p }) => p);
  const unseen = shuffled.filter((p) => !answeredAt(p.key));
  const seen = shuffled
    .filter((p) => answeredAt(p.key))
    .sort((a, b) => answeredAt(a.key)!.localeCompare(answeredAt(b.key)!));
  return [...unseen, ...seen].slice(0, count);
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
