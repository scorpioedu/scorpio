import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { Comparison } from "@/components/landing/comparison";
import { CourseGrid } from "@/components/landing/course-grid";
import { HomeChatbot, HomeHeader, HomeScrollReveal } from "@/components/landing/home-interactions";
import reveal from "@/components/landing/home-reveal.module.css";
import { LandingHero } from "@/components/landing/LandingHero";
import { RoleGate } from "@/components/landing/role-gate";
import { ColumnGuides } from "@/components/landing/line-art";
import { PilotProgram, PilotStory, PricingOverview } from "@/components/landing/split-sections";
import { PrimaryPill, SecondaryPill, Split, statement } from "@/components/landing/split-kit";
import { WorkflowRows } from "@/components/landing/workflow-rows";
import { LandingFAQ } from "@/components/landing-faq";
import { LoadingScreen } from "@/components/loading-screen";
import { Logo } from "@/components/ui/logo";

const footerLinks = [
  { label: "About", href: "/about" },
  { label: "Research", href: "/research" },
  { label: "Sustainability", href: "/sustainability" },
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
  { label: "Request access", href: "/request-access" },
  { label: "Contact", href: "/contact" },
];

export default function Home() {
  return (
    <div id="home-page" className={`${reveal.scope} relative isolate min-h-screen bg-background`}>
      <LoadingScreen />
      <HomeHeader />

      <main className="relative isolate overflow-x-clip [&>section]:scroll-mt-20">
        <ColumnGuides />
        <HomeScrollReveal />
        <LandingHero />

        <PilotStory />

        <WorkflowRows />

        <CourseGrid />

        <section
          id="efficacy"
          aria-labelledby="research-heading"
          className="border-b border-border/60"
        >
          <Comparison />
        </section>

        <PricingOverview />

        <PilotProgram />

        <LandingFAQ minimal />

        <section id="cta" aria-labelledby="cta-heading" className="scroll-mt-20">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
            <div data-scroll-reveal className={reveal.stagger}>
              <Split id="cta-heading" heading="Get started">
                <p className={statement}>
                  Try it with one unit
                  <span className="block text-muted-foreground">
                    Free for one teacher, no card required
                  </span>
                </p>
                <div className="mt-10 flex flex-wrap gap-3">
                  <PrimaryPill href="/request-access">Request classroom access</PrimaryPill>
                  <SecondaryPill href="/contact">Request a department demo</SecondaryPill>
                </div>
              </Split>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div
          data-scroll-reveal
          className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-7 sm:px-8 lg:flex-row lg:items-center lg:justify-between"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Logo size={18} aria-hidden="true" /> Scorpio
          </span>
          <nav
            aria-label="Footer"
            className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground"
          >
            {footerLinks.map(({ label, href }) => (
              <Link key={href} href={href} className="transition-colors hover:text-foreground">
                {label}
              </Link>
            ))}
            <Link
              href="https://github.com/RushilMahadevu/scorpio"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
            >
              GitHub <ArrowUpRight aria-hidden="true" className="size-3" />
            </Link>
          </nav>
          <p className="text-xs leading-relaxed text-muted-foreground">
            © {new Date().getFullYear()} Scorpio
            <br />
            Built by Rushil Mahadevu
          </p>
        </div>
      </footer>

      <RoleGate />
      <HomeChatbot />
    </div>
  );
}
