"use client";

// Practice inside the student's lesson reader: a topic's three problems under its lesson, or five
// from across the unit after its last topic (the unit check). Nothing is fetched until the student
// asks for problems. Answers are saved to their Study progress as they go, so a missed topic comes
// back for review on the Study page.
import { useId, useRef, useState } from "react";
import Link from "next/link";
import { Check, Loader2 } from "lucide-react";
import { ClickIcon } from "@/components/ui/click-icon";
import { ArrowRightIcon as AnimatedArrowRight } from "@animateicons/react/lucide/arrow-right-icon";
import { RotateCcwIcon as AnimatedRotateCcw } from "@animateicons/react/lucide/rotate-ccw-icon";
import {
  PracticeAgain,
  PracticeSession,
  type PracticeResult,
} from "@/components/study/practice-session";
import { Button } from "@/components/ui/button";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { loadProblems, type Fetcher, type PublicProblem } from "@/lib/study/client";
import { cn } from "@/lib/utils";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "empty" }
  | { kind: "ready"; problems: PublicProblem[]; round: number };

/** Where "Next topic" goes: another topic's address (#topic-3-5), or a button (the unit check). */
export type PracticeNext = { label: string; href: string } | { label: string; onClick: () => void };

export function InlinePractice({
  course,
  topic,
  unit,
  available,
  next,
  onAnswered,
  fetcher = authenticatedFetch,
  className,
}: {
  /** Curriculum id, e.g. "ap-physics-1". */
  course: string;
  /** The topic ("3.4") for a topic's practice; without one it is the unit check. */
  topic?: string;
  unit: number;
  /** How many problems Study has here, when known. 0 shows a note instead of the button. */
  available?: number;
  /** A topic's practice ends with a step on to the next topic (or the unit check). */
  next?: PracticeNext;
  onAnswered?: (result: PracticeResult) => void;
  fetcher?: Fetcher;
  className?: string;
}) {
  const size = topic ? 3 : 5;
  const headingId = useId();
  const [loaded, setState] = useState<State>({ kind: "idle" });
  // Known to have no problems (the count can arrive after the first render): nothing to start.
  const state: State = available === 0 && loaded.kind === "idle" ? { kind: "empty" } : loaded;
  // Problems shown in this view: "more" asks for a longer list and skips these.
  const seen = useRef(new Set<string>());

  const load = async () => {
    const round = state.kind === "ready" ? state.round + 1 : 0;
    setState({ kind: "loading" });
    try {
      const { problems, total } = await loadProblems(
        {
          course,
          ...(topic ? { topic } : { unit }),
          count: Math.min(20, seen.current.size + size),
        },
        fetcher,
      );
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
      setState({ kind: "ready", problems: picked, round });
    } catch (e) {
      setState({
        kind: "error",
        message: e instanceof Error ? e.message : "Could not load practice problems.",
      });
    }
  };

  const heading = topic ? "Practice" : "Unit check";
  const intro = topic
    ? "See how well this topic has stuck. Any you miss come back for review on your Study page."
    : `A mix of problems from across Unit ${unit}, to check the whole unit before you move on.`;

  return (
    <section
      aria-labelledby={headingId}
      className={cn("space-y-5 rounded-2xl border border-border bg-card p-4 sm:p-6", className)}
    >
      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {topic ? `Topic ${topic}` : `Unit ${unit}`}
        </p>
        <h2 id={headingId} className="text-lg font-semibold tracking-tight">
          {heading}
        </h2>
        {state.kind === "empty" ? (
          <p className="text-sm text-muted-foreground">
            No practice problems for this {topic ? "topic" : "unit"} right now. Sets that are open
            as homework in a class are held back until they are due.
          </p>
        ) : (
          state.kind !== "ready" && (
            <>
              <p className="text-sm text-muted-foreground">{intro}</p>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs text-muted-foreground">
                {[
                  `${size} problems`,
                  "Checked as you go",
                  "Worked solutions",
                  "Saved to Study",
                ].map((fact) => (
                  <li key={fact} className="flex items-center gap-1.5">
                    <Check aria-hidden className="size-3 text-primary" />
                    {fact}
                  </li>
                ))}
              </ul>
            </>
          )
        )}
      </div>

      {(state.kind === "idle" || state.kind === "loading") && (
        <Button onClick={() => void load()} disabled={state.kind === "loading"}>
          {state.kind === "loading" ? (
            <>
              <Loader2 aria-hidden className="mr-1 size-4 animate-spin" />
              Loading problems…
            </>
          ) : (
            <>
              {topic ? "Practise this topic" : "Start the unit check"}
              <ClickIcon icon={AnimatedArrowRight} aria-hidden className="ml-1 size-4" />
            </>
          )}
        </Button>
      )}

      {state.kind === "error" && (
        <div className="space-y-3">
          <p role="alert" className="text-sm text-destructive">
            {state.message}
          </p>
          <Button variant="outline" onClick={() => void load()}>
            <ClickIcon icon={AnimatedRotateCcw} aria-hidden className="mr-1 size-4" />
            Try again
          </Button>
        </div>
      )}

      {state.kind === "ready" && (
        <PracticeSession
          key={state.round}
          problems={state.problems}
          fetcher={fetcher}
          onAnswered={onAnswered}
          className="bg-background"
          // The section already names the topic; a unit check mixes topics, so each says which.
          label={topic ? undefined : (p) => `Topic ${p.topicId}`}
          renderEnd={(results) => (
            <PracticeEnd
              results={results}
              topic={topic}
              size={size}
              next={next}
              onMore={() => void load()}
            />
          )}
        />
      )}
    </section>
  );
}

export function PracticeEnd({
  results,
  topic,
  size,
  next,
  onMore,
}: {
  results: PracticeResult[];
  topic?: string;
  size: number;
  next?: PracticeNext;
  onMore: () => void;
}) {
  // A saved wrong answer puts the topic in review (see src/lib/study/progress.ts).
  const toReview = !!topic && results.some((r) => !r.reply.correct && r.reply.saved);
  return (
    <div className="space-y-4 border-t border-border pt-4">
      {toReview && (
        <p className="text-sm text-muted-foreground">
          This topic will come back for review on your Study page.
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <PracticeAgain onClick={onMore}>{size} more</PracticeAgain>
        {topic ? (
          next &&
          ("href" in next ? (
            <Button asChild>
              <a href={next.href}>
                {next.label}{" "}
                <ClickIcon icon={AnimatedArrowRight} aria-hidden className="ml-1 size-4" />
              </a>
            </Button>
          ) : (
            <Button onClick={next.onClick}>
              {next.label}{" "}
              <ClickIcon icon={AnimatedArrowRight} aria-hidden className="ml-1 size-4" />
            </Button>
          ))
        ) : (
          <Button asChild>
            <Link href="/student/study">Back to Study</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
