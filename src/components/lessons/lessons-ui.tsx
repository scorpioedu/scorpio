// Shared pieces of the public lessons (/lessons): the page frame, breadcrumbs, the practice call to
// action and structured data. Server components; they use the landing page's header, footer and kit
// so the lessons read as part of the same site.
import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { PrimaryPill } from "@/components/landing/split-kit";
import { cn } from "@/lib/utils";
import { VisitorOnly } from "./student-gate";

export const wrap = "mx-auto w-full max-w-6xl px-5 sm:px-8";

export function LessonsFrame({ children }: { children: React.ReactNode }) {
  return (
    <div data-lessons-page className="min-h-screen bg-background">
      <SiteHeader />
      <main id="main" className="overflow-x-clip pt-14">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol
        role="list"
        className="flex list-none flex-wrap items-center gap-1 text-sm text-muted-foreground"
      >
        {items.map((c, i) => (
          <li key={c.label} className="flex items-center gap-1">
            {i > 0 && <ChevronRight aria-hidden className="size-3.5 opacity-50" />}
            {c.href ? (
              <Link
                href={c.href}
                className="rounded-sm transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {c.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-foreground">
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

const ACCOUNT_POINTS = [
  "Every answer saved, on any device",
  "Missed topics come back for review",
  "Free, and no class code needed",
];

/**
 * The band at the end of every lessons page, for visitors: what a free student account adds to the
 * free lessons and practice. Signing up (or in) lands the student on `next`, the same place in the
 * app. Teachers get one quiet line of their own.
 */
export function AccountBand({ next, className }: { next: string; className?: string }) {
  const signup = `/signup?${new URLSearchParams({ role: "student", next })}`;
  const login = `/login?${new URLSearchParams({ next })}`;
  // A signed-in student already has an account; this pitch is for visitors.
  return (
    <VisitorOnly>
      <section
        aria-labelledby="account-band-heading"
        className={cn(
          "relative isolate overflow-hidden rounded-2xl border border-border bg-card",
          className,
        )}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(ellipse 55% 90% at 100% 0%, color-mix(in oklch, var(--primary) 16%, transparent), color-mix(in oklch, var(--primary) 5%, transparent) 45%, transparent 75%)",
          }}
        />
        <div className="grid gap-8 p-6 sm:p-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-primary">
              <span aria-hidden className="size-1.5 rounded-full bg-primary" />
              Free student account
            </p>
            <h2
              id="account-band-heading"
              className="mt-2 text-pretty text-2xl font-medium tracking-[-0.02em]"
            >
              Keep your answers and review what you miss
            </h2>
            <ul role="list" className="mt-5 grid list-none gap-2.5">
              {ACCOUNT_POINTS.map((point) => (
                <li key={point} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <span
                    aria-hidden
                    className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-primary/15 text-primary"
                  >
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-3 md:items-end">
            <PrimaryPill href={signup}>Create a free account</PrimaryPill>
            <p className="text-sm text-muted-foreground md:text-right">
              Have one?{" "}
              <Link
                href={login}
                prefetch={false}
                className="font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
              >
                Log in
              </Link>
            </p>
          </div>
        </div>
        <p className="border-t border-border px-6 py-3.5 text-sm text-muted-foreground sm:px-8">
          Teaching AP Physics?{" "}
          <Link
            href="/signup?role=teacher"
            prefetch={false}
            className="font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
          >
            Assign these problem sets to a class
          </Link>
          , graded for you.
        </p>
      </section>
    </VisitorOnly>
  );
}

/** JSON-LD for search engines. The data is our own, built at build time. */
export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      // Escape "<" so no string in the data can close the script tag.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

export const SITE = "https://scorpioedu.org";

/** A page's own openGraph replaces the root's, so the lessons name the site's share image again. */
export const OG_IMAGE = [{ url: "/og-image.jpg", width: 1200, height: 630, alt: "Scorpio" }];
