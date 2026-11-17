// Pure helpers for the course roadmap screens (teacher /teacher/courses, admin /admin/content "Sets").
import {
  curriculumUnits,
  getCurriculum,
  type CurriculumSet,
  type CurriculumUnit,
} from "@/data/curricula";

/** What an admin sees for one draft of a set. */
export type DraftState =
  "draft" | "ai-reviewed" | "human-approved" | "published" | "rejected" | "missing";

export function draftState(
  d: { status?: unknown; reviewKind?: unknown } | undefined | null,
): DraftState {
  if (!d) return "missing";
  if (d.status === "published") return "published";
  if (d.status === "approved") return d.reviewKind === "ai" ? "ai-reviewed" : "human-approved";
  if (d.status === "rejected") return "rejected";
  return "draft";
}

/**
 * Every draft is approved. AI-reviewed ones count: the server still refuses them outside the local
 * emulator and says why, which the Sets tab shows.
 */
export function setReadyToPublish(states: DraftState[]): boolean {
  return states.length > 0 && states.every((s) => s === "human-approved" || s === "ai-reviewed");
}

/** A published global waypoint that belongs to a set. */
export interface PublishedSet {
  id: string;
  curriculumSetKey: string;
  questionCount: number;
}

/** A class's own assignment that came from a set. */
export interface ClassAssignment {
  curriculumSetKey?: unknown;
  dueDate?: Date | null;
}

/**
 * Whether a teacher can assign a set here. "awaiting": the problems are written (the definition lists
 * them) but the set is not published in this Firebase project. "planned": nothing is written yet.
 */
export type SetAvailability = "ready" | "awaiting" | "planned";

export function setAvailability(set: CurriculumSet, published: unknown): SetAvailability {
  if (published) return "ready";
  return set.draftIds.length > 0 ? "awaiting" : "planned";
}

export const AVAILABILITY_LABEL: Record<SetAvailability, string> = {
  ready: "Ready",
  awaiting: "Not published yet",
  planned: "Planned",
};

export interface RoadmapSet {
  set: CurriculumSet;
  published: PublishedSet | null;
  availability: SetAvailability;
  assigned: boolean;
  dueDate: Date | null;
}
export interface RoadmapUnit {
  unit: number;
  info: CurriculumUnit["info"];
  sets: RoadmapSet[];
  /** Published sets not yet assigned to the class. */
  assignable: RoadmapSet[];
  allAssigned: boolean;
}

export function deriveRoadmap(
  curriculumId: string,
  published: PublishedSet[],
  classAssignments: ClassAssignment[],
): RoadmapUnit[] {
  const byKey = new Map(published.map((p) => [p.curriculumSetKey, p]));
  const assignedByKey = new Map<string, ClassAssignment>();
  for (const a of classAssignments)
    if (typeof a.curriculumSetKey === "string" && !assignedByKey.has(a.curriculumSetKey))
      assignedByKey.set(a.curriculumSetKey, a);
  return curriculumUnits(curriculumId).map((u) => {
    const sets = u.sets.map((set) => ({
      set,
      published: byKey.get(set.key) ?? null,
      availability: setAvailability(set, byKey.get(set.key)),
      assigned: assignedByKey.has(set.key),
      dueDate: assignedByKey.get(set.key)?.dueDate ?? null,
    }));
    const assignable = sets.filter((s) => s.published && !s.assigned);
    return {
      unit: u.unit,
      info: u.info,
      sets,
      assignable,
      allAssigned: sets.some((s) => s.published) && assignable.length === 0,
    };
  });
}

/** The first unit that still has published, unassigned sets. */
export function nextUnit(roadmap: RoadmapUnit[]): RoadmapUnit | undefined {
  return roadmap.find((u) => u.assignable.length > 0);
}

export { getCurriculum };
