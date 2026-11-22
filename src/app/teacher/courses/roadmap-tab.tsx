"use client";

// The List: the class's course as a roadmap. A unit is a section with its number on a tile whose
// colour says how far along it is (green finished, amber out with students, grey not started), a bar with one
// segment per set, and its own Assign button; its sets hang off a rail under it, each
// with a status mark (told apart by shape), its AP topics, its due date and how the class did.
import Link from "next/link";
import { ChevronRight, Eye, EyeOff, MoreHorizontal, Plus } from "lucide-react";
import type { ApCourseId } from "@/data/ap";
import type { Curriculum } from "@/data/curricula";
import { shownProfile } from "@/data/curricula/profiles";
import { boardColumns, setStatuses, toCheck, type SetStatus } from "@/lib/course-board";
import { AVAILABILITY_LABEL, type RoadmapSet, type RoadmapUnit } from "@/lib/curriculum-roadmap";
import type { UnitInsight } from "@/lib/course-progress";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CourseBadge, courseLook, courseSize } from "@/components/teacher/course-icon";
import { DueDateChip } from "@/components/teacher/due-date-chip";
import { AssignmentActionsMenu } from "@/components/teacher/assignment-actions-menu";
import { assignmentHref } from "@/lib/assignment-actions";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { PreviewTarget } from "./set-preview-dialog";
import { SetSegments, StatusMark, TopicChips } from "./unit-look";
import { shortDate, type ClassProgress } from "./use-course-data";
import { setDisplayTitle, type SetRowActions } from "./use-set-actions";

const percent = (share: number) => `${Math.round(share * 100)}%`;

function MisconceptionList({ insight }: { insight: UnitInsight }) {
  return (
    <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-4">
      <p className="text-sm font-medium">
        What students got wrong{" "}
        <span className="font-normal text-muted-foreground">
          ({insight.studentsInScope} student{insight.studentsInScope === 1 ? "" : "s"} with graded
          work)
        </span>
      </p>
      <ul className="space-y-3">
        {insight.top.map((m) => (
          <li key={m.tag} className="space-y-0.5 text-sm">
            <p className="break-words">
              <span className="font-medium">{m.label}</span>{" "}
              <span className="text-muted-foreground">
                · {m.studentCount} of {insight.studentsInScope} students ({percent(m.studentShare)})
              </span>
            </p>
            <p className="break-words text-muted-foreground">{m.suggestion}</p>
          </li>
        ))}
      </ul>
      <Link
        href="/teacher/insights"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        Full misconception report <ChevronRight className="size-3" aria-hidden />
      </Link>
    </div>
  );
}

/** Where a unit stands for the class. Each has its own pill, so no one has to read colours. */
type UnitState = "done" | "progress" | "next" | "later" | "skipped";

const UNIT_PILL: Record<UnitState, { label: string; cls: string }> = {
  done: { label: "Done", cls: "bg-green-500/15 text-green-700 dark:text-green-300" },
  progress: { label: "In progress", cls: "bg-primary/10 text-primary" },
  next: { label: "Up next", cls: "bg-primary text-primary-foreground" },
  later: { label: "Later", cls: "bg-muted text-muted-foreground" },
  skipped: {
    label: "Skipped",
    cls: "border border-dashed border-muted-foreground/60 text-muted-foreground",
  },
};

/** The row's left edge, so the state also reads down the page. */
const UNIT_EDGE: Record<UnitState, string> = {
  done: "border-l-green-500",
  progress: "border-l-primary",
  next: "border-l-primary",
  later: "border-l-transparent",
  skipped: "border-l-transparent",
};

const SET_LABEL: Record<SetStatus, string> = {
  upNext: "Not assigned",
  assigned: "In progress",
  needsYou: "Needs you",
  done: "Done",
  skipped: "Skipped",
  unpublished: "Not published yet",
  planned: "Planned",
};

const SET_TONE: Record<SetStatus, string> = {
  upNext: "text-muted-foreground",
  assigned: "text-primary",
  needsYou: "text-amber-700 dark:text-amber-400",
  done: "text-green-700 dark:text-green-300",
  skipped: "text-muted-foreground",
  unpublished: "text-muted-foreground",
  planned: "text-muted-foreground",
};

function UnitPill({ state }: { state: UnitState }) {
  const { label, cls } = UNIT_PILL[state];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold",
        cls,
      )}
    >
      {state !== "skipped" && state !== "later" && (
        <span aria-hidden className="size-1.5 rounded-full bg-current" />
      )}
      {label}
    </span>
  );
}

