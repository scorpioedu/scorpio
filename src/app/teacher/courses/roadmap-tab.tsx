"use client";

// The List: the class's course as a roadmap. A unit is a section with its number on a tile whose
// colour says how far along it is (green finished, amber out with students, grey not started), a bar with one
// segment per set, and its own Assign button; its sets hang off a rail under it, each
// with a status mark (told apart by shape), its AP topics, its due date and how the class did.
import Link from "next/link";
import { ChevronRight, Eye, EyeOff, MoreHorizontal, Plus } from "lucide-react";
import type { ApCourseId } from "@/data/ap";
import type { Curriculum } from "@/data/curricula";
import { setProfile } from "@/data/curricula/profiles";
import { boardColumns, setStatuses, toCheck, type SetStatus } from "@/lib/course-board";
import { AVAILABILITY_LABEL, type RoadmapSet, type RoadmapUnit } from "@/lib/curriculum-roadmap";
import type { UnitInsight } from "@/lib/course-progress";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
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
import { SetSegments, StatusMark, TopicChips, UnitTile } from "./unit-look";
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

type UnitTone = "done" | "started" | "plain";

/**
 * The number tile's colour says how far along the unit is: green when the class has finished every
 * set, amber while sets are out with students, grey when nothing is assigned yet.
 */
const TILE: Record<UnitTone, string> = {
  done: "bg-green-500/15 text-green-700 dark:text-green-300",
  started: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  plain: "bg-muted text-muted-foreground",
};

/** A badge for what the tile's colour does not say. */
function unitBadge(u: RoadmapUnit, isNext: boolean): string | null {
  const wanted = u.sets.filter((s) => !s.skipped);
  if (wanted.length === 0) return "Skipped";
  if (wanted.every((s) => !s.published && !s.assigned))
    return wanted.every((s) => s.availability === "planned") ? "Planned" : "Not published yet";
  return isNext ? "Next up" : null;
}

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
  const profile = setProfile(curriculumId, s.set.key);
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
    <li className="relative flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5 py-2.5 pl-7 text-sm sm:pl-8">
      {/* Sits on the rail. */}
      <StatusMark
        status={hasClass || !s.published ? status : "upNext"}
        className="absolute -left-[9px] top-3.5 ring-4 ring-background"
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
        </p>
        <p className="break-words text-[13px] leading-snug text-muted-foreground">
          {s.set.description}
          {profile && (
            <span className="whitespace-nowrap">
              {" "}
              · {profile.problems} problems · about {profile.minutes} min
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
            ) : s.skipped ? (
              "Skipped for this class"
            ) : !s.published ? (
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
                          <EyeOff /> {s.skipped ? "Stop skipping" : "Skip in this class's plan"}
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
  const open = String(
    nextUnitNumber ??
      roadmap.find((u) => u.sets.some((s) => s.assigned))?.unit ??
      roadmap[0]?.unit ??
      "",
  );
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
      {hasClass && actions && (
        <p className="text-xs text-muted-foreground">
          Click a set&apos;s name to preview it, or a due date to change it. Every change can be
          undone.
        </p>
      )}
      <Accordion
        type="multiple"
        defaultValue={open ? [open] : []}
        // Re-open the right unit when the class changes.
        key={`${className}-${open}`}
        className="space-y-3"
      >
        {roadmap.map((u) => {
          const isNext = u.unit === nextUnitNumber;
          const badge = unitBadge(u, isNext);
          const wanted = u.sets.filter((s) => !s.skipped);
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
          // Green only when the class has finished the unit; being assigned is not being done.
          const out = u.sets.filter((s) => s.assigned);
          const finished = out.filter((s) => status.get(s.set.key) === "done").length;
          const tone: UnitTone = !hasClass
            ? "plain"
            : wanted.length > 0 && finished === wanted.length
              ? "done"
              : out.length > 0
                ? "started"
                : "plain";
          // When the unit happens: its real due dates, or where the pacing guide puts it.
          const due = out.flatMap((s) => (s.dueDate ? [s.dueDate] : []));
          const plan = u.sets.flatMap((s) => planned?.get(s.set.key) ?? []);
          const when = !hasClass
            ? ""
            : tone === "done"
              ? " · finished"
              : due.length
                ? ` · due ${dayRange(due)}`
                : plan.length
                  ? ` · planned ${dayRange(plan)}`
                  : "";
          return (
            <AccordionItem
              key={u.unit}
              value={String(u.unit)}
              className={cn(
                "rounded-3xl border border-b border-transparent px-3 transition-colors last:border-b sm:px-4",
                "data-[state=open]:border-border data-[state=open]:bg-card data-[state=open]:pb-2",
                "data-[state=closed]:hover:bg-muted/40",
              )}
            >
              <AccordionTrigger className="items-center gap-3 py-3 hover:no-underline sm:gap-4">
                <UnitTile curriculumId={curriculum.id} unit={u.unit} tone={TILE[tone]} />
                <span className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-left">
                  <span className="min-w-0">
                    <span className="block break-words text-lg font-semibold leading-tight tracking-tight sm:text-xl">
                      {u.info?.title ?? `Unit ${u.unit}`}
                    </span>
                    <span className="block text-xs font-normal text-muted-foreground">
                      Unit {u.unit} ·{" "}
                      {hasClass
                        ? `${assigned} of ${wanted.length} sets assigned`
                        : `${u.sets.length} sets`}
                      {u.sets.length !== wanted.length
                        ? ` · ${u.sets.length - wanted.length} skipped`
                        : ""}
                      {when}
                      {average !== null ? ` · average ${average}%` : ""}
                      {needsYou > 0 && (
                        <span className="font-medium text-amber-700 dark:text-amber-400">
                          {" "}
                          · {needsYou} {needsYou === 1 ? "needs" : "need"} you
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    {hasClass && <SetSegments statuses={statuses} className="w-20 sm:w-24" />}
                    {/* Only what the colour does not already say. */}
                    {hasClass && badge && (
                      <Badge variant={isNext ? "default" : "secondary"}>{badge}</Badge>
                    )}
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pb-3">
                {/* Everything under the heading hangs off the unit's rail. */}
                <div className="ml-[21px] space-y-3 border-l-2 border-border">
                  <div className="space-y-3 pl-7 sm:pl-8">
                    {u.info?.summary && <p className="text-muted-foreground">{u.info.summary}</p>}
                    <div className="flex flex-wrap items-center gap-2">
                      {hasClass && u.assignable.length > 0 && (
                        <Button
                          size="sm"
                          // The unit that is up next is the one obvious thing to press.
                          variant={isNext ? "default" : "outline"}
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
                  {insight && insight.top.length > 0 && (
                    <div className="pl-7 sm:pl-8">
                      <MisconceptionList insight={insight} />
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
