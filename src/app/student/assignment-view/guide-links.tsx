"use client";

// Links from an assignment to the course guides: each question's topic ("Study guide") and, once
// the work is graded, the guide's entry for a misconception the grader tagged on an answer.
import { useEffect, useState } from "react";
import Link from "next/link";
import { ClickIcon } from "@/components/ui/click-icon";
import { BookOpenIcon as AnimatedBookOpen } from "@animateicons/react/lucide/book-open-icon";
import {
  hasUnitGuide,
  loadUnitGuide,
  misconceptionAnchor,
  studentGuideHref,
  topicGuide,
  type UnitGuide,
} from "@/lib/guides";

/** 4 from "4.2"; null for anything that is not a topic id. */
export function guideUnitOf(apTopic: unknown): number | null {
  const m = typeof apTopic === "string" ? apTopic.match(/^(\d{1,2})\.\d{1,2}$/) : null;
  return m ? Number(m[1]) : null;
}

/** The guide page for a question's topic, or null when the assignment follows no course or the unit has no guide. */
export function topicGuideHref(curriculumId: unknown, apTopic: unknown): string | null {
  const unit = guideUnitOf(apTopic);
  if (typeof curriculumId !== "string" || !curriculumId || unit === null) return null;
  return hasUnitGuide(curriculumId, unit)
    ? studentGuideHref(curriculumId, unit, apTopic as string)
    : null;
}

/**
 * The guide's "Common mistakes" entry for the first of an answer's misconception tags that the
 * topic's guide covers, or null. Only ever called for graded work: the tags say an answer was wrong.
 */
export function misconceptionGuideHref(
  curriculumId: unknown,
  apTopic: unknown,
  tags: unknown,
  guide: UnitGuide | null | undefined,
): string | null {
  const unit = guideUnitOf(apTopic);
  if (typeof curriculumId !== "string" || unit === null || !guide || !Array.isArray(tags))
    return null;
  const entries = topicGuide(guide, apTopic as string)?.misconceptions ?? [];
  const tag = tags.find((t) => typeof t === "string" && entries.some((m) => m.tag === t));
  return tag
    ? `${studentGuideHref(curriculumId, unit)}#${misconceptionAnchor(apTopic as string, tag)}`
    : null;
}

/** Loads the guides of the given units (each its own chunk). Pass no units to load nothing. */
export function useUnitGuides(curriculumId: unknown, units: number[]): Map<number, UnitGuide> {
  const [guides, setGuides] = useState<Map<number, UnitGuide>>(new Map());
  const wanted = [...new Set(units)].sort((a, b) => a - b).join(",");
  useEffect(() => {
    if (typeof curriculumId !== "string" || !wanted) return;
    let active = true;
    for (const unit of wanted.split(",").map(Number)) {
      if (!hasUnitGuide(curriculumId, unit)) continue;
      loadUnitGuide(curriculumId, unit)
        .then((guide) => {
          if (active && guide) setGuides((current) => new Map(current).set(unit, guide));
        })
        // Without the guide the page only has no "common mistake" links.
        .catch(() => undefined);
    }
    return () => {
      active = false;
    };
  }, [curriculumId, wanted]);
  return guides;
}

/** A small link to a guide. `newTab` keeps unsaved answers on the page the student is working on. */
export function GuideLink({
  href,
  newTab = false,
  children,
}: {
  href: string;
  newTab?: boolean;
  children: string;
}) {
  return (
    <Link
      href={href}
      {...(newTab ? { target: "_blank", rel: "noopener" } : {})}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-primary underline-offset-4 hover:underline"
    >
      <ClickIcon icon={AnimatedBookOpen} className="size-3.5" aria-hidden />
      {children}
    </Link>
  );
}
