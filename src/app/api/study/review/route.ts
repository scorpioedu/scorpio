import { NextResponse } from "next/server";
import { withAuthorizedRequest } from "@/lib/auth-verify";
import { errorResponse } from "@/lib/api-errors";
import { loadPool, pickProblems, publicProblem } from "@/lib/study/pool";
import { dueTopics, nextReviewAt } from "@/lib/study/progress";
import { readProgress } from "@/lib/study/store";

/** Problems per due topic, and the most a review serves at once. */
const PER_TOPIC = 2;
const MAX = 10;

/**
 * GET /api/study/review -> { problems: PublicProblem[], dueTopics: string[], nextReviewAt }
 *
 * Today's review: for each topic that is due (longest overdue first), problems the student has not
 * answered yet, then those answered longest ago. Empty when nothing is due.
 */
export const GET = withAuthorizedRequest(
  async (_req, { caller, profile, requestId }) => {
    if (profile.role !== "student")
      return NextResponse.json({ error: "Student account required" }, { status: 403 });
    try {
      const [pool, progress] = await Promise.all([loadPool(), readProgress(caller.uid)]);
      const due = dueTopics(progress, new Date());
      const all = [...pool.values()];
      const seed = Math.floor(Date.now() / 86_400_000);
      const problems = due
        .flatMap((topic) =>
          pickProblems(
            all.filter((p) => p.topic === topic),
            PER_TOPIC,
            (k) => progress.problems[k]?.at,
            seed,
          ),
        )
        .slice(0, MAX);
      return NextResponse.json({
        problems: problems.map(publicProblem),
        dueTopics: due,
        nextReviewAt: nextReviewAt(progress),
      });
    } catch (error) {
      return errorResponse(error, "study/review", requestId);
    }
  },
  { rateLimit: "study" },
);
