import { apUnits } from "@/data/ap";
import { CURRICULA, hasContent } from "@/data/curricula";
import reveal from "./home-reveal.module.css";
import { card, Section, Split, statement } from "./split-kit";

const SHOWN_UNITS = 5;

const COUNT = ["No", "One", "Two", "Three", "Four", "Five", "Six"];

/**
 * The AP courses, read from the curriculum data so the counts never drift from what teachers get.
 * Only courses with problems are counted as written; one that is only an outline says "Planned".
 */
export function CourseGrid() {
  const written = CURRICULA.filter(hasContent).length;
  return (
    <Section id="courses" labelledBy="courses-heading">
      <div data-scroll-reveal className={reveal.stagger}>
        <Split id="courses-heading" heading="Courses">
          <p className={statement}>
            {COUNT[written] ?? written} AP Physics {written === 1 ? "course" : "courses"}, already
            written
            <span className="block text-muted-foreground">
              Every unit of the College Board outline, in order
            </span>
          </p>
        </Split>
      </div>

      <ul
        role="list"
        className="mt-16 grid list-none grid-cols-[minmax(0,1fr)] gap-2 sm:mt-20 md:grid-cols-2 xl:grid-cols-4"
      >
        {CURRICULA.map((c, i) => {
          const units = apUnits(c.apCourse);
          const sets = c.sets.filter((s) => s.draftIds.length > 0).length;
          const planned = !hasContent(c);
          const rest = units.length - SHOWN_UNITS;
          return (
            <li
              key={c.id}
              data-scroll-reveal
              style={{ "--reveal-delay": `${i * 120}ms` } as React.CSSProperties}
              className={`${card} row-span-4 grid min-w-0 grid-rows-subgrid gap-y-0`}
            >
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="text-balance text-lg font-medium tracking-tight">{c.name}</h3>
                <p className="shrink-0 text-sm text-muted-foreground">{units.length} units</p>
              </div>
              {planned ? (
                <p className="mt-6 flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[2.1rem] font-medium tracking-tight text-muted-foreground">
                    Planned
                  </span>
                  <span className="text-muted-foreground">problem sets not written yet</span>
                </p>
              ) : (
                <p className="mt-6 flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[2.1rem] font-medium tabular-nums tracking-tight">
                    {sets}
                  </span>
                  <span className="text-muted-foreground">problem sets</span>
                </p>
              )}
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
              <p className="mt-2.5 pl-8 text-[15px] text-muted-foreground">
                {rest > 0 && `and ${rest} more`}
              </p>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
