"use client";

import Image from "next/image";
import { useRef } from "react";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import {
  card,
  CircleLink,
  PrimaryPill,
  SecondaryPill,
  Section,
  Split,
  statement,
} from "@/components/landing/split-kit";

const chapters = [
  { time: 0, label: "Tour", sub: "Classes, assignments, the student view" },
  { time: 75, label: "Hints, not answers", sub: "How Raise responds to a stuck student" },
  { time: 160, label: "Math input", sub: "Writing equations and units" },
  { time: 230, label: "Teacher workflow", sub: "Assigning, grading and reteaching" },
];

const screens = [
  {
    title: "Raise",
    body: "Students ask for help and get a question or a hint back, never the final answer.",
    src: "/ai-tutor.png",
  },
  {
    title: "Problem sets",
    body: "Pick a published set or write your own, then assign it to a class with a due date.",
    src: "/demos/teacher-editor.png",
  },
  {
    title: "Math input",
    body: "Students write equations with units, and answers are checked symbolically.",
    src: "/demos/math-builder.png",
  },
  {
    title: "Class results",
    body: "See who is stuck, on which step, and what to reteach tomorrow.",
    src: "/dashboard.png",
  },
];

const stats = [
  { value: "0%", label: "Answers given away", desc: "25 physics problems, all Raise rules on" },
  { value: "4.62 / 5", label: "Teaching quality", desc: "Blind review by a physics PhD" },
  { value: "0.92", label: "Math notation", desc: "Typeset symbols per 100 words" },
  { value: "625", label: "Test runs", desc: "Internal checks of Raise's rules" },
];

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function DemosPage() {
  const videoRef = useRef<HTMLVideoElement>(null);

  const seekTo = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = seconds;
      videoRef.current.play().catch(() => {});
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main className="overflow-x-clip pt-14">
        {/* ── Intro + video ─────────────────────────────────────────────── */}
        <Section labelledBy="demos-heading">
          <Split id="demos-heading" heading="Demos">
            <p className={statement}>
              See Scorpio in a real class
              <span className="block text-muted-foreground">
                Watch the tour, or open the sample classroom
              </span>
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <PrimaryPill href="/demos/teacher">Open teacher demo</PrimaryPill>
              <SecondaryPill href="/ai">Test Raise</SecondaryPill>
            </div>
          </Split>

          <figure className="mt-16 sm:mt-20">
            <div className="overflow-hidden rounded-xl border border-border bg-black">
              <video
                ref={videoRef}
                controls
                preload="metadata"
                poster="/demos/scorpio-demo-poster.jpg"
                aria-label="Scorpio tour video. Chapters are listed below the video."
                className="aspect-video w-full"
              >
                <source src="/demos/scorpio-demo.webm" type="video/webm" />
                <source src="/demos/scorpio-demo.mp4" type="video/mp4" />
              </video>
            </div>
            <figcaption className="sr-only">Video chapters</figcaption>
            <ol role="list" className="mt-2 grid list-none gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {chapters.map((c) => (
                <li key={c.label}>
                  <button
                    type="button"
                    onClick={() => seekTo(c.time)}
                    className="group flex w-full flex-col rounded-xl border border-border px-4 py-3.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="text-[15px] font-medium">{c.label}</span>
                      <span className="text-sm tabular-nums text-muted-foreground group-hover:text-primary">
                        {formatTime(c.time)}
                      </span>
                    </span>
                    <span className="mt-1 text-sm text-muted-foreground">{c.sub}</span>
                  </button>
                </li>
              ))}
            </ol>
          </figure>
        </Section>

        {/* ── Try it yourself ───────────────────────────────────────────── */}
        <Section labelledBy="try-heading">
          <Split id="try-heading" heading="Try it yourself">
            <p className={statement}>
              Two demos, no account needed
              <span className="block text-muted-foreground">
                A sample class with data, and Raise answering your own questions
              </span>
            </p>
          </Split>

          <div className="mt-16 grid gap-2 sm:mt-20 md:grid-cols-2">
            <article className={`${card} flex flex-col`}>
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="text-lg font-medium">Teacher dashboard</h3>
                <span className="text-sm text-muted-foreground">Sample data</span>
              </div>
              <p className="mt-3 text-[15px] text-muted-foreground">
                Click through a physics class: assignments, grades and the reteach list.
              </p>
              <div className="mt-8 overflow-hidden rounded-lg border border-border">
                <Image
                  src="/demos/teacher-dashboard-light.webp"
                  alt="Scorpio teacher dashboard with a sample class"
                  width={1920}
                  height={1080}
                  className="h-auto w-full dark:hidden"
                />
                <Image
                  src="/demos/teacher-dashboard-dark.webp"
                  alt="Scorpio teacher dashboard with a sample class"
                  width={1920}
                  height={1080}
                  className="hidden h-auto w-full dark:block"
                />
              </div>
              <span aria-hidden="true" className="min-h-8 flex-1" />
              <CircleLink href="/demos/teacher">Open the teacher demo</CircleLink>
            </article>

            <article className={`${card} flex flex-col`}>
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="text-lg font-medium">Test Raise</h3>
                <span className="text-sm text-muted-foreground">Three questions</span>
              </div>
              <p className="mt-3 text-[15px] text-muted-foreground">
                Ask a physics question and see how Raise guides you with hints instead of
                giving the answer.
              </p>
              <div className="relative mt-8 aspect-video overflow-hidden rounded-lg border border-border">
                <Image
                  src="/ai-tutor.png"
                  alt="Raise answering a student's physics question with a hint"
                  fill
                  sizes="(min-width: 768px) 560px, 100vw"
                  className="object-cover object-left-top"
                />
              </div>
              <span aria-hidden="true" className="min-h-8 flex-1" />
              <CircleLink href="/ai">Test Raise</CircleLink>
            </article>
          </div>
        </Section>

        {/* ── Screens ───────────────────────────────────────────────────── */}
        <Section labelledBy="screens-heading">
          <Split id="screens-heading" heading="Inside Scorpio">
            <p className={statement}>
              One place for the whole unit
              <span className="block text-muted-foreground">
                What students and teachers see day to day
              </span>
            </p>
          </Split>

          <ul role="list" className="mt-16 grid list-none gap-2 sm:mt-20 md:grid-cols-2">
            {screens.map((s) => (
              <li key={s.title} className={card}>
                <h3 className="text-lg font-medium">{s.title}</h3>
                <p className="mt-2 text-[15px] text-muted-foreground">{s.body}</p>
                <div className="relative mt-6 aspect-[16/10] overflow-hidden rounded-lg border border-border bg-background">
                  <Image
                    src={s.src}
                    alt={`${s.title} in Scorpio`}
                    fill
                    sizes="(min-width: 768px) 560px, 100vw"
                    className="object-cover object-left-top"
                  />
                </div>
              </li>
            ))}
          </ul>
        </Section>

        {/* ── Results ───────────────────────────────────────────────────── */}
        <Section labelledBy="results-heading">
          <Split id="results-heading" heading="Results">
            <p className={statement}>
              Tested before it reaches a class
              <span className="block text-muted-foreground">
                How Raise did on our own test set
              </span>
            </p>
          </Split>

          <dl className="mt-16 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:mt-20 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="flex flex-col bg-background p-6">
                <dt className="text-[15px] font-medium">{s.label}</dt>
                <dd className="order-first mb-6 text-[clamp(2rem,3.4vw,2.6rem)] font-medium leading-none tracking-[-0.04em] tabular-nums">
                  {s.value}
                </dd>
                <dd className="mt-1 text-sm text-muted-foreground">{s.desc}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:gap-8">
            <CircleLink href="/research">Read the study</CircleLink>
            <CircleLink href="/demos/comprehensive_metrics.pdf" external>
              Metrics (PDF)
            </CircleLink>
          </div>
        </Section>
      </main>

      <SiteFooter />
    </div>
  );
}
