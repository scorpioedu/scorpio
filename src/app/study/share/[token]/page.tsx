import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { notFound } from "next/navigation";
import { wrap } from "@/components/lessons/lessons-ui";
import { studySummary, type StudyTopic, type StudyUnit } from "@/lib/study/catalog";
import { loadPool } from "@/lib/study/pool";
import { readProgress, resolveShareToken } from "@/lib/study/store";
import { cn } from "@/lib/utils";

// /study/share/<token>: a student's Study progress, read-only, for whoever they sent the link to
// (usually their teacher). Read at request time; the link stops working once the student turns it off.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shared Study progress",
  robots: { index: false, follow: false },
  // The token is the only key to this page: keep it out of the Referer header of any link followed.
  referrer: "no-referrer",
};

type Params = { params: Promise<{ token: string }> };

const LEVELS: Record<StudyTopic["level"], { label: string; className: string }> = {
  new: { label: "New", className: "bg-muted text-muted-foreground" },
  learning: { label: "Learning", className: "bg-amber-500/15 text-amber-800 dark:text-amber-300" },
  practised: { label: "Practised", className: "bg-sky-500/15 text-sky-800 dark:text-sky-300" },
  strong: {
    label: "Strong",
    className: "bg-emerald-600/15 text-emerald-800 dark:text-emerald-300",
  },
};

const possessive = (name: string) => (/s$/i.test(name) ? `${name}’` : `${name}’s`);

