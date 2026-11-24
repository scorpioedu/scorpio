import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { LessonSearch, type SearchTopic } from "@/components/lessons/lesson-search";
import { JsonLd, OG_IMAGE, PracticeBand, SITE, wrap } from "@/components/lessons/lessons-ui";
import { publicCourses } from "@/lib/guides/public";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Free AP Physics Review: Lessons for AP Physics 1, 2 and C",
  description:
    "Free AP Physics review for every unit of AP Physics 1, AP Physics 2, C: Mechanics and C: E&M. Topic by topic notes, key equations, worked examples and common mistakes.",
  alternates: { canonical: "/lessons" },
  openGraph: {
    title: "Free AP Physics lessons • Scorpio",
    description:
      "Every unit of AP Physics 1, 2 and C, topic by topic, with worked examples and common mistakes. No account needed.",
    url: "/lessons",
    images: OG_IMAGE,
  },
};

/** "AP Physics C: Electricity and Magnetism" -> "C: E&M", for the course cards. */
function shortName(name: string): string {
  return name.replace(/^AP Physics\s*/, "").replace("Electricity and Magnetism", "E&M");
}

export default async function LessonsPage() {
  const courses = await publicCourses();
  const topicTotal = courses.reduce((n, c) => n + c.topicCount, 0);
  const unitTotal = courses.reduce((n, c) => n + c.units.length, 0);
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

  return (
    <div data-lessons-enter>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Free AP Physics lessons",
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

      {/* ── Header ───────────────────────────────────────────────────── */}
      <section aria-labelledby="lessons-heading" className="border-b border-border/60">
        <div
          className={cn(
            wrap,
            "grid grid-cols-[minmax(0,1fr)] gap-12 pb-12 pt-14 sm:pb-16 sm:pt-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:items-end lg:gap-16",
          )}
        >
          <div>
            <h1
              id="lessons-heading"
              className="text-balance text-[clamp(2.2rem,4.6vw,3.6rem)] font-medium leading-[1.05] tracking-[-0.045em]"
            >
              AP Physics lessons
            </h1>
            <p className="mt-4 max-w-[60ch] text-pretty text-lg leading-relaxed text-muted-foreground">
              Every unit of AP Physics 1, 2, C: Mechanics and C: E&amp;M, one topic at a time: the
              ideas, the equations, two worked examples and the mistakes students make.
            </p>
            <p className="mt-4 text-sm tabular-nums text-muted-foreground">
              {courses.length} courses · {unitTotal} units · {topicTotal} topic lessons · free to
              read
            </p>
            <div className="mt-8 border-t border-border pt-8">
              <LessonSearch topics={search} />
            </div>
          </div>

          {/* Jump to a course: one card each. */}
          <nav aria-labelledby="jump-heading">
            <p id="jump-heading" className="mb-3 text-sm text-muted-foreground">
              Jump to a course
            </p>
            <ul role="list" className="grid list-none grid-cols-2 gap-3">
              {courses.map((c) => (
                <li key={c.id}>
                  <Link
                    href={c.href}
                    aria-label={c.name}
                    className="group flex h-full min-h-36 flex-col justify-between rounded-2xl border border-border p-4 transition-[background-color,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-foreground/20 hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:hover:translate-y-0 sm:p-5"
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="text-xs text-muted-foreground">AP Physics</span>
                      <ArrowUpRight
                        aria-hidden
                        className="size-4 text-muted-foreground transition-[transform,color] group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground"
                      />
                    </span>
                    <span>
                      <span className="block text-[clamp(1.35rem,2.4vw,1.75rem)] font-medium leading-tight tracking-[-0.03em]">
                        {shortName(c.name)}
                      </span>
                      <span className="mt-1.5 block text-xs tabular-nums text-muted-foreground">
                        {c.units.length} units · {c.topicCount} topics
                      </span>
                      {/* One segment per unit; they fill left to right on hover. */}
                      <span aria-hidden className="mt-3 flex gap-1">
                        {c.units.map((u, i) => (
                          <span
                            key={u.unit}
                            style={{ transitionDelay: `${i * 35}ms` }}
                            className="h-1 flex-1 rounded-full bg-foreground/10 transition-colors duration-300 group-hover:bg-primary/70 group-focus-visible:bg-primary/70 motion-reduce:transition-none"
                          />
                        ))}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </section>

      {/* ── Courses ──────────────────────────────────────────────────── */}
      <div
        className={cn(
          wrap,
          "grid grid-cols-[minmax(0,1fr)] gap-10 py-14 sm:py-20 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-16",
        )}
      >
        <nav aria-label="Courses" className="hidden lg:block">
          <div className="sticky top-24 transition-[top] duration-300 ease-out motion-reduce:transition-none [html[data-header-hidden]_&]:top-10">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Courses
            </p>
            <ol role="list" className="list-none space-y-0.5 border-l border-border">
              {courses.map((c) => (
                <li key={c.id}>
                  <a
                    href={`#${c.id}`}
                    className="-ml-px flex border-l border-transparent py-1.5 pl-4 text-sm leading-5 text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
                  >
                    {c.name}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </nav>

        <ol role="list" className="list-none space-y-16 sm:space-y-20">
          {courses.map((c) => (
            <li key={c.id} id={c.id} className="scroll-mt-24">
              <section aria-labelledby={`${c.id}-heading`}>
                <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
                  <div>
                    <h2
                      id={`${c.id}-heading`}
                      className="text-[clamp(1.4rem,2.4vw,1.85rem)] font-medium leading-tight tracking-[-0.03em]"
                    >
                      <Link href={c.href} className="transition-colors hover:text-primary">
                        {c.name}
                      </Link>
                    </h2>
                    <p className="mt-2 text-sm tabular-nums text-muted-foreground">
                      {c.units.length} units · {c.topicCount} topic lessons
                    </p>
                  </div>
                  <Link
                    href={c.href}
                    className="group inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    All topics
                    <ArrowRight
                      aria-hidden
                      className="size-4 transition-transform group-hover:translate-x-0.5"
                    />
                  </Link>
                </header>

                <ol
                  role="list"
                  className="mt-6 list-none divide-y divide-border overflow-hidden rounded-2xl border border-border"
                >
                  {c.units.map((u) => (
                    <li key={u.unit}>
                      <Link
                        href={u.href}
                        className="group flex items-start gap-4 bg-background px-5 py-4 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none sm:px-6"
                      >
                        <span className="mt-0.5 w-9 shrink-0 font-mono text-sm tabular-nums text-muted-foreground transition-colors group-hover:text-primary">
                          {String(u.unit).padStart(2, "0")}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium leading-snug">{u.title}</span>
                          <span className="mt-1 line-clamp-2 block text-pretty text-sm text-muted-foreground">
                            {u.summary}
                          </span>
                        </span>
                        <span className="mt-0.5 hidden shrink-0 text-sm tabular-nums text-muted-foreground sm:block">
                          {u.topics.length} topics
                        </span>
                        <ArrowRight
                          aria-hidden
                          className="mt-1 size-4 shrink-0 text-muted-foreground transition-[transform,color] group-hover:translate-x-0.5 group-hover:text-foreground"
                        />
                      </Link>
                    </li>
                  ))}
                </ol>
              </section>
            </li>
          ))}
        </ol>
      </div>

      <div className={cn(wrap, "pb-20 sm:pb-28")}>
        <PracticeBand
          heading="Practice with feedback"
          line="With a free account, each unit's problem sets grade themselves, and Raise hints at the next step instead of giving the answer."
        />
      </div>
    </div>
  );
}
