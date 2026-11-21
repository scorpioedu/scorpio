import Link from "next/link";
import { Fragment } from "react";
import { apUnits } from "@/data/ap";
import { CURRICULA } from "@/data/curricula";
import { DocsLines } from "@/components/docs-lines";
import { HeroLiveClass } from "@/components/landing/hero-live-class";
import { Button } from "@/components/ui/button";
import intro from "./hero-intro.module.css";

const at = (ms: number) => ({ "--d": ms }) as React.CSSProperties;

const LINE_ONE = ["AP", "Physics", "1,", "2", "and", "C:", "Mechanics."];
const LINE_TWO = ["A", "problem", "set", "for", "every", "unit."];
/** Line two starts after line one's last word has begun to settle. */
const LINE_TWO_AT = 120 + LINE_ONE.length * 55 + 160;

function Words({ words, start }: { words: string[]; start: number }) {
  return words.map((word, i) => (
    <Fragment key={word}>
      {i > 0 && " "}
      <span className={intro.word} style={{ "--d": start, "--i": i } as React.CSSProperties}>
        {word}
      </span>
    </Fragment>
  ));
}

const course = CURRICULA[0];
const unit = apUnits(course.apCourse).find((u) => u.unit === 2);
const unitLabel = unit?.title ?? "Dynamics";

/** The features, as a plain list beside the window. */
const features = [
  "Every AP unit planned",
  "Hints instead of answers",
  "Graded as students work",
  "A reteach list for you",
  "Students join with a code",
] as const;

export function LandingHero() {
  return (
    <section
      id="home"
      className="relative isolate flex min-h-svh flex-col justify-center border-b border-border/60 pb-10 pt-24 sm:pb-12 lg:pt-28"
    >
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <h1 className="max-w-[24ch] text-balance text-[clamp(2.1rem,4.2vw,3.5rem)] font-medium leading-[1.08] tracking-[-0.045em]">
          <span className="sm:block">
            <Words words={LINE_ONE} start={120} />
          </span>{" "}
          <span className="text-muted-foreground sm:block">
            <Words words={LINE_TWO} start={LINE_TWO_AT} />
          </span>
        </h1>

        <div className="mt-7 flex flex-col gap-4 sm:mt-8 sm:flex-row sm:items-center sm:gap-6">
          <Button
            asChild
            style={at(900)}
            className={`${intro.step} group relative isolate h-12 w-full gap-2 rounded-full pl-5 pr-1.5 shadow-sm shadow-primary/20 hover:bg-primary sm:w-auto dark:bg-primary/80 dark:hover:bg-primary/80 motion-safe:active:scale-[0.98] motion-reduce:transition-none`}
          >
            <Link href="/request-access">
              {/* The accent expands behind the label without moving it. */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-1.5 right-1.5 -z-10 w-9 rounded-full bg-black/12 transition-[width] duration-300 ease-out group-hover:w-[calc(100%-0.75rem)] group-focus-visible:w-[calc(100%-0.75rem)] motion-reduce:transition-none"
              />
              Request classroom access
              <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center">
                <svg
                  viewBox="0 0 24 20"
                  className="size-5 transition-transform duration-300 ease-out motion-safe:group-hover:translate-x-0.5 motion-safe:group-focus-visible:translate-x-0.5 motion-reduce:transition-none"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray="0.01 4.2"
                >
                  <path
                    d="m4 4 6 6-6 6"
                    className="opacity-35 transition-opacity group-hover:opacity-65 group-focus-visible:opacity-65 motion-reduce:transition-none"
                  />
                  <path d="m12 4 6 6-6 6" />
                </svg>
              </span>
            </Link>
          </Button>
          <p style={at(980)} className={`${intro.step} text-sm text-muted-foreground`}>
            Free for one teacher
          </p>
        </div>

        <div className="mt-10 grid items-center gap-10 sm:mt-12 xl:grid-cols-12 xl:gap-12">
          {/* The window sits on the same contour lines as the docs and sign-in pages. */}
          <div
            style={at(1100)}
            className={`${intro.step} ${intro.frame} relative isolate overflow-hidden rounded-2xl border border-border bg-muted p-3 sm:p-8 xl:col-span-8 xl:px-10 xl:py-9`}
          >
            <DocsLines className="pointer-events-none absolute inset-x-0 -top-[45%] -z-10 h-[190%] w-full text-foreground opacity-35 dark:opacity-55" />
            <HeroLiveClass
              unitLabel={unitLabel}
              courseName={`Unit ${unit?.unit ?? 2} · ${course.name}`}
            />
          </div>

          <div
            style={at(1240)}
            className={`${intro.step} gap-10 sm:grid sm:grid-cols-2 xl:col-span-4 xl:block`}
          >
            <p className="text-pretty text-[clamp(1.4rem,2.2vw,1.85rem)] font-medium leading-[1.2] tracking-[-0.03em]">
              Assign a unit today.{" "}
              <span className="text-muted-foreground">
                Hints instead of answers, grading as students work, and a list of what to reteach.
              </span>
            </p>
            <div className="mt-8 sm:mt-0 xl:mt-8">
              <p className="text-sm text-muted-foreground">Features</p>
              <ul className="mt-3 grid gap-y-2 text-[15px]">
                {features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
