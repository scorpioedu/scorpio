"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface SetupProgress {
  hasClass: boolean;
  hasAssignment: boolean;
  students: number;
  submissions: number;
}

export type SetupStepKey = "class" | "assign" | "invite" | "results";

/** The four steps in order, and which one the teacher should do next (null when all are done). */
export function setupSteps(p: SetupProgress): {
  done: Record<SetupStepKey, boolean>;
  next: SetupStepKey | null;
  completed: number;
} {
  const done: Record<SetupStepKey, boolean> = {
    class: p.hasClass,
    assign: p.hasAssignment,
    invite: p.students > 0,
    results: p.submissions > 0,
  };
  const order: SetupStepKey[] = ["class", "assign", "invite", "results"];
  return {
    done,
    next: order.find((k) => !done[k]) ?? null,
    completed: order.filter((k) => done[k]).length,
  };
}

/**
 * Teacher Home's setup card. It stays until students have turned in work, because a class with an
 * assignment and nobody in it is not set up yet. Progress is read from the teacher's own data, so
 * it is the same on every device.
 */
export function SetupChecklist({
  progress,
  className,
  classId,
  onCreateClass,
  onCopyLink,
  onCopyCode,
  onDismiss,
}: {
  progress: SetupProgress;
  /** The first class's name, once there is one. */
  className?: string;
  classId?: string;
  onCreateClass: () => void;
  onCopyLink: () => void;
  onCopyCode: () => void;
  /** Shown only when every step is done. */
  onDismiss: () => void;
}) {
  const { done, next, completed } = setupSteps(progress);
  const allDone = next === null;

  const steps: Array<{
    key: SetupStepKey;
    title: string;
    detail: string;
    actions?: React.ReactNode;
  }> = [
    {
      key: "class",
      title: "Create a class",
      detail: done.class
        ? `${className ?? "Your class"} is ready.`
        : "Name it and pick a course. Scorpio makes the join code.",
      actions: (
        <>
          <Button asChild size="sm">
            <Link href="/teacher/welcome">Guided setup (5 minutes)</Link>
          </Button>
          <Button size="sm" variant="outline" onClick={onCreateClass}>
            Create a class
          </Button>
        </>
      ),
    },
    {
      key: "assign",
      title: "Assign the first work",
      detail: done.assign
        ? "Your class has an assignment waiting."
        : "Ready-made sets are auto-graded and come with answer keys.",
      actions: (
        <>
          <Button asChild size="sm">
            <Link href="/teacher/courses">Choose a ready-made unit</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link
              href={
                classId
                  ? `/teacher/create?courseId=${encodeURIComponent(classId)}`
                  : "/teacher/create"
              }
            >
              Write your own
            </Link>
          </Button>
        </>
      ),
    },
    {
      key: "invite",
      title: "Get your students in",
      detail: done.invite
        ? `${progress.students} ${progress.students === 1 ? "student has" : "students have"} joined.`
        : "No one has joined yet. Send the link, or put the code on the board.",
      actions: (
        <>
          <Button size="sm" onClick={onCopyLink}>
            Copy student invite link
          </Button>
          <Button size="sm" variant="outline" onClick={onCopyCode}>
            Copy class code
          </Button>
        </>
      ),
    },
    {
      key: "results",
      title: "See the first results",
      detail: done.results
        ? "Work has been turned in and graded for you."
        : "Nothing to do here. Scores and common mistakes appear as students turn work in.",
    },
  ];

  return (
    <Card className="shadow-none" aria-labelledby="setup-heading">
      <CardHeader>
        <CardTitle id="setup-heading" className="break-words">
          {allDone
            ? "You’re set up"
            : done.class && className
              ? `Get ${className} ready`
              : "Get your first class ready"}
        </CardTitle>
        <CardDescription>
          {allDone
            ? "Your class is running on Scorpio. The Gradebook has the scores, and Misconceptions shows what to reteach."
            : `${completed} of 4 done.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="space-y-3">
          {steps.map((step, i) => {
            const isDone = done[step.key];
            const isNext = step.key === next;
            return (
              <li key={step.key} className="flex gap-3">
                <span
                  className={cn(
                    "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium tabular-nums",
                    isDone
                      ? "border-green-600 bg-green-600 text-white"
                      : isNext
                        ? "border-foreground text-foreground"
                        : "border-border text-muted-foreground",
                  )}
                >
                  {isDone ? <Check className="size-3.5" aria-hidden /> : i + 1}
                </span>
                <div className="min-w-0 space-y-2">
                  <div>
                    <p
                      className={cn(
                        "text-sm font-medium",
                        !isDone && !isNext && "text-muted-foreground",
                      )}
                    >
                      {step.title}
                      <span className="sr-only">
                        {isDone ? " (done)" : isNext ? " (next)" : ""}
                      </span>
                    </p>
                    <p className="break-words text-sm text-muted-foreground">{step.detail}</p>
                  </div>
                  {isNext && step.actions && (
                    <div className="flex flex-wrap gap-2">{step.actions}</div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
        {allDone && (
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href="/teacher/grades">Open Gradebook</Link>
            </Button>
            <Button size="sm" variant="outline" onClick={onDismiss}>
              Hide this
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
