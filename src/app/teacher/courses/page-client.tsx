"use client";

// Courses: a ready-made path through the year for one class. Everything is changed where it is shown:
// assign a unit or one set, change a due date, skip a set or reorder units right on the roadmap;
// the Schedule tab moves many dates at once and holds the class's days off.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  CalendarDays,
  CalendarRange,
  Columns3,
  List as ListIcon,
  ListOrdered,
  Plus,
} from "lucide-react";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { CURRICULA, getCurriculum, hasContent, type Curriculum } from "@/data/curricula";
import { defaultFirstDue, parseDateInput } from "@/lib/first-run";
import { deriveRoadmap, nextUnit, type RoadmapUnit } from "@/lib/curriculum-roadmap";
import { normalisePlan } from "@/lib/curriculum-plan";
import { paceCourse } from "@/lib/course-pacing";
import { classCalendar, schoolDays } from "@/lib/school-calendar";
import { apiError, undoToast } from "@/lib/undo-toast";
import { useAdminAccess } from "@/lib/use-admin-access";
import { TeacherPageHeader, TeacherSummary } from "@/components/teacher/workspace";
import { ClassPicker } from "@/components/teacher/class-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AssignDialog } from "./assign-dialog";
import { CourseBoard } from "./board/course-board";
import { CourseCalendar } from "./calendar/course-calendar";
import { PlanEditor } from "./plan-editor";
import { RoadmapTab } from "./roadmap-tab";
import { ScheduleTab } from "./schedule-tab";
import { SetPreviewDialog, type PreviewTarget } from "./set-preview-dialog";
import { shortDate, useCourseData } from "./use-course-data";
import { useSetActions, type Assigning } from "./use-set-actions";

type Tab = "roadmap" | "schedule";
/**
 * Board: every set by where it stands (the default). Calendar: every set on the day it is due.
 * List: the roadmap, unit by unit.
 */
