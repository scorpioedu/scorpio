import { NextResponse } from "next/server";
import { withAuthorizedRequest } from "@/lib/auth-verify";
import { adminDb } from "@/lib/firebase-admin";
import { errorResponse } from "@/lib/api-errors";
import { parseJsonBody } from "@/lib/api-schema";
import { courseDueDatesBody } from "@/lib/schemas/api-bodies";

/**
 * POST /api/courses/{id}/due-dates { updates: [{ assignmentId, dueDate }] } -> { updated }
 * The class's owner moves the due dates of several of the class's assignments at once (the bulk
 * moves on /teacher/courses). Every assignment must belong to this class and this teacher, or
 * nothing is written. Only `dueDate` changes; a null date clears it.
 */
export const POST = withAuthorizedRequest(
  async (req, { caller, requestId }) => {
    const parsed = await parseJsonBody(req, courseDueDatesBody, { message: "Invalid request" });
    if (!parsed.ok) return parsed.response;
    const { updates } = parsed.data;
    // /api/courses/{id}/due-dates
    const id = decodeURIComponent(req.nextUrl.pathname.split("/").filter(Boolean).at(-2) ?? "");
    if (!id || id.includes("/"))
      return NextResponse.json({ error: "Invalid class" }, { status: 400 });
    if (new Set(updates.map((u) => u.assignmentId)).size !== updates.length)
      return NextResponse.json({ error: "An assignment is listed twice" }, { status: 400 });
    try {
      const course = (await adminDb.collection("courses").doc(id).get()).data();
      if (!course || course.teacherId !== caller.uid)
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      const refs = updates.map((u) => adminDb.collection("assignments").doc(u.assignmentId));
      const docs = await adminDb.getAll(...refs);
      for (const d of docs) {
        const a = d.data();
        if (!a || a.teacherId !== caller.uid || a.courseId !== id)
          return NextResponse.json(
            { error: "An assignment is not in this class" },
            { status: 403 },
          );
      }
      const batch = adminDb.batch();
      updates.forEach((u, i) =>
        batch.update(refs[i], { dueDate: u.dueDate == null ? null : new Date(u.dueDate) }),
      );
      await batch.commit();
      return NextResponse.json({ updated: updates.length });
    } catch (error) {
      return errorResponse(error, "courses/due-dates", requestId);
    }
  },
  { teacher: true, rateLimit: "write" },
);
