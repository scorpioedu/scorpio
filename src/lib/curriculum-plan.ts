// A class's own version of a course roadmap: the order of units, the order of sets inside a unit, and
// the sets it skips. Stored as `curriculumPlan` on the class doc by PATCH /api/courses/{id}/plan;
// absent means "the course as written". Units stay whole (a set never leaves its unit), so unit
// headings for students and unit insights keep meaning the same thing.
import { compareSetKeys, getCurriculum } from "@/data/curricula";

export interface CurriculumPlan {
  /** Every set key of the course, grouped by unit. */
  order: string[];
  /** Keys the class leaves out. */
  skipped: string[];
}

/** "4A" -> 4. */
export function keyUnit(key: string): number {
  return parseInt(key, 10);
}

export function defaultOrder(curriculumId: string): string[] {
  const c = getCurriculum(curriculumId);
  return c ? [...c.sets].sort(compareSetKeys).map((s) => s.key) : [];
}

/** Units in the order they first appear. */
export function unitOrder(order: readonly string[]): number[] {
  return [...new Set(order.map(keyUnit))];
}

function grouped(order: readonly string[]): Map<number, string[]> {
  const units = new Map<number, string[]>();
  for (const key of order) units.set(keyUnit(key), [...(units.get(keyUnit(key)) ?? []), key]);
  return units;
}

/**
 * Reads a stored plan leniently, so a plan saved before the course gained (or lost) sets still works:
 * unknown keys are dropped, a unit's sets are pulled together where the unit first appears, and keys
 * the plan does not mention are added in their usual place.
 */
export function normalisePlan(curriculumId: string, raw: unknown): CurriculumPlan {
  const all = defaultOrder(curriculumId);
  const known = new Set(all);
  const r = (raw ?? {}) as { order?: unknown; skipped?: unknown };
  const stored = Array.isArray(r.order)
    ? [...new Set(r.order.filter((k): k is string => typeof k === "string" && known.has(k)))]
    : [];
  const units = grouped(stored);
  for (const key of all) {
    const list = units.get(keyUnit(key)) ?? [];
    if (!list.includes(key)) units.set(keyUnit(key), [...list, key]);
  }
  const skipped = Array.isArray(r.skipped)
    ? all.filter((k) => (r.skipped as unknown[]).includes(k))
    : [];
  return { order: [...units.values()].flat(), skipped };
}

/** Strict check for the route: the order must list every set once, with each unit's sets together. */
export function parsePlan(
  curriculumId: string,
  raw: unknown,
): { ok: true; plan: CurriculumPlan } | { ok: false; error: string } {
  const all = defaultOrder(curriculumId);
  if (!all.length) return { ok: false, error: "Unknown course" };
  const r = (raw ?? {}) as { order?: unknown; skipped?: unknown };
  if (!Array.isArray(r.order) || !Array.isArray(r.skipped))
    return { ok: false, error: "A plan needs an order and a list of skipped sets" };
  const known = new Set(all);
  if (
    r.order.length !== all.length ||
    new Set(r.order).size !== all.length ||
    !r.order.every((k) => typeof k === "string" && known.has(k))
  )
    return { ok: false, error: "The order must list every set of the course exactly once" };
  const order = r.order as string[];
  const seen = new Set<number>();
  let last = NaN;
  for (const key of order) {
    const unit = keyUnit(key);
    if (unit !== last && seen.has(unit))
      return { ok: false, error: "Sets must stay together with their unit" };
    seen.add(unit);
    last = unit;
  }
  if (!r.skipped.every((k) => typeof k === "string" && known.has(k)))
    return { ok: false, error: "Unknown set in the skipped list" };
  return {
    ok: true,
    plan: { order, skipped: all.filter((k) => (r.skipped as string[]).includes(k)) },
  };
}

/** True when the plan changes nothing, so the class doc does not need one. */
export function isDefaultPlan(curriculumId: string, plan: CurriculumPlan): boolean {
  const all = defaultOrder(curriculumId);
  return plan.skipped.length === 0 && plan.order.join() === all.join();
}

/** Move a whole unit one place earlier (-1) or later (1). Out of range leaves the order alone. */
export function moveUnit(order: readonly string[], unit: number, dir: -1 | 1): string[] {
  const units = unitOrder(order);
  const at = units.indexOf(unit);
  const to = at + dir;
  if (at < 0 || to < 0 || to >= units.length) return [...order];
  [units[at], units[to]] = [units[to], units[at]];
  const byUnit = grouped(order);
  return units.flatMap((u) => byUnit.get(u) ?? []);
}

/** Move a set one place earlier or later inside its own unit. */
export function moveSet(order: readonly string[], key: string, dir: -1 | 1): string[] {
  const at = order.indexOf(key);
  const to = at + dir;
  if (at < 0 || to < 0 || to >= order.length || keyUnit(order[to]) !== keyUnit(key))
    return [...order];
  const next = [...order];
  [next[at], next[to]] = [next[to], next[at]];
  return next;
}

export function toggleSkipped(plan: CurriculumPlan, key: string): CurriculumPlan {
  const skipped = plan.skipped.includes(key)
    ? plan.skipped.filter((k) => k !== key)
    : [...plan.skipped, key];
  return { order: plan.order, skipped: plan.order.filter((k) => skipped.includes(k)) };
}

/** Put a whole unit at position `to` among the units (drag and drop). Out of range is clamped. */
export function placeUnit(order: readonly string[], unit: number, to: number): string[] {
  const units = unitOrder(order);
  const at = units.indexOf(unit);
  if (at < 0) return [...order];
  units.splice(at, 1);
  units.splice(Math.max(0, Math.min(units.length, to)), 0, unit);
  const byUnit = grouped(order);
  return units.flatMap((u) => byUnit.get(u) ?? []);
}

/** Put a set at position `to` inside its own unit (drag and drop). Out of range is clamped. */
export function placeSet(order: readonly string[], key: string, to: number): string[] {
  const unit = keyUnit(key);
  const inUnit = order.filter((k) => keyUnit(k) === unit);
  const at = inUnit.indexOf(key);
  if (at < 0) return [...order];
  inUnit.splice(at, 1);
  inUnit.splice(Math.max(0, Math.min(inUnit.length, to)), 0, key);
  let i = 0;
  return order.map((k) => (keyUnit(k) === unit ? inUnit[i++] : k));
}
