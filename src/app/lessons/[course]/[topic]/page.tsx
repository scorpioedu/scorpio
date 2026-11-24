import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Flag } from "lucide-react";
import { LessonNav, type NavSection } from "@/components/lessons/lesson-nav";
import { LessonTopic } from "@/components/lessons/lesson-topic";
import { UnitReview, unitReviewMetadata } from "@/components/lessons/unit-review";
import {
  Breadcrumbs,
  JsonLd,
  OG_IMAGE,
  PracticeBand,
  SITE,
  wrap,
} from "@/components/lessons/lessons-ui";
import { guideSectionId } from "@/lib/guides";
import {
  isUnitSlug,
  plainText,
  publicCourses,
  publicTopicPage,
  publicUnitPage,
  type PublicTopicPage,
} from "@/lib/guides/public";
import type { TopicGuide } from "@/lib/guides/schema";
import { cn } from "@/lib/utils";

export const dynamicParams = false;

// One segment serves two kinds of page: "unit-3" is a unit review, "3-4-…" a topic lesson.
export async function generateStaticParams() {
  return (await publicCourses()).flatMap((c) =>
    c.units.flatMap((u) => [
      { course: c.id, topic: u.slug },
      ...u.topics.map((t) => ({ course: c.id, topic: t.slug })),
    ]),
  );
}

