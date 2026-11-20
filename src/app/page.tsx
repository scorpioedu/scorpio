import { ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { Comparison } from "@/components/landing/comparison";
import { CourseGrid } from "@/components/landing/course-grid";
import { HomeChatbot, HomeHeader, HomeScrollReveal } from "@/components/landing/home-interactions";
import reveal from "@/components/landing/home-reveal.module.css";
import { LandingHero } from "@/components/landing/LandingHero";
import { RoleGate } from "@/components/landing/role-gate";
import { ProductShot } from "@/components/landing/product-shot";
import { ColumnGuides } from "@/components/landing/line-art";
import { WorkflowRows } from "@/components/landing/workflow-rows";
import { LandingFAQ } from "@/components/landing-faq";
import { LoadingScreen } from "@/components/loading-screen";
import { Button } from "@/components/ui/button";
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

        <ProductShot />

        <WorkflowRows />

        <CourseGrid />

        <section
          id="efficacy"
          aria-labelledby="research-heading"
          className="border-b border-border/60"
        >
          <Comparison />
        </section>

        <LandingFAQ minimal />

        <section
          id="cta"
          aria-labelledby="cta-heading"
          className="mx-auto max-w-6xl px-5 pb-20 sm:px-8 sm:pb-28"
        >
          <div
            data-scroll-reveal
            className={`${reveal.stagger} flex flex-col gap-6 rounded-2xl border border-border bg-muted/40 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-10`}
          >
            <div>
              <h2
                id="cta-heading"
                className="text-2xl font-semibold tracking-[-0.03em] sm:text-3xl"
              >
                Try it with one unit
              </h2>
              <p className="mt-2 max-w-lg text-pretty leading-relaxed text-muted-foreground">
                Free for individual teachers. Departments get a flat plan with sharing and higher AI
                limits.{" "}
                <Link
                  href="/pricing"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  See pricing
                </Link>
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-3 sm:items-end">
              <Button
                asChild
                className="group h-12 rounded-xl px-5 shadow-sm shadow-primary/20 motion-reduce:transition-none"
              >
                <Link href="/request-access" prefetch={false}>
                  Request classroom access
                  <ArrowRight
                    aria-hidden="true"
                    className="size-4 motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5"
                  />
                </Link>
              </Button>
              <Link
                href="/contact"
                className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Or request a department demo
              </Link>
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
