"use client";

// The student's roadmap for the course their class follows, for pages other than the dashboard
// (which loads the same data alongside its own). Same queries as the dashboard, so the same rules.
import { useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/auth-context";
import { parseDueDate } from "@/lib/due-date";
import { buildStudentRoadmap, type StudentRoadmap } from "@/lib/student-roadmap";

export type StudentRoadmapState =
  | { status: "loading" }
  | { status: "error" }
  /** No class, or a class that follows no course roadmap. */
  | { status: "none" }
  | { status: "ready"; roadmap: StudentRoadmap };

export function useStudentRoadmap(): StudentRoadmapState {
  const { user, profile } = useAuth();
  const classId = profile?.courseId;
  const hasProfile = !!profile;
  // The result is kept with the class it was loaded for, so a class change reads as loading.
  const [loaded, setLoaded] = useState<{ classId: string; state: StudentRoadmapState } | null>(null);

  useEffect(() => {
    if (!user || !classId) return;
    let active = true;
    const setState = (state: StudentRoadmapState) => setLoaded({ classId, state });
    (async () => {
      const course = (await getDoc(doc(db, "courses", classId))).data();
      if (typeof course?.curriculumId !== "string") return null;
      const [assignments, submissions] = await Promise.all([
        getDocs(
          query(
            collection(db, "assignments"),
            where("answerKeySeparated", "==", true),
            where("courseId", "==", classId),
          ),
        ),
        getDocs(query(collection(db, "submissions"), where("studentId", "==", user.uid))),
      ]);
      return buildStudentRoadmap(
        course.curriculumId,
        course.curriculumPlan,
        assignments.docs
          // Archived assignments are hidden from students.
          .filter((d) => d.data().archivedAt == null)
          .map((d) => {
            const a = d.data();
            return {
              id: d.id,
              title: a.title,
              dueDate: parseDueDate(a.dueDate),
              curriculumSetKey: a.curriculumSetKey,
              curriculumId: a.curriculumId,
            };
          }),
        submissions.docs.map((d) => {
          const s = d.data();
          return {
            assignmentId: s.assignmentId,
            status: s.status,
            graded: s.graded,
            score: s.score,
          };
        }),
      );
    })()
      .then((roadmap) => {
        if (active) setState(roadmap ? { status: "ready", roadmap } : { status: "none" });
      })
      .catch((error) => {
        console.error("Error loading the course roadmap:", error);
        if (active) setState({ status: "error" });
      });
    return () => {
      active = false;
    };
  }, [user, classId]);

  if (hasProfile && !classId) return { status: "none" };
  return loaded?.classId === classId && loaded ? loaded.state : { status: "loading" };
}
