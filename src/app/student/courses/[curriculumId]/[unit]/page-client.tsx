"use client";

// A unit's guide for students, as a full-screen reader (GuideReader): the unit's topics in a
// sidebar, one topic at a time. A link to #topic-4-1 opens that topic. "Practise this" points at
// the student's own class's assignment for a set that covers the topic, when the class has one.
import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { apTopic } from "@/data/ap";
import { getCurriculum } from "@/data/curricula";
import { db } from "@/lib/firebase";
import { hasUnitGuide, studentGuideHref } from "@/lib/guides";
import { useAuth } from "@/contexts/auth-context";
import type { PracticeLink } from "@/components/guide/topic-guide";
import { GuideReader } from "@/components/guide/guide-reader";
import { useUnitGuide } from "@/components/guide/use-unit-guide";

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

  const practiceFor = (topicId: string): PracticeLink[] =>
    curriculum.sets
      .filter((s) => s.unit === unit && s.topics.includes(topicId) && classSets.has(s.key))
      .map((s) => ({
        label: s.title,
        href: `/student/assignment-view?id=${encodeURIComponent(classSets.get(s.key)!)}`,
      }));
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
    />
  );
}
