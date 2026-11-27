"use client";

// A unit's guide as a reader: the unit's topics (and the course's other units) in a sidebar on the
// left, one topic at a time on the right, with Previous and Next at the bottom that carry on into
// the neighbouring units. The topic shown is the one in the address (#topic-4-1), so links from
// assignments and prerequisites land on it; with no topic in the address it is the first one.
//
// The student reader adds practice: a topic's practice under its lesson (renderPractice), a unit
// check after the last topic (renderUnitCheck), and each topic's Study level in the sidebar
// (topicStatus). Without those props the reader is just the lessons.
import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { ClickIcon } from "@/components/ui/click-icon";
import { ArrowLeftIcon as AnimatedArrowLeft } from "@animateicons/react/lucide/arrow-left-icon";
import { CheckIcon as AnimatedCheck } from "@animateicons/react/lucide/check-icon";
import { ChevronsUpDownIcon as AnimatedChevronsUpDown } from "@animateicons/react/lucide/chevrons-up-down-icon";
import { ListIcon as AnimatedList } from "@animateicons/react/lucide/list-icon";
import { apUnit, type ApCourseId } from "@/data/ap";
import {
  guideUnits,
  studentGuideHref,
  topicAnchor,
  topicFromAnchor,
  topicGuide,
  type UnitGuide,
} from "@/lib/guides";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LEVEL_LABEL, LevelMeter } from "@/components/student/study-display";
import type { StudyTopic } from "@/lib/study/catalog";
import { TopicGuide, type PracticeLink } from "./topic-guide";

/** A topic's place in the student's Study progress. */
export interface ReaderTopicStatus {
  level: StudyTopic["level"];
  inReview: boolean;
  /** The lesson has been opened (on any device). */
  read: boolean;
}

/** The id of the unit check, so a "Unit check" button can scroll to it. */
export const UNIT_CHECK_ID = "unit-check";

export interface GuideReaderProps {
  curriculumId: string;
  courseName: string;
  course: ApCourseId;
  unit: number;
  /** null while the guide file loads. */
  guide: UnitGuide | null;
  failed?: boolean;
  practiceFor?: (topicId: string) => PracticeLink[];
  prerequisiteHref?: (topicId: string) => string | undefined;
  /** Where the back link in the top bar goes, and what it says. */
  backHref?: string;
  backLabel?: string;
  /** Practice for the topic shown, after its lesson and before the "Practise this" links. */
  renderPractice?: (topicId: string) => ReactNode;
  /** A check on the whole unit, after the last topic's lesson. */
  renderUnitCheck?: () => ReactNode;
  /**
   * The student's Study progress on a topic: a level meter per topic in the sidebar and a short
   * status under the topic's title. A topic counts as read when this says so or this device has it.
   */
  topicStatus?: (topicId: string) => ReaderTopicStatus | undefined;
  /** Called once a topic is shown (its lesson loaded), each time it becomes the open topic. */
  onTopicOpen?: (topicId: string) => void;
}

// The address hash as a store, so the topic follows links, Back and Forward without an effect.
const HASH_EVENT = "hashchange";
function subscribeHash(onChange: () => void) {
  window.addEventListener(HASH_EVENT, onChange);
  return () => window.removeEventListener(HASH_EVENT, onChange);
}
const readHash = () => window.location.hash;
const noHash = () => "";

