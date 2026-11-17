// Groups a student's assignments under unit headings when their class follows a course roadmap.
import { apUnitLabel } from "@/data/ap";

export interface GroupableAssignment {
  id: string;
  title: string;
  dueDate: Date;
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

const time = (d: Date) => {
  const t = new Date(d).getTime();
  return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
};

/**
 * Roadmap order: units ascending, each unit's sets by `curriculumSequence` then due date; everything
 * without a course set key goes last under "Other assignments". Empty groups are left out.
 */
export function groupByUnit<T extends GroupableAssignment>(items: T[]): AssignmentGroup<T>[] {
  const units = new Map<number, T[]>();
  const other: T[] = [];
  for (const a of items) {
    const unit = keyUnit(a.curriculumSetKey);
    if (unit === null) other.push(a);
    else units.set(unit, [...(units.get(unit) ?? []), a]);
  }
  const seq = (a: T) =>
    typeof a.curriculumSequence === "number" ? a.curriculumSequence : Number.MAX_SAFE_INTEGER;
  const bySequence = (a: T, b: T) =>
    seq(a) - seq(b) || time(a.dueDate) - time(b.dueDate) || a.title.localeCompare(b.title);
  const groups: AssignmentGroup<T>[] = [...units.entries()]
    .sort(([a], [b]) => a - b)
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
