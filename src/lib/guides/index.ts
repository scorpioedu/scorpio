// Which units have a guide, and how to load one. Each unit's guide is its own file
// (src/data/guides/<curriculumId>/unit-<n>.json) behind a dynamic import, so a page downloads only
// the unit it shows. Adding a unit: write the file, add its line here, run the verifier
// (docs/courses.md, "Guides"). A test keeps this list and the files on disk in step.
import type { ApCourseId } from "@/data/ap";
import type { TopicGuide, UnitGuide } from "./schema";

export type { TopicGuide, UnitGuide, WorkedExample, GuideEquation } from "./schema";

const LOADERS: Record<string, Record<number, () => Promise<{ default: unknown }>>> = {
  "ap-physics-1": {
    1: () => import("@/data/guides/ap-physics-1/unit-1.json"),
    2: () => import("@/data/guides/ap-physics-1/unit-2.json"),
    3: () => import("@/data/guides/ap-physics-1/unit-3.json"),
    4: () => import("@/data/guides/ap-physics-1/unit-4.json"),
    5: () => import("@/data/guides/ap-physics-1/unit-5.json"),
    6: () => import("@/data/guides/ap-physics-1/unit-6.json"),
    7: () => import("@/data/guides/ap-physics-1/unit-7.json"),
    8: () => import("@/data/guides/ap-physics-1/unit-8.json"),
  },
  "ap-physics-c-mech": {
    1: () => import("@/data/guides/ap-physics-c-mech/unit-1.json"),
    3: () => import("@/data/guides/ap-physics-c-mech/unit-3.json"),
    4: () => import("@/data/guides/ap-physics-c-mech/unit-4.json"),
    7: () => import("@/data/guides/ap-physics-c-mech/unit-7.json"),
  },
};

/** True when the unit has a guide file. Synchronous, so a link can be shown without loading it. */
export function hasUnitGuide(curriculumId: unknown, unit: number): boolean {
  return typeof curriculumId === "string" && !!LOADERS[curriculumId]?.[unit];
}

/** The units of a course that have a guide file, in order. */
export function guideUnits(curriculumId: string): number[] {
  return Object.keys(LOADERS[curriculumId] ?? {})
    .map(Number)
    .sort((a, b) => a - b);
}

/** Every registered guide file, as [curriculumId, unit]. */
export function guideFiles(): [string, number][] {
  return Object.keys(LOADERS).flatMap((id) =>
    guideUnits(id).map((unit): [string, number] => [id, unit]),
  );
}

/**
 * A unit's guide, or null when the unit has none. The files are checked by the verifier
 * (`node tools/verify-guides.cjs --all`, and in the test run), not again here.
 */
export async function loadUnitGuide(curriculumId: string, unit: number): Promise<UnitGuide | null> {
  const load = LOADERS[curriculumId]?.[unit];
  if (!load) return null;
  return (await load()).default as UnitGuide;
}

export function topicGuide(guide: UnitGuide | null, topicId: string): TopicGuide | undefined {
  return guide?.guides.find((g) => g.topic === topicId);
}

/** "topic-4-1": the anchor of a topic on a guide page. */
export function topicAnchor(topicId: string): string {
  return `topic-${topicId.replace(".", "-")}`;
}

/** "topic-4-2-mistake-impulse-force-confusion": a tagged "Common mistakes" entry of a topic's guide. */
export function misconceptionAnchor(topicId: string, tag: string): string {
  return `${topicAnchor(topicId)}-mistake-${tag}`;
}

/** "4.1" from "#topic-4-1", "topic-4-1" or a mistake anchor inside that topic; null for anything else. */
export function topicFromAnchor(hash: string): string | null {
  const m = hash.replace(/^#/, "").match(/^topic-(\d{1,2})-(\d{1,2})(?:-mistake-[a-z0-9-]+)?$/);
  return m ? `${m[1]}.${m[2]}` : null;
}

/** Where students read a unit's guide (and one topic of it). */
export function studentGuideHref(curriculumId: string, unit: number, topicId?: string): string {
  const page = `/student/courses/${encodeURIComponent(curriculumId)}/${unit}`;
  return topicId ? `${page}#${topicAnchor(topicId)}` : page;
}

/**
 * The calculus-based courses (AP Physics C) must derive their results; the algebra-based courses
 * may. Decided by the AP course, so a new C course is covered without a change here.
 */
export function requiresDerivation(apCourse: ApCourseId | string): boolean {
  return apCourse.startsWith("physics-c");
}
