"use client";

// What a graded question shows under the feedback: the correct answer and, when the assignment has
// one and the due date has passed, the worked solution (GET /api/assignments/{id}/solutions).
import { CheckCircle } from "lucide-react";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { LazyMarkdownRenderer } from "@/components/lazy-markdown-renderer";
import type {
  QuestionSolution,
  SolutionsResponse,
} from "@/app/api/assignments/[id]/solutions/types";

/** The one line that says when worked solutions appear; null when there is nothing to wait for. */
export function solutionsNotice(
  response: Pick<SolutionsResponse, "pending" | "availableAt"> | null | undefined,
): string | null {
  if (response?.pending === "graded") return "Worked solutions appear once your work is graded.";
  if (response?.pending !== "due") return null;
  const due = response.availableAt ? new Date(response.availableAt) : null;
  return due && !Number.isNaN(due.getTime())
    ? `Worked solutions appear after the due date, ${due.toLocaleDateString()}.`
    : "Worked solutions appear after the due date.";
}

export function SolutionBlock({
  correctAnswer,
  score,
  points,
  solution,
}: {
  /** The answer in the public question, on the older documents that have one. */
  correctAnswer?: string;
  score: number | undefined;
  points: number;
  solution?: QuestionSolution;
}) {
  const worked = solution?.solution;
  // Without a worked solution this is the block as it was: shown for a missed question, or when
  // the question itself carries an answer.
  if (!worked && !(correctAnswer || (score as number) < points)) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <CheckCircle className="h-4 w-4 text-emerald-600" />
        <p className="text-xs font-medium text-muted-foreground">Correct answer and explanation</p>
      </div>
      <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground bg-muted/20 p-4 rounded-lg border">
        {worked ? (
          <>
            {solution.answer && (
              <LazyMarkdownRenderer>{`**Answer:** ${solution.answer}`}</LazyMarkdownRenderer>
            )}
            <LazyMarkdownRenderer>{worked}</LazyMarkdownRenderer>
          </>
        ) : (
          <MarkdownRenderer>{correctAnswer || "No explanation provided."}</MarkdownRenderer>
        )}
      </div>
    </div>
  );
}
