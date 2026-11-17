// Live grading accuracy eval. Calls the real model, so it is skipped unless RUN_GRADING_EVAL=1:
//   RUN_GRADING_EVAL=1 npx jest __tests__/grading-eval.live.test.ts
// Cases and accepted score bands: tools/grading-eval/cases.json. Writes the report to
// GRADING_EVAL_OUT (default tools/grading-eval/last-report.md).
import { writeFileSync } from "fs";
import { join } from "path";
import { gradeWithModel } from "../functions/src/grading-schema";
import { gradeSubmissionAnswers, type GradedAnswer } from "../functions/src/grading-core";
import { runEval, geminiCall, formatReport } from "../tools/grading-eval/run-eval";

const live = process.env.RUN_GRADING_EVAL === "1" ? test : test.skip;
jest.setTimeout(900000);

live("grading pipeline accuracy against labelled answers", async () => {
  const call = geminiCall();
  const report = await runEval(
    "Shared grading core (deterministic first, then AI)",
    async (q, answer) => {
      const question = {
        id: "q",
        text: q.text,
        type: q.type,
        points: 10,
        correctAnswer: q.reference || undefined,
      };
      const result = await gradeSubmissionAnswers([question], [{ questionId: "q", answer }], {
        aiGrader: (input) => gradeWithModel(input, call),
      });
      const graded = result.answers[0] as GradedAnswer;
      return {
        score: graded.score,
        needsReview: result.reviewReasons.length > 0,
        method: graded.method,
      };
    },
    { runs: Number(process.env.GRADING_EVAL_RUNS || 3) },
  );

  const text = formatReport(report);
  writeFileSync(
    process.env.GRADING_EVAL_OUT || join(__dirname, "../tools/grading-eval/last-report.md"),
    text + "\n",
  );
  console.log(text);
  // A floor, not a target: the eval is for reading, but a large regression should fail loudly.
  expect(report.accuracy).toBeGreaterThanOrEqual(0.9);
  expect(report.errors).toBe(0);
});
