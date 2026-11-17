import { NextResponse } from "next/server";
import { withAuthorizedRequest } from "@/lib/auth-verify";
import { adminDb } from "@/lib/firebase-admin";
import { errorResponse } from "@/lib/api-errors";
import { parseJsonBody } from "@/lib/api-schema";
import { courseCurriculumBody } from "@/lib/schemas/api-bodies";
import { getCurriculum } from "@/data/curricula";

/**
 * PATCH /api/courses/{id}/curriculum { curriculumId: string | null } -> { id, curriculumId }
 * The class's owner makes the class follow a course roadmap, or stops it following one (null).
 * Following only changes how the class is shown to teacher and students; no assignments are touched.
 * Clients cannot write `curriculumId` themselves (firestore.rules), so this route is the only way.
 */
export const PATCH = withAuthorizedRequest(
  async (req, { caller, requestId }) => {
    const parsed = await parseJsonBody(req, courseCurriculumBody, { message: "Invalid request" });
    if (!parsed.ok) return parsed.response;
    const { curriculumId } = parsed.data;
    if (curriculumId !== null && !getCurriculum(curriculumId))
      return NextResponse.json({ error: "Unknown course" }, { status: 400 });
    // /api/courses/{id}/curriculum
    const id = decodeURIComponent(req.nextUrl.pathname.split("/").filter(Boolean).at(-2) ?? "");
    if (!id || id.includes("/"))
      return NextResponse.json({ error: "Invalid class" }, { status: 400 });
    try {
      const ref = adminDb.collection("courses").doc(id);
      const course = (await ref.get()).data();
      if (!course || course.teacherId !== caller.uid)
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      await ref.update({ curriculumId });
      return NextResponse.json({ id, curriculumId });
    } catch (error) {
      return errorResponse(error, "courses/curriculum", requestId);
    }
  },
  { teacher: true, rateLimit: "write" },
);
