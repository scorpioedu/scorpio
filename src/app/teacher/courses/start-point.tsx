"use client";

// Where a class starts a course: from the beginning, or part-way through (a class that joins Scorpio
// mid-year has already covered the first units). Starting later only skips the earlier sets in the
// class's plan (planStartingAt), so any of them can be un-skipped afterwards.
import { curriculumUnits } from "@/data/curricula";
import { defaultOrder, planStartingAt } from "@/lib/curriculum-plan";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const choice = (on: boolean) =>
  cn(
    "flex w-full items-start gap-3 rounded-2xl border p-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    on
      ? "border-primary bg-primary/10"
      : "border-border hover:border-primary/60 hover:bg-accent/50",
  );

const dot = (on: boolean) =>
  cn(
    "mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full border",
    on ? "border-primary" : "border-muted-foreground/50",
  );

export function StartPointPicker({
  curriculumId,
  value,
  onChange,
}: {
  curriculumId: string;
  /** The set the class starts at, or null for the beginning of the course. */
  value: string | null;
  onChange: (startKey: string | null) => void;
}) {
  const units = curriculumUnits(curriculumId).filter((u) => u.sets.length > 0);
  const order = defaultOrder(curriculumId);
  if (units.length === 0) return null;
  const first = order[0];
  const later = value !== null;
  const unit = units.find((u) => u.sets.some((s) => s.key === value)) ?? units[0];
  const skipped = planStartingAt(curriculumId, value).skipped.length;
  // "Part-way" opens on the second unit: the first unit's first set would be the beginning again.
  const defaultLater = (units[1] ?? units[0]).sets[0]?.key ?? first;

  return (
    <fieldset className="space-y-2">
      <legend className="pb-1 text-sm font-semibold">Where does the class start?</legend>
      <button
        type="button"
        role="radio"
        aria-checked={!later}
        onClick={() => onChange(null)}
        className={choice(!later)}
      >
        <span className={dot(!later)} aria-hidden>
          {!later && <span className="size-2 rounded-full bg-primary" />}
        </span>
        <span>
          <span className="block font-medium">From the beginning</span>
          <span className="block text-xs text-muted-foreground">
            Unit {units[0].unit}: {units[0].info?.title}
          </span>
        </span>
      </button>
      <div className={choice(later)}>
        <button
          type="button"
          role="radio"
          aria-checked={later}
          aria-label="Part-way through"
          onClick={() => !later && onChange(defaultLater)}
          className="mt-0.5 shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className={cn(dot(later), "mt-0")} aria-hidden>
            {later && <span className="size-2 rounded-full bg-primary" />}
          </span>
        </button>
        <div className="min-w-0 flex-1 space-y-2">
          <button
            type="button"
            tabIndex={-1}
            onClick={() => !later && onChange(defaultLater)}
            className="block w-full text-left"
          >
            <span className="block font-medium">Part-way through</span>
            <span className="block text-xs text-muted-foreground">
              The class has already covered the earlier units, in Scorpio or elsewhere.
            </span>
          </button>
          {later && (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="start-unit" className="text-xs text-muted-foreground">
                    Unit
                  </Label>
                  <Select
                    value={String(unit.unit)}
                    onValueChange={(u) => {
                      const next = units.find((x) => String(x.unit) === u);
                      if (next?.sets[0]) onChange(next.sets[0].key);
                    }}
                  >
                    <SelectTrigger id="start-unit" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {units.map((u) => (
                        <SelectItem key={u.unit} value={String(u.unit)}>
                          Unit {u.unit}: {u.info?.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="start-set" className="text-xs text-muted-foreground">
                    First set to do
                  </Label>
                  <Select value={value ?? ""} onValueChange={onChange}>
                    <SelectTrigger id="start-set" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {unit.sets.map((s) => (
                        <SelectItem key={s.key} value={s.key}>
                          {s.key} {s.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {skipped === 0
                  ? "That is the first set, so nothing is skipped."
                  : `The ${skipped} earlier set${skipped === 1 ? " is" : "s are"} marked skipped: not offered, not counted, not on the calendar. You can unskip any of them later.`}
              </p>
            </>
          )}
        </div>
      </div>
    </fieldset>
  );
}
