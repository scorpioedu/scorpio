// The public lessons at /lessons: every course guide, readable without an account. Server only: the
// pages are built ahead of time from src/data/guides, and teacher notes are removed here so they never
// reach the browser. Import it only from server components.
import { apUnit, apUnits, type ApCourseId } from "@/data/ap";
import { CURRICULA } from "@/data/curricula";
import { guideUnits, loadUnitGuide, topicGuide } from "./index";
import type { TopicGuide } from "./schema";

export interface PublicTopic {
  id: string;
  title: string;
  summary: string;
  slug: string;
  href: string;
}

export interface PublicUnit {
  unit: number;
  title: string;
  summary: string;
  /** The unit's review page: its topics and key equations. */
  href: string;
  slug: string;
  topics: PublicTopic[];
}

export interface PublicCourse {
  id: string;
  apCourse: ApCourseId;
  name: string;
  /** One line for readers of the lessons (the curriculum's own description is written for teachers). */
  description: string;
  href: string;
  units: PublicUnit[];
  topicCount: number;
}

const slugWords = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60)
    .replace(/-$/, "");

/** "3-4-conservation-of-energy": the topic's number first, so the slug still says which topic it is. */
export function topicSlug(topicId: string, title: string): string {
  return `${topicId.replace(".", "-")}-${slugWords(title)}`;
}

export const lessonsHref = "/lessons";
export const courseLessonsHref = (courseId: string) => `/lessons/${encodeURIComponent(courseId)}`;
/** "unit-3": a unit's review page. Topic slugs start with a digit, so the two never clash. */
export const unitSlug = (unit: number) => `unit-${unit}`;
export const isUnitSlug = (slug: string) => /^unit-\d{1,2}$/.test(slug);
export const unitLessonsHref = (courseId: string, unit: number) =>
  `${courseLessonsHref(courseId)}/${unitSlug(unit)}`;
export const topicLessonHref = (courseId: string, topicId: string, title: string) =>
  `${courseLessonsHref(courseId)}/${topicSlug(topicId, title)}`;

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

function blurb(name: string, units: PublicUnit[]): string {
  const first = units[0];
  const last = units.at(-1);
  if (!first || !last || first === last) return `Every topic of ${name}, one lesson at a time.`;
  return `Every unit of ${name}, from ${lower(first.title)} to ${lower(last.title)}, one topic at a time: the ideas, the equations and two worked examples for each.`;
}

let cache: Promise<PublicCourse[]> | null = null;

/** The courses with lessons, each unit listing only the topics that have one. */
export function publicCourses(): Promise<PublicCourse[]> {
  cache ??= Promise.all(
    CURRICULA.filter((c) => guideUnits(c.id).length > 0).map(async (c) => {
      const units: PublicUnit[] = [];
      for (const unit of guideUnits(c.id)) {
        const info = apUnit(unit, c.apCourse);
        const guide = await loadUnitGuide(c.id, unit);
        if (!info || !guide) continue;
        const topics = info.topics
          .filter((t) => topicGuide(guide, t.id))
          .map((t) => ({
            id: t.id,
            title: t.title,
            summary: t.summary,
            slug: topicSlug(t.id, t.title),
            href: topicLessonHref(c.id, t.id, t.title),
          }));
        if (topics.length)
          units.push({
            unit,
            title: info.title,
            summary: info.summary,
            href: unitLessonsHref(c.id, unit),
            slug: unitSlug(unit),
            topics,
          });
      }
      return {
        id: c.id,
        apCourse: c.apCourse,
        name: c.name,
        description: blurb(c.name, units),
        href: courseLessonsHref(c.id),
        units,
        topicCount: units.reduce((n, u) => n + u.topics.length, 0),
      };
    }),
  ).then((courses) => courses.filter((c) => c.units.length > 0));
  return cache;
}

export async function publicCourse(courseId: string): Promise<PublicCourse | undefined> {
  return (await publicCourses()).find((c) => c.id === courseId);
}

export interface PublicTopicPage {
  course: PublicCourse;
  unit: PublicUnit;
  topic: PublicTopic;
  /** The topic's guide without its teacher notes. */
  guide: TopicGuide;
  prev?: PublicTopic & { unit: number };
  next?: PublicTopic & { unit: number };
  /** Total AP units in the course (some may have no lesson yet). */
  courseUnitCount: number;
  /** Every course with lessons, for the course menu. */
  courses: { name: string; href: string }[];
}

export async function publicTopicPage(
  courseId: string,
  slug: string,
): Promise<PublicTopicPage | undefined> {
  const course = await publicCourse(courseId);
  if (!course) return undefined;
  const flat = course.units.flatMap((u) => u.topics.map((t) => ({ ...t, unit: u.unit })));
  const at = flat.findIndex((t) => t.slug === slug);
  if (at < 0) return undefined;
  const topic = flat[at];
  const unit = course.units.find((u) => u.unit === topic.unit)!;
  const full = topicGuide(await loadUnitGuide(courseId, topic.unit), topic.id);
  if (!full) return undefined;
  // Teacher notes stay in the app; the public page never receives them.
  const { teacherNotes, ...guide } = full;
  void teacherNotes;
  return {
    course,
    unit,
    topic,
    guide,
    prev: flat[at - 1],
    next: flat[at + 1],
    courseUnitCount: apUnits(course.apCourse).length,
    courses: (await publicCourses()).map((c) => ({ name: c.name, href: c.href })),
  };
}

/** Plain text for a meta description: Markdown and $math$ markers removed, cut at a word. */
export function plainText(md: string, max = 158): string {
  const text = md
    .replace(/\$\$?([^$]*)\$\$?/g, "$1")
    .replace(/\\[a-zA-Z]+/g, "")
    .replace(/[{}_^*`#>]/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max).replace(/\s+\S*$/, "")}…`;
}

export interface PublicUnitPage {
  course: PublicCourse;
  unit: PublicUnit;
  /** Each topic with its big idea and equations (no teacher notes). */
  topics: (PublicTopic & {
    bigIdea: string;
    equations: { latex: string; meaning: string }[];
  })[];
  prev?: PublicUnit;
  next?: PublicUnit;
}

export async function publicUnitPage(
  courseId: string,
  slug: string,
): Promise<PublicUnitPage | undefined> {
  const course = await publicCourse(courseId);
  const at = course?.units.findIndex((u) => u.slug === slug) ?? -1;
  if (!course || at < 0) return undefined;
  const unit = course.units[at];
  const guide = await loadUnitGuide(courseId, unit.unit);
  return {
    course,
    unit,
    topics: unit.topics.map((t) => {
      const g = topicGuide(guide, t.id)!;
      return {
        ...t,
        bigIdea: g.bigIdea,
        equations: g.equations.map((e) => ({ latex: e.latex, meaning: e.meaning })),
      };
    }),
    prev: course.units[at - 1],
    next: course.units[at + 1],
  };
}
