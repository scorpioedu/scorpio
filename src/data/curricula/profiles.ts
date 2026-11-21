// What each course set contains, for the teacher unit pages: problem count, estimated minutes,
// difficulty mix and the misconceptions its wrong answers target. Generated from the reviewed drafts
// by tools/curriculum-profile.cjs (`--write` after changing a set). Kept apart from index.ts so the
// student pages do not bundle it.
import apPhysics1 from "./profiles/ap-physics-1.json";
import apPhysics2 from "./profiles/ap-physics-2.json";
import apPhysicsCMech from "./profiles/ap-physics-c-mech.json";
import apPhysicsCEm from "./profiles/ap-physics-c-em.json";

export interface SetProfile {
  problems: number;
  /** Estimated minutes for a student to finish the set. */
  minutes: number;
  difficulty: { easy: number; medium: number; hard: number };
  /** Problems per question type, e.g. { "multiple-choice": 2, numeric: 3 }. */
  types: Record<string, number>;
  /** Misconception tags on the set's wrong answers, most problems first. */
  misconceptions: { tag: string; problems: number }[];
}

export type CurriculumProfile = Record<string, SetProfile>;

const PROFILES: Record<string, CurriculumProfile> = {
  "ap-physics-1": apPhysics1 as CurriculumProfile,
  "ap-physics-2": apPhysics2 as CurriculumProfile,
  "ap-physics-c-mech": apPhysicsCMech as CurriculumProfile,
  // Empty while the course is only planned: a set has a profile once its problems are written.
  "ap-physics-c-em": apPhysicsCEm as CurriculumProfile,
};

export function curriculumProfile(curriculumId: string): CurriculumProfile {
  return PROFILES[curriculumId] ?? {};
}

export function setProfile(curriculumId: string, key: string): SetProfile | undefined {
  return curriculumProfile(curriculumId)[key];
}

const TYPE_LABEL: Record<string, string> = {
  "multiple-choice": "multiple choice",
  numeric: "numeric",
};

/** "2 multiple choice, 3 numeric" */
export function typeSummary(p: SetProfile): string {
  return Object.entries(p.types)
    .map(([type, n]) => `${n} ${TYPE_LABEL[type] ?? type}`)
    .join(", ");
}

/** Sets of the course whose wrong answers target a misconception, most problems first. */
export function setsTargeting(
  curriculumId: string,
  tag: string,
): { key: string; problems: number }[] {
  return Object.entries(curriculumProfile(curriculumId))
    .map(([key, p]) => ({
      key,
      problems: p.misconceptions.find((m) => m.tag === tag)?.problems ?? 0,
    }))
    .filter((s) => s.problems > 0)
    .sort((a, b) => b.problems - a.problems || a.key.localeCompare(b.key, "en", { numeric: true }));
}
