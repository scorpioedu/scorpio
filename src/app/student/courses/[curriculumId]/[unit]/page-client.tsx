"use client";

// A unit's guide for students, as a full-screen reader (GuideReader): the unit's topics in a
// sidebar, one topic at a time. A link to #topic-4-1 opens that topic. Each topic's lesson is
// followed by its practice (three problems, saved to Study), then "Practise this": the student's
// own class's assignment for a set that covers the topic, when the class has one. The last topic is
// followed by the unit check. The sidebar shows each topic's Study level, and opening a lesson
// marks it read in Study.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { apTopic, apUnit } from "@/data/ap";
import { getCurriculum } from "@/data/curricula";
import { db } from "@/lib/firebase";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { hasUnitGuide, studentGuideHref, topicAnchor } from "@/lib/guides";
import { loadProgress, markRead, type ProgressReply } from "@/lib/study/client";
import type { StudyTopic } from "@/lib/study/catalog";
import { useAuth } from "@/contexts/auth-context";
import type { PracticeLink } from "@/components/guide/topic-guide";
import {
  GuideReader,
  UNIT_CHECK_ID,
  localReadMarks,
  clearLocalReadMarks,
  type ReaderTopicStatus,
} from "@/components/guide/guide-reader";
import { useUnitGuide } from "@/components/guide/use-unit-guide";
import { InlinePractice, type PracticeNext } from "@/components/study/topic-practice-inline";

/** The student's class's assignments that are sets of this course: set key -> assignment id. */
function useClassSets(curriculumId: string): Map<string, string> {
  const { user, profile } = useAuth();
  const classId = profile?.courseId;
  const [sets, setSets] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    if (!user || !classId) return;
    let active = true;
    // The same query the dashboard and the assignments page use (and the rules allow).
    getDocs(
      query(
        collection(db, "assignments"),
        where("answerKeySeparated", "==", true),
        where("courseId", "==", classId),
      ),
    )
      .then((snap) => {
        if (!active) return;
        const next = new Map<string, string>();
        for (const d of snap.docs) {
          const a = d.data();
          if (
            a.archivedAt == null &&
            typeof a.curriculumSetKey === "string" &&
            (a.curriculumId === undefined || a.curriculumId === curriculumId) &&
            !next.has(a.curriculumSetKey)
          )
            next.set(a.curriculumSetKey, d.id);
        }
        setSets(next);
      })
      // Without the class's assignments the guide still reads; it only has no practice links.
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [user, classId, curriculumId]);
  return sets;
}

/** Set once this browser's old read marks for a course have been copied into Study. */
export const readMigratedKey = (curriculumId: string) =>
  `scorpio.study.readMigrated.${curriculumId}`;
const TOPIC_ID = /^\d{1,2}\.\d{1,2}$/;

/**
 * Lessons read before Study kept them lived only in this browser (the reader's marks). Copies a
 * course's marks into the student's Study progress once, in one request. Best effort: on a failure
 * the flag stays unset and the next visit tries again.
 */
export async function migrateReadMarks(curriculumId: string): Promise<void> {
  let topics: string[];
  try {
    if (window.localStorage.getItem(readMigratedKey(curriculumId))) return;
    topics = localReadMarks(curriculumId).filter((t) => TOPIC_ID.test(t));
  } catch {
    return; // Storage blocked: nothing to move.
  }
  if (topics.length > 0) await markRead(authenticatedFetch, curriculumId, topics.slice(0, 100));
  // Copied: the device's marks are cleared so they never reach another account on this device.
  clearLocalReadMarks(curriculumId);
  try {
    window.localStorage.setItem(readMigratedKey(curriculumId), "1");
  } catch {
    // Blocked storage: the copy simply runs again next time (it is idempotent).
  }
}

/**
 * The student's Study progress on this course, reloaded with `refresh` (after an answer), and the
 * topics opened in this page view, which count as read straight away. Each opened topic is saved
 * as read once per view.
 */
