// Shared pieces of the public lessons (/lessons): the page frame, breadcrumbs, the practice call to
// action and structured data. Server components; they use the landing page's header, footer and kit
// so the lessons read as part of the same site.
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { PrimaryPill, SecondaryPill } from "@/components/landing/split-kit";
import { cn } from "@/lib/utils";

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

/** The band at the end of every lessons page: reading is free, practice is an account. */
export function PracticeBand({
  heading,
  line,
  className,
}: {
  heading: string;
  line: string;
  className?: string;
}) {
  return (
    <section
      aria-labelledby="practice-heading"
      className={cn("rounded-2xl border border-border p-6 sm:p-8", className)}
    >
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div className="space-y-2">
          <h2 id="practice-heading" className="text-pretty text-xl font-medium tracking-[-0.02em]">
            {heading}
          </h2>
          <p className="max-w-xl text-pretty text-muted-foreground">{line}</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <PrimaryPill href="/signup?role=student">Practice free</PrimaryPill>
          <SecondaryPill href="/signup">Assign it to a class</SecondaryPill>
        </div>
      </div>
    </section>
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
