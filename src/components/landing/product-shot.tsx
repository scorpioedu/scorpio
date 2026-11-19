import Image from "next/image";
import { Eyebrow } from "@/components/landing/line-art";
import reveal from "./home-reveal.module.css";

/**
 * The teacher Courses screen at full width, in a quiet browser frame.
 * Images: public/landing/courses-light.webp and courses-dark.webp, 2040x1280 (the class panel and roadmap of /teacher/courses at 2x).
 */
export function ProductShot() {
  return (
    <section
      id="dashboard-preview"
      aria-labelledby="product-heading"
      className="scroll-mt-20 border-b border-border/60"
    >
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <div data-scroll-reveal className={reveal.stagger}>
          <Eyebrow>The teacher view</Eyebrow>
          <h2
            id="product-heading"
            className="mt-2 max-w-[22ch] text-3xl font-semibold tracking-[-0.035em] sm:text-4xl"
          >
            Your whole year on one screen
          </h2>
          <p className="mt-3 max-w-xl leading-relaxed text-muted-foreground">
            See how many sets are out, how the class is scoring and when you’ll finish at this pace.
            One button assigns the next unit.
          </p>
        </div>

        <figure
          data-scroll-reveal
          className="group mt-12 overflow-hidden rounded-xl border border-border bg-card shadow-xs"
        >
          <div
            aria-hidden="true"
            className="flex items-center gap-3 border-b border-border px-4 py-2.5"
          >
            <span className="flex gap-1.5">
              <span className="size-2.5 rounded-full bg-border" />
              <span className="size-2.5 rounded-full bg-border" />
              <span className="size-2.5 rounded-full bg-border" />
            </span>
            <span className="mx-auto rounded-md bg-muted px-3 py-0.5 text-xs text-muted-foreground">
              scorpioedu.org/teacher/courses
            </span>
            <span className="w-[42px]" />
          </div>
          <div className={`${reveal.develop} overflow-hidden`}>
            {[
              ["light", "dark:hidden"],
              ["dark", "hidden dark:block"],
            ].map(([scheme, cls]) => (
              <Image
                key={scheme}
                src={`/landing/courses-${scheme}.webp`}
                alt="The Scorpio Courses page for an AP Physics 1 class: 12 of 32 sets assigned, 25 students, a 78% average, the finish date at this pace, and Units 1 to 3 assigned with Unit 4 next."
                width={2040}
                height={1280}
                sizes="(min-width: 1152px) 1088px, 100vw"
                className={`${cls} h-auto w-full motion-safe:transition-transform motion-safe:duration-500 motion-safe:group-hover:scale-[1.02]`}
              />
            ))}
          </div>
        </figure>
      </div>
    </section>
  );
}
