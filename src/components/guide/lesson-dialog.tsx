"use client";

// One topic's lesson in a dialog, with the unit's other lessons a step away (Previous / Next). The
// teacher's unit guide opens it from its Lessons tab, a set or a mistake; a student's read-first
// assignment opens it from the "Before you start" list, with a footer to mark the lesson read.
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { apTopic, type ApCourseId } from "@/data/ap";
import { loadUnitGuide, topicFromAnchor, topicGuide, type UnitGuide } from "@/lib/guides";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TopicGuide, type PracticeLink } from "./topic-guide";

const unitOf = (topic: string) => Number(topic.split(".")[0]);

/**
 * The lessons for some topics, which may span units (each unit is its own file), as one guide the
 * dialog can look topics up in. null while loading; `failed` when a file could not be loaded.
 */
export function useLessons(curriculumId: string | null | undefined, topics: string[]) {
  const key = curriculumId && topics.length ? `${curriculumId}|${topics.join(",")}` : "";
  const [state, setState] = useState<{ key: string; guide: UnitGuide | null; failed: boolean }>({
    key: "",
    guide: null,
    failed: false,
  });
  useEffect(() => {
    if (!key) return;
    const [course, list] = key.split("|");
    const units = [...new Set(list.split(",").map(unitOf))];
    let active = true;
    Promise.all(units.map((u) => loadUnitGuide(course, u)))
      .then((files) => {
        const guides = files.filter((g): g is UnitGuide => !!g);
        if (active)
          setState({
            key,
            guide: guides.length
              ? { curriculumId: course, unit: units[0], guides: guides.flatMap((g) => g.guides) }
              : null,
            failed: false,
          });
      })
      .catch(() => active && setState({ key, guide: null, failed: true }));
    return () => {
      active = false;
    };
  }, [key]);
  const current = state.key === key ? state : null;
  return { guide: current?.guide ?? null, failed: !!current?.failed };
}

/** What the dialog's body shows: the lesson, a wait, or why there is none. */
export function lessonBody(
  hasLesson: boolean,
  loaded: boolean,
  failed: boolean,
): "lesson" | "loading" | "missing" | "failed" {
  if (hasLesson) return "lesson";
  if (failed) return "failed";
  return loaded ? "missing" : "loading";
}

export interface LessonTarget {
  topic: string;
  /** An element inside the lesson to land on (a "Common mistakes" entry), by id. */
  anchor?: string;
}

export interface LessonDialogProps {
  course: ApCourseId;
  /** The unit's lessons; null while loading. */
  guide: UnitGuide | null;
  /** The topics Previous / Next step through, in order. */
  topics: string[];
  target: LessonTarget | null;
  onTarget: (target: LessonTarget | null) => void;
  teacher?: boolean;
  practiceFor?: (topicId: string) => PracticeLink[];
  prerequisiteHref?: (topicId: string) => string | undefined;
  /** Under the lesson, beside Previous / Next (a student's "Mark as read"). */
  footer?: (topicId: string) => ReactNode;
  /** The lesson files could not be loaded: say so instead of "Loading" for ever. */
  failed?: boolean;
}

export function LessonDialog({
  course,
  guide,
  topics,
  target,
  onTarget,
  teacher,
  practiceFor,
  prerequisiteHref,
  footer,
  failed = false,
}: LessonDialogProps) {
  const body = useRef<HTMLDivElement>(null);
  const id = target?.topic ?? null;
  const g = id ? topicGuide(guide, id) : undefined;
  const at = id ? topics.indexOf(id) : -1;
  const info = id ? apTopic(id, course) : undefined;

  // A new lesson starts at its top, or at the entry asked for. The lesson's equations and diagrams
  // draw after it opens and push an entry down, so line up once more when it has settled.
  const anchor = target?.anchor;
  useEffect(() => {
    if (!id || !g) return;
    const land = () => {
      const el = anchor ? document.getElementById(anchor) : null;
      if (el) el.scrollIntoView({ block: "start" });
      else body.current?.scrollTo({ top: 0 });
    };
    const first = window.setTimeout(land, 30);
    const again = anchor ? window.setTimeout(land, 600) : undefined;
    return () => {
      window.clearTimeout(first);
      window.clearTimeout(again);
    };
  }, [id, anchor, g]);

  /** A link inside the lesson to another topic of the unit (a prerequisite) opens that lesson here. */
  const openLinked = (e: MouseEvent<HTMLDivElement>) => {
    const link = (e.target as HTMLElement).closest?.("a[href*='#topic-']") as HTMLAnchorElement;
    if (!link) return;
    const linked = topicFromAnchor(new URL(link.href).hash);
    if (linked && linked !== id && topicGuide(guide, linked)) {
      e.preventDefault();
      onTarget({ topic: linked });
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onTarget(null)}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="border-b border-border px-5 py-4 text-left sm:px-6">
          <DialogDescription className="text-xs font-semibold uppercase tracking-wider text-primary">
            Lesson {id}
            {topics.length > 1 && at >= 0 ? ` · ${at + 1} of ${topics.length}` : ""}
          </DialogDescription>
          <DialogTitle className="pr-6 text-xl">{info?.title ?? `Topic ${id}`}</DialogTitle>
        </DialogHeader>
        <div
          ref={body}
          onClickCapture={openLinked}
          className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6"
        >
          {lessonBody(!!g, !!guide, failed) === "lesson" && g ? (
            <TopicGuide
              // A new topic is a new lesson: its "Try it" and worked examples start fresh, never
              // with the last topic's state (whose parameters it may not have).
              key={g.topic}
              guide={g}
              course={course}
              teacher={teacher}
              practice={practiceFor?.(g.topic)}
              prerequisiteHref={prerequisiteHref}
              headingLevel={3}
            />
          ) : lessonBody(!!g, !!guide, failed) !== "loading" ? (
            // Loaded (or failed) and still no lesson: a topic without one, never a spinner for ever.
            <p role="alert" className="text-sm text-muted-foreground">
              {failed
                ? "The lesson could not be loaded. Close this and try again."
                : "There is no lesson for this topic."}
            </p>
          ) : (
            <p role="status" className="text-sm text-muted-foreground">
              Loading the lesson…
            </p>
          )}
        </div>
        <DialogFooter className="flex-row flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3 sm:justify-between sm:px-6">
          <div className="flex gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              disabled={at <= 0}
              onClick={() => onTarget({ topic: topics[at - 1] })}
            >
              <ArrowLeft aria-hidden /> Previous
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={at < 0 || at >= topics.length - 1}
              onClick={() => onTarget({ topic: topics[at + 1] })}
            >
              Next <ArrowRight aria-hidden />
            </Button>
          </div>
          {id && footer?.(id)}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
