"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Mail, Github, BookOpen } from "lucide-react";
import reveal from "@/components/landing/home-reveal.module.css";
import { CircleLink, label } from "@/components/landing/split-kit";
import Link from "next/link";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";

const faqs = [
  {
    index: "01",
    question: "What is Scorpio?",
    answer:
      "Scorpio is a homework tool for physics classes, starting with AP Physics 1. Teachers assign ready-made or custom problems that are graded automatically, students can ask Raise for a hint instead of an answer, and a class misconception report shows which wrong ideas students hold.",
  },
  {
    index: "02",
    question: "How does Raise decide what hint to give?",
    answer:
      "Raise checks what the student is asking for and applies rules to keep the reply focused on the next step. The research page explains how we tested those rules.",
  },
  {
    index: "03",
    question: "Can students bypass the AI and get direct answers?",
    answer:
      "Raise is designed to give hints. In our 125-response study, the version with all four checks gave no direct answers. That is a result on 25 test questions, not a guarantee for every question.",
  },
  {
    index: "04",
    question: "What physics topics and grade levels are supported?",
    answer:
      "Scorpio is built for high school AP Physics 1, AP Physics 2, AP Physics C: Mechanics and AP Physics C: Electricity and Magnetism. Every AP unit has ready-made problem sets and a lesson, and teachers can also write their own questions for any physics course.",
  },
  {
    index: "05",
    question: "What are Waypoints?",
    answer:
      "Waypoints are shared assignments. Every global Waypoint, including the AP Physics 1 sets, is free to copy into your own class and edit. Department Waypoints, shared inside your school network, need a Department License.",
  },
  {
    index: "06",
    question: "How is pricing structured?",
    answer:
      "Individual teachers use Scorpio for free, including auto-grading and the misconception report, with a small starter AI budget. A Department License is $10 a month or $100 a year for the whole department and adds department sharing and higher AI limits. AI usage is passed through at the provider’s rate.",
  },
  {
    index: "07",
    question: "Does Scorpio integrate with existing LMS platforms?",
    answer:
      "Not yet. Students join with a class code and teachers can export grades as CSV. Google Classroom and Canvas integrations are not built; tell us which one your school uses.",
  },
  {
    index: "08",
    question: "How is student data protected?",
    answer:
      "Records are stored in Firebase with role-based access rules, and school records are not used for model training. Scorpio does not claim blanket FERPA or COPPA certification, so check with your school before students use it. See the privacy page for details.",
  },
];

const contactLinks = [
  { icon: Mail, label: "Email", href: "/contact" },
  {
    icon: Github,
    label: "GitHub",
    href: "https://github.com/RushilMahadevu/scorpio",
    external: true,
  },
  { icon: BookOpen, label: "Research", href: "/research" },
];

