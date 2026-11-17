/** Pure helpers for the teacher first-run page (/teacher/welcome). */

export const WELCOME_SKIPPED_KEY = "scorpio:welcome-skipped";

const isSchoolDay = (d: Date) => d.getDay() !== 0 && d.getDay() !== 6;

/** `YYYY-MM-DD` (what <input type="date"> uses) -> a local Date at noon, or null. */
export function parseDateInput(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toDateInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The first weekday on or after `from`. */
export function nextSchoolDay(from: Date): Date {
  const d = new Date(from);
  while (!isSchoolDay(d)) d.setDate(d.getDate() + 1);
  return d;
}

/** Add `n` school days (Mon-Fri); holidays are not known, so the teacher can still edit dates later. */
export function addSchoolDays(from: Date, n: number): Date {
  const d = new Date(from);
  let left = n;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    if (isSchoolDay(d)) left--;
  }
  return d;
}

/**
 * Due dates for `count` assignments: the first lands on `start` (moved to the next school day if it is a
 * weekend), then one every `spacing` school days. Each is 23:59 local time.
 */
export function scheduleDueDates(start: Date, count: number, spacing: number): Date[] {
  const gap = Math.max(1, Math.floor(spacing));
  let day = nextSchoolDay(start);
  const out: Date[] = [];
  for (let i = 0; i < count; i++) {
    const due = new Date(day);
    due.setHours(23, 59, 0, 0);
    out.push(due);
    day = addSchoolDays(day, gap);
  }
  return out;
}

/** Class name from the name and optional period: "AP Physics 1 - Period 3". */
export function formatClassName(name: string, period: string): string {
  const n = name.trim();
  const p = period.trim();
  if (!p) return n;
  return `${n} - ${/^\d+$/.test(p) ? `Period ${p}` : p}`;
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function randomClassCode(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  return Array.from(random(8), (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export interface UnitAvailability {
  unit: number;
  count: number;
}

/** Group global assignments by AP Physics 1 unit. Anything not tagged to a unit is ignored. */
export function countByUnit(items: { apUnit?: unknown; apCourse?: unknown }[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const a of items) {
    if (typeof a.apUnit !== "number") continue;
    if (a.apCourse != null && a.apCourse !== "physics-1") continue;
    counts.set(a.apUnit, (counts.get(a.apUnit) ?? 0) + 1);
  }
  return counts;
}

export function studentMessage(opts: {
  className: string;
  code: string;
  joinUrl: string;
  firstTitle?: string | null;
  firstDue?: Date | null;
}): string {
  const lines = [
    `Hi! Please join our class "${opts.className}" on Scorpio:`,
    opts.joinUrl,
    `Class code: ${opts.code}`,
    "Create your account with your school email, then the class assignments will show up in your list.",
  ];
  if (opts.firstTitle && opts.firstDue) {
    lines.push(
      `First assignment: ${opts.firstTitle}, due ${opts.firstDue.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}.`,
    );
  }
  return lines.join("\n");
}
