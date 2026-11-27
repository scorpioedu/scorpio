import { NextResponse } from "next/server";
import { withAuthorizedRequest } from "@/lib/auth-verify";
import { adminDb } from "@/lib/firebase-admin";
import { errorResponse } from "@/lib/api-errors";
import { parseJsonBody } from "@/lib/api-schema";
import { updateCourseBody } from "@/lib/schemas/api-bodies";

const classId = (pathname: string) =>
  decodeURIComponent(pathname.split("/").filter(Boolean).at(-1) ?? "");

/**
 * PATCH /api/courses/{id} { name?, period?, description?, archived?, studentAi? } -> { id }
 * The owner renames a class, sets its period or description, archives it (hidden from the
 * teacher's pickers; students and assignments are untouched) and restores it, or turns Raise on
 * or off for its students.
 */
export const PATCH = withAuthorizedRequest(
  async (req, { caller, requestId }) => {
    const parsed = await parseJsonBody(req, updateCourseBody, { message: "Invalid change" });
    if (!parsed.ok) return parsed.response;
    const id = classId(req.nextUrl.pathname);
    if (!id || id.includes("/"))
      return NextResponse.json({ error: "Invalid class" }, { status: 400 });
    try {
      const ref = adminDb.collection("courses").doc(id);
      const course = (await ref.get()).data();
      if (!course || course.teacherId !== caller.uid)
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      const { archived, ...fields } = parsed.data;
      const update: Record<string, unknown> = { ...fields };
      if (archived !== undefined) update.archivedAt = archived ? new Date().toISOString() : null;
      await ref.update(update);
      return NextResponse.json({ id });
    } catch (error) {
      return errorResponse(error, "courses/update", requestId);
    }
  },
  { teacher: true, rateLimit: "write" },
);

/**
 * DELETE /api/courses/{id} -> { id }
 * The owner deletes a class and frees its join code. Assignments and student work are kept
 * (as before); students simply lose the class.
 */
export const DELETE = withAuthorizedRequest(
  async (req, { caller, requestId }) => {
    const id = classId(req.nextUrl.pathname);
    if (!id || id.includes("/"))
      return NextResponse.json({ error: "Invalid class" }, { status: 400 });
    try {
      const ref = adminDb.collection("courses").doc(id);
      await adminDb.runTransaction(async (tx) => {
        const course = (await tx.get(ref)).data();
        if (!course || course.teacherId !== caller.uid)
          throw Object.assign(new Error("denied"), { denied: true });
        if (typeof course.code === "string" && course.code) {
          const codeRef = adminDb.collection("course_codes").doc(course.code);
          const reserved = (await tx.get(codeRef)).data();
          if (reserved?.courseId === id) tx.delete(codeRef);
        }
        tx.delete(ref);
      });
      return NextResponse.json({ id });
    } catch (error) {
      if ((error as { denied?: boolean }).denied)
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      return errorResponse(error, "courses/delete", requestId);
    }
  },
  { teacher: true, rateLimit: "write" },
);
