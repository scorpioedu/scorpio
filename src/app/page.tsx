import { Comparison } from "@/components/landing/comparison";
import { CourseGrid } from "@/components/landing/course-grid";
import { HomeChatbot, HomeHeader, HomeScrollReveal } from "@/components/landing/home-interactions";
import reveal from "@/components/landing/home-reveal.module.css";
import { LandingHero } from "@/components/landing/LandingHero";
import { SiteFooter } from "@/components/landing/site-footer";
import { RoleGate } from "@/components/landing/role-gate";
import { ColumnGuides } from "@/components/landing/line-art";
import { PilotProgram, PilotStory, PricingOverview } from "@/components/landing/split-sections";
import { PrimaryPill, SecondaryPill, Split, statement } from "@/components/landing/split-kit";
import { WorkflowRows } from "@/components/landing/workflow-rows";
import { LandingFAQ } from "@/components/landing-faq";
import { LoadingScreen } from "@/components/loading-screen";

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

      <SiteFooter reveal />

      <RoleGate />
      <HomeChatbot />
    </div>
  );
}
