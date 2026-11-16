/**
 * Trusted client IP (owner decision, DECISIONS.md: Vercel). Reads `x-vercel-forwarded-for`, then
 * `x-real-ip`, first comma-separated entry. Never reads `x-forwarded-for` (client spoofable).
 * Returns null when neither header is present: callers must then not trust any IP.
 */
export function getClientIp(headers: Headers): string | null {
  for (const name of ['x-vercel-forwarded-for', 'x-real-ip']) {
    const first = (headers.get(name) || '').split(',')[0].trim();
    if (first) return first;
  }
  return null;
}
