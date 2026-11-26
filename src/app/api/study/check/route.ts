import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-errors";
import { parseJsonBody } from "@/lib/api-schema";
import { enforceRateLimit } from "@/lib/rate-limit";
import { studyCheckBody } from "@/lib/schemas/api-bodies";
import { checkAnswer, loadPool } from "@/lib/study/pool";
import { saveAttempt } from "@/lib/study/store";
import { studyCaller } from "@/lib/study/caller";

/**
 * POST /api/study/check { key, answer }
 *   -> { correct, fraction, feedback, misconception, answer, solution, saved }
 *
 * Checks one practice answer with the same deterministic checks homework uses (no AI) and returns
 * the correct answer, the misconception a wrong answer matches, and the worked solution. Open to
 * visitors; a signed-in student's answer is saved to their progress (`saved: true`).
 */
export async function POST(req: NextRequest) {
  const caller = await studyCaller(req);
  const limited = await enforceRateLimit(req, "study", caller?.uid);
  if (limited) return limited;
  const parsed = await parseJsonBody(req, studyCheckBody);
  if (!parsed.ok) return parsed.response;
  try {
    const problem = (await loadPool()).get(parsed.data.key);
    if (!problem)
      return NextResponse.json(
        { error: "That problem is not available for practice" },
        { status: 404 },
      );
    const outcome = checkAnswer(problem, parsed.data.answer);
    let saved = false;
    if (caller?.role === "student") {
      await saveAttempt(caller.uid, {
        problem: problem.key,
        topic: problem.topic,
        correct: outcome.correct,
        misconceptions: outcome.misconceptions,
        now: new Date(),
      });
      saved = true;
    }
    const { misconceptions: _tags, ...reply } = outcome;
    void _tags;
    return NextResponse.json({ ...reply, saved });
  } catch (error) {
    return errorResponse(error, "study/check");
  }
}
