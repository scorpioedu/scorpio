"use client";

// "Assign unit": shows exactly which sets will be copied into the class and when each is due,
// before anything is created.
import { useMemo, useState } from "react";
import { planAssignments, type AssignableSet, type PlannedAssignment } from "@/lib/assign-sets";
import { parseDateInput } from "@/lib/first-run";
import type { SchoolDayTest } from "@/lib/school-calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { shortDate } from "./use-course-data";

export function SpacingSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="1">Every school day</SelectItem>
        <SelectItem value="2">Every 2 school days</SelectItem>
        <SelectItem value="3">Every 3 school days</SelectItem>
        <SelectItem value="5">Once a week</SelectItem>
      </SelectContent>
    </Select>
  );
}

export function AssignDialog({
  unitLabel,
  className,
  sets,
  start,
  spacing,
  isSchoolDay,
  busy,
  onStart,
  onSpacing,
  onConfirm,
  onClose,
}: {
  unitLabel: string;
  className: string;
  /** Published, unassigned, not skipped; in roadmap order. */
  sets: AssignableSet[];
  start: string;
  spacing: string;
  isSchoolDay: SchoolDayTest;
  busy: boolean;
  onStart: (v: string) => void;
  onSpacing: (v: string) => void;
  onConfirm: (plan: PlannedAssignment[]) => void;
  onClose: () => void;
}) {
  const [none] = useState(() => new Set<string>());
  const startDate = parseDateInput(start);
  const plan = useMemo(
    () => (startDate ? planAssignments(sets, none, startDate, Number(spacing), isSchoolDay) : []),
    // startDate is derived from `start`
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sets, none, start, spacing, isSchoolDay],
  );

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="break-words">Assign {unitLabel}</DialogTitle>
          <DialogDescription>
            {sets.length} set{sets.length === 1 ? "" : "s"} will be copied into {className}. Due
            dates skip weekends and the class&apos;s days off.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="assign-start">{sets.length > 1 ? "First due date" : "Due date"}</Label>
            <Input
              id="assign-start"
              type="date"
              value={start}
              onChange={(e) => onStart(e.target.value)}
            />
          </div>
          {sets.length > 1 && (
            <div className="space-y-2">
              <Label htmlFor="assign-spacing">Then one</Label>
              <SpacingSelect id="assign-spacing" value={spacing} onChange={onSpacing} />
            </div>
          )}
        </div>
        {startDate ? (
          <ul className="divide-y divide-border rounded-xl border border-border text-sm">
            {plan.map((p) => (
              <li
                key={p.key}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
              >
                <span className="min-w-0 break-words">
                  {p.title.split(" · ").slice(1).join(" · ") || p.title}
                </span>
                <span className="shrink-0 text-muted-foreground">Due {shortDate(p.due)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p role="alert" className="text-sm text-destructive">
            Choose the first due date.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(plan)} disabled={busy || plan.length === 0}>
            {busy ? "Assigning…" : `Assign ${plan.length} set${plan.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
