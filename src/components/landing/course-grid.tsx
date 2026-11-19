import Image from "next/image";
import Link from "next/link";
import { apUnits } from "@/data/ap";
import { CURRICULA } from "@/data/curricula";
import { Eyebrow } from "@/components/landing/line-art";
import reveal from "./home-reveal.module.css";

const SHOWN_UNITS = 5;

/** The three AP courses, read from the curriculum data so the counts never drift from what teachers get. */
export function CourseGrid() {
  return (
    <section
      id="courses"
      aria-labelledby="courses-heading"
      className="scroll-mt-20 border-b border-border/60"
    >
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <div data-scroll-reveal className={reveal.stagger}>
          <Eyebrow>Courses</Eyebrow>
          <h2
            id="courses-heading"
            className="mt-2 max-w-[22ch] text-3xl font-semibold tracking-[-0.035em] sm:text-4xl"
          >
            Three AP Physics courses, already written
          </h2>
          <p className="mt-3 max-w-xl leading-relaxed text-muted-foreground">
            Every unit of the College Board outline, in order, with problem sets you can assign as
            they are or edit.
          </p>
        </div>

        <ul role="list" className="mt-12 grid list-none gap-5 md:grid-cols-3">
          {CURRICULA.map((c, i) => {
            const units = apUnits(c.apCourse);
            const sets = c.sets.filter((s) => s.draftIds.length > 0).length;
            const rest = units.length - SHOWN_UNITS;
            return (
              <li
                key={c.id}
                data-scroll-reveal
                style={{ "--reveal-delay": `${i * 120}ms` } as React.CSSProperties}
                className="flex flex-col rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6"
              >
                <h3 className="text-lg font-semibold tracking-tight">{c.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {units.length} units{sets > 0 ? ` · ${sets} problem sets` : ""}
                </p>
                <ol
                  role="list"
                  className={`${reveal.ticks} mt-5 grid list-none gap-2 border-t border-border pt-4 text-sm`}
                >
                  {units.slice(0, SHOWN_UNITS).map((u) => (
                    <li key={u.unit} className="flex gap-3">
                      <span className="w-5 shrink-0 text-right font-semibold tabular-nums text-primary">
                        {u.unit}
                      </span>
                      <span className="min-w-0 truncate">{u.title}</span>
                    </li>
                  ))}
                </ol>
                {rest > 0 && (
                  <p className="mt-2 pl-8 text-sm text-muted-foreground">and {rest} more</p>
                )}
              </li>
            );
          })}
        </ul>

        <div data-scroll-reveal className="mt-10 flex">
          <Link
            href="https://www.sageridge.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-4 rounded-sm text-sm text-muted-foreground transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          >
            <span id="partners">Piloting at Sage Ridge School</span>
            <Image
              src="/school-logos/SageRidgeSchool.svg"
              alt="Sage Ridge School"
              width={244}
              height={130}
              className="h-auto w-20 dark:brightness-0 dark:invert"
            />
          </Link>
        </div>
      </div>
    </section>
  );
}
