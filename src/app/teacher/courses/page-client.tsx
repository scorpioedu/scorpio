"use client";

// Courses: a ready-made path through the year for one class. Everything is changed where it is shown:
// assign a unit or one set, change a due date, skip a set or reorder units right on the roadmap;
// the Schedule tab moves many dates at once and holds the class's days off.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowRight,
  CalendarDays,
  CalendarRange,
  ChevronDown,
  Columns3,
  List as ListIcon,
  ListOrdered,
  MoreHorizontal,
  Plus,
} from "lucide-react";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import {
  CURRICULA,
  curriculumUnits,
  getCurriculum,
  hasContent,
  type Curriculum,
} from "@/data/curricula";
import { defaultFirstDue, parseDateInput } from "@/lib/first-run";
import { deriveRoadmap, nextUnit, type RoadmapUnit } from "@/lib/curriculum-roadmap";
import { normalisePlan, planStartingAt, type CurriculumPlan } from "@/lib/curriculum-plan";
import { boardColumns, boardStats } from "@/lib/course-board";
import { paceCourse } from "@/lib/course-pacing";
import { classCalendar, schoolDays } from "@/lib/school-calendar";
import { apiError, undoToast } from "@/lib/undo-toast";
import { useAdminAccess } from "@/lib/use-admin-access";
import { TeacherPageHeader } from "@/components/teacher/workspace";
import { ClassPicker } from "@/components/teacher/class-picker";
import { CourseOptionList } from "@/components/teacher/course-select";
import { CourseBadge, CourseIcon, courseLook, courseSize } from "@/components/teacher/course-icon";
import { useSelectedClass } from "@/contexts/selected-class-context";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AssignDialog } from "./assign-dialog";
import { CourseBoard } from "./board/course-board";
import { BoardStats } from "./board/board-stats";
import { UnitFilter } from "./board/unit-filter";
import { CourseCalendar } from "./calendar/course-calendar";
import { PlanEditor } from "./plan-editor";
import { RoadmapTab } from "./roadmap-tab";
import { ScheduleTab } from "./schedule-tab";
import { StartPointPicker } from "./start-point";
import { SetPreviewDialog, type PreviewTarget } from "./set-preview-dialog";
import { useCourseData } from "./use-course-data";
import { useSetActions, type Assigning } from "./use-set-actions";

/**
 * List: the roadmap, unit by unit (the default). Calendar: every set on the day it is due.
 * Board: every set by where it stands.
 */
type View = "list" | "calendar" | "board";

/** Keep ?course=, ?view=, ?unit= and ?tab= in the address bar without a navigation. */
function setParam(name: string, value: string | null) {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set(name, value);
  else url.searchParams.delete(name);
  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
}

