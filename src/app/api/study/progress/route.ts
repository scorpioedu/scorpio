import { NextResponse } from "next/server";
import { withAuthorizedRequest } from "@/lib/auth-verify";
import { errorResponse } from "@/lib/api-errors";
import { studySummary } from "@/lib/study/catalog";
import { loadPool } from "@/lib/study/pool";
import { readProgress, readShareToken } from "@/lib/study/store";

/**
 * GET /api/study/progress[?course=ap-physics-1] -> StudySummary & { shareToken } for the signed-in
 * student. With `course`, `courses` holds only that course (the lesson reader needs one).
 */
export const GET = withAuthorizedRequest(
  async (req, { caller, profile, requestId }) => {
    if (profile.role !== "student")
      return NextResponse.json({ error: "Student account required" }, { status: 403 });
    try {
      const [pool, progress, shareToken] = await Promise.all([
        loadPool(),
        readProgress(caller.uid),
        readShareToken(caller.uid),
      ]);
      const summary = await studySummary(pool, progress);
      const only = req.nextUrl.searchParams.get("course");
      const courses = only ? summary.courses.filter((c) => c.id === only) : summary.courses;
      return NextResponse.json({ ...summary, courses, shareToken });
    } catch (error) {
      return errorResponse(error, "study/progress", requestId);
    }
  },
  { rateLimit: "study" },
);
