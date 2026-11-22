// Pure helpers for the course roadmap screens (teacher /teacher/courses, admin /admin/content "Sets").
import {
  curriculumUnits,
  getCurriculum,
  type CurriculumSet,
  type CurriculumUnit,
} from "@/data/curricula";
import { keyUnit, normalisePlan, type CurriculumPlan } from "@/lib/curriculum-plan";

/**
 * What an admin sees for one draft of a set. An approved draft is named by who stands behind it:
 * a person ("human-approved"), the owner accepting the AI review as it is ("owner-accepted"), the
 * answer-key verifier ("verified": recomputed and solved blind, no person), or only an AI
 * ("ai-reviewed", which cannot go live).
 */
export type DraftState =
  | "draft"
  | "ai-reviewed"
  | "verified"
  | "owner-accepted"
  | "human-approved"
  | "published"
  | "rejected"
  | "missing";

/** Approved in any way: the states a set's drafts must all be in before Publish is offered. */
const APPROVED: readonly DraftState[] = [
  "human-approved",
  "owner-accepted",
  "verified",
  "ai-reviewed",
];

export function draftState(
  d: { status?: unknown; reviewKind?: unknown } | undefined | null,
): DraftState {
  if (!d) return "missing";
  if (d.status === "published") return "published";
  if (d.status === "approved") {
    if (d.reviewKind === "ai") return "ai-reviewed";
    // The verifier's mark says a machine checked it, not a person. Publish still refuses it if the
    // problem was edited since (the stored hash), which this label cannot show.
    if (d.reviewKind === "verified") return "verified";
    if (d.reviewKind === "owner-accepted") return "owner-accepted";
    return "human-approved";
  }
  if (d.status === "rejected") return "rejected";
  return "draft";
}

/**
 * Every draft is approved. AI-reviewed ones count: the server still refuses them outside the local
 * emulator and says why, which the Sets tab shows. The same goes for a verified draft edited since.
 */
export function setReadyToPublish(states: DraftState[]): boolean {
  return states.length > 0 && states.every((s) => APPROVED.includes(s));
}

/**
 * A published set whose definition now lists more problems: the drafts after the published ones are
 * all approved, so they can be added to it. `states` are the set's drafts in definition order.
 */
export function setReadyToAppend(states: DraftState[]): boolean {
  const added = states.filter((s) => s !== "published");
  const firstNew = states.findIndex((s) => s !== "published");
  return (
    added.length > 0 && firstNew > 0 && states.slice(firstNew).every((s) => APPROVED.includes(s))
  );
}

/** A published global waypoint that belongs to a set. */
export interface PublishedSet {
  id: string;
  curriculumSetKey: string;
  questionCount: number;
}

/** A class's own assignment that came from a set. */
export interface ClassAssignment {
  id?: string;
  title?: string;
  /** The course the set came from; assignments from another course are ignored. */
  curriculumId?: unknown;
  curriculumSetKey?: unknown;
  dueDate?: Date | null;
  /** Archived copies are hidden from students and count as not assigned; assigning restores them. */
  archived?: boolean;
  /** Questions in this copy (a set can be assigned with 3 to 10 of its problems). */
  questionCount?: number;
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
  /** The class's own copy, when assigned. */
  assignmentId: string | null;
  dueDate: Date | null;
  /** The class leaves this set out (its plan); it is never offered for assigning. */
  skipped: boolean;
  /** The class copy's own title when assigned (the teacher may have renamed it). */
  copyTitle?: string | null;
  /** An archived copy of this set in the class: assigning restores it instead of copying again. */
  archivedId?: string | null;
  /** Questions in the class's own copy, when assigned and known. */
  questionCount?: number | null;
}
export interface RoadmapUnit {
  unit: number;
  info: CurriculumUnit["info"];
  sets: RoadmapSet[];
  /** Published sets not yet assigned to the class. */
  assignable: RoadmapSet[];
  allAssigned: boolean;
}

/**
 * The roadmap for one class. With a `plan` (the class's own order and skipped sets) units and sets
 * come in that order and skipped sets are not assignable; without one it is the course as written.
 */
export function deriveRoadmap(
  curriculumId: string,
  published: PublishedSet[],
  classAssignments: ClassAssignment[],
  plan?: CurriculumPlan | null,
): RoadmapUnit[] {
  const byKey = new Map(published.map((p) => [p.curriculumSetKey, p]));
  const assignedByKey = new Map<string, ClassAssignment>();
  const archivedByKey = new Map<string, ClassAssignment>();
  for (const a of classAssignments)
    if (
      (a.curriculumId === undefined || a.curriculumId === curriculumId) &&
      typeof a.curriculumSetKey === "string"
    ) {
      const into = a.archived ? archivedByKey : assignedByKey;
      if (!into.has(a.curriculumSetKey)) into.set(a.curriculumSetKey, a);
    }
  const { order, skipped } = normalisePlan(curriculumId, plan);
  const position = new Map(order.map((key, i) => [key, i]));
  const at = (key: string) => position.get(key) ?? Number.MAX_SAFE_INTEGER;
  const firstOfUnit = new Map<number, number>();
  order.forEach((key, i) => {
    if (!firstOfUnit.has(keyUnit(key))) firstOfUnit.set(keyUnit(key), i);
  });
  const unitAt = (unit: number) => firstOfUnit.get(unit) ?? Number.MAX_SAFE_INTEGER;
  return curriculumUnits(curriculumId)
    .sort((a, b) => unitAt(a.unit) - unitAt(b.unit) || a.unit - b.unit)
    .map((u) => {
      const sets = [...u.sets]
        .sort((a, b) => at(a.key) - at(b.key))
        .map((set) => ({
          set,
          published: byKey.get(set.key) ?? null,
          availability: setAvailability(set, byKey.get(set.key)),
          assigned: assignedByKey.has(set.key),
          assignmentId: assignedByKey.get(set.key)?.id ?? null,
          dueDate: assignedByKey.get(set.key)?.dueDate ?? null,
          skipped: skipped.includes(set.key),
          ...(assignedByKey.get(set.key)?.title
            ? { copyTitle: assignedByKey.get(set.key)!.title }
            : {}),
          ...(typeof assignedByKey.get(set.key)?.questionCount === "number"
            ? { questionCount: assignedByKey.get(set.key)!.questionCount }
            : {}),
          ...(!assignedByKey.has(set.key) && archivedByKey.get(set.key)?.id
            ? { archivedId: archivedByKey.get(set.key)!.id }
            : {}),
        }));
      const wanted = sets.filter((s) => s.published && !s.skipped);
      const assignable = wanted.filter((s) => !s.assigned);
      return {
        unit: u.unit,
        info: u.info,
        sets,
        assignable,
        allAssigned: wanted.length > 0 && assignable.length === 0,
      };
    });
}

/** The first unit that still has published, unassigned sets. */
export function nextUnit(roadmap: RoadmapUnit[]): RoadmapUnit | undefined {
  return roadmap.find((u) => u.assignable.length > 0);
}

export { getCurriculum };
