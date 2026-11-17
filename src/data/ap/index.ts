// AP course data and the misconception tag list, for the web app. The tag list itself lives in
// functions/src/misconceptions.ts so the Cloud Function grader can use it without this bundle.
import physics1 from "./physics1.json";

export {
  MISCONCEPTION_TAGS,
  MISCONCEPTION_IDS,
  misconceptionTag,
  type MisconceptionTag,
} from "../../../functions/src/misconceptions";

export interface ApTopic {
  id: string;
  title: string;
  summary: string;
}

export interface ApUnit {
  unit: number;
  title: string;
  summary: string;
  topics: ApTopic[];
}

export const AP_PHYSICS_1 = physics1 as {
  course: string;
  name: string;
  note: string;
  units: ApUnit[];
};
export const AP_UNITS: readonly ApUnit[] = AP_PHYSICS_1.units;

const TOPICS = new Map(
  AP_UNITS.flatMap((u) => u.topics.map((t) => [t.id, { ...t, unit: u.unit }])),
);

export const AP_TOPIC_ID = /^([1-8])\.(\d{1,2})$/;

export function apTopic(id: string): (ApTopic & { unit: number }) | undefined {
  return TOPICS.get(id);
}

export function apUnit(unit: number): ApUnit | undefined {
  return AP_UNITS.find((u) => u.unit === unit);
}

export function isApTopicId(id: unknown): id is string {
  return typeof id === "string" && TOPICS.has(id);
}

/** "Unit 4: Linear momentum" */
export function apUnitLabel(unit: number): string {
  const u = apUnit(unit);
  return u ? `Unit ${u.unit}: ${u.title}` : `Unit ${unit}`;
}

/** "4.2 Change in momentum and impulse" */
export function apTopicLabel(id: string): string {
  const t = apTopic(id);
  return t ? `${t.id} ${t.title}` : id;
}

export interface ApTags {
  apCourse: "physics-1" | null;
  apUnit: number | null;
  apTopics: string[];
}

/**
 * Server-side check of an assignment's AP tags. Unknown topics are dropped, topics from another
 * unit are dropped when a unit is set, and a unit is inferred from the topics when missing.
 */
export function normaliseApTags(input: {
  apCourse?: unknown;
  apUnit?: unknown;
  apTopics?: unknown;
}): ApTags {
  const topics = Array.isArray(input.apTopics)
    ? [...new Set(input.apTopics.filter(isApTopicId))]
    : [];
  let unit = typeof input.apUnit === "number" && apUnit(input.apUnit) ? input.apUnit : null;
  if (unit === null && topics.length) unit = apTopic(topics[0])!.unit;
  const apTopics = topics.filter((t) => apTopic(t)!.unit === unit).sort(compareTopicIds);
  if (unit === null) return { apCourse: null, apUnit: null, apTopics: [] };
  return { apCourse: "physics-1", apUnit: unit, apTopics };
}

export function compareTopicIds(a: string, b: string): number {
  const [ua, ta] = a.split(".").map(Number);
  const [ub, tb] = b.split(".").map(Number);
  return ua - ub || ta - tb;
}
