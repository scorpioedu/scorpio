"use client";

// "Assign unit": shows exactly which sets will be copied into the class and when each is due,
// before anything is created.
import { useMemo, useState } from "react";
import {
  cappedSets,
  planAssignments,
  sizeChoice,
  type AssignableSet,
  type PlannedAssignment,
  type SizeChoice,
} from "@/lib/assign-sets";
import { DEFAULT_SET_SIZE } from "@/data/curricula";
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
import { SpacingSelect } from "@/components/teacher/spacing-select";
import { shortDate } from "./use-course-data";

export { SpacingSelect };

/**
 * "Problems per set": how many of each set's problems the class gets (its first n). Not shown while
 * no set being assigned has more than five, so there is nothing to choose.
 */
export function ProblemsPerSetField({
  choice,
  sets,
  value,
  onChange,
  disabled,
}: {
  choice: SizeChoice;
  sets: AssignableSet[];
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  if (!choice.offered) return null;
  const capped = cappedSets(sets, value);
  const pool = capped[0]?.poolSize ?? DEFAULT_SET_SIZE;
  return (
    <div className="space-y-2">
      <Label htmlFor="assign-count">Problems per set</Label>
      <Select value={String(value)} onValueChange={(v) => onChange(Number(v))} disabled={disabled}>
        <SelectTrigger id="assign-count" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Array.from({ length: choice.max - choice.min + 1 }, (_, i) => choice.min + i).map(
            (n) => (
              <SelectItem key={n} value={String(n)}>
                {n === DEFAULT_SET_SIZE ? `First ${n} (usual)` : `First ${n}`}
              </SelectItem>
            ),
          )}
        </SelectContent>
      </Select>
      {capped.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {capped.length === 1
            ? `${capped[0].key} has ${pool} problems, so it gets all ${pool}.`
            : `${capped.map((s) => s.key).join(", ")} have fewer than ${value}, so they get all they have.`}
        </p>
      )}
    </div>
  );
}

export function AssignDialog({
  unitLabel,
  className,
  sets,
  problemsPerSet,
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
  /** The number of problems this class was last given per set; the control opens on it. */
  problemsPerSet?: number | null;
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
  const choice = sizeChoice(sets, problemsPerSet);
  const [count, setCount] = useState(choice.initial);
  const startDate = parseDateInput(start);
  const plan = useMemo(
    () =>
      (startDate ? planAssignments(sets, none, startDate, Number(spacing), isSchoolDay) : []).map(
        // Without the control nothing is chosen, and the copy gets the usual five.
        (p): PlannedAssignment => (choice.offered ? { ...p, count } : p),
      ),
    // startDate is derived from `start`
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sets, none, start, spacing, isSchoolDay, choice.offered, count],
  );

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="break-words">Assign {unitLabel}</DialogTitle>
          <DialogDescription>
            {sets.length} set{sets.length === 1 ? "" : "s"} will be assigned to {className}. Due
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
          <ProblemsPerSetField
            choice={choice}
            sets={sets}
            value={count}
            onChange={setCount}
            disabled={busy}
          />
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
