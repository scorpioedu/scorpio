// Chips that narrow the board to one unit (kept in the address bar as ?unit=).
import { cn } from "@/lib/utils";

export interface UnitChoice {
  unit: number;
  title: string;
}

const chip = (on: boolean) =>
  cn(
    "shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors hover:border-primary/60 focus-visible:outline-2 focus-visible:outline-ring",
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
      className="-mx-1 flex min-w-0 gap-2 overflow-x-auto px-1 py-1 sm:flex-wrap sm:overflow-visible"
    >
      <button
        type="button"
        aria-pressed={value === null}
        onClick={() => onChange(null)}
        className={chip(value === null)}
      >
        All units
      </button>
      {units.map((u) => (
        <button
          key={u.unit}
          type="button"
          aria-pressed={value === u.unit}
          onClick={() => onChange(value === u.unit ? null : u.unit)}
          className={chip(value === u.unit)}
        >
          <span className="tabular-nums">{u.unit}</span> {u.title}
        </button>
      ))}
    </div>
  );
}
