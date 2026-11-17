"use client";

// Courses: a ready-made path through the year for one class. Everything is changed where it is shown:
// assign a unit or one set, change a due date, skip a set or reorder units right on the roadmap;
// the Schedule tab moves many dates at once and holds the class's days off.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ListOrdered } from "lucide-react";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { CURRICULA, getCurriculum, hasContent, type Curriculum } from "@/data/curricula";
import { defaultFirstDue, parseDateInput } from "@/lib/first-run";
import {
  cloneSetToClass,
  planAssignments,
  runAssignments,
  type AssignableSet,
  type PlannedAssignment,
} from "@/lib/assign-sets";
import {
  deriveRoadmap,
  nextUnit,
  type RoadmapSet,
  type RoadmapUnit,
} from "@/lib/curriculum-roadmap";
import {
  isDefaultPlan,
  normalisePlan,
  toggleSkipped,
  type CurriculumPlan,
} from "@/lib/curriculum-plan";
import { paceCourse } from "@/lib/course-pacing";
import { classCalendar, schoolDays } from "@/lib/school-calendar";
import { loadClassAssignments } from "@/lib/curriculum-client";
import { dueParam, updateAssignment } from "@/lib/assignment-actions";
import { apiError, undoToast } from "@/lib/undo-toast";
import { useAdminAccess } from "@/lib/use-admin-access";
import { TeacherPageHeader, TeacherSummary } from "@/components/teacher/workspace";
import { ClassPicker } from "@/components/teacher/class-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AssignDialog } from "./assign-dialog";
import { PlanEditor } from "./plan-editor";
import { RoadmapTab } from "./roadmap-tab";
import { ScheduleTab } from "./schedule-tab";
import { SetPreviewDialog, type PreviewTarget } from "./set-preview-dialog";
import { shortDate, useCourseData } from "./use-course-data";

type Tab = "roadmap" | "schedule";

interface Assigning {
  label: string;
  sets: AssignableSet[];
  /** Unit to re-plan from on a fresh read; absent for a single set. */
  unit?: RoadmapUnit;
}

