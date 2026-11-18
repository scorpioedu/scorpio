"use client";

// The Calendar view: every set of the class's course on the day it is due, a month or a week at a
// time. A set is coloured by its unit (the same colour as on the List) and each week starts with a
// band naming the unit it belongs to. Assigned sets sit on their real due date; sets still to come
// are dashed, on the date the pacing guide gives them. Days off are hatched and named once across
// the whole break; weekends are narrow. Drag an assigned set to another school day to move its due
// date, or click it and pick a date.
import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CalendarOff, ChevronLeft, ChevronRight, Eye, Plus } from "lucide-react";
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
import { boardColumns, filterBoard, plannedDates, toCheck } from "@/lib/course-board";
import {
  addDays,
  addMonths,
  calendarItems,
  calendarSpan,
  dayOffRuns,
  monthOf,
  monthWeeks,
  moveToDay,
  sameMonth,
  unitFirstDay,
  weekOf,
  weekUnits,
  type CalendarItem,
  type CalendarStatus,
} from "@/lib/course-calendar";
import type { Pacing } from "@/lib/course-pacing";
import type { RoadmapUnit } from "@/lib/curriculum-roadmap";
import { dayKey, dayOffOn, type DayOff, type SchoolDayTest } from "@/lib/school-calendar";
import { cn } from "@/lib/utils";
import { DueDateChip } from "@/components/teacher/due-date-chip";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { PreviewTarget } from "../set-preview-dialog";
import { StatusMark, unitLook } from "../unit-look";
import { shortDate, type ClassProgress } from "../use-course-data";
import { setDisplayTitle, type SetRowActions } from "../use-set-actions";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const STATUS_LABEL: Record<CalendarStatus, string> = {
  planned: "Planned",
  assigned: "Assigned",
  needsYou: "Needs you",
  done: "Done",
};
/** Sets shown on a day of the month grid before the rest fold into "+N more". */
const MONTH_MAX = 3;

/** The unit band, then Sunday to Saturday with the weekend narrow. */
const COLUMNS =
  "grid grid-cols-[4.25rem_2.5rem_repeat(5,minmax(0,1fr))_2.5rem] lg:grid-cols-[8.5rem_2.75rem_repeat(5,minmax(0,1fr))_2.75rem]";
/** A day with no school: hatched, so it never reads as an empty school day. */
const HATCH =
  "bg-[repeating-linear-gradient(135deg,var(--muted)_0,var(--muted)_5px,transparent_5px,transparent_11px)]";

const chipBase =
  "flex w-full min-w-0 items-center gap-1 rounded-lg border px-1.5 py-1 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type Mode = "month" | "week";

interface ChipContext {
  curriculumId: string;
  unitTitle: (unit: number) => string;
  students: number;
  busy: boolean;
  onPreview: (t: PreviewTarget) => void;
  actions: SetRowActions;
}

/** "Nov 15 – 21, 2026", or "Nov 29 – Dec 5, 2026" when the week crosses into another month. */
function weekHeading(first: Date, last: Date): string {
  const short = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const end = first.getMonth() === last.getMonth() ? String(last.getDate()) : short(last);
  return `${short(first)} – ${end}, ${last.getFullYear()}`;
}

/** "Thu, Nov 26 – Fri, Nov 27" for a break in the phone's list. */
function dayOffDates(off: DayOff): string {
  const day = (iso: string) => shortDate(new Date(`${iso}T12:00:00`));
  return off.start === off.end ? day(off.start) : `${day(off.start)} – ${day(off.end)}`;
}

const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;
const sameDay = (a: Date, b: Date) => dayKey(a) === dayKey(b);

/** The chip's colours: its unit's, dashed while the set is only planned. */
function chipLook(item: CalendarItem, ctx: ChipContext) {
  const look = unitLook(ctx.curriculumId, item.unit);
  return item.status === "planned" ? look.chipPlanned : look.chip;
}

