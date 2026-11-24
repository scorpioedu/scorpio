// A unit's review page (/lessons/<course>/unit-<n>): the unit's topics with their big ideas, then
// every key equation of the unit in one place. Built for searches like "AP Physics 1 unit 3 review"
// and "unit 3 equations". Server component; same plain style as the course page.
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { PrimaryPill } from "@/components/landing/split-kit";
import { plainText, type PublicUnitPage } from "@/lib/guides/public";
import { cn } from "@/lib/utils";
import { Breadcrumbs, JsonLd, OG_IMAGE, PracticeBand, SITE, wrap } from "./lessons-ui";

export function unitReviewMetadata(page: PublicUnitPage): Metadata {
  const { course, unit } = page;
  const title = `${course.name} Unit ${unit.unit} Review: ${unit.title}`;
  const equationCount = page.topics.reduce((n, t) => n + t.equations.length, 0);
  const description = plainText(
    `Free ${course.name} Unit ${unit.unit} review: ${unit.summary} ${unit.topics.length} topic lessons and all ${equationCount} key equations, with worked examples.`,
    158,
  );
  return {
    title,
    description,
    alternates: { canonical: unit.href },
    openGraph: { title: `${title} • Scorpio`, description, url: unit.href, images: OG_IMAGE },
    twitter: { card: "summary_large_image", title, description },
  };
}

