"use client";

import Image from "next/image";
import { DocHeader, DocSection, DocList, docLink } from "@/components/docs-prose";
import { GitHubActivity } from "./github-activity";

const capabilities = [
  {
    term: "Courses and Study",
    description:
      "A problem set and a lesson for every AP Physics unit. Every course problem has been checked by a person, answers are marked as students work, and a wrong answer names the mix-up behind it. None of this uses AI.",
  },
  {
    term: "Optional AI",
    description:
      "AI is off for students unless their teacher turns it on for the class. When it is on, Raise gives hints instead of answers. Teachers can also use AI to draft problems and grades, and a student sees a drafted grade only after the teacher has checked it.",
  },
  {
    term: "Mathematical precision",
    description:
      "Dynamic LaTeX rendering (KaTeX) and a visual math builder ensure the language of physics is never a barrier to entry.",
  },
  {
    term: "Immersive learning",
    description:
      "A high-performance interface designed to maximize engagement and minimize cognitive load during complex problem solving.",
  },
  {
    term: "Verifiable governance",
    description:
      "A transparent 4-layer constraint architecture ensures academic integrity and pedagogical consistency at scale.",
  },
];

const waypoints = [
  {
    term: "Instructor shared",
    description: "Every Waypoint is authored by a verified Scorpio teacher, not AI-generated.",
  },
  {
    term: "Peer-validated",
    description: "Modules go through a structured review process before they enter the network.",
  },
  {
    term: "Drop-in ready",
    description: "Browse, preview, and attach Waypoints to your assignments in seconds.",
  },
];

export default function AboutClient() {
  return (
    <article className="w-full pb-20">
      <DocHeader
        title="About Scorpio"
        summary="Scorpio is AP Physics homework and study, built so students do the thinking: problems checked by a person, answers marked as they work, and AI only where a teacher chooses it."
      />

      <DocSection title="What it does">
        <DocList items={capabilities} />
      </DocSection>

      <DocSection id="waypoints" title="The Waypoints network">
        <p>
          High-precision, peer-validated physics modules built by instructors and shared across
          institutions. Drop them straight into your curriculum.
        </p>
        <DocList items={waypoints} />
      </DocSection>

      <DocSection title="Why Scorpio">
        <p>
          Most AI tools today are answer engines: they provide the result but skip the derivation.
          Scorpio is built on the philosophy that true learning happens in the struggle. So the core
          of Scorpio uses no AI at all: lessons, practice and marking are written and checked by
          people and run on plain code. Many students do not want AI in their schoolwork, and they
          should not have to use it.
        </p>
        <DocList
          items={[
            {
              term: "For students",
              description:
                "A lesson and practice for every topic, each answer checked at once, and review that brings back what you missed. No AI unless your teacher turns it on.",
            },
            {
              term: "For teachers",
              description:
                "Dashboards show where students are struggling conceptually, turning classrooms into data-driven learning labs.",
            },
          ]}
        />
      </DocSection>

      <DocSection id="philosophy" title="Philosophy">
        <p>
          We built Scorpio with one belief: a student who derives the answer will not forget it.
          Where a teacher does turn AI on, the constraint architecture holds it to the same rigor
          you apply in your classroom.
        </p>
        <p>
          There are no shortcuts. Raise is built to give hints and questions, pushing students back
          to first principles instead of handing them the answer, and an AI-drafted grade waits for
          the teacher before a student sees it. The three principles are pedagogy-first
          architecture, institutional integrity, and research-driven development.
        </p>
      </DocSection>

      <DocSection title="Founder">
        <div className="flex items-start gap-5">
          <Image
            src="/headshot-sage.jpg"
            alt="Rushil Mahadevu"
            width={88}
            height={110}
            className="h-[110px] w-[88px] shrink-0 rounded-md border border-border/60 object-cover"
          />
          <div className="space-y-3">
            <p>
              <span className="font-medium text-foreground">Rushil Mahadevu</span>, founder and
              builder (Sage Ridge &apos;28). I&apos;m a student who builds things with AI and
              physics. Most of my work lately has been on verifiable LLM systems and
              high-performance software platforms.
            </p>
            <blockquote className="border-l-2 border-border pl-4">
              I started Scorpio because I think the best way to learn is through the struggle of
              figuring things out yourself. I wanted to build something that gives everyone access
              to that kind of guidance.
            </blockquote>
          </div>
        </div>
      </DocSection>

      <GitHubActivity />

      <DocSection title="Project links">
        <p>
          <a
            href="https://github.com/RushilMahadevu/scorpio"
            target="_blank"
            rel="noopener noreferrer"
            className={docLink}
          >
            Source code on GitHub
          </a>
          {" · "}
          <a href="/research" className={docLink}>
            Read the paper
          </a>
        </p>
      </DocSection>
    </article>
  );
}
