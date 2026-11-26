import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { publicCourses } from "@/lib/guides/public";
import reveal from "./home-reveal.module.css";
import { CircleLink, Section, Split, statement } from "./split-kit";

/** The home page's Study section: the free lessons and their practice, with a way into each course. */
export async function LessonsTeaser() {
  const courses = await publicCourses();
  const total = courses.reduce((n, c) => n + c.topicCount, 0);

  return (
    <Section id="lessons" labelledBy="lessons-heading">
      <div data-scroll-reveal className={reveal.stagger}>
        <Split id="lessons-heading" heading="Study">
          <p className={statement}>
            {total} free lessons, each with practice
            <span className="block text-muted-foreground">
              Worked examples, then problems checked as you answer. No account needed
            </span>
          </p>
          <CircleLink href="/lessons" className="mt-8">
            Start studying
          </CircleLink>
        </Split>
      </div>

      <ul
        data-scroll-reveal
        role="list"
        className="mt-16 grid list-none overflow-hidden rounded-2xl border border-border sm:mt-20 md:grid-cols-2"
      >
        {courses.map((c, i) => (
          <li
            key={c.id}
            className={`border-border ${i > 0 ? "border-t" : ""} ${i === 1 ? "md:border-t-0" : ""} ${i % 2 === 1 ? "md:border-l" : ""}`}
          >
            <Link
              href={c.href}
              className="group flex items-center gap-4 bg-background px-5 py-5 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none sm:px-6"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-muted-foreground">Explore</span>
                <span className="mt-0.5 block text-lg font-medium leading-snug tracking-tight">
                  {c.name}
                </span>
                <span className="mt-1 block text-sm tabular-nums text-muted-foreground">
                  {c.units.length} units · {c.topicCount} topics
                </span>
              </span>
              <ArrowRight
                aria-hidden
                className="size-4 shrink-0 text-muted-foreground transition-[transform,color] group-hover:translate-x-0.5 group-hover:text-foreground"
              />
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
