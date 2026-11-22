"use client";

// The Library: ready-made sets to start an assignment from. Scorpio's own sets are shown the way
// the Course page shows them (a course, then its units in teaching order, then each unit's sets),
// so a teacher finds "Unit 4, momentum" where they expect it. Department sets have no course
// roadmap and are listed by title. Opening a set previews its problems; "Use this set" copies it
// (the server copies the answer key too) and opens the copy in the editor.
import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronRight, Lock, Search, Users } from "lucide-react";
import { db } from "@/lib/firebase";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { useAuth } from "@/contexts/auth-context";
import { useDepartmentPlan } from "@/hooks/use-department-plan";
import { isWaypointLocked } from "@/lib/plan-limits";
import { apCourseOf, apUnit, isApCourseId, type ApCourseId } from "@/data/ap";
import {
  CURRICULA,
  compareSetKeys,
  curriculumSet,
  getCurriculum,
  type CurriculumSet,
} from "@/data/curricula";
import { shownProfile } from "@/data/curricula/profiles";
import { WorkspaceHeader } from "@/components/ui/workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CourseIcon } from "@/components/teacher/course-icon";
import { DepartmentUpgradeDialog } from "@/components/teacher/department-upgrade-dialog";
import { TopicChips, UnitTile } from "@/app/teacher/courses/unit-look";
import { SetPreviewDialog, type PreviewTarget } from "@/app/teacher/courses/set-preview-dialog";
import { cn } from "@/lib/utils";

type Source = "global" | "network";

interface LibrarySet {
  id: string;
  title: string;
  description: string;
  teacherName?: string;
  organizationId?: string;
  questionCount: number;
  forkCount: number;
  apCourse: ApCourseId | null;
  apUnit: number | null;
  apTopics: string[];
  curriculumId: string | null;
  setKey: string | null;
}

/** One row's worth of a set: the course set it is (when it is one) and the words to show. */
interface Row {
  item: LibrarySet;
  set: CurriculumSet | null;
  title: string;
}

interface UnitGroup {
  key: string;
  curriculumId: string | null;
  unit: number | null;
  heading: string;
  rows: Row[];
}

const OTHER = "other";
const COURSE_STORAGE_KEY = "library-course";

function toLibrarySet(id: string, d: Record<string, unknown>): LibrarySet {
  const course = typeof d.apCourse === "string" && isApCourseId(d.apCourse) ? d.apCourse : null;
  return {
    id,
    title: typeof d.title === "string" ? d.title : "Untitled set",
    description: typeof d.description === "string" ? d.description : "",
    teacherName: typeof d.teacherName === "string" ? d.teacherName : undefined,
    organizationId: typeof d.organizationId === "string" ? d.organizationId : undefined,
    questionCount: Array.isArray(d.questions) ? d.questions.length : 0,
    forkCount: typeof d.forkCount === "number" ? d.forkCount : 0,
    apCourse: course,
    apUnit: typeof d.apUnit === "number" ? d.apUnit : null,
    apTopics: Array.isArray(d.apTopics) ? d.apTopics.filter((t) => typeof t === "string") : [],
    curriculumId:
      typeof d.curriculumId === "string" && getCurriculum(d.curriculumId) ? d.curriculumId : null,
    setKey: typeof d.curriculumSetKey === "string" ? d.curriculumSetKey : null,
  };
}

function toRow(item: LibrarySet): Row {
  const set =
    item.curriculumId && item.setKey ? (curriculumSet(item.curriculumId, item.setKey) ?? null) : null;
  return { item, set, title: set?.title ?? item.title };
}

/** Sets of one course in teaching order, one group per unit; or every other set, by title. */
function groupRows(rows: Row[], curriculumId: string): UnitGroup[] {
  if (curriculumId === OTHER) {
    const sorted = [...rows].sort((a, b) => a.title.localeCompare(b.title));
    return sorted.length
      ? [{ key: OTHER, curriculumId: null, unit: null, heading: "", rows: sorted }]
      : [];
  }
  const course = getCurriculum(curriculumId);
  const byUnit = new Map<number, Row[]>();
  for (const row of rows) {
    const unit = row.set?.unit ?? row.item.apUnit ?? 0;
    byUnit.set(unit, [...(byUnit.get(unit) ?? []), row]);
  }
  return [...byUnit.entries()]
    .sort(([a], [b]) => a - b)
    .map(([unit, unitRows]) => ({
      key: `${curriculumId}-${unit}`,
      curriculumId,
      unit,
      heading: apUnit(unit, course?.apCourse)?.title ?? `Unit ${unit}`,
      rows: unitRows.sort((a, b) =>
        a.set && b.set ? compareSetKeys(a.set, b.set) : a.title.localeCompare(b.title),
      ),
    }));
}

function courseOfRow(row: Row): string {
  return row.item.curriculumId && row.set ? row.item.curriculumId : OTHER;
}

