import { ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/*
 * The landing page's section kit, after Polar's quiet layout: a short heading on the left, a
 * two-tone statement on the right (one line in ink, one in grey), pill buttons and round arrow
 * links. Every section below the hero is built from these, so they stay one system.
 */

/** One section: full-width rule below, content on the shared max-w-6xl wrap. */
export function Section({
  labelledBy,
  id,
  children,
  className = "",
}: {
  labelledBy: string;
  id?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={`scroll-mt-20 border-b border-border/60 ${className}`}
    >
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">{children}</div>
    </section>
  );
}

export const statement =
  "text-pretty text-[clamp(1.5rem,2.6vw,2.15rem)] font-medium leading-[1.18] tracking-[-0.035em]";
export const label =
  "text-[clamp(1.5rem,2.6vw,2.15rem)] font-medium leading-[1.18] tracking-[-0.035em]";

/** Left label, right statement. The label is the section's heading. */
export function Split({
  id,
  heading,
  children,
}: {
  id: string;
  heading: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-6 md:grid-cols-2 md:gap-12">
      <h2 id={id} className={label}>
        {heading}
      </h2>
      <div>{children}</div>
    </div>
  );
}

/** The pill buttons, matching the hero's. */
export function PrimaryPill({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Button
      asChild
      className="group h-11 w-full gap-1.5 rounded-full pl-5 pr-4 sm:w-auto shadow-sm shadow-primary/20 motion-safe:active:scale-[0.98] dark:bg-primary/80 dark:hover:bg-primary/70"
    >
      <Link href={href}>
        {children}
        <ArrowRight
          aria-hidden="true"
          className="size-4 motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5"
        />
      </Link>
    </Button>
  );
}

export function SecondaryPill({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Button
      asChild
      variant="secondary"
      className="h-11 w-full rounded-full px-5 motion-safe:active:scale-[0.98] sm:w-auto"
    >
      <Link href={href}>{children}</Link>
    </Button>
  );
}

/** A round arrow button with its label beside it; the label's underline draws on hover. */
export function CircleLink({
  href,
  children,
  external = false,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  external?: boolean;
  className?: string;
}) {
  const Icon = external ? ArrowUpRight : ArrowRight;
  return (
    <Link
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={`group inline-flex w-fit items-center gap-4 rounded-full pr-2 text-[15px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring ${className}`}
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-full border border-border bg-muted/50 transition-colors group-hover:border-primary/40 group-hover:bg-primary/10 group-hover:text-primary">
        <Icon
          aria-hidden="true"
          className={`size-4 motion-safe:transition-transform ${external ? "motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:translate-x-0.5" : "motion-safe:group-hover:translate-x-0.5"}`}
        />
      </span>
      <span className="bg-[linear-gradient(currentColor,currentColor)] bg-[length:0%_1px] bg-left-bottom bg-no-repeat pb-0.5 transition-[background-size] duration-300 group-hover:bg-[length:100%_1px]">
        {children}
      </span>
    </Link>
  );
}

/** The quiet card every grid on the page uses (pricing, courses, steps, results). */
export const card = "rounded-xl border border-border bg-muted/40 p-6 dark:bg-card sm:p-7";