/** Keep ?course= and ?tab= in the address bar without a navigation. */
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
  const data = useCourseData(curriculum.id);
  const { user, classes, selected, published, loadError, classAssignments, progress } = data;

  const [spacing, setSpacing] = useState("2");
  const [startInput, setStartInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [assigning, setAssigning] = useState<Assigning | null>(null);
  const [preview, setPreview] = useState<PreviewTarget | null>(null);
  const [editing, setEditing] = useState(false);

  const setCurriculum = (c: Curriculum) => {
    setCurriculumState(c);
    setEditing(false);
    setParam("course", c.id === CURRICULA[0].id ? null : c.id);
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
    setBusy("follow");
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
      setBusy(null);
    }
  }

  const toAssignable = useCallback(
    (sets: RoadmapSet[]): AssignableSet[] =>
      sets.map((s) => ({
        sourceId: s.published!.id,
        key: s.set.key,
        title: (published ?? []).find((p) => p.id === s.published!.id)?.title ?? s.set.title,
      })),
    [published],
  );

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

  async function assign(target: Assigning, planned: PlannedAssignment[]) {
    if (!selected || !user || !startDate) return;
    setBusy("assign");
    setError("");
    // Fresh read, so a set assigned elsewhere (or in another tab) is not copied twice.
    let todo = planned;
    let archived = new Map<string, string>();
    try {
      const fresh = await loadClassAssignments(user.uid, selected.id);
      const have = new Set(fresh.filter((a) => !a.archived).map((a) => String(a.curriculumSetKey)));
      archived = new Map(
        fresh.filter((a) => a.archived && a.id).map((a) => [String(a.curriculumSetKey), a.id!]),
      );
      if (planned.some((p) => have.has(p.key)))
        todo = planAssignments(target.sets, have, startDate, Number(spacing), isSchoolDay);
    } catch {
      /* keep the plan the teacher confirmed */
    }
    try {
      // An archived copy of a set is restored (with its students' work) instead of copied again.
      await runAssignments(todo, (item) =>
        archived.has(item.key)
          ? updateAssignment(archived.get(item.key)!, {
              archived: false,
              dueDate: dueParam(item.due),
            }).then(() => undefined)
          : cloneSetToClass(authenticatedFetch, selected.id, item),
      );
      toast.success(
        todo.length ? `${target.label} assigned to ${selected.name}.` : "Nothing new to assign.",
      );
      setAssigning(null);
    } catch (e) {
      setAssigning(null);
      setError(
        `${e instanceof Error ? e.message : "Could not assign."} Press assign again to continue; copies already made are kept.`,
      );
    } finally {
      await data.refreshClass();
      setBusy(null);
    }
  }

  async function savePlan(next: CurriculumPlan | null) {
    if (!selected) return null;
    const res = await authenticatedFetch(`/api/courses/${encodeURIComponent(selected.id)}/plan`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: next }),
    });
    if (!res.ok) throw new Error(await apiError(res, "Could not save the change."));
    const stored = ((await res.json()).plan ?? null) as CurriculumPlan | null;
    data.patchClass(selected.id, { curriculumPlan: stored });
    return stored;
  }

  const rowActions = selected
    ? {
        onAssignSet: (s: RoadmapSet) =>
          setAssigning({ label: `${s.set.key}: ${s.set.title}`, sets: toAssignable([s]) }),
        onToggleSkip:
          follows && plan
            ? async (s: RoadmapSet) => {
                const previous = plan;
                const toStore = (p: CurriculumPlan) => (isDefaultPlan(curriculum.id, p) ? null : p);
                try {
                  await savePlan(toStore(toggleSkipped(plan, s.set.key)));
                  undoToast(
                    s.skipped
                      ? `${s.set.key} is back in the plan`
                      : `${s.set.key} skipped for ${selected.name}`,
                    () => savePlan(toStore(previous)),
                  );
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Could not save the change.");
                }
              }
            : undefined,
        onChangeDue: async (s: RoadmapSet, due: Date | null) => {
          if (!s.assignmentId) return;
          const id = s.assignmentId;
          const before = s.dueDate;
          try {
            await updateAssignment(id, { dueDate: dueParam(due) });
            await data.refreshClass();
            undoToast(
              due ? `${s.set.key} now due ${shortDate(due)}` : `${s.set.key} has no due date`,
              async () => {
                await updateAssignment(id, { dueDate: dueParam(before) });
                await data.refreshClass();
              },
            );
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not change the due date.");
            throw e;
          }
        },
        onCopyChanged: () => void data.refreshClass(),
      }
    : undefined;

  return (
    <div className="space-y-6 md:pb-16">
      <TeacherPageHeader
        title="Courses"
        description="A ready-made path through the year: units in order, each with short auto-graded sets. Assign, re-date, skip or reorder right on the roadmap."
      >
        <ClassPicker
          onBeforeChange={(change) =>
            editing ? toast.info("Save or discard the new order first.") : change()
          }
        />
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
          </CardContent>
        </Card>
      )}

      {loadError ? (
        <p role="alert" className="text-sm text-destructive">
          Could not load the roadmap. Refresh to try again.
        </p>
      ) : published === null ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading roadmap…
        </p>
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
            {selected &&
              written &&
              tab === "roadmap" &&
              !editing &&
              (follows ? (
                <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                  <ListOrdered aria-hidden /> Reorder or skip
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Follow the course to reorder units or skip sets.
                </span>
              ))}
          </div>
          <TabsContent value="roadmap">
            {editing && selected && follows && plan ? (
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
          </TabsContent>
          {selected && (
            <TabsContent value="schedule">
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
            </TabsContent>
          )}
        </Tabs>
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
