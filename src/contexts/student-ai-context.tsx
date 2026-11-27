"use client";

// Whether Raise is on for the signed-in student's class (src/lib/student-ai.ts). The student
// layout provides it once; pages read it to hide Raise, hints and Green Impact when it is off.
// The server makes the same check on every request, so this only decides what is shown.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/auth-context";
import { classStudentAiOn } from "@/lib/student-ai";

/** true or false once known; null while the class is loading. */
const StudentAiContext = createContext<boolean | null>(false);

export function StudentAiProvider({ children }: { children: ReactNode }) {
  const { profile, loading } = useAuth();
  const courseId = profile?.role === "student" ? profile.courseId || "" : "";
  const [known, setKnown] = useState<{ courseId: string; on: boolean } | null>(null);

  useEffect(() => {
    if (!courseId) return;
    // Live, so a teacher turning Raise on or off reaches students without a reload.
    return onSnapshot(
      doc(db, "courses", courseId),
      (snap) => setKnown({ courseId, on: classStudentAiOn(snap.data()) }),
      () => setKnown({ courseId, on: false }),
    );
  }, [courseId]);

  // A student in no class has no Raise at all.
  const value = loading ? null : !courseId ? false : known?.courseId === courseId ? known.on : null;
  return <StudentAiContext.Provider value={value}>{children}</StudentAiContext.Provider>;
}

/** Whether Raise is on for this student's class; null while loading. False outside the student app. */
export function useStudentAi(): boolean | null {
  return useContext(StudentAiContext);
}
