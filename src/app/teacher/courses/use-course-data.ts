"use client";

// Loads what the Courses screens need for one course: the teacher's classes, the published sets, the
// chosen class's own assignments and its progress. Shared by /teacher/courses and the unit guide.
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useSelectedClass, type TeacherClass } from "@/contexts/selected-class-context";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import {
  loadClassAssignments,
  loadPublishedSets,
  type PublishedSetInfo,
} from "@/lib/curriculum-client";
import type { ClassAssignment } from "@/lib/curriculum-roadmap";
import type { SetProgress, UnitInsight } from "@/lib/course-progress";

/** A teacher's class as the Courses screens use it (the shared selected-class record). */
export type ClassOption = TeacherClass;

export interface ClassProgress {
  students: number;
  sets: Record<string, SetProgress>;
  units: UnitInsight[];
}

async function fetchClass(uid: string, classId: string, curriculumId: string) {
  const [assignments, progress] = await Promise.all([
    loadClassAssignments(uid, classId).catch(() => [] as ClassAssignment[]),
    authenticatedFetch(
      `/api/teacher/courses/progress?courseId=${encodeURIComponent(classId)}&curriculumId=${encodeURIComponent(curriculumId)}`,
    )
      .then(async (res) => (res.ok ? ((await res.json()) as ClassProgress) : null))
      .catch(() => null),
  ]);
  return { assignments, progress };
}

export function useCourseData(curriculumId: string) {
  const { user } = useAuth();
  // The class is shared with every teacher page (remembered, and in the URL as ?class=).
  const shared = useSelectedClass();
  const { classes, classId, patchClass } = shared;
  const [published, setPublished] = useState<PublishedSetInfo[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loaded, setLoaded] = useState<{
    key: string;
    assignments: ClassAssignment[];
    progress: ClassProgress | null;
  } | null>(null);
  const loadKey = `${classId}|${curriculumId}`;
  // Only what belongs to the class and course on screen (a switch shows nothing stale).
  const classAssignments = loaded?.key === loadKey ? loaded.assignments : [];
  const progress = loaded?.key === loadKey ? loaded.progress : null;

  const setClassId = shared.setClassId;

  useEffect(() => {
    let active = true;
    loadPublishedSets(curriculumId)
      .then((p) => active && setPublished(p))
      .catch(() => active && setLoadError(true));
    return () => {
      active = false;
    };
  }, [curriculumId]);

  const uid = user?.uid;
  useEffect(() => {
    if (!uid || !classId) return;
    let active = true;
    fetchClass(uid, classId, curriculumId).then((next) => {
      if (active) setLoaded({ key: `${classId}|${curriculumId}`, ...next });
    });
    return () => {
      active = false;
    };
  }, [uid, classId, curriculumId]);

  /** Reload the class's assignments and progress after a change. */
  const refreshClass = useCallback(async () => {
    if (!uid || !classId) return;
    const next = await fetchClass(uid, classId, curriculumId);
    setLoaded({ key: `${classId}|${curriculumId}`, ...next });
  }, [uid, classId, curriculumId]);

  return {
    user,
    classes,
    classId,
    setClassId,
    selected: classes?.find((c) => c.id === classId) ?? null,
    published,
    loadError,
    classAssignments,
    progress,
    refreshClass,
    patchClass,
  };
}

export type CourseData = ReturnType<typeof useCourseData>;

export const shortDate = (d: Date) =>
  d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
