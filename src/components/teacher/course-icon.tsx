// One hand-drawn icon per course, so a teacher can tell at a glance which course a class is on.
// Each picture is something from that course: a projectile for AP Physics 1 (algebra-based
// mechanics), an atom for AP Physics 2 (electricity through modern physics), and an integral sign
// beside a moving ball for AP Physics C: Mechanics (the same mechanics, with calculus).
// Drawn like the app's other icons: 24 × 24, 2px round strokes in the current text colour.
import type { ReactNode } from "react";
import { Route } from "lucide-react";
import { curriculumUnits, getCurriculum, hasContent, type Curriculum } from "@/data/curricula";
import { cn } from "@/lib/utils";

const DRAWINGS: Record<string, ReactNode> = {
  // A ball in flight over the ground, with the path it has travelled.
  "ap-physics-1": (
    <>
      <path d="M3 20.5h18" />
      <path d="M4.5 18.5C7 10.5 10.5 7 14.5 7.2" strokeDasharray="2.6 3.2" />
      <circle cx="18" cy="9" r="2.6" fill="currentColor" stroke="none" />
    </>
  ),
  // A nucleus with three electron orbits.
  "ap-physics-2": (
    <>
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <ellipse cx="12" cy="12" rx="9.5" ry="3.8" />
      <ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(60 12 12)" />
      <ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(-60 12 12)" />
    </>
  ),
  // An integral sign, and a ball with its velocity arrow.
  "ap-physics-c-mech": (
    <>
      <path d="M11.5 4.6C9.4 3.6 8 4.7 7.8 7l-.9 10c-.2 2.3-1.6 3.4-3.7 2.4" />
      <circle cx="14.5" cy="15.5" r="1.75" fill="currentColor" stroke="none" />
      <path d="M16 14l4.5-4.5" />
      <path d="M17 9.5h3.5V13" />
    </>
  ),
};

/** The course's own icon (a plain route for a course without one). */
export function CourseIcon({
  curriculumId,
  className,
}: {
  curriculumId: string | null | undefined;
  className?: string;
}) {
  const drawing = curriculumId ? DRAWINGS[curriculumId] : undefined;
  if (!drawing) return <Route aria-hidden className={className} />;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn("size-4 shrink-0", className)}
    >
      {drawing}
    </svg>
  );
}

/** How a course looks and reads wherever one is picked. */
export interface CourseLook {
  /** "Algebra-based" or "Calculus-based": the first thing a teacher needs to know. */
  level: string;
  /** What the course covers, in a line. */
  covers: string;
  /** Text and tint classes for the icon's tile. */
  tint: string;
}

const LOOKS: Record<string, CourseLook> = {
  "ap-physics-1": {
    level: "Algebra-based",
    covers: "Motion, forces, energy, momentum, rotation, oscillations and fluids.",
    tint: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  },
  "ap-physics-2": {
    level: "Algebra-based",
    covers: "Thermodynamics, electricity, circuits, magnetism, optics, waves and modern physics.",
    tint: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  "ap-physics-c-mech": {
    level: "Calculus-based",
    covers: "Mechanics with derivatives and integrals throughout.",
    tint: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
};

export function courseLook(curriculumId: string | null | undefined): CourseLook {
  return (
    (curriculumId ? LOOKS[curriculumId] : undefined) ?? {
      level: "",
      covers: getCurriculum(curriculumId)?.description ?? "",
      tint: "bg-primary/10 text-primary",
    }
  );
}

/** The course's icon on its tinted tile. */
export function CourseBadge({
  curriculumId,
  className,
  iconClassName,
}: {
  curriculumId: string | null | undefined;
  className?: string;
  iconClassName?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-xl",
        courseLook(curriculumId).tint,
        className,
      )}
    >
      <CourseIcon curriculumId={curriculumId} className={cn("size-5", iconClassName)} />
    </span>
  );
}

/** "8 units · 32 sets · 160 problems", or "Planned" for a course with nothing written. */
export function courseSize(c: Curriculum): string {
  if (!hasContent(c)) return "Planned";
  const units = curriculumUnits(c.id).filter((u) => u.sets.length > 0).length;
  const problems = c.sets.reduce((n, s) => n + s.draftIds.length, 0);
  return `${units} units · ${c.sets.length} sets · ${problems} problems`;
}
