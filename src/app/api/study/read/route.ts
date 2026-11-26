import { NextResponse } from "next/server";
import { withAuthorizedRequest } from "@/lib/auth-verify";
import { errorResponse } from "@/lib/api-errors";
import { parseJsonBody } from "@/lib/api-schema";
import { apUnits } from "@/data/ap";
import { getCurriculum } from "@/data/curricula";
import { studyReadBody } from "@/lib/schemas/api-bodies";
import { topicKey } from "@/lib/study/progress";
import { saveRead } from "@/lib/study/store";

/**
 * POST /api/study/read { course, topics: ["3.4"] } -> { success }
 *
 * Marks lessons as opened in the student's Study progress, so "read" follows them across devices
 * and shows in Continue, Progress and shared progress. Topics that are not in the course are
 * ignored.
 */
export const POST = withAuthorizedRequest(
  async (req, { caller, profile, requestId }) => {
    if (profile.role !== "student")
      return NextResponse.json({ error: "Student account required" }, { status: 403 });
    const parsed = await parseJsonBody(req, studyReadBody);
    if (!parsed.ok) return parsed.response;
    const curriculum = getCurriculum(parsed.data.course);
    if (!curriculum) return NextResponse.json({ error: "Unknown course" }, { status: 400 });
    const valid = new Set(apUnits(curriculum.apCourse).flatMap((u) => u.topics.map((t) => t.id)));
    const topics = [...new Set(parsed.data.topics)]
      .filter((t) => valid.has(t))
      .map((t) => topicKey(curriculum.id, t));
    try {
      if (topics.length) await saveRead(caller.uid, topics);
      return NextResponse.json({ success: true, saved: topics.length });
    } catch (error) {
      return errorResponse(error, "study/read", requestId);
    }
  },
  { rateLimit: "write" },
);
