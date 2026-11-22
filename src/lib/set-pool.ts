// A published course set's problems with their answers, for a teacher deciding what to assign
// (GET /api/assignments/set-pool). Browser-side.
import { authenticatedFetch } from "@/lib/authenticated-fetch";

export interface PoolQuestion {
  text: string;
  type?: string;
  options?: string[];
  points?: number;
  apTopic?: string;
  correctAnswer: string;
}

/** One request per set for as long as the page is open: the dialog is opened and closed a lot. */
const pools = new Map<string, Promise<PoolQuestion[]>>();

export function loadSetPool(sourceId: string): Promise<PoolQuestion[]> {
  let pool = pools.get(sourceId);
  if (!pool) {
    pool = authenticatedFetch(
      `/api/assignments/set-pool?sourceId=${encodeURIComponent(sourceId)}`,
    ).then(async (res) => {
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(body.questions))
        throw new Error(body.error || "Could not load the problems.");
      return body.questions as PoolQuestion[];
    });
    // A failed load is tried again the next time the problems are opened.
    pool.catch(() => pools.delete(sourceId));
    pools.set(sourceId, pool);
  }
  return pool;
}
