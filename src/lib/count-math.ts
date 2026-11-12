// Pure helpers for replacing "load every document and count" with Firestore aggregate counts (RT-29).

/** Firestore `in` / documentId `in` accept at most 30 values per query. */
export const FIRESTORE_IN_LIMIT = 30;

export function chunk<T>(items: readonly T[], size: number = FIRESTORE_IN_LIMIT): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new Error(`chunk size must be a positive integer, got ${size}`);
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/** Aggregate counts for one `assignmentId in [...]` chunk of submissions. */
export interface SubmissionCountParts {
  /** every submission in the chunk */
  total: number;
  /** status == "draft" */
  drafts: number;
  /** graded == true */
  graded: number;
  /** graded == true and status == "draft" */
  gradedDrafts: number;
}

/**
 * Reproduces the dashboard's old client-side maths exactly:
 *   submitted = status !== "draft"; pending = submitted && !graded; completed = submitted - pending.
 * A document with no `graded` field counts as not graded, so pending is derived by subtraction
 * rather than from a `graded == false` query (which would skip such documents).
 */
export function summarizeSubmissionCounts(parts: readonly SubmissionCountParts[]) {
  let submitted = 0;
  let completed = 0;
  for (const part of parts) {
    submitted += part.total - part.drafts;
    completed += part.graded - part.gradedDrafts;
  }
  return { completedSubmissions: completed, pendingSubmissions: submitted - completed };
}

/** |A union B| without reading documents: |A| + |B| - |A intersect B|. */
export function unionCount(a: number, b: number, intersection: number): number {
  return a + b - intersection;
}

/** Collects unique non-empty ids in first-seen order. */
export function distinctIds(ids: readonly (string | undefined | null)[]): string[] {
  return Array.from(new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0)));
}
