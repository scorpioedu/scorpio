import type { Metadata } from "next";
import Link from "next/link";
import { ClickIcon } from "@/components/ui/click-icon";
import { ArrowRightIcon as AnimatedArrowRight } from "@animateicons/react/lucide/arrow-right-icon";
import { PrimaryPill, SecondaryPill } from "@/components/landing/split-kit";
import { LessonSearch, type SearchTopic } from "@/components/lessons/lesson-search";
import { CourseBlocks, UnitBar, courseBlockStyles } from "@/components/lessons/course-blocks";
import { PracticePreview } from "@/components/lessons/practice-preview";
import { JsonLd, OG_IMAGE, SITE, wrap } from "@/components/lessons/lessons-ui";
import { publicCourses } from "@/lib/guides/public";
import { REVIEW_INTERVAL_DAYS } from "@/lib/study/progress";
import { cn } from "@/lib/utils";

// /lessons: Study on the public site, one page for both halves of it. Every topic's lesson, and
// the practice problems at the end of each lesson (checked as you answer, no account needed); a
// free student account saves the answers and plans review. /study redirects here.

export const metadata: Metadata = {
  title: "Free AP Physics Review: Lessons and Practice for AP Physics 1, 2 and C",
  description:
    "Free AP Physics review for every unit of AP Physics 1, AP Physics 2, C: Mechanics and C: E&M. Topic by topic lessons with worked examples, and practice problems checked as you answer.",
  alternates: { canonical: "/lessons" },
  openGraph: {
    title: "Free AP Physics lessons and practice • Scorpio",
    description:
      "Every unit of AP Physics 1, 2 and C, topic by topic: a lesson, worked examples, and practice problems checked as you answer. No account needed.",
    url: "/lessons",
    images: OG_IMAGE,
  },
  twitter: {
    card: "summary_large_image",
    title: "Free AP Physics lessons and practice • Scorpio",
    description:
      "Every unit of AP Physics 1, 2 and C, topic by topic: a lesson, worked examples, and practice problems checked as you answer. No account needed.",
  },
};

// "1 day later, then 3, 7 and 14 days": the review steps, from the same constant the scheduler uses.
const [firstGap, ...laterGaps] = REVIEW_INTERVAL_DAYS;
const reviewGaps = `${firstGap} day later, then ${laterGaps.join(", ").replace(/, (\d+)$/, " and $1")} days`;

/** How a topic works, in the order a student meets it. */
const STEPS: { title: string; body: string }[] = [
  {
    title: "Read the lesson",
    body: "The idea, its equations, two worked examples and the mistakes students make.",
  },
  {
    title: "Try the problems",
    body: "Type a number with its unit or pick a choice, and see at once if it is right.",
  },
  {
    title: "See what went wrong",
    body: "A wrong answer names the mix-up behind it, and every problem has a worked solution.",
  },
  {
    title: "Review what you missed",
    body: `With a free account, a missed topic comes back ${reviewGaps} as you get it right.`,
  },
];