function useCourseStudy(curriculumId: string) {
  const { user, role } = useAuth();
  const student = !!user && role === "student";
  const [progress, setProgress] = useState<ProgressReply | null>(null);
  const [version, setVersion] = useState(0);
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set());
  const sent = useRef(new Set<string>());

  useEffect(() => {
    if (!student) return;
    let active = true;
    loadProgress(authenticatedFetch, curriculumId)
      .then((p) => {
        if (active) setProgress(p);
      })
      // Without progress the reader still reads; it only has no levels to show.
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [student, curriculumId, version]);

  useEffect(() => {
    if (!student) return;
    void migrateReadMarks(curriculumId).catch(() => undefined);
  }, [student, curriculumId]);

  // Opened topics are saved once the account is known (a topic can open before it is).
  useEffect(() => {
    if (!student) return;
    const pending = [...opened].filter((t) => !sent.current.has(t));
    if (pending.length === 0) return;
    for (const t of pending) sent.current.add(t);
    void markRead(authenticatedFetch, curriculumId, pending).catch(() => undefined);
  }, [student, curriculumId, opened]);

  const onTopicOpen = useCallback(
    (topicId: string) =>
      setOpened((prev) => (prev.has(topicId) ? prev : new Set(prev).add(topicId))),
    [],
  );
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  const topics = useMemo(() => {
    const byId = new Map<string, StudyTopic>();
    for (const c of progress?.courses ?? [])
      if (c.id === curriculumId)
        for (const u of c.units) for (const t of u.topics) byId.set(t.id, t);
    return byId;
  }, [progress, curriculumId]);

  return { loaded: !!progress, topics, opened, onTopicOpen, refresh };
}

export default function StudentUnitGuideClient({
  curriculumId,
  unit,
}: {
  curriculumId: string;
  unit: number;
}) {
  const curriculum = getCurriculum(curriculumId)!;
  const course = curriculum.apCourse;
  const { guide, failed } = useUnitGuide(curriculumId, unit);
  const classSets = useClassSets(curriculumId);
  const study = useCourseStudy(curriculumId);
  const unitTopics = apUnit(unit, course)?.topics ?? [];

  // Practice is inline (below); these are the class's own sets for the topic.
  const practiceFor = (topicId: string): PracticeLink[] =>
    curriculum.sets
      .filter((s) => s.unit === unit && s.topics.includes(topicId) && classSets.has(s.key))
      .map((s) => ({
        label: s.title,
        href: `/student/assignment-view?id=${encodeURIComponent(classSets.get(s.key)!)}`,
      }));

  const topicStatus = study.loaded
    ? (topicId: string): ReaderTopicStatus | undefined => {
        const t = study.topics.get(topicId);
        return t
          ? { level: t.level, inReview: t.inReview, read: t.read || study.opened.has(topicId) }
          : undefined;
      }
    : undefined;

  const nextFor = (topicId: string): PracticeNext | undefined => {
    const at = unitTopics.findIndex((t) => t.id === topicId);
    if (at >= 0 && at < unitTopics.length - 1)
      return { label: "Next topic", href: `#${topicAnchor(unitTopics[at + 1].id)}` };
    return {
      label: "Unit check",
      onClick: () => document.getElementById(UNIT_CHECK_ID)?.scrollIntoView({ behavior: "smooth" }),
    };
  };
  // Problems Study has, once progress is in (undefined until then: the button still shows).
  const unitProblems = study.loaded
    ? unitTopics.reduce((n, t) => n + (study.topics.get(t.id)?.problems ?? 0), 0)
    : undefined;
  const prerequisiteHref = (topicId: string) => {
    const at = apTopic(topicId, course);
    return at && hasUnitGuide(curriculumId, at.unit)
      ? studentGuideHref(curriculumId, at.unit, topicId)
      : undefined;
  };

  return (
    <GuideReader
      curriculumId={curriculumId}
      courseName={curriculum.name}
      course={course}
      unit={unit}
      guide={guide}
      failed={failed}
      practiceFor={practiceFor}
      prerequisiteHref={prerequisiteHref}
      topicStatus={topicStatus}
      onTopicOpen={study.onTopicOpen}
      renderPractice={(topicId) => (
        <InlinePractice
          key={topicId}
          course={curriculumId}
          topic={topicId}
          unit={unit}
          available={study.topics.get(topicId)?.problems}
          next={nextFor(topicId)}
          onAnswered={study.refresh}
        />
      )}
      renderUnitCheck={() => (
        <InlinePractice
          key={`unit-${unit}`}
          course={curriculumId}
          unit={unit}
          available={unitProblems}
          onAnswered={study.refresh}
        />
      )}
    />
  );
}
