"use client";

// One AP topic's guide, for teachers (unit guide, "What it covers") and students
// (/student/courses/{course}/{unit}). The content is src/data/guides; the sections come in the
// order of the schema (src/lib/guides/schema.ts). Text goes through the app's Markdown renderer, so
// $…$ math and ```dg diagrams work in every field.
import { useId, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Check, ChevronDown, X } from "lucide-react";
import { apCourseName, apTopic, apTopicLabel, misconceptionTag, type ApCourseId } from "@/data/ap";
import { misconceptionAnchor } from "@/lib/guides";
import type { TopicGuide as TopicGuideData, WorkedExample } from "@/lib/guides/schema";
import { defaultValues, fillTemplate, formatValue, type TryItParam } from "@/lib/guides/try-it";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Diagram, DiagramExport } from "@/components/diagram";
import { LazyMarkdownRenderer } from "@/components/lazy-markdown-renderer";

export interface PracticeLink {
  /** "4B · Impulse and change in momentum" */
  label: string;
  href: string;
  /** For a link that stays on the page (the teacher's unit guide switches tab). */
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}

export interface TopicGuideProps {
  guide: TopicGuideData;
  /** The AP course the topic belongs to; names the prerequisite topics. Default: AP Physics 1. */
  course?: ApCourseId;
  /** Shows the teacher notes and names the misconception tags. Never set for students. */
  teacher?: boolean;
  /** "Practise this" links: sets for a teacher, the class's assignments for a student. */
  practice?: PracticeLink[];
  /** Where a prerequisite topic's guide is, when it has one; without it the topic is plain text. */
  prerequisiteHref?: (topicId: string) => string | undefined;
  /** Level of the section headings ("Equations"); titles inside a section are one lower. */
  headingLevel?: 2 | 3 | 4;
  className?: string;
}

type Level = 2 | 3 | 4 | 5;
type HeadingTag = "h2" | "h3" | "h4" | "h5";

function Heading({
  level,
  className,
  children,
}: {
  level: Level;
  className?: string;
  children: ReactNode;
}) {
  const Tag = `h${level}` as HeadingTag;
  return <Tag className={className}>{children}</Tag>;
}

function Section({ level, title, children }: { level: Level; title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <Heading level={level} className="text-base font-semibold tracking-tight">
        {title}
      </Heading>
      {children}
    </section>
  );
}

function Md({ children, className }: { children: string; className?: string }) {
  return <LazyMarkdownRenderer className={className}>{children}</LazyMarkdownRenderer>;
}

/** A button that shows and hides what it controls. Closed, the content is not rendered at all. */
export function Reveal({
  show,
  hide,
  defaultOpen = false,
  children,
}: {
  show: string;
  hide: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        <ChevronDown className={cn("transition-transform", open && "rotate-180")} aria-hidden />
        {open ? hide : show}
      </Button>
      <div id={id}>{open && children}</div>
    </div>
  );
}

function EquationCard({ equation }: { equation: TopicGuideData["equations"][number] }) {
  return (
    <li className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="overflow-x-auto">
        {/* On its own lines, so it is typeset as display math. */}
        <Md>{["$$", equation.latex, "$$"].join("\n")}</Md>
      </div>
      <Md>{equation.meaning}</Md>
      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
        {equation.variables.map((v) => (
          <div key={v.symbol} className="contents">
            <dt>
              <Md>{`$${v.symbol}$`}</Md>
            </dt>
            <dd className="text-muted-foreground">
              {v.name}
              {v.unit && ` (${v.unit})`}
            </dd>
          </div>
        ))}
      </dl>
      <dl className="space-y-2 border-t border-border pt-3 text-sm">
        <div>
          <dt className="font-medium text-green-700 dark:text-green-400">Use it when</dt>
          <dd>
            <Md>{equation.useWhen}</Md>
          </dd>
        </div>
        <div>
          <dt className="font-medium text-amber-700 dark:text-amber-400">Not when</dt>
          <dd>
            <Md>{equation.notWhen}</Md>
          </dd>
        </div>
      </dl>
    </li>
  );
}

/**
 * A worked example. "stepped" starts with only the problem and shows one more step per press, then
 * the answer; "ap" is written out in full, the way an exam answer is.
 */
