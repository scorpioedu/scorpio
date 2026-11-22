// What each course set contains, for the teacher unit pages: problem count, estimated minutes,
// difficulty mix and the misconceptions its wrong answers target. Generated from the reviewed drafts
// by tools/curriculum-profile.cjs (`--write` after changing a set). Kept apart from index.ts so the
// student pages do not bundle it.
//
// A set is a pool of 5 to 10 problems and a class gets its first n (5 unless the teacher chooses), so
// what a page shows is `shownProfile`: the default assignment for a set that is not assigned, the
// class copy's own size for one that is. The whole-pool figures are only the starting point.
import { DEFAULT_SET_SIZE } from "./index";
import apPhysics1 from "./profiles/ap-physics-1.json";
import apPhysics2 from "./profiles/ap-physics-2.json";
import apPhysicsCMech from "./profiles/ap-physics-c-mech.json";
import apPhysicsCEm from "./profiles/ap-physics-c-em.json";

/** One problem of a set, in question order. */
export interface ProblemProfile {
  /** Estimated minutes for this problem (may be a half). */
  minutes: number;
  difficulty: "easy" | "medium" | "hard";
  type: string;
  /** Misconception tags on its wrong answers. */
  tags: string[];
}

export interface SetProfile {
  problems: number;
  /** Estimated minutes for a student to finish the set. */
  minutes: number;
  difficulty: { easy: number; medium: number; hard: number };
  /** Problems per question type, e.g. { "multiple-choice": 2, numeric: 3 }. */
  types: Record<string, number>;
  /** Misconception tags on the set's wrong answers, most problems first. */
  misconceptions: { tag: string; problems: number }[];
  /** The problems one by one, in question order (what `prefixProfile` sums). */
  each: ProblemProfile[];
}

/** The profile of the set's first `n` problems (all of them when it has no more than `n`). */
export function prefixProfile(p: SetProfile, n: number): SetProfile {
  const each = p.each.slice(0, Math.max(0, n));
  if (each.length === p.each.length) return p;
  const difficulty = { easy: 0, medium: 0, hard: 0 };
  const types: Record<string, number> = {};
  const tags = new Map<string, number>();
  let minutes = 0;
  for (const problem of each) {
    difficulty[problem.difficulty] += 1;
    types[problem.type] = (types[problem.type] ?? 0) + 1;
    minutes += problem.minutes;
    for (const tag of problem.tags) tags.set(tag, (tags.get(tag) ?? 0) + 1);
  }
  return {
    problems: each.length,
    minutes: Math.ceil(minutes),
    difficulty,
    types: Object.fromEntries(Object.entries(types).sort(([a], [b]) => a.localeCompare(b))),
    misconceptions: [...tags.entries()]
      .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
      .map(([tag, problems]) => ({ tag, problems })),
    each,
  };
}

/** What a page says about a set: the problems a class gets (or has), not the whole pool. */
export interface ShownProfile extends SetProfile {
  /** Problems the set holds in all. */
  pool: number;
  /** "5 problems", or "5 of 10 problems" for a set not assigned yet that has more to choose from. */
  count: string;
}

/**
 * The profile to show for a set. `assigned` is the class copy's own number of questions; without it
 * the set is described as it is assigned by default (its first five problems).
 */
export function shownProfile(
  curriculumId: string,
  key: string,
  assigned?: number | null,
): ShownProfile | undefined {
  const whole = setProfile(curriculumId, key);
  if (!whole) return undefined;
  const pool = whole.each.length;
  const isAssigned = typeof assigned === "number" && assigned > 0;
  const profile = prefixProfile(whole, isAssigned ? assigned : DEFAULT_SET_SIZE);
  // A copy the teacher added questions to has more than the pool: the count is the copy's own.
  const problems = isAssigned ? assigned : profile.problems;
  const noun = problems === 1 ? "problem" : "problems";
  return {
    ...profile,
    problems,
    pool,
    count:
      !isAssigned && pool > problems ? `${problems} of ${pool} ${noun}` : `${problems} ${noun}`,
  };
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

/**
 * Sets of the course whose wrong answers target a misconception, most problems first. Only the
 * problems a class gets are counted: a set's first five, or the first `sizes[key]` for a set the
 * class already has at another size.
 */
export function setsTargeting(
  curriculumId: string,
  tag: string,
  sizes: Readonly<Record<string, number>> = {},
): { key: string; problems: number }[] {
  return Object.entries(curriculumProfile(curriculumId))
    .map(([key, p]) => ({
      key,
      problems:
        prefixProfile(p, sizes[key] || DEFAULT_SET_SIZE).misconceptions.find((m) => m.tag === tag)
          ?.problems ?? 0,
    }))
    .filter((s) => s.problems > 0)
    .sort((a, b) => b.problems - a.problems || a.key.localeCompare(b.key, "en", { numeric: true }));
}
