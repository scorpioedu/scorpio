// How units and sets look on the Courses screens (List, Calendar, unit guide), so a set has the same
// status mark wherever a teacher meets it.
// - A unit's colour (Calendar and unit guide; the List colours a unit by how far along it is): the
//   course's own tint for its first unit (see course-icon.tsx), then round a fixed wheel, so
//   neighbouring units never share a colour.
// - A set's status mark: told apart by shape as well as colour (filled, ticked, "!", hollow, dashed).
import { Check, Lock } from "lucide-react";
import { apTopic, type ApCourseId } from "@/data/ap";
import { curriculumUnits } from "@/data/curricula";
import type { SetStatus } from "@/lib/course-board";
import { cn } from "@/lib/utils";

export interface UnitLook {
  /** The number tile: tinted background with matching text. */
  tile: string;
  /** Text in the unit's colour. */
  text: string;
  /** A solid fill (progress segments, legend dots). */
  solid: string;
  /** The rail beside a unit's sets, and other hairlines in the unit's colour. */
  line: string;
  /** A quiet tinted surface (a week's band on the calendar, a hero). */
  wash: string;
  /** A set on the calendar that is out with students: tinted, bordered. */
  chip: string;
  /** A set that is only planned: dashed outline in the unit's colour. */
  chipPlanned: string;
}

// Written out in full so Tailwind sees every class.
const WHEEL: UnitLook[] = [
  {
    tile: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    text: "text-sky-700 dark:text-sky-300",
    solid: "bg-sky-500",
    line: "border-sky-500/40",
    wash: "bg-sky-500/10",
    chip: "border-sky-500/50 bg-sky-500/15 text-sky-900 hover:border-sky-500 dark:text-sky-100",
    chipPlanned:
      "border-dashed border-sky-500/60 text-sky-800 hover:border-sky-500 dark:text-sky-200",
  },
  {
    tile: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
    text: "text-violet-700 dark:text-violet-300",
    solid: "bg-violet-500",
    line: "border-violet-500/40",
    wash: "bg-violet-500/10",
    chip: "border-violet-500/50 bg-violet-500/15 text-violet-900 hover:border-violet-500 dark:text-violet-100",
    chipPlanned:
      "border-dashed border-violet-500/60 text-violet-800 hover:border-violet-500 dark:text-violet-200",
  },
  {
    tile: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    text: "text-emerald-700 dark:text-emerald-300",
    solid: "bg-emerald-500",
    line: "border-emerald-500/40",
    wash: "bg-emerald-500/10",
    chip: "border-emerald-500/50 bg-emerald-500/15 text-emerald-900 hover:border-emerald-500 dark:text-emerald-100",
    chipPlanned:
      "border-dashed border-emerald-500/60 text-emerald-800 hover:border-emerald-500 dark:text-emerald-200",
  },
  {
    tile: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    text: "text-amber-700 dark:text-amber-300",
    solid: "bg-amber-500",
    line: "border-amber-500/40",
    wash: "bg-amber-500/10",
    chip: "border-amber-500/50 bg-amber-500/15 text-amber-900 hover:border-amber-500 dark:text-amber-100",
    chipPlanned:
      "border-dashed border-amber-500/60 text-amber-800 hover:border-amber-500 dark:text-amber-200",
  },
  {
    tile: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
    text: "text-rose-700 dark:text-rose-300",
    solid: "bg-rose-500",
    line: "border-rose-500/40",
    wash: "bg-rose-500/10",
    chip: "border-rose-500/50 bg-rose-500/15 text-rose-900 hover:border-rose-500 dark:text-rose-100",
    chipPlanned:
      "border-dashed border-rose-500/60 text-rose-800 hover:border-rose-500 dark:text-rose-200",
  },
  {
    tile: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
    text: "text-teal-700 dark:text-teal-300",
    solid: "bg-teal-500",
    line: "border-teal-500/40",
    wash: "bg-teal-500/10",
    chip: "border-teal-500/50 bg-teal-500/15 text-teal-900 hover:border-teal-500 dark:text-teal-100",
    chipPlanned:
      "border-dashed border-teal-500/60 text-teal-800 hover:border-teal-500 dark:text-teal-200",
  },
  {
    tile: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
    text: "text-indigo-700 dark:text-indigo-300",
    solid: "bg-indigo-500",
    line: "border-indigo-500/40",
    wash: "bg-indigo-500/10",
    chip: "border-indigo-500/50 bg-indigo-500/15 text-indigo-900 hover:border-indigo-500 dark:text-indigo-100",
    chipPlanned:
      "border-dashed border-indigo-500/60 text-indigo-800 hover:border-indigo-500 dark:text-indigo-200",
  },
  {
    tile: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
    text: "text-orange-700 dark:text-orange-300",
    solid: "bg-orange-500",
    line: "border-orange-500/40",
    wash: "bg-orange-500/10",
    chip: "border-orange-500/50 bg-orange-500/15 text-orange-900 hover:border-orange-500 dark:text-orange-100",
    chipPlanned:
      "border-dashed border-orange-500/60 text-orange-800 hover:border-orange-500 dark:text-orange-200",
  },
];