export default async function SharedProgressPage({ params }: Params) {
  const { token } = await params;
  const share = await resolveShareToken(token);
  if (!share) notFound();
  const [progress, pool] = await Promise.all([readProgress(share.uid), loadPool()]);
  const summary = await studySummary(pool, progress);
  const readIn = (c: (typeof summary.courses)[number]) => c.units.reduce((n, u) => n + u.read, 0);
  const lessonsRead = summary.courses.reduce((n, c) => n + readIn(c), 0);
  const courses = summary.courses.filter((c) => c.attempted > 0 || readIn(c) > 0);
  const accuracy = summary.answered ? Math.round((summary.correct / summary.answered) * 100) : 0;

  return (
    <div data-lessons-enter className={cn(wrap, "max-w-4xl pb-20 pt-14 sm:pb-28 sm:pt-20")}>
      <header className="border-b border-border pb-8">
        <p className="font-mono text-sm text-primary">Study progress</p>
        <h1 className="mt-2 text-balance text-[clamp(2rem,4.2vw,3rem)] font-medium leading-[1.06] tracking-[-0.04em]">
          {possessive(share.name)} Study progress
        </h1>
        <p className="mt-4 max-w-[62ch] text-pretty text-muted-foreground">
          This is a read-only link that {share.name} shared from{" "}
          <Link
            href="/lessons"
            className="font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
          >
            Study
          </Link>
          , Scorpio&rsquo;s free AP Physics lessons and practice. It shows the lessons they have
          opened and the problems they have answered there, not class assignments. {share.name} can
          turn this link off at any time.
        </p>

        <dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Lessons read" value={lessonsRead} />
          <Stat label="Problems answered" value={summary.answered} />
          <Stat
            label="Answered right"
            value={summary.correct}
            note={summary.answered ? `${accuracy}%` : undefined}
          />
          <Stat
            label="Current streak"
            value={summary.streak}
            note={summary.streak === 1 ? "day" : "days"}
          />
          <Stat label="Topics due for review" value={summary.dueCount} />
        </dl>
      </header>

      {courses.length === 0 ? (
        <p className="pt-8 text-muted-foreground">
          {share.name} has not read a lesson or answered a problem in Study yet.
        </p>
      ) : (
        <>
          <Legend />

          {courses.map((c) => {
            const started = c.units.filter((u) => u.topics.some((t) => t.attempted > 0 || t.read));
            const notStarted = c.units.filter(
              (u) => !started.includes(u) && (u.practisable > 0 || u.lessons > 0),
            );
            return (
              <section key={c.id} aria-labelledby={`${c.id}-heading`} className="pt-12">
                <h2
                  id={`${c.id}-heading`}
                  className="text-[clamp(1.35rem,2.2vw,1.7rem)] font-medium leading-tight tracking-[-0.03em]"
                >
                  {c.name}
                </h2>
                <p className="mt-1 text-sm tabular-nums text-muted-foreground">
                  {readIn(c)} {readIn(c) === 1 ? "lesson" : "lessons"} read · {c.attempted}{" "}
                  {c.attempted === 1 ? "problem" : "problems"} answered
                </p>
                <div className="mt-6 space-y-6">
                  {started.map((u) => (
                    <UnitTable key={u.unit} unit={u} />
                  ))}
                </div>
                {notStarted.length > 0 && (
                  <p className="mt-4 text-sm text-muted-foreground">
                    Not started yet: {notStarted.map((u) => `Unit ${u.unit}`).join(", ")}.
                  </p>
                )}
              </section>
            );
          })}

          {summary.misconceptions.length > 0 && (
            <section aria-labelledby="mixups-heading" className="pt-14">
              <h2
                id="mixups-heading"
                className="text-[clamp(1.35rem,2.2vw,1.7rem)] font-medium leading-tight tracking-[-0.03em]"
              >
                Most common mix-ups
              </h2>
              <p className="mt-1 max-w-[62ch] text-pretty text-sm text-muted-foreground">
                The misconceptions {possessive(share.name)} wrong answers pointed to most often.
              </p>
              <ul role="list" className="mt-6 list-none space-y-3">
                {summary.misconceptions.map((m) => (
                  <li key={m.id} className="rounded-2xl border border-border p-5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <p className="font-medium leading-snug">{m.label}</p>
                      <p className="shrink-0 text-sm tabular-nums text-muted-foreground">
                        {m.count} {m.count === 1 ? "time" : "times"}
                      </p>
                    </div>
                    <p className="mt-1.5 text-pretty text-sm text-muted-foreground">
                      {m.description}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="rounded-2xl border border-border p-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 flex items-baseline gap-1.5">
        <span className="text-2xl font-medium tabular-nums tracking-tight">{value}</span>
        {note && <span className="text-sm text-muted-foreground">{note}</span>}
      </dd>
    </div>
  );
}

function Legend() {
  return (
    <div className="pt-8 text-sm text-muted-foreground">
      <p className="sr-only">What the levels mean</p>
      <ul role="list" className="flex list-none flex-wrap gap-x-5 gap-y-2">
        <li className="inline-flex items-center gap-1.5">
          <Check aria-hidden className="size-4 text-emerald-600 dark:text-emerald-400" /> lesson
          read
        </li>
        <li>
          <LevelBadge level="learning" /> started, not yet practised
        </li>
        <li>
          <LevelBadge level="practised" /> 2+ problems, 60%+ right
        </li>
        <li>
          <LevelBadge level="strong" /> 4+ problems, 80%+ right, nothing due for review
        </li>
      </ul>
    </div>
  );
}

function LevelBadge({ level }: { level: StudyTopic["level"] }) {
  const l = LEVELS[level];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        l.className,
      )}
    >
      {l.label}
    </span>
  );
}

function UnitTable({ unit }: { unit: StudyUnit }) {
  const topics = unit.topics.filter(
    (t) => t.problems > 0 || t.attempted > 0 || t.lessonHref !== null || t.read,
  );
  const counts = [
    unit.lessons > 0 && `${unit.read} of ${unit.lessons} read`,
    unit.practisable > 0 && `${unit.strong} of ${unit.practisable} topics strong`,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border bg-muted/40 px-5 py-3">
        <h3 className="font-medium leading-snug">
          <span className="font-mono text-sm tabular-nums text-muted-foreground">
            Unit {unit.unit}
          </span>{" "}
          {unit.title}
        </h3>
        <p className="text-xs tabular-nums text-muted-foreground">{counts}</p>
      </div>
      <ul role="list" className="list-none divide-y divide-border">
        {topics.map((t) => (
          <li
            key={t.key}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-5 py-3 text-sm"
          >
            <span className="flex min-w-0 items-start gap-2">
              <span className="mt-0.5 inline-flex size-4 shrink-0">
                {t.read && (
                  <>
                    <Check aria-hidden className="size-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="sr-only">Lesson read:</span>
                  </>
                )}
              </span>
              <span className="min-w-0">
                <span className="font-mono tabular-nums text-muted-foreground">{t.id}</span>{" "}
                {t.title}
                {t.inReview && (
                  <span className="ml-2 inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                    In review
                  </span>
                )}
              </span>
            </span>
            <span className="flex items-center justify-end gap-3">
              <span className="tabular-nums text-muted-foreground">
                {t.attempted > 0
                  ? `${t.correct} of ${t.attempted} right`
                  : t.problems > 0
                    ? "Not tried"
                    : "No problems yet"}
              </span>
              <span className="w-20 text-right">
                <LevelBadge level={t.level} />
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
