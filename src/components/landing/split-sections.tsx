import Image from "next/image";
import { Logo } from "@/components/ui/logo";
import reveal from "./home-reveal.module.css";
import { PlanCards } from "./plan-cards";
import { CircleLink, label, PrimaryPill, SecondaryPill, Split, statement } from "./split-kit";

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

/* ── Not for profit ─────────────────────────────────────────────────────── */

/*
 * How Scorpio is run, in plain words. It is not a registered nonprofit, so the copy says "not for
 * profit" about how it is run and never "nonprofit organization", "charity" or "donate".
 */
export function NotForProfit() {
  return (
    <section aria-labelledby="not-for-profit" className="scroll-mt-20 border-b border-border/60">
      <div id="mission" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <div data-scroll-reveal className={reveal.stagger}>
          <Split id="not-for-profit" heading="Not for profit">
            <p className={statement}>
              Built by a high school junior
              <span className="block text-muted-foreground">
                Fees pay for servers and AI. Nobody takes a profit.
              </span>
            </p>
            <p className="mt-10 max-w-xl text-pretty text-[clamp(1.05rem,1.4vw,1.2rem)] leading-[1.55] text-muted-foreground">
              Scorpio has no investors and no shareholders. A Department plan covers hosting and the
              AI your students use, at cost. Scorpio is not a registered nonprofit yet; we are
              applying for 501(c)(3) status.
            </p>
            <CircleLink href="/about" className="mt-10">
              Read about Scorpio
            </CircleLink>
          </Split>
        </div>
      </div>
    </section>
  );
}

/* ── Pricing ────────────────────────────────────────────────────────────── */

export function PricingOverview() {
  return (
    <section aria-labelledby="pricing-heading" className="scroll-mt-20 border-b border-border/60">
      <div id="pricing" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <div data-scroll-reveal className={reveal.stagger}>
          <Split id="pricing-heading" heading="Pricing">
            <p className={statement}>
              Pricing a department can approve
              <span className="block text-muted-foreground">One flat price, AI at cost</span>
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <PrimaryPill href="/request-access">Request teacher access</PrimaryPill>
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
          <PlanCards />
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
