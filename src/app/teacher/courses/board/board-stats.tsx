// The strip above the board: how far through the course the class is, its average, and what is
// waiting (for the teacher, and from students).
import { cn } from "@/lib/utils";
import type { BoardStats as Stats } from "@/lib/course-board";
import { shortDate } from "../use-course-data";

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={cn("text-2xl font-semibold tabular-nums", tone)}>{value}</dd>
    </div>
  );
}

export function BoardStats({
  stats,
  finish,
  remaining,
  loading,
}: {
  stats: Stats;
  /** Where the last set lands at this pace (or the last due date once everything is assigned). */
  finish: Date | null;
  /** Sets still to assign. */
  remaining: number;
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
      <div className="flex gap-8">
        <Figure
          label="Average"
          value={loading ? "…" : stats.average === null ? "—" : `${stats.average}%`}
        />
        <Figure
          label="Needs you"
          value={count(stats.toCheck)}
          tone={stats.toCheck > 0 ? "text-amber-600 dark:text-amber-400" : undefined}
        />
        <Figure
          label="Overdue"
          value={count(stats.overdue)}
          tone={stats.overdue > 0 ? "text-destructive" : undefined}
        />
      </div>
    </dl>
  );
}