export function WorkedExampleCard({
  example,
  level,
  initialShown = 0,
}: {
  example: WorkedExample;
  level: Level;
  /** Steps already showing (stepped examples only). */
  initialShown?: number;
}) {
  const total = example.steps.length;
  const stepped = example.style === "stepped";
  const [shown, setShown] = useState(stepped ? Math.min(initialShown, total) : total);
  const done = shown >= total;
  return (
    <li className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <Heading level={level} className="text-sm font-semibold">
          {example.title}
        </Heading>
        <span className="text-xs text-muted-foreground">
          {stepped ? "Step by step" : "Written as an exam answer"}
        </span>
      </div>
      <Md>{example.prompt}</Md>
      {shown > 0 && (
        <ol className="space-y-2">
          {example.steps.slice(0, shown).map((step, i) => (
            <li key={i} className="flex gap-3">
              <span
                aria-hidden
                className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums"
              >
                {i + 1}
              </span>
              <span className="sr-only">Step {i + 1}:</span>
              <div className="min-w-0 flex-1">
                <Md>{step}</Md>
              </div>
            </li>
          ))}
        </ol>
      )}
      {stepped && !done && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={() => setShown((n) => n + 1)}>
            {shown === 0 ? "Show the first step" : "Next step"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setShown(total)}>
            Show all
          </Button>
          <span aria-live="polite" className="text-xs text-muted-foreground">
            {shown} of {total} steps
          </span>
        </div>
      )}
      {done && (
        <div className="rounded-xl bg-muted/50 px-3 py-2">
          <p className="text-xs font-medium text-muted-foreground">Answer</p>
          <Md>{example.answer}</Md>
        </div>
      )}
    </li>
  );
}

/** A diagram with one slider per parameter; moving a slider redraws it. */
export function TryIt({ tryIt }: { tryIt: NonNullable<TopicGuideData["tryIt"]> }) {
  const [values, setValues] = useState(() => defaultValues(tryIt.params));
  const id = useId();
  const source = useMemo(() => {
    try {
      return fillTemplate(tryIt.diagram, values);
    } catch {
      return ""; // drawn as "Diagram not available"
    }
  }, [tryIt.diagram, values]);
  const set = (p: TryItParam, value: number) => setValues((v) => ({ ...v, [p.name]: value }));
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      {tryIt.caption && <Md>{tryIt.caption}</Md>}
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {tryIt.params.map((p) => (
          <div key={p.name} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <label htmlFor={`${id}-${p.name}`} className="font-medium">
                {p.label}
              </label>
              <output htmlFor={`${id}-${p.name}`} className="tabular-nums text-muted-foreground">
                {formatValue(values[p.name])} {p.unit}
              </output>
            </div>
            <input
              id={`${id}-${p.name}`}
              type="range"
              min={p.min}
              max={p.max}
              step={p.step}
              value={values[p.name]}
              onChange={(e) => set(p, Number(e.target.value))}
              aria-valuetext={`${formatValue(values[p.name])} ${p.unit}`.trim()}
              className="h-6 w-full cursor-pointer accent-primary"
            />
          </div>
        ))}
      </div>
      <Diagram source={source} />
    </div>
  );
}

/** Guide diagrams can be copied or saved as images (the picture also as a share card). */
export function TopicGuide(props: TopicGuideProps) {
  return (
    <DiagramExport>
      <TopicGuideBody {...props} />
    </DiagramExport>
  );
}

