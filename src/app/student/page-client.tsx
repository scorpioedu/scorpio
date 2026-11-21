"use client";
import { authenticatedFetch } from "@/lib/authenticated-fetch";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, getDocs, query, where, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkspaceHeader } from "@/components/ui/workspace";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import {
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { NAV_ICONS } from "@/components/nav-icons";
import { RundownDialog } from "@/components/ui/rundown-dialog";
import { StudentProgressChart } from "@/components/dashboard/student-progress-chart";
import { errorMessage } from "@/lib/error-utils";
import { parseDueDate } from "@/lib/due-date";
import { buildStudentRoadmap, type StudentRoadmap } from "@/lib/student-roadmap";
import { StudentCourseRoadmap } from "@/components/dashboard/student-course-roadmap";

interface Stats {
  totalAssignments: number;
  completedAssignments: number;
  pendingAssignments: number;
}

/** A Firestore Timestamp (as seconds), an ISO string, epoch millis or a Date. */
type FirestoreDate = { seconds?: number } | string | number | Date | null | undefined;

/** Milliseconds for a FirestoreDate; `fallback` when the value is empty. */
function dateMs(value: FirestoreDate, fallback: number): number {
  const seconds = (value as { seconds?: number } | null | undefined)?.seconds;
  if (seconds) return seconds * 1000;
  return value ? new Date(value as string | number | Date).getTime() : fallback;
}

interface AssignmentDoc {
  id: string;
  title?: string;
  dueDate?: FirestoreDate;
  curriculumSetKey?: unknown;
  curriculumId?: unknown;
}

interface SubmissionDoc {
  id: string;
  assignmentId: string;
  status?: string;
  graded?: boolean;
  score: number;
  submittedAt?: FirestoreDate;
}

interface RecentAssignment {
  id: string;
  title: string;
  dueDate: FirestoreDate;
  isSubmitted: boolean;
}

interface ScorePoint {
  title: string;
  score: number;
  date: string;
}

export default function StudentDashboard({ onLoaded }: { onLoaded?: () => void }) {
  const router = useRouter();
  const { user, profile } = useAuth();
  const [stats, setStats] = useState<Stats>({
    totalAssignments: 0,
    completedAssignments: 0,
    pendingAssignments: 0,
  });
  const [recentAssignments, setRecentAssignments] = useState<RecentAssignment[]>([]);
  const [recentScores, setRecentScores] = useState<ScorePoint[]>([]);
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [teacherName, setTeacherName] = useState<string | null>(null);
  const [courseName, setCourseName] = useState<string | null>(null);
  const [courseCode, setCourseCode] = useState<string | null>(null);
  // The course roadmap the class follows (if any) and the class's own plan for it.
  const [classCourse, setClassCourse] = useState<{ curriculumId: unknown; plan: unknown } | null>(
    null,
  );
  const [roadmap, setRoadmap] = useState<StudentRoadmap | null>(null);
  const [classCode, setClassCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [enrollmentReady, setEnrollmentReady] = useState(false);
  const [dashboardError, setDashboardError] = useState(false);
  const [enrollmentError, setEnrollmentError] = useState(false);
  const [firstSubmissionDone, setFirstSubmissionDone] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (dataReady && onLoaded) {
      onLoaded();
    }
  }, [dataReady, onLoaded]);

  const profileCourseId = profile?.courseId;
  const profileTeacherId = profile?.teacherId;
  const hasProfile = !!profile;
  useEffect(() => {
    if (!user || !hasProfile) return;
    let active = true;

    async function loadEnrollment() {
      try {
        const legacy =
          !profileCourseId && user ? (await getDoc(doc(db, "students", user.uid))).data() : null;
        const nextCourseId = profileCourseId || legacy?.courseId || null;
        const nextTeacherId = profileTeacherId || legacy?.teacherId || null;
        const course = nextCourseId
          ? (await getDoc(doc(db, "courses", nextCourseId))).data()
          : null;
        if (!active) return;
        setCourseId(nextCourseId);
        setTeacherId(nextTeacherId);
        setCourseName(course?.name || null);
        setCourseCode(course?.code || null);
        setClassCourse(
          typeof course?.curriculumId === "string"
            ? { curriculumId: course.curriculumId, plan: course.curriculumPlan }
            : null,
        );
        setEnrollmentReady(true);
      } catch (error) {
        console.error("Error syncing profile:", error);
        if (active) {
          setEnrollmentError(true);
          setDataReady(true);
        }
      }
    }

    loadEnrollment();
    return () => {
      active = false;
    };
  }, [user, hasProfile, profileCourseId, profileTeacherId, retry]);

  useEffect(() => {
    if (!user || !enrollmentReady) return;
    let active = true;

    async function fetchDashboardData() {
      if (!user) return;
      setDataReady(false);
      setDashboardError(false);
      try {
        if (teacherId) {
          const teacherDoc = await getDoc(doc(db, "teachers", teacherId)).catch(() => null);
          if (active) setTeacherName(teacherDoc?.data()?.name || null);
        } else {
          setTeacherName(null);
        }

        let totalAssignments = 0;
        const currentAssignmentIds = new Set<string>();
        const assignmentsList: AssignmentDoc[] = [];

        // FETCHING LOGIC: Priority to courseId, fallback to teacherId (legacy)
        if (courseId) {
          const assignmentsSnap = await getDocs(
            query(
              collection(db, "assignments"),
              where("answerKeySeparated", "==", true),
              where("courseId", "==", courseId),
            ),
          );
          // Archived assignments are hidden from students (the teacher can restore them).
          const shown = assignmentsSnap.docs.filter((doc) => doc.data().archivedAt == null);
          totalAssignments = shown.length;
          shown.forEach((doc) => {
            currentAssignmentIds.add(doc.id);
            assignmentsList.push({ id: doc.id, ...doc.data() } as AssignmentDoc);
          });
        } else if (teacherId) {
          // Fallback for legacy mode: fetch ALL assignments for this teacher
          // Note: If teacherId is a code, we'll try to resolve it first in syncTeacherId
          const assignmentsSnap = await getDocs(
            query(
              collection(db, "assignments"),
              where("answerKeySeparated", "==", true),
              where("teacherId", "==", teacherId),
              where("courseId", "==", null),
            ),
          );
          // Archived assignments are hidden from students (the teacher can restore them).
          const shown = assignmentsSnap.docs.filter((doc) => doc.data().archivedAt == null);
          totalAssignments = shown.length;
          shown.forEach((doc) => {
            currentAssignmentIds.add(doc.id);
            assignmentsList.push({ id: doc.id, ...doc.data() } as AssignmentDoc);
          });
        }

        const submissionsSnap = await getDocs(
          query(collection(db, "submissions"), where("studentId", "==", user.uid)),
        );

        const submissions = submissionsSnap.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as SubmissionDoc,
        );
        const submittedAssignmentIds = new Set(
          submissions.filter((data) => data.status !== "draft").map((data) => data.assignmentId),
        );
        const completedAssignments = submissions.filter(
          (data) => data.status !== "draft" && currentAssignmentIds.has(data.assignmentId),
        ).length;

        // Map assignment title lookup
        const titleMap = new Map<string, string>();
        assignmentsList.forEach((a) => titleMap.set(a.id, a.title || "Assignment"));

        // Extract score points sorted chronologically
        const gradedSubmissions = submissions
          .filter(
            (s) =>
              s.graded &&
              typeof s.score === "number" &&
              s.status !== "draft" &&
              currentAssignmentIds.has(s.assignmentId),
          )
          .sort((a, b) => {
            const timeA = dateMs(a.submittedAt, 0);
            const timeB = dateMs(b.submittedAt, 0);
            return timeA - timeB;
          });

        const scorePoints: ScorePoint[] = gradedSubmissions.map((s) => {
          const rawDate = s.submittedAt ? new Date(dateMs(s.submittedAt, 0)) : null;
          return {
            title: titleMap.get(s.assignmentId) || "Assignment",
            score: s.score,
            date: rawDate ? rawDate.toLocaleDateString() : "",
          };
        });

        // Determine top upcoming assignments: unsubmitted first, sorted by due date ascending
        const upcoming: RecentAssignment[] = assignmentsList
          .map((a) => ({
            id: a.id,
            title: a.title || "Untitled",
            dueDate: a.dueDate,
            isSubmitted: submittedAssignmentIds.has(a.id),
          }))
          .sort((a, b) => {
            if (a.isSubmitted !== b.isSubmitted) {
              return a.isSubmitted ? 1 : -1;
            }
            const timeA = dateMs(a.dueDate, Infinity);
            const timeB = dateMs(b.dueDate, Infinity);
            return timeA - timeB;
          })
          .slice(0, 3);

        if (!active) return;
        setFirstSubmissionDone(submittedAssignmentIds.size > 0);
        setStats({
          totalAssignments,
          completedAssignments,
          pendingAssignments: Math.max(0, totalAssignments - completedAssignments),
        });
        setRecentScores(scorePoints);
        setRecentAssignments(upcoming);
        setRoadmap(
          classCourse && courseId
            ? buildStudentRoadmap(
                classCourse.curriculumId,
                classCourse.plan,
                assignmentsList.map((a) => ({
                  id: a.id,
                  title: a.title,
                  dueDate: parseDueDate(a.dueDate as Parameters<typeof parseDueDate>[0]),
                  curriculumSetKey: a.curriculumSetKey,
                  curriculumId: a.curriculumId,
                })),
                submissions,
              )
            : null,
        );
        setDataReady(true);
      } catch (error) {
        console.error("Error fetching data:", error);
        if (active) {
          setDashboardError(true);
          setDataReady(true);
        }
      }
    }

    fetchDashboardData();
    return () => {
      active = false;
    };
  }, [user, enrollmentReady, teacherId, courseId, classCourse, retry]);

  function retryDashboard() {
    setEnrollmentError(false);
    setDashboardError(false);
    setEnrollmentReady(false);
    setDataReady(false);
    setRetry((value) => value + 1);
  }

  const handleJoinClass = async () => {
    if (!user || !classCode) return;
    setJoining(true);
    try {
      const response = await authenticatedFetch("/api/student/enrollment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: classCode.trim() }),
      });
      if (!response.ok) throw new Error((await response.json()).error);
      setClassCode("");
      toast.success("Joined class successfully");
      router.refresh(); // Refresh to pick up new claims without full reload
    } catch (error: unknown) {
      console.error("Error joining class:", error);
      toast.error(`Failed to join class: ${errorMessage(error)}`);
    } finally {
      setJoining(false);
    }
  };

  const handleLeaveClass = async () => {
    if (!user) return;
    setLeaving(true);
    try {
      const response = await authenticatedFetch("/api/student/enrollment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "leave" }),
      });
      if (!response.ok) throw new Error((await response.json()).error);
      setClassCode("");
      toast.success("Successfully left class.");
      router.refresh(); // Refresh to clear context without full reload
    } catch (error: unknown) {
      console.error("Error leaving class:", error);
      toast.error(`Failed to leave class: ${errorMessage(error)}`);
    } finally {
      setLeaving(false);
    }
  };

  // The list is sorted unsubmitted first, then by due date, so this is the most urgent open one.
  const nextAssignment = recentAssignments.find((assignment) => !assignment.isSubmitted) ?? null;

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="space-y-6">
      <WorkspaceHeader
        title="Home"
        description={`${getGreeting()}, ${profile?.displayName?.split(" ")[0] || "Student"}.`}
      >
        <RundownDialog
          userRole="student"
          triggerLabel="Student Tutorial"
          title="How Scorpio is laid out"
          steps={[
            {
              title: "1. Home",
              description:
                "Start here. Next up names the one assignment to do now, and below it you see your class, your course and how you're doing.",
              icon: NAV_ICONS.home,
            },
            {
              title: "2. Assignments",
              description:
                "Everything your teacher has set, with what is due soon at the top. Open one to work through its problems.",
              icon: NAV_ICONS.assignments,
            },
            {
              title: "3. Grades",
              description:
                "Everything you turned in. Work waiting for your teacher says Awaiting grade; graded work shows your score, and Details opens the feedback on each answer.",
              icon: NAV_ICONS.grading,
            },
            {
              title: "4. Study",
              description:
                "Your study tools, in three tabs: Notebook for your own notes and derivations, Formula vault for the equations and constants in your course, and Resources for files your teacher shared.",
              icon: NAV_ICONS.study,
            },
            {
              title: "5. Raise (optional)",
              description:
                "Raise is there if you want an idea talked through. Nothing in your coursework requires it.",
              icon: NAV_ICONS.raise,
            },
            {
              title: "6. If you use Raise",
              description:
                "Say what you've tried or share a partial derivation, and Raise will give a hint toward the next step rather than the answer. Each message uses energy and water, so ask when it actually helps.",
              icon: ShieldCheck,
            },
          ]}
        />
      </WorkspaceHeader>

      {enrollmentError ? (
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Couldn’t load your enrollment</CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={retryDashboard}>
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : !enrollmentReady ? (
        <p role="status" className="text-sm text-muted-foreground">
          Checking your enrollment…
        </p>
      ) : !courseId ? (
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Join your class</CardTitle>
            <CardDescription className="text-base">
              {teacherId
                ? "Please enter your Class Code to access assignments and resources."
                : "To get started, please enter the Class Code provided by your teacher."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-col sm:flex-row gap-2 max-w-md"
              onSubmit={(event) => {
                event.preventDefault();
                handleJoinClass();
              }}
            >
              <Input
                placeholder="Class Code (e.g. PHYS101)"
                value={classCode}
                onChange={(e) => setClassCode(e.target.value)}
                aria-label="Class code"
              />
              <Button type="submit" disabled={joining || !classCode.trim()}>
                {joining ? "Enrolling..." : "Enroll"}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card className="shadow-none">
          <CardHeader className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="break-words text-lg">
                {courseName || "Physics Course"}
              </CardTitle>
              <CardDescription className="mt-1 flex flex-wrap items-center gap-2">
                {courseCode && <Badge variant="secondary">{courseCode}</Badge>}
                {teacherName || "Instructor"}
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowLeaveConfirm(true)}
              disabled={leaving}
            >
              {leaving ? "Leaving..." : "Leave class"}
            </Button>
          </CardHeader>
        </Card>
      )}

      {!enrollmentError &&
        enrollmentReady &&
        courseId &&
        (dashboardError ? (
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle>Couldn’t load your assignments</CardTitle>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={retryDashboard}>
                Try again
              </Button>
            </CardContent>
          </Card>
        ) : !dataReady ? (
          <p role="status" className="text-sm text-muted-foreground">
            Loading your assignments…
          </p>
        ) : (
          <NextUpCard assignment={nextAssignment} anySubmitted={firstSubmissionDone} />
        ))}

      <ConfirmDialog
        open={showLeaveConfirm}
        onOpenChange={setShowLeaveConfirm}
        title="Leave Class"
        description="Are you sure you want to leave this class? You will no longer be able to access assignments or resources from this instructor."
        onConfirm={handleLeaveClass}
        confirmText="Leave Class"
        cancelText="Stay"
      />

      {roadmap &&
        dataReady &&
        !dashboardError &&
        !enrollmentError &&
        roadmap.units.some((u) => u.assigned > 0) && <StudentCourseRoadmap roadmap={roadmap} />}

      <StudentProgressChart
        totalAssignments={stats.totalAssignments}
        completedAssignments={stats.completedAssignments}
        pendingAssignments={stats.pendingAssignments}
        scores={recentScores}
      />

      <Card className="gap-0 py-0 shadow-none overflow-hidden">
        <CardHeader className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 bg-muted/40 px-5 py-3.5">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">
            Upcoming assignments
          </h2>
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="h-7 text-xs text-muted-foreground hover:text-foreground"
          >
            <Link href="/student/assignments">
              All Assignments <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0 bg-card">
          {recentAssignments.length > 0 ? (
            <ul className="divide-y divide-border">
              {recentAssignments.map((assignment) => (
                <li key={assignment.id}>
                  <Link
                    href={
                      assignment.isSubmitted
                        ? `/student/grades`
                        : `/student/assignment-view?id=${assignment.id}`
                    }
                    className="group flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-muted/30 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="block break-words text-sm font-medium text-foreground transition-colors group-hover:text-primary">
                          {assignment.title}
                        </span>
                        {assignment.isSubmitted && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] h-4.5 px-1.5 font-normal"
                          >
                            Completed
                          </Badge>
                        )}
                      </div>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {assignment.dueDate
                          ? `Due ${new Date(dateMs(assignment.dueDate, 0)).toLocaleDateString()}`
                          : "No due date"}
                      </span>
                    </div>
                    <ArrowRight
                      aria-hidden="true"
                      className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-6 text-sm text-muted-foreground">
              {dashboardError || enrollmentError
                ? "Coursework is unavailable."
                : dataReady
                  ? "No coursework assigned yet."
                  : "Loading coursework…"}
            </p>
          )}
        </CardContent>
      </Card>

      <section aria-labelledby="study-heading" className="space-y-3 pt-1">
        <h2 id="study-heading" className="text-sm font-semibold tracking-tight text-foreground">
          Study
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Link
            href="/student/vault"
            className="group rounded-xl border border-border/80 bg-card p-4 transition-all hover:border-primary/50 hover:bg-muted/20"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                Formula vault
              </span>
              <ArrowRight className="size-3.5 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Physics formulas & constants</p>
          </Link>

          <Link
            href="/student/notebook"
            className="group rounded-xl border border-border/80 bg-card p-4 transition-all hover:border-primary/50 hover:bg-muted/20"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                Notebook
              </span>
              <ArrowRight className="size-3.5 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Derivations & Markdown notes</p>
          </Link>

          <Link
            href="/student/resources"
            className="group rounded-xl border border-border/80 bg-card p-4 transition-all hover:border-primary/50 hover:bg-muted/20"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                Resources
              </span>
              <ArrowRight className="size-3.5 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Course materials & references</p>
          </Link>

          <Link
            href="/student/tutor"
            className="group rounded-xl border border-border/80 bg-card p-4 transition-all hover:border-primary/50 hover:bg-muted/20"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                Raise
              </span>
              <ArrowRight className="size-3.5 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Optional hints when you’re stuck</p>
          </Link>
        </div>
      </section>
    </div>
  );
}