export function UnitReview({ page }: { page: PublicUnitPage }) {
  const { course, unit, topics, prev, next } = page;
  const withEquations = topics.filter((t) => t.equations.length > 0);

  return (
    <div data-lessons-enter>
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "LearningResource",
            name: `${course.name} Unit ${unit.unit}: ${unit.title}`,
            description: unit.summary,
            url: `${SITE}${unit.href}`,
            learningResourceType: "Unit review",
            educationalLevel: "High school (AP)",
            inLanguage: "en",
            isAccessibleForFree: true,
            isPartOf: {
              "@type": "Course",
              name: `${course.name} lessons`,
              url: `${SITE}${course.href}`,
            },
            hasPart: topics.map((t) => ({
              "@type": "LearningResource",
              name: `${t.id} ${t.title}`,
              url: `${SITE}${t.href}`,
            })),
            publisher: { "@type": "Organization", name: "Scorpio", url: SITE },
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
              { "@type": "ListItem", position: 3, name: `Unit ${unit.unit}: ${unit.title}` },
            ],
          },
        ]}
      />

      {/* ── Header ───────────────────────────────────────────────────── */}
      <section aria-labelledby="unit-heading" className="border-b border-border/60">
        <div className={cn(wrap, "pb-12 pt-10 sm:pb-16 sm:pt-14")}>
          <Breadcrumbs
            items={[
              { label: "Lessons", href: "/lessons" },
              { label: course.name, href: course.href },
              { label: `Unit ${unit.unit}` },
            ]}
          />
          <div className="mt-10 grid gap-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <div>
              <p className="font-mono text-sm tabular-nums text-primary">
                {course.name} · Unit {String(unit.unit).padStart(2, "0")}
              </p>
              <h1
                id="unit-heading"
                className="mt-2 text-balance text-[clamp(2.2rem,4.6vw,3.6rem)] font-medium leading-[1.05] tracking-[-0.045em]"
              >
                {unit.title}
              </h1>
              <p className="mt-4 max-w-[60ch] text-pretty text-lg leading-relaxed text-muted-foreground">
                {unit.summary}
              </p>
              <p className="mt-4 text-sm tabular-nums text-muted-foreground">
                {topics.length} topic lessons ·{" "}
                {withEquations.reduce((n, t) => n + t.equations.length, 0)} key equations · free to
                read
              </p>
            </div>
            {topics[0] && (
              <PrimaryPill href={topics[0].href}>Start with {topics[0].id}</PrimaryPill>
            )}
          </div>
        </div>
      </section>

      <div className={cn(wrap, "space-y-16 py-14 sm:space-y-20 sm:py-20")}>
        {/* ── Topics ───────────────────────────────────────────────── */}
        <section aria-labelledby="topics-heading">
          <h2
            id="topics-heading"
            className="text-[clamp(1.4rem,2.4vw,1.85rem)] font-medium leading-tight tracking-[-0.03em]"
          >
            Topics in this unit
          </h2>
          <ol
            role="list"
            className="mt-6 list-none divide-y divide-border overflow-hidden rounded-2xl border border-border"
          >
            {topics.map((t) => (
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
                    <MarkdownRenderer className="prose-sm mt-1 max-w-none text-pretty text-muted-foreground [&_p]:my-0">
                      {t.bigIdea}
                    </MarkdownRenderer>
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

        {/* ── Key equations ────────────────────────────────────────── */}
        {withEquations.length > 0 && (
          <section aria-labelledby="equations-heading">
            <h2
              id="equations-heading"
              className="text-[clamp(1.4rem,2.4vw,1.85rem)] font-medium leading-tight tracking-[-0.03em]"
            >
              Unit {unit.unit} equations
            </h2>
            <p className="mt-2 max-w-[60ch] text-muted-foreground">
              Every equation from the unit&apos;s lessons, with what it says. Open a topic for when
              to use each one and when not to.
            </p>
            <div className="mt-6 space-y-10">
              {withEquations.map((t) => (
                <div key={t.id}>
                  <h3 className="flex items-baseline gap-3 text-base font-medium">
                    <span className="font-mono text-sm tabular-nums text-muted-foreground">
                      {t.id}
                    </span>
                    <Link
                      href={t.href}
                      className="underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
                    >
                      {t.title}
                    </Link>
                  </h3>
                  <ul role="list" className="mt-3 grid list-none gap-3 md:grid-cols-2">
                    {t.equations.map((e) => (
                      <li key={e.latex} className="rounded-2xl border border-border p-4">
                        <div className="overflow-x-auto">
                          <MarkdownRenderer className="[&_.katex-display]:my-1 [&_p]:my-0">
                            {["$$", e.latex, "$$"].join("\n")}
                          </MarkdownRenderer>
                        </div>
                        <MarkdownRenderer className="prose-sm mt-2 max-w-none text-muted-foreground [&_p]:my-0">
                          {e.meaning}
                        </MarkdownRenderer>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        <PracticeBand
          heading={`Practice Unit ${unit.unit} with feedback`}
          line="Each unit's problem sets grade themselves, and Raise hints at the next step instead of giving the answer."
        />

        {(prev || next) && (
          <nav aria-label="Previous and next unit" className="grid gap-3 sm:grid-cols-2">
            {prev ? <UnitLink dir="prev" unit={prev} /> : <span aria-hidden />}
            {next && <UnitLink dir="next" unit={next} />}
          </nav>
        )}
      </div>
    </div>
  );
}

function UnitLink({
  dir,
  unit,
}: {
  dir: "prev" | "next";
  unit: { unit: number; title: string; href: string };
}) {
  return (
    <Link
      href={unit.href}
      className={cn(
        "group flex flex-col gap-1.5 rounded-2xl border border-border p-5 transition-colors hover:bg-muted/40",
        dir === "next" && "text-right sm:col-start-2",
      )}
    >
      <span
        className={cn(
          "inline-flex items-center gap-1 text-xs text-muted-foreground",
          dir === "next" && "self-end",
        )}
      >
        {dir === "prev" && <ArrowLeft aria-hidden className="size-3.5" />}
        {dir === "prev" ? "Previous unit" : "Next unit"}
        {dir === "next" && <ArrowRight aria-hidden className="size-3.5" />}
      </span>
      <span className="font-medium leading-snug">
        <span className="font-mono text-sm tabular-nums text-muted-foreground">{unit.unit}</span>{" "}
        {unit.title}
      </span>
    </Link>
  );
}
