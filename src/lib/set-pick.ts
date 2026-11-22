// Which problems of a course set a class gets when the teacher picks a size.
//
// A set is an ordered pool. From the usual size (5) up, a class gets the first `count` problems:
// problems 6 and later are written so every such prefix covers the set's topics. Below 5 the first
// problems alone can leave a topic out, because the original five are grouped by topic (1.1, 1.1,
// 1.2, 1.2, 1.2). So a short set takes turns between the topics of the first five, and keeps the
// problems in their written order. The pick is fixed: every class that asks for 3 gets the same 3.
import { DEFAULT_SET_SIZE } from "@/data/curricula";

/** Indexes into `topics` (one per pool problem, in order) of the problems a set of `count` gets. */
export function pickSetIndexes(topics: readonly (string | undefined)[], count: number): number[] {
  const n = topics.length;
  const size = Math.max(0, Math.min(Math.floor(count), n));
  const usual = Math.min(DEFAULT_SET_SIZE, n);
  if (size >= usual) return Array.from({ length: size }, (_, i) => i);
  // Queue the usual problems by topic, topics in the order they first appear.
  const queues = new Map<string, number[]>();
  for (let i = 0; i < usual; i++) {
    const topic = topics[i] ?? "";
    const queue = queues.get(topic);
    if (queue) queue.push(i);
    else queues.set(topic, [i]);
  }
  const picked: number[] = [];
  while (picked.length < size) {
    for (const queue of queues.values()) {
      if (picked.length === size) break;
      const next = queue.shift();
      if (next !== undefined) picked.push(next);
    }
  }
  return picked.sort((a, b) => a - b);
}

/** The problems of an ordered pool a set of `count` gets; see `pickSetIndexes`. */
export function pickSetProblems<T>(pool: readonly T[], count: number): T[] {
  const topics = pool.map((q) => {
    const topic = (q as { apTopic?: unknown } | null)?.apTopic;
    return typeof topic === "string" ? topic : undefined;
  });
  return pickSetIndexes(topics, count).map((i) => pool[i]);
}
