// Browser-side calls to the Study API. Lesson pages pass plain `fetch` (a signed-in visitor's session
// cookie still saves their progress); the student app passes `authenticatedFetch`.
import type { PublicProblem } from "./pool";
import type { StudySummary } from "./catalog";

export type { PublicProblem, StudySummary };

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export interface CheckReply {
  correct: boolean;
  fraction: number;
  feedback: string;
  misconception: { id: string; label: string; description: string } | null;
  answer: string;
  solution: string | null;
  saved: boolean;
}

export interface ReviewReply {
  problems: PublicProblem[];
  dueTopics: string[];
  nextReviewAt: string | null;
}

export type ProgressReply = StudySummary & { shareToken: string | null };

const plainFetch: Fetcher = (input, init) => fetch(input, { credentials: "same-origin", ...init });

async function json<T>(res: Response, fallback: string): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body.error === "string" ? body.error : fallback);
  return body as T;
}

export async function loadProblems(
  scope: { course: string; topic?: string; unit?: number; count?: number },
  fetcher: Fetcher = plainFetch,
): Promise<{ problems: PublicProblem[]; total: number }> {
  const params = new URLSearchParams({ course: scope.course });
  if (scope.topic) params.set("topic", scope.topic);
  if (scope.unit !== undefined) params.set("unit", String(scope.unit));
  if (scope.count) params.set("count", String(scope.count));
  return json(await fetcher(`/api/study/problems?${params}`), "Could not load practice problems.");
}

export async function checkProblem(
  key: string,
  answer: string,
  fetcher: Fetcher = plainFetch,
): Promise<CheckReply> {
  return json(
    await fetcher("/api/study/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, answer }),
    }),
    "Could not check that answer.",
  );
}

export async function loadReview(fetcher: Fetcher): Promise<ReviewReply> {
  return json(await fetcher("/api/study/review"), "Could not load your review.");
}

export async function loadProgress(fetcher: Fetcher, course?: string): Promise<ProgressReply> {
  const query = course ? `?${new URLSearchParams({ course })}` : "";
  return json(await fetcher(`/api/study/progress${query}`), "Could not load your progress.");
}

/** Marks lessons as opened. Best effort: reading never waits on it. */
export async function markRead(fetcher: Fetcher, course: string, topics: string[]): Promise<void> {
  if (topics.length === 0) return;
  await json(
    await fetcher("/api/study/read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ course, topics }),
    }),
    "Could not save your reading.",
  );
}

export async function createShareLink(fetcher: Fetcher): Promise<string> {
  const { token } = await json<{ token: string }>(
    await fetcher("/api/study/share", { method: "POST" }),
    "Could not make a share link.",
  );
  return token;
}

export async function stopSharing(fetcher: Fetcher): Promise<void> {
  await json(
    await fetcher("/api/study/share", { method: "DELETE" }),
    "Could not turn sharing off.",
  );
}

export const shareUrl = (token: string) =>
  `${typeof window === "undefined" ? "" : window.location.origin}/study/share/${token}`;