function TopicGuideBody({
  guide,
  course,
  teacher = false,
  practice = [],
  prerequisiteHref,
  headingLevel = 3,
  className,
}: TopicGuideProps) {
  const level = headingLevel;
  const inner = (level + 1) as Level;
  return (
    <div className={cn("min-w-0 space-y-6", className)}>
      <section className="space-y-1 rounded-2xl border border-primary/25 bg-primary/5 px-4 py-3">
        <Heading
          level={level}
          className="text-xs font-semibold uppercase tracking-wider text-primary"
        >
          Big idea
        </Heading>
        <Md className="prose-base font-medium">{guide.bigIdea}</Md>
      </section>

      {guide.picture && (
        <div>
          <Diagram
            source={guide.picture.diagram}
            exportable
            share={{
              title: apTopic(guide.topic, course)?.title ?? `Topic ${guide.topic}`,
              course: apCourseName(course),
              topic: guide.topic,
            }}
          />
          <Md className="text-muted-foreground">{guide.picture.caption}</Md>
        </div>
      )}

      <Section level={level} title="Explanation">
        <Md>{guide.explanation}</Md>
      </Section>

      {guide.equations.length > 0 && (
        <Section level={level} title="Equations">
          <ul className="grid gap-3 lg:grid-cols-2">
            {guide.equations.map((e) => (
              <EquationCard key={e.latex} equation={e} />
            ))}
          </ul>
        </Section>
      )}

      {guide.derivation && (
        <Section level={level} title="Where it comes from">
          <Reveal show="Show the derivation" hide="Hide the derivation">
            <Md>{guide.derivation}</Md>
          </Reveal>
        </Section>
      )}

      <Section level={level} title="Worked examples">
        <ol className="space-y-3">
          {guide.workedExamples.map((w) => (
            <WorkedExampleCard key={w.title} example={w} level={inner} />
          ))}
        </ol>
      </Section>

      <Section level={level} title="Common mistakes">
        <ul className="space-y-3">
          {guide.misconceptions.map((m, i) => (
            <li
              key={m.wrong}
              // The first entry of a tag is where a graded answer's "common mistake" link lands.
              id={
                m.tag && guide.misconceptions.findIndex((o) => o.tag === m.tag) === i
                  ? misconceptionAnchor(guide.topic, m.tag)
                  : undefined
              }
              className="scroll-mt-24 space-y-2 rounded-2xl border border-border bg-card p-4"
            >
              <div className="flex gap-3">
                <X className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-destructive">Mistake</p>
                  <Md>{m.wrong}</Md>
                </div>
              </div>
              <div className="flex gap-3">
                <Check className="mt-0.5 size-4 shrink-0 text-green-600" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-green-700 dark:text-green-400">
                    What is true
                  </p>
                  <Md>{m.right}</Md>
                </div>
              </div>
              {teacher && m.tag && (
                <p className="text-xs text-muted-foreground">
                  In reports: {misconceptionTag(m.tag)?.label ?? m.tag}
                </p>
              )}
            </li>
          ))}
        </ul>
      </Section>

      <Section level={level} title="Check yourself">
        <ol className="space-y-3">
          {guide.checkYourself.map((c, i) => (
            <li key={c.q} className="space-y-2 rounded-2xl border border-border bg-card p-4">
              <div className="flex gap-3">
                <span className="text-sm font-semibold tabular-nums text-muted-foreground">
                  {i + 1}.
                </span>
                <div className="min-w-0 flex-1">
                  <Md>{c.q}</Md>
                </div>
              </div>
              <Reveal show="Show answer" hide="Hide answer">
                <Md>{c.a}</Md>
              </Reveal>
            </li>
          ))}
        </ol>
      </Section>

      {guide.tryIt && (
        <Section level={level} title="Try it">
          <TryIt tryIt={guide.tryIt} />
        </Section>
      )}

      {guide.prerequisites && guide.prerequisites.length > 0 && (
        <Section level={level} title="Builds on">
          <ul className="flex flex-wrap gap-2 text-sm">
            {guide.prerequisites.map((id) => {
              const href = prerequisiteHref?.(id);
              const label = apTopicLabel(id, course);
              return (
                <li key={id} className="rounded-full border border-border px-3 py-1">
                  {href ? (
                    <Link href={href} className="underline-offset-2 hover:underline">
                      {label}
                    </Link>
                  ) : (
                    label
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {teacher && guide.teacherNotes && (
        <section className="space-y-2 rounded-2xl border border-dashed border-border bg-muted/40 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Heading level={level} className="text-base font-semibold tracking-tight">
              Teaching notes
            </Heading>
            <span className="text-xs text-muted-foreground">Only teachers see this</span>
          </div>
          <Md>{guide.teacherNotes}</Md>
        </section>
      )}

      {practice.length > 0 && (
        <Section level={level} title="Practise this">
          <ul className="flex flex-wrap gap-2">
            {practice.map((p) => (
              <li key={p.href}>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="h-auto min-h-8 whitespace-normal py-1.5 text-left"
                >
                  <Link href={p.href} onClick={p.onClick}>
                    {p.label} <ArrowRight aria-hidden />
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
