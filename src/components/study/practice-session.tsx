"use client";

// One practice run: problems one at a time, checked as soon as the student answers, with the
// misconception a wrong answer points to and the worked solution. Used by the lesson pages (signed
// out or in) and by Study in the student app.
import { useId, useState, type ReactNode } from "react";
import { ArrowRight, Check, ChevronDown, RotateCcw, X } from "lucide-react";
import { track } from "@vercel/analytics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LazyMarkdownRenderer } from "@/components/lazy-markdown-renderer";
import { cn } from "@/lib/utils";
import {
  checkProblem,
  type CheckReply,
  type Fetcher,
  type PublicProblem,
} from "@/lib/study/client";

export interface PracticeResult {
  problem: PublicProblem;
  reply: CheckReply;
}

export function PracticeSession({
  problems,
  fetcher,
  onAnswered,
  renderEnd,
  label,
  className,
}: {
  problems: PublicProblem[];
  fetcher?: Fetcher;
  onAnswered?: (result: PracticeResult) => void;
  /** What the end of the run shows under the score (e.g. "Practice more", or a sign-up prompt). */
  renderEnd?: (results: PracticeResult[]) => ReactNode;
  /** Shown above the problem, e.g. "3.4 Conservation of energy". */
  label?: (problem: PublicProblem) => ReactNode;
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<PracticeResult[]>([]);

  if (problems.length === 0) return null;
  const done = index >= problems.length;

  if (done) {
    const right = results.filter((r) => r.reply.correct).length;
    return (
      <div className={cn("space-y-4 rounded-2xl border border-border p-4 sm:p-6", className)}>
        <div className="flex items-end justify-between gap-4">
          <p className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold tabular-nums tracking-tight">{right}</span>
            <span className="text-sm text-muted-foreground">of {results.length} right</span>
          </p>
          <StepDots
            step={results.length}
            total={results.length}
            outcomes={results.map((r) => r.reply.correct)}
          />
        </div>
        <ul className="space-y-1 text-sm text-muted-foreground">
          {results.map((r, i) => (
            <li key={r.problem.key} className="flex items-start gap-2">
              {r.reply.correct ? (
                <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              ) : (
                <X aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
              )}
              <span>
                Problem {i + 1}
                {r.reply.misconception ? ` · ${r.reply.misconception.label}` : ""}
              </span>
            </li>
          ))}
        </ul>
        {renderEnd?.(results)}
      </div>
    );
  }

  const problem = problems[index];
  return (
    <ProblemCard
      key={problem.key}
      problem={problem}
      step={index}
      total={problems.length}
      outcomes={results.map((r) => r.reply.correct)}
      label={label?.(problem)}
      fetcher={fetcher}
      className={className}
      onChecked={(reply) => {
        const result = { problem, reply };
        setResults((prev) => [...prev, result]);
        onAnswered?.(result);
      }}
      onNext={() => {
        if (index === problems.length - 1)
          // Counts only, nothing about the student (Vercel Web Analytics is cookieless).
          track("Study run finished", {
            total: results.length,
            right: results.filter((r) => r.reply.correct).length,
            saved: results.some((r) => r.reply.saved),
          });
        setIndex((i) => i + 1);
      }}
      last={index === problems.length - 1}
    />
  );
}

function ProblemCard({
  problem,
  step,
  total,
  outcomes,
  label,
  fetcher,
  onChecked,
  onNext,
  last,
  className,
}: {
  problem: PublicProblem;
  /** 0-based index of this problem, and how many the run has. */
  step: number;
  total: number;
  /** Right or wrong for each problem already answered in this run. */
  outcomes: boolean[];
  label?: ReactNode;
  fetcher?: Fetcher;
  onChecked: (reply: CheckReply) => void;
  onNext: () => void;
  last: boolean;
  className?: string;
}) {
  const [answer, setAnswer] = useState("");
  const [reply, setReply] = useState<CheckReply | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSolution, setShowSolution] = useState(false);
  const inputId = useId();

  const submit = async () => {
    if (!answer.trim() || checking || reply) return;
    setChecking(true);
    setError(null);
    try {
      const r = await checkProblem(problem.key, answer, fetcher);
      setReply(r);
      setShowSolution(!r.correct);
      onChecked(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not check that answer.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className={cn("space-y-5 rounded-2xl border border-border p-4 sm:p-6", className)}>
      <div className="flex items-baseline justify-between gap-4 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">{label}</span>
        <StepDots step={step} total={total} outcomes={outcomes} />
      </div>
      <LazyMarkdownRenderer className="text-base">{problem.text}</LazyMarkdownRenderer>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="space-y-4"
      >
        {problem.type === "multiple-choice" ? (
          <fieldset className="space-y-2" disabled={!!reply}>
            <legend className="sr-only">Choose an answer</legend>
            {problem.options?.map((option, i) => {
              const chosen = answer === option;
              const isKey = reply && option === reply.answer;
              return (
                <label
                  key={option}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-xl border border-border px-4 py-3 text-sm transition-colors",
                    "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                    !reply && "hover:bg-muted/60",
                    chosen && !reply && "border-primary bg-primary/5",
                    reply && isKey && "border-emerald-600/60 bg-emerald-600/5",
                    reply && chosen && !reply.correct && "border-destructive/60 bg-destructive/5",
                    reply && "cursor-default",
                  )}
                >
                  <input
                    type="radio"
                    name={inputId}
                    value={option}
                    checked={chosen}
                    onChange={() => setAnswer(option)}
                    className="sr-only"
                  />
                  <span
                    aria-hidden
                    className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-border text-[11px] font-medium"
                  >
                    {String.fromCharCode(65 + i)}
                  </span>
                  <LazyMarkdownRenderer noProse className="min-w-0 [&_p]:m-0">
                    {option}
                  </LazyMarkdownRenderer>
                </label>
              );
            })}
          </fieldset>
        ) : (
          <div className="space-y-2">
            <label htmlFor={inputId} className="text-sm font-medium">
              Your answer
            </label>
            <Input
              id={inputId}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="e.g. 4.2 m/s"
              autoComplete="off"
              inputMode="text"
              disabled={!!reply}
              className="max-w-xs"
            />
            <p className="text-xs text-muted-foreground">A number with its unit, if it has one.</p>
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {!reply && (
          <Button type="submit" disabled={!answer.trim() || checking}>
            {checking ? "Checking…" : "Check"}
          </Button>
        )}
      </form>

      {reply && (
        <div className="space-y-4" aria-live="polite">
          <div
            className={cn(
              "flex items-start gap-3 rounded-xl px-4 py-3 text-sm",
              reply.correct ? "bg-emerald-600/10" : "bg-destructive/10",
            )}
          >
            {reply.correct ? (
              <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-emerald-600" />
            ) : (
              <X aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
            )}
            <div className="space-y-1">
              <p className="font-medium">
                {reply.correct ? "Right." : reply.fraction > 0 ? "Almost." : "Not quite."}
              </p>
              {!reply.correct && reply.feedback && !/^Incorrect\.?$/.test(reply.feedback) && (
                <p className="text-muted-foreground">{reply.feedback}</p>
              )}
              {!reply.correct && (
                <p className="text-muted-foreground">
                  The answer is <span className="font-medium text-foreground">{reply.answer}</span>.
                </p>
              )}
            </div>
          </div>

          {reply.misconception && (
            <div className="space-y-1 rounded-xl border border-border px-4 py-3 text-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Common mix-up
              </p>
              <p className="font-medium">{reply.misconception.label}</p>
              <p className="text-muted-foreground">{reply.misconception.description}</p>
            </div>
          )}

          {reply.solution && (
            <div className="rounded-xl border border-border">
              <button
                type="button"
                onClick={() => setShowSolution((s) => !s)}
                aria-expanded={showSolution}
                className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium"
              >
                Worked solution
                <ChevronDown
                  aria-hidden
                  className={cn("size-4 transition-transform", showSolution && "rotate-180")}
                />
              </button>
              {showSolution && (
                <div className="border-t border-border px-4 py-3">
                  <LazyMarkdownRenderer>{reply.solution}</LazyMarkdownRenderer>
                </div>
              )}
            </div>
          )}

          <Button onClick={onNext} autoFocus>
            {last ? "See how you did" : "Next problem"}
            <ArrowRight aria-hidden className="ml-1 size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

/** A small "try again" control for the end of a run. */
export function PracticeAgain({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <Button variant="outline" onClick={onClick}>
      <RotateCcw aria-hidden className="mr-1 size-4" />
      {children}
    </Button>
  );
}

/**
 * Where the run is: one dot per problem, green or red once answered, the current one ringed. The
 * words are for screen readers ("Problem 2 of 3").
 */
function StepDots({ step, total, outcomes }: { step: number; total: number; outcomes: boolean[] }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <span className="sr-only">
        {step < total ? `Problem ${step + 1} of ${total}` : `${total} problems answered`}
      </span>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className={cn(
            "size-2 rounded-full",
            i < outcomes.length
              ? outcomes[i]
                ? "bg-emerald-500"
                : "bg-destructive/80"
              : i === step
                ? "bg-primary ring-2 ring-primary/25"
                : "bg-muted-foreground/25",
          )}
        />
      ))}
    </span>
  );
}