export default function CoursesClient() {
  const isAdmin = useAdminAccess() === "admin";
  const params = useSearchParams();
  // A class has one course (or none), so the page shows the chosen class's course. Only a teacher
  // with no class yet browses courses freely (?course=).
  const [browse, setBrowse] = useState<Curriculum>(
    () => getCurriculum(params?.get("course") ?? "") ?? CURRICULA[0],
  );
  const chosen = useSelectedClass();
  const classCourse = getCurriculum(
    chosen.classes?.find((c) => c.id === chosen.classId)?.curriculumId,
  );
  const curriculum = classCourse ?? browse;
  // The List is where the page opens; ?view=calendar and ?view=board open the other two.
  const [view, setViewState] = useState<View>(() => {
    const asked = params?.get("view");
    return asked === "calendar" || asked === "board" ? asked : "list";
  });
  const [unit, setUnitState] = useState<number | null>(() => Number(params?.get("unit")) || null);
  const [showDone, setShowDone] = useState(false);
  // Schedule and days off opens in a side sheet; an old ?tab=schedule link opens it straight away.
  const [scheduleOpen, setScheduleOpen] = useState(() => params?.get("tab") === "schedule");
  const data = useCourseData(curriculum.id);
  const { classes, selected, published, loadError, classAssignments, progress } = data;

  const [spacing, setSpacing] = useState("2");
  const [startInput, setStartInput] = useState("");
  const [followBusy, setFollowBusy] = useState(false);
  /** The "Change course" dialog: the course picked in it, or undefined while it is closed. */
  const [courseDraft, setCourseDraftState] = useState<string | null | undefined>(undefined);
  /** In that dialog: the set the class starts the picked course at (null = from the beginning). */
  const [startKey, setStartKey] = useState<string | null>(null);
  const setCourseDraft = (next: string | null | undefined) => {
    setCourseDraftState(next);
    // The start point belongs to the course it was picked for.
    setStartKey(null);
  };
  const [assigning, setAssigning] = useState<Assigning | null>(null);
  const [preview, setPreview] = useState<PreviewTarget | null>(null);
  const [editing, setEditing] = useState(false);

  const setCurriculum = (c: Curriculum) => {
    setBrowse(c);
    setParam("course", c.id === CURRICULA[0].id ? null : c.id);
  };
  const setView = (v: View) => {
    setViewState(v);
    setParam("view", v === "list" ? null : v);
  };
  const setUnit = (u: number | null) => {
    setUnitState(u);
    setParam("unit", u === null ? null : String(u));
  };

  // The class on screen has a course, which is the one shown.
  const follows = !!selected && !!classCourse;
  /** The class has no course yet: the page asks for one instead of showing a roadmap. */
  const needsCourse = !!selected && !classCourse;
  // Sets the class was assigned from a course it no longer follows: kept, but not on this roadmap.
  const elsewhere = follows
    ? classAssignments.filter(
        (a) =>
          !a.archived &&
          typeof a.curriculumSetKey === "string" &&
          typeof a.curriculumId === "string" &&
          a.curriculumId !== curriculum.id,
      )
    : [];
  const elsewhereCourses = [
    ...new Set(elsewhere.map((a) => getCurriculum(a.curriculumId)?.name ?? "another course")),
  ];
  // A class called "AP Physics 2 - Period 3" is most likely taking AP Physics 2 (longest name wins,
  // so "AP Physics C: Mechanics" is not mistaken for a shorter one).
  const suggested = needsCourse
    ? [...CURRICULA]
        .sort((a, b) => b.name.length - a.name.length)
        .find((c) => selected.name.toLowerCase().includes(c.name.toLowerCase()))?.id
    : undefined;
  const plan = useMemo(
    () => (follows ? normalisePlan(curriculum.id, selected?.curriculumPlan) : null),
    [follows, curriculum.id, selected?.curriculumPlan],
  );
  const calendar = useMemo(() => classCalendar(selected?.daysOff), [selected?.daysOff]);
  const isSchoolDay = useMemo(() => schoolDays(calendar), [calendar]);
  // Until the teacher picks a date, the next set is due two school days from today.
  const start = startInput || defaultFirstDue(isSchoolDay);
  const startDate = parseDateInput(start);
  const actions = useSetActions({
    data,
    curriculum,
    follows,
    plan,
    startDate,
    spacing: Number(spacing),
    isSchoolDay,
    openAssign: setAssigning,
    closeAssign: () => setAssigning(null),
  });
  const { error, setError, toAssignable, assign, rowActions } = actions;
  const busy = followBusy ? "follow" : actions.busy;

  const roadmap = useMemo(
    () => deriveRoadmap(curriculum.id, published ?? [], selected ? classAssignments : [], plan),
    [curriculum.id, published, classAssignments, selected, plan],
  );
  const next = selected ? nextUnit(roadmap) : undefined;
  const pacing = useMemo(
    () =>
      paceCourse(roadmap, {
        start: startDate ?? new Date(),
        spacing: Number(spacing),
        isSchoolDay,
      }),
    // startDate is derived from `start`
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roadmap, start, spacing, isSchoolDay],
  );

  const publishedCount = published?.length ?? 0;
  const written = hasContent(curriculum);
  // The board is a class's view of a course: without a class (or before the course is written)
  // there is only the roadmap to browse.
  const canBoard = follows && written && published !== null && !loadError;
  const onBoard = canBoard && view === "board";
  const onCalendar = canBoard && view === "calendar";
  /** The class's course is loaded, so its actions can be offered. */
  const ready = canBoard;
  // The same numbers above every view.
  const stats = useMemo(
    () => boardStats(boardColumns(roadmap, progress?.sets, progress?.students ?? 0)),
    [roadmap, progress],
  );
  const assignedDated = useMemo(
    () =>
      roadmap.flatMap((u) =>
        u.sets
          .filter((s) => s.assignmentId && s.dueDate)
          .map((s) => ({ key: s.set.key, id: s.assignmentId!, due: s.dueDate! })),
      ),
    [roadmap],
  );

  /** Give the class its course, change it, or take it away (null). Assignments are never touched. */
  async function setClassCourse(next: string | null, startKey: string | null = null) {
    if (!selected || next === selected.curriculumId) return;
    // Starting part-way through skips the earlier sets in the class's plan.
    const startPlan = next ? planStartingAt(next, startKey) : null;
    const before = selected.curriculumId;
    // The plan belongs to the old course and is dropped with it; Undo puts it back.
    const planBefore = (selected.curriculumPlan ?? null) as CurriculumPlan | null;
    const change = async (curriculumId: string | null) => {
      const res = await authenticatedFetch(`/api/courses/${selected.id}/curriculum`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ curriculumId }),
      });
      if (!res.ok) throw new Error(await apiError(res, "Could not update the class."));
      data.patchClass(selected.id, { curriculumId, curriculumPlan: null });
    };
    setFollowBusy(true);
    setError("");
    try {
      await change(next);
      if (next && startPlan && startPlan.skipped.length > 0) await actions.savePlan(startPlan);
      setEditing(false);
      // Units are numbered per course, so the filter does not carry over.
      setUnit(null);
      undoToast(
        next
          ? `${selected.name} now follows ${getCurriculum(next)?.name}${
              startPlan?.skipped.length
                ? `, starting at ${startKey} (${startPlan.skipped.length} earlier sets skipped)`
                : ""
            }.`
          : `${selected.name} follows no course now. Its assignments are unchanged.`,
        async () => {
          await change(before);
          if (before && planBefore) await actions.savePlan(planBefore);
        },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the class.");
    } finally {
      setFollowBusy(false);
    }
  }

  const openUnit = useCallback(
    (unit: RoadmapUnit) =>
      setAssigning({
        label: `Unit ${unit.unit}: ${unit.info?.title ?? ""}`,
        sets: toAssignable(unit.assignable),
        unit,
      }),
    [toAssignable],
  );

  // /teacher/courses?assign=4 (from a unit guide) opens the assign dialog for that unit once.
  const assignParam = useRef(params?.get("assign"));
  useEffect(() => {
    const want = Number(assignParam.current);
    if (!want || !selected || published === null) return;
    const unit = roadmap.find((u) => u.unit === want);
    assignParam.current = null;
    setParam("assign", null);
    if (unit && unit.assignable.length) openUnit(unit);
  }, [roadmap, selected, published, openUnit]);

  const schedule = selected && (
    <ScheduleTab
      course={curriculum.apCourse}
      classId={selected.id}
      roadmap={roadmap}
      classAssignments={classAssignments}
      pacing={pacing}
      start={start}
      spacing={spacing}
      calendar={calendar}
      customCalendar={selected.daysOff != null}
      isSchoolDay={isSchoolDay}
      onStart={setStartInput}
      onSpacing={setSpacing}
      onMoved={() => data.refreshClass()}
      onDaysOffSaved={(daysOff) => data.patchClass(selected.id, { daysOff })}
    />
  );

  return (
    <div className="space-y-6 md:pb-16">
      <TeacherPageHeader
        title="Courses"
        description={
          needsCourse ? (
            "A class follows one course: its units in order, each with short auto-graded sets."
          ) : (
            <>
              {onBoard
                ? "Every set by where it stands. Drag a card to Assigned, or press Assign."
                : onCalendar
                  ? "Every set on the day it is due. Drag an assigned set to another day, or click it."
                  : "Units in order, each with short auto-graded sets. Assign, re-date or skip right on the roadmap."}
            </>
          )
        }
      >
        <ClassPicker
          onBeforeChange={(change) =>
            editing ? toast.info("Save or discard the new order first.") : change()
          }
        />
        {/* Which course this class is on, said loudly; pressing it changes the course. */}
        {selected && follows && (
          <Button
            variant="outline"
            className="border-primary/60 bg-primary/10 font-semibold text-foreground hover:bg-primary/15"
            disabled={busy !== null || editing}
            aria-label={`Course: ${curriculum.name}. Change course`}
            title={`${selected.name} follows ${curriculum.name}. Press to change the course.`}
            onClick={() => setCourseDraft(selected.curriculumId)}
          >
            <CourseIcon curriculumId={curriculum.id} className="text-primary" /> {curriculum.name}
            <ChevronDown aria-hidden className="opacity-60" />
          </Button>
        )}
        {classes?.length === 0 && CURRICULA.length > 1 && (
          <Select
            value={curriculum.id}
            onValueChange={(id) => {
              const c = getCurriculum(id);
              if (c) setCurriculum(c);
            }}
          >
            <SelectTrigger aria-label="Course" className="w-64 max-w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRICULA.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                  <span className="text-xs text-muted-foreground">
                    {hasContent(c) ? `${c.sets.length} sets` : "Planned"}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {/* On the List each unit has its own Assign button; the other views get this one. */}
        {ready && next && !editing && (onBoard || onCalendar) && (
          <Button
            onClick={() => openUnit(next)}
            disabled={busy !== null}
            title={`Unit ${next.unit}: ${next.info?.title ?? ""}`}
          >
            <Plus aria-hidden /> Assign next {next.assignable.length}
            <span className="sr-only">
              {next.assignable.length === 1 ? " set" : " sets"}, from Unit {next.unit}
            </span>
          </Button>
        )}
        {/* Everything a teacher does now and then, behind one button. */}
        {selected && follows && ready && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="More course actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              {ready && (
                <DropdownMenuItem onSelect={() => setScheduleOpen(true)}>
                  <CalendarDays /> Schedule &amp; days off
                </DropdownMenuItem>
              )}
              {ready && follows && plan && !editing && (
                <DropdownMenuItem onSelect={() => setEditing(true)}>
                  <ListOrdered /> Reorder or skip sets
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </TeacherPageHeader>

      {/* What used to be the class card: only the lines that have something to say. */}
      {written && classes === null && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading your classes…
        </p>
      )}
      {written && classes?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          You have no classes yet.{" "}
          <Link className="underline" href="/teacher/welcome">
            Create one
          </Link>{" "}
          to assign units. You can still browse and preview every set below.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {selected && elsewhere.length > 0 && (
        <p className="rounded-2xl border border-border bg-muted/30 px-4 py-2.5 text-sm text-muted-foreground">
          {selected.name} also has {elsewhere.length} assigned set
          {elsewhere.length === 1 ? "" : "s"} from {elsewhereCourses.join(" and ")}, from before its
          course changed. Students still see {elsewhere.length === 1 ? "it" : "them"}, with their
          work, under Other assignments; you will find {elsewhere.length === 1 ? "it" : "them"} in{" "}
          <Link className="underline underline-offset-2" href="/teacher/assignments">
            My Assignments
          </Link>
          .
        </p>
      )}
      {needsCourse && selected ? (
        <section aria-labelledby="choose-course" className="space-y-6">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-primary">
              One step to set up
            </p>
            <h2 id="choose-course" className="text-2xl font-semibold tracking-tight">
              Which course is {selected.name} taking?
            </h2>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Pick one and the class gets its whole year laid out: every unit in a teaching order,
              each with short auto-graded sets you can assign in a click, a calendar, and a board of
              what is out and what needs you.
            </p>
          </div>
          <ul className="grid gap-4 lg:grid-cols-3">
            {CURRICULA.map((c) => {
              const look = courseLook(c.id);
              const units = curriculumUnits(c.id).filter((u) => u.sets.length > 0);
              const ready = hasContent(c);
              return (
                <li
                  key={c.id}
                  className="group flex flex-col gap-4 rounded-3xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-lg"
                >
                  <div className="flex items-start gap-4">
                    <CourseBadge
                      curriculumId={c.id}
                      className="size-14 rounded-2xl transition-transform group-hover:scale-105"
                      iconClassName="size-8"
                    />
                    <div className="min-w-0 space-y-1">
                      <h3 className="text-lg font-semibold leading-tight">{c.name}</h3>
                      <p className="flex flex-wrap items-center gap-1.5 text-xs">
                        {look.level && (
                          <span className={`rounded-full px-2 py-0.5 font-medium ${look.tint}`}>
                            {look.level}
                          </span>
                        )}
                        {c.id === suggested && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
                            Matches the class name
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">{look.covers}</p>
                  <ol className="flex flex-wrap gap-1.5" aria-label={`Units of ${c.name}`}>
                    {units.map((u) => (
                      <li
                        key={u.unit}
                        className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
                      >
                        <span className="tabular-nums text-foreground">{u.unit}</span>{" "}
                        {u.info?.title}
                      </li>
                    ))}
                  </ol>
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                    <span className="text-xs text-muted-foreground">{courseSize(c)}</span>
                    <Button
                      variant={c.id === suggested || !suggested ? "default" : "outline"}
                      disabled={busy !== null || !ready}
                      onClick={() => setCourseDraft(c.id)}
                    >
                      {ready ? `Start ${c.name}` : "Not ready yet"}
                      {ready && <ArrowRight aria-hidden />}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="text-sm text-muted-foreground">
            Not teaching one of these? {selected.name} can stay without a course and keep using{" "}
            <Link className="underline underline-offset-2" href="/teacher/assignments">
              My Assignments
            </Link>
            . You can change the course at any time; assignments are never removed.
          </p>
        </section>
      ) : classes === null ? null : (
        <>
          {!written ? (
            <Card className="shadow-none" role="status">
              <CardHeader>
                <CardTitle>{curriculum.name} is planned</CardTitle>
                <CardDescription>
                  The units and sets below are the outline. Their problems are not written yet, so
                  nothing can be previewed or assigned yet. Classes can follow it once its first
                  sets are published.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            published !== null &&
            !loadError &&
            publishedCount < curriculum.sets.length && (
              <Card className="shadow-none" role="status">
                <CardHeader>
                  <CardTitle>
                    {publishedCount === 0
                      ? `${curriculum.name} is not published here yet`
                      : `${curriculum.sets.length - publishedCount} sets are not published here yet`}
                  </CardTitle>
                  <CardDescription>
                    {publishedCount === 0
                      ? `All ${curriculum.sets.length} sets are written. You can browse the roadmap now; sets can be assigned once they have been reviewed and published in this workspace.`
                      : "Sets marked “Not published yet” are written and can be assigned once they have been reviewed and published in this workspace."}
                  </CardDescription>
                </CardHeader>
                {isAdmin && (
                  <CardContent className="space-y-2 text-sm">
                    <p>
                      You are an admin. To publish: import the drafts into this project, approve
                      each problem, then press <strong>Publish set</strong> on the Sets tab.
                    </p>
                    <Button variant="outline" size="sm" asChild>
                      <Link href="/admin/content?tab=sets">Open Admin · Content · Sets</Link>
                    </Button>
                  </CardContent>
                )}
              </Card>
            )
          )}

          {canBoard && !editing && (
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
              <div
                role="group"
                aria-label="View"
                className="inline-flex rounded-full border border-border bg-muted/40 p-1"
              >
                {(
                  [
                    ["list", "List", ListIcon],
                    ["calendar", "Calendar", CalendarRange],
                    ["board", "Board", Columns3],
                  ] as const
                ).map(([value, label, Icon]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={view === value}
                    onClick={() => setView(value)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring ${view === value ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    <Icon className="size-4" aria-hidden /> {label}
                  </button>
                ))}
              </div>
              {(onBoard || onCalendar) && (
                <UnitFilter
                  units={roadmap.map((u) => ({ unit: u.unit, title: u.info?.title ?? "" }))}
                  value={roadmap.some((u) => u.unit === unit) ? unit : null}
                  onChange={setUnit}
                />
              )}
            </div>
          )}

          {canBoard && !editing && (
            <BoardStats
              stats={stats}
              finish={pacing.finish}
              remaining={pacing.remaining}
              students={progress?.students ?? 0}
              loading={progress === null}
            />
          )}
          {canBoard && selected && progress?.students === 0 && (
            <p className="rounded-2xl border border-border bg-muted/30 px-4 py-2.5 text-sm text-muted-foreground">
              No students have joined {selected.name} yet. Share its join code{" "}
              <span className="font-mono font-semibold text-foreground">{selected.code}</span> with
              them, or copy an invite link from the{" "}
              <Link className="underline underline-offset-2" href="/teacher">
                Dashboard
              </Link>
              . You can assign sets now; they will be waiting.
            </p>
          )}

          {loadError ? (
            <p role="alert" className="text-sm text-destructive">
              Could not load the roadmap. Refresh to try again.
            </p>
          ) : published === null ? (
            <p role="status" className="text-sm text-muted-foreground">
              Loading roadmap…
            </p>
          ) : editing && selected && follows && plan ? (
            <PlanEditor
              key={selected.id}
              classId={selected.id}
              className={selected.name}
              curriculumId={curriculum.id}
              saved={plan}
              assigned={assignedDated}
              onSaved={(saved) => data.patchClass(selected.id, { curriculumPlan: saved })}
              onDatesMoved={() => data.refreshClass()}
              onDone={() => setEditing(false)}
            />
          ) : onBoard && selected && rowActions ? (
            <CourseBoard
              key={`${selected.id}-${curriculum.id}`}
              curriculum={curriculum}
              roadmap={roadmap}
              progress={progress}
              pacing={pacing}
              planOrder={plan?.order ?? null}
              unit={unit}
              showDone={showDone}
              onShowDone={setShowDone}
              busy={busy !== null}
              onPreview={setPreview}
              actions={{
                ...rowActions,
                onAssignNow: (s, due) => void actions.assignNow(s, due),
                onArchive: (s) => void actions.archiveCopy(s),
                onReorder: actions.reorder
                  ? (order, done) => void actions.reorder!(order, done)
                  : undefined,
              }}
            />
          ) : onCalendar && selected && rowActions ? (
            <CourseCalendar
              key={`${selected.id}-${curriculum.id}`}
              curriculum={curriculum}
              roadmap={roadmap}
              progress={progress}
              pacing={pacing}
              daysOff={calendar}
              isSchoolDay={isSchoolDay}
              unit={unit}
              busy={busy !== null}
              onPreview={setPreview}
              actions={rowActions}
            />
          ) : (
            <RoadmapTab
              curriculum={curriculum}
              roadmap={roadmap}
              className={written ? (selected?.name ?? null) : null}
              progress={progress}
              nextUnitNumber={next?.unit}
              busy={busy !== null}
              onAssign={openUnit}
              onPreview={setPreview}
              actions={rowActions}
            />
          )}
        </>
      )}

      {selected && (
        <Sheet open={scheduleOpen} onOpenChange={setScheduleOpen}>
          <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-2xl">
            <SheetHeader>
              <SheetTitle>Schedule and days off</SheetTitle>
              <SheetDescription>
                The pacing guide, moving due dates together, and the days {selected.name} does not
                meet.
              </SheetDescription>
            </SheetHeader>
            <div className="px-4 pb-6">{schedule}</div>
          </SheetContent>
        </Sheet>
      )}

      {selected && (
        <Dialog
          open={courseDraft !== undefined}
          onOpenChange={(open) => !open && setCourseDraft(undefined)}
        >
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Course for {selected.name}</DialogTitle>
              <DialogDescription>
                {selected.curriculumId
                  ? "A class follows one course, or none. Sets already assigned stay in the class with students’ work and show under Other assignments; the class’s own order and skipped sets belong to the old course and are dropped."
                  : "A class follows one course. Pick it, and where the class starts; both can be changed later."}
              </DialogDescription>
            </DialogHeader>
            <CourseOptionList
              value={courseDraft ?? null}
              current={selected.curriculumId}
              onChange={setCourseDraft}
            />
            {courseDraft && courseDraft !== selected.curriculumId && (
              <StartPointPicker
                key={courseDraft}
                curriculumId={courseDraft}
                value={startKey}
                onChange={setStartKey}
              />
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setCourseDraft(undefined)}>
                Cancel
              </Button>
              <Button
                disabled={busy !== null || (courseDraft ?? null) === selected.curriculumId}
                onClick={() => {
                  const next = courseDraft ?? null;
                  const start = startKey;
                  setCourseDraft(undefined);
                  void setClassCourse(next, start);
                }}
              >
                {!courseDraft
                  ? "Remove course"
                  : selected.curriculumId
                    ? "Change course"
                    : `Start ${getCurriculum(courseDraft)?.name ?? "course"}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {assigning && selected && (
        <AssignDialog
          unitLabel={assigning.label}
          className={selected.name}
          sets={assigning.sets}
          start={start}
          spacing={spacing}
          isSchoolDay={isSchoolDay}
          busy={busy === "assign"}
          onStart={setStartInput}
          onSpacing={setSpacing}
          onConfirm={(planned) => assign(assigning, planned)}
          onClose={() => setAssigning(null)}
        />
      )}
      <SetPreviewDialog
        target={preview}
        onClose={() => setPreview(null)}
        onAssign={
          selected && preview
            ? () => {
                const s = roadmap.flatMap((u) => u.sets).find((x) => x.set.key === preview.set.key);
                if (s && s.published && !s.assigned && !s.skipped) {
                  setPreview(null);
                  setAssigning({ label: `${s.set.key}: ${s.set.title}`, sets: toAssignable([s]) });
                }
              }
            : undefined
        }
      />
    </div>
  );
}
