import { NextResponse } from "next/server";
import { adminDb } from "./firebase-admin";
import { STUDENT_AI_OFF_MESSAGE, classStudentAiOn } from "./student-ai";

/**
 * Whether the student whose users/{uid} doc is `profile` may call a model: they are in a class,
 * that class belongs to their teacher, and the teacher turned student AI on for it. The browser
 * hides Raise when this is false; this is the check that counts.
 */
export async function studentAiAllowed(
  profile: FirebaseFirestore.DocumentData | undefined,
): Promise<boolean> {
  const courseId = profile?.courseId;
  if (typeof courseId !== "string" || !courseId || courseId.includes("/")) return false;
  const course = (await adminDb.collection("courses").doc(courseId).get()).data();
  if (!course || !profile?.teacherId || course.teacherId !== profile.teacherId) return false;
  return classStudentAiOn(course);
}

/** The 403 a student gets when AI is off for their class. `code` lets the client tell it from a budget refusal. */
export function studentAiOffResponse(): NextResponse {
  return NextResponse.json(
    { error: STUDENT_AI_OFF_MESSAGE, code: "student_ai_off" },
    { status: 403 },
  );
}
