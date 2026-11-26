import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { loadPool, pickProblems, publicProblem } from "@/lib/study/pool";
import { topicKey } from "@/lib/study/progress";
import { readProgress } from "@/lib/study/store";
import { studyCaller } from "@/lib/study/caller";

/**
 * GET /api/study/problems?course=ap-physics-1&topic=3.4[&count=5]
 * GET /api/study/problems?course=ap-physics-1&unit=3[&count=10]
 *   -> { problems: PublicProblem[], total }
 *
 * Practice problems without their answers. Open to visitors; a signed-in student gets problems they
 * have not answered first. `total` is how many problems the topic or unit has.
 */
export async function GET(req: NextRequest) {
  const caller = await studyCaller(req);
  const limited = await enforceRateLimit(req, "study", caller?.uid);
  if (limited) return limited;
  const params = req.nextUrl.searchParams;
  const course = params.get("course") ?? "";
  const topic = params.get("topic");
  const unit = params.get("unit");
  const count = Math.min(Math.max(Number(params.get("count")) || 5, 1), 20);
  if (!/^[a-z0-9-]{1,40}$/.test(course) || (!topic && !unit))
    return NextResponse.json({ error: "Name a course and a topic or unit" }, { status: 400 });
  if (topic && !/^\d{1,2}\.\d{1,2}$/.test(topic))
    return NextResponse.json({ error: "Invalid topic" }, { status: 400 });
  if (unit && !/^\d{1,2}$/.test(unit))
    return NextResponse.json({ error: "Invalid unit" }, { status: 400 });
  try {
    const pool = await loadPool();
    const key = topic ? topicKey(course, topic) : null;
    const candidates = [...pool.values()].filter((p) =>
      key ? p.topic === key : p.courseId === course && p.unit === Number(unit),
    );
    const progress = caller?.role === "student" ? await readProgress(caller.uid) : null;
    // A fresh order each request; a signed-in student still gets unanswered problems first.
    const seed = Math.floor(Math.random() * 2 ** 32);
    const picked = pickProblems(candidates, count, (k) => progress?.problems[k]?.at, seed);
    return NextResponse.json({ problems: picked.map(publicProblem), total: candidates.length });
  } catch (error) {
    return errorResponse(error, "study/problems");
  }
}