/** "3 days overdue", "Due today", "Due in 4 days", or the date when it is further out. */
function dueText(dueDate: FirestoreDate): { text: string; overdue: boolean } {
  const ms = dateMs(dueDate, NaN);
  if (Number.isNaN(ms)) return { text: "No due date", overdue: false };
  const due = new Date(ms);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const days = Math.round((dueDay - today) / 86_400_000);
  if (days < 0) return { text: days === -1 ? "1 day overdue" : `${-days} days overdue`, overdue: true };
  if (days === 0) return { text: "Due today", overdue: false };
  if (days === 1) return { text: "Due tomorrow", overdue: false };
  if (days <= 7) return { text: `Due in ${days} days`, overdue: false };
  return { text: `Due ${due.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`, overdue: false };
}

/** The one thing to do now: the most urgent open assignment, or a note that nothing is open. */
function NextUpCard({
  assignment,
  anySubmitted,
}: {
  assignment: RecentAssignment | null;
  anySubmitted: boolean;
}) {
  if (!assignment) {
    return (
      <Card className="shadow-none">
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-lg">
              {anySubmitted ? "You’re all caught up" : "You’re enrolled"}
            </CardTitle>
            <CardDescription>
              {anySubmitted
                ? "Nothing is open right now. Your teacher’s next assignment will show up here."
                : "Your teacher hasn’t posted an assignment yet."}
            </CardDescription>
          </div>
          {anySubmitted && (
            <Button asChild variant="outline">
              <Link href="/student/grades">See your grades</Link>
            </Button>
          )}
        </CardHeader>
      </Card>
    );
  }
  const due = dueText(assignment.dueDate);
  return (
    <Card className="shadow-none">
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Next up</p>
          <CardTitle className="mt-1 break-words text-lg">{assignment.title}</CardTitle>
          <CardDescription className={due.overdue ? "font-medium text-destructive" : undefined}>
            {due.text}
          </CardDescription>
        </div>
        <Button asChild>
          <Link href={`/student/assignment-view?id=${encodeURIComponent(assignment.id)}`}>
            {anySubmitted ? "Start" : "Start your first assignment"}
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </CardHeader>
    </Card>
  );
}
