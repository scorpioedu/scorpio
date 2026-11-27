"use client";

// The unit guide: a unit's home page. Its sets, each with what it practises and how the chosen class
// did; its AP topics as the lessons students read (Lessons tab, #lessons; each lesson opens in a
// dialog); what students got wrong, with what to re-teach and the lesson that explains each mistake;
// and one clear Assign action. A class follows one course, so the guide belongs to the chosen class's
// course: a unit of another course is not shown for that class.
import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { User, Users, UsersRound } from "lucide-react";
import { ClickIcon } from "@/components/ui/click-icon";
import { ArrowLeftIcon as AnimatedArrowLeft } from "@animateicons/react/lucide/arrow-left-icon";
import { ArrowRightIcon as AnimatedArrowRight } from "@animateicons/react/lucide/arrow-right-icon";
import { BookOpenIcon as AnimatedBookOpen } from "@animateicons/react/lucide/book-open-icon";
import { ChevronRightIcon as AnimatedChevronRight } from "@animateicons/react/lucide/chevron-right-icon";
import { EyeIcon as AnimatedEye } from "@animateicons/react/lucide/eye-icon";
import { PlusIcon as AnimatedPlus } from "@animateicons/react/lucide/plus-icon";
import { apTopic, misconceptionTag } from "@/data/ap";
import { getCurriculum, hasContent, type Curriculum } from "@/data/curricula";
import { shownProfile } from "@/data/curricula/profiles";
import { assignmentHref } from "@/lib/assignment-actions";
import { boardColumns, setStatuses, toCheck, type SetStatus } from "@/lib/course-board";
import type { ReteachAction, UnitInsight } from "@/lib/course-progress";
import { deriveRoadmap, type RoadmapSet } from "@/lib/curriculum-roadmap";
import { normalisePlan } from "@/lib/curriculum-plan";
import { hasUnitGuide, misconceptionAnchor, topicAnchor, topicFromAnchor } from "@/lib/guides";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClassPicker } from "@/components/teacher/class-picker";
import { CourseBadge } from "@/components/teacher/course-icon";
import { UnitGuideTopics } from "@/components/guide/unit-guide-topics";
import { LessonDialog, type LessonTarget } from "@/components/guide/lesson-dialog";
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

type GuideTab = "sets" | "lessons" | "wrong";

/** The address opens the Lessons tab: #lessons, a topic (#topic-4-1) or one of its mistakes. */
const opensLessons = (hash: string) => hash === "#lessons" || !!topicFromAnchor(hash);

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

/** A set as the class has it (its copy's own size) or, not assigned yet, as it is assigned by default. */
const shown = (curriculumId: string, s: RoadmapSet) =>
  shownProfile(curriculumId, s.set.key, s.assigned ? s.questionCount : null);

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
              {own ? `Open ${own.name}` : "Choose a course"}{" "}
              <ClickIcon icon={AnimatedArrowRight} aria-hidden />
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