export default function LibraryPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const { isFreePlan, hasNoOrg } = useDepartmentPlan();

  const [source, setSource] = useState<Source>("global");
  const [items, setItems] = useState<LibrarySet[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [course, setCourse] = useState<string>(CURRICULA[0].id);
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<Row | null>(null);
  const [copying, setCopying] = useState<string | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const locked = isWaypointLocked(isFreePlan, source);
  const orgId = profile?.organizationId;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(COURSE_STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reads browser storage after mount so the server render and the first client render match
      if (saved && (saved === OTHER || getCurriculum(saved))) setCourse(saved);
    } catch {}
  }, []);

  const chooseCourse = (next: string) => {
    setCourse(next);
    try {
      localStorage.setItem(COURSE_STORAGE_KEY, next);
    } catch {}
  };

  const load = useCallback(async () => {
    if (!user || authLoading) return;
    setItems(null);
    setFailed(false);
    if (source === "network" && (!orgId || isFreePlan)) {
      setItems([]);
      return;
    }
    try {
      const q =
        source === "global"
          ? query(collection(db, "assignments"), where("visibility", "==", "global"))
          : query(
              collection(db, "assignments"),
              where("visibility", "==", "network"),
              where("organizationId", "==", orgId),
            );
      const snap = await getDocs(q);
      setItems(snap.docs.map((d) => toLibrarySet(d.id, d.data())));
    } catch (e) {
      console.error("Library fetch error:", e);
      setFailed(true);
    }
  }, [user, authLoading, source, orgId, isFreePlan]);

  useEffect(() => {
    // Loads the chosen source once the account is known.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const rows = useMemo(() => (items ?? []).map(toRow), [items]);

  // The courses that have sets here, in the order Course lists them, then "Other sets".
  const courses = useMemo(() => {
    const present = new Set(rows.map(courseOfRow));
    const list: { id: string; name: string; count: number }[] = CURRICULA.filter((c) =>
      present.has(c.id),
    ).map((c) => ({
      id: c.id,
      name: c.name,
      count: rows.filter((r) => courseOfRow(r) === c.id).length,
    }));
    if (present.has(OTHER))
      list.push({
        id: OTHER,
        name: source === "network" ? "Shared in your department" : "Other sets",
        count: rows.filter((r) => courseOfRow(r) === OTHER).length,
      });
    return list;
  }, [rows, source]);

  // The chosen course if it has sets here, else the first one that does.
  const activeCourse = courses.some((c) => c.id === course) ? course : (courses[0]?.id ?? course);

  const needle = search.trim().toLowerCase();
  const matches = (row: Row) =>
    !needle ||
    [row.title, row.item.title, row.item.description, row.set?.key ?? "", ...row.item.apTopics]
      .join(" ")
      .toLowerCase()
      .includes(needle);

  // A search looks through every course; otherwise the chosen course is shown.
  const groups: UnitGroup[] = needle
    ? courses.flatMap((c) =>
        groupRows(
          rows.filter((r) => courseOfRow(r) === c.id && matches(r)),
          c.id,
        ).map((g) => ({
          ...g,
          heading: c.id === OTHER ? c.name : g.heading ? `${c.name} · ${g.heading}` : c.name,
        })),
      )
    : groupRows(
        rows.filter((r) => courseOfRow(r) === activeCourse),
        activeCourse,
      );
  const shown = groups.reduce((n, g) => n + g.rows.length, 0);

  const copySet = async (row: Row) => {
    if (locked) {
      setUpgradeOpen(true);
      return;
    }
    setCopying(row.item.id);
    try {
      const res = await authenticatedFetch("/api/assignments/clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Keep the set's own title: students see it, and "(Copy)" means nothing to them.
        body: JSON.stringify({ sourceId: row.item.id, title: row.item.title }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 403 && data.code === "plan_upgrade_required") {
        setUpgradeOpen(true);
        return;
      }
      if (!res.ok || typeof data.id !== "string") {
        toast.error(data.error || "Could not copy this set. Please try again.");
        return;
      }
      router.push(`/teacher/create?fork=true&copy=${encodeURIComponent(data.id)}`);
    } catch {
      toast.error("Could not copy this set. Please try again.");
    } finally {
      setCopying(null);
    }
  };

  const previewTarget: PreviewTarget | null = preview
    ? {
        curriculumId: preview.set ? (preview.item.curriculumId ?? "") : "",
        set: preview.set ?? {
          key: "",
          unit: preview.item.apUnit ?? 0,
          title: preview.item.title,
          description: preview.item.description,
          topics: preview.item.apTopics,
          draftIds: [],
        },
        publishedId: preview.item.id,
        assignmentId: null,
      }
    : null;

  return (
    <div className="space-y-6">
      <WorkspaceHeader
        title="Library"
        description="Ready-made problem sets. Open one to see its problems, then copy it into the editor to change and assign it."
      />

      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={source} onValueChange={(v) => setSource(v as Source)}>
          <TabsList>
            <TabsTrigger value="global" className="px-3">
              Scorpio sets
            </TabsTrigger>
            <TabsTrigger value="network" className="gap-1.5 px-3">
              Your department
              {isFreePlan && <Lock aria-label="Department License" className="size-3" />}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {courses.length > 1 && !needle && (
          <Select value={activeCourse} onValueChange={chooseCourse}>
            <SelectTrigger aria-label="Course" className="w-full sm:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {courses.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <span className="flex items-center gap-2">
                    {c.id === OTHER ? (
                      <Users aria-hidden className="size-4 shrink-0" />
                    ) : (
                      <CourseIcon curriculumId={c.id} />
                    )}
                    {c.name}
                    <span className="text-muted-foreground">· {c.count}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="relative w-full sm:ml-auto sm:w-72">
          <Search
            aria-hidden
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            aria-label="Search all sets"
            placeholder="Search all sets"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {locked ? (
        <div className="mx-auto max-w-lg space-y-3 rounded-2xl border border-dashed border-border p-8 text-center">
          <Users aria-hidden className="mx-auto size-8 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Share sets with your department</h2>
          <p className="text-sm text-muted-foreground">
            With a Department License, teachers in your school can share the sets they write and
            use each other&apos;s. Every Scorpio set stays free.
          </p>
          <Button onClick={() => setUpgradeOpen(true)}>
            {hasNoOrg ? "Set up a department" : "See the Department License"}
          </Button>
        </div>
      ) : failed ? (
        <div className="space-y-3 rounded-2xl border border-border p-6">
          <p role="alert" className="text-sm">
            Couldn&apos;t load the Library.
          </p>
          <Button variant="outline" size="sm" onClick={load}>
            Try again
          </Button>
        </div>
      ) : items === null ? (
        <p role="status" className="py-10 text-sm text-muted-foreground">
          Loading sets…
        </p>
      ) : shown === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {needle
            ? `No sets match “${search.trim()}”.`
            : source === "network"
              ? "No one in your department has shared a set yet. To share one of yours, set its Sharing to School network in All assignments."
              : "No sets here yet."}
        </div>
      ) : (
        <div className="space-y-8">
          {needle && (
            <p role="status" className="text-sm text-muted-foreground">
              {shown} {shown === 1 ? "set matches" : "sets match"} “{search.trim()}”
            </p>
          )}
          {groups.map((group) => (
            <section key={group.key} aria-labelledby={`lib-${group.key}`} className="space-y-3">
              {group.heading && (
                <div className="flex items-center gap-3">
                  {group.curriculumId && group.unit ? (
                    <UnitTile
                      curriculumId={group.curriculumId}
                      unit={group.unit}
                      className="size-9 rounded-xl text-base"
                    />
                  ) : null}
                  <div className="min-w-0">
                    <h2 id={`lib-${group.key}`} className="break-words font-semibold">
                      {group.unit && !needle ? `Unit ${group.unit} · ${group.heading}` : group.heading}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {group.rows.length} {group.rows.length === 1 ? "set" : "sets"}
                    </p>
                  </div>
                </div>
              )}
              <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
                {group.rows.map((row) => (
                  <SetRow
                    key={row.item.id}
                    row={row}
                    onOpen={() => setPreview(row)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <SetPreviewDialog
        target={previewTarget}
        onClose={() => setPreview(null)}
        onAssign={preview ? () => copySet(preview) : undefined}
        assignLabel="Use this set"
        keyNote="Answers show in the editor after you use this set."
        assignBusy={copying !== null}
      />

      <DepartmentUpgradeDialog
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        feature="network-share"
        hasNoOrg={hasNoOrg}
      />
    </div>
  );
}

function SetRow({ row, onOpen }: { row: Row; onOpen: () => void }) {
  const { item, set } = row;
  // A course set is copied with its first five problems, so that is what the row describes.
  const profile = set && item.curriculumId ? shownProfile(item.curriculumId, set.key) : undefined;
  const problems = item.questionCount;
  const course = apCourseOf(item.apCourse);
  const facts = [
    profile?.count ?? `${problems} ${problems === 1 ? "problem" : "problems"}`,
    profile ? `about ${profile.minutes} min` : null,
    item.forkCount > 0 ? `used ${item.forkCount} ${item.forkCount === 1 ? "time" : "times"}` : null,
    !set && item.teacherName ? `by ${item.teacherName}` : null,
  ].filter(Boolean);

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "group flex w-full items-start gap-4 px-4 py-3.5 text-left transition-colors hover:bg-muted/40",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
        )}
      >
        {set && (
          <span className="mt-0.5 w-9 shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">
            {set.key}
          </span>
        )}
        <span className="min-w-0 flex-1 space-y-1">
          <span className="block break-words font-medium group-hover:text-primary">
            {row.title}
          </span>
          {item.description && (
            <span className="block break-words text-sm text-muted-foreground">
              {item.description}
            </span>
          )}
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-xs text-muted-foreground">
            {item.apTopics.length > 0 && <TopicChips topics={item.apTopics} course={course} />}
            <span>{facts.join(" · ")}</span>
          </span>
        </span>
        <span className="mt-0.5 hidden shrink-0 items-center gap-1 text-sm text-muted-foreground group-hover:text-foreground sm:flex">
          Preview <ChevronRight aria-hidden className="size-4" />
        </span>
      </button>
    </li>
  );
}
