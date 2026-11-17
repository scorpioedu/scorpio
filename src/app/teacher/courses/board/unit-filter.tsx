// Narrows the Board or the Calendar to one unit (kept in the address bar as ?unit=). Compact on
// purpose: one small numbered chip per unit, in the class's order; only the chosen unit spells out
// its name (under the row on a phone), the others show it on hover.
import { cn } from "@/lib/utils";

export interface UnitChoice {
  unit: number;
  title: string;
}

const chip = (on: boolean) =>
  cn(
    "inline-flex h-7 min-w-7 shrink-0 items-center justify-center gap-1.5 rounded-full border px-2 text-sm sm:h-8 sm:min-w-8 sm:px-2.5 tabular-nums transition-colors hover:border-primary/60 focus-visible:outline-2 focus-visible:outline-ring",
    on
      ? "border-primary bg-primary/10 font-medium text-foreground"
      : "border-border text-muted-foreground",
  );

export function UnitFilter({
  units,
  value,
  onChange,
}: {
  units: UnitChoice[];
  /** The unit shown, or null for all of them. */
  value: number | null;
  onChange: (unit: number | null) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Show one unit"
      className="flex min-w-0 flex-wrap items-center gap-1 sm:gap-1.5"
    >
      <span className="mr-0.5 text-xs font-medium text-muted-foreground" aria-hidden>
        Unit
      </span>
      <button
        type="button"
        aria-pressed={value === null}
        onClick={() => onChange(null)}
        className={chip(value === null)}
      >
        All
      </button>
      {units.map((u) => {
        const on = value === u.unit;
        return (
          <button
            key={u.unit}
            type="button"
            aria-pressed={on}
            aria-label={`Unit ${u.unit}: ${u.title}`}
            title={on ? undefined : `Unit ${u.unit}: ${u.title}`}
            // Pressing the chosen unit again shows every unit.
            onClick={() => onChange(on ? null : u.unit)}
            className={chip(on)}
          >
            {u.unit}
            {/* Beside the number where there is room; on a phone it goes under the row. */}
            {on && (
              <span className="hidden max-w-56 truncate font-normal sm:inline">{u.title}</span>
            )}
          </button>
        );
      })}
      {value !== null && (
        <p className="w-full text-xs text-muted-foreground sm:hidden">
          Unit {value}: {units.find((u) => u.unit === value)?.title}
        </p>
      )}
    </div>
  );
}