function Reteach({
  insight,
  className,
  lesson,
}: {
  insight: UnitInsight;
  className: string;
  /** The lesson that explains a mistake, when one does. */
  lesson: (tag: string) => ReactNode;
}) {
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
            {lesson(m.tag)}
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
  // #lessons opens the Lessons tab; a link to #topic-4-1 (or a mistake in it) also opens that lesson.
  // (Nothing of the tabs is rendered until the classes have loaded in the browser, so reading the
  // address here is safe.)
  const [tab, setTab] = useState<GuideTab>(() =>
    typeof window !== "undefined" && opensLessons(window.location.hash) ? "lessons" : "sets",
  );
  /** The lesson open in the dialog, and the topics its Previous / Next step through. */
  const [lesson, setLesson] = useState<{ target: LessonTarget; topics: string[] } | null>(null);
  useEffect(() => {
    const follow = () => {
      const hash = window.location.hash;
      if (!opensLessons(hash)) return;
      setTab("lessons");
      const topic = topicFromAnchor(hash);
      // Only a topic of this unit opens here; another unit's lands on the Lessons tab.
      if (topic && Number(topic.split(".")[0]) === unit)
        setLesson({ target: { topic, anchor: hash.slice(1) }, topics: [] });
    };
    follow();
    window.addEventListener("hashchange", follow);
    return () => window.removeEventListener("hashchange", follow);
  }, [unit]);
  // The unit's topic lessons, when it has a guide file (src/data/guides).
  const topicGuides = useUnitGuide(curriculumId, unit);
  /** Each misconception tag the unit's lessons explain, with the topic whose "Common mistakes" has it. */
  const lessonOfTag = useMemo(() => {
    const byTag = new Map<string, string>();
    for (const g of topicGuides.guide?.guides ?? [])
      for (const m of g.misconceptions) if (m.tag && !byTag.has(m.tag)) byTag.set(m.tag, g.topic);
    return byTag;
  }, [topicGuides.guide]);

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
      for (const m of shown(curriculumId, s)?.misconceptions ?? [])
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
  const profiles = roadmapUnit.sets.map((s) => shown(curriculumId, s));
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
  const toSet = (key: string) => (e: MouseEvent) => {
    e.preventDefault();
    setTab("sets");
    window.setTimeout(
      () => document.getElementById(`set-${key}`)?.scrollIntoView({ behavior: "smooth" }),
      50,
    );
  };
  const hasLessons = topicGuides.exists;
  /** A lesson's "Practise this": the unit's sets on the topic (closes the dialog, shows the set). */
  const lessonPractice = (id: string) =>
    roadmapUnit.sets
      .filter((s) => s.set.topics.includes(id))
      .map((s) => ({
        label: `${s.set.key} · ${s.set.title}`,
        href: `#set-${s.set.key}`,
        onClick: (e: MouseEvent) => {
          setLesson(null);
          toSet(s.set.key)(e);
        },
      }));
  /** A prerequisite topic's lesson, on its own unit's guide (or in this dialog, for this unit). */
  const lessonPrerequisite = (id: string) => {
    const at = apTopic(id, curriculum.apCourse);
    return at && hasUnitGuide(curriculumId, at.unit)
      ? `/teacher/courses/${curriculumId}/${at.unit}#${topicAnchor(id)}`
      : undefined;
  };
  /** Opens a lesson in the dialog; Previous / Next walk `within` (the unit's topics by default). */
  const readLesson = (topic: string, within: string[] = topics, anchor?: string) =>
    setLesson({ target: { topic, anchor }, topics: within });
  /** "Lesson 2.2": the lesson that explains a mistake, or nothing when none of the unit's does. */
  const mistakeLesson = (tag: string) => {
    const topic = lessonOfTag.get(tag);
    return topic ? (
      <button
        type="button"
        onClick={() => readLesson(topic, topics, misconceptionAnchor(topic, tag))}
        className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
      >
        <ClickIcon icon={AnimatedBookOpen} className="size-3.5" aria-hidden /> Lesson {topic}
      </button>
    ) : null;
  };

  return (
    <div className="space-y-8 md:pb-16">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/teacher/courses"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ClickIcon icon={AnimatedArrowLeft} className="size-4" aria-hidden /> {curriculum.name}
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
            <Button asChild>
              <Link href={assignHref(unit)}>
                <ClickIcon icon={AnimatedPlus} aria-hidden />{" "}
                {roadmapUnit.assignable.length === wanted.length ? "Assign all" : "Assign the rest"}
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
        {/* Three long labels are wider than a phone: the strip scrolls sideways, not the page. */}
        <TabsList className="h-10 max-w-full justify-start self-start overflow-x-auto overflow-y-hidden [&>*]:flex-none">
          <TabsTrigger value="sets">Sets ({roadmapUnit.sets.length})</TabsTrigger>
          <TabsTrigger value="lessons">
            {hasLessons ? "Lessons" : "What it covers"} ({topics.length})
          </TabsTrigger>
          <TabsTrigger value="wrong">
            What students got wrong{classReady && wrongCount > 0 ? ` (${wrongCount})` : ""}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sets">
          {/* One card per set: what it is, the lessons behind it, how the class did, one next step. */}
          <ol className="grid gap-3 md:grid-cols-2">
            {roadmapUnit.sets.map((s) => {
              const p = shown(curriculumId, s);
              const st: SetStatus = status.get(s.set.key) ?? "upNext";
              const result = s.assigned ? progress?.sets[s.set.key] : undefined;
              const outOf = result ? Math.max(students, result.submitted) : 0;
              const title = setDisplayTitle(curriculumId, s);
              const canAssign = classReady && !!s.published && !s.assigned && !s.skipped;
              const caught = p?.misconceptions ?? [];
              const seen = caught.filter((m) => hit.has(m.tag)).length;
              return (
                <li
                  key={s.set.key}
                  id={`set-${s.set.key}`}
                  className={cn(
                    "flex scroll-mt-24 flex-col gap-3 rounded-2xl border border-border bg-card p-4",
                    st === "skipped" && "opacity-70",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        "shrink-0 rounded-lg px-2 py-1 font-mono text-sm font-semibold",
                        look.tile,
                      )}
                    >
                      {s.set.key}
                    </span>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <h3 className="break-words text-base font-semibold leading-snug">
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
                      </h3>
                      <p className="inline-flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                        <StatusMark status={st} label={false} className="size-3.5" />
                        <span className="font-medium">
                          {hasClass && !classReady
                            ? "Loading…"
                            : hasClass || !s.published
                              ? STATUS_LABEL[st]
                              : "Ready to assign"}
                        </span>
                        {s.assigned && s.dueDate && <span>· due {shortDate(s.dueDate)}</span>}
                        {p && (
                          <span>
                            · {plural(p.problems, "problem")} · about {p.minutes} min
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                    {s.set.description}
                  </p>

                  {/* The topics, each a way into its lesson. */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {s.set.topics.map((id) =>
                      hasLessons ? (
                        <button
                          key={id}
                          type="button"
                          onClick={() => readLesson(id, s.set.topics)}
                          title={`Read lesson ${id}`}
                          className="inline-flex max-w-full items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs hover:border-primary/60 hover:text-primary"
                        >
                          <ClickIcon
                            icon={AnimatedBookOpen}
                            className="size-3 shrink-0"
                            aria-hidden
                          />
                          <span className="font-semibold tabular-nums">{id}</span>
                          <span className="truncate text-muted-foreground">
                            {apTopic(id, curriculum.apCourse)?.title}
                          </span>
                        </button>
                      ) : (
                        <TopicChips key={id} topics={[id]} course={curriculum.apCourse} titles />
                      ),
                    )}
                  </div>

                  {caught.length > 0 && (
                    <details className="group text-xs text-muted-foreground">
                      <summary className="cursor-pointer list-none hover:text-foreground [&::-webkit-details-marker]:hidden">
                        <ClickIcon
                          icon={AnimatedChevronRight}
                          className="mr-1 size-3.5 align-middle transition-transform group-open:rotate-90"
                          aria-hidden
                        />
                        Catches {plural(caught.length, "common mistake")}
                        {seen > 0 && (
                          <span className="font-medium text-amber-700 dark:text-amber-400">
                            {" "}
                            · {seen} seen in this class
                          </span>
                        )}
                      </summary>
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {caught.map((m) => (
                          <li
                            key={m.tag}
                            className={cn(
                              "rounded-full bg-muted px-2 py-0.5",
                              hit.has(m.tag) &&
                                "bg-amber-500/15 font-medium text-amber-800 dark:text-amber-300",
                            )}
                          >
                            {misconceptionTag(m.tag)?.label ?? m.tag}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}

                  {/* How the class did: one bar and the numbers that matter. */}
                  {result && (
                    <div className="space-y-1.5 rounded-xl bg-muted/40 px-3 py-2.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
                        <span className="text-muted-foreground">
                          {outOf === 0
                            ? "No students yet"
                            : `${result.submitted} of ${outOf} handed in`}
                          {toCheck(result) > 0 && (
                            <span className="font-medium text-amber-700 dark:text-amber-400">
                              {" "}
                              · {toCheck(result)} to check
                            </span>
                          )}
                          {result.overdue > 0 && (
                            <span className="font-medium text-destructive">
                              {" "}
                              · {result.overdue} overdue
                            </span>
                          )}
                        </span>
                        <span className="text-sm font-semibold tabular-nums">
                          {result.averageScore === null ? "—" : `${result.averageScore}%`}
                          <span className="ml-1 text-xs font-normal text-muted-foreground">
                            avg
                          </span>
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn("h-full rounded-full", look.solid)}
                          style={{ width: outOf ? percent(result.submitted / outOf) : 0 }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                    {canAssign && (
                      <Button size="sm" asChild>
                        <Link href={assignHref(s.set.key)}>
                          <ClickIcon icon={AnimatedPlus} aria-hidden />{" "}
                          {s.archivedId ? "Restore" : "Assign"}
                        </Link>
                      </Button>
                    )}
                    {s.assignmentId && (
                      <Button size="sm" asChild>
                        <Link href={assignmentHref(s.assignmentId)}>
                          {st === "needsYou" ? "Review" : "Results"}{" "}
                          <ClickIcon icon={AnimatedChevronRight} aria-hidden />
                        </Link>
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => open(s)}>
                      <ClickIcon icon={AnimatedEye} aria-hidden /> Preview
                    </Button>
                  </div>
                </li>
              );
            })}
          </ol>
        </TabsContent>

        <TabsContent value="lessons" className="space-y-3">
          {topicGuides.failed && (
            <p role="alert" className="text-sm text-muted-foreground">
              The lessons could not be loaded. Reload the page to try again.
            </p>
          )}
          {topicGuides.exists ? (
            <UnitGuideTopics
              course={curriculum.apCourse}
              topics={topics}
              guide={topicGuides.guide}
              teacher
              onRead={(id) => readLesson(id)}
              chipClassName={look.tile}
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
                  <Reteach insight={insight} className={selected.name} lesson={mistakeLesson} />
                  <Link
                    href="/teacher/insights"
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    Full misconception report{" "}
                    <ClickIcon icon={AnimatedChevronRight} className="size-4" aria-hidden />
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
                        {mistakeLesson(tag)}
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

      <SetPreviewDialog canShowKey target={preview} onClose={() => setPreview(null)} />
      <LessonDialog
        course={curriculum.apCourse}
        guide={topicGuides.guide}
        topics={lesson?.topics.length ? lesson.topics : topics}
        target={lesson?.target ?? null}
        onTarget={(target) => {
          // Closing a lesson opened from the address takes it out of the address, so a reload
          // does not open it again.
          if (!target && topicFromAnchor(window.location.hash))
            window.history.replaceState(null, "", "#lessons");
          setLesson(target ? { target, topics: lesson?.topics ?? topics } : null);
        }}
        failed={topicGuides.failed}
        teacher
        practiceFor={lessonPractice}
        prerequisiteHref={lessonPrerequisite}
      />
    </div>
  );
}
