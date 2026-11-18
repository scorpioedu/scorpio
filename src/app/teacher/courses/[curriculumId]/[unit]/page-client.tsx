"use client";

// The unit guide: a unit's home page. What the unit covers and its AP topics, each set with what it
// practises and how the chosen class did, what students got wrong and what to re-teach, and one
// clear Assign action. A class follows one course, so the guide belongs to the chosen class's
// course: a unit of another course is not shown for that class.
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Clock,
  Eye,
  Layers,
  ListChecks,
  Plus,
  Target,
  User,
  Users,
  UsersRound,
} from "lucide-react";
import { apTopic, misconceptionTag } from "@/data/ap";
import { getCurriculum, hasContent, type Curriculum } from "@/data/curricula";
import { setProfile, typeSummary } from "@/data/curricula/profiles";
import { assignmentHref } from "@/lib/assignment-actions";
import { boardColumns, setStatuses, toCheck, type SetStatus } from "@/lib/course-board";
import type { ReteachAction, UnitInsight } from "@/lib/course-progress";
import { deriveRoadmap, type RoadmapSet } from "@/lib/curriculum-roadmap";
import { normalisePlan } from "@/lib/curriculum-plan";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ClassPicker } from "@/components/teacher/class-picker";
import { CourseBadge, CourseIcon } from "@/components/teacher/course-icon";
import { SetPreviewDialog, type PreviewTarget } from "../../set-preview-dialog";
import {
  SetSegments,
  STATUS_LABEL,
  StatusMark,
  TopicChips,
  UnitTile,
  unitLook,
} from "../../unit-look";
import { shortDate, useCourseData, type ClassOption } from "../../use-course-data";
import { setDisplayTitle } from "../../use-set-actions";

