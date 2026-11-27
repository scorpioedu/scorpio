"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Lightbulb, RefreshCw } from "lucide-react";
import { ClickIcon } from "@/components/ui/click-icon";
import { ChevronDownIcon as AnimatedChevronDown } from "@animateicons/react/lucide/chevron-down-icon";
import { useAuth } from "@/contexts/auth-context";
import { useSelectedClass } from "@/contexts/selected-class-context";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { TeacherPageHeader, TeacherSummary } from "@/components/teacher/workspace";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apCourseOf, parseApUnitKey } from "@/data/ap";
import { ApUnitSelectItems } from "@/components/ap-unit-select-items";
import type { GroupRow, InsightsReport, TagRow } from "@/lib/insights";

interface InsightsResponse extends InsightsReport {
  classes: { id: string; name: string }[];
  assignments: {
    id: string;
    title: string;
    courseId: string | null;
    apCourse?: string | null;
    apUnit: number | null;
  }[];
  truncated: boolean;
  error?: string;
}

const ALL = "all";

function pct(share: number) {
  return `${Math.round(share * 100)}%`;
}

function TagCard({ row, rank, denominator }: { row: TagRow; rank: number; denominator: number }) {
  const [open, setOpen] = useState(false);
  const id = `tag-${row.tag}`;
  return (
    <li className="rounded-xl border border-border bg-card">
      <button
        type="button"
        className="flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left sm:px-5"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="mt-0.5 w-6 shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">
          {rank}
        </span>
        <span className="min-w-0 flex-1 space-y-2">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{row.label}</span>
            {row.category === "procedural" && (
              <Badge variant="outline" className="text-xs font-normal">
                Procedural slip
              </Badge>
            )}
          </span>
          <span className="flex items-center gap-3">
            <span
              className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label={`${row.studentCount} of ${denominator} students`}
            >
              <span
                className="block h-full rounded-full bg-primary"
                style={{ width: `${Math.max(4, row.studentShare * 100)}%` }}
              />
            </span>
            <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
              <strong className="font-semibold text-foreground">{row.studentCount}</strong>{" "}
              {row.studentCount === 1 ? "student" : "students"} · {pct(row.studentShare)}
            </span>
          </span>
        </span>
        <ClickIcon
          icon={AnimatedChevronDown}
          className={`mt-1 size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      <div id={id} hidden={!open} className="space-y-4 border-t px-4 py-4 text-sm sm:px-5 sm:pl-14">
        {row.description && <p className="text-muted-foreground">{row.description}</p>}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Students
            </h4>
            <ul className="space-y-0.5">
              {row.students.map((s) => (
                <li key={s.id}>
                  <Link
                    className="hover:text-primary hover:underline"
                    href={`/teacher/grades/student?studentId=${s.id}`}
                  >
                    {s.name}
                  </Link>
                </li>
              ))}
              {row.studentCount > row.students.length && (
                <li className="text-muted-foreground">
                  and {row.studentCount - row.students.length} more
                </li>
              )}
            </ul>
          </div>
          <div className="space-y-1.5">
            <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Assignments
            </h4>
            <ul className="space-y-0.5">
              {row.assignments.map((a) => (
                <li key={a.id} className="flex justify-between gap-2">
                  <span className="min-w-0 break-words">{a.title}</span>
                  <span className="tabular-nums text-muted-foreground">{a.studentCount}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-1.5">
            <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              AP topics
            </h4>
            {row.topics.length ? (
              <ul className="space-y-0.5">
                {row.topics.map((t) => (
                  <li key={t.id} className="flex justify-between gap-2">
                    <span className="min-w-0 break-words">{t.label}</span>
                    <span className="tabular-nums text-muted-foreground">{t.studentCount}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">No AP topic tagged</p>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

function GroupCard({ title, rows, empty }: { title: string; rows: GroupRow[]; empty: string }) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-4 py-4 sm:px-5">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="border-t px-4 py-3 sm:px-5">
        {rows.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="divide-y">
            {rows.map((g) => (
              <li key={g.id} className="space-y-1 py-2.5">
                <div className="flex justify-between gap-2 text-sm">
                  <span className="min-w-0 break-words font-medium">{g.label}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {g.studentCount} {g.studentCount === 1 ? "student" : "students"}
                  </span>
                </div>
                <ol className="space-y-0.5 text-sm text-muted-foreground">
                  {g.top.map((t) => (
                    <li key={t.tag} className="flex justify-between gap-2">
                      <span className="min-w-0 break-words">{t.label}</span>
                      <span className="tabular-nums">{t.studentCount}</span>
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default function TeacherInsightsPage() {
  const { user } = useAuth();
  // The class is shared with the other teacher pages (remembered, and in the URL as ?class=).
  const { classId, setClassId: setCourseId } = useSelectedClass({ allowAll: true });
  const courseId = classId || ALL;
  const [assignmentId, setAssignmentId] = useState(ALL);
  const [apUnit, setApUnit] = useState(ALL);
  const [includePending, setIncludePending] = useState(true);
  const [showProcedural, setShowProcedural] = useState(true);
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (courseId !== ALL) params.set("courseId", courseId);
    if (assignmentId !== ALL) params.set("assignmentId", assignmentId);
    // The picker's value names the course and the unit ("4", or "physics-2:9").
    const unit = apUnit === ALL ? null : parseApUnitKey(apUnit);
    if (unit) {
      params.set("apUnit", String(unit.unit));
      if (unit.course !== "physics-1") params.set("apCourse", unit.course);
    }
    if (!includePending) params.set("pending", "0");
    try {
      const res = await authenticatedFetch(`/api/teacher/insights?${params}`);
      const body = (await res.json()) as InsightsResponse;
      if (!res.ok) throw new Error(body.error || "Could not load the report");
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the report");
    } finally {
      setLoading(false);
    }
  }, [user, courseId, assignmentId, apUnit, includePending]);

  useEffect(() => {
    // Reloads the report whenever a filter changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const assignments = useMemo(
    () =>
      (data?.assignments || []).filter((a) => {
        const unit = apUnit === ALL ? null : parseApUnitKey(apUnit);
        return (
          (courseId === ALL || a.courseId === courseId) &&
          (!unit ||
            a.apUnit === null ||
            (a.apUnit === unit.unit && apCourseOf(a.apCourse) === unit.course))
        );
      }),
    [data, courseId, apUnit],
  );
  const rows = (data?.top || []).filter((r) => showProcedural || r.category === "conceptual");
  const denominator = data?.totals.studentsInScope ?? 0;

  return (
    <div className="space-y-6">
      <TeacherPageHeader
        title="Misconceptions"
        description="The wrong ideas showing up in your students' graded work, ranked by how many students show each one. Use it to pick what to reteach."
      >
        <Button variant="outline" size="sm" asChild>
          <Link href="/teacher/courses">By unit in Course</Link>
        </Button>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={loading ? "animate-spin" : ""} />
          Refresh
        </Button>
      </TeacherPageHeader>

      <Card className="min-w-0 gap-0 py-0">
        <CardHeader className="flex flex-wrap items-end gap-4 px-4 py-4 sm:px-5">
          <div className="grid w-full gap-3 sm:grid-cols-3">
            <div className="min-w-0 space-y-1.5">
              <label
                htmlFor="insights-class"
                className="block text-xs font-medium text-muted-foreground"
              >
                Class
              </label>
              <Select
                value={courseId}
                onValueChange={(v) => {
                  setCourseId(v);
                  setAssignmentId(ALL);
                }}
              >
                <SelectTrigger id="insights-class" className="w-full min-w-0 cursor-pointer">
                  <SelectValue placeholder="All classes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All classes</SelectItem>
                  {(data?.classes || []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-1.5">
              <label
                htmlFor="insights-unit"
                className="block text-xs font-medium text-muted-foreground"
              >
                AP unit
              </label>
              <Select
                value={apUnit}
                onValueChange={(v) => {
                  setApUnit(v);
                  setAssignmentId(ALL);
                }}
              >
                <SelectTrigger id="insights-unit" className="w-full min-w-0 cursor-pointer">
                  <SelectValue placeholder="All units" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All units</SelectItem>
                  <ApUnitSelectItems />
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-1.5">
              <label
                htmlFor="insights-assignment"
                className="block text-xs font-medium text-muted-foreground"
              >
                Assignment
              </label>
              <Select value={assignmentId} onValueChange={setAssignmentId}>
                <SelectTrigger id="insights-assignment" className="w-full min-w-0 cursor-pointer">
                  <SelectValue placeholder="All assignments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All assignments</SelectItem>
                  {assignments.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex cursor-pointer items-center gap-2">
              <Checkbox
                checked={includePending}
                onCheckedChange={(v) => setIncludePending(v === true)}
              />
              Include work awaiting review
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <Checkbox
                checked={showProcedural}
                onCheckedChange={(v) => setShowProcedural(v === true)}
              />
              Show procedural slips
            </label>
          </div>
        </CardHeader>
      </Card>

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-destructive/40 px-4 py-6 text-center text-sm text-destructive"
        >
          {error}
        </p>
      ) : loading && !data ? (
        <p role="status" className="px-5 py-10 text-center text-sm text-muted-foreground">
          Loading report…
        </p>
      ) : data && data.top.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Lightbulb className="size-8 text-muted-foreground" aria-hidden />
            <p className="font-medium">No misconceptions recorded yet</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Each time Scorpio grades a submission it records the misconceptions it finds. Assign a
              unit from your{" "}
              <Link href="/teacher/courses" className="text-primary hover:underline">
                Course
              </Link>{" "}
              and this report fills in as students submit.
            </p>
          </CardContent>
        </Card>
      ) : data ? (
        <>
          <TeacherSummary
            label="Report summary"
            items={[
              {
                label: "Students with a misconception",
                value: `${data.totals.students} of ${data.totals.studentsInScope}`,
              },
              { label: "Submissions", value: data.totals.submissions },
              { label: "Answers flagged", value: data.totals.answers },
              { label: "Different misconceptions", value: data.totals.tags },
            ]}
          />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <section aria-labelledby="top-heading" className="min-w-0 space-y-3">
              <div>
                <h2 id="top-heading" className="text-lg font-semibold">
                  Top misconceptions
                </h2>
                <p className="text-sm text-muted-foreground">
                  Percentages are out of students with graded work in this view. Open a row to see
                  who and where.
                </p>
              </div>
              <ol className="space-y-2">
                {rows.map((row, i) => (
                  <TagCard key={row.tag} row={row} rank={i + 1} denominator={denominator} />
                ))}
              </ol>
              {data.truncated && (
                <p className="text-xs text-muted-foreground">
                  Showing the most recent 20,000 records. Filter by class or unit for a full count.
                </p>
              )}
            </section>
            <aside className="min-w-0 space-y-6">
              <GroupCard
                title="By AP unit"
                rows={data.byUnit}
                empty="No assignments tagged with an AP unit yet."
              />
              <GroupCard
                title="By assignment"
                rows={data.byAssignment}
                empty="No assignments yet."
              />
              {courseId === ALL && data.byClass.length > 1 && (
                <GroupCard title="By class" rows={data.byClass} empty="" />
              )}
              <CardDescription className="px-1 text-xs">
                Misconceptions come from automatic grading: known wrong answers on multiple-choice
                and numeric questions, and the AI grader on written answers. Check a few before
                reteaching.
              </CardDescription>
            </aside>
          </div>
        </>
      ) : null}
    </div>
  );
}
