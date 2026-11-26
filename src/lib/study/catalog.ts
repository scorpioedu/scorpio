// Study's map of the courses: every course, unit and topic with how many problems Study can serve
// for it and the topic's free lesson when there is one, joined with one student's progress. Server
// only (it reads the problem pool).
import { apUnits } from "@/data/ap";
import { CURRICULA } from "@/data/curricula";
import { studentGuideHref } from "@/lib/guides";
import { publicCourses } from "@/lib/guides/public";
import type { PoolProblem } from "./pool";
import {
  dueTopics,
  lastActivity,
  splitTopicKey,
  nextReviewAt,
  streak,
  topMisconceptions,
  topicKey,
  topicStats,
  type StudyProgress,
  type TopicLevel,
} from "./progress";
import { misconceptionTag } from "../../../functions/src/misconceptions";

export interface StudyTopic {
  id: string;
  key: string;
  title: string;
  problems: number;
  lessonHref: string | null;
  attempted: number;
  correct: number;
  level: TopicLevel;
  inReview: boolean;
  read: boolean;
}

export interface StudyUnit {
  unit: number;
  title: string;
  topics: StudyTopic[];
  /** Topics with problems whose level is "strong". */
  strong: number;
  /** Topics Study has problems for. */
  practisable: number;
  /** Topics whose lesson has been opened, and topics that have a lesson. */
  read: number;
  lessons: number;
}

export interface StudyCourse {
  id: string;
  name: string;
  units: StudyUnit[];
  attempted: number;
}

export interface StudySummary {
  courses: StudyCourse[];
  dueCount: number;
  nextReviewAt: string | null;
  streak: number;
  answered: number;
  correct: number;
  misconceptions: { id: string; label: string; description: string; count: number }[];
  lastTopic: {
    courseId: string;
    topicId: string;
    title: string;
    unit: number;
    /** Whether the student last read this topic's lesson or answered a problem on it. */
    kind: "read" | "practice";
    lessonHref: string | null;
  } | null;
}

export async function studySummary(
  pool: Map<string, PoolProblem>,
  progress: StudyProgress,
  now = new Date(),
): Promise<StudySummary> {
  const counts = new Map<string, number>();
  for (const p of pool.values()) counts.set(p.topic, (counts.get(p.topic) ?? 0) + 1);
  // Lessons open in the student app's own reader, never the public /lessons pages, so a student
  // in Study stays signed in to the app and in its practice.
  const lessons = new Map<string, string>();
  for (const c of await publicCourses())
    for (const u of c.units)
      for (const t of u.topics)
        lessons.set(topicKey(c.id, t.id), studentGuideHref(c.id, u.unit, t.id));

  const titles = new Map<string, string>();
  const courses: StudyCourse[] = CURRICULA.map((c) => {
    let courseAttempted = 0;
    const units = apUnits(c.apCourse).map((u) => {
      const topics = u.topics.map((t) => {
        const key = topicKey(c.id, t.id);
        titles.set(key, t.title);
        const stats = topicStats(progress, key);
        courseAttempted += stats.attempted;
        return {
          id: t.id,
          key,
          title: t.title,
          problems: counts.get(key) ?? 0,
          lessonHref: lessons.get(key) ?? null,
          ...stats,
        };
      });
      const withProblems = topics.filter((t) => t.problems > 0);
      return {
        unit: u.unit,
        title: u.title,
        topics,
        strong: withProblems.filter((t) => t.level === "strong").length,
        practisable: withProblems.length,
        read: topics.filter((t) => t.read && t.lessonHref).length,
        lessons: topics.filter((t) => t.lessonHref).length,
      };
    });
    return { id: c.id, name: c.name, units, attempted: courseAttempted };
  });

  const records = Object.values(progress.problems);
  const last = lastActivity(progress);
  const lastAt = last ? splitTopicKey(last.topic) : null;
  return {
    courses,
    dueCount: dueTopics(progress, now).length,
    nextReviewAt: nextReviewAt(progress),
    streak: streak(progress, now),
    answered: records.length,
    correct: records.filter((r) => r.correct).length,
    misconceptions: topMisconceptions(progress).flatMap((m) => {
      const tag = misconceptionTag(m.id);
      return tag
        ? [{ id: m.id, label: tag.label, description: tag.description, count: m.count }]
        : [];
    }),
    lastTopic:
      last && lastAt
        ? {
            courseId: lastAt.courseId,
            topicId: lastAt.topicId,
            title: titles.get(last.topic) ?? last.topic,
            unit: Number(lastAt.topicId.split(".")[0]),
            kind: last.kind,
            lessonHref: lessons.get(last.topic) ?? null,
          }
        : null,
  };
}
