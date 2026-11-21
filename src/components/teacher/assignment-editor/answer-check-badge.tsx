"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AnswerFlag } from "./answer-checks";

/** Shown on a generated question whose answer a second solve disagreed with. Never blocks saving. */
export function AnswerCheckBadge({
  flag,
  questionNumber,
  onDismiss,
}: {
  flag: AnswerFlag;
  questionNumber: number;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2"
    >
      <Badge variant="outline" className="border-amber-500/60 text-amber-700 dark:text-amber-400">
        Check this answer
      </Badge>
      <p className="min-w-0 flex-1 basis-48 break-words text-xs text-muted-foreground">
        {flag.checkedAnswer
          ? `A second solve got: ${flag.checkedAnswer.slice(0, 160)}`
          : "A second solve got a different answer."}
      </p>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={onDismiss}
        aria-label={`Dismiss the answer check on question ${questionNumber}`}
      >
        Dismiss
      </Button>
    </div>
  );
}
