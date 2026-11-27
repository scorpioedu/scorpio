"use client";

// Picks the course a class follows: one of the course roadmaps, or none. A class has at most one.
// Two shapes of the same choice: a dropdown for forms, and a list of rows for a dialog where the
// choice is the whole point.
import { CircleOff } from "lucide-react";
import { ClickIcon } from "@/components/ui/click-icon";
import { CheckIcon as AnimatedCheck } from "@animateicons/react/lucide/check-icon";
import { CircleOffIcon as AnimatedCircleOff } from "@animateicons/react/lucide/circle-off-icon";
import { CURRICULA, getCurriculum, hasContent } from "@/data/curricula";
import { cn } from "@/lib/utils";
import { CourseBadge, CourseIcon, courseLook, courseSize } from "@/components/teacher/course-icon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NONE = "none";

export function CourseSelect({
  id,
  value,
  onChange,
  disabled,
  className,
}: {
  id?: string;
  /** The course's id, or null for a class with no course. */
  value: string | null;
  onChange: (curriculumId: string | null) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Select
      value={value ?? NONE}
      onValueChange={(v) => onChange(v === NONE ? null : v)}
      disabled={disabled}
    >
      <SelectTrigger id={id} aria-label="Course" className={className ?? "w-full"}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>
          <CircleOff aria-hidden className="text-muted-foreground" /> No course
        </SelectItem>
        {CURRICULA.map((c) => (
          <SelectItem key={c.id} value={c.id} disabled={!hasContent(c) && c.id !== value}>
            <CourseIcon curriculumId={c.id} />
            {c.name}
            <span className="text-xs text-muted-foreground">
              {hasContent(c) ? `${courseLook(c.id).level} · ${c.sets.length} sets` : "Planned"}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const row = (on: boolean) =>
  cn(
    "flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    on
      ? "border-primary bg-primary/10"
      : "border-border hover:border-primary/60 hover:bg-accent/50",
  );

/**
 * Every course as a row with its icon, what it is and how big it is, plus "No course". The row that
 * is ticked is the choice; `current` marks the course the class follows now.
 */
export function CourseOptionList({
  value,
  current,
  onChange,
}: {
  value: string | null;
  /** The class's course before any change, to label it. */
  current: string | null;
  onChange: (curriculumId: string | null) => void;
}) {
  const options: (string | null)[] = [...CURRICULA.map((c) => c.id), null];
  return (
    <div role="radiogroup" aria-label="Course" className="space-y-2">
      {options.map((id) => {
        const c = getCurriculum(id);
        const on = value === id;
        return (
          <button
            key={id ?? NONE}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={!!c && !hasContent(c)}
            onClick={() => onChange(id)}
            className={row(on)}
          >
            {c ? (
              <CourseBadge curriculumId={c.id} />
            ) : (
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <ClickIcon icon={AnimatedCircleOff} aria-hidden className="size-5" />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-x-2 text-sm font-semibold">
                {c ? c.name : "No course"}
                {id === current && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    Current
                  </span>
                )}
              </span>
              <span className="block text-xs text-muted-foreground">
                {c
                  ? `${courseLook(c.id).level} · ${courseSize(c)}`
                  : "The class keeps its own assignments, with no roadmap."}
              </span>
            </span>
            <ClickIcon
              icon={AnimatedCheck}
              aria-hidden
              className={cn("size-5 shrink-0 text-primary", on ? "opacity-100" : "opacity-0")}
            />
          </button>
        );
      })}
    </div>
  );
}
