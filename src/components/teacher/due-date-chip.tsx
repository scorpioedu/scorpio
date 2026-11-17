"use client";

// Click a due date to change it: a calendar in a popover, saved as soon as a day is picked.
// The time of day is kept (new dates default to 23:59). "Clear" removes the date when allowed.
import { useState } from "react";
import { CalendarDays, Loader2 } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { dueOnDay, dueState, shortDue } from "@/lib/teacher-edit";

const tone: Record<ReturnType<typeof dueState>, string> = {
  none: "text-muted-foreground",
  past: "text-muted-foreground",
  soon: "text-amber-700 dark:text-amber-400",
  later: "text-foreground",
};

export function DueDateChip({
  due,
  onChange,
  allowClear = true,
  disabled = false,
  prefix = "Due",
  className,
}: {
  due: Date | null;
  /** Save the new date (null = no due date). Throw to keep the popover open; show your own toast. */
  onChange: (next: Date | null) => Promise<void> | void;
  allowClear?: boolean;
  disabled?: boolean;
  prefix?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const state = dueState(due);

  const save = async (next: Date | null) => {
    setSaving(true);
    try {
      await onChange(next);
      setOpen(false);
    } catch {
      /* the caller reported it */
    } finally {
      setSaving(false);
    }
  };

  const label = due ? `${prefix} ${shortDue(due)}` : "No due date";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled || saving}>
        <button
          type="button"
          aria-label={due ? `${label}. Change due date` : "Set a due date"}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border border-transparent px-2 py-0.5 text-xs font-medium transition-colors hover:border-border hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
            tone[state],
            className,
          )}
        >
          {saving ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <CalendarDays className="size-3.5" />
          )}
          {label}
          {state === "past" && <span className="font-normal">· past</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={due ?? undefined}
          defaultMonth={due ?? new Date()}
          onSelect={(day) => day && save(dueOnDay(day, due))}
        />
        <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
          <span className="text-xs text-muted-foreground">
            {due
              ? `At ${due.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`
              : "Due at 11:59 PM"}
          </span>
          {allowClear && due && (
            <Button variant="ghost" size="sm" onClick={() => save(null)} disabled={saving}>
              Clear
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
