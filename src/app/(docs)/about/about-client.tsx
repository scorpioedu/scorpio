"use client";

import Image from "next/image";
import { DocHeader, DocSection, DocList, docLink } from "@/components/docs-prose";
import { GitHubActivity } from "./github-activity";

const capabilities = [
  { term: "Socratic tutoring", description: "Moving beyond “answer engines” to pedagogical guidance. The AI helps students through the conceptual struggle instead of solving the problem for them. Built on Gemini 3.8 Flash." },
  { term: "Mathematical precision", description: "Dynamic LaTeX rendering (KaTeX) and a visual math builder ensure the language of physics is never a barrier to entry." },
  { term: "Immersive learning", description: "A high-performance interface designed to maximize engagement and minimize cognitive load during complex problem solving." },
  { term: "Verifiable governance", description: "A transparent 4-layer constraint architecture ensures academic integrity and pedagogical consistency at scale." },
];

const waypoints = [
  { term: "Instructor shared", description: "Every Waypoint is authored by a verified Scorpio teacher, not AI-generated." },
  { term: "Peer-validated", description: "Modules go through a structured review process before they enter the network." },
  { term: "Drop-in ready", description: "Browse, preview, and attach Waypoints to your assignments in seconds." },
];

export default function AboutClient() {
  return (
    <article className="w-full pb-20">
      <DocHeader
        title="About Scorpio"
        summary="Scorpio is a pedagogical framework built to reduce friction in STEM education through precise Socratic guidance."
      />

      <DocSection title="What it does">
        <DocList items={capabilities} />
      </DocSection>

      <DocSection id="waypoints" title="The Waypoints network">
        <p>
          High-precision, peer-validated physics modules built by instructors and shared across institutions. Drop them straight into your curriculum.
        </p>
        <DocList items={waypoints} />
      </DocSection>

      <DocSection title="Why Scorpio">
        <p>
          Most AI tools today are answer engines: they provide the result but skip the derivation. Scorpio is built on the philosophy that true learning happens in the struggle. By enforcing Socratic dialogue, we guide students through hints, analogies, and conceptual checkpoints, so they gain intuition and not just the answer.
        </p>
        <DocList
          items={[
            { term: "For students", description: "Reduces homework anxiety and stuck time with 24/7 Socratic assistance that adapts to their level." },
            { term: "For teachers", description: "Dashboards show where students are struggling conceptually, turning classrooms into data-driven learning labs." },
          ]}
        />
      </DocSection>

      <DocSection id="philosophy" title="Philosophy">
        <p>
          We built Scorpio with one belief: a student who derives the answer will not forget it. The constraint architecture doesn&apos;t restrict the AI; it enforces the same rigor you apply in your classroom.
        </p>
        <p>
          There are no shortcuts. Every AI response is Socratic by design, pushing students back to first principles and never handing them the next step. The three principles are pedagogy-first architecture, institutional integrity, and research-driven development.
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
              <span className="font-medium text-foreground">Rushil Mahadevu</span>, founder and builder (Sage Ridge &apos;28). I&apos;m a student who builds things with AI and physics. Most of my work lately has been on verifiable LLM systems and high-performance software platforms.
            </p>
            <blockquote className="border-l-2 border-border pl-4">
              I started Scorpio because I think the best way to learn is through the struggle of figuring things out yourself. I wanted to build something that gives everyone access to that kind of guidance.
            </blockquote>
          </div>
        </div>
      </DocSection>

      <GitHubActivity />

      <DocSection title="Project links">
        <p>
          <a href="https://github.com/RushilMahadevu/scorpio" target="_blank" rel="noopener noreferrer" className={docLink}>Source code on GitHub</a>
          {" · "}
          <a href="/research" className={docLink}>Read the paper</a>
        </p>
      </DocSection>
    </article>
  );
}