type View = "board" | "calendar" | "list";

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
  const [curriculum, setCurriculumState] = useState<Curriculum>(
    () => getCurriculum(params?.get("course") ?? "") ?? CURRICULA[0],
  );
  const [tab, setTabState] = useState<Tab>(
    params?.get("tab") === "schedule" ? "schedule" : "roadmap",
  );
  // An old link to the Schedule tab (?tab=schedule) still opens it, on the List.
  const [view, setViewState] = useState<View>(
    params?.get("view") === "list" || params?.get("tab") === "schedule"
      ? "list"
      : params?.get("view") === "calendar"
        ? "calendar"
        : "board",
  );
  const [unit, setUnitState] = useState<number | null>(() => Number(params?.get("unit")) || null);
  const [showDone, setShowDone] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const data = useCourseData(curriculum.id);
  const { classes, selected, published, loadError, classAssignments, progress } = data;

  const [spacing, setSpacing] = useState("2");
  const [startInput, setStartInput] = useState("");
  const [followBusy, setFollowBusy] = useState(false);
  const [assigning, setAssigning] = useState<Assigning | null>(null);
  const [preview, setPreview] = useState<PreviewTarget | null>(null);
  const [editing, setEditing] = useState(false);

  const setCurriculum = (c: Curriculum) => {
    setCurriculumState(c);
    setEditing(false);
    setParam("course", c.id === CURRICULA[0].id ? null : c.id);
    // Units are numbered per course, so the filter does not carry over.
    setUnit(null);
  };
  const setView = (v: View) => {
    setViewState(v);
    setParam("view", v === "board" ? null : v);
    if (v !== "list") setTab("roadmap");
  };
  const setUnit = (u: number | null) => {
    setUnitState(u);
    setParam("unit", u === null ? null : String(u));
  };
  const setTab = (t: Tab) => {
    setTabState(t);
    setParam("tab", t === "roadmap" ? null : t);
  };

  const follows = selected?.curriculumId === curriculum.id;
  // The class follows a different course than the one being viewed.
  const followsOther = follows ? undefined : getCurriculum(selected?.curriculumId);
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
  const canBoard = !!selected && written && published !== null && !loadError;
  const onBoard = canBoard && view === "board";
  const onCalendar = canBoard && view === "calendar";
  const wanted = roadmap.flatMap((u) => u.sets.filter((s) => !s.skipped));
  const assignedCount = wanted.filter((s) => s.assigned).length;
  const averages = Object.values(progress?.sets ?? {})
    .map((s) => s.averageScore)
    .filter((n): n is number => n !== null);
  const classAverage = averages.length
    ? Math.round(averages.reduce((a, b) => a + b, 0) / averages.length)
    : null;
  const assignedDated = useMemo(
    () =>
      roadmap.flatMap((u) =>
        u.sets
          .filter((s) => s.assignmentId && s.dueDate)
          .map((s) => ({ key: s.set.key, id: s.assignmentId!, due: s.dueDate! })),
      ),
    [roadmap],
  );

  async function setFollowing(on: boolean) {
    if (!selected) return;
    const before = selected.curriculumId;
    const change = async (curriculumId: string | null) => {
      const res = await authenticatedFetch(`/api/courses/${selected.id}/curriculum`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ curriculumId }),
      });
      if (!res.ok) throw new Error(await apiError(res, "Could not update the class."));
      data.patchClass(selected.id, { curriculumId });
    };
    setFollowBusy(true);
    setError("");
    try {
      await change(on ? curriculum.id : null);
      undoToast(
        on
          ? `${selected.name} now follows ${curriculum.name}.`
          : `${selected.name} no longer follows this course. Its assignments are unchanged.`,
        () => change(before),
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
          onBoard
            ? `Every set in ${curriculum.name}, by where it is. Drag a card to Assigned to hand it out, or press Assign.`
            : onCalendar
              ? `Every set in ${curriculum.name} on the day it is due. Drag an assigned set to another day to move its due date, or click it.`
              : "A ready-made path through the year: units in order, each with short auto-graded sets. Assign, re-date, skip or reorder right on the roadmap."
        }
      >
        <ClassPicker
          onBeforeChange={(change) =>
            editing ? toast.info("Save or discard the new order first.") : change()
          }
        />
        {selected && written && published !== null && !loadError && (
          <>
            <Button variant="outline" onClick={() => setScheduleOpen(true)}>
              <CalendarDays aria-hidden /> Schedule &amp; days off
            </Button>
            {follows && plan && !editing && (
              <Button variant="outline" onClick={() => setEditing(true)}>
                <ListOrdered aria-hidden /> Reorder or skip
              </Button>
            )}
            {next && !editing && (
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
          </>
        )}
      </TeacherPageHeader>

      {CURRICULA.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Course">
          {CURRICULA.map((c) => {
            const on = c.id === curriculum.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() =>
                  editing ? toast.info("Save or discard the new order first.") : setCurriculum(c)
                }
                aria-pressed={on}
                title={c.description}
                className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition-colors hover:border-primary/60 focus-visible:outline-2 focus-visible:outline-ring ${on ? "border-primary bg-primary/10 font-medium text-foreground" : "border-border text-muted-foreground"}`}
              >
                {c.name}
                <span className="text-xs text-muted-foreground">
                  {hasContent(c) ? `${c.sets.length} sets` : "Planned"}
                </span>
                {selected?.curriculumId === c.id && (
                  <span
                    className="size-1.5 rounded-full bg-primary"
                    aria-label="this class follows it"
                  />
                )}
              </button>
            );
          })}
        </div>
      )}

      {!written ? (
        <Card className="shadow-none" role="status">
          <CardHeader>
            <CardTitle>{curriculum.name} is planned</CardTitle>
            <CardDescription>
              The units and sets below are the outline. Their problems are not written yet, so
              nothing can be previewed or assigned yet. Classes can follow it once its first sets
              are published.
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
                  You are an admin. To publish: import the drafts into this project, approve each
                  problem, then press <strong>Publish set</strong> on the Sets tab.
                </p>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/admin/content?tab=sets">Open Admin · Content · Sets</Link>
                </Button>
              </CardContent>
            )}
          </Card>
        )
      )}

      {written && (
        <Card className="shadow-none">
          <CardContent className="space-y-4">
            {classes === null ? (
              <p role="status" className="text-sm text-muted-foreground">
                Loading your classes…
              </p>
            ) : classes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                You have no classes yet.{" "}
                <Link className="underline" href="/teacher/welcome">
                  Create one
                </Link>{" "}
                to assign units. You can still browse and preview every set below.
              </p>
            ) : (
              selected && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <p className="text-base font-semibold">{selected.name}</p>
                  {follows ? (
                    <>
                      <Badge variant="secondary">Follows {curriculum.name}</Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setFollowing(false)}
                        disabled={busy !== null}
                      >
                        Stop following
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" onClick={() => setFollowing(true)} disabled={busy !== null}>
                        {busy === "follow"
                          ? "Saving…"
                          : followsOther
                            ? `Switch to ${curriculum.name}`
                            : `Follow ${curriculum.name}`}
                      </Button>
                      <span className="max-w-md text-xs text-muted-foreground">
                        {followsOther
                          ? `This class follows ${followsOther.name}. A class follows one course at a time; switching keeps every assignment.`
                          : "Following groups students’ work by unit and lets you reorder or skip sets. You can assign either way."}
                      </span>
                    </>
                  )}
                </div>
              )
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {!onBoard && !onCalendar && (
              <>
                {selected && published !== null && (
                  <TeacherSummary
                    label="Class progress"
                    items={[
                      { label: "Sets assigned", value: `${assignedCount} of ${wanted.length}` },
                      { label: "Students", value: progress ? progress.students : "…" },
                      {
                        label: "Average score",
                        value: !progress ? "…" : classAverage === null ? "—" : `${classAverage}%`,
                      },
                      {
                        label: pacing.remaining === 0 ? "Last due date" : "Finishes at this pace",
                        value: pacing.finish ? shortDate(pacing.finish) : "—",
                      },
                    ]}
                  />
                )}
                {selected && next && (
                  <div className="flex flex-wrap items-center gap-3">
                    <Button onClick={() => openUnit(next)} disabled={busy !== null}>
                      Assign next: Unit {next.unit}
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      {next.info?.title} · {next.assignable.length} set
                      {next.assignable.length === 1 ? "" : "s"} to assign
                    </span>
                  </div>
                )}
                {selected && !next && published !== null && publishedCount > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Every published set is assigned to this class.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {canBoard && !editing && (
        <div
          role="group"
          aria-label="View"
          className="inline-flex rounded-full border border-border bg-muted/40 p-1"
        >
          {(
            [
              ["board", "Board", Columns3],
              ["calendar", "Calendar", CalendarRange],
              ["list", "List", ListIcon],
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
          onUnit={setUnit}
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
          onUnit={setUnit}
          busy={busy !== null}
          onPreview={setPreview}
          actions={rowActions}
        />
      ) : (
        <Tabs
          value={selected && written ? tab : "roadmap"}
          onValueChange={(v) => setTab(v as Tab)}
          className="gap-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            {selected && written ? (
              <TabsList>
                <TabsTrigger value="roadmap">Roadmap</TabsTrigger>
                <TabsTrigger value="schedule">Schedule and days off</TabsTrigger>
              </TabsList>
            ) : (
              <span />
            )}
            {selected && written && tab === "roadmap" && !follows && (
              <span className="text-xs text-muted-foreground">
                Follow the course to reorder units or skip sets.
              </span>
            )}
          </div>
          <TabsContent value="roadmap">
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
          </TabsContent>
          {selected && <TabsContent value="schedule">{schedule}</TabsContent>}
        </Tabs>
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
