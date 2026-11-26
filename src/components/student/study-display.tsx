// Study's display pieces, with no Firebase and no data loading, so any page (the lesson reader, a
// server page) can import them cheaply: a topic's level as a small meter, the "read" and "in
// review" marks, a review problem's topic label, the links into a topic (its lesson in the course
// reader, where its practice also lives) or a practice run, and a few formatters.
// `@/components/student/study-ui` re-exports all of it alongside the progress hook.
import type { ReactNode } from "react";
import Link from "next/link";
import { Check, RotateCcw } from "lucide-react";
import type { StudyCourse, StudyTopic } from "@/lib/study/catalog";
import { cn } from "@/lib/utils";

export const LEVEL_LABEL: Record<StudyTopic["level"], string> = {
  new: "New",
  learning: "Learning",
  practised: "Practised",
  strong: "Strong",
};

const LEVEL_BARS: Record<StudyTopic["level"], number> = {
  new: 0,
  learning: 1,
  practised: 2,
  strong: 3,
};

/** Three short bars, filled up to the topic's level, with the level's name for screen readers. */
export function LevelMeter({
  level,
  showLabel = false,
  className,
}: {
  level: StudyTopic["level"];
  showLabel?: boolean;
  className?: string;
}) {
  const filled = LEVEL_BARS[level];
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span aria-hidden className="flex items-end gap-0.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn(
              "w-1 rounded-full",
              i === 0 ? "h-1.5" : i === 1 ? "h-2.5" : "h-3.5",
              i < filled ? "bg-primary" : "bg-muted-foreground/25",
            )}
          />
        ))}
      </span>
      <span className={showLabel ? "text-xs text-muted-foreground" : "sr-only"}>
        {LEVEL_LABEL[level]}
      </span>
    </span>
  );
}

export function InReviewMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary",
        className,
      )}
    >
      <RotateCcw aria-hidden className="size-3" />
      In review
    </span>
  );
}

/** A tick for a topic whose lesson has been opened; an empty slot of the same width otherwise. */
export function ReadMark({ read, className }: { read: boolean; className?: string }) {
  return read ? (
    <span className={cn("inline-flex size-4 shrink-0 items-center justify-center", className)}>
      <Check aria-hidden className="size-4 text-emerald-600 dark:text-emerald-400" />
      <span className="sr-only">Read</span>
    </span>
  ) : (
    <span aria-hidden className={cn("inline-block size-4 shrink-0", className)} />
  );
}

/**
 * Where a topic is studied: its lesson in the course reader (practice for the topic sits under the
 * lesson there), else its practice page when it has problems, else nowhere yet.
 */
export function topicStudyHref(
  courseId: string,
  topic: Pick<StudyTopic, "id" | "lessonHref" | "problems">,
): string | null {
  if (topic.lessonHref) return topic.lessonHref;
  return topic.problems > 0 ? topicPracticeHref(courseId, topic.id) : null;
}

export function topicPracticeHref(courseId: string, topicId: string): string {
  return `/student/study/practice?${new URLSearchParams({ course: courseId, topic: topicId })}`;
}

export function unitPracticeHref(courseId: string, unit: number): string {
  return `/student/study/practice?${new URLSearchParams({ course: courseId, unit: String(unit) })}`;
}

/** Every topic of every course by its key ("ap-physics-1:3.4"), with its course and unit. */
export function topicIndex(
  courses: StudyCourse[],
): Map<string, { course: StudyCourse; unit: number; topic: StudyTopic }> {
  const index = new Map<string, { course: StudyCourse; unit: number; topic: StudyTopic }>();
  for (const course of courses)
    for (const unit of course.units)
      for (const topic of unit.topics) index.set(topic.key, { course, unit: unit.unit, topic });
  return index;
}

/** "Tue, Dec 2", or "today" / "tomorrow" when it is that close. */
export function reviewDay(iso: string, now = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "soon";
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(date) - day(now)) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * A review problem's topic ("3.4 Conservation of energy") with a small "Re-read 3.4" link to the
 * topic's lesson when it has one. The lesson opens in a new tab so the review run is not lost.
 */
export function ReviewTopicLabel({
  topicId,
  topic,
}: {
  topicId: string;
  topic: Pick<StudyTopic, "title" | "lessonHref"> | undefined;
}) {
  return (
    <>
      {topic ? `${topicId} ${topic.title}` : `Topic ${topicId}`}
      {topic?.lessonHref && (
        <>
          {" · "}
          <Link
            href={topic.lessonHref}
            target="_blank"
            rel="noopener"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Re-read {topicId}
            <span className="sr-only"> (opens in a new tab)</span>
          </Link>
        </>
      )}
    </>
  );
}

const STRIP_TONE: Record<StudyTopic["level"], string> = {
  new: "bg-muted-foreground/15",
  learning: "bg-primary/35",
  practised: "bg-primary/65",
  strong: "bg-primary",
};

/**
 * A unit at a glance: one short segment per topic, shaded by the topic's level. Decorative; the
 * counts next to it say the same in words.
 */
export function TopicStrip({
  topics,
  className,
}: {
  topics: Pick<StudyTopic, "id" | "level">[];
  className?: string;
}) {
  return (
    <span aria-hidden className={cn("flex h-1.5 gap-0.5", className)}>
      {topics.map((t) => (
        <span key={t.id} className={cn("min-w-1 flex-1 rounded-full", STRIP_TONE[t.level])} />
      ))}
    </span>
  );
}

/** The small uppercase label the app's cards open with ("Course progress", "Review"). */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
        className,
      )}
    >
      {children}
    </p>
  );
}
