// Groups a student's assignments under unit headings when their class follows a course roadmap.
import { apUnitLabel } from "@/data/ap";

export interface GroupableAssignment {
  id: string;
  title: string;
  dueDate: Date | null;
  curriculumSetKey?: unknown;
  curriculumSequence?: unknown;
}

export interface AssignmentGroup<T> {
  id: string;
  label: string;
  items: T[];
}

export const OTHER_GROUP_LABEL = "Other assignments";

/** The unit number of a curriculum set key ("4A" -> 4), or null. */
function keyUnit(key: unknown): number | null {
  if (typeof key !== "string") return null;
  const n = /^(\d+)[A-Z]$/.exec(key);
  return n ? Number(n[1]) : null;
}

const time = (d: Date | null) => {
  if (!d) return Number.MAX_SAFE_INTEGER; // no due date: after everything dated
  const t = new Date(d).getTime();
  return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
};

/**
 * Roadmap order: units ascending (or in the class's own `order`), each unit's sets by their place in
 * `order`, else `curriculumSequence`, then due date; everything
 * without a course set key goes last under "Other assignments". Empty groups are left out.
 */
export function groupByUnit<T extends GroupableAssignment>(
  items: T[],
  /** The class's own order of set keys (its plan), when it has one. */
  order?: readonly string[],
): AssignmentGroup<T>[] {
  const position = new Map((order ?? []).map((key, i) => [key, i]));
  const firstOfUnit = new Map<number, number>();
  (order ?? []).forEach((key, i) => {
    const unit = keyUnit(key);
    if (unit !== null && !firstOfUnit.has(unit)) firstOfUnit.set(unit, i);
  });
  const unitAt = (unit: number) => firstOfUnit.get(unit) ?? Number.MAX_SAFE_INTEGER;
  const units = new Map<number, T[]>();
  const other: T[] = [];
  for (const a of items) {
    const unit = keyUnit(a.curriculumSetKey);
    if (unit === null) other.push(a);
    else units.set(unit, [...(units.get(unit) ?? []), a]);
  }
  const seq = (a: T) =>
    position.get(a.curriculumSetKey as string) ??
    (typeof a.curriculumSequence === "number" ? a.curriculumSequence : Number.MAX_SAFE_INTEGER);
  const bySequence = (a: T, b: T) =>
    seq(a) - seq(b) || time(a.dueDate) - time(b.dueDate) || a.title.localeCompare(b.title);
  const groups: AssignmentGroup<T>[] = [...units.entries()]
    .sort(([a], [b]) => unitAt(a) - unitAt(b) || a - b)
    .map(([unit, list]) => ({
      id: `unit-${unit}`,
      label: apUnitLabel(unit),
      items: [...list].sort(bySequence),
    }));
  if (other.length)
    groups.push({
      id: "other",
      label: OTHER_GROUP_LABEL,
      items: [...other].sort(
        (a, b) => time(a.dueDate) - time(b.dueDate) || a.title.localeCompare(b.title),
      ),
    });
  return groups;
}