export default async function LessonsPage() {
  const courses = await publicCourses();
  const topicTotal = courses.reduce((n, c) => n + c.topicCount, 0);
  const search: SearchTopic[] = courses.flatMap((c) =>
    c.units.flatMap((u) =>
      u.topics.map((t) => ({
        course: c.name,
        unit: u.unit,
        unitTitle: u.title,
        id: t.id,
        title: t.title,
        href: t.href,
      })),
    ),
  );
  const heading = "text-[clamp(1.6rem,2.8vw,2.25rem)] font-medium leading-tight tracking-[-0.03em]";

  return (
    <div data-lessons-enter>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Free AP Physics lessons and practice",
          url: `${SITE}/lessons`,
          hasPart: courses.map((c) => ({
            "@type": "Course",
            name: `${c.name} lessons`,
            url: `${SITE}${c.href}`,
            description: c.description,
            provider: { "@type": "Organization", name: "Scorpio", url: SITE },
          })),
        }}
      />

      {/* ── Hero: pick a course straight away (first thing on a phone) ── */}
      <section
        aria-labelledby="lessons-heading"
        className="relative isolate overflow-hidden border-b border-border/60"
      >
        {/* The hero's one ground: a soft light behind the course blocks, graph paper fading out. */}
        <div aria-hidden className={cn(courseBlockStyles.ground, "-z-10")} />
        <div
          className={cn(
            wrap,
            "grid min-h-[calc(100svh-3.5rem)] grid-cols-[minmax(0,1fr)] content-center gap-x-16 gap-y-8 py-12 sm:py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]",
          )}
        >
          <div className="lg:col-start-1 lg:row-start-1 lg:self-end">
            <h1
              id="lessons-heading"
              className="text-balance text-[clamp(2.2rem,4.6vw,3.6rem)] font-medium leading-[1.05] tracking-[-0.045em]"
            >
              Free AP Physics lessons and practice
            </h1>
            <p className="mt-5 max-w-[52ch] text-pretty text-lg leading-relaxed text-muted-foreground">
              Pick your course to start. Each topic has a short lesson with worked examples, then
              problems checked as you answer. No AI: every problem has been checked by a person.
            </p>
            <p className="mt-4 text-sm tabular-nums text-muted-foreground">
              {topicTotal} topics in {courses.length} courses · free · no AI · no account needed
            </p>
          </div>

          {/* The way in: on a phone it comes straight after the heading, before search. */}
          <nav
            aria-labelledby="pick-heading"
            className="lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center"
          >
            <h2 id="pick-heading" className="mb-3 flex items-center gap-2 text-sm font-medium">
              <span className="size-1.5 rounded-full bg-primary" aria-hidden />
              Pick your course
            </h2>
            <CourseBlocks courses={courses} labelledBy="pick-heading" />
          </nav>

          <div className="lg:col-start-1 lg:row-start-2 lg:self-start">
            <div className="max-w-lg border-t border-border pt-6">
              <LessonSearch topics={search} />
            </div>
            <p className="mt-5 text-sm text-muted-foreground">
              Want your answers saved?{" "}
              <Link
                href="/signup?role=student&next=/student/study"
                prefetch={false}
                className="font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
              >
                Create a free account
              </Link>
            </p>
          </div>
        </div>
      </section>

      {/* ── Courses: every unit, one click away. A phone has the hero's blocks and the course pages;
          the unit lists would only run it long. ─────────────────────────── */}
      <section
        id="courses"
        aria-labelledby="courses-heading"
        className="hidden scroll-mt-14 md:block"
      >
        <div className={cn(wrap, "py-16 sm:py-24")}>
          <h2 id="courses-heading" className={heading}>
            Every unit, one click away
          </h2>
          <p className="mt-3 max-w-[60ch] text-pretty text-muted-foreground">
            Open a course to see its topics, or go straight to a unit. Each topic ends with its
            practice problems.
          </p>
          <ul role="list" className="mt-10 grid list-none gap-4 md:grid-cols-2 xl:grid-cols-4">
            {courses.map((c) => (
              <li
                key={c.id}
                id={c.id}
                className="flex scroll-mt-20 flex-col overflow-hidden rounded-2xl border border-border bg-background"
              >
                <Link
                  href={c.href}
                  className="group block border-b border-border bg-muted/30 p-5 transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="text-xl font-medium leading-tight tracking-[-0.02em]">
                      {c.name.replace("Electricity and Magnetism", "E&M")}
                    </span>
                    <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-transform group-hover:translate-x-0.5">
                      Open
                      <ClickIcon icon={AnimatedArrowRight} aria-hidden className="size-3" />
                    </span>
                  </span>
                  <span className="mt-1.5 block text-xs tabular-nums text-muted-foreground">
                    {c.units.length} units · {c.topicCount} topics
                  </span>
                  <UnitBar units={c.units} className="mt-3" />
                </Link>
                {/* On a phone the four lists would run several screens: the course page has them. */}
                <ol role="list" className="hidden flex-1 list-none p-5 pt-3 md:block">
                  {c.units.map((u) => (
                    <li key={u.unit}>
                      <Link
                        href={u.href}
                        className="group/unit flex items-baseline gap-3 rounded-md py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground"
                      >
                        <span className="w-5 shrink-0 font-mono text-xs tabular-nums transition-colors group-hover/unit:text-primary">
                          {u.unit}
                        </span>
                        <span className="text-pretty leading-snug underline-offset-4 group-hover/unit:underline">
                          {u.title}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── How a topic works, beside a real practice problem ──────────── */}
      <section aria-labelledby="how-heading" className="border-y border-border/60 bg-muted/20">
        <div
          className={cn(
            wrap,
            "grid grid-cols-[minmax(0,1fr)] gap-12 py-16 sm:py-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:gap-16",
          )}
        >
          <div>
            <h2 id="how-heading" className={heading}>
              How each topic works
            </h2>
            <ol role="list" className="mt-8 list-none space-y-6">
              {STEPS.map((step, i) => (
                <li key={step.title} className="flex gap-4">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full border border-border bg-background font-mono text-xs tabular-nums">
                    {i + 1}
                  </span>
                  <span className="pt-1">
                    <span className="block font-medium leading-snug">{step.title}</span>
                    <span className="mt-1 block max-w-[48ch] text-pretty text-sm leading-relaxed text-muted-foreground">
                      {step.body}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <PracticePreview className="w-full max-w-[30rem] justify-self-center lg:justify-self-end" />
        </div>
      </section>

      {/* ── Close ─────────────────────────────────────────────────────── */}
      <section aria-labelledby="account-heading">
        <div
          className={cn(
            wrap,
            "grid gap-8 py-16 sm:py-24 md:grid-cols-[minmax(0,1fr)_auto] md:items-end",
          )}
        >
          <div className="space-y-3">
            <h2 id="account-heading" className={heading}>
              Keep your progress with a free account
            </h2>
            <p className="max-w-[60ch] text-pretty text-muted-foreground">
              Study saves every answer, shows which topics are strong and brings back the ones you
              missed. No class code needed. Teachers can assign the same problem sets to a class.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <PrimaryPill href="/signup?role=student&next=/student/study">
              Create a free account
            </PrimaryPill>
            <SecondaryPill href="/student/study">Open Study</SecondaryPill>
          </div>
        </div>
      </section>
    </div>
  );
}
