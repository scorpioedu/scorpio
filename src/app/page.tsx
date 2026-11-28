import { AiOnYourTerms } from "@/components/landing/comparison";
import { CourseGrid } from "@/components/landing/course-grid";
import { HomeHeader, HomeScrollReveal } from "@/components/landing/home-interactions";
import reveal from "@/components/landing/home-reveal.module.css";
import { LandingHero } from "@/components/landing/LandingHero";
import { LessonsTeaser } from "@/components/landing/lessons-teaser";
import { SiteFooter } from "@/components/landing/site-footer";
import { ColumnGuides } from "@/components/landing/line-art";
import {
  NotForProfit,
  PilotProgram,
  PilotStory,
  PricingOverview,
} from "@/components/landing/split-sections";
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

        <LessonsTeaser />

        <section
          id="efficacy"
          aria-labelledby="research-heading"
          className="border-b border-border/60"
        >
          <AiOnYourTerms />
        </section>

        <NotForProfit />

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
                    Teachers request access, students join with a class code
                  </span>
                </p>
                <div className="mt-10 flex flex-wrap gap-3">
                  <PrimaryPill href="/request-access">Request teacher access</PrimaryPill>
                  <SecondaryPill href="mailto:rushil@scorpioedu.org?subject=Department%20demo">Request a department demo</SecondaryPill>
                </div>
              </Split>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter reveal />
    </div>
  );
}
