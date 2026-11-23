"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { doc, onSnapshot } from "firebase/firestore";
import { CheckCircle2, Loader2 } from "lucide-react";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export type SubmissionOutcome =
  | { state: "grading" }
  | { state: "slow" }
  | { state: "graded"; score: number | null }
  | { state: "review" };

/** What to tell the student, from the submission document as grading changes it. */
export function submissionOutcome(
  data: { status?: unknown; graded?: unknown; score?: unknown } | undefined,
  waitedTooLong: boolean,
): SubmissionOutcome {
  if (data?.status === "pending_review") return { state: "review" };
  if (data?.graded === true || data?.status === "graded") {
    const score = typeof data.score === "number" && Number.isFinite(data.score) ? data.score : null;
    return { state: "graded", score };
  }
  return waitedTooLong ? { state: "slow" } : { state: "grading" };
}

/** How long to show "Grading…" before saying the score will turn up on Grades instead. */
const SLOW_AFTER_MS = 45_000;

/**
 * Shown the moment work is turned in. It confirms the hand-in, then shows the score as soon as
 * grading writes it, so the first thing a student sees after submitting is not a list that still
 * says "Awaiting grade".
 */
export function SubmittedDialog({
  submissionId,
  assignmentId,
  title,
  teacherGraded = false,
}: {
  submissionId: string | null;
  assignmentId: string;
  title: string;
  /** The teacher grades this one by hand, so there is no score to wait for. */
  teacherGraded?: boolean;
}) {
  const [data, setData] = useState<Record<string, unknown> | undefined>(undefined);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!submissionId) return;
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    const stop = onSnapshot(
      doc(db, "submissions", submissionId),
      (snap) => setData(snap.data()),
      () => setSlow(true),
    );
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, [submissionId]);

  if (!submissionId) return null;
  const live = submissionOutcome(data, slow);
  const outcome: SubmissionOutcome =
    teacherGraded && (live.state === "grading" || live.state === "slow")
      ? { state: "review" }
      : live;
  const feedbackHref = `/student/assignment-view?id=${encodeURIComponent(assignmentId)}&from=grades`;

  return (
    <Dialog open>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-md"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <div className="space-y-5 py-2 text-center">
          <CheckCircle2 className="mx-auto size-10 text-green-600" aria-hidden />
          <div className="space-y-1.5">
            <DialogTitle className="text-xl">Turned in</DialogTitle>
            <DialogDescription className="break-words text-base">
              {title} is with your teacher. You can’t lose it now.
            </DialogDescription>
          </div>

          <div
            role="status"
            aria-live="polite"
            className="rounded-xl border border-border bg-muted/30 p-4"
          >
            {outcome.state === "grading" && (
              <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Grading your answers. This usually takes under a minute.
              </p>
            )}
            {outcome.state === "slow" && (
              <p className="text-sm text-muted-foreground">
                Grading is taking longer than usual. Your score will be on Grades when it is ready;
                you don’t need to wait here.
              </p>
            )}
            {outcome.state === "review" && (
              <p className="text-sm text-muted-foreground">
                {teacherGraded
                  ? "Your teacher grades this one. Your score will show up on Grades when they are done."
                  : "Your teacher will look over some of your answers before the score is final. It will show up on Grades."}
              </p>
            )}
            {outcome.state === "graded" && (
              <>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Your score
                </p>
                <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight">
                  {outcome.score === null ? "Graded" : `${Math.round(outcome.score)}%`}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Each question has feedback on what you got right and what to fix.
                </p>
              </>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            {outcome.state === "graded" ? (
              <>
                {/* A full load, so the page reads the graded submission instead of the draft it had. */}
                <Button asChild>
                  <a href={feedbackHref}>See your feedback</a>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/student">Back to Home</Link>
                </Button>
              </>
            ) : (
              <>
                <Button asChild>
                  <Link href="/student">Back to Home</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/student/grades">Go to Grades</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
