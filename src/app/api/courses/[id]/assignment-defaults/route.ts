import { NextResponse } from "next/server";
import { withAuthorizedRequest } from "@/lib/auth-verify";
import { adminDb, adminFieldWithValue } from "@/lib/firebase-admin";
import { errorResponse } from "@/lib/api-errors";
import { parseJsonBody } from "@/lib/api-schema";
import { courseAssignmentDefaultsBody } from "@/lib/schemas/api-bodies";
import {
  PROBLEMS_PER_SET,
  parseAssignmentDefaults,
  parseProblemsPerSet,
} from "@/lib/assignment-defaults";

/**
 * PATCH /api/courses/{id}/assignment-defaults { assignmentDefaults: {...} | null } -> { id, assignmentDefaults }
 * The class's owner sets the settings every new assignment in the class starts with, or clears them
 * (null). Assignments that already exist are not changed.
 * PATCH /api/courses/{id}/assignment-defaults { problemsPerSet } -> { id, assignmentDefaults, problemsPerSet }
 * (`assignmentDefaults` in a response is what is now stored: the settings, plus `problemsPerSet` when remembered.)
 * Remembers the number of problems the teacher last chose in the assign dialog. It is stored inside
 * `assignmentDefaults` but is not a setting: changing it leaves the settings alone, and saving or
 * clearing the settings keeps it.
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
      if ("problemsPerSet" in parsed.data) {
        const problemsPerSet = parsed.data.problemsPerSet;
        await ref.set(
          { assignmentDefaults: { [PROBLEMS_PER_SET]: problemsPerSet } },
          { merge: true },
        );
        return NextResponse.json({
          id,
          assignmentDefaults: {
            ...parseAssignmentDefaults(course.assignmentDefaults),
            [PROBLEMS_PER_SET]: problemsPerSet,
          },
          problemsPerSet,
        });
      }
      const assignmentDefaults = parseAssignmentDefaults(parsed.data.assignmentDefaults);
      const problemsPerSet = parseProblemsPerSet(course.assignmentDefaults);
      const remembered = problemsPerSet === null ? {} : { [PROBLEMS_PER_SET]: problemsPerSet };
      const stored =
        assignmentDefaults || problemsPerSet !== null
          ? { ...assignmentDefaults, ...remembered }
          : null;
      await ref.update({ assignmentDefaults: stored ?? adminFieldWithValue.delete() });
      return NextResponse.json({ id, assignmentDefaults: stored });
    } catch (error) {
      return errorResponse(error, "courses/assignment-defaults", requestId);
    }
  },
  { teacher: true, rateLimit: "write" },
);
