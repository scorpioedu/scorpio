// The strip above the List, the Calendar and the Board: how far through the course the class is, its average, and what is
// waiting (for the teacher, and from students).
import { cn } from "@/lib/utils";
import type { BoardStats as Stats } from "@/lib/course-board";
import { shortDate } from "../use-course-data";

function Figure({
  label,
  value,
  tone,
  note,
}: {
  label: string;
  value: string;
  tone?: string;
  /** A few words under the number saying what it adds up to. */
  note?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={cn("text-2xl font-semibold tabular-nums", tone)}>
        {value}
        {note && <span className="block text-xs font-normal text-muted-foreground">{note}</span>}
      </dd>
    </div>
  );
}

export function BoardStats({
  stats,
  finish,
  remaining,
  students,
  loading,
}: {
  stats: Stats;
  /** Where the last set lands at this pace (or the last due date once everything is assigned). */
  finish: Date | null;
  /** Sets still to assign. */
  remaining: number;
  /** Students on the class's roster. */
  students: number;
  /** Progress is still loading, so scores and counts are not known yet. */
  loading: boolean;
}) {
  const share = stats.total ? Math.min(1, stats.assigned / stats.total) : 0;
  const pace = !finish
    ? ""
    : remaining === 0
      ? ` · last due ${shortDate(finish)}`
      : ` · on pace to finish ${shortDate(finish)}`;
  const count = (n: number) => (loading ? "…" : String(n));
  return (
    <dl
      aria-label="Class progress"
      className="flex flex-wrap items-center gap-x-10 gap-y-4 rounded-3xl border border-border bg-card px-5 py-4"
    >
      <div className="min-w-0 flex-1 basis-72 space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <dt className="text-sm font-semibold">Course progress</dt>
          <dd className="text-xs text-muted-foreground">
            {stats.assigned} of {stats.total} sets assigned{pace}
          </dd>
        </div>
        <div
          role="progressbar"
          aria-label="Sets assigned"
          aria-valuemin={0}
          aria-valuemax={stats.total}
          aria-valuenow={stats.assigned}
          className="h-2 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${share * 100}%` }} />
        </div>
      </div>
      <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
        <Figure label="Students" value={count(students)} />
        <Figure
          label="Average"
          value={loading ? "…" : stats.average === null ? "—" : `${stats.average}%`}
        />
        <Figure
          label="Needs you"
          // Sets, like the Needs you column's count; the answers inside them are the note.
          value={count(stats.needsYou)}
          tone={stats.needsYou > 0 ? "text-amber-600 dark:text-amber-400" : undefined}
          note={
            loading || stats.needsYou === 0
              ? undefined
              : `${stats.needsYou === 1 ? "set" : "sets"} · ${stats.toCheck} ${stats.toCheck === 1 ? "answer" : "answers"}`
          }
        />
        <Figure
          label="Overdue"
          value={count(stats.overdue)}
          tone={stats.overdue > 0 ? "text-destructive" : undefined}
          note={
            loading || stats.overdue === 0
              ? undefined
              : stats.overdue === 1
                ? "hand-in missing"
                : "hand-ins missing"
          }
        />
      </div>
    </dl>
  );
}
