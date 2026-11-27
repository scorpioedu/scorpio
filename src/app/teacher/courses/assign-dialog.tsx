"use client";

// "Assign": shows exactly which sets will be copied into the class, when each is due, and every
// problem with its answer, before anything is created. The teacher can leave problems out, take
// others from the set, or open the copy in the editor first (it stays hidden from students).
import { useMemo, useState } from "react";
import {
  cappedSets,
  planAssignments,
  restoresArchived,
  sizeChoice,
  type AssignableSet,
  type PlannedAssignment,
  type SizeChoice,
} from "@/lib/assign-sets";
import { DEFAULT_SET_SIZE, curriculumSet, getCurriculum } from "@/data/curricula";
import { apTopic as apTopicInfo } from "@/data/ap";
import { lessonTopics } from "@/lib/read-first";
import { ClickIcon } from "@/components/ui/click-icon";
import { BookOpenIcon as AnimatedBookOpen } from "@animateicons/react/lucide/book-open-icon";
import { LessonDialog, useLessons, type LessonTarget } from "@/components/guide/lesson-dialog";
import { parseDateInput } from "@/lib/first-run";
import type { SchoolDayTest } from "@/lib/school-calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SpacingSelect } from "@/components/teacher/spacing-select";
import { shortDate } from "./use-course-data";
import { AssignProblems } from "./assign-problems";

export { SpacingSelect };

/**
 * "Problems per set": how many of each set's problems the class gets (its first n). Not shown while
 * no set being assigned has more than five, so there is nothing to choose.
 */
export function ProblemsPerSetField({
  choice,
  sets,
  value,
  onChange,
  disabled,
}: {
  choice: SizeChoice;
  sets: AssignableSet[];
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  if (!choice.offered) return null;
  const capped = cappedSets(sets, value);
  const pool = capped[0]?.poolSize ?? DEFAULT_SET_SIZE;
  return (
    <div className="space-y-2">
      <Label htmlFor="assign-count">Problems per set</Label>
      <Select value={String(value)} onValueChange={(v) => onChange(Number(v))} disabled={disabled}>
        <SelectTrigger id="assign-count" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Array.from({ length: choice.max - choice.min + 1 }, (_, i) => choice.min + i).map(
            (n) => (
              <SelectItem key={n} value={String(n)}>
                {n === DEFAULT_SET_SIZE ? `${n} problems (usual)` : `${n} problems`}
              </SelectItem>
            ),
          )}
        </SelectContent>
      </Select>
      {capped.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {capped.length === 1
            ? `${capped[0].key} has ${pool} problems, so it gets all ${pool}.`
            : `${capped.map((s) => s.key).join(", ")} have fewer than ${value}, so they get all they have.`}
        </p>
      )}
    </div>
  );
}

