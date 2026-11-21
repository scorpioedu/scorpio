import { Check } from "lucide-react";
import Image from "next/image";
import { Logo } from "@/components/ui/logo";
import reveal from "./home-reveal.module.css";
import { card, CircleLink, label, PrimaryPill, SecondaryPill, Split, statement } from "./split-kit";

/*
 * Three quiet split sections in the same voice as the hero: a short label on the left, a two-tone
 * statement on the right (one line in ink, one in grey), then whatever the section shows.
 * Facts here come from /pricing and the Sage Ridge pilot; nothing is quoted from anyone.
 */

/* ── Sage Ridge ─────────────────────────────────────────────────────────── */

export function PilotStory() {
  return (
    <section aria-labelledby="partners" className="scroll-mt-20 border-b border-border/60">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <div className="grid gap-12 md:grid-cols-2 md:gap-12">
          <div data-scroll-reveal className={`${reveal.stagger} flex flex-col`}>
            <h2 id="partners" className={label}>
              Piloting at Sage Ridge School
              <span className="block text-muted-foreground">Our pilot school for AP Physics 1</span>
            </h2>
            <CircleLink href="https://www.sageridge.org/" external className="mt-10">
              Visit Sage Ridge School
            </CircleLink>
          </div>

          <div data-scroll-reveal className={reveal.stagger}>
            <Image
              src="/school-logos/SageRidgeSchool.svg"
              alt="Sage Ridge School"
              width={244}
              height={130}
              className="h-auto w-24 dark:brightness-0 dark:invert"
            />
            <p className="mt-8 text-pretty text-[clamp(1.15rem,1.7vw,1.4rem)] leading-[1.45] tracking-[-0.015em]">
              Scorpio is in a classroom pilot in AP Physics 1 at Sage Ridge School: problem sets
              assigned in Scorpio, hints instead of answers while students work, and a reteach list
              for the teacher after every set.
            </p>
            <p className="mt-6 text-sm text-muted-foreground">Pilot school · AP Physics 1</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Pricing ────────────────────────────────────────────────────────────── */

type Plan = {
  name: string;
  audience: string;
  price: string;
  per?: string;
  ai: string;
  includes: string[];
};

/** Mirrors /pricing; change both together. */
const plans: Plan[] = [
  {
    name: "Starter",
    audience: "For one teacher",
    price: "Free",
    ai: "Starter budget",
    includes: ["Every published problem set", "Auto-grading", "Class misconception report"],
  },
  {
    name: "Department",
    audience: "For a physics department",
    price: "$10",
    per: "/month",
    ai: "At cost",
    includes: [
      "Everything in Starter",
      "Department sharing",
      "Higher AI limits",
      "Monthly spend caps",
    ],
  },
  {
    name: "District",
    audience: "For several schools",
    price: "Custom",
    ai: "Arranged",
    includes: ["Everything in Department", "Data-protection review with your school"],
  },
];

export function PricingOverview() {
  return (
    <section aria-labelledby="pricing-heading" className="scroll-mt-20 border-b border-border/60">
      <div id="pricing" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <div data-scroll-reveal className={reveal.stagger}>
          <Split id="pricing-heading" heading="Pricing">
            <p className={statement}>
              Pricing a department can approve
              <span className="block text-muted-foreground">
                Free for one teacher, flat after that
              </span>
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <PrimaryPill href="/request-access">Request classroom access</PrimaryPill>
              <SecondaryPill href="/pricing">See full pricing</SecondaryPill>
            </div>
          </Split>
        </div>

        <div data-scroll-reveal className="mt-16 sm:mt-20">
          <div className="flex items-center justify-between px-1 pb-3 text-sm">
            <span className="flex items-center gap-2 font-medium">
              <Logo size={16} strokeWidth={2.6} className="text-primary" aria-hidden="true" />
              Scorpio
            </span>
            <span className="text-muted-foreground">No per-student fees</span>
          </div>
          <ul role="list" className="grid list-none gap-2 md:grid-cols-3">
            {plans.map((p) => (
              <li key={p.name} className={`${card} flex flex-col`}>
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="text-lg font-medium">{p.name}</h3>
                  <p className="text-right text-sm text-muted-foreground">{p.audience}</p>
                </div>
                <p className="mt-6 flex items-baseline gap-2">
                  <span className="text-[2.1rem] font-medium tracking-tight">{p.price}</span>
                  {p.per && <span className="text-muted-foreground">{p.per}</span>}
                </p>
                <p className="mt-5 flex items-baseline justify-between gap-4 text-[15px]">
                  <span className="text-muted-foreground">AI usage</span>
                  <span>{p.ai}</span>
                </p>
                <span aria-hidden="true" className="min-h-8 flex-1" />
                <ul
                  role="list"
                  className="grid list-none gap-3 border-t border-border pt-5 text-[15px]"
                >
                  {p.includes.map((f) => (
                    <li key={f} className="flex items-start gap-3">
                      <Check aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary" />
                      {f}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ── Pilot program ──────────────────────────────────────────────────────── */

export function PilotProgram() {
  return (
    <section aria-labelledby="pilot-heading" className="scroll-mt-20 border-b border-border/60">
      <div id="pilot" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <div data-scroll-reveal className={reveal.stagger}>
          <Split id="pilot-heading" heading="Pilot program">
            <p className={statement}>
              Run a pilot in your department
              <span className="block text-muted-foreground">the way Sage Ridge School does</span>
            </p>
            <p className="mt-10 max-w-xl text-pretty text-[clamp(1.05rem,1.4vw,1.2rem)] leading-[1.55] text-muted-foreground">
              Start with one class and one unit. Tell us about your school and your AP Physics
              courses, and we will set up your teachers and classes with you. After the unit, you
              decide whether the department keeps going.
            </p>
            <div className="mt-10">
              <PrimaryPill href="/request-access">Apply for a pilot</PrimaryPill>
            </div>
          </Split>
        </div>
      </div>
    </section>
  );
}