/** A few words on the Week view's cards about where the set stands. */
function shortStanding(item: CalendarItem, students: number): string {
  if (item.status === "planned") return "Planned";
  const p = item.progress;
  if (!p) return "Assigned";
  const handedIn = `${p.submitted} of ${Math.max(students, p.submitted)} in`;
  if (item.status === "needsYou") return `${handedIn} · ${toCheck(p)} to check`;
  if (p.averageScore !== null) return `${handedIn} · ${p.averageScore}%`;
  return p.overdue ? `${handedIn} · ${p.overdue} overdue` : handedIn;
}

function ChipFace({
  item,
  ctx,
  roomy,
}: {
  item: CalendarItem;
  ctx: ChipContext;
  /** The Week view: the whole title and a line on where the set stands. */
  roomy?: boolean;
}) {
  const mark = (item.status === "needsYou" || item.status === "done") && (
    <StatusMark status={item.status} label={false} className="size-3.5" />
  );
  if (!roomy)
    return (
      <>
        {mark}
        <span className="shrink-0 font-semibold tabular-nums">{item.key}</span>
        <span className="truncate">{setDisplayTitle(ctx.curriculumId, item.s)}</span>
      </>
    );
  return (
    <span className="min-w-0 space-y-0.5">
      <span className="flex items-center gap-1 font-semibold tabular-nums">
        {mark} {item.key}
      </span>
      <span className="block break-words text-[13px] font-medium leading-snug">
        {setDisplayTitle(ctx.curriculumId, item.s)}
      </span>
      <span className="block text-[11px] opacity-80">{shortStanding(item, ctx.students)}</span>
    </span>
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
function SetChip({ item, ctx, roomy }: { item: CalendarItem; ctx: ChipContext; roomy?: boolean }) {
  const [open, setOpen] = useState(false);
  const movable = item.status !== "planned" && !!item.s.assignmentId && !!ctx.actions.onChangeDue;
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: item.key,
    disabled: !movable || ctx.busy,
  });
  const title = setDisplayTitle(ctx.curriculumId, item.s);
  const look = unitLook(ctx.curriculumId, item.unit);
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
          aria-label={`${item.key} ${title}. Unit ${item.unit}. ${STATUS_LABEL[item.status]}, ${item.status === "planned" ? "planned for" : "due"} ${shortDate(item.due)}`}
          className={cn(
            chipBase,
            roomy && "items-start px-2 py-1.5",
            chipLook(item, ctx),
            movable && "touch-manipulation cursor-grab active:cursor-grabbing",
            isDragging && "opacity-40",
          )}
          {...listeners}
        >
          <ChipFace item={item} ctx={ctx} roomy={roomy} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3 text-sm">
        <div className="space-y-1">
          <p className={cn("text-[11px] font-semibold uppercase", look.text)}>
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

/** The sets that do not fit on a day: a small button that lists them. */
function DayMore({
  day,
  items,
  ctx,
  count,
}: {
  day: Date;
  items: CalendarItem[];
  ctx: ChipContext;
  /** A narrow weekend day: only the number of sets. */
  count?: boolean;
}) {
  const needsYou = items.some((i) => i.status === "needsYou");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${items.length} ${count ? "" : "more "}${items.length === 1 ? "set" : "sets"} on ${shortDate(day)}`}
          className={cn(
            "rounded-lg text-xs font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            count
              ? "mx-auto inline-flex size-6 items-center justify-center rounded-full border border-border bg-background tabular-nums"
              : "px-1.5 py-0.5 text-left text-muted-foreground hover:text-foreground",
            count && needsYou && "border-amber-500 text-amber-700 dark:text-amber-300",
          )}
        >
          {count ? items.length : `+${items.length} more`}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-2">
        <p className="text-xs font-medium text-muted-foreground">{shortDate(day)}</p>
        {items.map((item) => (
          <SetChip key={item.key} item={item} ctx={ctx} />
        ))}
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
  tall,
  children,
}: {
  day: Date;
  /** False for the neighbouring months' days that fill a month's first and last week. */
  inMonth: boolean;
  today: boolean;
  off: DayOff | undefined;
  schoolDay: boolean;
  /** A set is being dragged, so school days light up as places to drop. */
  dropping: boolean;
  /** The Week view's taller days. */
  tall: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dayKey(day) });
  const weekend = isWeekend(day);
  return (
    <div
      ref={setNodeRef}
      role="gridcell"
      aria-label={`${day.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}${today ? ", today" : ""}${off ? `, ${off.label}, no school` : ""}`}
      className={cn(
        "relative flex min-w-0 flex-col gap-1 border-l border-border p-1.5 transition-colors",
        tall ? "min-h-72" : "min-h-28",
        weekend && "items-center px-0.5",
        off ? HATCH : weekend && "bg-muted/50",
        !inMonth && "opacity-50",
        today && "bg-primary/5 ring-2 ring-inset ring-primary",
        dropping && isOver && (schoolDay ? "bg-primary/15" : "bg-destructive/10"),
      )}
    >
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs tabular-nums",
            today
              ? "bg-primary font-semibold text-primary-foreground"
              : weekend || off
                ? "text-muted-foreground"
                : "font-medium text-foreground/80",
          )}
        >
          {day.getDate()}
        </span>
        {today && !weekend && <span className="text-[11px] font-semibold text-primary">Today</span>}
      </div>
      {children}
    </div>
  );
}

/** The unit (or units) a week belongs to, at the start of its row. */
function UnitBand({
  units,
  ctx,
  onPick,
}: {
  units: number[];
  ctx: ChipContext;
  onPick: (unit: number) => void;
}) {
  return (
    <div role="rowheader" className="flex min-w-0 flex-col gap-1 p-1.5">
      {units.map((n) => {
        const look = unitLook(ctx.curriculumId, n);
        return (
          <button
            key={n}
            type="button"
            title={`Unit ${n}: ${ctx.unitTitle(n)}. Show only this unit.`}
            onClick={() => onPick(n)}
            className={cn(
              "flex min-w-0 flex-1 flex-col items-start justify-start gap-0.5 rounded-xl px-2 py-1.5 text-left transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              look.tile,
            )}
          >
            <span className="text-[11px] font-semibold uppercase leading-none opacity-80">
              Unit
            </span>
            <span className="text-lg font-semibold leading-none tabular-nums">{n}</span>
            <span className="hidden w-full break-words text-[11px] font-medium leading-tight lg:line-clamp-2">
              {ctx.unitTitle(n)}
            </span>
          </button>
        );
      })}
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
  onUnit,
  loaded,
  busy,
  onPreview,
  actions,
}: {
  curriculum: Curriculum;
  roadmap: RoadmapUnit[];
  /** Null while the class's progress is loading. */
  progress: ClassProgress | null;
  pacing: Pacing;
  /** The class's days off, to hatch and name them. */
  daysOff: readonly DayOff[];
  isSchoolDay: SchoolDayTest;
  /** The unit the calendar is narrowed to (?unit=, chosen beside the view switch), or null. */
  unit: number | null;
  /** Narrow the calendar to one unit (a week's band was pressed). */
  onUnit: (unit: number | null) => void;
  /** The class's assignments have arrived, so sets are on their real due dates. */
  loaded: boolean;
  busy: boolean;
  onPreview: (t: PreviewTarget) => void;
  actions: SetRowActions;
}) {
  const [now] = useState(() => new Date());
  const [mode, setMode] = useState<Mode>("month");
  /** A day in the month or week on screen. */
  const [cursor, setCursor] = useState<Date>(now);
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
  const units = useMemo(
    () => roadmap.map((u) => ({ unit: u.unit, title: u.info?.title ?? "" })),
    [roadmap],
  );
  const shownUnit = units.some((u) => u.unit === unit) ? unit : null;
  const planned = useMemo(() => plannedDates(pacing), [pacing]);
  /** Every unit's sets: the legend and jumping to a unit do not depend on the filter. */
  const everything = useMemo(() => calendarItems(all, planned), [all, planned]);
  const items = useMemo(
    () => (shownUnit === null ? everything : calendarItems(filterBoard(all, shownUnit), planned)),
    [everything, all, shownUnit, planned],
  );
  // Choosing a unit (beside the view switch, or on a week's band) brings its first set into view.
  const [jumpedTo, setJumpedTo] = useState<number | null>(null);
  if (jumpedTo !== shownUnit && loaded) {
    setJumpedTo(shownUnit);
    const first = shownUnit === null ? null : unitFirstDay(everything, shownUnit);
    if (first) setCursor(first);
  }

  const span = useMemo(() => calendarSpan(items), [items]);
  const month = monthOf(cursor);
  const weeks = useMemo(
    () => (mode === "month" ? monthWeeks(monthOf(cursor)) : [weekOf(cursor)]),
    [mode, cursor],
  );
  const bands = useMemo(() => weekUnits(weeks, items, isSchoolDay), [weeks, items, isSchoolDay]);
  const ctx: ChipContext = {
    curriculumId: curriculum.id,
    unitTitle: (n) => units.find((u) => u.unit === n)?.title ?? "",
    students,
    busy,
    onPreview,
    actions,
  };

  const first = weeks[0][0];
  const last = weeks[weeks.length - 1][6];
  const heading =
    mode === "month"
      ? new Date(month.year, month.month, 1).toLocaleDateString(undefined, {
          month: "long",
          year: "numeric",
        })
      : weekHeading(first, last);
  const shown = (d: Date) => mode === "week" || sameMonth(monthOf(d), month);
  // Days on screen that have sets, for the count and the phone's list.
  const busyDays = weeks.flat().filter((d) => shown(d) && items.byDay.has(dayKey(d)));
  const setCount = busyDays.reduce((n, d) => n + items.byDay.get(dayKey(d))!.length, 0);
  // Days off on screen, each break once, for the phone's list.
  const breaks = [
    ...new Set(
      weeks
        .flat()
        .filter(shown)
        .map((d) => dayOffOn(d, daysOff))
        .filter((r): r is DayOff => !!r),
    ),
  ];
  const agenda = [
    ...busyDays.map((day) => ({ at: dayKey(day), day, off: undefined as DayOff | undefined })),
    ...breaks.map((off) => ({
      at: off.start < dayKey(first) ? dayKey(first) : off.start,
      day: undefined as Date | undefined,
      off,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at) || (a.off ? -1 : 1));
  const onNow = weeks.some((w) => w.some((d) => sameDay(d, now) && shown(d)));
  const legend = units.filter((u) => unitFirstDay(everything, u.unit));

  const step = (by: -1 | 1) =>
    setCursor((c) => {
      if (mode === "week") return addDays(c, by * 7);
      const m = addMonths(monthOf(c), by);
      return new Date(m.year, m.month, 1, 12);
    });

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
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={mode === "month" ? "Previous month" : "Previous week"}
            onClick={() => step(-1)}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={mode === "month" ? "Next month" : "Next week"}
            onClick={() => step(1)}
          >
            <ChevronRight />
          </Button>
          <h2 aria-live="polite" className="ml-2 text-lg font-semibold">
            {heading}
          </h2>
          <span className="ml-2 text-xs text-muted-foreground">
            {setCount} {setCount === 1 ? "set" : "sets"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!onNow && (
            <Button variant="outline" size="sm" onClick={() => setCursor(now)}>
              Today
            </Button>
          )}
          {span && mode === "month" && !sameMonth(month, span.last) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCursor(new Date(span.last.year, span.last.month, 1, 12))}
            >
              Last set
            </Button>
          )}
          <div
            role="group"
            aria-label="Calendar range"
            className="inline-flex rounded-full border border-border bg-muted/40 p-0.5"
          >
            {(["month", "week"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs capitalize transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                  mode === m
                    ? "bg-background font-medium text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m}
              </button>
            ))}
          </div>
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
        {/* Desktop and tablet: the grid. */}
        <div
          role="grid"
          aria-label={heading}
          className="hidden overflow-hidden rounded-3xl border border-border bg-card md:block"
        >
          <div role="row" className={cn(COLUMNS, "border-b border-border bg-muted/30")}>
            <div
              role="columnheader"
              className="px-2 py-2 text-xs font-medium text-muted-foreground"
            >
              Unit
            </div>
            {WEEKDAYS.map((d, i) => (
              <div
                key={d}
                role="columnheader"
                aria-label={d}
                className={cn(
                  "border-l border-border py-2 text-xs font-medium text-muted-foreground",
                  i === 0 || i === 6 ? "text-center" : "px-2",
                )}
              >
                {i === 0 || i === 6 ? d[0] : d}
              </div>
            ))}
          </div>
          {weeks.map((week, w) => (
            <div
              key={dayKey(week[0])}
              role="row"
              className={cn(COLUMNS, "relative border-b border-border last:border-b-0")}
            >
              <UnitBand units={bands[w]} ctx={ctx} onPick={onUnit} />
              {week.map((day) => {
                const list = items.byDay.get(dayKey(day)) ?? [];
                const max = isWeekend(day) ? 0 : mode === "week" ? list.length : MONTH_MAX;
                // "+1 more" takes a chip's room, so a day one over its limit shows them all.
                const visible = list.length <= max + (max ? 1 : 0) ? list : list.slice(0, max);
                const rest = list.slice(visible.length);
                return (
                  <DayCell
                    key={dayKey(day)}
                    day={day}
                    inMonth={shown(day)}
                    today={sameDay(day, now)}
                    off={dayOffOn(day, daysOff)}
                    schoolDay={isSchoolDay(day)}
                    dropping={dragging !== null}
                    tall={mode === "week"}
                  >
                    {visible.map((item) => (
                      <SetChip key={item.key} item={item} ctx={ctx} roomy={mode === "week"} />
                    ))}
                    {rest.length > 0 && (
                      <DayMore day={day} items={rest} ctx={ctx} count={isWeekend(day)} />
                    )}
                  </DayCell>
                );
              })}
              {/* A break is named once, across all of its days in the week. */}
              <div aria-hidden className={cn(COLUMNS, "pointer-events-none absolute inset-0")}>
                {dayOffRuns(week, daysOff).map((run) => {
                  const days = week.slice(run.from, run.to + 1);
                  // Only the weekend's narrow column: there is room for the icon alone.
                  const narrow = days.every(isWeekend);
                  // A set due on a day off keeps the top of the day; the name moves to the bottom.
                  const crowded = days.some((d) => items.byDay.has(dayKey(d)));
                  return (
                    <div
                      key={run.from}
                      style={{ gridColumn: `${run.from + 2} / ${run.to + 3}`, gridRow: 1 }}
                      className={cn(
                        "flex min-w-0 justify-center px-1.5 pb-2 pt-8",
                        crowded ? "items-end" : "items-center",
                      )}
                    >
                      <span
                        title={`${run.label}: no school`}
                        className={cn(
                          "flex min-w-0 max-w-full items-center gap-2 rounded-2xl border border-border bg-background/95 shadow-sm",
                          narrow ? "p-1" : "px-2.5 py-1.5",
                        )}
                      >
                        <CalendarOff
                          className={cn(
                            "shrink-0 text-muted-foreground",
                            mode === "week" && !narrow ? "size-5" : "size-4",
                          )}
                        />
                        {!narrow && (
                          <span className="min-w-0 leading-tight">
                            <span
                              className={cn(
                                "block truncate font-semibold",
                                mode === "week" ? "text-sm" : "text-xs",
                              )}
                            >
                              {run.label}
                            </span>
                            <span className="block truncate text-[11px] text-muted-foreground">
                              No school
                              {days.length > 1
                                ? ` · ${shortDate(days[0])} – ${shortDate(days[days.length - 1])}`
                                : ""}
                            </span>
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <DragOverlay>
          {dragging && (
            <div
              className={cn(
                chipBase,
                chipLook(dragging, ctx),
                "w-40 cursor-grabbing bg-card shadow-xl ring-2 ring-primary",
              )}
            >
              <ChipFace item={dragging} ctx={ctx} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Phone: the same month or week as a list of the days that have sets, and the days off. */}
      <div className="space-y-3 md:hidden">
        {agenda.length === 0 ? (
          <p className="rounded-2xl border border-border px-4 py-6 text-center text-sm text-muted-foreground">
            Nothing is due in {mode === "month" ? heading : "this week"}.
          </p>
        ) : (
          agenda.map(({ at, day, off }) =>
            off ? (
              <p
                key={`off-${off.start}`}
                className={cn(
                  "flex items-center gap-2 rounded-2xl border border-border px-3 py-2.5 text-sm",
                  HATCH,
                )}
              >
                <CalendarOff className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0">
                  <span className="font-medium">{off.label}</span>{" "}
                  <span className="text-muted-foreground">· no school · {dayOffDates(off)}</span>
                </span>
              </p>
            ) : (
              <section
                key={at}
                className={cn(
                  "space-y-1.5 rounded-2xl border border-border bg-card p-3",
                  sameDay(day!, now) && "border-primary ring-1 ring-primary",
                )}
              >
                <h3 className="text-xs font-medium text-muted-foreground">
                  {shortDate(day!)}
                  {sameDay(day!, now) && (
                    <span className="font-semibold text-primary"> · today</span>
                  )}
                </h3>
                {items.byDay.get(at)!.map((item) => (
                  <SetChip key={item.key} item={item} ctx={ctx} />
                ))}
              </section>
            ),
          )
        )}
      </div>

      {/* The units, in their colours: press one to go to its first set. */}
      {legend.length > 0 && (
        <div
          role="group"
          aria-label="Jump to a unit"
          className="flex flex-wrap items-center gap-1.5 text-xs"
        >
          <span className="mr-1 font-medium text-muted-foreground">Jump to</span>
          {legend.map((u) => {
            const look = unitLook(curriculum.id, u.unit);
            return (
              <button
                key={u.unit}
                type="button"
                onClick={() => setCursor(unitFirstDay(everything, u.unit)!)}
                className={cn(
                  "inline-flex max-w-full items-center gap-1.5 rounded-full border border-border py-0.5 pl-1 pr-2.5 transition-colors hover:border-primary/60 focus-visible:outline-2 focus-visible:outline-ring",
                  shownUnit !== null && shownUnit !== u.unit && "opacity-50",
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 font-semibold tabular-nums",
                    look.tile,
                  )}
                >
                  {u.unit}
                </span>
                <span className="truncate">{u.title}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-3 w-5 rounded border border-dashed border-muted-foreground"
            aria-hidden
          />
          Planned
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-3 w-5 rounded border border-muted-foreground/60 bg-muted-foreground/25"
            aria-hidden
          />
          Assigned
        </span>
        <span className="inline-flex items-center gap-1.5">
          <StatusMark status="needsYou" label={false} className="size-3.5" /> Needs you
        </span>
        <span className="inline-flex items-center gap-1.5">
          <StatusMark status="done" label={false} className="size-3.5" /> Done
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("h-3 w-5 rounded border border-border", HATCH)} aria-hidden /> No
          school
        </span>
        <span className="hidden md:inline">
          Colour is the unit. Drag an assigned set to another school day to move its due date.
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
