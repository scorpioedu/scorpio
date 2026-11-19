import { ArrowDown } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";
import { DocsLines } from "@/components/docs-lines";
import { StarField } from "@/components/landing/line-art";
import { Button } from "@/components/ui/button";
import intro from "./hero-intro.module.css";
import reveal from "./home-reveal.module.css";

const at = (ms: number) => ({ "--d": ms }) as React.CSSProperties;

const LINE_ONE = ["Assign", "AP", "Physics", "in", "minutes."];
const LINE_TWO = ["The", "grading’s", "already", "done."];
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

const facts = [
  ["3 AP courses", "every unit planned"],
  ["Free", "for one teacher"],
  ["Class code", "no LMS setup"],
] as const;

export function LandingHero() {
  return (
    <section
      id="home"
      className="relative isolate flex min-h-[92svh] flex-col justify-center overflow-hidden border-b border-border/60 pb-16 pt-28 sm:pb-20 sm:pt-32"
    >
      {/* Stars with Scorpius in the upper right, over the same quiet contour lines as the docs, login and sign up pages. */}
      <div aria-hidden="true" className={`${intro.sky} pointer-events-none absolute inset-0 -z-10`}>
        <StarField
          constellation
          motion={{ edge: intro.edge, star: intro.star, antares: intro.antares }}
          className={`${reveal.heroSky} size-full text-foreground [mask-image:radial-gradient(ellipse_80%_100%_at_75%_0%,black,transparent_80%)]`}
        />
      </div>
      <DocsLines
        className={`${intro.lines} pointer-events-none absolute inset-0 -z-10 size-full text-primary opacity-30 [mask-image:linear-gradient(to_bottom,transparent,black_45%,black_70%,transparent)]`}
      />
      <div className={`${reveal.heroOut} mx-auto max-w-6xl px-5 text-center sm:px-8`}>
        <h1
          className={`mx-auto max-w-[24ch] text-balance text-[clamp(2.4rem,5.4vw,4.75rem)] font-semibold leading-[1.02] tracking-[-0.06em]`}
        >
          <span className="sm:block">
            <Words words={LINE_ONE} start={120} />
          </span>{" "}
          <span className="text-muted-foreground sm:block">
            <Words words={LINE_TWO} start={LINE_TWO_AT} />
          </span>
        </h1>
        <p
          style={at(900)}
          className={`${intro.step} mx-auto mt-5 max-w-xl text-pretty leading-relaxed text-muted-foreground sm:mt-6 sm:text-lg`}
        >
          Ready-made problem sets for AP Physics 1, AP Physics 2 and AP Physics C: Mechanics.
          Scorpio grades on submit, tutors with hints instead of answers, and shows you what to
          reteach.
        </p>
        <div className={`mt-6 flex flex-wrap items-center justify-center gap-2 sm:mt-8 sm:gap-4`}>
          <Button
            asChild
            style={at(1060)}
            className={`${intro.step} group relative isolate h-12 gap-2 rounded-xl pl-4 pr-1.5 shadow-sm shadow-primary/20 hover:bg-primary dark:bg-primary/80 dark:hover:bg-primary/80 motion-safe:active:scale-[0.98] motion-reduce:transition-none`}
          >
            <Link href="/request-access">
              {/* The beUI-style accent expands behind the label without moving it. */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-1.5 right-1.5 -z-10 w-9 rounded-lg bg-black/12 transition-[width] duration-300 ease-out group-hover:w-[calc(100%-0.75rem)] group-focus-visible:w-[calc(100%-0.75rem)] motion-reduce:transition-none"
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
          <Button
            asChild
            variant="outline"
            style={at(1140)}
            className={`${intro.step} group h-12 rounded-xl bg-background/80 px-4 motion-safe:active:scale-[0.98] motion-reduce:transition-none`}
          >
            <Link href="#features">
              See how it works
              <ArrowDown
                aria-hidden="true"
                className="size-4 text-primary motion-safe:transition-transform motion-safe:group-hover:translate-y-0.5"
              />
            </Link>
          </Button>
        </div>
        <dl
          className={`mx-auto mt-10 grid max-w-lg grid-cols-3 gap-4 text-sm text-muted-foreground`}
        >
          {facts.map(([value, label], i) => (
            <div key={value} style={at(1260 + i * 80)} className={`${intro.step} flex flex-col`}>
              <dt className="order-last">{label}</dt>
              <dd className="font-semibold text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
