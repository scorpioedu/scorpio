"use client";

// "Read the lessons first": on an assignment's start screen, the lessons the teacher asked for, each
// opened in the lesson dialog and marked read there. Start unlocks once every one is read. Read
// marks are kept by the server (GET/POST /api/assignments/{id}/lesson-reads), so they follow the
// student to another device and the teacher sees them.
import { useEffect, useState } from "react";
import { BookOpen, Check } from "lucide-react";
import { ClickIcon } from "@/components/ui/click-icon";
import { CheckIcon as AnimatedCheck } from "@animateicons/react/lucide/check-icon";
import { toast } from "sonner";
import { apTopic } from "@/data/ap";
import { getCurriculum } from "@/data/curricula";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { mayStart, type LessonReads } from "@/lib/read-first";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LessonDialog, useLessons, type LessonTarget } from "@/components/guide/lesson-dialog";

export function ReadFirst({
  assignmentId,
  curriculumId,
  topics,
  onAllRead,
}: {
  assignmentId: string;
  /** The course whose lessons these are (src/lib/read-first.ts lessonCourse). */
  curriculumId: string;
  topics: string[];
  /** Called with true once every lesson is read (and false until then). */
  onAllRead: (done: boolean) => void;
}) {
  const course = getCurriculum(curriculumId)?.apCourse;
  const [reads, setReads] = useState<LessonReads | null>(null);
  /** The lessons the server asks for now (the teacher may have changed them since the page loaded). */
  const [asked, setAsked] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<LessonTarget | null>(null);
  const [marking, setMarking] = useState(false);
  const key = topics.join(",");

  useEffect(() => {
    let active = true;
    authenticatedFetch(`/api/assignments/${encodeURIComponent(assignmentId)}/lesson-reads`)
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const body = await res.json();
        if (!active) return;
        setReads(body.reads ?? {});
        setAsked(Array.isArray(body.topics) ? body.topics : null);
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [assignmentId, key]);

  // The server's list decides (an empty one means reading is off now); until it answers, this page's.
  const required = asked ?? topics;
  const lessons = useLessons(curriculumId, required);
  const guide = lessons.guide;
  const count = required.filter((t) => reads?.[t]).length;
  const broken = failed || lessons.failed;
  const ready = mayStart(required, reads, broken);
  useEffect(() => onAllRead(ready), [ready, onAllRead]);

  const markRead = async (topic: string) => {
    setMarking(true);
    try {
      const res = await authenticatedFetch(
        `/api/assignments/${encodeURIComponent(assignmentId)}/lesson-reads`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not save. Try again.");
      const next: LessonReads = body.reads ?? { ...reads, [topic]: new Date().toISOString() };
      setReads(next);
      // On to the next lesson still to read; with none left, back to the start screen.
      const after = required.slice(required.indexOf(topic) + 1).concat(required);
      const unread = after.find((t) => !next[t]);
      setOpen(unread ? { topic: unread } : null);
      if (!unread) toast.success("All read. You can start the problems.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save. Try again.");
    } finally {
      setMarking(false);
    }
  };

  // Nothing to read (no course, or the teacher has turned reading off since the page loaded).
  if (!course || required.length === 0) return null;

  return (
    <section
      aria-labelledby="read-first-heading"
      className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="read-first-heading" className="flex items-center gap-2 text-base font-semibold">
          <BookOpen className="size-4 text-primary" aria-hidden /> Read first
        </h2>
        {reads && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {count} of {required.length} read
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Your teacher wants you to read {topics.length === 1 ? "this lesson" : "these lessons"}{" "}
        before the problems. Open each one and mark it read when you&apos;re done.
      </p>
      {broken && (
        <p role="alert" className="text-sm text-muted-foreground">
          The lessons could not be loaded right now, so you can start without them. Reload the page
          to try again.
        </p>
      )}
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
        {required.map((t) => {
          const read = !!reads?.[t];
          return (
            <li key={t} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
              <span className="flex min-w-0 items-baseline gap-2 text-sm">
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-semibold tabular-nums">
                  {t}
                </span>
                <span className="min-w-0 break-words font-medium">{apTopic(t, course)?.title}</span>
              </span>
              <Button
                size="sm"
                variant={read ? "ghost" : "outline"}
                onClick={() => setOpen({ topic: t })}
                disabled={!guide}
                className={cn(read && "text-emerald-700 dark:text-emerald-400")}
              >
                {read ? (
                  <>
                    <ClickIcon icon={AnimatedCheck} aria-hidden /> Read
                  </>
                ) : (
                  "Read lesson"
                )}
                <span className="sr-only">: {apTopic(t, course)?.title}</span>
              </Button>
            </li>
          );
        })}
      </ul>
      <LessonDialog
        course={course}
        guide={guide}
        topics={required}
        target={open}
        onTarget={setOpen}
        failed={lessons.failed}
        footer={(t) =>
          reads?.[t] ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
              <Check className="size-4" aria-hidden /> Marked read
            </span>
          ) : (
            <Button size="sm" onClick={() => markRead(t)} disabled={marking}>
              <ClickIcon icon={AnimatedCheck} aria-hidden /> {marking ? "Saving…" : "Mark as read"}
            </Button>
          )
        }
      />
    </section>
  );
}
