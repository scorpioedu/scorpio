import Link from "next/link";
import { LandingFAQ } from "@/components/landing-faq";
import { aiRates, freeMonthly, PlanCards } from "@/components/landing/plan-cards";
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

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main className="overflow-x-clip pt-14">
        {/* ── Free ──────────────────────────────────────────────────────── */}
        <Section labelledBy="pricing-heading">
          <Split id="pricing-heading" heading="Pricing">
            <p className={statement}>
              Free for every teacher
              <span className="block text-muted-foreground">AI is paid at cost, never marked up</span>
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <PrimaryPill href="/request-access">Request teacher access</PrimaryPill>
              <SecondaryPill href="/contact">Pay by invoice</SecondaryPill>
            </div>
          </Split>

          <div className="mt-16 sm:mt-20">
            <PlanCards />
          </div>
        </Section>

        {/* ── AI at cost ────────────────────────────────────────────────── */}
        <Section labelledBy="billing-heading">
          <Split id="billing-heading" heading="AI at cost">
            <p className={statement}>
              You pay what Google charges us
              <span className="block text-muted-foreground">from a balance you top up</span>
            </p>
            <dl className="mt-10 grid gap-6 text-[15px] sm:grid-cols-3 md:grid-cols-1 lg:grid-cols-3">
              <div className="border-t border-border pt-4">
                <dt className="font-medium">{freeMonthly} free every month</dt>
                <dd className="mt-1 text-muted-foreground">
                  Every network gets it. It does not carry over.
                </dd>
              </div>
              <div className="border-t border-border pt-4">
                <dt className="font-medium">Top up from $5</dt>
                <dd className="mt-1 text-muted-foreground">
                  Polar&apos;s processing fee is shown before you pay. Paid credit never expires.
                </dd>
              </div>
              <div className="border-t border-border pt-4">
                <dt className="font-medium">Schools can pay by invoice</dt>
                <dd className="mt-1 text-muted-foreground">
                  <Link href="/contact" className="underline underline-offset-4">Contact us</Link> and we
                  will set it up.
                </dd>
              </div>
            </dl>
          </Split>

          <div className="mt-16 overflow-x-auto sm:mt-20">
            <table className="w-full min-w-[560px] border-collapse text-left text-[15px]">
              <caption className="sr-only">Gemini 3.8 Flash rates and what a dollar buys</caption>
              <thead>
                <tr className="border-b border-border text-sm text-muted-foreground">
                  <th scope="col" className="py-3 pr-4 font-medium text-foreground">Rate period</th>
                  <th scope="col" className="py-3 pr-4 font-medium text-foreground">Input, per 1M tokens</th>
                  <th scope="col" className="py-3 pr-4 font-medium text-foreground">Output, per 1M tokens</th>
                  <th scope="col" className="py-3 font-medium text-foreground">Raise hints per $1</th>
                </tr>
              </thead>
              <tbody>
                {aiRates.map((r) => (
                  <tr key={r.period} className="border-b border-border/60">
                    <th scope="row" className="py-3 pr-4 font-normal">{r.period}</th>
                    <td className="py-3 pr-4">{r.input}</td>
                    <td className="py-3 pr-4">{r.output}</td>
                    <td className="py-3">about {r.hintsPerDollar.toLocaleString("en-US")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            A Raise hint costs about a tenth of a cent. Hint counts are estimates from the average
            hint so far. Google Classroom and Canvas integrations are not built yet, and Scorpio
            does not claim blanket FERPA or COPPA certification.
          </p>
        </Section>

        {/* ── Referrals ─────────────────────────────────────────────────── */}
        <Section labelledBy="referral-heading">
          <Split id="referral-heading" heading="Refer a colleague">
            <p className={statement}>
              You get $5 of AI, they get $2
              <span className="block text-muted-foreground">
                once their first class has results
              </span>
            </p>
          </Split>
        </Section>

        <LandingFAQ minimal />

        {/* ── Get started ───────────────────────────────────────────────── */}
        <Section labelledBy="cta-heading" className="border-b-0">
          <Split id="cta-heading" heading="Get started">
            <p className={statement}>
              Try it with one unit
              <span className="block text-muted-foreground">Free for every teacher, no card required</span>
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <PrimaryPill href="/request-access">Request teacher access</PrimaryPill>
              <CircleLink href="/contact" className="ml-2">
                Pay by invoice
              </CircleLink>
            </div>
          </Split>
        </Section>
      </main>

      <SiteFooter />
    </div>
  );
}
