import { authenticatedFetch } from "./authenticated-fetch";

const RESEARCH_ENDPOINT = "/api/research/respond";

/**
 * Runs `task` with calls to the research endpoint sent as the signed-in admin's bearer token.
 *
 * Temporary shim (RT-06): `src/lib/ai/research.ts` still calls the global `fetch` with a legacy
 * `x-admin-secret` header, and that file is owned by another ticket. The server ignores that
 * header. Remove this once research.ts uses `authenticatedFetch` directly (see FOLLOWUPS.md).
 */
export async function withAuthenticatedResearchFetch<T>(task: () => Promise<T>): Promise<T> {
  const originalFetch = window.fetch;
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
    return url.endsWith(RESEARCH_ENDPOINT) ? authenticatedFetch(input, init) : originalFetch(input, init);
  };
  try {
    return await task();
  } finally {
    window.fetch = originalFetch;
  }
}
