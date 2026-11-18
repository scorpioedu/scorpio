// The Calendar view on /teacher/courses: every set of the class's course on the day it is due.
// Assigned sets sit on their real due date; sets still to come sit where the pacing guide puts them.
// Pure; it builds on the status groups in course-board.ts, so a set reads the same on the List and here.
import type { BoardCard, BoardColumns } from "@/lib/course-board";
import { dayKey, dayOffOn, type DayOff, type SchoolDayTest } from "@/lib/school-calendar";
import { dueOnDay } from "@/lib/teacher-edit";

/** "planned": not assigned yet, dated by the pacing guide. The rest are the status groups of course-board.ts. */
export type CalendarStatus = "planned" | "assigned" | "needsYou" | "done";

export interface CalendarItem extends BoardCard {
  status: CalendarStatus;
  /** The due date, or for a planned set the date it would get at the current pace. */
  due: Date;
}

export interface CalendarItems {
  /** Items by local day (`YYYY-MM-DD`), earliest due time first, then by set key. */
  byDay: Map<string, CalendarItem[]>;
  /** Assigned sets with no due date: they have no day to sit on. */
  undated: (BoardCard & { status: Exclude<CalendarStatus, "planned"> })[];
}

/**
 * Put the sets on days. Skipped and unpublished sets are left out (they have no date), and
 * so is an Up next set the pacing guide has no date for.
 */
export function calendarItems(columns: BoardColumns, planned: Map<string, Date>): CalendarItems {
  const byDay = new Map<string, CalendarItem[]>();
  const undated: CalendarItems["undated"] = [];
  const place = (card: BoardCard, status: CalendarStatus, due: Date) => {
    const day = dayKey(due);
    byDay.set(day, [...(byDay.get(day) ?? []), { ...card, status, due }]);
  };
  for (const card of columns.upNext) {
    const due = planned.get(card.key);
    if (due) place(card, "planned", due);
  }
  for (const status of ["assigned", "needsYou", "done"] as const)
    for (const card of columns[status]) {
      if (card.s.dueDate) place(card, status, card.s.dueDate);
      else undated.push({ ...card, status });
    }
  for (const items of byDay.values())
    items.sort(
      (a, b) =>
        a.due.getTime() - b.due.getTime() ||
        a.key.localeCompare(b.key, undefined, { numeric: true }),
    );
  return { byDay, undated };
}

/** A month as the calendar shows it: `month` is 0 for January. */
export interface Month {
  year: number;
  month: number;
}

export const monthOf = (d: Date): Month => ({ year: d.getFullYear(), month: d.getMonth() });

export function addMonths(m: Month, n: number): Month {
  const d = new Date(m.year, m.month + n, 1, 12);
  return monthOf(d);
}

export const sameMonth = (a: Month, b: Month) => a.year === b.year && a.month === b.month;

/**
 * The weeks of a month, Sunday first, each seven days long; the first and last week are filled with
 * the neighbouring months' days. Dates are at noon, so a daylight-saving change never shifts a day.
 */
export function monthWeeks(m: Month): Date[][] {
  const first = new Date(m.year, m.month, 1, 12);
  const start = new Date(m.year, m.month, 1 - first.getDay(), 12);
  const weeks: Date[][] = [];
  for (let w = 0; ; w++) {
    const week = Array.from(
      { length: 7 },
      (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + i, 12),
    );
    if (w > 0 && !sameMonth(monthOf(week[0]), m)) break;
    weeks.push(week);
  }
  return weeks;
}

/** The day `n` days after `d` (before it when negative), at noon. */
export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);
}

/** The week a day is in, Sunday first, each day at noon: what the Week view shows. */
export function weekOf(d: Date): Date[] {
  const start = addDays(d, -d.getDay());
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/**
 * The unit (or units) each week belongs to, one list per week: the units of the sets on its days, in
 * the order they come up. A week with no sets between two that have some belongs to the unit that
 * comes next (the class is working towards it); a week before the first set or after the last has
 * none, and neither has a week with no school at all (a break).
 */
export function weekUnits(
  weeks: readonly Date[][],
  items: CalendarItems,
  isSchoolDay?: SchoolDayTest,
): number[][] {
  const own = weeks.map((week) => [
    ...new Set(week.flatMap((day) => (items.byDay.get(dayKey(day)) ?? []).map((i) => i.unit))),
  ]);
  const days = [...items.byDay.keys()].sort();
  if (!days.length) return own;
  return own.map((units, w) => {
    if (units.length) return units;
    const start = dayKey(weeks[w][0]);
    if (start < days[0]) return [];
    if (isSchoolDay && !weeks[w].some(isSchoolDay)) return [];
    const next = days.find((day) => day > start);
    return next ? [items.byDay.get(next)![0].unit] : [];
  });
}

/** The first day one unit has a set on (its real or planned date), to jump the calendar to. */
export function unitFirstDay(items: CalendarItems, unit: number): Date | null {
  let first: Date | null = null;
  for (const list of items.byDay.values())
    for (const item of list)
      if (item.unit === unit && (!first || item.due < first)) first = item.due;
  return first;
}

/** Days off that sit side by side in a row of days: one name shown across all of them. */
export interface DayOffRun {
  /** Index of the first and the last day in the row, both inclusive. */
  from: number;
  to: number;
  label: string;
}

/**
 * The runs of days off in a row of days (a week). Days next to each other that the same entry of the
 * class's calendar covers make one run, so "Thanksgiving break" is written once across Thursday and
 * Friday and a winter break across the whole week, weekend included. Plain weekends are not runs.
 */
export function dayOffRuns(days: readonly Date[], daysOff: readonly DayOff[]): DayOffRun[] {
  const runs: (DayOffRun & { entry: DayOff })[] = [];
  days.forEach((day, i) => {
    const entry = dayOffOn(day, daysOff);
    if (!entry) return;
    const last = runs[runs.length - 1];
    if (last && last.to === i - 1 && last.entry === entry) last.to = i;
    else runs.push({ from: i, to: i, label: entry.label, entry });
  });
  return runs.map(({ from, to, label }) => ({ from, to, label }));
}

/** The months that have something on them, first to last (null when the calendar is empty). */
export function calendarSpan(items: CalendarItems): { first: Month; last: Month } | null {
  const days = [...items.byDay.keys()].sort();
  if (!days.length) return null;
  const month = (day: string): Month => ({
    year: Number(day.slice(0, 4)),
    month: Number(day.slice(5, 7)) - 1,
  });
  return { first: month(days[0]), last: month(days[days.length - 1]) };
}

export type DayMove =
  | { ok: true; due: Date }
  /** "same": dropped on the day it is already due. "off": not a school day. "planned": no copy to re-date. */
  | { ok: false; reason: "same" | "off" | "planned" };

/**
 * Drop a set on a day: its due date moves there and keeps its time of day. Only a set that is
 * assigned can move (a planned set's date comes from the pacing guide), and only to a school day.
 */
export function moveToDay(item: CalendarItem, day: Date, isSchoolDay: SchoolDayTest): DayMove {
  if (item.status === "planned" || !item.s.assignmentId) return { ok: false, reason: "planned" };
  if (dayKey(day) === dayKey(item.due)) return { ok: false, reason: "same" };
  if (!isSchoolDay(day)) return { ok: false, reason: "off" };
  return { ok: true, due: dueOnDay(day, item.due) };
}
