"use client";

// The Calendar view: a month at a time, every set of the class's course on the day it is due.
// Assigned sets sit on their real due date, coloured by where they stand on the board; sets still to
// come are dashed, on the date the pacing guide gives them. Days off are shaded and named.
// Drag an assigned set to another school day to move its due date, or click it and pick a date.
import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Eye, Plus } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import type { Curriculum } from "@/data/curricula";
import { assignmentHref } from "@/lib/assignment-actions";
import { boardColumns, boardStats, filterBoard, plannedDates, toCheck } from "@/lib/course-board";
import {
  addMonths,
  calendarItems,
  calendarSpan,
  monthOf,
  monthWeeks,
  moveToDay,
  sameMonth,
  type CalendarItem,
  type CalendarStatus,
  type Month,
} from "@/lib/course-calendar";
import type { Pacing } from "@/lib/course-pacing";
import type { RoadmapUnit } from "@/lib/curriculum-roadmap";
import { dayKey, dayOffOn, type DayOff, type SchoolDayTest } from "@/lib/school-calendar";
import { cn } from "@/lib/utils";
import { DueDateChip } from "@/components/teacher/due-date-chip";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BoardStats } from "../board/board-stats";
import type { PreviewTarget } from "../set-preview-dialog";
import { shortDate, type ClassProgress } from "../use-course-data";
import { setDisplayTitle, type SetRowActions } from "../use-set-actions";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const STATUS: Record<CalendarStatus, { label: string; chip: string; dot: string }> = {
  planned: {
    label: "Planned",
    chip: "border-dashed border-border text-muted-foreground hover:border-primary/60",
    dot: "border border-dashed border-muted-foreground",
  },
  assigned: {
    label: "Assigned",
    chip: "border-primary/40 bg-primary/10 text-foreground hover:border-primary",
    dot: "bg-primary",
  },
  needsYou: {
    label: "Needs you",
    chip: "border-amber-500/50 bg-amber-500/15 text-amber-800 hover:border-amber-500 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  done: {
    label: "Done",
    chip: "border-green-500/40 bg-green-500/10 text-green-800 hover:border-green-500 dark:text-green-300",
    dot: "bg-green-500",
  },
};

const chipBase =
  "flex w-full min-w-0 items-baseline gap-1 rounded-lg border px-1.5 py-1 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface ChipContext {
  curriculumId: string;
  unitTitle: (unit: number) => string;
  students: number;
  busy: boolean;
  onPreview: (t: PreviewTarget) => void;
  actions: SetRowActions;
}

function ChipFace({ item, ctx }: { item: CalendarItem; ctx: ChipContext }) {
  return (
    <>
      <span className="shrink-0 font-semibold tabular-nums">{item.key}</span>
      <span className="truncate">{setDisplayTitle(ctx.curriculumId, item.s)}</span>
    </>
  );
}

/** What the popover says about where the set stands. */
function standing(item: CalendarItem, students: number): string {
  if (item.status === "planned")
    return "Not assigned yet. This is where it lands at the current pace.";
  const p = item.progress;
  if (!p) return "Assigned.";
  const handedIn = `${p.submitted} of ${Math.max(students, p.submitted)} handed in`;
  if (item.status === "needsYou")
    return `${handedIn} · ${toCheck(p)} ${toCheck(p) === 1 ? "answer" : "answers"} to check`;
  if (item.status === "done")
    return p.averageScore === null ? handedIn : `${handedIn} · average ${p.averageScore}%`;
  return p.overdue ? `${handedIn} · ${p.overdue} overdue` : handedIn;
}

