"use client";

// Practice problems on a lesson page: a topic's (3) or a unit's (5), checked as the reader answers.
// Nothing is fetched until the reader asks for problems, so the static page stays static and
// crawlers never call the Study API. Everyone who is not a signed-in student is offered a free
// account at the end. A signed-in student is not given practice here at all: they are sent to the
// same topic in their app's lesson reader, where its practice sits under the lesson and is saved.
import { useRef, useState } from "react";
import { useSignedInStudent } from "./student-gate";
import { Loader2 } from "lucide-react";
import { PrimaryPill } from "@/components/landing/split-kit";
import { PracticeAgain, PracticeSession } from "@/components/study/practice-session";
import { Button } from "@/components/ui/button";
import { studentGuideHref } from "@/lib/guides";
import { loadProblems, type PublicProblem } from "@/lib/study/client";
import { cn } from "@/lib/utils";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "empty" }
  | { kind: "ready"; problems: PublicProblem[]; total: number; round: number };

export function TopicPractice({
  course,
  topic,
  unit,
  heading,
  className,
}: {
  /** Curriculum id, e.g. "ap-physics-1". */
  course: string;
  /** Topic id, e.g. "3.4". Give a topic or a unit. */
  topic?: string;
  unit?: number;
  heading: string;
  className?: string;
}) {
  const size = topic ? 3 : 5;
  const [state, setState] = useState<State>({ kind: "idle" });
  const student = useSignedInStudent();
  // Problems shown so far. The API orders a visitor's problems the same way for an hour, so "more"
  // asks for a longer list and skips these.
  const seen = useRef(new Set<string>());

  const load = async () => {
    const round = state.kind === "ready" ? state.round + 1 : 0;
    setState({ kind: "loading" });
    try {
      const { problems, total } = await loadProblems({
        course,
        topic,
        unit: topic ? undefined : unit,
        count: Math.min(20, seen.current.size + size),
      });
      if (total === 0 || problems.length === 0) {
        setState({ kind: "empty" });
        return;
      }
      let fresh = problems.filter((p) => !seen.current.has(p.key));
      if (fresh.length === 0) {
        // Every problem has been shown: start over.
        seen.current.clear();
        fresh = problems;
      }
      const picked = fresh.slice(0, size);
      for (const p of picked) seen.current.add(p.key);
      setState({ kind: "ready", problems: picked, total, round });
    } catch (e) {
      setState({
        kind: "error",
        message: e instanceof Error ? e.message : "Could not load practice problems.",
      });
    }
  };

  const intro = topic
    ? "Three problems on this topic, checked as you answer. A wrong answer names the mix-up behind it, and each has a worked solution. No account needed."
    : "Five problems from across this unit, checked as you answer, with worked solutions. No account needed.";

  if (student)
    return (
      <StudentHandoff
        course={course}
        topic={topic}
        unit={unit}
        heading={heading}
        className={className}
      />
    );

  return (
    <section
      aria-labelledby="try-practice-heading"
      className={cn("space-y-5 rounded-2xl bg-muted/40 p-6 sm:p-8", className)}
    >
      <div className="space-y-2">
        <h2
          id="try-practice-heading"
          className="text-pretty text-xl font-medium tracking-[-0.02em]"
        >
          {heading}
        </h2>
        {state.kind !== "ready" && (
          <p className="max-w-xl text-pretty text-muted-foreground">{intro}</p>
        )}
      </div>

      {(state.kind === "idle" || state.kind === "loading") && (
        <Button
          onClick={() => void load()}
          disabled={state.kind === "loading"}
          className="h-11 rounded-full px-5"
        >
          {state.kind === "loading" ? (
            <>
              <Loader2 aria-hidden className="mr-1 size-4 animate-spin" />
              Loading problems…
            </>
          ) : (
            `Try ${size} practice problems`
          )}
        </Button>
      )}

      {state.kind === "error" && (
        <div className="space-y-3">
          <p role="alert" className="text-sm text-destructive">
            {state.message}
          </p>
          <Button variant="outline" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      )}

      {state.kind === "empty" && (
        <p className="text-sm text-muted-foreground">
          No practice problems for this {topic ? "topic" : "unit"} right now. Sets that are open as
          homework in a class are held back until they are due.
        </p>
      )}

      {state.kind === "ready" && (
        <PracticeSession
          key={state.round}
          problems={state.problems}
          className="bg-background"
          label={(p) => `Topic ${p.topicId}`}
          renderEnd={(results) => (
            <div className="space-y-4 border-t border-border pt-4">
              {results.some((r) => r.reply.saved) ? (
                <p className="text-sm text-muted-foreground">
                  Saved to your Study progress. Missed topics come back for review.
                </p>
              ) : (
                <p className="max-w-xl text-pretty text-sm text-muted-foreground">
                  Create a free student account to save your progress and get review that brings
                  back what you missed.
                </p>
              )}
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                {results.some((r) => r.reply.saved) ? (
                  <PrimaryPill href="/student/study">Go to Study</PrimaryPill>
                ) : (
                  <PrimaryPill href={signupHref(course, topic, unit)}>
                    Create a free account
                  </PrimaryPill>
                )}
                <PracticeAgain onClick={() => void load()}>
                  {state.total > size ? `Try ${size} more` : "Try these again"}
                </PracticeAgain>
              </div>
            </div>
          )}
        />
      )}
    </section>
  );
}

/** Sign-up that lands the new student on this topic (or unit) in the app: its lesson and practice. */
function signupHref(course: string, topic?: string, unit?: number): string {
  const topicUnit = topic ? Number(topic.split(".")[0]) : unit;
  const next =
    topicUnit !== undefined && Number.isFinite(topicUnit)
      ? studentGuideHref(course, topicUnit, topic)
      : "/student/study";
  return `/signup?${new URLSearchParams({ role: "student", next })}`;
}

/** For a signed-in student: this topic (or unit) in their app, where its lesson and practice are. */
function StudentHandoff({
  course,
  topic,
  unit,
  heading,
  className,
}: {
  course: string;
  topic?: string;
  unit?: number;
  heading: string;
  className?: string;
}) {
  const topicUnit = topic ? Number(topic.split(".")[0]) : unit;
  const href =
    topicUnit !== undefined && Number.isFinite(topicUnit)
      ? studentGuideHref(course, topicUnit, topic)
      : "/student/study";
  return (
    <section
      aria-labelledby="try-practice-heading"
      className={cn("space-y-5 rounded-2xl bg-muted/40 p-6 sm:p-8", className)}
    >
      <div className="space-y-2">
        <h2
          id="try-practice-heading"
          className="text-pretty text-xl font-medium tracking-[-0.02em]"
        >
          {heading}
        </h2>
        <p className="max-w-xl text-pretty text-muted-foreground">
          You are signed in. This {topic ? "topic" : "unit"}&apos;s lesson and its practice are in
          Study, where your answers are saved and missed topics come back for review.
        </p>
      </div>
      <PrimaryPill href={href}>Open in Scorpio</PrimaryPill>
    </section>
  );
}
