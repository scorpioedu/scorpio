"use client";

import { SiteFooter } from "@/components/landing/site-footer";
import { Split, statement } from "@/components/landing/split-kit";
import { motion } from "framer-motion";
import { SiteHeader } from "@/components/landing/site-header";
import { Button } from "@/components/ui/button";
import {
  Brain,
  Calculator,
  Waypoints,
  ShieldUser,
  Users,
  FileUp,
  ArrowRight,
  Orbit,
  SquareFunction,
  Presentation,
  Maximize2,
  Check,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from "@/components/ui/dialog";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import Image from "next/image";
import { AP_UNITS, apUnitLabel } from "@/data/ap";
import { useState } from "react";

const MATH_PRESETS = [
  {
    name: "Maxwell's Equations",
    category: "Electromagnetism",
    latex:
      "\\nabla \\times \\mathbf{E} = -\\frac{\\partial \\mathbf{B}}{\\partial t} \\quad \\text{and} \\quad \\nabla \\cdot \\mathbf{B} = 0",
    description: "Faraday's Law of Induction and Gauss's Law for Magnetism in differential form.",
  },
  {
    name: "Schrödinger Equation",
    category: "Quantum Mechanics",
    latex:
      "i\\hbar \\frac{\\partial}{\\partial t} \\Psi(\\mathbf{r}, t) = \\left[ -\\frac{\\hbar^2}{2m} \\nabla^2 + V(\\mathbf{r}, t) \\right] \\Psi(\\mathbf{r}, t)",
    description: "Time-dependent wave equation describing non-relativistic quantum states.",
  },
  {
    name: "Rotational Dynamics",
    category: "Classical Mechanics",
    latex: "\\vec{\\tau} = \\mathbf{r} \\times \\vec{F} = I\\vec{\\alpha} = \\frac{d\\vec{L}}{dt}",
    description:
      "Torque-angular momentum relation with vector cross products and moment of inertia.",
  },
  {
    name: "Relativistic Energy",
    category: "Relativity",
    latex: "E^2 = (pc)^2 + (m_0 c^2)^2 \\implies E = \\gamma m_0 c^2",
    description: "Energy-momentum invariant for particles with non-zero rest mass.",
  },
];

export default function FeaturesPage() {
  const [selectedMathIndex, setSelectedMathIndex] = useState(0);

  const features = [
    {
      icon: Brain,
      title: "4-Layer Socratic Scaffolding",
      description:
        "Hints follow four steps: diagnostic query, concept priming, guided derivation, and verification.",
      tag: "Pedagogical",
      highlight: "0% Direct Answer Rate",
    },
    {
      icon: SquareFunction,
      title: "0.92 LaTeX Notation Density",
      description:
        "Real-time, symbolic LaTeX rendering verified for professional academic standards and vector precision.",
      tag: "Mathematical",
      highlight: "Publication-Grade",
    },
    {
      icon: Orbit,
      title: "Inference-Time Guardrails",
      description:
        "No black-box retraining. Every Socratic behaviour is enforced at inference time—observable, auditable, reproducible.",
      tag: "Verifiable",
      highlight: "Audit-Ready",
    },
    {
      icon: Calculator,
      title: "Constraint-Led Derivations",
      description:
        "Students are guided through the steps, not handed solutions. Tested on 25 problems, not guaranteed for every question.",
      tag: "Architecture",
      highlight: "Tested on 25 problems",
    },
    {
      icon: Waypoints,
      title: "Waypoints Library",
      description:
        "Copy any global Waypoint, including the AP Physics 1 problem sets, into your class and edit it. Department Waypoints are shared inside your school network.",
      tag: "Library",
      highlight: "Free to copy",
    },
    {
      icon: ShieldUser,
      title: "Hints, Not Answers",
      description:
        "Raise is built to give the next step instead of the solution, so homework still shows what students know.",
      tag: "Integrity",
      highlight: "0 of 25 test questions answered directly",
    },
    {
      icon: FileUp,
      title: "Auto-Grading",
      description:
        "Numeric answers are checked with units and tolerance, multiple choice by exact match, and written answers by an AI grader. Feedback never reveals the answer key.",
      tag: "Grading",
      highlight: "Free",
    },
    {
      icon: Users,
      title: "Class Misconception Report",
      description:
        "Top misconceptions ranked by how many students showed them (for example 8 of 24), by class, assignment and AP unit.",
      tag: "Insight",
      highlight: "Free",
    },
  ];

  return (
    <div className="min-h-screen relative scroll-smooth bg-background">
      <SiteHeader />

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        <main className="relative z-10 pt-28 md:pt-36 pb-24">
          {/* Page Hero */}
          <section className="mx-auto max-w-6xl px-5 sm:px-8">
            <Split id="features-heading" heading="Features">
              <p className={statement}>
                Built for AP Physics homework
                <span className="block text-muted-foreground">
                  Hint-only tutoring, auto-grading and the class misconception report
                </span>
              </p>
            </Split>

            {/* Quick Link Pills */}
            <div className="mt-10 flex flex-wrap items-center gap-2">
              {[
                { label: "Core Architecture", target: "features-grid" },
                { label: "LaTeX Precision Engine", target: "math-fidelity" },
                { label: "Blinded Ablation Study", target: "comparison" },
                { label: "Instructional Workflows", target: "workflow" },
                { label: "Waypoints Library", target: "waypoints" },
              ].map((link) => (
                <button
                  key={link.label}
                  onClick={() => {
                    const el = document.getElementById(link.target);
                    if (el) el.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="px-3 py-1 rounded-full border border-border/50 bg-card/40 hover:bg-muted/50 text-xs text-muted-foreground hover:text-foreground transition-all cursor-pointer"
                >
                  {link.label} ↓
                </button>
              ))}
            </div>
          </section>

          {/* Feature Grid Bento */}
          <section
            id="features-grid"
            className="container mx-auto px-4 sm:px-6 max-w-6xl py-20 relative"
          >
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-primary/5 rounded-full blur-[140px] pointer-events-none -z-10" />

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {features.map((feature, i) => (
                <div
                  key={i}
                  className="group p-6 rounded-xl border border-border bg-muted/40 dark:bg-card hover:border-foreground/25 transition-all duration-300 space-y-4 flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="h-10 w-10 rounded-xl bg-background/80 border border-border flex items-center justify-center group-hover:border-primary/40 transition-colors shadow-inner">
                        <feature.icon className="h-5 w-5 text-primary" />
                      </div>
                      <Badge
                        variant="outline"
                        className="text-[9px] font-bold uppercase tracking-widest border-primary/20 text-primary/80 px-2 py-0.5"
                      >
                        {feature.tag}
                      </Badge>
                    </div>
                    <h3 className="font-bold text-base leading-snug text-foreground">
                      {feature.title}
                    </h3>
                    <p className="text-muted-foreground text-xs leading-relaxed">
                      {feature.description}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-border/30 flex items-center justify-between text-[11px] font-bold text-foreground/80">
                    <span className="text-muted-foreground/70 font-mono uppercase tracking-wider text-[10px]">
                      Benchmark
                    </span>
                    <span className="text-primary">{feature.highlight}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Interactive Math Fidelity Playground */}
          <section
            id="math-fidelity"
            className="container mx-auto px-4 sm:px-6 max-w-6xl py-20 relative"
          >
            <div className="rounded-[2.5rem] border border-border/70 bg-card/30 backdrop-blur-2xl overflow-hidden p-6 sm:p-12 lg:p-16 relative shadow-2xl">
              <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] pointer-events-none -z-10" />

              <div className="grid lg:grid-cols-12 gap-10 items-center">
                {/* Left Description */}
                <div className="lg:col-span-5 space-y-6">
                  <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full border border-primary/20 bg-primary/5 text-xs font-bold tracking-widest uppercase text-primary">
                    <SquareFunction className="h-3.5 w-3.5" />
                    <span>Mathematical Precision</span>
                  </div>
                  <h2 className="text-3xl sm:text-4xl lg:text-5xl font-medium tracking-[-0.035em] leading-none text-foreground">
                    Publication-Grade <span className="text-primary italic">Fidelity.</span>
                  </h2>
                  <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">
                    Scorpio features a dedicated KaTeX symbolic rendering pipeline designed for the
                    rigorous demands of university physics. From differential vectors to operator
                    commutators, notation is rendered instantly with 0.92 density.
                  </p>

                  <div className="space-y-2">
                    <p className="text-xs font-black uppercase tracking-wider text-muted-foreground/80">
                      Select Formula Preset
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {MATH_PRESETS.map((preset, idx) => (
                        <button
                          key={preset.name}
                          onClick={() => setSelectedMathIndex(idx)}
                          className={`p-2.5 rounded-xl border text-left text-xs font-medium transition-all cursor-pointer ${
                            selectedMathIndex === idx
                              ? "border-primary bg-primary/10 text-primary font-bold"
                              : "border-border/50 bg-background/40 hover:bg-muted/40 text-muted-foreground"
                          }`}
                        >
                          <div className="truncate">{preset.name}</div>
                          <div className="text-[10px] opacity-70 mt-0.5">{preset.category}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" className="rounded-full gap-2">
                          <Maximize2 className="h-3.5 w-3.5" /> Open Visual Math Builder Modal
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-[95vw] lg:max-w-5xl max-h-[90vh] p-2 bg-background/95 backdrop-blur-2xl border border-border shadow-2xl">
                        <DialogTitle className="text-base font-bold px-4 pt-2">
                          Scorpio Visual Math Builder
                        </DialogTitle>
                        <div className="relative w-full aspect-[16/10] max-h-[80vh] overflow-hidden rounded-xl mt-2">
                          <Image
                            src="/demos/math-builder.png"
                            alt="Scorpio Math Builder"
                            width={1200}
                            height={750}
                            className="w-full h-full object-contain"
                          />
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>

                {/* Right Interactive Live Formula Console */}
                <div className="lg:col-span-7 space-y-4">
                  <div className="rounded-2xl border border-border/80 bg-background/90 shadow-2xl overflow-hidden">
                    {/* Console Chrome */}
                    <div className="px-5 py-3 border-b border-border/60 bg-muted/40 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                        <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
                        <span className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
                        <span className="ml-2 font-mono text-[11px] text-muted-foreground font-semibold">
                          KaTeX Live Engine • 0.92 Density
                        </span>
                      </div>
                      <Badge
                        variant="outline"
                        className="border-primary/30 text-primary text-[9px] uppercase font-bold tracking-widest"
                      >
                        {MATH_PRESETS[selectedMathIndex].category}
                      </Badge>
                    </div>

                    {/* Live Rendered LaTeX Display */}
                    <div className="p-8 sm:p-12 text-center bg-gradient-to-b from-card/30 to-background flex flex-col items-center justify-center min-h-[180px]">
                      <div className="text-xl sm:text-2xl text-foreground font-serif">
                        <MarkdownRenderer noProse>
                          {`$$${MATH_PRESETS[selectedMathIndex].latex}$$`}
                        </MarkdownRenderer>
                      </div>
                      <p className="text-xs text-muted-foreground mt-4 max-w-md">
                        {MATH_PRESETS[selectedMathIndex].description}
                      </p>
                    </div>

                    {/* Raw LaTeX Code Preview */}
                    <div className="px-5 py-3.5 bg-muted/20 border-t border-border/40 font-mono text-xs text-muted-foreground flex items-center justify-between">
                      <span className="truncate max-w-[80%] opacity-80">
                        {MATH_PRESETS[selectedMathIndex].latex}
                      </span>
                      <span className="text-[10px] text-primary uppercase font-bold tracking-wider">
                        LaTeX Verified
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Ablation Study Comparison Table */}
          <section
            id="comparison"
            className="container mx-auto px-4 sm:px-6 max-w-6xl py-20 relative"
          >
            <div className="text-center space-y-4 mb-16">
              <div className="text-xs font-black text-primary uppercase tracking-[0.25em]">
                Independent Research • 125-Response Ablation Study
              </div>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-medium tracking-[-0.035em]">
                Hints, not answers: what we measured.
              </h2>
              <p className="text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto leading-relaxed">
                Every metric below is sourced from our published ablation study—blinded scoring by
                an independent Physics Ph.D. auditor across 25 procedural physics problems.
              </p>
              <div className="flex justify-center pt-2">
                <Link href="/research">
                  <Badge
                    variant="outline"
                    className="px-4 py-1.5 rounded-full border-primary/30 text-primary font-bold text-xs uppercase tracking-widest hover:bg-primary/5 transition-colors cursor-pointer"
                  >
                    Read the full methodology →
                  </Badge>
                </Link>
              </div>
            </div>

            <div className="rounded-xl border border-border overflow-hidden bg-muted/40 dark:bg-card">
              <div className="grid grid-cols-3 bg-muted/30 border-b border-border/50 px-6 py-4">
                <div className="col-span-1 text-xs font-black uppercase tracking-[0.15em] text-muted-foreground">
                  Capability
                </div>
                <div className="col-span-1 text-center">
                  <div className="inline-flex flex-col items-center gap-1">
                    <span className="text-xs font-black uppercase tracking-widest text-primary">
                      Scorpio
                    </span>
                    <span className="text-[9px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold uppercase tracking-widest">
                      Full Stack
                    </span>
                  </div>
                </div>
                <div className="col-span-1 text-center">
                  <span className="text-xs font-black uppercase tracking-widest text-muted-foreground/70">
                    ChatGPT / Gemini
                  </span>
                </div>
              </div>

              {[
                {
                  capability: "Direct Answer Rate",
                  footnote: "25 procedural physics problems",
                  scorpio: { val: "0%" },
                  chatgpt: { val: "~100%", dim: true },
                },
                {
                  capability: "Pedagogical Quality Score",
                  footnote: "Ph.D. blinded holistic audit, 5-pt scale",
                  scorpio: { val: "4.62 / 5" },
                  chatgpt: { val: "4.38 / 5¹", dim: true },
                },
                {
                  capability: "LaTeX Notation Density",
                  footnote: "Per 100 words, ablation study",
                  scorpio: { val: "0.92" },
                  chatgpt: { val: "0.22¹", dim: true },
                },
                {
                  capability: "Socratic Questions / Response",
                  footnote: "Avg. across 125-response study",
                  scorpio: { val: "1.25" },
                  chatgpt: { val: "1.00¹", dim: true },
                },
                {
                  capability: "Constraint Architecture",
                  footnote: "Inference-time, verifiable",
                  scorpio: { val: "4-Layer Enforced" },
                  chatgpt: { val: "None", dim: true },
                },
                {
                  capability: "Verifiable & Auditable",
                  footnote: "Published methodology, reproducible",
                  scorpio: { val: "Open Methodology" },
                  chatgpt: { val: "No", dim: true },
                },
              ].map((row, i) => (
                <div
                  key={i}
                  className={`grid grid-cols-3 px-6 py-4 border-b border-border/30 last:border-0 hover:bg-muted/10 transition-colors ${i % 2 === 0 ? "" : "bg-muted/5"}`}
                >
                  <div className="col-span-1 pr-4">
                    <p className="text-sm font-bold text-foreground">{row.capability}</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5 leading-tight">
                      {row.footnote}
                    </p>
                  </div>
                  <div className="col-span-1 flex items-center justify-center">
                    <span className="text-sm font-black text-primary bg-primary/10 border border-primary/20 px-3 py-1 rounded-full">
                      {row.scorpio.val}
                    </span>
                  </div>
                  <div className="col-span-1 flex items-center justify-center">
                    <span
                      className={`text-sm font-semibold ${row.chatgpt.dim ? "text-muted-foreground/50" : "text-foreground"}`}
                    >
                      {row.chatgpt.val}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 px-2 space-y-1">
              <p className="text-[11px] text-muted-foreground/60">
                ¹ Baseline Gemini 3.8 Flash (unconstrained level) from Scorpio ablation study.
              </p>
              <p className="text-[11px] text-muted-foreground/60">
                Full methodology, blinded rubrics, and raw ablation outputs published at{" "}
                <Link href="/research" className="text-primary hover:underline">
                  scorpioedu.org/research
                </Link>
                .
              </p>
            </div>
          </section>

          {/* Workflow: Two Interfaces, One System */}
          <section
            id="workflow"
            className="container mx-auto px-4 sm:px-6 max-w-6xl py-24 relative"
          >
            <div className="text-center mb-16 space-y-4">
              <div className="text-xs text-muted-foreground font-black uppercase tracking-[0.2em]">
                Two Interfaces. One System.
              </div>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-medium tracking-[-0.035em]">
                Your Classroom. Reimagined.
              </h2>
              <p className="text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto leading-relaxed">
                Teachers assign, grade and see class misconceptions. Students get hints, not
                answers.
              </p>
            </div>

            <div className="grid lg:grid-cols-2 gap-12">
              {/* Faculty Card */}
              <div className="p-8 sm:p-10 rounded-xl border border-border bg-muted/40 dark:bg-card space-y-6 flex flex-col justify-between">
                <div className="space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                      <Presentation className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-medium tracking-[-0.035em] text-foreground">
                        Instructional Design
                      </h3>
                      <p className="text-xs font-bold text-primary uppercase tracking-widest">
                        Faculty Interface
                      </p>
                    </div>
                  </div>

                  <Dialog>
                    <DialogTrigger asChild>
                      <div className="relative rounded-2xl overflow-hidden border border-border/80 bg-background/80 shadow-md group cursor-pointer aspect-[16/10]">
                        <Image
                          src="/demos/teacher-editor.png"
                          alt="Faculty Question Editor"
                          width={800}
                          height={500}
                          className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-2">
                          <Maximize2 className="h-4 w-4" /> Click to view full interface
                        </div>
                      </div>
                    </DialogTrigger>
                    <DialogContent className="max-w-[95vw] lg:max-w-5xl max-h-[90vh] p-2 bg-background/95 backdrop-blur-2xl border border-border shadow-2xl">
                      <DialogTitle className="text-base font-bold px-4 pt-2">
                        Faculty Question Editor & AI Constraints
                      </DialogTitle>
                      <div className="relative w-full aspect-[16/10] max-h-[80vh] overflow-hidden rounded-xl mt-2">
                        <Image
                          src="/demos/teacher-editor.png"
                          alt="Faculty Editor"
                          width={1600}
                          height={1000}
                          className="w-full h-full object-contain"
                        />
                      </div>
                    </DialogContent>
                  </Dialog>

                  <ul className="space-y-3 pt-2">
                    {[
                      "Construct LaTeX-rich assignments, or copy a ready-made AP Physics 1 set",
                      "Choose automatic or manual grading per assignment",
                      "Review submissions that auto-grading flags for your attention",
                      "See which misconceptions your class has, ranked by number of students",
                    ].map((item, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-3 text-xs sm:text-sm text-foreground/85"
                      >
                        <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-4 border-t border-border/30">
                  <Button asChild variant="outline" className="w-full rounded-xl">
                    <Link href="/signup">Experience Faculty Portal</Link>
                  </Button>
                </div>
              </div>

              {/* Student Card */}
              <div className="p-8 sm:p-10 rounded-xl border border-border bg-muted/40 dark:bg-card space-y-6 flex flex-col justify-between">
                <div className="space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-2xl bg-secondary/20 border border-secondary/30 flex items-center justify-center">
                      <Users className="h-6 w-6 text-foreground" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-medium tracking-[-0.035em] text-foreground">
                        Conceptual Discovery
                      </h3>
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                        Student Interface
                      </p>
                    </div>
                  </div>

                  <Dialog>
                    <DialogTrigger asChild>
                      <div className="relative rounded-2xl overflow-hidden border border-border/80 bg-background/80 shadow-md group cursor-pointer aspect-[16/10]">
                        <Image
                          src="/ai-tutor.png"
                          alt="Raise Student Interface"
                          width={800}
                          height={500}
                          className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-2">
                          <Maximize2 className="h-4 w-4" /> Click to view full interface
                        </div>
                      </div>
                    </DialogTrigger>
                    <DialogContent className="max-w-[95vw] lg:max-w-5xl max-h-[90vh] p-2 bg-background/95 backdrop-blur-2xl border border-border shadow-2xl">
                      <DialogTitle className="text-base font-bold px-4 pt-2">
                        Raise Socratic Assistant
                      </DialogTitle>
                      <div className="relative w-full aspect-[16/10] max-h-[80vh] overflow-hidden rounded-xl mt-2">
                        <Image
                          src="/ai-tutor.png"
                          alt="Raise Student Workspace"
                          width={1600}
                          height={1000}
                          className="w-full h-full object-contain"
                        />
                      </div>
                    </DialogContent>
                  </Dialog>

                  <ul className="space-y-3 pt-2">
                    {[
                      "Engage with constraint-led Socratic tutoring in real-time",
                      "Interact with physics equations through publication-grade KaTeX",
                      "Instant auto-grading with unit and sign feedback",
                      "Join your class with a class code",
                    ].map((item, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-3 text-xs sm:text-sm text-foreground/85"
                      >
                        <Check className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-4 border-t border-border/30">
                  <Button asChild variant="outline" className="w-full rounded-xl">
                    <Link href="/ai">Try Student AI Sandbox</Link>
                  </Button>
                </div>
              </div>
            </div>
          </section>

          {/* Waypoints Network Section */}
          <section
            id="waypoints"
            className="container mx-auto px-4 sm:px-6 max-w-6xl py-20 relative"
          >
            <div className="rounded-[2.5rem] border border-border/60 bg-card/25 backdrop-blur-xl p-8 sm:p-12 space-y-12">
              <div className="text-center space-y-3 max-w-2xl mx-auto">
                <div className="text-xs font-black text-primary uppercase tracking-[0.25em]">
                  Ready-Made Curriculum
                </div>
                <h2 className="text-3xl sm:text-4xl font-medium tracking-[-0.035em]">
                  The Waypoints Library
                </h2>
                <p className="text-muted-foreground text-sm sm:text-base">
                  Ready-made physics assignments you can copy into your class and edit.
                </p>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  ...AP_UNITS.slice(0, 4).map((u) => ({
                    title: apUnitLabel(u.unit),
                    tag: "AP Physics 1",
                    note: "Copy and edit in your class",
                    badge: "Free",
                  })),
                ].map((item, i) => (
                  <div
                    key={i}
                    className="p-4 rounded-2xl border border-border/50 bg-background/50 space-y-3 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <Badge
                          variant="outline"
                          className="text-[9px] uppercase tracking-wider text-muted-foreground"
                        >
                          {item.tag}
                        </Badge>
                        <span className="text-[9px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                          {item.badge}
                        </span>
                      </div>
                      <h4 className="font-bold text-xs sm:text-sm text-foreground leading-snug">
                        {item.title}
                      </h4>
                    </div>
                    <div className="text-[11px] text-muted-foreground border-t border-border/30 pt-2">
                      {item.note}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* CTA Banner */}
          <section className="container mx-auto px-4 sm:px-6 max-w-5xl py-16">
            <div className="rounded-[2.5rem] p-8 sm:p-14 md:p-20 border border-primary/30 bg-gradient-to-br from-primary/10 via-card/40 to-background backdrop-blur-2xl relative overflow-hidden text-center shadow-2xl space-y-8">
              <div className="space-y-4 max-w-xl mx-auto">
                <h2 className="text-3xl sm:text-4xl md:text-5xl font-medium tracking-[-0.035em] leading-none text-foreground">
                  Ready to try it in your physics class?
                </h2>
                <p className="text-muted-foreground text-base sm:text-lg leading-relaxed">
                  Scorpio is free for every teacher. AI is paid at cost, with $1 free every month.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Button
                  asChild
                  size="lg"
                  className="rounded-full px-8 font-semibold shadow-lg shadow-primary/20"
                >
                  <Link href="/signup">
                    Get Faculty Access <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="rounded-full px-8 font-semibold"
                >
                  <Link href="/pricing">See Pricing</Link>
                </Button>
              </div>
            </div>
          </section>
        </main>

        {/* Global Footer */}
        <SiteFooter />
      </motion.div>
    </div>
  );
}
