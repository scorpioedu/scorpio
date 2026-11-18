"use client";

// Schedule: the pacing guide, moving due dates in bulk, and the class's days off.
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { apUnitLabel, type ApCourseId } from "@/data/ap";
import { parseDateInput } from "@/lib/first-run";
import type { ClassAssignment, RoadmapUnit } from "@/lib/curriculum-roadmap";
import { apiError, undoToast } from "@/lib/undo-toast";
import { sameDay } from "@/lib/teacher-edit";
import { respaceDueDates, shiftDueDates, type DatedItem, type Pacing } from "@/lib/course-pacing";
import {
  classCalendar,
  schoolDays,
  defaultCalendar,
  formatDayOff,
  parseDaysOff,
  type DayOff,
  type SchoolDayTest,
} from "@/lib/school-calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SpacingSelect } from "./assign-dialog";
import { shortDate } from "./use-course-data";

/** POST /api/courses/{id}/due-dates for the given changes. */
async function postDueDates(classId: string, changes: DatedItem[]) {
  const res = await authenticatedFetch(`/api/courses/${encodeURIComponent(classId)}/due-dates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      updates: changes.map((c) => ({ assignmentId: c.id, dueDate: c.due.toISOString() })),
    }),
  });
  if (!res.ok) throw new Error(await apiError(res, "Could not move the due dates."));
}

const range = (a: Date, b: Date) =>
  a.toDateString() === b.toDateString() ? shortDate(a) : `${shortDate(a)} – ${shortDate(b)}`;

function PacingCard({
  course,
  pacing,
  start,
  spacing,
  onStart,
  onSpacing,
}: {
  course: ApCourseId;
  pacing: Pacing;
  start: string;
  spacing: string;
  onStart: (v: string) => void;
  onSpacing: (v: string) => void;
}) {
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle>Pacing guide</CardTitle>
        <CardDescription>
          Where each unit lands at this pace. Sets already assigned keep their real due dates; the
          rest are projected, skipping weekends and days off.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:max-w-md sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="pace-start">Next set due</Label>
            <Input
              id="pace-start"
              type="date"
              value={start}
              onChange={(e) => onStart(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pace-spacing">Then one</Label>
            <SpacingSelect id="pace-spacing" value={spacing} onChange={onSpacing} />
          </div>
        </div>
        <ul className="divide-y divide-border rounded-xl border border-border text-sm">
          {pacing.units.map((u) => (
            <li
              key={u.unit}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
            >
              <span className="min-w-0 break-words font-medium">{apUnitLabel(u.unit, course)}</span>
              <span className="text-muted-foreground">
                {u.sets.length === 0
                  ? "Skipped"
                  : `${range(u.sets[0].due, u.finish!)} · ${u.allAssigned ? "assigned" : "projected"}`}
              </span>
            </li>
          ))}
        </ul>
        {pacing.finish && (
          <p className="text-sm">
            {pacing.remaining === 0
              ? "Every set is assigned. The last one is due "
              : "At this pace the course finishes "}
            <strong>
              {pacing.finish.toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </strong>
            .
          </p>
        )}
        {pacing.afterExams && (
          <p role="status" className="text-sm text-amber-700 dark:text-amber-400">
            That is after AP exams begin in early May. Tighten the spacing, start sooner, or skip
            sets with “Reorder or skip” on the roadmap.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function MoveDatesCard({
  course,
  classId,
  roadmap,
  classAssignments,
  start,
  spacing,
  isSchoolDay,
  onDone,
}: {
  course: ApCourseId;
  classId: string;
  roadmap: RoadmapUnit[];
  classAssignments: ClassAssignment[];
  start: string;
  spacing: string;
  isSchoolDay: SchoolDayTest;
  onDone: () => Promise<void>;
}) {
  const [scope, setScope] = useState("upcoming");
  const [action, setAction] = useState("later");
  const [days, setDays] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now] = useState(() => new Date());

  // Every assignment in the class with a due date: course sets by unit, anything else as "other".
  const dated = useMemo(() => {
    const unitOf = new Map(
      roadmap.flatMap((u) =>
        u.sets.filter((x) => x.assignmentId).map((x) => [x.assignmentId!, u.unit] as const),
      ),
    );
    return classAssignments
      .filter((a) => a.id && a.dueDate && !a.archived)
      .map((a) => ({
        unit: unitOf.get(a.id!) ?? null,
        key: typeof a.curriculumSetKey === "string" && unitOf.has(a.id!) ? a.curriculumSetKey : "",
        title: a.title ?? "Untitled",
        id: a.id!,
        due: a.dueDate!,
      }))
      .sort((a, b) => a.due.getTime() - b.due.getTime());
  }, [roadmap, classAssignments]);
  const inScope = dated.filter((d) =>
    scope === "upcoming"
      ? d.due >= now
      : scope === "other"
        ? d.unit === null
        : String(d.unit) === scope,
  );
  const items: DatedItem[] = inScope.map(({ id, due }) => ({ id, due }));
  const startDate = parseDateInput(start);
  const changes =
    action === "respace"
      ? startDate
        ? respaceDueDates(items, startDate, Number(spacing), isSchoolDay)
        : []
      : shiftDueDates(
          items,
          action === "tidy" ? 0 : (action === "earlier" ? -1 : 1) * Number(days),
          isSchoolDay,
        );
  const labelOf = new Map(
    inScope.map((d) => [d.id, d.key ? `${d.key} · ${d.title.split(" · ").at(-1)}` : d.title]),
  );
  const units = [...new Set(dated.map((d) => d.unit))].filter((u): u is number => u !== null);
  const hasOther = dated.some((d) => d.unit === null);

  async function apply() {
    setBusy(true);
    setError("");
    try {
      await postDueDates(classId, changes);
      const before = changes.map((c) => ({ id: c.id, due: items.find((i) => i.id === c.id)!.due }));
      await onDone();
      undoToast(`${changes.length} due date${changes.length === 1 ? "" : "s"} moved`, async () => {
        await postDueDates(classId, before);
        await onDone();
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not move the due dates.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle>Move due dates</CardTitle>
        <CardDescription>
          Change several due dates at once, for example after a snow day. Every assignment in this
          class with a due date can be moved; you see every change before it is saved.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {dated.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No assignments with due dates in this class yet.
          </p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="move-scope">Which assignments</Label>
                <Select value={scope} onValueChange={setScope}>
                  <SelectTrigger id="move-scope" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="upcoming">Everything not yet due</SelectItem>
                    {units.map((u) => (
                      <SelectItem key={u} value={String(u)}>
                        {apUnitLabel(u, course)}
                      </SelectItem>
                    ))}
                    {hasOther && (
                      <SelectItem value="other">Assignments outside the course</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="move-action">What to do</Label>
                <Select value={action} onValueChange={setAction}>
                  <SelectTrigger id="move-action" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="later">Move later</SelectItem>
                    <SelectItem value="earlier">Move earlier</SelectItem>
                    <SelectItem value="respace">Re-space from the pacing guide</SelectItem>
                    <SelectItem value="tidy">Only move dates off days off</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(action === "later" || action === "earlier") && (
                <div className="space-y-2">
                  <Label htmlFor="move-days">By</Label>
                  <Select value={days} onValueChange={setDays}>
                    <SelectTrigger id="move-days" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5, 10].map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n} school day{n === 1 ? "" : "s"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            {action === "respace" && (
              <p className="text-xs text-muted-foreground">
                Uses “Next set due” and the spacing from the pacing guide above.
              </p>
            )}
            {changes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing would change.</p>
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border text-sm">
                {changes.map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-2"
                  >
                    <span className="min-w-0 break-words font-medium">{labelOf.get(c.id)}</span>
                    <span className="text-muted-foreground">
                      {shortDate(items.find((i) => i.id === c.id)!.due)} → {shortDate(c.due)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button onClick={apply} disabled={busy || changes.length === 0}>
              {busy
                ? "Saving…"
                : `Move ${changes.length} due date${changes.length === 1 ? "" : "s"}`}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function DaysOffCard({
  classId,
  calendar,
  custom,
  classAssignments,
  onSaved,
  onMoved,
}: {
  classId: string;
  calendar: DayOff[];
  /** True when the class has its own list (otherwise these are the defaults). */
  custom: boolean;
  classAssignments: ClassAssignment[];
  onSaved: (daysOff: DayOff[] | null) => void;
  onMoved: () => Promise<void>;
}) {
  const [list, setList] = useState<DayOff[]>(calendar);
  const [dirty, setDirty] = useState(false);
  const [label, setLabel] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function change(next: DayOff[]) {
    setList(next);
    setDirty(true);
    setError("");
  }

  function add() {
    const checked = parseDaysOff([...list, { start: from, end: to || from, label }]);
    if (!checked.ok) return setError(checked.error);
    change(checked.daysOff);
    setLabel("");
    setFrom("");
    setTo("");
  }

  async function save(daysOff: DayOff[] | null) {
    setBusy(true);
    setError("");
    try {
      const res = await authenticatedFetch(`/api/courses/${encodeURIComponent(classId)}/plan`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ daysOff }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not save the days off.");
      onSaved(body.daysOff ?? null);
      setList(body.daysOff ?? defaultCalendar());
      setDirty(false);
      toast.success(daysOff === null ? "Back to the default calendar." : "Days off saved.");
      // Due dates that now fall on a day off: offer to move each to the next school day.
      const now = new Date();
      const items: DatedItem[] = classAssignments
        .filter((a) => a.id && a.dueDate && !a.archived && a.dueDate >= now)
        .map((a) => ({ id: a.id!, due: a.dueDate! }));
      const fixes = shiftDueDates(items, 0, schoolDays(classCalendar(body.daysOff ?? null))).filter(
        (f) => !sameDay(f.due, items.find((i) => i.id === f.id)!.due),
      );
      if (fixes.length) {
        toast(`${fixes.length} due date${fixes.length === 1 ? " falls" : "s fall"} on a day off`, {
          description: "Move each to the next school day?",
          duration: 15000,
          action: {
            label: "Move them",
            onClick: async () => {
              try {
                await postDueDates(classId, fixes);
                await onMoved();
                toast.success(`${fixes.length} due date${fixes.length === 1 ? "" : "s"} moved`);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Could not move the due dates.");
              }
            },
          },
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the days off.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle>Days off</CardTitle>
        <CardDescription>
          Due dates never land on weekends or these days.{" "}
          {custom
            ? "This class uses its own list."
            : "This is the default US school calendar; remove what your school works through and add your own breaks (spring break is not included)."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">No days off: only weekends are skipped.</p>
        ) : (
          <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-xl border border-border text-sm">
            {list.map((d, i) => (
              <li
                key={`${d.start}-${d.end}-${i}`}
                className="flex items-center justify-between gap-3 px-4 py-2"
              >
                <span className="min-w-0">
                  <span className="block break-words font-medium">{d.label}</span>
                  <span className="block text-xs text-muted-foreground">{formatDayOff(d)}</span>
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${d.label}`}
                  onClick={() => change(list.filter((_, j) => j !== i))}
                >
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="grid items-end gap-3 sm:grid-cols-[1fr_auto_auto_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="off-label">Add a day off or break</Label>
            <Input
              id="off-label"
              placeholder="Spring break"
              value={label}
              maxLength={60}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="off-from">From</Label>
            <Input
              id="off-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="off-to">To (optional)</Label>
            <Input
              id="off-to"
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <Button type="submit" variant="outline" disabled={!from}>
            Add
          </Button>
        </form>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => save(list)} disabled={busy || !dirty}>
            {busy ? "Saving…" : "Save days off"}
          </Button>
          {(custom || dirty) && (
            <Button variant="ghost" onClick={() => save(null)} disabled={busy}>
              Reset to the default calendar
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          After saving you are offered to move any due date that now lands on a day off.
        </p>
      </CardContent>
    </Card>
  );
}