type Params = { params: Promise<{ course: string; topic: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { course, topic } = await params;
  if (isUnitSlug(topic)) {
    const unitPage = await publicUnitPage(course, topic);
    return unitPage ? unitReviewMetadata(unitPage) : {};
  }
  const page = await publicTopicPage(course, topic);
  if (!page) return {};
  // Worded the way students search: the topic first, then the course and "review".
  const title = `${page.topic.title}: ${page.course.name} ${page.topic.id} Review`;
  const description = plainText(
    `${page.topic.title} for ${page.course.name} (topic ${page.topic.id}): ${page.guide.bigIdea} Key equations, worked examples and common mistakes.`,
    158,
  );
  return {
    title,
    description,
    alternates: { canonical: page.topic.href },
    openGraph: {
      title: `${title} • Scorpio`,
      description,
      url: page.topic.href,
      type: "article",
      images: OG_IMAGE,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

/** The guide's sections in the order TopicGuide draws them, for the contents. */
function sectionsOf(guide: TopicGuide): NavSection[] {
  const titles = [
    "Explanation",
    guide.equations.length > 0 && "Equations",
    guide.derivation && "Where it comes from",
    "Worked examples",
    "Common mistakes",
    "Check yourself",
    guide.tryIt && "Try it",
    guide.prerequisites?.length && "Builds on",
  ].filter((t): t is string => typeof t === "string");
  return titles.map((title) => ({ id: guideSectionId(title), title }));
}

function minutesToRead(guide: TopicGuide): number {
  const text = [
    guide.bigIdea,
    guide.explanation,
    guide.derivation ?? "",
    ...guide.equations.map((e) => `${e.meaning} ${e.useWhen} ${e.notWhen}`),
    ...guide.workedExamples.map((w) => `${w.prompt} ${w.steps.join(" ")} ${w.answer}`),
    ...guide.misconceptions.map((m) => `${m.wrong} ${m.right}`),
    ...guide.checkYourself.map((c) => c.q),
  ].join(" ");
  return Math.max(2, Math.round(text.split(/\s+/).length / 180));
}

export default async function LessonPage({ params }: Params) {
  const { course: courseId, topic: slug } = await params;
  if (isUnitSlug(slug)) {
    const unitPage = await publicUnitPage(courseId, slug);
    if (!unitPage) notFound();
    return <UnitReview page={unitPage} />;
  }
  const page = await publicTopicPage(courseId, slug);
  if (!page) notFound();
  return <TopicLesson page={page} />;
}

function TopicLesson({ page }: { page: PublicTopicPage }) {
  const { course, unit, topic, guide, prev, next } = page;

  const allTopics = course.units.flatMap((u) => u.topics);
  const prerequisites = Object.fromEntries(
    (guide.prerequisites ?? []).flatMap((id) => {
      const t = allTopics.find((x) => x.id === id);
      return t ? [[id, t.href]] : [];
    }),
  );
  const sections = sectionsOf(guide);

  return (
    <>
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "LearningResource",
            name: `${topic.id} ${topic.title}`,
            description: plainText(guide.bigIdea, 300),
            url: `${SITE}${topic.href}`,
            learningResourceType: "Lesson",
            educationalLevel: "High school (AP)",
            audience: { "@type": "EducationalAudience", educationalRole: "student" },
            educationalAlignment: {
              "@type": "AlignmentObject",
              alignmentType: "educationalSubject",
              targetName: `${course.name}, Unit ${unit.unit}: ${unit.title}`,
            },
            timeRequired: `PT${minutesToRead(guide)}M`,
            keywords: [
              topic.title,
              course.name,
              `${course.name} unit ${unit.unit}`,
              "AP Physics review",
            ].join(", "),
            inLanguage: "en",
            isAccessibleForFree: true,
            teaches: topic.title,
            isPartOf: {
              "@type": "Course",
              name: `${course.name} lessons`,
              url: `${SITE}${course.href}`,
            },
            provider: { "@type": "Organization", name: "Scorpio", url: SITE },
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
              {
                "@type": "ListItem",
                position: 3,
                name: `Unit ${unit.unit}: ${unit.title}`,
                item: `${SITE}${unit.href}`,
              },
              { "@type": "ListItem", position: 4, name: `${topic.id} ${topic.title}` },
            ],
          },
        ]}
      />

      <div
        className={cn(
          wrap,
          "grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[15.5rem_minmax(0,1fr)] lg:gap-14 lg:pt-10",
        )}
      >
        <LessonNav
          curriculumId={course.id}
          courses={page.courses}
          courseName={course.name}
          courseHref={course.href}
          units={course.units.map((u) => ({
            unit: u.unit,
            title: u.title,
            href: u.topics[0].href,
          }))}
          unit={unit.unit}
          topics={unit.topics.map((t) => ({ id: t.id, title: t.title, href: t.href }))}
          active={topic.id}
          sections={sections}
        />

        <article data-lessons-enter className="min-w-0 max-w-3xl pb-20 pt-8 sm:pb-28 lg:pt-0">
          <header className="border-b border-border pb-8">
            <Breadcrumbs
              items={[
                { label: "Lessons", href: "/lessons" },
                { label: course.name, href: course.href },
                { label: `Unit ${unit.unit}`, href: unit.href },
              ]}
            />
            <p className="mt-8 font-mono text-sm tabular-nums text-primary">Topic {topic.id}</p>
            <h1 className="mt-2 text-balance text-[clamp(2rem,4.2vw,3.1rem)] font-medium leading-[1.06] tracking-[-0.04em]">
              {topic.title}
            </h1>
            <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">
              {topic.summary}
            </p>
            <p className="mt-5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span>{minutesToRead(guide)} min read</span>
              <span aria-hidden>·</span>
              <span>{guide.workedExamples.length} worked examples</span>
              <span aria-hidden>·</span>
              <span>{guide.checkYourself.length} questions to check yourself</span>
            </p>
          </header>

          <div className="pt-8">
            <LessonTopic
              curriculumId={course.id}
              course={course.apCourse}
              guide={guide}
              prerequisites={prerequisites}
            />
          </div>

          <PracticeBand
            className="mt-16"
            heading={`Practice ${topic.id} with feedback`}
            line={`Problem sets for Unit ${unit.unit} grade themselves, and Raise hints at the next step instead of giving the answer.`}
          />

          {(prev || next) && (
            <nav aria-label="Previous and next lesson" className="mt-10 grid gap-3 sm:grid-cols-2">
              {prev ? (
                <StepLink dir="prev" href={prev.href} id={prev.id} title={prev.title} />
              ) : (
                <span aria-hidden />
              )}
              {next && <StepLink dir="next" href={next.href} id={next.id} title={next.title} />}
            </nav>
          )}

          <p className="mt-10 flex items-start gap-2 text-sm text-muted-foreground">
            <Flag aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>
              Spotted a mistake in this lesson?{" "}
              <Link
                href="/contact"
                className="font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
              >
                Tell us
              </Link>{" "}
              and we will fix it.
            </span>
          </p>
        </article>
      </div>
    </>
  );
}

function StepLink({
  dir,
  href,
  id,
  title,
}: {
  dir: "prev" | "next";
  href: string;
  id: string;
  title: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex flex-col gap-1.5 rounded-2xl border border-border p-5 transition-[transform,border-color,background-color] duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-muted/40 motion-reduce:hover:translate-y-0",
        dir === "next" && "text-right sm:col-start-2",
      )}
    >
      <span
        className={cn(
          "inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors group-hover:text-primary",
          dir === "next" && "self-end",
        )}
      >
        {dir === "prev" && (
          <ArrowLeft
            aria-hidden
            className="size-3.5 transition-transform group-hover:-translate-x-0.5"
          />
        )}
        {dir === "prev" ? "Previous" : "Next"}
        {dir === "next" && (
          <ArrowRight
            aria-hidden
            className="size-3.5 transition-transform group-hover:translate-x-0.5"
          />
        )}
      </span>
      <span className="font-medium leading-snug">
        <span className="font-mono text-sm tabular-nums text-muted-foreground">{id}</span> {title}
      </span>
    </Link>
  );
}
