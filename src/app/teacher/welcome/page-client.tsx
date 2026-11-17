"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { collection, getDocs, query, where } from "firebase/firestore";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/auth-context";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { AP_UNITS, apUnitLabel } from "@/data/ap";
import { classInvitePath } from "@/lib/onboarding-links";
import {
  WELCOME_SKIPPED_KEY, countByUnit, formatClassName, parseDateInput, randomClassCode,
  nextSchoolDay, scheduleDueDates, studentMessage, toDateInput,
} from "@/lib/first-run";
import { TeacherPageHeader } from "@/components/teacher/workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface UnitSet {
  id: string;
  title: string;
  apUnit: number;
  apCourse?: string | null;
  questionCount: number;
  createdAt: number;
}
interface CreatedClass { id: string; name: string; code: string }
interface Scheduled { id: string; title: string; due: Date }

export default function WelcomeClient() {
  const { user, profile } = useAuth();
  const router = useRouter();

  const [className, setClassName] = useState("AP Physics 1");
  const [period, setPeriod] = useState("");
  const [creating, setCreating] = useState(false);
  const [classError, setClassError] = useState("");
  const [course, setCourse] = useState<CreatedClass | null>(null);

  const [sets, setSets] = useState<UnitSet[] | null>(null);
  const [setsError, setSetsError] = useState(false);
  const [unit, setUnit] = useState("");
  const [start, setStart] = useState(() => toDateInput(nextSchoolDay(new Date())));
  const [spacing, setSpacing] = useState("2");
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState("");
  const [done, setDone] = useState<Scheduled[]>([]);

  useEffect(() => {
    let active = true;
    getDocs(query(collection(db, "assignments"), where("visibility", "==", "global")))
      .then((snap) => {
        if (!active) return;
        setSets(
          snap.docs
            .map((d) => {
              const data = d.data();
              const created = data.createdAt?.toMillis?.() ?? (data.createdAt ? new Date(data.createdAt).getTime() : 0);
              return {
                id: d.id, title: String(data.title || "Untitled"), apUnit: data.apUnit, apCourse: data.apCourse,
                questionCount: Array.isArray(data.questions) ? data.questions.length : 0, createdAt: created || 0,
              } as UnitSet;
            })
            .filter((s) => typeof s.apUnit === "number" && (s.apCourse == null || s.apCourse === "physics-1"))
            .sort((a, b) => a.createdAt - b.createdAt || a.title.localeCompare(b.title)),
        );
      })
      .catch(() => { if (active) setSetsError(true); });
    return () => { active = false; };
  }, []);

  const counts = useMemo(() => countByUnit(sets ?? []), [sets]);
  const unitsWithSets = AP_UNITS.filter((u) => counts.has(u.unit));
  const unitSets = useMemo(() => (sets ?? []).filter((s) => String(s.apUnit) === unit), [sets, unit]);
  const startDate = parseDateInput(start);
  const preview = useMemo(
    () => (startDate ? scheduleDueDates(startDate, unitSets.length, Number(spacing)) : []),
    [startDate, unitSets.length, spacing],
  );

  const joinUrl = course ? new URL(classInvitePath(course.code), window.location.origin).href : "";
  const first = done[0];
  const message = course
    ? studentMessage({ className: course.name, code: course.code, joinUrl, firstTitle: first?.title, firstDue: first?.due })
    : "";

  function skip() {
    try { localStorage.setItem(WELCOME_SKIPPED_KEY, "1"); } catch { /* storage unavailable: still skip */ }
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
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, code }),
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok) { setCourse({ id: body.id, name, code }); return; }
        if (body.error !== "Class code already exists") throw new Error(body.error || "Could not create the class.");
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
    // Resume safely after a partial failure: sets already copied are not copied again.
    const finished = new Map(done.map((d) => [d.id, d]));
    try {
      for (let i = 0; i < unitSets.length; i++) {
        const set = unitSets[i];
        if (finished.has(set.id)) continue;
        const res = await authenticatedFetch("/api/assignments/clone", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceId: set.id, courseId: course.id, dueDate: preview[i].toISOString() }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Could not assign this unit.");
        finished.set(set.id, { id: set.id, title: set.title, due: preview[i] });
        setDone([...finished.values()]);
      }
      toast.success("Unit assigned.");
    } catch (e) {
      setAssignError(`${e instanceof Error ? e.message : "Could not assign this unit."} Press Assign again to continue; copies already made are kept.`);
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
      <TeacherPageHeader title="Get started" description="Create a class, assign an AP Physics 1 unit, and share the join code. It takes about five minutes.">
        <Button variant="ghost" onClick={skip}>Skip for now</Button>
      </TeacherPageHeader>

      {noOrg && (
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Join a Network first</CardTitle>
            <CardDescription>Classes belong to a Network.</CardDescription>
          </CardHeader>
          <CardContent><Button asChild><Link href="/teacher/network">Set up your Network</Link></Button></CardContent>
        </Card>
      )}

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>1. Create your class</CardTitle>
          <CardDescription>{course ? "Your class is ready." : "Students join with a code Scorpio generates."}</CardDescription>
        </CardHeader>
        <CardContent>
          {course ? (
            <p className="flex items-center gap-2 text-sm"><Check className="size-4 text-green-600" aria-hidden />{course.name}</p>
          ) : (
            <form className="grid gap-4 sm:grid-cols-[1fr_10rem_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); createClass(); }}>
              <div className="space-y-2">
                <Label htmlFor="class-name">Class name</Label>
                <Input id="class-name" value={className} onChange={(e) => setClassName(e.target.value)} maxLength={100} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="class-period">Period (optional)</Label>
                <Input id="class-period" value={period} onChange={(e) => setPeriod(e.target.value)} maxLength={20} placeholder="3" />
              </div>
              <Button type="submit" disabled={creating || noOrg || !className.trim()}>{creating ? "Creating…" : "Create class"}</Button>
              {classError && <p role="alert" className="text-sm text-destructive sm:col-span-3">{classError}</p>}
            </form>
          )}
        </CardContent>
      </Card>

      <Card className={`shadow-none ${course ? "" : "opacity-60"}`}>
        <CardHeader>
          <CardTitle>2. Assign an AP Physics 1 unit</CardTitle>
          <CardDescription>Ready-made, auto-graded, answer keys included. Each assignment gets a due date.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {setsError ? (
            <p role="alert" className="text-sm text-destructive">Could not load the unit library. Refresh to try again, or pick assignments from Waypoints.</p>
          ) : sets === null ? (
            <p role="status" className="text-sm text-muted-foreground">Loading units…</p>
          ) : unitsWithSets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No AP units are published yet. You can still <Link className="underline" href="/teacher/create">create your own assignment</Link>.</p>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2 sm:col-span-3">
                  <Label htmlFor="unit">Unit</Label>
                  <Select value={unit} onValueChange={setUnit} disabled={!course || assigning || done.length > 0}>
                    <SelectTrigger id="unit" className="w-full"><SelectValue placeholder="Choose a unit" /></SelectTrigger>
                    <SelectContent>
                      {AP_UNITS.map((u) => {
                        const n = counts.get(u.unit) ?? 0;
                        return (
                          <SelectItem key={u.unit} value={String(u.unit)} disabled={n === 0}>
                            {apUnitLabel(u.unit)} {n ? `(${n} assignment${n === 1 ? "" : "s"})` : "(not published yet)"}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Available now: {unitsWithSets.map((u) => `Unit ${u.unit}`).join(", ")}.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="start">First due date</Label>
                  <Input id="start" type="date" value={start} onChange={(e) => setStart(e.target.value)} disabled={!course || assigning || done.length > 0} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="spacing">Spacing</Label>
                  <Select value={spacing} onValueChange={setSpacing} disabled={!course || assigning || done.length > 0}>
                    <SelectTrigger id="spacing" className="w-full"><SelectValue /></SelectTrigger>
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
                    const ok = done.some((d) => d.id === s.id);
                    return (
                      <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                        <span className="min-w-0 break-words font-medium">{s.title}</span>
                        <span className="flex items-center gap-2 text-muted-foreground">
                          {ok && <Check className="size-4 text-green-600" aria-label="Assigned" />}
                          {preview[i] ? `Due ${preview[i].toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}` : "Pick a start date"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {assignError && <p role="alert" className="text-sm text-destructive">{assignError}</p>}
              {assigned ? (
                <p className="flex items-center gap-2 text-sm"><Check className="size-4 text-green-600" aria-hidden />All {done.length} assignment{done.length === 1 ? "" : "s"} assigned to {course?.name}.</p>
              ) : (
                <Button onClick={assignUnit} disabled={!course || !unit || !startDate || assigning || unitSets.length === 0}>
                  {assigning ? "Assigning…" : unit ? `Assign all ${unitSets.length} to my class` : "Assign unit"}
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
                <code className="rounded-md border border-border bg-muted px-2.5 py-1 font-mono text-base tracking-wider">{course.code}</code>
                <Button variant="outline" size="sm" onClick={() => copy(course.code, "Class code")}><Copy />Copy code</Button>
              </div>
              <Label htmlFor="student-message" className="sr-only">Message for students</Label>
              <Textarea id="student-message" readOnly value={message} rows={6} className="font-sans text-sm" />
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => copy(message, "Message")}><Copy />Copy message</Button>
                <Button variant="outline" asChild><Link href="/teacher">Go to dashboard</Link></Button>
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
