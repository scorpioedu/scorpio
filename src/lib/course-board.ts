// The Status board on /teacher/courses: every set of the class's course in exactly one column, by
// where it stands. Pure: the page passes the roadmap (curriculum-roadmap.ts) and the per-set progress
// from /api/teacher/courses/progress. Column rules are listed in docs/courses.md.
import type { Pacing } from "@/lib/course-pacing";
import type { SetProgress } from "@/lib/course-progress";
import { keyUnit, placeSet } from "@/lib/curriculum-plan";
import type { RoadmapSet, RoadmapUnit } from "@/lib/curriculum-roadmap";

export type BoardColumnId = "upNext" | "assigned" | "needsYou" | "done";

export interface BoardCard {
  key: string;
  unit: number;
  s: RoadmapSet;
  /** The class's numbers for the set; null until it is assigned (or while progress is loading). */
  progress: SetProgress | null;
}

/** Why a set sits dimmed at the bottom of Up next instead of in the queue. */
export type ParkedReason = "skipped" | "unpublished" | "planned";

export interface ParkedCard extends BoardCard {
  reason: ParkedReason;
}

export interface BoardColumns {
  /** Published, not assigned, not skipped: the queue, in the class's plan order. */
  upNext: BoardCard[];
  /** Skipped, or not published here yet. Shown under Up next; cannot be assigned or dragged. */
  parked: ParkedCard[];
  /** Out with students: not due yet, or due and some students have not handed it in. Soonest first. */
  assigned: BoardCard[];
  /** Assigned and waiting for the teacher: written answers to grade, or answers to check after a key change. */
  needsYou: BoardCard[];
  /** Assigned, nothing waiting, and nobody still owes it. Latest due date first. */
  done: BoardCard[];
}

/** Answers waiting for the teacher on one set. */
export function toCheck(p: SetProgress | null | undefined): number {
  return p ? p.pending + p.needsReview : 0;
}

/**
 * Sort every set into its column. The checks run in this order: Needs you, Done, Assigned.
 * - Needs you: something is waiting for review (`pending`) or flagged after a key change (`needsReview`).
 * - Done: everyone on the roster handed it in, or the due date has passed and nobody is missing.
 * - Assigned: everything else that is assigned (not due yet, no due date, or students still missing).
 * An assigned set stays on the board even when the plan skips it. An archived copy counts as not
 * assigned, so its set is back in Up next (assigning restores the copy).
 */
export function boardColumns(
  roadmap: RoadmapUnit[],
  progress: Record<string, SetProgress> | null | undefined,
  students: number,
  now: Date = new Date(),
): BoardColumns {
  const out: BoardColumns = { upNext: [], parked: [], assigned: [], needsYou: [], done: [] };
  for (const u of roadmap) {
    for (const s of u.sets) {
      const card: BoardCard = {
        key: s.set.key,
        unit: u.unit,
        s,
        progress: s.assigned ? (progress?.[s.set.key] ?? null) : null,
      };
      if (!s.assigned) {
        if (s.skipped) out.parked.push({ ...card, reason: "skipped" });
        else if (!s.published)
          out.parked.push({
            ...card,
            reason: s.availability === "planned" ? "planned" : "unpublished",
          });
        else out.upNext.push(card);
        continue;
      }
      const p = card.progress;
      if (toCheck(p) > 0) {
        out.needsYou.push(card);
        continue;
      }
      // Without progress (still loading, or the request failed) nothing is known to be finished.
      const everyoneIn = !!p && students > 0 && p.submitted >= students;
      const pastDue = !!s.dueDate && s.dueDate.getTime() < now.getTime();
      if (p && (everyoneIn || (pastDue && p.overdue === 0))) out.done.push(card);
      else out.assigned.push(card);
    }
  }
  const due = (c: BoardCard) => c.s.dueDate?.getTime();
  out.assigned.sort((a, b) => (due(a) ?? Infinity) - (due(b) ?? Infinity));
  out.done.sort((a, b) => (due(b) ?? -Infinity) - (due(a) ?? -Infinity));
  return out;
}

/** Keep only one unit's cards (null keeps everything). */
export function filterBoard(columns: BoardColumns, unit: number | null): BoardColumns {
  if (unit === null) return columns;
  const only = <T extends BoardCard>(cards: T[]) => cards.filter((c) => c.unit === unit);
  return {
    upNext: only(columns.upNext),
    parked: only(columns.parked),
    assigned: only(columns.assigned),
    needsYou: only(columns.needsYou),
    done: only(columns.done),
  };
}