export function AssignDialog({
  unitLabel,
  className,
  sets,
  problemsPerSet,
  lessonsCourse = null,
  start,
  spacing,
  isSchoolDay,
  busy,
  onStart,
  onSpacing,
  onConfirm,
  onEditFirst,
  onClose,
}: {
  unitLabel: string;
  className: string;
  /** Published, unassigned, not skipped; in roadmap order. */
  sets: AssignableSet[];
  /** The number of problems this class was last given per set; the control opens on it. */
  problemsPerSet?: number | null;
  /** The course, when it has lessons: offers "Read the lessons first", with a preview of each. */
  lessonsCourse?: string | null;
  start: string;
  spacing: string;
  isSchoolDay: SchoolDayTest;
  busy: boolean;
  onStart: (v: string) => void;
  onSpacing: (v: string) => void;
  onConfirm: (plan: PlannedAssignment[]) => void;
  /**
   * "Edit problems first" for a single set: make the class's copy hidden from students and open it
   * in the editor, where it is assigned when the teacher is ready.
   */
  onEditFirst?: (plan: PlannedAssignment[]) => void;
  onClose: () => void;
}) {
  const [none] = useState(() => new Set<string>());
  const choice = sizeChoice(sets, problemsPerSet);
  const [count, setCountState] = useState(choice.initial);
  /** Problems the teacher chose by hand, by set key (positions in the set). */
  const [picks, setPicks] = useState<Record<string, number[]>>({});
  const [readFirst, setReadFirst] = useState(false);
  // The lessons the sets cover, in course order: what students would read.
  const lessonList = useMemo(
    () =>
      lessonsCourse
        ? lessonTopics({
            curriculumId: lessonsCourse,
            apTopics: sets.flatMap((s) => curriculumSet(lessonsCourse, s.key)?.topics ?? []),
          })
        : [],
    [lessonsCourse, sets],
  );
  const lessons = lessonList.length > 0;
  const lessonGuides = useLessons(lessonsCourse, lessonList);
  const [previewing, setPreviewing] = useState<LessonTarget | null>(null);
  const apCourse = lessonsCourse ? getCurriculum(lessonsCourse)?.apCourse : undefined;
  // Another size is another pick: a hand-made choice does not carry over.
  const setCount = (n: number) => {
    setCountState(n);
    setPicks({});
  };
  const startDate = parseDateInput(start);
  const plan = useMemo(
    () =>
      (startDate ? planAssignments(sets, none, startDate, Number(spacing), isSchoolDay) : []).map(
        // Without the control nothing is chosen, and the copy gets the usual five.
        (p): PlannedAssignment => ({
          ...p,
          ...(choice.offered ? { count } : {}),
          ...(picks[p.key] ? { pick: picks[p.key] } : {}),
          ...(lessons && readFirst ? { readFirst: true } : {}),
        }),
      ),
    // startDate is derived from `start`
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sets, none, start, spacing, isSchoolDay, choice.offered, count, picks, lessons, readFirst],
  );

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl lg:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="break-words">Assign {unitLabel}</DialogTitle>
          <DialogDescription>
            {sets.length} set{sets.length === 1 ? "" : "s"} will be assigned to {className}. Nothing
            reaches students until you press Assign. Due dates skip weekends and the class&apos;s
            days off.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="assign-start">{sets.length > 1 ? "First due date" : "Due date"}</Label>
            <Input
              id="assign-start"
              type="date"
              value={start}
              onChange={(e) => onStart(e.target.value)}
            />
          </div>
          {sets.length > 1 && (
            <div className="space-y-2">
              <Label htmlFor="assign-spacing">Then one</Label>
              <SpacingSelect id="assign-spacing" value={spacing} onChange={onSpacing} />
            </div>
          )}
          <ProblemsPerSetField
            choice={choice}
            sets={sets}
            value={count}
            onChange={setCount}
            disabled={busy}
          />
        </div>
        {lessons && (
          <div className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/30 px-4 py-3">
            <Checkbox
              id="assign-read-first"
              checked={readFirst}
              onCheckedChange={(v) => setReadFirst(v === true)}
              disabled={busy}
              aria-describedby="assign-read-first-help"
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <Label htmlFor="assign-read-first">Read the lessons first</Label>
              <p id="assign-read-first-help" className="text-xs text-muted-foreground">
                Students read the lesson for each topic and mark it read before the problems open.
              </p>
              {apCourse && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
                  <span className="text-xs text-muted-foreground">Preview:</span>
                  {lessonList.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setPreviewing({ topic: t })}
                      disabled={!lessonGuides.guide}
                      className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-xs hover:border-primary/60 hover:text-primary disabled:opacity-60"
                    >
                      <ClickIcon icon={AnimatedBookOpen} className="size-3 shrink-0" aria-hidden />
                      <span className="font-semibold tabular-nums">{t}</span>
                      <span className="truncate">{apTopicInfo(t, apCourse)?.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        {apCourse && (
          // What students would read, as they would see it (no teacher notes).
          <LessonDialog
            course={apCourse}
            guide={lessonGuides.guide}
            topics={lessonList}
            target={previewing}
            onTarget={setPreviewing}
          />
        )}
        {startDate ? (
          <ul className="divide-y divide-border rounded-xl border border-border text-sm">
            {plan.map((p) => (
              <li key={p.key} className="space-y-1 px-4 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 break-words">
                    {p.title.split(" · ").slice(1).join(" · ") || p.title}
                  </span>
                  <span className="shrink-0 text-muted-foreground">Due {shortDate(p.due)}</span>
                </div>
                {p.archivedCount !== undefined &&
                  restoresArchived(p, { questionCount: p.archivedCount }) && (
                    <p className="text-xs text-muted-foreground">
                      Brings back the copy this class had before, with its own problems and the work
                      students handed in. Tick or untick a problem below to start a new copy
                      instead.
                    </p>
                  )}
                <AssignProblems
                  set={p}
                  count={choice.offered ? count : undefined}
                  pick={picks[p.key]}
                  onPick={(next) =>
                    setPicks((current) => {
                      const { [p.key]: _gone, ...rest } = current;
                      return next ? { ...rest, [p.key]: next } : rest;
                    })
                  }
                  defaultOpen={sets.length === 1}
                  disabled={busy}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p role="alert" className="text-sm text-destructive">
            Choose the first due date.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          {onEditFirst && plan.length === 1 && (
            <Button
              variant="outline"
              onClick={() => onEditFirst(plan)}
              disabled={busy}
              title="Opens this set in the editor. Students do not see it until you assign it there."
            >
              Edit problems first
            </Button>
          )}
          <Button onClick={() => onConfirm(plan)} disabled={busy || plan.length === 0}>
            {busy ? "Assigning…" : `Assign ${plan.length} set${plan.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
