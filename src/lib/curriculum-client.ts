// Browser-side reads for course roadmaps. Both queries are single-field equality filters (no composite
// index): published sets are global assignments filtered by curriculumId in the browser.
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { ClassAssignment, PublishedSet } from "@/lib/curriculum-roadmap";

export interface PublishedSetInfo extends PublishedSet {
  title: string;
}

export async function loadPublishedSets(curriculumId: string): Promise<PublishedSetInfo[]> {
  const snap = await getDocs(
    query(collection(db, "assignments"), where("visibility", "==", "global")),
  );
  const out: PublishedSetInfo[] = [];
  for (const d of snap.docs) {
    const data = d.data();
    if (data.curriculumId !== curriculumId || typeof data.curriculumSetKey !== "string") continue;
    out.push({
      id: d.id,
      curriculumSetKey: data.curriculumSetKey,
      title: String(data.title || "Untitled"),
      questionCount: Array.isArray(data.questions) ? data.questions.length : 0,
    });
  }
  return out;
}

function toDate(v: unknown): Date | null {
  const t = v as { toDate?: () => Date } | string | number | null | undefined;
  if (!t) return null;
  const d =
    typeof t === "object" && typeof t.toDate === "function"
      ? t.toDate()
      : new Date(t as string | number);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The teacher's own assignments in one class (those that came from a course set carry curriculumSetKey). */
export async function loadClassAssignments(
  teacherId: string,
  courseId: string,
): Promise<ClassAssignment[]> {
  const snap = await getDocs(
    query(
      collection(db, "assignments"),
      where("teacherId", "==", teacherId),
      where("courseId", "==", courseId),
    ),
  );
  return snap.docs.map((d) => ({
    curriculumSetKey: d.data().curriculumSetKey,
    dueDate: toDate(d.data().dueDate),
  }));
}
