"use client";

// Loads what the Courses screens need for one course: the teacher's classes, the published sets, the
// chosen class's own assignments and its progress. Shared by /teacher/courses and the unit guide.
import { useCallback, useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/auth-context";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import {
  loadClassAssignments,
  loadPublishedSets,
  type PublishedSetInfo,
} from "@/lib/curriculum-client";
import type { ClassAssignment } from "@/lib/curriculum-roadmap";
import type { SetProgress, UnitInsight } from "@/lib/course-progress";

export interface ClassOption {
  id: string;
  name: string;
  curriculumId: string | null;
  /** Raw stored values; read with normalisePlan / classCalendar. */
  curriculumPlan: unknown;
  daysOff: unknown;
}

export interface ClassProgress {
  students: number;
  sets: Record<string, SetProgress>;
  units: UnitInsight[];
}

const CLASS_KEY = "scorpio:courses-class";

function rememberedClass(): string {
  try {
    return window.localStorage.getItem(CLASS_KEY) ?? "";
  } catch {
    return "";
  }
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
  const [classes, setClasses] = useState<ClassOption[] | null>(null);
  const [classId, setClassIdState] = useState("");
  const [published, setPublished] = useState<PublishedSetInfo[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [classAssignments, setClassAssignments] = useState<ClassAssignment[]>([]);
  const [progress, setProgress] = useState<ClassProgress | null>(null);

  const setClassId = useCallback((id: string) => {
    setClassIdState(id);
    setProgress(null);
    setClassAssignments([]);
    try {
      window.localStorage.setItem(CLASS_KEY, id);
    } catch {
      /* private window: the choice just is not remembered */
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    getDocs(query(collection(db, "courses"), where("teacherId", "==", user.uid)))
      .then((snap) => {
        if (!active) return;
        const list = snap.docs
          .map((d) => ({
            id: d.id,
            name: String(d.data().name || "Untitled class"),
            curriculumId: typeof d.data().curriculumId === "string" ? d.data().curriculumId : null,
            curriculumPlan: d.data().curriculumPlan ?? null,
            daysOff: d.data().daysOff ?? null,
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setClasses(list);
        const remembered = rememberedClass();
        setClassIdState(
          (cur) =>
            cur ||
            list.find((c) => c.id === remembered)?.id ||
            list.find((c) => c.curriculumId === curriculumId)?.id ||
            list[0]?.id ||
            "",
        );
      })
      .catch(() => active && setClasses([]));
    return () => {
      active = false;
    };
  }, [user, curriculumId]);

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
    fetchClass(uid, classId, curriculumId).then((loaded) => {
      if (!active) return;
      setClassAssignments(loaded.assignments);
      setProgress(loaded.progress);
    });
    return () => {
      active = false;
    };
  }, [uid, classId, curriculumId]);

  /** Reload the class's assignments and progress after a change. */
  const refreshClass = useCallback(async () => {
    if (!uid || !classId) return;
    const loaded = await fetchClass(uid, classId, curriculumId);
    setClassAssignments(loaded.assignments);
    setProgress(loaded.progress);
  }, [uid, classId, curriculumId]);

  /** Apply a saved change to a class without reloading the list. */
  const patchClass = useCallback((id: string, patch: Partial<ClassOption>) => {
    setClasses((cur) => (cur ?? []).map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

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
