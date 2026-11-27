"use client";

// Study: the one place to study. The topic is what a student studies: its lesson opens in the course
// reader, with the topic's practice under it, checked answer by answer, no AI. At the top, Continue
// (or where to start) and Review, which runs right here; then one course's units, in the class's
// order when the class follows that course, with what the student has read and how they are doing
// on each topic. The course is switched in the header; a student with no course yet picks one.
// Works the same with or without a class.
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";
import { ClickIcon } from "@/components/ui/click-icon";
import { ArrowRightIcon as AnimatedArrowRight } from "@animateicons/react/lucide/arrow-right-icon";
import { BookOpenIcon as AnimatedBookOpen } from "@animateicons/react/lucide/book-open-icon";
import { ChevronDownIcon as AnimatedChevronDown } from "@animateicons/react/lucide/chevron-down-icon";
import { DumbbellIcon as AnimatedDumbbell } from "@animateicons/react/lucide/dumbbell-icon";
import { RotateCcwIcon as AnimatedRotateCcw } from "@animateicons/react/lucide/rotate-ccw-icon";
import { WorkspaceHeader } from "@/components/ui/workspace";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PracticeSession } from "@/components/study/practice-session";
import {
  Eyebrow,
  InReviewMark,
  LevelMeter,
  ReviewTopicLabel,
  TopicStrip,
  plural,
  reviewDay,
  topicIndex,
  topicPracticeHref,
  topicStudyHref,
  unitPracticeHref,
  useStudyProgress,
} from "@/components/student/study-ui";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { loadProgress, loadReview, type ProgressReply, type ReviewReply } from "@/lib/study/client";
import type { StudyCourse, StudyTopic, StudyUnit } from "@/lib/study/catalog";
import type { StudentRoadmap } from "@/lib/student-roadmap";
import { useStudentRoadmap } from "@/components/student/use-student-roadmap";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";

const unitKey = (courseId: string, unit: number) => `${courseId}:${unit}`;
const readCount = (course: StudyCourse) => course.units.reduce((n, u) => n + u.read, 0);

/** The course the student has done most in (lessons read and problems answered), if any. */
function mostActiveCourse(courses: StudyCourse[]): string | null {
  const activity = (c: StudyCourse) => c.attempted + readCount(c);
  const most = [...courses].sort((a, b) => activity(b) - activity(a))[0];
  return most && activity(most) > 0 ? most.id : null;
}

/** A course's units in its class's order when the class follows it (the rest after, in course order). */
function orderedUnits(course: StudyCourse, roadmap: StudentRoadmap | null): StudyUnit[] {
  if (!roadmap || roadmap.curriculumId !== course.id) return course.units;
  const place = new Map(roadmap.units.map((u, i) => [u.unit, i]));
  const rank = (u: StudyUnit) => place.get(u.unit) ?? roadmap.units.length;
  return [...course.units].sort((a, b) => rank(a) - rank(b));
}

/** The unit the class is on in this course, if the class follows it. */
function classUnit(courseId: string, roadmap: StudentRoadmap | null): number | null {
  if (!roadmap || roadmap.curriculumId !== courseId) return null;
  return roadmap.units.find((u) => u.state === "current")?.unit ?? null;
}

/** The first topic of a course, in the order shown, that can be studied. */
function firstTopic(course: StudyCourse, roadmap: StudentRoadmap | null): StudyTopic | undefined {
  for (const unit of orderedUnits(course, roadmap))
    for (const topic of unit.topics) if (topicStudyHref(course.id, topic)) return topic;
  return undefined;
}

/**
 * The course the student said they take, remembered on this device for this account only (a
 * shared school laptop must not hand one student's course to the next).
 */
const courseKey = (uid: string) => `scorpio.study.course.${uid}`;

function storedCourse(uid: string | undefined): string | null {
  if (!uid) return null;
  try {
    return window.localStorage.getItem(courseKey(uid));
  } catch {
    return null;
  }
}

function storeCourse(uid: string | undefined, id: string) {
  if (!uid) return;
  try {
    window.localStorage.setItem(courseKey(uid), id);
  } catch {
    /* private mode or blocked storage: the choice just isn't remembered */
  }
}