export interface BoardStats {
  /** Sets the class has been assigned. */
  assigned: number;
  /** Sets the class will do: assigned ones plus those still to come (skipped sets left out). */
  total: number;
  /** Mean of the assigned sets' average scores, or null when nothing is graded. */
  average: number | null;
  /** Sets waiting for the teacher: the same number as the Needs you column's count. */
  needsYou: number;
  /** Answers waiting for the teacher across those sets. */
  toCheck: number;
  /** Hand-ins still missing after their due date, summed over sets. */
  overdue: number;
}

export function boardStats(columns: BoardColumns): BoardStats {
  const out = [...columns.assigned, ...columns.needsYou, ...columns.done];
  const averages = out
    .map((c) => c.progress?.averageScore)
    .filter((n): n is number => typeof n === "number");
  const sum = (n: (c: BoardCard) => number) => out.reduce((total, c) => total + n(c), 0);
  return {
    assigned: out.length,
    total:
      out.length +
      columns.upNext.length +
      columns.parked.filter((c) => c.reason !== "skipped").length,
    average: averages.length
      ? Math.round(averages.reduce((a, b) => a + b, 0) / averages.length)
      : null,
    needsYou: columns.needsYou.length,
    toCheck: sum((c) => toCheck(c.progress)),
    overdue: sum((c) => c.progress?.overdue ?? 0),
  };
}

/** Where each unassigned set would land at the current pace, by set key. */
export function plannedDates(pacing: Pacing): Map<string, Date> {
  return new Map(
    pacing.units.flatMap((u) =>
      u.sets.filter((s) => s.source === "projected").map((s) => [s.key, s.due] as const),
    ),
  );
}

/** The next free slot in the pacing guide: the due date a set gets when it is dropped on Assigned. */
export function nextAssignDate(pacing: Pacing): Date | null {
  let first: Date | null = null;
  for (const due of plannedDates(pacing).values()) if (!first || due < first) first = due;
  return first;
}

export type UpNextMove =
  | { ok: true; order: string[] }
  /** "unit": the two sets are in different units. "none": nothing would change. */
  | { ok: false; reason: "unit" | "none" };

/**
 * Drop one Up next card on another: the dragged set takes the other's place in the class's plan.
 * Sets stay inside their unit, so a drop across units is refused.
 */
export function dropInUpNext(order: readonly string[], key: string, overKey: string): UpNextMove {
  if (key === overKey || !order.includes(key) || !order.includes(overKey))
    return { ok: false, reason: "none" };
  const unit = keyUnit(key);
  if (keyUnit(overKey) !== unit) return { ok: false, reason: "unit" };
  const to = order.filter((k) => keyUnit(k) === unit).indexOf(overKey);
  return { ok: true, order: placeSet(order, key, to) };
}

/**
 * Move up / Move down from a card's menu: swap places with the nearest Up next card of the same unit
 * in that direction (sets in between that are assigned or skipped are jumped over).
 */
export function nudgeInUpNext(
  order: readonly string[],
  upNextKeys: readonly string[],
  key: string,
  dir: -1 | 1,
): UpNextMove {
  const unit = keyUnit(key);
  const queue = upNextKeys.filter((k) => keyUnit(k) === unit);
  const neighbour = queue[queue.indexOf(key) + dir];
  if (!queue.includes(key) || !neighbour) return { ok: false, reason: "none" };
  return dropInUpNext(order, key, neighbour);
}

/** Ids of the two places a dragged card can be dropped besides another Up next card. */
export const DROP_ASSIGNED = "drop:assigned";
export const DROP_UP_NEXT = "drop:upNext";

export type BoardDrop =
  /** An Up next card dropped on Assigned: assign it. */
  | { type: "assign" }
  /** An Assigned card dropped on Up next: archive its copy. */
  | { type: "archive" }
  /** An Up next card dropped on another: take its place in the plan. */
  | { type: "reorder"; overKey: string };

/**
 * What dropping a card means. `over` is the id under it: one of the two drop places (an id that
 * starts with DROP_ASSIGNED or DROP_UP_NEXT) or the key of an Up next card. Needs you and Done take
 * no drops, and only Up next and Assigned cards can be dragged; everything else is null (no change).
 */
export function boardDrop(
  from: BoardColumnId,
  key: string,
  over: string | null,
  upNextKeys: readonly string[],
): BoardDrop | null {
  if (over === null) return null;
  const onAssigned = over.startsWith(DROP_ASSIGNED);
  const onUpNext = over.startsWith(DROP_UP_NEXT) || upNextKeys.includes(over);
  if (from === "upNext") {
    if (onAssigned) return { type: "assign" };
    return upNextKeys.includes(over) && over !== key ? { type: "reorder", overKey: over } : null;
  }
  if (from === "assigned") return onUpNext ? { type: "archive" } : null;
  return null;
}
