"use client";

// The problems of one set inside the assign dialog: what students will get, with the answers, before
// anything is assigned. The teacher can leave a problem out or take one of the set's extra problems.
import { useEffect, useMemo, useState } from "react";
import { ClickIcon } from "@/components/ui/click-icon";
import { ChevronDownIcon as AnimatedChevronDown } from "@animateicons/react/lucide/chevron-down-icon";
import { loadSetPool, type PoolQuestion } from "@/lib/set-pool";
import { sizeFor, type AssignableSet } from "@/lib/assign-sets";
import { pickSetIndexes } from "@/lib/set-pick";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Maths } from "./maths";

const TYPE: Record<string, string> = { "multiple-choice": "Multiple choice", numeric: "Numeric" };

/** The set's usual problems for a count: what the class gets when the teacher changes nothing. */
export function usualPick(pool: readonly PoolQuestion[], count: number): number[] {
  return pickSetIndexes(
    pool.map((q) => q.apTopic),
    count,
  );
}

export function useSetPool(sourceId: string, wanted: boolean) {
  const [pool, setPool] = useState<PoolQuestion[] | null>(null);
  const [failed, setFailed] = useState("");
  useEffect(() => {
    if (!wanted) return;
    let active = true;
    loadSetPool(sourceId)
      .then((q) => {
        if (!active) return;
        setFailed("");
        setPool(q);
      })
      .catch((e) => active && setFailed(e instanceof Error ? e.message : "Could not load."));
    return () => {
      active = false;
    };
  }, [sourceId, wanted]);
  return { pool, failed };
}

/** One problem as students see it, with its answer marked. */
export function ProblemWithAnswer({ q }: { q: PoolQuestion }) {
  const options = Array.isArray(q.options) ? q.options : [];
  return (
    <div className="min-w-0 space-y-2">
      <Maths>{q.text}</Maths>
      {options.length > 0 ? (
        <ol className="space-y-1 pl-1">
          {options.map((option, j) => {
            const correct = option === q.correctAnswer;
            return (
              <li
                key={j}
                className={cn(
                  "flex items-baseline gap-1.5",
                  correct && "font-medium text-green-700 dark:text-green-400",
                )}
              >
                <span className="shrink-0">{String.fromCharCode(65 + j)}.</span>
                <Maths inline>{option}</Maths>
                {correct && <span className="shrink-0">(correct)</span>}
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="flex items-baseline gap-1.5 font-medium text-green-700 dark:text-green-400">
          <span className="shrink-0">Answer:</span>
          {q.correctAnswer ? <Maths inline>{q.correctAnswer}</Maths> : "not set"}
        </div>
      )}
    </div>
  );
}

export function AssignProblems({
  set,
  count,
  pick,
  onPick,
  defaultOpen = false,
  disabled = false,
}: {
  set: AssignableSet;
  /** Problems per set chosen in the dialog (absent: the usual five). */
  count: number | undefined;
  /** The teacher's own choice of problems, when it differs from the usual pick. */
  pick: number[] | undefined;
  onPick: (pick: number[] | undefined) => void;
  defaultOpen?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const { pool, failed } = useSetPool(set.sourceId, open);
  const size = sizeFor(set, count);
  const usual = useMemo(() => (pool ? usualPick(pool, size) : []), [pool, size]);
  const chosen = pick ?? usual;
  const id = `assign-problems-${set.key}`;

  function toggle(index: number) {
    const next = chosen.includes(index)
      ? chosen.filter((i) => i !== index)
      : [...chosen, index].sort((a, b) => a - b);
    if (next.length === 0) return;
    onPick(next.join() === usual.join() ? undefined : next);
  }

  return (
    <div className="min-w-0">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-ml-2 h-7 px-2 text-xs text-muted-foreground"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        <ClickIcon
          icon={AnimatedChevronDown}
          aria-hidden
          className={cn("transition-transform", open && "rotate-180")}
        />
        {open ? "Hide problems" : "See problems and answers"}
        {pick ? ` · ${pick.length} chosen by you` : ""}
      </Button>
      {open && (
        <div id={id} className="mt-2 space-y-2">
          {failed ? (
            <p role="alert" className="text-sm text-destructive">
              {failed} Close this and try again.
            </p>
          ) : !pool ? (
            <p role="status" className="text-sm text-muted-foreground">
              Loading problems…
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {chosen.length} of {pool.length} problems go to the class. Untick one to leave it
                  out, or tick another.
                </span>
                {pick && (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs"
                    onClick={() => onPick(undefined)}
                    disabled={disabled}
                  >
                    Back to the usual {usual.length}
                  </Button>
                )}
              </div>
              <ol className="space-y-2">
                {pool.map((q, i) => {
                  const included = chosen.includes(i);
                  return (
                    <li
                      key={i}
                      className={cn(
                        "flex gap-3 rounded-xl border border-border p-3 text-sm",
                        !included && "bg-muted/30",
                      )}
                    >
                      <Checkbox
                        className="mt-0.5"
                        checked={included}
                        disabled={disabled || (included && chosen.length === 1)}
                        onCheckedChange={() => toggle(i)}
                        aria-label={`Give the class problem ${i + 1} of ${set.key}`}
                      />
                      <div className={cn("min-w-0 flex-1 space-y-1.5", !included && "opacity-60")}>
                        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">Problem {i + 1}</span>
                          <span>{TYPE[q.type ?? ""] ?? q.type ?? "Question"}</span>
                          {typeof q.points === "number" && <span>{q.points} pts</span>}
                          {!included && <span>Left out</span>}
                        </p>
                        <ProblemWithAnswer q={q} />
                      </div>
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </div>
      )}
    </div>
  );
}
