"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { CURRICULA, getCurriculum, hasContent, type Curriculum } from "@/data/curricula";
import { addSchoolDays, parseDateInput, toDateInput } from "@/lib/first-run";
import {
  cloneSetToClass,
  planAssignments,
  runAssignments,
  type AssignableSet,
  type PlannedAssignment,
} from "@/lib/assign-sets";
import { deriveRoadmap, nextUnit, type RoadmapUnit } from "@/lib/curriculum-roadmap";
import { normalisePlan } from "@/lib/curriculum-plan";
import { paceCourse } from "@/lib/course-pacing";
import { classCalendar, schoolDays } from "@/lib/school-calendar";
import { loadClassAssignments } from "@/lib/curriculum-client";
import { useAdminAccess } from "@/lib/use-admin-access";
import { TeacherPageHeader, TeacherSummary } from "@/components/teacher/workspace";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AssignDialog } from "./assign-dialog";
import { CustomizeTab } from "./customize-tab";
import { RoadmapTab } from "./roadmap-tab";
import { ScheduleTab } from "./schedule-tab";
import { SetPreviewDialog, type PreviewTarget } from "./set-preview-dialog";
import { shortDate, useCourseData } from "./use-course-data";

export default function CoursesClient() {
  const isAdmin = useAdminAccess() === "admin";
  const [curriculum, setCurriculum] = useState<Curriculum>(CURRICULA[0]);
  const data = useCourseData(curriculum.id);
  const { user, classes, classId, selected, published, loadError, classAssignments, progress } =
    data;

  const [spacing, setSpacing] = useState("2");
  const [startInput, setStartInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [assigning, setAssigning] = useState<RoadmapUnit | null>(null);
  const [preview, setPreview] = useState<PreviewTarget | null>(null);

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
  const start = startInput || toDateInput(addSchoolDays(new Date(), 2, isSchoolDay));
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
  const assignedKeys = useMemo(
    () => new Set(roadmap.flatMap((u) => u.sets.filter((s) => s.assigned).map((s) => s.set.key))),
    [roadmap],
  );

  async function setFollowing(on: boolean) {
    if (!selected) return;
    setBusy("follow");
    setError("");
    try {
      const res = await authenticatedFetch(`/api/courses/${selected.id}/curriculum`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ curriculumId: on ? curriculum.id : null }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not update the class.");
      data.patchClass(selected.id, { curriculumId: on ? curriculum.id : null });
      toast.success(
        on
          ? `${selected.name} now follows ${curriculum.name}.`
          : `${selected.name} no longer follows this course. Its assignments are unchanged.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the class.");
    } finally {
      setBusy(null);
    }
  }

  const assignableSets = (unit: RoadmapUnit): AssignableSet[] =>
    unit.assignable.map((s) => ({
      sourceId: s.published!.id,
      key: s.set.key,
      title: (published ?? []).find((p) => p.id === s.published!.id)?.title ?? s.set.title,
    }));

  async function assign(unit: RoadmapUnit, planned: PlannedAssignment[]) {
    if (!selected || !user || !startDate) return;
    setBusy("assign");
    setError("");
    // Fresh read, so a set assigned elsewhere (or in another tab) is not copied twice.
    let todo = planned;
    try {
      const fresh = await loadClassAssignments(user.uid, selected.id);
      const have = new Set(fresh.map((a) => String(a.curriculumSetKey)));
      if (planned.some((p) => have.has(p.key)))
        todo = planAssignments(assignableSets(unit), have, startDate, Number(spacing), isSchoolDay);
    } catch {
      /* keep the plan the teacher confirmed */
    }
    try {
      await runAssignments(todo, (item) => cloneSetToClass(authenticatedFetch, selected.id, item));
      toast.success(
        todo.length ? `Unit ${unit.unit} assigned to ${selected.name}.` : "Nothing new to assign.",
      );
      setAssigning(null);
    } catch (e) {
      setAssigning(null);
      setError(
        `${e instanceof Error ? e.message : "Could not assign this unit."} Press assign again to continue; copies already made are kept.`,
      );
    } finally {
      await data.refreshClass();
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6 md:pb-16 md:pr-28">
      <TeacherPageHeader
        title="Courses"
        description="A ready-made path through the year: units in order, each with short auto-graded sets. Preview any set, assign a unit at a time, and see how the class is doing."
      />

      {CURRICULA.length > 1 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="group" aria-label="Course">
          {CURRICULA.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCurriculum(c)}
              aria-pressed={c.id === curriculum.id}
              className={`rounded-2xl border bg-card p-4 text-left transition-colors hover:border-primary/60 focus-visible:outline-2 focus-visible:outline-ring ${c.id === curriculum.id ? "border-primary" : "border-border"}`}
            >
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{c.name}</span>
                <Badge variant={hasContent(c) ? "secondary" : "outline"}>
                  {hasContent(c) ? `${c.sets.length} sets` : "Planned"}
                </Badge>
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">{c.description}</span>
            </button>
          ))}
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
              <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
                <div className="min-w-56 flex-1 space-y-2 sm:max-w-sm">
                  <Label htmlFor="class">Class</Label>
                  <Select value={classId} onValueChange={data.setClassId}>
                    <SelectTrigger id="class" className="w-full">
                      <SelectValue placeholder="Choose a class" />
                    </SelectTrigger>
                    <SelectContent>
                      {classes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selected &&
                  (follows ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">Follows {curriculum.name}</Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setFollowing(false)}
                        disabled={busy !== null}
                      >
                        Stop following
                      </Button>
                    </div>
                  ) : !written ? null : (
                    <div className="flex flex-wrap items-center gap-3">
                      <Button onClick={() => setFollowing(true)} disabled={busy !== null}>
                        {busy === "follow"
                          ? "Saving…"
                          : followsOther
                            ? `Switch to ${curriculum.name}`
                            : `Follow ${curriculum.name}`}
                      </Button>
                      <span className="max-w-xs text-xs text-muted-foreground">
                        {followsOther
                          ? `This class follows ${followsOther.name}. A class follows one course at a time; switching keeps every assignment.`
                          : "Following groups students’ work by unit and lets you reorder or skip sets. You can assign units either way."}
                      </span>
                    </div>
                  ))}
              </div>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {selected && published !== null && written && (
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
                <Button onClick={() => setAssigning(next)} disabled={busy !== null}>
                  Assign next: Unit {next.unit}
                </Button>
                <span className="text-sm text-muted-foreground">
                  {next.info?.title} · {next.assignable.length} set
                  {next.assignable.length === 1 ? "" : "s"} to assign
                </span>
              </div>
            )}
            {selected && !next && published !== null && publishedCount > 0 && written && (
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
        <Tabs defaultValue="roadmap" className="gap-4" key={curriculum.id}>
          {selected && written && (
            <TabsList>
              <TabsTrigger value="roadmap">Roadmap</TabsTrigger>
              <TabsTrigger value="schedule">Schedule</TabsTrigger>
              <TabsTrigger value="customize">Customize</TabsTrigger>
            </TabsList>
          )}
          <TabsContent value="roadmap">
            <RoadmapTab
              curriculum={curriculum}
              roadmap={roadmap}
              className={written ? (selected?.name ?? null) : null}
              progress={progress}
              nextUnitNumber={next?.unit}
              busy={busy !== null}
              onAssign={setAssigning}
              onPreview={setPreview}
            />
          </TabsContent>
          {selected && (
            <TabsContent value="schedule">
              <ScheduleTab
                course={curriculum.apCourse}
                classId={selected.id}
                roadmap={roadmap}
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
          {selected && (
            <TabsContent value="customize">
              {follows && plan ? (
                <CustomizeTab
                  key={selected.id}
                  classId={selected.id}
                  className={selected.name}
                  curriculumId={curriculum.id}
                  saved={plan}
                  assignedKeys={assignedKeys}
                  onSaved={(saved) => data.patchClass(selected.id, { curriculumPlan: saved })}
                />
              ) : (
                <Card className="shadow-none">
                  <CardHeader>
                    <CardTitle>Follow the course to customize it</CardTitle>
                    <CardDescription>
                      Reordering units and skipping sets is saved per class, for classes that follow{" "}
                      {curriculum.name}.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button onClick={() => setFollowing(true)} disabled={busy !== null}>
                      Follow {curriculum.name}
                    </Button>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          )}
        </Tabs>
      )}

      {assigning && selected && (
        <AssignDialog
          unitLabel={`Unit ${assigning.unit}: ${assigning.info?.title ?? ""}`}
          className={selected.name}
          sets={assignableSets(assigning)}
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
      <SetPreviewDialog target={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
