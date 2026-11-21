import { apUnits } from "@/data/ap";
import { CURRICULA } from "@/data/curricula";
import reveal from "./home-reveal.module.css";
import { card, Section, Split, statement } from "./split-kit";

const SHOWN_UNITS = 5;

/** The three AP courses, read from the curriculum data so the counts never drift from what teachers get. */
export function CourseGrid() {
  return (
    <Section id="courses" labelledBy="courses-heading">
      <div data-scroll-reveal className={reveal.stagger}>
        <Split id="courses-heading" heading="Courses">
          <p className={statement}>
            Three AP Physics courses, already written
            <span className="block text-muted-foreground">
              Every unit of the College Board outline, in order
            </span>
          </p>
        </Split>
      </div>

      <ul
        role="list"
        className="mt-16 grid list-none grid-cols-[minmax(0,1fr)] gap-2 sm:mt-20 md:grid-cols-3"
      >
        {CURRICULA.map((c, i) => {
          const units = apUnits(c.apCourse);
          const sets = c.sets.filter((s) => s.draftIds.length > 0).length;
          const rest = units.length - SHOWN_UNITS;
          return (
            <li
              key={c.id}
              data-scroll-reveal
              style={{ "--reveal-delay": `${i * 120}ms` } as React.CSSProperties}
              className={`${card} flex min-w-0 flex-col`}
            >
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="text-lg font-medium tracking-tight">{c.name}</h3>
                <p className="shrink-0 text-sm text-muted-foreground">{units.length} units</p>
              </div>
              <p className="mt-6 flex items-baseline gap-2">
                <span className="text-[2.1rem] font-medium tabular-nums tracking-tight">
                  {sets}
                </span>
                <span className="text-muted-foreground">problem sets</span>
              </p>
              <ol
                role="list"
                className={`${reveal.ticks} mt-6 grid list-none grid-cols-[minmax(0,1fr)] gap-2.5 border-t border-border pt-5 text-[15px]`}
              >
                {units.slice(0, SHOWN_UNITS).map((u) => (
                  <li key={u.unit} className="flex gap-3">
                    <span className="w-5 shrink-0 text-right font-mono text-xs leading-6 tabular-nums text-primary">
                      {String(u.unit).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 truncate">{u.title}</span>
                  </li>
                ))}
              </ol>
              {rest > 0 && (
                <p className="mt-2.5 pl-8 text-[15px] text-muted-foreground">and {rest} more</p>
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
