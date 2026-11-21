// AP course data and the misconception tag list, for the web app. The tag list itself lives in
// functions/src/misconceptions.ts so the Cloud Function grader can use it without this bundle.
import physics1 from "./physics1.json";
import physics2 from "./physics2.json";
import physicsCMech from "./physicsc-mech.json";
import physicsCEm from "./physicsc-em.json";

export {
  MISCONCEPTION_TAGS,
  MISCONCEPTION_IDS,
  misconceptionTag,
  misconceptionUnits,
  misconceptionsForCourse,
  misconceptionsForUnit,
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

interface ApCourseData {
  course: string;
  name: string;
  note: string;
  units: ApUnit[];
}

export const AP_PHYSICS_1 = physics1 as ApCourseData;
/** AP Physics 1 units. Other courses: `apUnits(course)`. */
export const AP_UNITS: readonly ApUnit[] = AP_PHYSICS_1.units;

/**
 * The AP courses Scorpio knows. Unit numbers and topic ids repeat between courses (Physics 1 and
 * Physics C: Mechanics both have a topic "1.1"), so a unit or topic only means something together
 * with its course. Every helper below takes the course last and defaults to AP Physics 1, which is
 * what assignments saved before there were other courses belong to.
 */
export const AP_COURSES = {
  "physics-1": AP_PHYSICS_1,
  "physics-2": physics2 as ApCourseData,
  "physics-c-mech": physicsCMech as ApCourseData,
  "physics-c-em": physicsCEm as ApCourseData,
} as const;
export type ApCourseId = keyof typeof AP_COURSES;
export const AP_COURSE_IDS = Object.keys(AP_COURSES) as ApCourseId[];
export const DEFAULT_AP_COURSE: ApCourseId = "physics-1";

export function isApCourseId(value: unknown): value is ApCourseId {
  return typeof value === "string" && Object.hasOwn(AP_COURSES, value);
}

/** "AP Physics 2" */
export function apCourseName(course: ApCourseId = DEFAULT_AP_COURSE): string {
  return AP_COURSES[course].name;
}

export function apUnits(course: ApCourseId = DEFAULT_AP_COURSE): readonly ApUnit[] {
  return AP_COURSES[course].units;
}

const TOPICS = new Map(
  AP_COURSE_IDS.map((course) => [
    course,
    new Map(apUnits(course).flatMap((u) => u.topics.map((t) => [t.id, { ...t, unit: u.unit }]))),
  ]),
);

/** The shape of a topic id ("4.2", "12.3"); whether it exists depends on the course. */
export const AP_TOPIC_ID = /^(\d{1,2})\.(\d{1,2})$/;

export function apTopic(
  id: string,
  course: ApCourseId = DEFAULT_AP_COURSE,
): (ApTopic & { unit: number }) | undefined {
  return TOPICS.get(course)?.get(id);
}

export function apUnit(unit: number, course: ApCourseId = DEFAULT_AP_COURSE): ApUnit | undefined {
  return apUnits(course).find((u) => u.unit === unit);
}

export function isApTopicId(id: unknown, course: ApCourseId = DEFAULT_AP_COURSE): id is string {
  return typeof id === "string" && !!TOPICS.get(course)?.has(id);
}

/** "Unit 4: Linear momentum" */
export function apUnitLabel(unit: number, course: ApCourseId = DEFAULT_AP_COURSE): string {
  const u = apUnit(unit, course);
  return u ? `Unit ${u.unit}: ${u.title}` : `Unit ${unit}`;
}

/** "4.2 Change in momentum and impulse" */
export function apTopicLabel(id: string, course: ApCourseId = DEFAULT_AP_COURSE): string {
  const t = apTopic(id, course);
  return t ? `${t.id} ${t.title}` : id;
}

/**
 * One value for "a unit of a course", for pickers and filters that list every course's units.
 * AP Physics 1 keeps the bare number ("4"), so values saved before there were other courses still
 * work; the others are prefixed ("physics-2:9").
 */
export function apUnitKey(course: ApCourseId, unit: number): string {
  return course === DEFAULT_AP_COURSE ? String(unit) : `${course}:${unit}`;
}

export function parseApUnitKey(key: string): { course: ApCourseId; unit: number } | null {
  const at = key.indexOf(":");
  const course = at < 0 ? DEFAULT_AP_COURSE : key.slice(0, at);
  const unit = Number(at < 0 ? key : key.slice(at + 1));
  return isApCourseId(course) && apUnit(unit, course) ? { course, unit } : null;
}

/** What a stored assignment's `apCourse` means: anything unknown or missing is AP Physics 1. */
export function apCourseOf(value: unknown): ApCourseId {
  return isApCourseId(value) ? value : DEFAULT_AP_COURSE;
}

export interface ApTags {
  apCourse: ApCourseId | null;
  apUnit: number | null;
  apTopics: string[];
}

/**
 * Server-side check of an assignment's AP tags. An unknown or missing course means AP Physics 1.
 * Unknown topics are dropped, topics from another unit are dropped when a unit is set, and a unit is
 * inferred from the topics when missing.
 */
export function normaliseApTags(input: {
  apCourse?: unknown;
  apUnit?: unknown;
  apTopics?: unknown;
}): ApTags {
  const course = isApCourseId(input.apCourse) ? input.apCourse : DEFAULT_AP_COURSE;
  const topics = Array.isArray(input.apTopics)
    ? [...new Set(input.apTopics.filter((t): t is string => isApTopicId(t, course)))]
    : [];
  let unit = typeof input.apUnit === "number" && apUnit(input.apUnit, course) ? input.apUnit : null;
  if (unit === null && topics.length) unit = apTopic(topics[0], course)!.unit;
  const apTopics = topics.filter((t) => apTopic(t, course)!.unit === unit).sort(compareTopicIds);
  if (unit === null) return { apCourse: null, apUnit: null, apTopics: [] };
  return { apCourse: course, apUnit: unit, apTopics };
}

export function compareTopicIds(a: string, b: string): number {
  const [ua, ta] = a.split(".").map(Number);
  const [ub, tb] = b.split(".").map(Number);
  return ua - ub || ta - tb;
}
