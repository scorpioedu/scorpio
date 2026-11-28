import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClickIcon } from "@/components/ui/click-icon";
import { ArrowRightIcon as AnimatedArrowRight } from "@animateicons/react/lucide/arrow-right-icon";
import { PrimaryPill } from "@/components/landing/split-kit";
import {
  Breadcrumbs,
  JsonLd,
  OG_IMAGE,
  AccountBand,
  SITE,
  wrap,
} from "@/components/lessons/lessons-ui";
import { publicCourse, publicCourses } from "@/lib/guides/public";
import { cn } from "@/lib/utils";

export const dynamicParams = false;

export async function generateStaticParams() {
  return (await publicCourses()).map((c) => ({ course: c.id }));
}

type Params = { params: Promise<{ course: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const course = await publicCourse((await params).course);
  if (!course) return {};
  const title = `${course.name} Review: Free Lessons for All ${course.units.length} Units`;
  const description = `Free ${course.name} review, unit by unit: ${course.topicCount} topic lessons with notes, key equations, two worked examples each and the mistakes students make.`;
  return {
    title,
    description,
    alternates: { canonical: course.href },
    openGraph: { title: `${title} • Scorpio`, description, url: course.href, images: OG_IMAGE },
    twitter: { card: "summary_large_image", title: `${title} • Scorpio`, description },
  };
}

export default async function CourseLessonsPage({ params }: Params) {
  const { course: courseId } = await params;
  const [course, all] = await Promise.all([publicCourse(courseId), publicCourses()]);
  if (!course) notFound();
  const first = course.units[0]?.topics[0];

  return (
    <div data-lessons-enter>
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "Course",
            name: `${course.name} lessons`,
            description: course.description,
            url: `${SITE}${course.href}`,
            isAccessibleForFree: true,
            inLanguage: "en",
            provider: { "@type": "Organization", name: "Scorpio", url: SITE },
            hasCourseInstance: { "@type": "CourseInstance", courseMode: "online" },
            offers: { "@type": "Offer", price: 0, priceCurrency: "USD", category: "Free" },
          },
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Lessons", item: `${SITE}/lessons` },
              {
                "@type": "ListItem",
                position: 2,
                name: course.name,
                item: `${SITE}${course.href}`,
              },
            ],
          },
        ]}
      />

      {/* ── Course header ────────────────────────────────────────────── */}
      <section aria-labelledby="course-heading" className="relative border-b border-border/60">
        <div className={cn(wrap, "relative pb-12 pt-10 sm:pb-16 sm:pt-14")}>
          <Breadcrumbs items={[{ label: "Lessons", href: "/lessons" }, { label: course.name }]} />

          {/* The other courses, one click away. */}
          <nav aria-label="Courses" className="mt-8 -mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
            <ul role="list" className="flex w-max list-none gap-2">
              {all.map((c) => (
                <li key={c.id}>
                  <Link
                    href={c.href}
                    aria-current={c.id === course.id ? "page" : undefined}
                    className={cn(
                      "inline-flex h-9 items-center rounded-full border px-4 text-sm transition-colors",
                      c.id === course.id
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                    )}
                  >
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="mt-10 grid gap-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <div>
              <h1
                id="course-heading"
                className="text-balance text-[clamp(2.2rem,4.6vw,3.6rem)] font-medium leading-[1.05] tracking-[-0.045em]"
              >
                {course.name}
              </h1>
              <p className="mt-4 max-w-[60ch] text-pretty text-lg leading-relaxed text-muted-foreground">
                {course.description}
              </p>
              <p className="mt-4 text-sm tabular-nums text-muted-foreground">
                {course.units.length} units · {course.topicCount} topic lessons · free to read
              </p>
            </div>
            {first && <PrimaryPill href={first.href}>Start with {first.id}</PrimaryPill>}
          </div>
        </div>
      </section>

      {/* ── Units ────────────────────────────────────────────────────── */}
      <div
        className={cn(
          wrap,
          "grid grid-cols-[minmax(0,1fr)] gap-10 py-14 sm:py-20 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-16",
        )}
      >
        <nav aria-label="Units" className="hidden lg:block">
          <div className="sticky top-24 transition-[top] duration-300 ease-out motion-reduce:transition-none [html[data-header-hidden]_&]:top-10">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Units
            </p>
            <ol role="list" className="list-none space-y-0.5 border-l border-border">
              {course.units.map((u) => (
                <li key={u.unit}>
                  <a
                    href={`#unit-${u.unit}`}
                    className="-ml-px flex gap-3 border-l border-transparent py-1.5 pl-4 text-sm text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
                  >
                    <span className="w-4 shrink-0 font-mono text-xs leading-5 tabular-nums text-primary">
                      {u.unit}
                    </span>
                    <span className="leading-5">{u.title}</span>
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </nav>

        <ol role="list" className="list-none space-y-16 sm:space-y-20">
          {course.units.map((u) => (
            <li key={u.unit} id={`unit-${u.unit}`} className="scroll-mt-24">
              <section aria-labelledby={`unit-${u.unit}-heading`}>
                <header className="grid gap-x-6 gap-y-2 sm:grid-cols-[4.5rem_minmax(0,1fr)]">
                  <p className="font-mono text-sm tabular-nums text-primary sm:pt-1.5">
                    Unit {String(u.unit).padStart(2, "0")}
                  </p>
                  <div>
                    <h2
                      id={`unit-${u.unit}-heading`}
                      className="text-[clamp(1.4rem,2.4vw,1.85rem)] font-medium leading-tight tracking-[-0.03em]"
                    >
                      <Link href={u.href} className="transition-colors hover:text-primary">
                        {u.title}
                      </Link>
                    </h2>
                    <p className="mt-2 max-w-[62ch] text-pretty text-muted-foreground">
                      {u.summary}
                    </p>
                    <Link
                      href={u.href}
                      className="group mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Unit review and equations
                      <ClickIcon
                        icon={AnimatedArrowRight}
                        aria-hidden
                        className="size-4 transition-transform group-hover:translate-x-0.5"
                      />
                    </Link>
                  </div>
                </header>

                <ol
                  role="list"
                  className="mt-6 list-none divide-y divide-border overflow-hidden rounded-2xl border border-border sm:ml-[6rem]"
                >
                  {u.topics.map((t) => (
                    <li key={t.id}>
                      <Link
                        href={t.href}
                        className="group flex items-start gap-4 bg-background px-5 py-4 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none sm:px-6"
                      >
                        <span className="mt-0.5 w-9 shrink-0 font-mono text-sm tabular-nums text-muted-foreground transition-colors group-hover:text-primary">
                          {t.id}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium leading-snug">{t.title}</span>
                          <span className="mt-1 line-clamp-2 block text-pretty text-sm text-muted-foreground">
                            {t.summary}
                          </span>
                        </span>
                        <ClickIcon
                          icon={AnimatedArrowRight}
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
        <AccountBand next="/student/study" />
      </div>
    </div>
  );
}