export default function StudyHomePage() {
  const state = useStudyProgress();
  const roadmapState = useStudentRoadmap();
  const roadmap = roadmapState.status === "ready" ? roadmapState.roadmap : null;
  const { user } = useAuth();
  const uid = user?.uid;
  // A choice made on this page wins; otherwise what this account chose before on this device.
  const [picked, setPicked] = useState<{ uid: string | undefined; id: string } | null>(null);
  const chosen = picked && picked.uid === uid ? picked.id : storedCourse(uid);
  const progress = state.status === "ready" ? state.progress : null;
  const known = (id: string | null | undefined) =>
    id && progress?.courses.some((c) => c.id === id) ? id : null;
  // The course shown: the one the student picked, else their class's, else the one they have done
  // most in (or touched last). None of those for a new student, who is asked.
  const courseId = progress
    ? (known(chosen) ??
      known(roadmap?.curriculumId) ??
      mostActiveCourse(progress.courses) ??
      known(progress.lastTopic?.courseId))
    : null;
  const choose = (id: string) => {
    setPicked({ uid, id });
    storeCourse(uid, id);
  };

  return (
    <div className="space-y-8">
      <WorkspaceHeader
        title="Study"
        description="A short lesson for every topic, practice checked as you go, and review that brings back what you missed. Free, no AI, and every problem checked by a person."
      >
        {progress && courseId && (
          <CourseSwitcher courses={progress.courses} value={courseId} onChange={choose} />
        )}
        <Button asChild variant="outline" size="sm">
          <Link href="/student/study/progress">Your progress</Link>
        </Button>
      </WorkspaceHeader>

      {state.status === "loading" ? (
        <StudySkeleton />
      ) : state.status === "error" ? (
        <div role="alert" className="space-y-3 rounded-2xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">{state.message}</p>
          <Button variant="outline" size="sm" onClick={state.reload}>
            Try again
          </Button>
        </div>
      ) : (
        <StudyHome
          progress={state.progress}
          onProgress={state.setProgress}
          roadmap={roadmap}
          courseId={courseId}
          onChoose={choose}
        />
      )}
    </div>
  );
}

/** Placeholder shapes while progress loads, so the page does not jump when it arrives. */
function StudySkeleton() {
  return (
    <div role="status" className="space-y-8" aria-label="Loading your topics">
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <div className="h-48 animate-pulse rounded-2xl bg-muted/50" />
        <div className="h-48 animate-pulse rounded-2xl bg-muted/50" />
      </div>
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted/40" />
        ))}
      </div>
    </div>
  );
}