/** Topics read on this device, per course. Only a convenience: it never leaves the browser. */
const READ_EVENT = "guide-read";
const readKey = (curriculumId: string) => `guide-read:${curriculumId}`;
function readMarks(curriculumId: string): string {
  try {
    return window.localStorage.getItem(readKey(curriculumId)) ?? "";
  } catch {
    return "";
  }
}
/** The topics this device has marked read in a course (the same marks the reader shows). */
export function localReadMarks(curriculumId: string): string[] {
  return readMarks(curriculumId).split(",").filter(Boolean);
}
/** Forgets this device's marks for a course (once they have been copied into a Study account). */
export function clearLocalReadMarks(curriculumId: string) {
  try {
    window.localStorage.removeItem(readKey(curriculumId));
    window.dispatchEvent(new Event(READ_EVENT));
  } catch {
    // Blocked storage: nothing was kept to clear.
  }
}
function subscribeMarks(onChange: () => void) {
  window.addEventListener(READ_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(READ_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
function markRead(curriculumId: string, topicId: string) {
  try {
    const now = new Set(readMarks(curriculumId).split(",").filter(Boolean));
    if (now.has(topicId)) return;
    now.add(topicId);
    window.localStorage.setItem(readKey(curriculumId), [...now].join(","));
    window.dispatchEvent(new Event(READ_EVENT));
  } catch {
    // Private windows and blocked storage: the marks are optional.
  }
}

export function GuideReader({
  curriculumId,
  courseName,
  course,
  unit,
  guide,
  failed = false,
  practiceFor,
  prerequisiteHref,
  backHref = "/student/study",
  backLabel = "Study",
  renderPractice,
  renderUnitCheck,
  topicStatus,
  onTopicOpen,
}: GuideReaderProps) {
  const info = apUnit(unit, course);
  const topics = useMemo(() => info?.topics ?? [], [info]);
  const hash = useSyncExternalStore(subscribeHash, readHash, noHash);
  const fromHash = topicFromAnchor(hash);
  const active = topics.find((t) => t.id === fromHash) ?? topics[0];
  const index = active ? topics.indexOf(active) : -1;

  const marks = useSyncExternalStore(
    subscribeMarks,
    () => readMarks(curriculumId),
    () => "",
  );
  const local = useMemo(() => new Set(marks.split(",").filter(Boolean)), [marks]);
  // A signed-in student's reading is their Study progress, never this browser's marks (which a
  // shared school laptop would mix between students); without Study the device's marks are used.
  const isRead = (topicId: string) =>
    topicStatus ? !!topicStatus(topicId)?.read : local.has(topicId);
  const readHere = topics.filter((t) => isRead(t.id)).length;

  const units = guideUnits(curriculumId);
  const unitAt = units.indexOf(unit);
  const prevUnit = unitAt > 0 ? units[unitAt - 1] : undefined;
  const nextUnit = unitAt >= 0 && unitAt < units.length - 1 ? units[unitAt + 1] : undefined;

  const pane = useRef<HTMLDivElement>(null);
  const [contentsOpen, setContentsOpen] = useState(false);

  const show = (topicId: string) => {
    window.history.replaceState(null, "", `#${topicAnchor(topicId)}`);
    window.dispatchEvent(new HashChangeEvent(HASH_EVENT));
    setContentsOpen(false);
  };

  // A new topic starts at its top, or at the entry the address names (a "Common mistakes" item).
  const activeId = active?.id;
  const loaded = !!guide;
  useEffect(() => {
    if (!activeId) return;
    const exact = window.location.hash.slice(1);
    const target = exact && exact !== topicAnchor(activeId) ? exact : null;
    const t = window.setTimeout(() => {
      const el = target ? document.getElementById(target) : null;
      if (el) el.scrollIntoView({ behavior: "smooth" });
      else pane.current?.scrollTo({ top: 0 });
    }, 50);
    return () => window.clearTimeout(t);
  }, [activeId, loaded]);

  // A topic counts as read after it has been open for a few seconds.
  useEffect(() => {
    if (!activeId || !loaded) return;
    const t = window.setTimeout(() => markRead(curriculumId, activeId), 4000);
    return () => window.clearTimeout(t);
  }, [activeId, loaded, curriculumId]);

  // The page hears about each topic as it opens (the student reader saves it as read).
  const opened = useEffectEvent((topicId: string) => onTopicOpen?.(topicId));
  useEffect(() => {
    if (activeId && loaded) opened(activeId);
  }, [activeId, loaded]);

  // ← and → move between topics (not while typing or dragging a Try it slider).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, select, [contenteditable='true'], [role='slider']")) return;
      // Nor inside practice, where a key press mid-problem would swap the topic and lose the run.
      if (el?.closest("[data-no-topic-keys]")) return;
      if (e.key === "ArrowRight" && index >= 0 && index < topics.length - 1)
        show(topics[index + 1].id);
      else if (e.key === "ArrowLeft" && index > 0) show(topics[index - 1].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const g = active ? topicGuide(guide, active.id) : undefined;
  const activeStatus = active ? topicStatus?.(active.id) : undefined;
  // Practice waits for the lesson, so it sits under it rather than jumping down as it loads.
  const practice =
    active && guide && renderPractice ? (
      <div key={active.id} data-no-topic-keys="">
        {renderPractice(active.id)}
      </div>
    ) : null;
  const unitCheck =
    active && guide && renderUnitCheck && index === topics.length - 1 ? (
      <div id={UNIT_CHECK_ID} className="mt-10 scroll-mt-6" data-no-topic-keys="">
        {renderUnitCheck()}
      </div>
    ) : null;

  const contents = (
    <nav aria-label="Lesson contents" className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-3 px-3 pt-4 pb-3">
        <p className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {courseName}
        </p>
        {/* The unit is a menu: pick another unit of the course from here. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-left text-sm font-semibold leading-snug transition-colors hover:bg-muted"
              aria-label={`Unit ${unit}${info ? `: ${info.title}` : ""}. Choose another unit`}
            >
              <span className="min-w-0 flex-1">
                Unit {unit}
                {info ? `: ${info.title}` : ""}
              </span>
              <ClickIcon
                icon={AnimatedChevronsUpDown}
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-[70dvh] w-72 overflow-y-auto">
            {units.map((u) => {
              const uInfo = apUnit(u, course);
              const total = uInfo?.topics.length ?? 0;
              const done = uInfo?.topics.filter((t) => isRead(t.id)).length ?? 0;
              return (
                <DropdownMenuItem key={u} asChild>
                  <Link
                    href={studentGuideHref(curriculumId, u)}
                    aria-current={u === unit ? "page" : undefined}
                    className={cn("flex items-start gap-2.5", u === unit && "bg-muted")}
                  >
                    <span className="w-5 shrink-0 tabular-nums text-muted-foreground">{u}</span>
                    <span className="min-w-0 flex-1 leading-snug">
                      {uInfo?.title ?? `Unit ${u}`}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {done === total && total > 0 ? (
                        <ClickIcon
                          icon={AnimatedCheck}
                          className="size-3.5 text-primary"
                          aria-label="All read"
                        />
                      ) : (
                        `${done}/${total}`
                      )}
                    </span>
                  </Link>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Reading progress through this unit (topics read on this device). */}
        <div className="space-y-1.5 px-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Reading progress</span>
            <span className="tabular-nums">
              {readHere} of {topics.length} read
            </span>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label="Topics read in this unit"
            aria-valuemin={0}
            aria-valuemax={topics.length}
            aria-valuenow={readHere}
          >
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${topics.length ? (readHere / topics.length) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-6">
        <ol className="space-y-0.5">
          {topics.map((t) => {
            const isActive = t.id === active?.id;
            const status = topicStatus?.(t.id);
            return (
              <li key={t.id}>
                <a
                  href={`#${topicAnchor(t.id)}`}
                  aria-current={isActive ? "page" : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    show(t.id);
                  }}
                  className={cn(
                    "flex items-start gap-2.5 rounded-lg border-l-2 px-2.5 py-2 text-sm transition-colors",
                    isActive
                      ? "border-primary bg-primary/10 font-medium text-foreground"
                      : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "mt-px shrink-0 rounded-md px-1.5 text-xs font-semibold tabular-nums",
                      isActive ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                    )}
                  >
                    {t.id}
                  </span>
                  <span className="min-w-0 flex-1 leading-snug">{t.title}</span>
                  {isRead(t.id) && !isActive && (
                    <ClickIcon
                      icon={AnimatedCheck}
                      className="mt-0.5 size-3.5 shrink-0 text-primary"
                      aria-label="Read"
                    />
                  )}
                  {status && <LevelMeter level={status.level} className="mt-0.5 shrink-0" />}
                </a>
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );

  const prev =
    index > 0
      ? {
          label: `${topics[index - 1].id} ${topics[index - 1].title}`,
          onClick: () => show(topics[index - 1].id),
        }
      : prevUnit !== undefined
        ? {
            label: `Unit ${prevUnit}: ${apUnit(prevUnit, course)?.title ?? ""}`,
            href: studentGuideHref(
              curriculumId,
              prevUnit,
              apUnit(prevUnit, course)?.topics.at(-1)?.id,
            ),
          }
        : null;
  const next =
    index >= 0 && index < topics.length - 1
      ? {
          label: `${topics[index + 1].id} ${topics[index + 1].title}`,
          onClick: () => show(topics[index + 1].id),
        }
      : nextUnit !== undefined
        ? {
            label: `Unit ${nextUnit}: ${apUnit(nextUnit, course)?.title ?? ""}`,
            href: studentGuideHref(curriculumId, nextUnit),
            unit: true,
          }
        : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5 sm:px-4">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground"
        >
          <Link href={backHref}>
            <ClickIcon icon={AnimatedArrowLeft} aria-hidden /> {backLabel}
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="md:hidden"
          onClick={() => setContentsOpen(true)}
          aria-label="Open the contents"
        >
          <ClickIcon icon={AnimatedList} aria-hidden /> Contents
        </Button>
        <p className="min-w-0 flex-1 truncate text-center text-sm text-muted-foreground">
          {courseName} · Unit {unit}
        </p>
        {index >= 0 && (
          <p className="shrink-0 px-2 text-xs tabular-nums text-muted-foreground">
            Topic {index + 1} of {topics.length} · {readHere} read
          </p>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-72 shrink-0 flex-col border-r border-border bg-muted/20 md:flex">
          {contents}
        </aside>
        <Sheet open={contentsOpen} onOpenChange={setContentsOpen}>
          <SheetContent side="left" className="w-80 gap-0 p-0">
            <SheetTitle className="sr-only">Lesson contents</SheetTitle>
            {contents}
          </SheetContent>
        </Sheet>

        <div ref={pane} className="min-w-0 flex-1 overflow-y-auto">
          <article className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-12">
            {active ? (
              <>
                <header className="mb-8 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                    Unit {unit} · Topic {active.id}
                  </p>
                  <h1 className="break-words text-3xl font-semibold tracking-tight sm:text-4xl">
                    {active.title}
                  </h1>
                  {active.summary && (
                    <p className="text-base leading-relaxed text-muted-foreground">
                      {active.summary}
                    </p>
                  )}
                  {activeStatus && <TopicStatusLine status={activeStatus} />}
                </header>
                {failed ? (
                  <p role="alert" className="text-sm text-muted-foreground">
                    This lesson could not be loaded. Reload the page to try again.
                  </p>
                ) : !guide ? (
                  <p role="status" className="text-sm text-muted-foreground">
                    Loading the lesson…
                  </p>
                ) : g ? (
                  <TopicGuide
                    key={active.id}
                    guide={g}
                    course={course}
                    practice={practiceFor?.(active.id)}
                    beforePractice={practice}
                    prerequisiteHref={prerequisiteHref}
                    headingLevel={2}
                  />
                ) : (
                  <div className="space-y-6">
                    <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                      The lesson for this topic is coming soon.
                    </p>
                    {practice}
                  </div>
                )}
                {unitCheck}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">This unit has no topics listed.</p>
            )}

            {(prev || next) && (
              <nav
                aria-label="Previous and next"
                className="mt-12 grid gap-3 border-t border-border pt-6 sm:grid-cols-2"
              >
                {prev ? <StepLink dir="prev" {...prev} /> : <span aria-hidden />}
                {next ? <StepLink dir="next" {...next} /> : null}
              </nav>
            )}
          </article>
        </div>
      </div>
    </div>
  );
}

/** "Practised · In review" under the topic's title. */
function TopicStatusLine({ status }: { status: ReaderTopicStatus }) {
  return (
    <p className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
      <span aria-hidden>
        <LevelMeter level={status.level} />
      </span>
      <span>
        {LEVEL_LABEL[status.level]}
        {status.inReview ? " · In review" : ""}
      </span>
    </p>
  );
}

function StepLink({
  dir,
  label,
  href,
  onClick,
  unit,
}: {
  dir: "prev" | "next";
  label: string;
  href?: string;
  onClick?: () => void;
  unit?: boolean;
}) {
  const className = cn(
    "group flex flex-col gap-1 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-muted/30",
    dir === "next" && "text-right sm:col-start-2",
  );
  const body = (
    <>
      <span
        className={cn(
          "inline-flex items-center gap-1 text-xs text-muted-foreground group-hover:text-primary",
          dir === "next" && "self-end",
        )}
      >
        {dir === "prev" && <ArrowLeft className="size-3.5" aria-hidden />}
        {dir === "prev" ? "Previous" : unit ? "Next unit" : "Next"}
        {dir === "next" && <ArrowRight className="size-3.5" aria-hidden />}
      </span>
      <span className="text-sm font-medium leading-snug">{label}</span>
    </>
  );
  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <button
      type="button"
      onClick={onClick}
      className={cn(className, "text-left", dir === "next" && "text-right")}
    >
      {body}
    </button>
  );
}
