// The school calendar used to place due dates: weekends plus a list of days off. A class can store
// its own list (`daysOff` on the class doc, written by PATCH /api/courses/{id}/plan); without one the
// US defaults below apply. Pure, so the same code runs in the browser, the routes and the tests.

/** One day or a range off school, both ends inclusive, as local `YYYY-MM-DD`. */
export interface DayOff {
  start: string;
  end: string;
  label: string;
}

export const MAX_DAYS_OFF = 80;
const MAX_RANGE_DAYS = 120;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
/** Local calendar day of a Date as `YYYY-MM-DD`. */
export const dayKey = (d: Date) => iso(d.getFullYear(), d.getMonth() + 1, d.getDate());

/** The n-th (1-based) given weekday of a month; n = -1 means the last one. */
function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  if (n > 0) {
    const first = new Date(year, month - 1, 1, 12).getDay();
    return iso(year, month, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7);
  }
  const last = new Date(year, month, 0, 12);
  return iso(year, month, last.getDate() - ((last.getDay() - weekday + 7) % 7));
}

/** The school year a date falls in, named by the year it starts (August to July). */
export function schoolYearOf(d: Date): number {
  return d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
}

/**
 * US defaults for the school year that starts in August of `year`. Spring break is left out because
 * its week differs by district; a teacher adds it (and removes anything their school works through).
 */
export function defaultDaysOff(year: number): DayOff[] {
  const one = (day: string, label: string): DayOff => ({ start: day, end: day, label });
  const thanksgiving = nthWeekday(year, 11, 4, 4);
  return [
    one(nthWeekday(year, 9, 1, 1), "Labor Day"),
    one(nthWeekday(year, 10, 1, 2), "Indigenous Peoples' Day"),
    one(iso(year, 11, 11), "Veterans Day"),
    {
      start: thanksgiving,
      end: iso(year, 11, Number(thanksgiving.slice(8)) + 1),
      label: "Thanksgiving break",
    },
    { start: iso(year, 12, 19), end: iso(year + 1, 1, 4), label: "Winter break" },
    one(nthWeekday(year + 1, 1, 1, 3), "Martin Luther King Jr. Day"),
    one(nthWeekday(year + 1, 2, 1, 3), "Presidents' Day"),
    one(nthWeekday(year + 1, 5, 1, -1), "Memorial Day"),
    one(iso(year + 1, 6, 19), "Juneteenth"),
  ];
}

/** Defaults covering the school year `now` is in and the next one, so dates can run past summer. */
export function defaultCalendar(now: Date = new Date()): DayOff[] {
  const year = schoolYearOf(now);
  return [...defaultDaysOff(year), ...defaultDaysOff(year + 1)];
}

function validDay(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const m = DAY.exec(value);
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  return dayKey(d) === value;
}

const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);

/**
 * Checks a list a teacher saved. Returns the cleaned list (sorted by start, labels trimmed) or an
 * error message. An empty list is valid: it means "weekends only".
 */
export function parseDaysOff(
  raw: unknown,
): { ok: true; daysOff: DayOff[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: "Days off must be a list" };
  if (raw.length > MAX_DAYS_OFF)
    return { ok: false, error: `Keep the list to ${MAX_DAYS_OFF} entries` };
  const out: DayOff[] = [];
  for (const item of raw) {
    const r = item as Partial<DayOff> | null;
    if (!r || !validDay(r.start) || !validDay(r.end))
      return { ok: false, error: "Each day off needs a valid start and end date" };
    if (r.end < r.start) return { ok: false, error: "A day off cannot end before it starts" };
    if (daysBetween(r.start, r.end) > MAX_RANGE_DAYS)
      return { ok: false, error: `A break can be at most ${MAX_RANGE_DAYS} days long` };
    const label = typeof r.label === "string" ? r.label.trim().slice(0, 60) : "";
    out.push({ start: r.start, end: r.end, label: label || "Day off" });
  }
  out.sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  return { ok: true, daysOff: out };
}

/** A class's stored list when it has a valid one, else the defaults. */
export function classCalendar(stored: unknown, now: Date = new Date()): DayOff[] {
  if (stored == null) return defaultCalendar(now);
  const parsed = parseDaysOff(stored);
  return parsed.ok ? parsed.daysOff : defaultCalendar(now);
}

/** The day off that covers `d`, if any. */
export function dayOffOn(d: Date, daysOff: readonly DayOff[]): DayOff | undefined {
  const key = dayKey(d);
  return daysOff.find((r) => r.start <= key && key <= r.end);
}

export type SchoolDayTest = (d: Date) => boolean;

export const isWeekday: SchoolDayTest = (d) => d.getDay() !== 0 && d.getDay() !== 6;

/** A school-day test for a calendar: a weekday that no day off covers. */
export function schoolDays(daysOff: readonly DayOff[]): SchoolDayTest {
  return (d) => isWeekday(d) && !dayOffOn(d, daysOff);
}

/** "Thu, Nov 26" or "Sat, Dec 19 – Mon, Jan 4" for a list row. */
export function formatDayOff(r: DayOff, locale?: string): string {
  const fmt = (day: string) =>
    new Date(`${day}T12:00:00`).toLocaleDateString(locale, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  return r.start === r.end ? fmt(r.start) : `${fmt(r.start)} – ${fmt(r.end)}`;
}
