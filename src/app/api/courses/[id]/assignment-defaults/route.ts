import { NextResponse } from "next/server";
import { withAuthorizedRequest } from "@/lib/auth-verify";
import { adminDb, adminFieldWithValue } from "@/lib/firebase-admin";
import { errorResponse } from "@/lib/api-errors";
import { parseJsonBody } from "@/lib/api-schema";
import { courseAssignmentDefaultsBody } from "@/lib/schemas/api-bodies";
import { parseAssignmentDefaults } from "@/lib/assignment-defaults";

/**
 * PATCH /api/courses/{id}/assignment-defaults { assignmentDefaults: {...} | null } -> { id, assignmentDefaults }
 * The class's owner sets the settings every new assignment in the class starts with, or clears them
 * (null). Assignments that already exist are not changed.
 * Clients cannot write `assignmentDefaults` themselves (firestore.rules), so this route is the only way.
 */
export const PATCH = withAuthorizedRequest(
  async (req, { caller, requestId }) => {
    const parsed = await parseJsonBody(req, courseAssignmentDefaultsBody, {
      message: "Check the assignment settings",
    });
    if (!parsed.ok) return parsed.response;
    // /api/courses/{id}/assignment-defaults
    const id = decodeURIComponent(req.nextUrl.pathname.split("/").filter(Boolean).at(-2) ?? "");
    if (!id || id.includes("/"))
      return NextResponse.json({ error: "Invalid class" }, { status: 400 });
    try {
      const ref = adminDb.collection("courses").doc(id);
      const course = (await ref.get()).data();
      if (!course || course.teacherId !== caller.uid)
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      const assignmentDefaults = parseAssignmentDefaults(parsed.data.assignmentDefaults);
      await ref.update({
        assignmentDefaults: assignmentDefaults ?? adminFieldWithValue.delete(),
      });
      return NextResponse.json({ id, assignmentDefaults });
    } catch (error) {
      return errorResponse(error, "courses/assignment-defaults", requestId);
    }
  },
  { teacher: true, rateLimit: "write" },
);