/** Where on the wheel a course's first unit sits: its own tint in course-icon.tsx. */
const FIRST: Record<string, number> = {
  "ap-physics-1": 0, // sky
  "ap-physics-2": 3, // amber
  "ap-physics-c-mech": 2, // emerald
};

/** The colour of one unit of a course. A unit keeps its colour when a class reorders its units. */
export function unitLook(curriculumId: string, unit: number): UnitLook {
  const units = curriculumUnits(curriculumId).filter((u) => u.sets.length > 0);
  const at = Math.max(
    0,
    units.findIndex((u) => u.unit === unit),
  );
  return WHEEL[((FIRST[curriculumId] ?? 0) + at) % WHEEL.length];
}

/**
 * The unit's number on a tile: in the unit's colour, or in `tone` (background and text classes)
 * where the tile's colour says something else, like how far along the unit is on the List.
 */
export function UnitTile({
  curriculumId,
  unit,
  tone,
  className,
}: {
  curriculumId: string;
  unit: number;
  tone?: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-2xl text-xl font-semibold tabular-nums",
        tone ?? unitLook(curriculumId, unit).tile,
        className,
      )}
    >
      {unit}
    </span>
  );
}

export const STATUS_LABEL: Record<SetStatus, string> = {
  upNext: "Not assigned",
  assigned: "Assigned",
  needsYou: "Needs you",
  done: "Done",
  skipped: "Skipped",
  unpublished: "Not published yet",
  planned: "Planned",
};

const MARK: Record<SetStatus, string> = {
  upNext: "border-2 border-muted-foreground/50 bg-background",
  assigned: "bg-primary",
  needsYou: "bg-amber-500 text-white",
  done: "bg-green-600 text-white",
  skipped: "border-2 border-dashed border-muted-foreground/50 bg-background",
  unpublished: "border border-dashed border-muted-foreground/40 bg-muted text-muted-foreground",
  planned: "border border-dashed border-muted-foreground/40 bg-muted text-muted-foreground",
};

/** A set's status as a small round mark. Pass `label` false where the status is also written out. */
export function StatusMark({
  status,
  label = true,
  className,
}: {
  status: SetStatus;
  label?: boolean;
  className?: string;
}) {
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label ? STATUS_LABEL[status] : undefined}
      aria-hidden={label ? undefined : true}
      title={STATUS_LABEL[status]}
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold leading-none",
        MARK[status],
        className,
      )}
    >
      {status === "done" && <Check className="size-3" strokeWidth={3} aria-hidden />}
      {status === "needsYou" && "!"}
      {(status === "unpublished" || status === "planned") && (
        <Lock className="size-2.5" aria-hidden />
      )}
    </span>
  );
}

/**
 * One bar segment per set: green when the class has finished it, blue while it is out with students
 * (amber when it needs the teacher), grey when it is still to come, dashed when skipped.
 */
export function SetSegments({
  statuses,
  className,
}: {
  statuses: SetStatus[];
  className?: string;
}) {
  const out = statuses.filter((s) => s === "assigned" || s === "needsYou" || s === "done").length;
  const wanted = statuses.filter((s) => s !== "skipped").length;
  return (
    <span
      role="img"
      aria-label={`${out} of ${wanted} sets assigned`}
      className={cn("inline-flex h-2 items-stretch gap-1", className)}
    >
      {statuses.map((s, i) => (
        <span
          key={i}
          className={cn(
            "min-w-3 flex-1 rounded-full",
            s === "needsYou"
              ? "bg-amber-500"
              : s === "done"
                ? "bg-green-500"
                : s === "assigned"
                  ? "bg-primary/60"
                  : s === "skipped"
                    ? "border border-dashed border-muted-foreground/50"
                    : "bg-muted-foreground/25",
          )}
        />
      ))}
    </span>
  );
}

/** A set's AP topics as small chips: the number, and the topic's name on hover (or written out). */
export function TopicChips({
  topics,
  course,
  titles = false,
  className,
}: {
  topics: readonly string[];
  course: ApCourseId;
  /** Write each topic's name beside its number. */
  titles?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {topics.map((id) => {
        const title = apTopic(id, course)?.title;
        return (
          <span
            key={id}
            title={titles ? undefined : title ? `${id} ${title}` : id}
            className="inline-flex items-baseline gap-1 rounded-full border border-border px-1.5 py-px text-[11px] leading-4 text-muted-foreground"
          >
            <span className="font-medium tabular-nums text-foreground/80">{id}</span>
            {titles ? title : <span className="sr-only">{title}</span>}
          </span>
        );
      })}
    </span>
  );
}
