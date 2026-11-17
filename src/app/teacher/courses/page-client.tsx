"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, getDocs, query, where } from "firebase/firestore";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/auth-context";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { apTopicLabel } from "@/data/ap";
import { CURRICULA, type Curriculum } from "@/data/curricula";
import { addSchoolDays, parseDateInput, toDateInput } from "@/lib/first-run";
import {
  cloneSetToClass,
  planAssignments,
  runAssignments,
  type AssignableSet,
} from "@/lib/assign-sets";
import {
  AVAILABILITY_LABEL,
  deriveRoadmap,
  nextUnit,
  type RoadmapUnit,
} from "@/lib/curriculum-roadmap";
import { useAdminAccess } from "@/lib/use-admin-access";
import {
  loadClassAssignments,
  loadPublishedSets,
  type PublishedSetInfo,
} from "@/lib/curriculum-client";
import { TeacherPageHeader } from "@/components/teacher/workspace";
import { Badge } from "@/components/ui/badge";
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

interface ClassOption {
  id: string;
  name: string;
  curriculumId: string | null;
}

const shortDate = (d: Date) =>
  d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

export default function CoursesClient() {
  const { user } = useAuth();
  const isAdmin = useAdminAccess() === "admin";
  const [curriculum, setCurriculum] = useState<Curriculum>(CURRICULA[0]);
  const [classes, setClasses] = useState<ClassOption[] | null>(null);
  const [classId, setClassId] = useState("");
  const [published, setPublished] = useState<PublishedSetInfo[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [classAssignments, setClassAssignments] = useState<
    Awaited<ReturnType<typeof loadClassAssignments>>
  >([]);
  const [start, setStart] = useState(() => toDateInput(addSchoolDays(new Date(), 2)));
  const [spacing, setSpacing] = useState("2");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    let active = true;
    getDocs(query(collection(db, "courses"), where("teacherId", "==", user.uid)))
      .then((snap) => {
        if (!active) return;
        const list = snap.docs
          .map((d) => ({
            id: d.id,
            name: String(d.data().name || "Untitled class"),
            curriculumId: typeof d.data().curriculumId === "string" ? d.data().curriculumId : null,
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setClasses(list);
        setClassId(
          (cur) =>
            cur || list.find((c) => c.curriculumId === CURRICULA[0].id)?.id || list[0]?.id || "",
        );
      })
      .catch(() => active && setClasses([]));
    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    let active = true;
    loadPublishedSets(curriculum.id)
      .then((p) => active && setPublished(p))
      .catch(() => active && setLoadError(true));
    return () => {
      active = false;
    };
  }, [curriculum.id]);

  const refreshClass = useCallback(async () => {
    if (!user || !classId) return;
    try {
      setClassAssignments(await loadClassAssignments(user.uid, classId));
    } catch {
      setClassAssignments([]);
    }
  }, [user, classId]);
  useEffect(() => {
    if (!user || !classId) return;
    let active = true;
    loadClassAssignments(user.uid, classId)
      .then((a) => active && setClassAssignments(a))
      .catch(() => active && setClassAssignments([]));
    return () => {
      active = false;
    };
  }, [user, classId]);

  const selected = classes?.find((c) => c.id === classId) ?? null;
  const follows = selected?.curriculumId === curriculum.id;
  const roadmap = useMemo(
    () => deriveRoadmap(curriculum.id, published ?? [], selected ? classAssignments : []),
    [curriculum.id, published, classAssignments, selected],
  );
  const next = selected ? nextUnit(roadmap) : undefined;
  const startDate = parseDateInput(start);
  const publishedCount = published?.length ?? 0;

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
      setClasses((cur) =>
        (cur ?? []).map((c) =>
          c.id === selected.id ? { ...c, curriculumId: on ? curriculum.id : null } : c,
        ),
      );
      toast.success(
        on
          ? `${selected.name} now follows ${curriculum.name}.`
          : "Class no longer follows this course.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the class.");
    } finally {
      setBusy(null);
    }
  }

  async function assign(unit: RoadmapUnit) {
    if (!selected || !startDate) return;
    setBusy(`unit-${unit.unit}`);
    setError("");
    // Fresh read, so a set assigned elsewhere (or in another tab) is not copied twice.
    let fresh = classAssignments;
    try {
      fresh = await loadClassAssignments(user!.uid, selected.id);
    } catch {
      /* keep what we have */
    }
    const have = new Set(fresh.map((a) => String(a.curriculumSetKey)));
    const sets: AssignableSet[] = unit.sets
      .filter((s) => s.published)
      .map((s) => ({
        sourceId: s.published!.id,
        key: s.set.key,
        title: (published ?? []).find((p) => p.id === s.published!.id)?.title ?? s.set.title,
      }));
    const plan = planAssignments(sets, have, startDate, Number(spacing));
    try {
      await runAssignments(plan, (item) => cloneSetToClass(authenticatedFetch, selected.id, item));
      toast.success(
        plan.length ? `Unit ${unit.unit} assigned to ${selected.name}.` : "Nothing new to assign.",
      );
    } catch (e) {
      setError(
        `${e instanceof Error ? e.message : "Could not assign this unit."} Press assign again to continue; copies already made are kept.`,
      );
    } finally {
      await refreshClass();
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <TeacherPageHeader
        title="Courses"
        description="Ready-made roadmaps: units in order, each with auto-graded sets. Attach one to a class, or assign a unit at a time."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {CURRICULA.map((c) => (
          <Card
            key={c.id}
            className={`shadow-none ${c.id === curriculum.id ? "border-primary" : ""}`}
          >
            <CardHeader>
              <CardTitle>{c.name}</CardTitle>
              <CardDescription>{c.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>
                {published === null || c.id !== curriculum.id
                  ? "Loading…"
                  : `${publishedCount} of ${c.sets.length} sets published`}
              </span>
              {c.id !== curriculum.id && (
                <Button variant="outline" size="sm" onClick={() => setCurriculum(c)}>
                  View roadmap
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {published !== null && !loadError && publishedCount < curriculum.sets.length && (
        <Card className="shadow-none" role="status">
          <CardHeader>
            <CardTitle>
              {publishedCount === 0
                ? "This course is not published here yet"
                : `${curriculum.sets.length - publishedCount} sets are not published here yet`}
            </CardTitle>
            <CardDescription>
              {publishedCount === 0
                ? `All ${curriculum.sets.length} sets are written. You can browse the roadmap now; sets can be assigned once they have been reviewed and published in this workspace.`
                : "Sets marked \u201cNot published yet\u201d are written and can be assigned once they have been reviewed and published in this workspace."}
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
      )}

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>Assign to a class</CardTitle>
          <CardDescription>
            Classes that do not follow a course keep working as they do now.
          </CardDescription>
        </CardHeader>
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
              to assign units.
            </p>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="class">Class</Label>
                  <Select value={classId} onValueChange={setClassId}>
                    <SelectTrigger id="class" className="w-full">
                      <SelectValue placeholder="Choose a class" />
                    </SelectTrigger>
                    <SelectContent>
                      {classes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                          {c.curriculumId === curriculum.id ? " (follows this course)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="start">First due date</Label>
                  <Input
                    id="start"
                    type="date"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="spacing">Spacing</Label>
                  <Select value={spacing} onValueChange={setSpacing}>
                    <SelectTrigger id="spacing" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Every school day</SelectItem>
                      <SelectItem value="2">Every 2 school days</SelectItem>
                      <SelectItem value="3">Every 3 school days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {selected && (
                <div className="flex flex-wrap items-center gap-2">
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
                    <Button onClick={() => setFollowing(true)} disabled={busy !== null}>
                      {busy === "follow" ? "Saving…" : "Follow this course"}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => next && assign(next)}
                    disabled={!next || !startDate || busy !== null}
                  >
                    {next ? `Assign next unit (Unit ${next.unit})` : "Assign next unit"}
                  </Button>
                  {!next && published && (
                    <span className="text-xs text-muted-foreground">
                      Every published set is already assigned to this class.
                    </span>
                  )}
                </div>
              )}
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {loadError ? (
        <p role="alert" className="text-sm text-destructive">
          Could not load the roadmap. Refresh to try again.
        </p>
      ) : published === null ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading roadmap…
        </p>
      ) : (
        <ol className="space-y-4">
          {roadmap.map((u) => (
            <li key={u.unit}>
              <Card className="shadow-none">
                <CardHeader className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <CardTitle className="break-words">
                      Unit {u.unit}: {u.info?.title}
                    </CardTitle>
                    {u.info?.summary && <CardDescription>{u.info.summary}</CardDescription>}
                  </div>
                  {selected && u.sets.some((s) => s.published) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => assign(u)}
                      disabled={u.allAssigned || !startDate || busy !== null}
                    >
                      {u.allAssigned
                        ? "Unit assigned"
                        : busy === `unit-${u.unit}`
                          ? "Assigning…"
                          : `Assign unit (${u.assignable.length})`}
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  {u.sets.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Planned</p>
                  ) : (
                    <ul className="divide-y divide-border rounded-xl border border-border">
                      {u.sets.map((s) => (
                        <li
                          key={s.set.key}
                          className="flex flex-wrap items-start justify-between gap-2 px-4 py-3 text-sm"
                        >
                          <div className="min-w-0 space-y-0.5">
                            <p className="break-words font-medium">
                              {s.set.key} · {s.set.title}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {s.set.topics.map(apTopicLabel).join(" · ")}
                              {s.published
                                ? ` · ${s.published.questionCount} problem${s.published.questionCount === 1 ? "" : "s"}`
                                : ""}
                            </p>
                          </div>
                          <span className="flex items-center gap-2 text-xs text-muted-foreground">
                            {!s.published ? (
                              AVAILABILITY_LABEL[s.availability]
                            ) : s.assigned ? (
                              <>
                                <Check className="size-4 text-green-600" aria-hidden />
                                Assigned{s.dueDate ? ` · due ${shortDate(s.dueDate)}` : ""}
                              </>
                            ) : selected ? (
                              "Not assigned"
                            ) : (
                              "Ready"
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