export function ScheduleTab(props: {
  course: ApCourseId;
  classId: string;
  roadmap: RoadmapUnit[];
  classAssignments: ClassAssignment[];
  pacing: Pacing;
  start: string;
  spacing: string;
  calendar: DayOff[];
  customCalendar: boolean;
  isSchoolDay: SchoolDayTest;
  onStart: (v: string) => void;
  onSpacing: (v: string) => void;
  onMoved: () => Promise<void>;
  onDaysOffSaved: (daysOff: DayOff[] | null) => void;
}) {
  return (
    <div className="space-y-4">
      <PacingCard
        course={props.course}
        pacing={props.pacing}
        start={props.start}
        spacing={props.spacing}
        onStart={props.onStart}
        onSpacing={props.onSpacing}
      />
      <MoveDatesCard
        course={props.course}
        classId={props.classId}
        roadmap={props.roadmap}
        classAssignments={props.classAssignments}
        start={props.start}
        spacing={props.spacing}
        isSchoolDay={props.isSchoolDay}
        onDone={props.onMoved}
      />
      <DaysOffCard
        key={props.classId}
        classId={props.classId}
        calendar={props.calendar}
        custom={props.customCalendar}
        classAssignments={props.classAssignments}
        onSaved={props.onDaysOffSaved}
        onMoved={props.onMoved}
      />
    </div>
  );
}
