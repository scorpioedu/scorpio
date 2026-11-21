"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

export interface SectionTab {
  href: string;
  label: string;
}

// Pages the teacher sidebar groups under one item. Each tab is its own route (or a ?tab= view of
// one), so existing links and bookmarks keep working. Keep in sync with `match` in teacher-sidebar.tsx.
export const TEACHER_SECTIONS = {
  assignments: {
    label: "Assignments",
    tabs: [
      { href: "/teacher/assignments", label: "All assignments" },
      { href: "/teacher/waypoints", label: "Library" },
    ],
  },
  grading: {
    label: "Grading",
    tabs: [
      { href: "/teacher/grades", label: "Gradebook" },
      { href: "/teacher/insights", label: "Misconceptions" },
    ],
  },
  classes: {
    label: "Classes",
    tabs: [
      { href: "/teacher/students", label: "Classes" },
      { href: "/teacher/students?tab=insights", label: "Learning insights" },
      { href: "/teacher/uploads", label: "Uploads" },
      { href: "/teacher/vault", label: "Formula vault" },
    ],
  },
} satisfies Record<string, { label: string; tabs: SectionTab[] }>;

export type TeacherSection = keyof typeof TEACHER_SECTIONS;

function splitHref(href: string): { path: string; tab: string | null } {
  const [path, query = ""] = href.split("?");
  return { path, tab: new URLSearchParams(query).get("tab") };
}

export function sectionForPath(path: string): TeacherSection | null {
  for (const [key, value] of Object.entries(TEACHER_SECTIONS)) {
    if (value.tabs.some((tab) => splitHref(tab.href).path === path)) return key as TeacherSection;
  }
  return null;
}

/**
 * Route tabs across the top of a grouped page. Shown only on the tab routes themselves,
 * not on their detail pages (e.g. /teacher/grades/student), so a section layout can
 * render it for every route under it.
 *
 * `sample` drives the landing-page preview: no routing, and only the tabs it has pages for.
 */
export function SectionTabs({
  section,
  sample,
}: {
  section: TeacherSection;
  sample?: RouteTabsSample;
}) {
  return <RouteTabs label={TEACHER_SECTIONS[section].label} tabs={TEACHER_SECTIONS[section].tabs} sample={sample} />;
}

interface RouteTabsSample {
  activeHref: string;
  onSelect: (href: string) => void;
  availableHrefs: readonly string[];
}

/** The tab bar itself, for any group of routes (teacher sections, the student Study page). */
export function RouteTabs(props: Parameters<typeof RouteTabsInner>[0]) {
  // useSearchParams needs a Suspense boundary so the layouts using this can still prerender.
  return (
    <Suspense fallback={null}>
      <RouteTabsInner {...props} />
    </Suspense>
  );
}

function RouteTabsInner({
  label,
  tabs: allTabs,
  sample,
}: {
  label: string;
  tabs: readonly SectionTab[];
  sample?: RouteTabsSample;
}) {
  const routePathname = usePathname();
  const searchParams = useSearchParams();
  const pathname = sample ? sample.activeHref : routePathname;
  const currentTab = sample ? null : (searchParams?.get("tab") ?? null);
  const tabs: readonly SectionTab[] = sample
    ? allTabs.filter((tab) => sample.availableHrefs.includes(tab.href))
    : allTabs;

  if (tabs.length < 2 || !tabs.some((tab) => splitHref(tab.href).path === pathname)) return null;
  const isActive = (href: string) => {
    const { path, tab } = splitHref(href);
    if (path !== pathname) return false;
    // A tab without ?tab= is active for any other ?tab= value its page does not have a tab for.
    const siblings = tabs.map((t) => splitHref(t.href)).filter((t) => t.path === path);
    const known = siblings.some((t) => t.tab === currentTab);
    return tab === currentTab || (tab === null && !known);
  };

  return (
    <nav aria-label={label} className="-mt-2 mb-6 overflow-x-auto border-b border-border/60">
      <ul className="flex min-w-max gap-1">
        {tabs.map((tab) => {
          const active = isActive(tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                onClick={
                  sample
                    ? (event) => {
                        event.preventDefault();
                        sample.onSelect(tab.href);
                      }
                    : undefined
                }
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex h-10 items-center border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors",
                  "focus-visible:rounded-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
