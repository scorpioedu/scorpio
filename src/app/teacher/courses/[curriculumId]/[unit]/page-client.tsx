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
  Eye,
  Plus,
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
import { hasUnitGuide, topicAnchor, topicFromAnchor } from "@/lib/guides";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClassPicker } from "@/components/teacher/class-picker";
import { CourseBadge } from "@/components/teacher/course-icon";
import { UnitGuideTopics } from "@/components/guide/unit-guide-topics";
import { useUnitGuide } from "@/components/guide/use-unit-guide";
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

type GuideTab = "sets" | "topics" | "wrong";

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
  // A link to #topic-4-1 opens "What it covers" on that topic. (Nothing of the tabs is rendered
  // until the classes have loaded in the browser, so reading the address here is safe.)
  const [tab, setTab] = useState<GuideTab>(() =>
    typeof window !== "undefined" && topicFromAnchor(window.location.hash) ? "topics" : "sets",
  );
  // The unit's topic guides, when it has a guide file (src/data/guides).
  const topicGuides = useUnitGuide(curriculumId, unit);

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

  const wrongCount = insight?.top.length ?? 0;
  /** A topic or misconception link to a set: show the Sets tab first, then scroll to the set. */
  const toSet = (key: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    setTab("sets");
    window.setTimeout(
      () => document.getElementById(`set-${key}`)?.scrollIntoView({ behavior: "smooth" }),
      50,
    );
  };

  return (
    <div className="space-y-8 md:pb-16">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/teacher/courses"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden /> {curriculum.name}
        </Link>
        {written && classes.length > 0 && <ClassPicker />}
      </div>

      {/* The unit, said once. */}
      <header className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="min-w-0 flex-1 basis-80 space-y-2">
            <p className={cn("text-xs font-semibold uppercase tracking-wider", look.text)}>
              Unit {unit} of {roadmap.length}
            </p>
            <h1 className="break-words text-3xl font-semibold tracking-tight">
              {info?.title ?? `Unit ${unit}`}
            </h1>
            {info?.summary && (
              <p className="max-w-2xl leading-relaxed text-muted-foreground">{info.summary}</p>
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
        <p className="text-sm text-muted-foreground">
          {plural(roadmapUnit.sets.length, "set")} ·{" "}
          {problems ? plural(problems, "problem") : "problems not written yet"}
          {minutes > 0 ? ` · about ${minutes} min of student time` : ""} ·{" "}
          {plural(topics.length, "AP topic")}
        </p>
        {classReady && selected && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm">
            <span className="font-semibold">{selected.name}</span>
            <SetSegments statuses={statuses} className="w-28" />
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

      <Tabs value={tab} onValueChange={(v) => setTab(v as GuideTab)} className="gap-5">
        <TabsList className="h-10 self-start">
          <TabsTrigger value="sets">Sets ({roadmapUnit.sets.length})</TabsTrigger>
          <TabsTrigger value="topics">What it covers ({topics.length})</TabsTrigger>
          <TabsTrigger value="wrong">
            What students got wrong{classReady && wrongCount > 0 ? ` (${wrongCount})` : ""}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sets">
          <ol className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
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
                    "grid scroll-mt-24 gap-x-6 gap-y-3 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_16rem]",
                    st === "skipped" && "opacity-70",
                  )}
                >
                  <div className="min-w-0 space-y-2">
                    <h3 className="flex flex-wrap items-center gap-x-2.5 gap-y-1 break-words text-base font-semibold">
                      <span className={cn("font-mono text-sm", look.text)}>{s.set.key}</span>
                      <button
                        type="button"
                        onClick={() => open(s)}
                        className={cn(
                          "text-left hover:text-primary hover:underline",
                          st === "skipped" && "line-through decoration-muted-foreground/60",
                        )}
                      >
                        {title}
                      </button>
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <StatusMark status={st} label={false} className="size-3.5" />
                        {hasClass && !classReady
                          ? "Loading…"
                          : hasClass || !s.published
                            ? STATUS_LABEL[st]
                            : "Ready to assign"}
                        {s.assigned && s.dueDate && <>· due {shortDate(s.dueDate)}</>}
                      </span>
                    </h3>
                    <p className="break-words text-sm leading-relaxed text-muted-foreground">
                      {s.set.description}
                    </p>
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
                    <TopicChips topics={s.set.topics} course={curriculum.apCourse} titles />
                    {p && p.misconceptions.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Wrong answers catch:{" "}
                        {p.misconceptions.map((m, i) => (
                          <span key={m.tag}>
                            {i > 0 && ", "}
                            <span
                              className={cn(
                                hit.has(m.tag) && "font-medium text-amber-700 dark:text-amber-400",
                              )}
                            >
                              {misconceptionTag(m.tag)?.label ?? m.tag}
                            </span>
                          </span>
                        ))}
                      </p>
                    )}
                  </div>

                  {/* How the class did, and what to do next. */}
                  <div className="space-y-3 text-sm lg:self-start">
                    {result && (
                      <dl className="space-y-2 rounded-xl bg-muted/40 p-3">
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
                </li>
              );
            })}
          </ol>
        </TabsContent>

        <TabsContent value="topics" className="space-y-3">
          {topicGuides.failed && (
            <p role="alert" className="text-sm text-muted-foreground">
              The topic guides could not be loaded. Reload the page to try again.
            </p>
          )}
          {topicGuides.exists ? (
            <UnitGuideTopics
              course={curriculum.apCourse}
              topics={topics}
              guide={topicGuides.guide}
              teacher
              chipClassName={look.tile}
              practiceFor={(id) =>
                roadmapUnit.sets
                  .filter((s) => s.set.topics.includes(id))
                  .map((s) => ({
                    label: `${s.set.key} · ${s.set.title}`,
                    href: `#set-${s.set.key}`,
                    onClick: toSet(s.set.key),
                  }))
              }
              prerequisiteHref={(id) => {
                const at = apTopic(id, curriculum.apCourse);
                return at && hasUnitGuide(curriculumId, at.unit)
                  ? `/teacher/courses/${curriculumId}/${at.unit}#${topicAnchor(id)}`
                  : undefined;
              }}
              meta={(id) => (
                <p className="text-xs text-muted-foreground">
                  Practised in{" "}
                  {roadmapUnit.sets
                    .filter((s) => s.set.topics.includes(id))
                    .map((s, i) => (
                      <span key={s.set.key}>
                        {i > 0 && ", "}
                        <a
                          href={`#set-${s.set.key}`}
                          onClick={toSet(s.set.key)}
                          className="font-medium text-foreground underline-offset-2 hover:underline"
                        >
                          {s.set.key}
                        </a>
                      </span>
                    ))}
                </p>
              )}
            />
          ) : (
            <ol className="grid gap-3 sm:grid-cols-2">
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
                            onClick={toSet(s.set.key)}
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
          )}
        </TabsContent>

        <TabsContent value="wrong" className="space-y-8">
          {classReady && selected && (
            <section aria-labelledby="reteach-heading" className="space-y-4">
              <SectionHeading
                id="reteach-heading"
                title={`What ${selected.name} got wrong`}
                note={
                  insight && insight.top.length > 0
                    ? `From graded work in this unit (${plural(insight.studentsInScope, "student")}), with what to re-teach.`
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
                title="What this unit is built to catch"
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
                            onClick={toSet(k)}
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
        </TabsContent>
      </Tabs>

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
