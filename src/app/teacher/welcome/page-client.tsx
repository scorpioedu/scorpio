"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { apUnitLabel } from "@/data/ap";
import { getCurriculum, curriculumUnits, setSequence } from "@/data/curricula";
import { loadPublishedSets, type PublishedSetInfo } from "@/lib/curriculum-client";
import { defaultCalendar, schoolDays } from "@/lib/school-calendar";
import {
  cloneSetToClass,
  planAssignments,
  runAssignments,
  type PlannedAssignment,
} from "@/lib/assign-sets";
import { classInvitePath } from "@/lib/onboarding-links";
import {
  WELCOME_SKIPPED_KEY,
  formatClassName,
  parseDateInput,
  randomClassCode,
  addSchoolDays,
  studentMessage,
  toDateInput,
} from "@/lib/first-run";
import { TeacherPageHeader } from "@/components/teacher/workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CURRICULUM_ID = "ap-physics-1";

interface UnitSet {
  id: string;
  key: string;
  title: string;
  apUnit: number;
  questionCount: number;
}
interface CreatedClass {
  id: string;
  name: string;
  code: string;
}
interface Scheduled {
  key: string;
  title: string;
  due: Date;
}

export default function WelcomeClient() {
  const { user, profile } = useAuth();
  const router = useRouter();

  const [className, setClassName] = useState("AP Physics 1");
  const [period, setPeriod] = useState("");
  const [follow, setFollow] = useState(true);
  const [creating, setCreating] = useState(false);
  const [classError, setClassError] = useState("");
  const [course, setCourse] = useState<CreatedClass | null>(null);

  const [sets, setSets] = useState<UnitSet[] | null>(null);
  const [setsError, setSetsError] = useState(false);
  const [unit, setUnit] = useState("");
  // A new class has no calendar of its own yet: US default holidays and winter break are skipped.
  const [isSchoolDay] = useState(() => schoolDays(defaultCalendar()));
  const [start, setStart] = useState(() => toDateInput(addSchoolDays(new Date(), 2, isSchoolDay)));
  const [spacing, setSpacing] = useState("2");
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState("");
  const [done, setDone] = useState<Scheduled[]>([]);
  // Planned once per unit, so a retry after a failure keeps the same due dates.
  const [planState, setPlan] = useState<{ sig: string; items: PlannedAssignment[] }>({
    sig: "",
    items: [],
  });

  useEffect(() => {
    let active = true;
    loadPublishedSets(CURRICULUM_ID)
      .then((published: PublishedSetInfo[]) => {
        if (!active) return;
        const byKey = new Map(published.map((p) => [p.curriculumSetKey, p]));
        // Roadmap order comes from the course definition, not from when sets were published.
        setSets(
          curriculumUnits(CURRICULUM_ID)
            .flatMap((u) =>
              u.sets.flatMap((def) => {
                const p = byKey.get(def.key);
                return p
                  ? [
                      {
                        id: p.id,
                        key: def.key,
                        title: p.title,
                        apUnit: u.unit,
                        questionCount: p.questionCount,
                      },
                    ]
                  : [];
              }),
            )
            .sort((a, b) => setSequence(CURRICULUM_ID, a.key) - setSequence(CURRICULUM_ID, b.key)),
        );
      })
      .catch(() => {
        if (active) setSetsError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const counts = useMemo(() => {
    const m = new Map<number, number>();
    for (const s of sets ?? []) m.set(s.apUnit, (m.get(s.apUnit) ?? 0) + 1);
    return m;
  }, [sets]);
  const units = getCurriculum(CURRICULUM_ID) ? curriculumUnits(CURRICULUM_ID) : [];
  const unitsWithSets = units.filter((u) => counts.has(u.unit));
  const unitSets = useMemo(
    () => (sets ?? []).filter((s) => String(s.apUnit) === unit),
    [sets, unit],
  );
  const startDate = parseDateInput(start);
  const planSig = `${unit}|${start}|${spacing}`;
  // A plan made for different inputs is ignored (and replaced on the next Assign).
  const plan = planState.sig === planSig ? planState.items : [];
  const preview = useMemo(
    () =>
      startDate
        ? planAssignments(
            unitSets.map((s) => ({ sourceId: s.id, key: s.key, title: s.title })),
            new Set(),
            startDate,
            Number(spacing),
            isSchoolDay,
          )
        : [],
    [startDate, unitSets, spacing, isSchoolDay],
  );

  const joinUrl = course ? new URL(classInvitePath(course.code), window.location.origin).href : "";
  const first = done[0];
  const message = course
    ? studentMessage({
        className: course.name,
        code: course.code,
        joinUrl,
        firstTitle: first?.title,
        firstDue: first?.due,
      })
    : "";

  function skip() {
    try {
      localStorage.setItem(WELCOME_SKIPPED_KEY, "1");
    } catch {
      /* storage unavailable: still skip */
    }
    router.push("/teacher");
  }

  async function createClass() {
    if (!user || !className.trim()) return;
    setClassError("");
    setCreating(true);
    const name = formatClassName(className, period).slice(0, 120);
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const code = randomClassCode();
        const res = await authenticatedFetch("/api/courses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, code, ...(follow ? { curriculumId: CURRICULUM_ID } : {}) }),
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok) {
          setCourse({ id: body.id, name, code });
          return;
        }
        if (body.error !== "Class code already exists")
          throw new Error(body.error || "Could not create the class.");
      }
      throw new Error("Could not create a unique class code. Try again.");
    } catch (e) {
      setClassError(e instanceof Error ? e.message : "Could not create the class. Try again.");
    } finally {
      setCreating(false);
    }
  }

  async function assignUnit() {
    if (!course || !startDate || unitSets.length === 0) return;
    setAssignError("");
    setAssigning(true);
    // Resume safely after a partial failure: sets already copied are not copied again, and the
    // remaining ones keep the due dates planned the first time.
    const planned = plan.length ? plan : preview;
    if (!plan.length) setPlan({ sig: planSig, items: planned });
    const finished = new Set(done.map((d) => d.key));
    try {
      await runAssignments(
        planned.filter((p) => !finished.has(p.key)),
        (item) => cloneSetToClass(authenticatedFetch, course.id, item),
        (item) => {
          finished.add(item.key);
          setDone((cur) => [...cur, { key: item.key, title: item.title, due: item.due }]);
        },
      );
      toast.success("Unit assigned.");
    } catch (e) {
      setAssignError(
        `${e instanceof Error ? e.message : "Could not assign this unit."} Press Assign again to continue; copies already made are kept.`,
      );
    } finally {
      setAssigning(false);
    }
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copied.`);
    } catch {
      toast.error(`Could not copy the ${what.toLowerCase()}. Select the text and copy it instead.`);
    }
  }

  const assigned = done.length > 0 && done.length === unitSets.length;
  const noOrg = !!profile && !profile.organizationId;

  return (
    <div className="space-y-6">
      <TeacherPageHeader
        title="Get started"
        description="Create a class, assign an AP Physics 1 unit, and share the join code. It takes about five minutes."
      >
        <Button variant="ghost" onClick={skip}>
          Skip for now
        </Button>
      </TeacherPageHeader>

      {noOrg && (
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Join a Network first</CardTitle>
            <CardDescription>Classes belong to a Network.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/teacher/network">Set up your Network</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>1. Create your class</CardTitle>
          <CardDescription>
            {course ? "Your class is ready." : "Students join with a code Scorpio generates."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {course ? (
            <p className="flex items-center gap-2 text-sm">
              <Check className="size-4 text-green-600" aria-hidden />
              {course.name}
            </p>
          ) : (
            <form
              className="grid gap-4 sm:grid-cols-[1fr_10rem_auto] sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                createClass();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="class-name">Class name</Label>
                <Input
                  id="class-name"
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  maxLength={100}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="class-period">Period (optional)</Label>
                <Input
                  id="class-period"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  maxLength={20}
                  placeholder="3"
                />
              </div>
              <Button type="submit" disabled={creating || noOrg || !className.trim()}>
                {creating ? "Creating…" : "Create class"}
              </Button>
              <div className="flex items-center gap-2 sm:col-span-3">
                <Checkbox
                  id="follow-course"
                  checked={follow}
                  onCheckedChange={(c) => setFollow(c === true)}
                />
                <Label htmlFor="follow-course" className="font-normal">
                  Follow the AP Physics 1 course (students see assignments grouped by unit)
                </Label>
              </div>
              {classError && (
                <p role="alert" className="text-sm text-destructive sm:col-span-3">
                  {classError}
                </p>
              )}
            </form>
          )}
        </CardContent>
      </Card>

      <Card className={`shadow-none ${course ? "" : "opacity-60"}`}>
        <CardHeader>
          <CardTitle>2. Assign an AP Physics 1 unit</CardTitle>
          <CardDescription>
            Ready-made, auto-graded, answer keys included. Each assignment gets a due date.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {setsError ? (
            <p role="alert" className="text-sm text-destructive">
              Could not load the unit library. Refresh to try again, or pick assignments from
              Waypoints.
            </p>
          ) : sets === null ? (
            <p role="status" className="text-sm text-muted-foreground">
              Loading units…
            </p>
          ) : unitsWithSets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No AP units are published yet. You can still{" "}
              <Link className="underline" href="/teacher/create">
                create your own assignment
              </Link>
              .
            </p>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2 sm:col-span-3">
                  <Label htmlFor="unit">Unit</Label>
                  <Select
                    value={unit}
                    onValueChange={setUnit}
                    disabled={!course || assigning || done.length > 0}
                  >
                    <SelectTrigger id="unit" className="w-full">
                      <SelectValue placeholder="Choose a unit" />
                    </SelectTrigger>
                    <SelectContent>
                      {units.map((u) => {
                        const n = counts.get(u.unit) ?? 0;
                        return (
                          <SelectItem key={u.unit} value={String(u.unit)} disabled={n === 0}>
                            {apUnitLabel(u.unit)}{" "}
                            {n ? `(${n} assignment${n === 1 ? "" : "s"})` : "(not published yet)"}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Available now: {unitsWithSets.map((u) => `Unit ${u.unit}`).join(", ")}.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="start">First due date</Label>
                  <Input
                    id="start"
                    type="date"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                    disabled={!course || assigning || done.length > 0}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="spacing">Spacing</Label>
                  <Select
                    value={spacing}
                    onValueChange={setSpacing}
                    disabled={!course || assigning || done.length > 0}
                  >
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

              {unit && unitSets.length > 0 && (
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {unitSets.map((s, i) => {
                    const ok = done.some((d) => d.key === s.key);
                    return (
                      <li
                        key={s.id}
                        className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                      >
                        <span className="min-w-0 break-words font-medium">{s.title}</span>
                        <span className="flex items-center gap-2 text-muted-foreground">
                          {ok && <Check className="size-4 text-green-600" aria-label="Assigned" />}
                          {(plan[i] ?? preview[i])
                            ? `Due ${(plan[i] ?? preview[i]).due.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`
                            : "Pick a start date"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {assignError && (
                <p role="alert" className="text-sm text-destructive">
                  {assignError}
                </p>
              )}
              {assigned ? (
                <p className="flex items-center gap-2 text-sm">
                  <Check className="size-4 text-green-600" aria-hidden />
                  All {done.length} assignment{done.length === 1 ? "" : "s"} assigned to{" "}
                  {course?.name}.
                </p>
              ) : (
                <Button
                  onClick={assignUnit}
                  disabled={!course || !unit || !startDate || assigning || unitSets.length === 0}
                >
                  {assigning
                    ? "Assigning…"
                    : unit
                      ? `Assign all ${unitSets.length} to my class`
                      : "Assign unit"}
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card className={`shadow-none ${course ? "" : "opacity-60"}`}>
        <CardHeader>
          <CardTitle>3. Invite your students</CardTitle>
          <CardDescription>Send this to your class by email, LMS or a slide.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {course ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-muted-foreground">Class code</span>
                <code className="rounded-md border border-border bg-muted px-2.5 py-1 font-mono text-base tracking-wider">
                  {course.code}
                </code>
                <Button variant="outline" size="sm" onClick={() => copy(course.code, "Class code")}>
                  <Copy />
                  Copy code
                </Button>
              </div>
              <Label htmlFor="student-message" className="sr-only">
                Message for students
              </Label>
              <Textarea
                id="student-message"
                readOnly
                value={message}
                rows={6}
                className="font-sans text-sm"
              />
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => copy(message, "Message")}>
                  <Copy />
                  Copy message
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/teacher">Go to dashboard</Link>
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Create your class to get a join code.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
