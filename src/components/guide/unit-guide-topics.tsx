"use client";

// A unit's topics, each with its lesson (the topic's guide) behind "Read the lesson". Collapsed, a topic is its number,
// title and one-line summary; a link to #topic-4-1 opens that topic. Shared by the teacher's unit
// guide (its Lessons tab) and the student guide page.
import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { BookOpen, ChevronDown } from "lucide-react";
import { apTopic, type ApCourseId } from "@/data/ap";
import { topicAnchor, topicFromAnchor, topicGuide, type UnitGuide } from "@/lib/guides";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TopicGuide, type PracticeLink } from "./topic-guide";

export interface UnitGuideTopicsProps {
  course: ApCourseId;
  /** Topic ids, in the order to list them. */
  topics: string[];
  /** null while the guide file is loading: the rows show, without "Read the lesson". */
  guide: UnitGuide | null;
  teacher?: boolean;
  practiceFor?: (topicId: string) => PracticeLink[];
  prerequisiteHref?: (topicId: string) => string | undefined;
  /** A line under a topic's summary (the teacher's "Practised in 4A"). */
  meta?: (topicId: string) => ReactNode;
  /** Classes for the topic-number chip (the unit's colour on the teacher's pages). */
  chipClassName?: string;
  /** Topics open at first (tests; a page opens the topic in its address instead). */
  defaultOpen?: string[];
  /** Level of a topic's title; the guide's sections are one lower. */
  headingLevel?: 2 | 3;
  /**
   * Opens a topic's lesson somewhere else (the teacher's lesson dialog) instead of below its row.
   * The address (#topic-4-1) then opens nothing here: the page handles it.
   */
  onRead?: (topicId: string) => void;
}

export function UnitGuideTopics({
  course,
  topics,
  guide,
  teacher,
  practiceFor,
  prerequisiteHref,
  meta,
  chipClassName = "bg-muted text-foreground",
  defaultOpen = [],
  headingLevel = 2,
  onRead,
}: UnitGuideTopicsProps) {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(defaultOpen));
  const Title = `h${headingLevel}` as "h2" | "h3";

  // The topic named in the address (#topic-4-1) opens and scrolls into view, on arrival and when
  // the address changes.
  const listed = topics.join(",");
  const loaded = !!guide;
  const inline = !onRead;
  useEffect(() => {
    if (!inline) return;
    const show = () => {
      const id = topicFromAnchor(window.location.hash);
      if (!id || !listed.split(",").includes(id)) return;
      setOpen((o) => (o.has(id) ? o : new Set(o).add(id)));
      // A link to one "Common mistakes" entry (#topic-4-2-mistake-…) lands on that entry once the
      // guide has drawn; otherwise on the topic.
      const exact = window.location.hash.slice(1);
      const target = () =>
        document.getElementById(exact) ?? document.getElementById(topicAnchor(id));
      window.setTimeout(() => target()?.scrollIntoView({ behavior: "smooth" }), 50);
      // The lesson's equations and diagrams draw after it opens and push an entry further down, so
      // the first scroll can stop short: line up once more when it has settled.
      window.setTimeout(() => {
        const el = target();
        if (el && Math.abs(el.getBoundingClientRect().top) > window.innerHeight / 2)
          el.scrollIntoView({ behavior: "smooth" });
      }, 700);
    };
    show();
    window.addEventListener("hashchange", show);
    return () => window.removeEventListener("hashchange", show);
  }, [listed, loaded, inline]);

  const toggle = (id: string) => {
    if (onRead) return onRead(id);
    const next = new Set(open);
    if (next.has(id)) next.delete(id);
    else {
      next.add(id);
      window.history.replaceState(null, "", `#${topicAnchor(id)}`);
    }
    setOpen(next);
  };

  /** A link inside a guide to another topic on this page (a prerequisite) opens that topic. */
  const openLinked = (e: MouseEvent<HTMLOListElement>) => {
    const link = (e.target as HTMLElement).closest?.("a[href*='#topic-']");
    const id = link ? topicFromAnchor(new URL((link as HTMLAnchorElement).href).hash) : null;
    if (id && topics.includes(id)) setOpen((o) => (o.has(id) ? o : new Set(o).add(id)));
  };

  return (
    <ol className="space-y-3" onClickCapture={openLinked}>
      {topics.map((id) => {
        const topic = apTopic(id, course);
        const g = topicGuide(guide, id);
        const isOpen = open.has(id) && !!g;
        const panel = `${topicAnchor(id)}-guide`;
        return (
          <li
            key={id}
            id={topicAnchor(id)}
            className="scroll-mt-24 rounded-2xl border border-border bg-card"
          >
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 p-4">
              <div className="min-w-0 flex-1 basis-64 space-y-2">
                <Title className="flex items-baseline gap-2 text-base">
                  <span
                    className={cn(
                      "rounded-lg px-1.5 py-0.5 text-sm font-semibold tabular-nums",
                      chipClassName,
                    )}
                  >
                    {id}
                  </span>
                  <span className="min-w-0 break-words font-semibold">{topic?.title}</span>
                </Title>
                {topic?.summary && (
                  <p className="text-sm leading-relaxed text-muted-foreground">{topic.summary}</p>
                )}
                {meta?.(id)}
              </div>
              {g && (
                <Button
                  type="button"
                  variant={isOpen ? "outline" : inline ? "default" : "outline"}
                  size="sm"
                  aria-expanded={inline ? isOpen : undefined}
                  aria-controls={inline ? panel : undefined}
                  onClick={() => toggle(id)}
                >
                  {inline ? (
                    <ChevronDown
                      className={cn("transition-transform", isOpen && "rotate-180")}
                      aria-hidden
                    />
                  ) : (
                    <BookOpen aria-hidden />
                  )}
                  {isOpen ? "Hide the lesson" : "Read the lesson"}
                  <span className="sr-only">: {topic?.title}</span>
                </Button>
              )}
            </div>
            <div id={panel}>
              {isOpen && g && (
                <div className="border-t border-border p-4">
                  <TopicGuide
                    guide={g}
                    course={course}
                    teacher={teacher}
                    practice={practiceFor?.(id)}
                    prerequisiteHref={prerequisiteHref}
                    headingLevel={(headingLevel + 1) as 3 | 4}
                  />
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
