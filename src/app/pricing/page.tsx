"use client";

import { Check, Minus } from "lucide-react";
import { useState } from "react";
import { LandingFAQ } from "@/components/landing-faq";
import { PlanCards } from "@/components/landing/plan-cards";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import {
  CircleLink,
  PrimaryPill,
  SecondaryPill,
  Section,
  Split,
  statement,
} from "@/components/landing/split-kit";
import { cn } from "@/lib/utils";

type Value = boolean | string;
type Row = { category: string } | { name: string; starter: Value; dept: Value; district: Value };

const rows: Row[] = [
  { category: "Classes" },
  { name: "Teacher and student accounts, class codes", starter: true, dept: true, district: true },
  { name: "Assignment builder with LaTeX", starter: true, dept: true, district: true },
  { name: "CSV grade export", starter: true, dept: true, district: true },
  { name: "Published problem sets (all AP Physics 1)", starter: true, dept: true, district: true },
  { name: "Department problem sets and sharing", starter: false, dept: true, district: true },
  { name: "AI-written student portfolios", starter: false, dept: true, district: true },
  { category: "Grading and Raise" },
  { name: "Auto-grading (numbers with units, multiple choice)", starter: true, dept: true, district: true },
  { name: "Class misconception report", starter: true, dept: true, district: true },
  { name: "Raise hints", starter: "Starter budget", dept: "Higher limits", district: "Higher limits" },
  { name: "AI grading of written answers", starter: "Starter budget", dept: "Higher limits", district: "Higher limits" },
  { name: "AI-assisted rubric drafting", starter: false, dept: true, district: true },
  { category: "Billing" },
  { name: "Base fee", starter: "$0", dept: "$10/mo or $100/yr", district: "Custom" },
  { name: "AI usage at cost", starter: false, dept: "$0.75 / $3.75 per 1M", district: "Arranged" },
  { name: "Monthly spend caps", starter: false, dept: true, district: true },
  { name: "Itemized receipts", starter: false, dept: true, district: true },
];

function Cell({ value }: { value: Value }) {
  if (typeof value === "string") return <span>{value}</span>;
  return value ? (
    <Check aria-label="Included" className="size-4 text-primary" />
  ) : (
    <Minus aria-label="Not included" className="size-4 text-muted-foreground/40" />
  );
}

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main className="overflow-x-clip pt-14">
        {/* ── Plans ─────────────────────────────────────────────────────── */}
        <Section labelledBy="pricing-heading">
          <Split id="pricing-heading" heading="Pricing">
            <p className={statement}>
              Free for one teacher
              <span className="block text-muted-foreground">
                Flat for a department, no per-student fees
              </span>
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <PrimaryPill href="/signup">Start free</PrimaryPill>
              <SecondaryPill href="/request-access">Request department access</SecondaryPill>
            </div>
          </Split>

          <div className="mt-16 sm:mt-20">
            <div className="flex items-center justify-between gap-4 px-1 pb-3 text-sm">
              <span className="text-muted-foreground">No card needed for Starter</span>
              <div
                role="radiogroup"
                aria-label="Billing period"
                className="inline-flex rounded-full border border-border p-0.5"
              >
                {[
                  { label: "Monthly", value: false },
                  { label: "Yearly", value: true },
                ].map((o) => (
                  <button
                    key={o.label}
                    type="button"
                    role="radio"
                    aria-checked={annual === o.value}
                    onClick={() => setAnnual(o.value)}
                    className={cn(
                      "rounded-full px-3 py-1 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                      annual === o.value
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <PlanCards annual={annual} />
          </div>
        </Section>

        {/* ── How AI is billed ──────────────────────────────────────────── */}
        <Section labelledBy="billing-heading">
          <Split id="billing-heading" heading="AI usage">
            <p className={statement}>
              Billed at what it costs us
              <span className="block text-muted-foreground">with a cap you set</span>
            </p>
            <dl className="mt-10 grid gap-6 text-[15px] sm:grid-cols-3 md:grid-cols-1 lg:grid-cols-3">
              <div className="border-t border-border pt-4">
                <dt className="font-medium">No per-seat fees</dt>
                <dd className="mt-1 text-muted-foreground">One flat fee for 25 or 250 students.</dd>
              </div>
              <div className="border-t border-border pt-4">
                <dt className="font-medium">No markup</dt>
                <dd className="mt-1 text-muted-foreground">
                  Gemini 3.8 Flash at $0.75 per 1M input and $3.75 per 1M output tokens.
                </dd>
              </div>
              <div className="border-t border-border pt-4">
                <dt className="font-medium">Hard caps</dt>
                <dd className="mt-1 text-muted-foreground">
                  AI stops when the monthly cap in Network settings is reached.
                </dd>
              </div>
            </dl>
          </Split>
        </Section>

        {/* ── Comparison ────────────────────────────────────────────────── */}
        <Section labelledBy="compare-heading">
          <Split id="compare-heading" heading="Compare plans">
            <p className={statement}>
              Everything in each plan
              <span className="block text-muted-foreground">side by side</span>
            </p>
          </Split>

          <div className="mt-16 overflow-x-auto sm:mt-20">
            <table className="w-full min-w-[620px] border-collapse text-left text-[15px]">
              <thead>
                <tr className="border-b border-border text-sm text-muted-foreground">
                  <th scope="col" className="py-3 pr-4 font-normal">
                    <span className="sr-only">Feature</span>
                  </th>
                  <th scope="col" className="w-[18%] py-3 pr-4 font-medium text-foreground">Starter</th>
                  <th scope="col" className="w-[22%] py-3 pr-4 font-medium text-foreground">Department</th>
                  <th scope="col" className="w-[18%] py-3 font-medium text-foreground">District</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) =>
                  "category" in row ? (
                    <tr key={row.category}>
                      <th
                        scope="colgroup"
                        colSpan={4}
                        className="pb-2 pt-10 text-sm font-medium text-muted-foreground"
                      >
                        {row.category}
                      </th>
                    </tr>
                  ) : (
                    <tr key={row.name} className="border-b border-border/60">
                      <th scope="row" className="py-3 pr-4 font-normal">
                        {row.name}
                      </th>
                      <td className="py-3 pr-4"><Cell value={row.starter} /></td>
                      <td className="py-3 pr-4"><Cell value={row.dept} /></td>
                      <td className="py-3"><Cell value={row.district} /></td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            Google Classroom and Canvas integrations are not built yet. District plans include a
            data-protection review with your school; Scorpio does not claim blanket FERPA or COPPA
            certification.
          </p>
        </Section>

        <LandingFAQ minimal />

        {/* ── Get started ───────────────────────────────────────────────── */}
        <Section labelledBy="cta-heading" className="border-b-0">
          <Split id="cta-heading" heading="Get started">
            <p className={statement}>
              Try it with one unit
              <span className="block text-muted-foreground">Free for one teacher, no card required</span>
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <PrimaryPill href="/signup">Start free</PrimaryPill>
              <CircleLink href="/contact" className="ml-2">
                Talk to us about a district
              </CircleLink>
            </div>
          </Split>
        </Section>
      </main>

      <SiteFooter />
    </div>
  );
}
