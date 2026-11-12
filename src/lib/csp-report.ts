// Helpers for /api/csp-report (RT-09). Kept separate from the route so they are unit-testable.

export const MAX_REPORT_BYTES = 8 * 1024;
const MAX_FIELD_LENGTH = 200;
const MAX_REPORTS_PER_MINUTE = 60;

const REPORT_FIELDS = [
  "violated-directive",
  "effective-directive",
  "blocked-uri",
  "document-uri",
  "disposition",
] as const;

function clean(value: unknown): string {
  if (typeof value !== "string") return "";
  // Drop query string and fragment (may carry tokens or PII), strip control characters, cap length.
  const withoutQuery = value.split(/[?#]/)[0];
  const printable = Array.from(withoutQuery)
    .filter((ch) => ch.charCodeAt(0) > 31 && ch.charCodeAt(0) !== 127)
    .join("");
  return printable.slice(0, MAX_FIELD_LENGTH);
}

/** Returns a one-line, PII-free summary, or null if the body is not a CSP report. */
export function summariseCspReport(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const report = (body as Record<string, unknown>)["csp-report"];
  if (typeof report !== "object" || report === null) return null;
  const fields = report as Record<string, unknown>;
  return REPORT_FIELDS.map((name) => `${name}=${clean(fields[name])}`).join(" ");
}

let windowStart = 0;
let windowCount = 0;

/** Per-instance cap on log lines so a flood of reports cannot flood the logs. */
export function allowReport(now: number = Date.now()): boolean {
  if (now - windowStart >= 60_000) {
    windowStart = now;
    windowCount = 0;
  }
  windowCount += 1;
  return windowCount <= MAX_REPORTS_PER_MINUTE;
}

export function resetReportLimiter(): void {
  windowStart = 0;
  windowCount = 0;
}