/** One set on a day. Click for details and actions; an assigned one can be dragged to another day. */
function SetChip({ item, ctx }: { item: CalendarItem; ctx: ChipContext }) {
  const [open, setOpen] = useState(false);
  const movable = item.status !== "planned" && !!item.s.assignmentId && !!ctx.actions.onChangeDue;
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: item.key,
    disabled: !movable || ctx.busy,
  });
  const title = setDisplayTitle(ctx.curriculumId, item.s);
  const preview = () => {
    setOpen(false);
    ctx.onPreview({
      curriculumId: ctx.curriculumId,
      set: item.s.set,
      publishedId: item.s.published?.id ?? null,
      assignmentId: item.s.assignmentId,
    });
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          ref={setNodeRef}
          aria-label={`${item.key} ${title}. ${STATUS[item.status].label}, ${item.status === "planned" ? "planned for" : "due"} ${shortDate(item.due)}`}
          className={cn(
            chipBase,
            STATUS[item.status].chip,
            movable && "touch-manipulation cursor-grab active:cursor-grabbing",
            isDragging && "opacity-40",
          )}
          {...listeners}
        >
          <ChipFace item={item} ctx={ctx} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3 text-sm">
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Unit {item.unit} · {ctx.unitTitle(item.unit)}
          </p>
          <p className="font-semibold leading-snug">
            {item.key} {title}
          </p>
          <p className="text-xs text-muted-foreground">{standing(item, ctx.students)}</p>
        </div>
        {item.status === "planned" ? (
          <div className="flex flex-wrap gap-2">
            {ctx.actions.onAssignSet && (
              <Button
                size="sm"
                disabled={ctx.busy}
                onClick={() => {
                  setOpen(false);
                  ctx.actions.onAssignSet!(item.s);
                }}
              >
                <Plus aria-hidden /> {item.s.archivedId ? "Restore" : "Assign"}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={preview}>
              <Eye aria-hidden /> Preview
            </Button>
          </div>
        ) : (
          <>
            {ctx.actions.onChangeDue && (
              <DueDateChip
                due={item.s.dueDate}
                className="-ml-2"
                onChange={(d) => ctx.actions.onChangeDue!(item.s, d)}
              />
            )}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" asChild>
                <Link href={assignmentHref(item.s.assignmentId!)}>
                  {item.status === "needsYou" ? "Review" : "Results"}
                </Link>
              </Button>
              <Button size="sm" variant="outline" onClick={preview}>
                <Eye aria-hidden /> Preview
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

function DayCell({
  day,
  inMonth,
  today,
  off,
  schoolDay,
  dropping,
  children,
}: {
  day: Date;
  inMonth: boolean;
  today: boolean;
  off: DayOff | undefined;
  schoolDay: boolean;
  /** A set is being dragged, so school days light up as places to drop. */
  dropping: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dayKey(day) });
  return (
    <div
      ref={setNodeRef}
      role="gridcell"
      aria-label={`${day.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}${off ? `, ${off.label}` : ""}`}
      className={cn(
        "flex min-h-28 min-w-0 flex-col gap-1 border-b border-r border-border p-1.5 transition-colors",
        !schoolDay && "bg-muted/40",
        !inMonth && "opacity-50",
        dropping && isOver && (schoolDay ? "bg-primary/15" : "bg-destructive/10"),
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span
          className={cn(
            "inline-flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
            today ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground",
          )}
        >
          {day.getDate()}
        </span>
        {off && (
          <span
            className="truncate text-[11px] text-amber-700 dark:text-amber-400"
            title={off.label}
          >
            {off.label}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

export function CourseCalendar({
  curriculum,
  roadmap,
  progress,
  pacing,
  daysOff,
  isSchoolDay,
  unit,
  busy,
  onPreview,
  actions,
}: {
  curriculum: Curriculum;
  roadmap: RoadmapUnit[];
  /** Null while the class's progress is loading. */
  progress: ClassProgress | null;
  pacing: Pacing;
  /** The class's days off, to shade and name them. */
  daysOff: readonly DayOff[];
  isSchoolDay: SchoolDayTest;
  /** The unit the calendar is narrowed to (?unit=, chosen beside the view switch), or null. */
  unit: number | null;
  busy: boolean;
  onPreview: (t: PreviewTarget) => void;
  actions: SetRowActions;
}) {
  const [now] = useState(() => new Date());
  const [month, setMonth] = useState<Month>(() => monthOf(now));
  const [dragging, setDragging] = useState<CalendarItem | null>(null);
  const sensors = useSensors(
    // A small move starts a drag, so a click still opens the set.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  );
  const students = progress?.students ?? 0;
  const all = useMemo(
    () => boardColumns(roadmap, progress?.sets, students),
    [roadmap, progress, students],
  );
  const stats = useMemo(() => boardStats(all), [all]);
  const units = useMemo(
    () => roadmap.map((u) => ({ unit: u.unit, title: u.info?.title ?? "" })),
    [roadmap],
  );
  const shownUnit = units.some((u) => u.unit === unit) ? unit : null;
  const items = useMemo(
    () => calendarItems(filterBoard(all, shownUnit), plannedDates(pacing)),
    [all, shownUnit, pacing],
  );
  const span = useMemo(() => calendarSpan(items), [items]);
  const weeks = useMemo(() => monthWeeks(month), [month]);
  const ctx: ChipContext = {
    curriculumId: curriculum.id,
    unitTitle: (n) => units.find((u) => u.unit === n)?.title ?? "",
    students,
    busy,
    onPreview,
    actions,
  };

  const monthName = new Date(month.year, month.month, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  // Days of this month that have sets, for the phone's list.
  const agenda = weeks
    .flat()
    .filter((d) => sameMonth(monthOf(d), month) && items.byDay.has(dayKey(d)));
  const inMonth = agenda.reduce((n, d) => n + items.byDay.get(dayKey(d))!.length, 0);

  const drop = ({ active, over }: DragEndEvent) => {
    const item = dragging;
    setDragging(null);
    if (!item || !over || busy || String(active.id) !== item.key) return;
    const [y, m, d] = String(over.id).split("-").map(Number);
    const day = new Date(y, m - 1, d, 12);
    const move = moveToDay(item, day, isSchoolDay);
    if (move.ok) void actions.onChangeDue?.(item.s, move.due)?.catch(() => undefined);
    else if (move.reason === "off")
      toast.info(
        `${shortDate(day)} is not a school day${dayOffOn(day, daysOff) ? ` (${dayOffOn(day, daysOff)!.label})` : ""}. Drop it on a school day, or click the set to pick any date.`,
      );
  };

  return (
    <div className="space-y-4">
      <BoardStats
        stats={stats}
        finish={pacing.finish}
        remaining={pacing.remaining}
        loading={progress === null}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Previous month"
            onClick={() => setMonth((m) => addMonths(m, -1))}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Next month"
            onClick={() => setMonth((m) => addMonths(m, 1))}
          >
            <ChevronRight />
          </Button>
          <h2 aria-live="polite" className="ml-2 text-lg font-semibold">
            {monthName}
          </h2>
          <span className="ml-2 text-xs text-muted-foreground">
            {inMonth} {inMonth === 1 ? "set" : "sets"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!sameMonth(month, monthOf(now)) && (
            <Button variant="outline" size="sm" onClick={() => setMonth(monthOf(now))}>
              Today
            </Button>
          )}
          {span && !sameMonth(month, span.last) && !sameMonth(span.last, monthOf(now)) && (
            <Button variant="ghost" size="sm" onClick={() => setMonth(span.last)}>
              Last set
            </Button>
          )}
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={({ active }) =>
          setDragging(
            [...items.byDay.values()].flat().find((i) => i.key === String(active.id)) ?? null,
          )
        }
        onDragEnd={drop}
        onDragCancel={() => setDragging(null)}
      >
        {/* Desktop and tablet: the month grid. */}
        <div
          role="grid"
          aria-label={monthName}
          className="hidden overflow-hidden rounded-3xl border border-border bg-card md:block"
        >
          <div role="row" className="grid grid-cols-7 border-b border-border bg-muted/30">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                role="columnheader"
                className="px-2 py-2 text-xs font-medium text-muted-foreground"
              >
                {d}
              </div>
            ))}
          </div>
          {weeks.map((week) => (
            <div
              key={dayKey(week[0])}
              role="row"
              className="grid grid-cols-7 [&>*:last-child]:border-r-0 last:[&>*]:border-b-0"
            >
              {week.map((day) => (
                <DayCell
                  key={dayKey(day)}
                  day={day}
                  inMonth={sameMonth(monthOf(day), month)}
                  today={dayKey(day) === dayKey(now)}
                  off={dayOffOn(day, daysOff)}
                  schoolDay={isSchoolDay(day)}
                  dropping={dragging !== null}
                >
                  {(items.byDay.get(dayKey(day)) ?? []).map((item) => (
                    <SetChip key={item.key} item={item} ctx={ctx} />
                  ))}
                </DayCell>
              ))}
            </div>
          ))}
        </div>
        <DragOverlay>
          {dragging && (
            <div
              className={cn(
                chipBase,
                STATUS[dragging.status].chip,
                "w-40 cursor-grabbing bg-card shadow-xl ring-2 ring-primary",
              )}
            >
              <ChipFace item={dragging} ctx={ctx} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Phone: the same month as a list of the days that have sets. */}
      <div className="space-y-3 md:hidden">
        {agenda.length === 0 ? (
          <p className="rounded-2xl border border-border px-4 py-6 text-center text-sm text-muted-foreground">
            Nothing is due in {monthName}.
          </p>
        ) : (
          agenda.map((day) => (
            <section
              key={dayKey(day)}
              className="space-y-1.5 rounded-2xl border border-border bg-card p-3"
            >
              <h3 className="text-xs font-medium text-muted-foreground">
                {shortDate(day)}
                {dayKey(day) === dayKey(now) ? " · today" : ""}
              </h3>
              {items.byDay.get(dayKey(day))!.map((item) => (
                <SetChip key={item.key} item={item} ctx={ctx} />
              ))}
            </section>
          ))
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {(Object.keys(STATUS) as CalendarStatus[]).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-full", STATUS[s].dot)} aria-hidden />
            {STATUS[s].label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-muted" aria-hidden /> No school
        </span>
        <span className="hidden md:inline">
          Drag an assigned set to another school day to move its due date.
        </span>
      </div>

      {items.undated.length > 0 && (
        <p className="text-sm text-muted-foreground">
          No due date:{" "}
          {items.undated.map((card, i) => (
            <span key={card.key}>
              {i > 0 && ", "}
              <Link
                href={assignmentHref(card.s.assignmentId!)}
                className="underline-offset-2 hover:text-foreground hover:underline"
              >
                {card.key} {setDisplayTitle(curriculum.id, card.s)}
              </Link>
            </span>
          ))}
          . Open one to give it a date.
        </p>
      )}
    </div>
  );
}