export function LandingFAQ({ minimal = false }: { minimal?: boolean }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (i: number) => setOpenIndex((prev) => (prev === i ? null : i));

  if (minimal) {
    return (
      <section
        id="faq"
        aria-labelledby="faq-heading"
        className="scroll-mt-20 border-b border-border/60"
      >
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 sm:px-8 sm:py-28 md:grid-cols-2">
          <div data-scroll-reveal className={`${reveal.stagger} flex flex-col`}>
            <h2 id="faq-heading" className={label}>
              Questions
              <span className="block text-muted-foreground">What teachers ask us first</span>
            </h2>
            <CircleLink href="/contact" className="mt-10">
              Ask us something else
            </CircleLink>
          </div>
          <Accordion
            type="single"
            collapsible
            className="border-t border-border motion-reduce:[&_[data-slot=accordion-content]]:animate-none"
          >
            {faqs.map(({ index, question, answer }, i) => (
              <AccordionItem
                key={index}
                value={index}
                data-scroll-reveal
                style={{ "--reveal-delay": `${Math.min(i * 70, 420)}ms` } as React.CSSProperties}
              >
                <AccordionTrigger className="cursor-pointer items-center gap-4 py-5 text-[17px] font-medium leading-snug tracking-[-0.01em] transition-colors hover:text-primary hover:no-underline data-[state=open]:text-primary motion-reduce:transition-none [&>svg]:size-5 [&>svg]:translate-y-0 motion-reduce:[&>svg]:transition-none">
                  <span className="flex items-baseline gap-4">
                    <span
                      aria-hidden="true"
                      className="font-mono text-xs tabular-nums text-muted-foreground"
                    >
                      {index}
                    </span>
                    {question}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pl-9 pr-8 text-[15px] leading-relaxed text-muted-foreground">
                  {answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>
    );
  }

  return (
    <section id="faq" className="container mx-auto px-6 py-32 relative">
      {/* Ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-primary/4 rounded-full blur-[140px] pointer-events-none -z-10" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.1 }}
        transition={{ duration: 0.7 }}
        className="max-w-6xl mx-auto"
      >
        {/* Outer card */}
        <div className="rounded-[2.5rem] border border-border/50 bg-card/60 backdrop-blur-xl overflow-hidden shadow-2xl">
          <div className="grid lg:grid-cols-[420px_1fr]">
            {/* ── Left: Header + contact ── */}
            <div className="relative flex flex-col justify-between p-10 lg:p-14 border-b lg:border-b-0 lg:border-r border-border/40 overflow-hidden">
              {/* Watermark */}
              <span
                aria-hidden
                className="pointer-events-none select-none absolute -bottom-6 -left-4 text-[11rem] lg:text-[13rem] font-black text-foreground opacity-[0.03] leading-none tracking-tighter"
              >
                FAQ
              </span>

              <div className="relative z-10 space-y-6">
                <div className="text-xs font-black uppercase tracking-[0.22em] text-muted-foreground">
                  Support
                </div>
                <h2 className="text-4xl lg:text-5xl font-extrabold tracking-tight leading-[1.1] text-foreground">
                  Frequently
                  <br />
                  Asked
                  <br />
                  <span className="text-primary italic">Questions.</span>
                </h2>
                <p className="text-muted-foreground text-base font-medium leading-relaxed max-w-xs">
                  Common questions about using Scorpio in a physics class. Can&rsquo;t find your
                  answer?
                </p>
              </div>

              {/* Contact icons */}
              <div className="relative z-10 mt-12 lg:mt-0">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">
                  Get in touch
                </p>
                <div className="flex items-center gap-3">
                  {contactLinks.map(({ icon: Icon, label, href, external }) => (
                    <Button
                      key={label}
                      asChild
                      variant="outline"
                      size="icon-lg"
                      className="rounded-full text-muted-foreground"
                    >
                      <Link
                        href={href}
                        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                        title={label}
                      >
                        <Icon />
                        <span className="sr-only">{label}</span>
                      </Link>
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Right: Accordion ── */}
            <div className="p-8 lg:p-12 space-y-3">
              {faqs.map((faq, i) => {
                const isOpen = openIndex === i;
                return (
                  <motion.div
                    key={faq.index}
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.1 }}
                    transition={{ delay: i * 0.05, duration: 0.4 }}
                    className={`
                      group rounded-2xl border transition-all duration-300
                      bg-card
                      ${
                        isOpen
                          ? "border-primary/40 shadow-md shadow-primary/5"
                          : "border-border/40 hover:border-border/80 hover:shadow-sm"
                      }
                    `}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(i)}
                      aria-expanded={isOpen}
                      className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left cursor-pointer rounded-2xl hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <span className="text-xs font-black tabular-nums text-muted-foreground/50 shrink-0">
                          {faq.index}
                        </span>
                        <span className="text-sm font-bold text-foreground leading-snug">
                          {faq.question}
                        </span>
                      </div>
                      <span
                        className={`shrink-0 flex items-center justify-center w-7 h-7 rounded-full border border-border/50 bg-muted/40 transition-transform duration-300 ${isOpen ? "rotate-180 border-primary/40 bg-primary/5" : "group-hover:border-border"}`}
                      >
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      </span>
                    </button>

                    {/* Smooth reveal */}
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          key="content"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
                          className="overflow-hidden"
                        >
                          <p className="px-6 pb-6 pt-0 text-sm text-muted-foreground leading-relaxed font-medium pl-16">
                            {faq.answer}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