/** The header's course control: which course's units Study shows. */
function CourseSwitcher({
  courses,
  value,
  onChange,
}: {
  courses: StudyCourse[];
  value: string;
  onChange: (id: string) => void;
}) {
  const name = courses.find((c) => c.id === value)?.name ?? "Course";
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" aria-label="Course" className="min-w-40">
        {/* The name is given here too, so it shows before the list has ever opened. */}
        <SelectValue>{name}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {courses.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function StudyHome({
  progress,
  onProgress,
  roadmap,
  courseId,
  onChoose,
}: {
  progress: ProgressReply;
  onProgress: (p: ProgressReply) => void;
  roadmap: StudentRoadmap | null;
  courseId: string | null;
  onChoose: (id: string) => void;
}) {
  const course = progress.courses.find((c) => c.id === courseId) ?? null;
  // Which units are folded open: the defaults until the student opens or closes one themselves,
  // and the defaults again after switching course.
  const [toggled, setToggled] = useState<{ courseId: string; open: Set<string> } | null>(null);
  const openUnits =
    course && toggled?.courseId === course.id
      ? toggled.open
      : course
        ? defaultOpenUnits(progress, roadmap, course)
        : new Set<string>();
  const toggleUnit = (key: string) => {
    if (!course) return;
    const next = new Set(openUnits);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setToggled({ courseId: course.id, open: next });
  };

  if (!course) return <CourseChoiceCard courses={progress.courses} onChoose={onChoose} />;

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        {progress.lastTopic ? (
          <ContinueCard progress={progress} />
        ) : (
          <StartCard course={course} roadmap={roadmap} />
        )}
        <ReviewCard key="review" progress={progress} onProgress={onProgress} />
      </div>

      <CourseUnits
        course={course}
        roadmap={roadmap}
        openUnits={openUnits}
        onToggleUnit={toggleUnit}
      />
    </>
  );
}

/**
 * Units open by default: the one with the topic the student touched last and the one their class
 * is on, when they are in this course; else the course's first unit.
 */
function defaultOpenUnits(
  progress: ProgressReply,
  roadmap: StudentRoadmap | null,
  course: StudyCourse,
): Set<string> {
  const keys = new Set<string>();
  const last = progress.lastTopic;
  if (last?.courseId === course.id) keys.add(unitKey(course.id, last.unit));
  const onUnit = classUnit(course.id, roadmap);
  if (onUnit !== null) keys.add(unitKey(course.id, onUnit));
  const first = orderedUnits(course, roadmap)[0];
  if (keys.size === 0 && first) keys.add(unitKey(course.id, first.unit));
  return keys;
}

const panel = "rounded-2xl border border-border bg-card";

/** "2 of 6 read · 1 strong", with only the parts that apply. */
function unitCounts(unit: StudyUnit): string {
  return [
    unit.lessons > 0 && `${unit.read} of ${unit.lessons} read`,
    unit.practisable > 0 && `${unit.strong} strong`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The big card at the top: one topic, where it sits, how its unit is going, and one way in. */
function FocusCard({
  eyebrow,
  course,
  unit,
  topic,
  href,
  action,
}: {
  eyebrow: string;
  course: StudyCourse | undefined;
  unit: StudyUnit | undefined;
  topic: { id: string; title: string; level?: StudyTopic["level"]; inReview?: boolean };
  href: string;
  action: string;
}) {
  return (
    <section aria-labelledby="study-focus" className={cn(panel, "flex flex-col gap-5 p-5 sm:p-6")}>
      <div className="space-y-2">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 id="study-focus" className="text-xl font-semibold tracking-tight sm:text-2xl">
          <span className="mr-2 tabular-nums text-muted-foreground">{topic.id}</span>
          {topic.title}
        </h2>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {[course?.name, unit && `Unit ${unit.unit} · ${unit.title}`].filter(Boolean).join(" · ")}
          {topic.level && topic.level !== "new" && <LevelMeter level={topic.level} showLabel />}
          {topic.inReview && <InReviewMark />}
        </p>
      </div>
      {unit && (
        <div className="space-y-2 rounded-xl bg-muted/30 px-4 py-3">
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="font-medium">Unit {unit.unit}</span>
            <span className="tabular-nums text-muted-foreground">{unitCounts(unit)}</span>
          </div>
          <TopicStrip topics={unit.topics} />
        </div>
      )}
      <Button asChild className="mt-auto w-fit">
        <Link href={href}>
          {action}
          <ClickIcon icon={AnimatedArrowRight} aria-hidden />
        </Link>
      </Button>
    </section>
  );
}

function ContinueCard({ progress }: { progress: ProgressReply }) {
  const last = progress.lastTopic;
  if (!last) return null;
  const course = progress.courses.find((c) => c.id === last.courseId);
  const unit = course?.units.find((u) => u.unit === last.unit);
  const topic = unit?.topics.find((t) => t.id === last.topicId);
  return (
    <FocusCard
      eyebrow={last.kind === "read" ? "Continue reading" : "Keep practising"}
      course={course}
      unit={unit}
      topic={{
        id: last.topicId,
        title: last.title,
        level: topic?.level,
        inReview: topic?.inReview,
      }}
      href={last.lessonHref ?? topicPracticeHref(last.courseId, last.topicId)}
      action={last.lessonHref ? "Open topic" : "Practise this topic"}
    />
  );
}

/** For a student with a course who has not started yet: its first topic. */
function StartCard({ course, roadmap }: { course: StudyCourse; roadmap: StudentRoadmap | null }) {
  const first = firstTopic(course, roadmap);
  const href = first ? topicStudyHref(course.id, first) : null;
  if (!first || !href) return null;
  const unit = course.units.find((u) => u.topics.some((t) => t.id === first.id));
  return (
    <FocusCard
      eyebrow="Start here"
      course={course}
      unit={unit}
      topic={first}
      href={href}
      action="Start this topic"
    />
  );
}

/** For a student with no course yet (no class course, no choice, nothing done): which course. */
function CourseChoiceCard({
  courses,
  onChoose,
}: {
  courses: StudyCourse[];
  onChoose: (id: string) => void;
}) {
  const topicCount = (c: StudyCourse) => c.units.reduce((n, u) => n + u.topics.length, 0);
  return (
    <section aria-labelledby="study-course-choice" className={cn(panel, "space-y-5 p-5 sm:p-6")}>
      <div className="space-y-2">
        <Eyebrow>Get started</Eyebrow>
        <h2 id="study-course-choice" className="text-xl font-semibold tracking-tight">
          Which course are you taking?
        </h2>
        <p className="text-sm text-muted-foreground">
          Each topic has a short lesson and practice problems checked as you go. You can switch
          course any time.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {courses.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onChoose(c.id)}
            className="group flex flex-col items-start gap-1 rounded-xl border border-border bg-background px-4 py-3 text-left transition-colors hover:border-primary/50 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex w-full items-center justify-between gap-2 text-sm font-medium">
              {c.name}
              <ClickIcon
                icon={AnimatedArrowRight}
                aria-hidden
                className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5"
              />
            </span>
            <span className="text-xs text-muted-foreground">
              {plural(c.units.length, "unit")} · {plural(topicCount(c), "topic")}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

type ReviewRun =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "running"; review: ReviewReply; round: number; refreshed: boolean };

/**
 * Review, run right here: "Start review" loads a couple of fresh problems from each topic that is
 * due and plays them in place, each labelled with its topic and a way back to its lesson. At the
 * end the progress is reloaded and the card says what comes next. The student's practice totals
 * sit at the foot of the card.
 */
function ReviewCard({
  progress,
  onProgress,
}: {
  progress: ProgressReply;
  onProgress: (p: ProgressReply) => void;
}) {
  const [run, setRun] = useState<ReviewRun>({ phase: "idle" });
  const rounds = useRef(0);
  const answered = useRef(0);
  const index = useMemo(() => topicIndex(progress.courses), [progress.courses]);
  const due = progress.dueCount;

  const start = async () => {
    setRun({ phase: "loading" });
    try {
      const review = await loadReview(authenticatedFetch);
      answered.current = 0;
      rounds.current += 1;
      setRun({ phase: "running", review, round: rounds.current, refreshed: false });
    } catch (e) {
      setRun({
        phase: "error",
        message: e instanceof Error ? e.message : "Could not load your review.",
      });
    }
  };

  // After the last answer: reload the progress so the card (and the topics below) show the new
  // review dates. Best effort: without it the counts just stay as they were.
  const onAnswered = (total: number, round: number) => {
    answered.current += 1;
    if (answered.current < total) return;
    loadProgress(authenticatedFetch)
      .then(onProgress)
      .catch(() => undefined)
      .finally(() =>
        setRun((r) => (r.phase === "running" && r.round === round ? { ...r, refreshed: true } : r)),
      );
  };

  if (run.phase === "running") {
    const { review, round, refreshed } = run;
    const next =
      progress.dueCount > 0
        ? `${plural(progress.dueCount, "topic")} still to review.`
        : progress.nextReviewAt
          ? `Nothing else to review. Next review ${reviewDay(progress.nextReviewAt)}.`
          : "Nothing left in review.";
    return (
      <section
        aria-labelledby="study-review"
        className={cn(panel, "space-y-4 p-5 sm:p-6 lg:col-span-2")}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-1">
            <Eyebrow>Review</Eyebrow>
            <h2 id="study-review" className="text-base font-semibold tracking-tight">
              {review.dueTopics.length > 0
                ? `${plural(review.dueTopics.length, "topic")} due`
                : "Review"}
            </h2>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setRun({ phase: "idle" })}>
            {review.problems.length === 0 ? "Close" : "Stop review"}
          </Button>
        </div>
        {review.problems.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {review.dueTopics.length > 0
              ? "Your topics are due, but they have no problems to practise right now. Sets that are open as homework in a class are held back until they are due."
              : "Nothing to review right now."}
          </p>
        ) : (
          <PracticeSession
            key={round}
            problems={review.problems}
            fetcher={authenticatedFetch}
            className="bg-background"
            label={(p) => (
              <ReviewTopicLabel
                topicId={p.topicId}
                topic={index.get(`${p.courseId}:${p.topicId}`)?.topic}
              />
            )}
            onAnswered={() => onAnswered(review.problems.length, round)}
            renderEnd={(results) => (
              <div className="space-y-3 border-t border-border pt-4">
                <p aria-live="polite" className="text-sm text-muted-foreground">
                  {results.some((r) => !r.reply.correct) &&
                    "Topics you missed come back tomorrow. "}
                  {refreshed ? next : "Saving…"}
                </p>
                <Button size="sm" onClick={() => setRun({ phase: "idle" })}>
                  Done
                </Button>
              </div>
            )}
          />
        )}
      </section>
    );
  }

  return (
    <section aria-labelledby="study-review" className={cn(panel, "flex flex-col gap-5 p-5 sm:p-6")}>
      <div className="space-y-2">
        <Eyebrow>Review</Eyebrow>
        {due > 0 ? (
          <h2 id="study-review" className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold tabular-nums tracking-tight">{due}</span>
            <span className="text-sm text-muted-foreground">
              {due === 1 ? "topic" : "topics"} to review
            </span>
          </h2>
        ) : (
          <>
            <h2 id="study-review" className="text-base font-semibold tracking-tight">
              {progress.nextReviewAt ? "All caught up" : "Nothing to review yet"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {progress.nextReviewAt
                ? `Next review ${reviewDay(progress.nextReviewAt)}.`
                : "Miss a problem and its topic comes back here the next day. Each time you get it right, it comes back later, until it drops off."}
            </p>
          </>
        )}
        {run.phase === "error" && (
          <p role="alert" className="text-sm text-destructive">
            {run.message}
          </p>
        )}
      </div>
      {due > 0 && (
        <Button className="w-fit" disabled={run.phase === "loading"} onClick={() => void start()}>
          <ClickIcon icon={AnimatedRotateCcw} aria-hidden />
          {run.phase === "loading"
            ? "Loading review…"
            : run.phase === "error"
              ? "Try again"
              : `Start review (${plural(due, "topic")})`}
        </Button>
      )}
      {progress.answered > 0 && (
        <dl className="mt-auto grid grid-cols-3 gap-3 border-t border-border pt-4">
          {[
            ["Streak", plural(progress.streak, "day")],
            ["Answered", progress.answered],
            ["Right", progress.correct],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0 space-y-0.5">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-sm font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

function LevelKey() {
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span className="sr-only">Levels:</span>
      <LevelMeter level="learning" showLabel />
      <LevelMeter level="practised" showLabel />
      <LevelMeter level="strong" showLabel />
    </p>
  );
}

/** The selected course's units. */
function CourseUnits({
  course,
  roadmap,
  openUnits,
  onToggleUnit,
}: {
  course: StudyCourse;
  roadmap: StudentRoadmap | null;
  openUnits: Set<string>;
  onToggleUnit: (key: string) => void;
}) {
  const sum = (pick: (u: StudyUnit) => number) => course.units.reduce((n, u) => n + pick(u), 0);
  const lessons = sum((u) => u.lessons);
  const read = sum((u) => u.read);
  const practisable = sum((u) => u.practisable);
  const strong = sum((u) => u.strong);
  const started = read > 0 || course.attempted > 0;
  const counts = started
    ? [
        lessons > 0 && `${read} of ${lessons} read`,
        practisable > 0 && `${strong} of ${practisable} strong`,
      ]
    : [lessons > 0 && plural(lessons, "lesson"), practisable > 0 && `${practisable} to practise`];
  const inClassOrder = roadmap?.curriculumId === course.id;
  const onUnit = classUnit(course.id, roadmap);
  return (
    <section aria-labelledby="study-course" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="space-y-1">
          <Eyebrow>{inClassOrder ? "In your class's order" : "Units"}</Eyebrow>
          <h2 id="study-course" className="text-lg font-semibold tracking-tight">
            {course.name}
          </h2>
          <p className="text-xs tabular-nums text-muted-foreground">
            {counts.filter(Boolean).join(" · ")}
          </p>
        </div>
        <LevelKey />
      </div>
      <div className="space-y-2.5">
        {orderedUnits(course, roadmap).map((unit) => {
          const key = unitKey(course.id, unit.unit);
          return (
            <UnitCard
              key={key}
              courseId={course.id}
              unit={unit}
              current={unit.unit === onUnit}
              open={openUnits.has(key)}
              onToggle={() => onToggleUnit(key)}
            />
          );
        })}
      </div>
    </section>
  );
}

function UnitCard({
  courseId,
  unit,
  current,
  open,
  onToggle,
}: {
  courseId: string;
  unit: StudyUnit;
  current: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const panelId = `study-unit-${courseId}-${unit.unit}`;
  const counts = unitCounts(unit);
  const firstLesson = unit.topics.find((t) => t.lessonHref)?.lessonHref;
  return (
    <section
      aria-labelledby={`${panelId}-title`}
      className={cn(panel, "overflow-hidden transition-colors", open && "border-border")}
    >
      <h3>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full items-center gap-4 px-4 py-3.5 text-left outline-none transition-colors hover:bg-muted/30 focus-visible:bg-muted/30 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5"
        >
          <span
            aria-hidden
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-lg text-sm font-semibold tabular-nums",
              current ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
            )}
          >
            {unit.unit}
          </span>
          <span className="min-w-0 flex-1 space-y-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span id={`${panelId}-title`} className="text-sm font-semibold tracking-tight">
                <span className="sr-only">Unit {unit.unit}: </span>
                {unit.title}
              </span>
              {current && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                  Your class is here
                </span>
              )}
            </span>
            {counts && (
              <span className="block text-xs tabular-nums text-muted-foreground">{counts}</span>
            )}
          </span>
          <TopicStrip topics={unit.topics} className="hidden w-28 shrink-0 sm:flex lg:w-40" />
          <ClickIcon
            icon={AnimatedChevronDown}
            aria-hidden
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
      </h3>
      {open && (
        <div id={panelId} className="border-t border-border">
          <ul className="divide-y divide-border/70">
            {unit.topics.map((topic) => (
              <TopicRow key={topic.id} courseId={courseId} topic={topic} />
            ))}
          </ul>
          {(firstLesson || unit.practisable > 0) && (
            <div className="flex flex-wrap items-center gap-2 border-t border-border bg-muted/20 px-4 py-2.5 sm:px-5">
              {firstLesson && (
                <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
                  <Link href={firstLesson}>
                    <ClickIcon icon={AnimatedBookOpen} aria-hidden />
                    Open unit lessons<span className="sr-only">, unit {unit.unit}</span>
                  </Link>
                </Button>
              )}
              {unit.practisable > 0 && (
                <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
                  <Link href={unitPracticeHref(courseId, unit.unit)}>
                    <ClickIcon icon={AnimatedDumbbell} aria-hidden />
                    Practice whole unit<span className="sr-only">, unit {unit.unit}</span>
                  </Link>
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** A circle that fills with a tick once the topic's lesson has been opened. */
function ReadDot({ read }: { read: boolean }) {
  return read ? (
    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-emerald-600/15 text-emerald-600 dark:text-emerald-400">
      <Check aria-hidden className="size-3" strokeWidth={3} />
      <span className="sr-only">Read</span>
    </span>
  ) : (
    <span aria-hidden className="size-5 shrink-0 rounded-full border border-border" />
  );
}

/** One topic: read, title, how it is going, and the whole row opens where the topic is studied. */
function TopicRow({ courseId, topic }: { courseId: string; topic: StudyTopic }) {
  const href = topicStudyHref(courseId, topic);
  const practisable = topic.problems > 0;
  const note =
    topic.attempted > 0
      ? `${topic.correct}/${topic.attempted} right`
      : !href
        ? "Coming soon"
        : !topic.lessonHref
          ? "Practice only"
          : null;
  const row = "group flex items-center gap-3 px-4 py-3 text-sm sm:px-5";
  const body = (
    <>
      <ReadDot read={topic.read} />
      <span className="min-w-0 flex-1">
        <span className="mr-2 inline-block w-8 tabular-nums text-muted-foreground">{topic.id}</span>
        {topic.title}
      </span>
      <span className="flex shrink-0 items-center gap-3">
        {topic.inReview && <InReviewMark />}
        {note && (
          <span className="hidden text-xs tabular-nums text-muted-foreground sm:inline">
            {note}
          </span>
        )}
        <LevelMeter level={topic.level} className={cn(!practisable && "opacity-40")} />
        {href ? (
          <ChevronRight
            aria-hidden
            className="size-4 text-muted-foreground/40 transition-colors group-hover:text-foreground"
          />
        ) : (
          <span aria-hidden className="size-4" />
        )}
      </span>
    </>
  );
  return (
    <li>
      {href ? (
        <Link
          href={href}
          className={cn(
            row,
            "outline-none transition-colors hover:bg-muted/30 focus-visible:bg-muted/30 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          )}
        >
          {body}
        </Link>
      ) : (
        <div className={cn(row, "text-muted-foreground")}>{body}</div>
      )}
    </li>
  );
}
