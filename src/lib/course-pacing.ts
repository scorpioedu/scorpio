// The pacing guide and bulk due-date moves for a class that follows a course. Pure; the school-day
// test comes from school-calendar.ts so holidays and the class's own days off are skipped.
import { addSchoolDays, nextSchoolDay, scheduleDueDates } from "@/lib/first-run";
import type { RoadmapUnit } from "@/lib/curriculum-roadmap";
import { isWeekday, type SchoolDayTest } from "@/lib/school-calendar";

export interface PacedSet {
  key: string;
  unit: number;
  due: Date;
  /** "assigned": the class's real due date. "projected": where it would land at this pace. */
  source: "assigned" | "projected";
}

export interface PacedUnit {
  unit: number;
  sets: PacedSet[];
  /** Latest due date in the unit (null when every set is skipped). */
  finish: Date | null;
  /** True when every set in the unit already has a real due date. */
  allAssigned: boolean;
}

export interface Pacing {
  units: PacedUnit[];
  finish: Date | null;
  /** Sets still to be assigned. */
  remaining: number;
  /** The finish date falls in May or later, when AP exams have started. */
  afterExams: boolean;
}

export interface PacingOptions {
  /** First due date for sets that are not assigned yet. */
  start: Date;
  /** School days between due dates. */
  spacing: number;
  isSchoolDay?: SchoolDayTest;
}

/**
 * Dates for every set the class will do, in roadmap order. Sets already assigned keep their real due
 * dates; the rest are spaced from `start`, or from one step after the latest real due date when that
 * is later, so projected work never lands before work already set.
 */
export function paceCourse(roadmap: RoadmapUnit[], opts: PacingOptions): Pacing {
  const isSchoolDay = opts.isSchoolDay ?? isWeekday;
  const spacing = Math.max(1, Math.floor(opts.spacing));
  const wanted = roadmap.flatMap((u) => u.sets.filter((s) => !s.skipped));
  const real = wanted.filter((s) => s.assigned && s.dueDate);
  const todo = wanted.filter((s) => !(s.assigned && s.dueDate));
  const latest = real.reduce<Date | null>(
    (max, s) => (!max || s.dueDate! > max ? s.dueDate! : max),
    null,
  );
  const afterLatest = latest ? addSchoolDays(latest, spacing, isSchoolDay) : null;
  const from = afterLatest && afterLatest > opts.start ? afterLatest : opts.start;
  const dates = scheduleDueDates(from, todo.length, spacing, isSchoolDay);
  const projected = new Map(todo.map((s, i) => [s.set.key, dates[i]]));

  const units = roadmap.map((u) => {
    const sets: PacedSet[] = u.sets
      .filter((s) => !s.skipped)
      .map((s) =>
        s.assigned && s.dueDate
          ? { key: s.set.key, unit: u.unit, due: s.dueDate, source: "assigned" as const }
          : {
              key: s.set.key,
              unit: u.unit,
              due: projected.get(s.set.key)!,
              source: "projected" as const,
            },
      );
    return {
      unit: u.unit,
      sets,
      finish: sets.reduce<Date | null>((max, s) => (!max || s.due > max ? s.due : max), null),
      allAssigned: sets.length > 0 && sets.every((s) => s.source === "assigned"),
    };
  });
  const finish = units.reduce<Date | null>(
    (max, u) => (u.finish && (!max || u.finish > max) ? u.finish : max),
    null,
  );
  return {
    units,
    finish,
    remaining: todo.length,
    // AP exams start in early May; June and July are past them too.
    afterExams: !!finish && finish.getMonth() >= 4 && finish.getMonth() <= 6,
  };
}

export interface DatedItem {
  id: string;
  due: Date;
}

const atEndOfDay = (d: Date) => {
  const out = new Date(d);
  out.setHours(23, 59, 0, 0);
  return out;
};

/**
 * Move each due date by `days` school days (negative = earlier). A date that sits on a day off is
 * first moved to the next school day, so `days = 0` only tidies dates off holidays and weekends.
 * Returns only the items whose date changes.
 */
export function shiftDueDates(
  items: DatedItem[],
  days: number,
  isSchoolDay: SchoolDayTest = isWeekday,
): DatedItem[] {
  return items
    .map((item) => ({
      id: item.id,
      due: atEndOfDay(addSchoolDays(nextSchoolDay(item.due, isSchoolDay), days, isSchoolDay)),
    }))
    .filter((next, i) => next.due.getTime() !== items[i].due.getTime());
}

/** Re-space items, in the order given, from `start` every `spacing` school days. Changed items only. */
export function respaceDueDates(
  items: DatedItem[],
  start: Date,
  spacing: number,
  isSchoolDay: SchoolDayTest = isWeekday,
): DatedItem[] {
  const dates = scheduleDueDates(start, items.length, spacing, isSchoolDay);
  return items
    .map((item, i) => ({ id: item.id, due: dates[i] }))
    .filter((next, i) => next.due.getTime() !== items[i].due.getTime());
}

/**
 * After the class's order changes, give its assigned sets the same due dates in the new order: the
 * earliest date goes to the first set in the order, and so on. Only sets whose date changes are returned.
 */
export function redateToOrder(
  orderedKeys: string[],
  assigned: { key: string; id: string; due: Date }[],
): DatedItem[] {
  const position = new Map(orderedKeys.map((k, i) => [k, i]));
  const inOrder = [...assigned].sort(
    (a, b) => (position.get(a.key) ?? Infinity) - (position.get(b.key) ?? Infinity),
  );
  const dates = assigned.map((a) => a.due).sort((a, b) => a.getTime() - b.getTime());
  return inOrder
    .map((a, i) => ({ id: a.id, due: dates[i] }))
    .filter((c, i) => c.due.getTime() !== inOrder[i].due.getTime());
}