const percent = (share: number) => `${Math.round(share * 100)}%`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const RETEACH: Record<ReteachAction, { label: string; Icon: typeof Users; tone: string }> = {
  "whole-class": {
    label: "Re-teach to the whole class",
    Icon: UsersRound,
    tone: "bg-destructive/10 text-destructive",
  },
  "small-group": {
    label: "Pull a small group",
    Icon: Users,
    tone: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  individual: {
    label: "Check in one to one",
    Icon: User,
    tone: "bg-muted text-muted-foreground",
  },
};

/** The chosen class is on another course (or none): say so instead of showing this unit. */
function OtherCourse({
  curriculum,
  selected,
  classes,
  onPick,
}: {
  curriculum: Curriculum;
  selected: ClassOption;
  classes: ClassOption[];
  onPick: (id: string) => void;
}) {
  const own = getCurriculum(selected.curriculumId);
  const here = classes.filter((c) => c.curriculumId === curriculum.id);
  return (
    <div className="space-y-6 md:pb-16">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <ClassPicker />
      </div>
      <section
        role="status"
        className="mx-auto max-w-xl space-y-4 rounded-3xl border border-border bg-card p-6 text-center sm:p-8"
      >
        <CourseBadge
          curriculumId={own?.id}
          className="mx-auto size-14 rounded-2xl"
          iconClassName="size-8"
        />
        <h1 className="text-xl font-semibold tracking-tight">
          {own
            ? `${selected.name} follows ${own.name}`
            : `${selected.name} does not follow a course yet`}
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          This page is a unit of {curriculum.name}. A class follows one course, so unit guides open
          for the course the chosen class is on.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link href="/teacher/courses">
              {own ? `Open ${own.name}` : "Choose a course"} <ArrowRight aria-hidden />
            </Link>
          </Button>
          {here.map((c) => (
            <Button key={c.id} variant="outline" onClick={() => onPick(c.id)}>
              Switch to {c.name}
            </Button>
          ))}
        </div>
      </section>
    </div>
  );
}

function Fact({ Icon, children }: { Icon: typeof Clock; children: React.ReactNode }) {
  return (
    <li className="inline-flex items-center gap-1.5">
      <Icon className="size-4 text-muted-foreground" aria-hidden /> {children}
    </li>
  );
}

function SectionHeading({ id, title, note }: { id: string; title: string; note?: string }) {
  return (
    <div className="space-y-1">
      <h2 id={id} className="text-xl font-semibold tracking-tight">
        {title}
      </h2>
      {note && <p className="max-w-2xl text-sm text-muted-foreground">{note}</p>}
    </div>
  );
}

function Reteach({ insight, className }: { insight: UnitInsight; className: string }) {
  return (
    <ul className="grid gap-3 lg:grid-cols-2">
      {insight.top.map((m) => {
        const how = RETEACH[m.action];
        return (
          <li key={m.tag} className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                  how.tone,
                )}
              >
                <how.Icon className="size-3.5" aria-hidden /> {how.label}
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {m.studentCount} of {insight.studentsInScope} students ({percent(m.studentShare)})
              </span>
            </div>
            <div
              role="img"
              aria-label={`${percent(m.studentShare)} of ${className}'s students with graded work`}
              className="h-1.5 overflow-hidden rounded-full bg-muted"
            >
              <div
                className={cn(
                  "h-full rounded-full",
                  m.action === "whole-class"
                    ? "bg-destructive"
                    : m.action === "small-group"
                      ? "bg-amber-500"
                      : "bg-muted-foreground/60",
                )}
                style={{ width: percent(Math.max(m.studentShare, 0.04)) }}
              />
            </div>
            <div className="space-y-1 text-sm">
              <p className="break-words font-semibold">{m.label}</p>
              <p className="break-words leading-relaxed text-muted-foreground">{m.suggestion}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default function UnitGuideClient({
  curriculumId,
  unit,
}: {
  curriculumId: string;
  unit: number;
}) {
  const curriculum = getCurriculum(curriculumId)!;
  const written = hasContent(curriculum);
  const data = useCourseData(curriculumId);
  const { classes, selected, published, classAssignments, progress, classLoaded } = data;
  const [preview, setPreview] = useState<PreviewTarget | null>(null);

  const follows = selected?.curriculumId === curriculumId;
  const roadmap = useMemo(
    () =>
      deriveRoadmap(
        curriculumId,
        published ?? [],
        follows ? classAssignments : [],
        follows ? normalisePlan(curriculumId, selected?.curriculumPlan) : null,
      ),
    [curriculumId, published, classAssignments, selected, follows],
  );
  const at = roadmap.findIndex((u) => u.unit === unit);
  const roadmapUnit = roadmap[at];
  const students = progress?.students ?? 0;
  const status = useMemo(
    () => setStatuses(boardColumns(roadmapUnit ? [roadmapUnit] : [], progress?.sets, students)),
    [roadmapUnit, progress, students],
  );

  // Misconceptions the unit's sets target, with the sets that target each.
  const targeted = useMemo(() => {
    const byTag = new Map<string, string[]>();
    for (const s of roadmapUnit?.sets ?? [])
      for (const m of setProfile(curriculumId, s.set.key)?.misconceptions ?? [])
        byTag.set(m.tag, [...(byTag.get(m.tag) ?? []), s.set.key]);
    return [...byTag.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [curriculumId, roadmapUnit]);

  if (classes === null)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading your classes…
      </p>
    );
  // A teacher with no class yet browses any course; otherwise the unit must be the class's course's.
  if (selected && !follows)
    return (
      <OtherCourse
        curriculum={curriculum}
        selected={selected}
        classes={classes}
        onPick={data.setClassId}
      />
    );

  const look = unitLook(curriculumId, unit);
  const info = roadmapUnit.info;
  const hasClass = written && !!selected;
  // Nothing about the class is said until its assignments have loaded (no "0 of 4" flash).
  const classReady = hasClass && classLoaded && published !== null;
  const profiles = roadmapUnit.sets.map((s) => setProfile(curriculumId, s.set.key));
  const problems = profiles.reduce((n, p) => n + (p?.problems ?? 0), 0);
  const minutes = profiles.reduce((n, p) => n + (p?.minutes ?? 0), 0);
  const topics = [...new Set(roadmapUnit.sets.flatMap((s) => s.set.topics))];
  const insight = progress?.units.find((u) => u.unit === unit);
  const hit = new Set(insight?.top.map((m) => m.tag));
  const statuses = roadmapUnit.sets.map((s) => status.get(s.set.key) ?? "upNext");
  const wanted = roadmapUnit.sets.filter((s) => !s.skipped || s.assigned);
  const assigned = roadmapUnit.sets.filter((s) => s.assigned);
  const averages = assigned
    .map((s) => progress?.sets[s.set.key]?.averageScore)
    .filter((n): n is number => typeof n === "number");
  const average = averages.length
    ? Math.round(averages.reduce((a, b) => a + b, 0) / averages.length)
    : null;
  const waiting = assigned.reduce((n, s) => n + toCheck(progress?.sets[s.set.key]), 0);
  const previous = roadmap[at - 1];
  const following = roadmap[at + 1];
  const assignHref = (what: string | number) =>
    `/teacher/courses?assign=${encodeURIComponent(String(what))}`;
  const open = (s: RoadmapSet) =>
    setPreview({
      curriculumId,
      set: s.set,
      publishedId: s.published?.id ?? null,
      assignmentId: s.assignmentId,
    });

  return (
    <div className="space-y-10 md:pb-16">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/teacher/courses"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden /> {curriculum.name} roadmap
          </Link>
          {written && classes.length > 0 && <ClassPicker />}
        </div>

        {/* The unit, said once and loudly, in its own colour. */}
        <header className={cn("space-y-5 rounded-3xl border p-5 sm:p-7", look.line, look.wash)}>
          <div className="flex flex-wrap items-start gap-x-5 gap-y-4">
            <UnitTile
              curriculumId={curriculumId}
              unit={unit}
              className="size-16 rounded-3xl text-3xl sm:size-20 sm:text-4xl"
            />
            <div className="min-w-0 flex-1 basis-64 space-y-2">
              <p
                className={cn(
                  "flex items-center gap-1.5 text-xs font-semibold uppercase",
                  look.text,
                )}
              >
                <CourseIcon curriculumId={curriculumId} /> {curriculum.name} · Unit {unit}
              </p>
              <h1 className="break-words text-3xl font-semibold tracking-tight sm:text-4xl">
                {info?.title ?? `Unit ${unit}`}
              </h1>
              {info?.summary && (
                <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                  {info.summary}
                </p>
              )}
            </div>
            {classReady && roadmapUnit.assignable.length > 0 && (
              <Button size="lg" asChild>
                <Link href={assignHref(unit)}>
                  <Plus aria-hidden /> Assign{" "}
                  {roadmapUnit.assignable.length === wanted.length ? "this unit" : "the rest"} (
                  {plural(roadmapUnit.assignable.length, "set")})
                </Link>
              </Button>
            )}
          </div>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <Fact Icon={Layers}>{plural(roadmapUnit.sets.length, "set")}</Fact>
            <Fact Icon={ListChecks}>
              {problems ? plural(problems, "problem") : "Problems not written yet"}
            </Fact>
            {minutes > 0 && <Fact Icon={Clock}>about {minutes} min of student time</Fact>}
            <Fact Icon={Target}>{plural(topics.length, "AP topic")}</Fact>
          </ul>
          {classReady && selected && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border/60 pt-4 text-sm">
              <span className="font-semibold">{selected.name}</span>
              <SetSegments statuses={statuses} className="w-32" />
              <span className="text-muted-foreground">
                {assigned.length} of {wanted.length} sets assigned
                {average !== null ? ` · average ${average}%` : ""}
              </span>
              {waiting > 0 && (
                <span className="font-medium text-amber-700 dark:text-amber-400">
                  {plural(waiting, "answer")} to check
                </span>
              )}
            </div>
          )}
        </header>
      </div>

      <section aria-labelledby="topics-heading" className="space-y-4">
        <SectionHeading
          id="topics-heading"
          title="What this unit covers"
          note="The AP topics, in the order the sets use them, and the sets that practise each."
        />
        <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {topics.map((id) => {
            const t = apTopic(id, curriculum.apCourse);
            const sets = roadmapUnit.sets.filter((s) => s.set.topics.includes(id));
            return (
              <li key={id} className="space-y-2 rounded-2xl border border-border bg-card p-4">
                <p className="flex items-baseline gap-2">
                  <span
                    className={cn(
                      "rounded-lg px-1.5 py-0.5 text-sm font-semibold tabular-nums",
                      look.tile,
                    )}
                  >
                    {id}
                  </span>
                  <span className="min-w-0 break-words font-semibold">{t?.title}</span>
                </p>
                {t?.summary && (
                  <p className="text-sm leading-relaxed text-muted-foreground">{t.summary}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Practised in{" "}
                  {sets.map((s, i) => (
                    <span key={s.set.key}>
                      {i > 0 && ", "}
                      <a
                        href={`#set-${s.set.key}`}
                        className="font-medium text-foreground underline-offset-2 hover:underline"
                      >
                        {s.set.key}
                      </a>
                    </span>
                  ))}
                </p>
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-labelledby="sets-heading" className="space-y-4">
        <SectionHeading
          id="sets-heading"
          title="Sets in this unit"
          note={
            hasClass && selected
              ? `What each set practises, and how ${selected.name} did on it.`
              : "What each set practises."
          }
        />
        <ol className={cn("space-y-3 border-l-2 pl-4 sm:pl-6", look.line)}>
          {roadmapUnit.sets.map((s) => {
            const p = setProfile(curriculumId, s.set.key);
            const st: SetStatus = status.get(s.set.key) ?? "upNext";
            const result = s.assigned ? progress?.sets[s.set.key] : undefined;
            const outOf = result ? Math.max(students, result.submitted) : 0;
            const title = setDisplayTitle(curriculumId, s);
            const canAssign = classReady && !!s.published && !s.assigned && !s.skipped;
            return (
              <li
                key={s.set.key}
                id={`set-${s.set.key}`}
                className={cn(
                  "scroll-mt-24 rounded-2xl border border-border bg-card",
                  st === "skipped" && "opacity-70",
                )}
              >
                <div className="grid gap-x-6 gap-y-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
                  <div className="min-w-0 space-y-3">
                    <div className="space-y-1">
                      <h3 className="flex flex-wrap items-baseline gap-x-2 break-words text-lg font-semibold">
                        <span className={cn("font-mono text-sm", look.text)}>{s.set.key}</span>
                        <button
                          type="button"
                          onClick={() => open(s)}
                          className="text-left hover:text-primary hover:underline"
                        >
                          {title}
                        </button>
                      </h3>
                      <p className="break-words text-sm leading-relaxed text-muted-foreground">
                        {s.set.description}
                      </p>
                    </div>
                    <TopicChips topics={s.set.topics} course={curriculum.apCourse} titles />
                    {p && (
                      <p className="text-xs text-muted-foreground">
                        {plural(p.problems, "problem")} ({typeSummary(p)}) ·{" "}
                        {(["easy", "medium", "hard"] as const)
                          .filter((d) => p.difficulty[d] > 0)
                          .map((d) => `${p.difficulty[d]} ${d}`)
                          .join(", ")}{" "}
                        · about {p.minutes} min
                      </p>
                    )}
                    {p && p.misconceptions.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium">Wrong answers catch</p>
                        <ul className="flex flex-wrap gap-1.5">
                          {p.misconceptions.map((m) => (
                            <li
                              key={m.tag}
                              className={cn(
                                "rounded-full border px-2 py-0.5 text-xs",
                                hit.has(m.tag)
                                  ? "border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-300"
                                  : "border-border text-muted-foreground",
                              )}
                            >
                              {misconceptionTag(m.tag)?.label ?? m.tag}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* How the class did, and what to do next. */}
                  <div className="space-y-3 rounded-xl bg-muted/40 p-3 text-sm lg:self-start">
                    <p className="flex items-center gap-2 font-medium">
                      <StatusMark status={st} label={false} />
                      {hasClass && !classReady
                        ? "Loading…"
                        : hasClass || !s.published
                          ? STATUS_LABEL[st]
                          : "Ready to assign"}
                      {s.assigned && s.dueDate && (
                        <span className="font-normal text-muted-foreground">
                          · due {shortDate(s.dueDate)}
                        </span>
                      )}
                    </p>
                    {result && (
                      <dl className="space-y-2">
                        <div className="space-y-1">
                          <div className="flex items-baseline justify-between gap-2 text-xs">
                            <dt className="text-muted-foreground">Handed in</dt>
                            <dd className="tabular-nums">
                              {outOf === 0 ? "No students yet" : `${result.submitted} of ${outOf}`}
                            </dd>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                            <div
                              className={cn("h-full rounded-full", look.solid)}
                              style={{ width: outOf ? percent(result.submitted / outOf) : 0 }}
                            />
                          </div>
                        </div>
                        <div className="flex items-baseline justify-between gap-2 text-xs">
                          <dt className="text-muted-foreground">Average</dt>
                          <dd className="text-base font-semibold tabular-nums">
                            {result.averageScore === null ? "—" : `${result.averageScore}%`}
                          </dd>
                        </div>
                        {toCheck(result) > 0 && (
                          <div className="flex items-baseline justify-between gap-2 text-xs">
                            <dt className="text-muted-foreground">Waiting for you</dt>
                            <dd className="font-medium text-amber-700 dark:text-amber-400">
                              {plural(toCheck(result), "answer")}
                            </dd>
                          </div>
                        )}
                        {result.overdue > 0 && (
                          <div className="flex items-baseline justify-between gap-2 text-xs">
                            <dt className="text-muted-foreground">Overdue</dt>
                            <dd className="font-medium text-destructive">
                              {plural(result.overdue, "student")}
                            </dd>
                          </div>
                        )}
                      </dl>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {canAssign && (
                        <Button size="sm" asChild>
                          <Link href={assignHref(s.set.key)}>
                            <Plus aria-hidden /> {s.archivedId ? "Restore" : "Assign"}
                          </Link>
                        </Button>
                      )}
                      {s.assignmentId && (
                        <Button size="sm" asChild>
                          <Link href={assignmentHref(s.assignmentId)}>
                            {st === "needsYou" ? "Review" : "Results"} <ChevronRight aria-hidden />
                          </Link>
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => open(s)}>
                        <Eye aria-hidden /> Preview
                      </Button>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {classReady && selected && (
        <section aria-labelledby="reteach-heading" className="space-y-4">
          <SectionHeading
            id="reteach-heading"
            title="What students got wrong, and what to re-teach"
            note={
              insight && insight.top.length > 0
                ? `From ${selected.name}'s graded work in this unit (${plural(insight.studentsInScope, "student")}).`
                : undefined
            }
          />
          {insight && insight.top.length > 0 ? (
            <>
              <Reteach insight={insight} className={selected.name} />
              <Link
                href="/teacher/insights"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Full misconception report <ChevronRight className="size-4" aria-hidden />
              </Link>
            </>
          ) : (
            <p className="rounded-2xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
              {assigned.length === 0
                ? `Nothing from this unit is assigned to ${selected.name} yet. Once students hand work in, the misconceptions they hit show here with what to re-teach.`
                : `No misconceptions to report for ${selected.name} in this unit yet: either nothing is graded, or students' wrong answers did not match a known one.`}
            </p>
          )}
        </section>
      )}

      {targeted.length > 0 && (
        <section aria-labelledby="targets-heading" className="space-y-4">
          <SectionHeading
            id="targets-heading"
            title="Misconceptions this unit is built to catch"
            note="Wrong answers are written to catch these, so the class report can name them."
          />
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
            {targeted.map(([tag, keys]) => {
              const meta = misconceptionTag(tag);
              return (
                <li key={tag} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-3">
                  <div className="min-w-0 flex-1 basis-72 space-y-0.5 text-sm">
                    <p className="break-words font-medium">
                      {meta?.label ?? tag}
                      {hit.has(tag) && (
                        <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">
                          Seen in this class
                        </span>
                      )}
                    </p>
                    {meta?.description && (
                      <p className="break-words text-muted-foreground">{meta.description}</p>
                    )}
                  </div>
                  <p className="shrink-0 text-xs text-muted-foreground">
                    {keys.map((k) => (
                      <a
                        key={k}
                        href={`#set-${k}`}
                        className={cn(
                          "ml-1 rounded-md px-1.5 py-0.5 font-mono font-medium hover:underline",
                          look.tile,
                        )}
                      >
                        {k}
                      </a>
                    ))}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <nav
        aria-label="Other units"
        className="flex flex-wrap items-stretch justify-between gap-3 border-t border-border pt-6"
      >
        {[previous, following].map((u, i) =>
          u ? (
            <Link
              key={u.unit}
              href={`/teacher/courses/${curriculumId}/${u.unit}`}
              className={cn(
                "group flex min-w-0 max-w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-sm transition-colors hover:border-primary/60",
                i === 1 && "ml-auto flex-row-reverse text-right",
              )}
            >
              <UnitTile curriculumId={curriculumId} unit={u.unit} className="size-9 text-base" />
              <span className="min-w-0">
                <span className="block text-xs text-muted-foreground">
                  {i === 0 ? "Previous unit" : "Next unit"}
                </span>
                <span className="block truncate font-medium">{u.info?.title}</span>
              </span>
            </Link>
          ) : (
            <span key={i} />
          ),
        )}
      </nav>

      <SetPreviewDialog target={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