/** Columns shared by the header row and every unit row. The chevron sits after the last one. */
const COLS =
  "grid w-full min-w-0 grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-3 md:grid-cols-[2rem_minmax(0,1fr)_7.5rem_8.5rem_5.5rem]";

const day = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
/** "Nov 18", or "Nov 18 – Dec 1". */
const dayRange = (dates: Date[]) => {
  const times = dates.map((d) => d.getTime());
  const first = new Date(Math.min(...times));
  const last = new Date(Math.max(...times));
  return day(first) === day(last) ? day(first) : `${day(first)} – ${day(last)}`;
};

/** One set on its unit's rail. The mark on the rail says where it stands. */
function SetRow({
  curriculumId,
  course,
  s,
  status,
  hasClass,
  students,
  progress,
  onPreview,
  actions = {},
}: {
  curriculumId: string;
  course: ApCourseId;
  s: RoadmapSet;
  status: SetStatus;
  hasClass: boolean;
  students: number;
  progress: ClassProgress | null;
  onPreview: (t: PreviewTarget) => void;
  actions?: SetRowActions;
}) {
  // What the class has (its copy's own size) or, not assigned yet, what it would get by default.
  const profile = shownProfile(curriculumId, s.set.key, s.assigned ? s.questionCount : null);
  const p = progress?.sets[s.set.key];
  const title = setDisplayTitle(curriculumId, s);
  const canAssign = hasClass && !!s.published && !s.assigned && !s.skipped && !!actions.onAssignSet;
  const skipped = status === "skipped";
  const waiting = toCheck(p);
  const preview = () =>
    onPreview({
      curriculumId,
      set: s.set,
      publishedId: s.published?.id ?? null,
      assignmentId: s.assignmentId,
    });
  // Nobody is on the roster (or nobody had joined when this was handed in).
  const outOf = p ? Math.max(students, p.submitted) : 0;
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5 py-3 text-sm">
      <StatusMark
        status={hasClass || !s.published ? status : "upNext"}
        label={false}
        className="mt-0.5"
      />
      <div className={cn("min-w-0 flex-1 basis-64 space-y-1", skipped && "opacity-60")}>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 break-words">
          <span className="font-mono text-xs font-semibold text-muted-foreground">{s.set.key}</span>
          {s.assignmentId ? (
            <Link
              href={assignmentHref(s.assignmentId)}
              className="font-medium hover:text-primary hover:underline"
            >
              {title}
            </Link>
          ) : (
            // Not assigned yet: the title opens the preview, so the row needs no Preview button.
            <button
              type="button"
              onClick={preview}
              className={cn(
                "text-left font-medium hover:text-primary hover:underline",
                skipped && "line-through decoration-muted-foreground/60",
              )}
            >
              {title}
            </button>
          )}
          <TopicChips topics={s.set.topics} course={course} />
          {hasClass && (
            <span className={cn("text-xs font-medium", SET_TONE[status])}>{SET_LABEL[status]}</span>
          )}
        </p>
        <p className="break-words text-[13px] leading-snug text-muted-foreground">
          {s.set.description}
          {profile && (
            <span className="whitespace-nowrap">
              {" "}
              · {profile.count} · about {profile.minutes} min
            </span>
          )}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {s.assigned ? (
              actions.onChangeDue ? (
                <DueDateChip due={s.dueDate} onChange={(d) => actions.onChangeDue!(s, d)} />
              ) : (
                <>Assigned{s.dueDate ? ` · due ${shortDate(s.dueDate)}` : ""}</>
              )
            ) : s.skipped ? null : !s.published ? (
              AVAILABILITY_LABEL[s.availability]
            ) : hasClass ? (
              s.archivedId ? (
                "Archived · assign to restore it"
              ) : null
            ) : (
              "Ready to assign"
            )}
          </span>
          {canAssign && (
            <Button size="sm" variant="outline" onClick={() => actions.onAssignSet!(s)}>
              <Plus aria-hidden /> {s.archivedId ? "Restore" : "Assign"}
            </Button>
          )}
          {s.assignmentId ? (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link href={assignmentHref(s.assignmentId)}>
                  {status === "needsYou" ? "Review" : "Results"} <ChevronRight aria-hidden />
                </Link>
              </Button>
              {actions.onCopyChanged ? (
                <AssignmentActionsMenu
                  id={s.assignmentId}
                  title={title}
                  hideOpen
                  onChanged={actions.onCopyChanged}
                  extraItems={
                    <>
                      <DropdownMenuItem onSelect={preview}>
                        <Eye /> Preview
                      </DropdownMenuItem>
                      {actions.onToggleSkip && (
                        <DropdownMenuItem onSelect={() => actions.onToggleSkip!(s)}>
                          <EyeOff /> Skip and unassign
                        </DropdownMenuItem>
                      )}
                    </>
                  }
                />
              ) : (
                <Button variant="outline" size="sm" onClick={preview}>
                  <Eye aria-hidden /> Preview
                </Button>
              )}
            </>
          ) : s.skipped && actions.onToggleSkip ? (
            // A skipped set has one thing to do: bring it back.
            <Button variant="outline" size="sm" onClick={() => actions.onToggleSkip!(s)}>
              Unskip
            </Button>
          ) : actions.onToggleSkip ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${s.set.key}`}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onSelect={preview}>
                  <Eye /> Preview
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => actions.onToggleSkip!(s)}>
                  <EyeOff /> Skip for this class
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button variant="outline" size="sm" onClick={preview}>
              <Eye aria-hidden /> Preview
            </Button>
          )}
        </div>
        {s.assigned && p && (
          <span className="text-xs text-muted-foreground">
            {outOf === 0 ? "No students yet" : `${p.submitted} of ${outOf} submitted`}
            {p.averageScore !== null ? ` · average ${p.averageScore}%` : ""}
            {waiting > 0 && (
              <span className="font-medium text-amber-700 dark:text-amber-400">
                {" "}
                · {waiting} to check
              </span>
            )}
            {p.overdue > 0 && (
              <span className="font-medium text-destructive"> · {p.overdue} overdue</span>
            )}
          </span>
        )}
      </div>
    </li>
  );
}

export function RoadmapTab({
  curriculum,
  roadmap,
  className,
  progress,
  nextUnitNumber,
  planned,
  busy,
  onAssign,
  onPreview,
  actions,
}: {
  curriculum: Curriculum;
  roadmap: RoadmapUnit[];
  /** The chosen class's name, or null when the teacher has no class. */
  className: string | null;
  progress: ClassProgress | null;
  nextUnitNumber: number | undefined;
  /** Where the pacing guide puts each set that is not assigned yet, by set key. */
  planned?: Map<string, Date>;
  busy: boolean;
  onAssign: (u: RoadmapUnit) => void;
  onPreview: (t: PreviewTarget) => void;
  actions?: SetRowActions;
}) {
  const hasClass = className !== null;
  const students = progress?.students ?? 0;
  const status = setStatuses(boardColumns(roadmap, progress?.sets, students));
  const course = courseLook(curriculum.id);

  // Work out where every unit stands. "Up next" is a single unit: the first one not started yet.
  const standing = (u: RoadmapUnit): UnitState | "unstarted" => {
    const wanted = u.sets.filter((s) => !s.skipped);
    const out = u.sets.filter((s) => s.assigned);
    const finished = out.filter((s) => status.get(s.set.key) === "done").length;
    if (wanted.length === 0) return "skipped";
    if (finished === wanted.length) return "done";
    return out.length > 0 ? "progress" : "unstarted";
  };
  const firstNext = hasClass
    ? roadmap.find((u) => standing(u) === "unstarted" && u.assignable.length > 0)?.unit
    : undefined;
  const rows = roadmap.map((u) => {
    const st = standing(u);
    const state: UnitState = !hasClass
      ? "later"
      : st === "unstarted"
        ? u.unit === firstNext
          ? "next"
          : "later"
        : st;
    return {
      u,
      wanted: u.sets.filter((s) => !s.skipped),
      out: u.sets.filter((s) => s.assigned),
      state,
    };
  });
  const current = rows.find((r) => r.state === "progress") ?? rows.find((r) => r.state === "next");
  const open = String(current?.u.unit ?? nextUnitNumber ?? roadmap[0]?.unit ?? "");

  const doneUnits = rows.filter((r) => r.state === "done").length;
  const overdueSets = roadmap.reduce(
    (n, u) =>
      n + u.sets.filter((s) => s.assigned && (progress?.sets[s.set.key]?.overdue ?? 0) > 0).length,
    0,
  );
  const upNext = rows.find((r) => r.state === "next");
  const upNextWhen = upNext
    ? (() => {
        const plan = upNext.u.sets.flatMap((s) => planned?.get(s.set.key) ?? []);
        return plan.length ? dayRange(plan) : null;
      })()
    : null;

  return (
    <div className="space-y-5">
      {/* Which course this is, in its own colour. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <CourseBadge
          curriculumId={curriculum.id}
          className="size-12 rounded-2xl"
          iconClassName="size-7"
        />
        <div className="min-w-0 flex-1 basis-64">
          <h2 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xl font-semibold tracking-tight">
            {curriculum.name}
            {className && (
              <span className="font-normal text-muted-foreground">
                <span aria-hidden>· </span>
                {className}
              </span>
            )}
            {course.level && (
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", course.tint)}>
                {course.level}
              </span>
            )}
          </h2>
          <p className="text-sm text-muted-foreground">
            {course.covers} <span className="whitespace-nowrap">{courseSize(curriculum)}.</span>
          </p>
        </div>
      </div>

      {/* Where the class is, before the table. */}
      {hasClass && (
        <dl className="flex flex-wrap gap-2">
          <Fact
            value={current && current.state === "progress" ? `Unit ${current.u.unit}` : "None"}
            label="in progress"
          />
          <Fact value={`${doneUnits} of ${roadmap.length}`} label="units done" />
          <Fact
            value={String(overdueSets)}
            label={overdueSets === 1 ? "set overdue" : "sets overdue"}
            warn={overdueSets > 0}
          />
          {upNext && (
            <Fact
              value={`Unit ${upNext.u.unit}`}
              label={upNextWhen ? `up next · ${upNextWhen}` : "up next"}
            />
          )}
        </dl>
      )}

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div
          className={cn(
            "border-l-[3px] border-l-transparent bg-muted/50 py-2 pl-4 pr-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground",
            "pr-[calc(1rem+1rem+0.75rem)]",
          )}
        >
          <div className={COLS}>
            <span className="text-center">#</span>
            <span>Unit</span>
            <span>{hasClass ? "Status" : ""}</span>
            <span className="hidden md:block">Dates</span>
            <span className="hidden md:block">Progress</span>
          </div>
        </div>
        <Accordion
          type="multiple"
          defaultValue={open ? [open] : []}
          // Re-open the right unit when the class changes.
          key={`${className}-${open}`}
        >
          {rows.map(({ u, wanted, out, state }) => {
            const isNext = state === "next";
            const assigned = wanted.filter((s) => s.assigned).length;
            const insight = progress?.units.find((x) => x.unit === u.unit);
            const statuses = u.sets.map((s) => status.get(s.set.key) ?? "upNext");
            const averages = u.sets
              .map((s) => (s.assigned ? progress?.sets[s.set.key]?.averageScore : null))
              .filter((n): n is number => typeof n === "number");
            const average = averages.length
              ? Math.round(averages.reduce((a, b) => a + b, 0) / averages.length)
              : null;
            const needsYou = statuses.filter((x) => x === "needsYou").length;
            const overdue = u.sets.filter(
              (s) => s.assigned && (progress?.sets[s.set.key]?.overdue ?? 0) > 0,
            ).length;
            // When the unit happens: its real due dates, or where the pacing guide puts it.
            const due = out.flatMap((s) => (s.dueDate ? [s.dueDate] : []));
            const plan = u.sets.flatMap((s) => planned?.get(s.set.key) ?? []);
            const dates =
              !hasClass || state === "skipped"
                ? null
                : due.length
                  ? dayRange(due)
                  : plan.length
                    ? dayRange(plan)
                    : null;
            const skippedSets = u.sets.length - wanted.length;
            const sub = !hasClass
              ? `${u.sets.length} sets`
              : state === "skipped"
                ? "Left out of this class's plan"
                : state === "next" || state === "later"
                  ? `${u.sets.length} sets${assigned === 0 ? " · not assigned yet" : ""}`
                  : `${assigned} of ${wanted.length} sets assigned`;
            return (
              <AccordionItem
                key={u.unit}
                value={String(u.unit)}
                className={cn(
                  "border-b-0 border-l-[3px] transition-colors [&:not(:first-child)]:border-t [&:not(:first-child)]:border-t-border",
                  UNIT_EDGE[state],
                  state === "progress" && "bg-primary/[0.04]",
                  state === "skipped" &&
                    "bg-[repeating-linear-gradient(135deg,transparent_0_7px,var(--muted)_7px_8px)]",
                )}
              >
                <AccordionTrigger className="items-center gap-3 rounded-none py-3 pl-3 pr-4 hover:bg-muted/40 hover:no-underline data-[state=open]:hover:bg-transparent">
                  <span className={COLS}>
                    <span
                      className={cn(
                        "text-center text-base font-bold tabular-nums",
                        state === "progress" || isNext ? "text-primary" : "text-muted-foreground",
                        state === "skipped" && "opacity-50",
                      )}
                    >
                      {u.unit}
                    </span>
                    <span className="min-w-0">
                      <span
                        className={cn(
                          "block break-words text-[15px] font-semibold leading-snug",
                          state === "done" && "font-medium text-muted-foreground",
                          state === "skipped" &&
                            "font-medium text-muted-foreground line-through decoration-muted-foreground/60",
                        )}
                      >
                        {u.info?.title ?? `Unit ${u.unit}`}
                      </span>
                      <span className="block text-xs font-normal text-muted-foreground">
                        {sub}
                        {skippedSets > 0 && state !== "skipped" ? ` · ${skippedSets} skipped` : ""}
                        {average !== null ? ` · avg ${average}%` : ""}
                        {overdue > 0 && (
                          <span className="font-semibold text-destructive">
                            {" "}
                            · {overdue} overdue
                          </span>
                        )}
                        {needsYou > 0 && (
                          <span className="font-semibold text-amber-700 dark:text-amber-400">
                            {" "}
                            · {needsYou} to check
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="justify-self-end md:justify-self-start">
                      {hasClass && <UnitPill state={state} />}
                    </span>
                    <span className="hidden text-xs font-normal text-muted-foreground md:block">
                      {dates ?? (state === "done" ? "" : "-")}
                    </span>
                    <span className="hidden md:block">
                      {hasClass && state !== "skipped" ? (
                        <SetSegments statuses={statuses} className="w-full" />
                      ) : null}
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="border-t border-dashed border-border bg-muted/40 px-4 pb-4 sm:pl-[3.75rem]">
                  <div className="space-y-3 pt-3">
                    {u.info?.summary && <p className="text-muted-foreground">{u.info.summary}</p>}
                    <ul className="divide-y divide-border/60">
                      {u.sets.map((s) => (
                        <SetRow
                          key={s.set.key}
                          curriculumId={curriculum.id}
                          course={curriculum.apCourse}
                          s={s}
                          status={status.get(s.set.key) ?? "upNext"}
                          hasClass={hasClass}
                          students={students}
                          progress={progress}
                          onPreview={onPreview}
                          actions={actions}
                        />
                      ))}
                    </ul>
                    {insight && insight.top.length > 0 && <MisconceptionList insight={insight} />}
                    <div className="flex flex-wrap items-center gap-2">
                      {hasClass && u.assignable.length > 0 && (
                        <Button
                          size="sm"
                          // The one obvious thing to press: the unit that is current.
                          variant={isNext || state === "progress" ? "default" : "outline"}
                          onClick={() => onAssign(u)}
                          disabled={busy}
                        >
                          <Plus aria-hidden /> Assign{" "}
                          {u.assignable.length === wanted.length ? "this unit" : "the rest"} (
                          {u.assignable.length} set{u.assignable.length === 1 ? "" : "s"})
                        </Button>
                      )}
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/teacher/courses/${curriculum.id}/${u.unit}`}>
                          Unit guide <ChevronRight aria-hidden />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </div>

      {hasClass && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          {(["done", "progress", "next", "later", "skipped"] as const).map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <UnitPill state={k} />
              {LEGEND[k]}
            </span>
          ))}
        </div>
      )}
      {hasClass && actions && (
        <p className="text-xs text-muted-foreground">
          Open a unit to preview a set, change a due date or skip it. Every change can be undone.
        </p>
      )}
    </div>
  );
}

const LEGEND: Record<UnitState, string> = {
  done: "every set finished",
  progress: "sets out, work open",
  next: "first to assign",
  later: "planned, not yet",
  skipped: "left out on purpose",
};

function Fact({ value, label, warn }: { value: string; label: string; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3.5 py-2">
      <dd className={cn("text-lg font-semibold leading-tight", warn && "text-destructive")}>
        {value}
      </dd>
      <dt className="text-xs text-muted-foreground">{label}</dt>
    </div>
  );
}
