"use client";
import { authenticatedFetch } from "@/lib/authenticated-fetch";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, getDocs, query, where, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useStudentAi } from "@/contexts/student-ai-context";
import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkspaceHeader } from "@/components/ui/workspace";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { ClickIcon } from "@/components/ui/click-icon";
import { ArrowRightIcon as AnimatedArrowRight } from "@animateicons/react/lucide/arrow-right-icon";
import Link from "next/link";
import { NAV_ICONS } from "@/components/nav-icons";
import { RundownDialog } from "@/components/ui/rundown-dialog";
import { StudentProgressChart } from "@/components/dashboard/student-progress-chart";
import { errorMessage } from "@/lib/error-utils";
import { parseDueDate } from "@/lib/due-date";
import { buildStudentRoadmap, type StudentRoadmap } from "@/lib/student-roadmap";
import { StudentRoadmapSummary } from "@/components/dashboard/student-course-roadmap";
import { pillClass } from "@/components/student/tones";
import { JoinClassForm } from "@/components/student/join-class-form";
import { CelebrationDialog } from "@/components/invite-celebration";

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
  description?: string;
  questions?: unknown[];
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
  description: string;
  questionCount: number;
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
  // Raise is mentioned only where the teacher has turned it on for the class.
  const aiOn = useStudentAi() === true;
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
            description: typeof a.description === "string" ? a.description : "",
            questionCount: Array.isArray(a.questions) ? a.questions.length : 0,
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
          .slice(0, 4);

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
  const openAssignments = recentAssignments.filter((assignment) => !assignment.isSubmitted);
  const nextAssignment = openAssignments[0] ?? null;

  // Once per class per browser, and never for a student who has already turned work in: the
  // invite popup before signup promised a class, and this is where they see they are in it.
  const welcomeKey = courseId ? `scorpio-class-welcomed:${courseId}` : null;
  const [welcomed, setWelcomed] = useState<string | null>(null);
  const showWelcome =
    !!welcomeKey &&
    enrollmentReady &&
    dataReady &&
    !dashboardError &&
    !firstSubmissionDone &&
    welcomed !== welcomeKey &&
    !alreadyWelcomed(welcomeKey);
  function dismissWelcome() {
    if (!welcomeKey) return;
    try {
      localStorage.setItem(welcomeKey, "1");
    } catch {
      /* storage unavailable: it stays closed for this visit */
    }
    setWelcomed(welcomeKey);
  }
  // What comes after Next up, shown inside the same card (Home has no separate upcoming list).
  const laterAssignments = openAssignments.slice(1, 4);

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
          triggerLabel="Help"
          title="How Scorpio is laid out"
          steps={[
            {
              title: "1. Home",
              description:
                "Start here. Next up names the one assignment to do now and what comes after it, and beside it is your progress through the course.",
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
                "Your study tools: Study, one page for your course where every topic has a short lesson and practice with each answer checked, and the topics you missed come back for review; Notebook for your own notes and derivations; Formula vault for the equations and constants in your course; and Resources for files your teacher shared.",
              icon: NAV_ICONS.study,
            },
            ...(aiOn
              ? [
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
                ]
              : []),
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
        // Without a class, Study is what there is to do: it comes first, and joining a class is
        // offered below it for students who have a code.
        <>
          <Card className="shadow-none">
            <CardHeader className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="text-lg">Start studying</CardTitle>
                <CardDescription className="mt-1">
                  A lesson and practice for every AP Physics topic, and review of what you missed.
                  Free, no class needed.
                </CardDescription>
              </div>
              <Button asChild size="lg">
                <Link href="/student/study">
                  Open Study
                  <ClickIcon icon={AnimatedArrowRight} aria-hidden />
                </Link>
              </Button>
            </CardHeader>
          </Card>
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">
                {teacherId ? "Join your class" : "Have a class code?"}
              </CardTitle>
              <CardDescription className="text-base">
                {teacherId
                  ? "Enter your class code to see your assignments and what your teacher shares."
                  : "If your teacher gave you one, enter it to see their assignments too. An invite link does this for you."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <JoinClassForm />
            </CardContent>
          </Card>
        </>
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
        ) : roadmap && roadmap.units.some((u) => u.assigned > 0) ? (
          // The full unit list is on Study; here it is one small card beside Next up.
          <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
            <NextUpCard
              assignment={nextAssignment}
              later={laterAssignments}
              anySubmitted={firstSubmissionDone}
            />
            <StudentRoadmapSummary roadmap={roadmap} />
          </div>
        ) : (
          <NextUpCard
            assignment={nextAssignment}
            later={laterAssignments}
            anySubmitted={firstSubmissionDone}
          />
        ))}

      <CelebrationDialog
        open={showWelcome}
        onOpenChange={(open) => !open && dismissWelcome()}
        eyebrow="You’re in"
        title={`Welcome to ${courseName || "your class"}`}
        body={
          <>
            {teacherName ? `${teacherName} is your teacher. ` : ""}
            {nextAssignment
              ? `Your first assignment, ${nextAssignment.title}, is on Home under Next up. You can save a draft and come back to it.`
              : "Nothing is assigned yet. When your teacher posts work, it shows up on Home under Next up."}
          </>
        }
        action={nextAssignment ? "Show me" : "Got it"}
      />

      <ConfirmDialog
        open={showLeaveConfirm}
        onOpenChange={setShowLeaveConfirm}
        title="Leave Class"
        description="Are you sure you want to leave this class? You will no longer be able to access assignments or resources from this instructor."
        onConfirm={handleLeaveClass}
        confirmText="Leave Class"
        cancelText="Stay"
      />

      {/* Completion and scores come from class assignments, so they mean nothing without a class. */}
      {courseId && (
        <StudentProgressChart
          totalAssignments={stats.totalAssignments}
          completedAssignments={stats.completedAssignments}
          pendingAssignments={stats.pendingAssignments}
          scores={recentScores}
        />
      )}

      <section aria-labelledby="study-heading" className="space-y-3 pt-1">
        <h2 id="study-heading" className="text-sm font-semibold tracking-tight text-foreground">
          Study
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Link
            href="/student/study"
            className="group rounded-xl border border-border/80 bg-card p-4 transition-all hover:border-primary/50 hover:bg-muted/20"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                Study
              </span>
              <ClickIcon
                icon={AnimatedArrowRight}
                className="size-3.5 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Lessons and practice for every topic
            </p>
          </Link>

          <Link
            href="/student/notebook"
            className="group rounded-xl border border-border/80 bg-card p-4 transition-all hover:border-primary/50 hover:bg-muted/20"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                Notebook
              </span>
              <ClickIcon
                icon={AnimatedArrowRight}
                className="size-3.5 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Derivations & Markdown notes</p>
          </Link>

          <Link
            href="/student/vault"
            className="group rounded-xl border border-border/80 bg-card p-4 transition-all hover:border-primary/50 hover:bg-muted/20"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                Formula vault
              </span>
              <ClickIcon
                icon={AnimatedArrowRight}
                className="size-3.5 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Physics formulas & constants</p>
          </Link>

          <Link
            href={aiOn ? "/student/tutor" : "/student/resources"}
            className="group rounded-xl border border-border/80 bg-card p-4 transition-all hover:border-primary/50 hover:bg-muted/20"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                {aiOn ? "Raise" : "Resources"}
              </span>
              <ClickIcon
                icon={AnimatedArrowRight}
                className="size-3.5 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {aiOn ? "Optional hints when you’re stuck" : "Files your teacher shared"}
            </p>
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
  if (days < 0)
    return { text: days === -1 ? "1 day overdue" : `${-days} days overdue`, overdue: true };
  if (days === 0) return { text: "Due today", overdue: false };
  if (days === 1) return { text: "Due tomorrow", overdue: false };
  if (days <= 7) return { text: `Due in ${days} days`, overdue: false };
  return {
    text: `Due ${due.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
    overdue: false,
  };
}

/**
 * A course set's title without the course name ("AP Physics 1 · Unit 1B · Representing motion"
 * -> "Unit 1B · Representing motion"), for the narrow list beside Next up.
 */
function shortTitle(title: string): string {
  const parts = title.split(" · ");
  return parts.length >= 3 ? parts.slice(1).join(" · ") : title;
}

function alreadyWelcomed(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

/** The one thing to do now: the most urgent open assignment, or a note that nothing is open. */
function NextUpCard({
  assignment,
  later,
  anySubmitted,
}: {
  assignment: RecentAssignment | null;
  later: RecentAssignment[];
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
  const dueMs = dateMs(assignment.dueDate, NaN);
  return (
    // The assignment to do now on the left, the next few on the right, so the card is full width
    // with something worth reading in it rather than a title over empty space.
    <Card className="h-full gap-0 py-0 shadow-none overflow-hidden">
      <div className="grid h-full md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col gap-3 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Next up
          </p>
          <div className="min-w-0 space-y-1.5">
            <h2 className="break-words text-lg font-semibold tracking-tight">{assignment.title}</h2>
            {assignment.description && (
              <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                {assignment.description}
              </p>
            )}
          </div>
          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className={pillClass(due.overdue ? "alert" : "accent")}>{due.text}</span>
              {!Number.isNaN(dueMs) && (
                <span>
                  {new Date(dueMs).toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              )}
              {assignment.questionCount > 0 && (
                <span>
                  · {assignment.questionCount}{" "}
                  {assignment.questionCount === 1 ? "question" : "questions"}
                </span>
              )}
            </div>
            <Button asChild>
              <Link
                href={`/student/assignment-view?id=${encodeURIComponent(assignment.id)}${anySubmitted ? "" : "&first=1"}`}
              >
                {anySubmitted ? "Start" : "Start your first assignment"}
                <ClickIcon icon={AnimatedArrowRight} className="size-4" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="flex min-w-0 flex-col border-t border-border bg-muted/20 md:border-l md:border-t-0">
          <div className="flex items-center justify-between gap-2 px-5 pt-4 pb-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              After that
            </p>
            <Link
              href="/student/assignments"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              All <ClickIcon icon={AnimatedArrowRight} className="size-3.5" aria-hidden />
            </Link>
          </div>
          {later.length > 0 ? (
            <ul className="flex-1 pb-2">
              {later.map((a) => {
                const d = dueText(a.dueDate);
                return (
                  <li key={a.id}>
                    <Link
                      href={`/student/assignment-view?id=${encodeURIComponent(a.id)}`}
                      className="group flex items-center justify-between gap-3 px-5 py-2 transition-colors hover:bg-muted/40"
                    >
                      <span
                        title={a.title}
                        className="min-w-0 truncate text-sm group-hover:text-primary"
                      >
                        {shortTitle(a.title)}
                      </span>
                      <span
                        className={`shrink-0 text-xs tabular-nums ${d.overdue ? "text-destructive" : "text-muted-foreground"}`}
                      >
                        {d.text}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-5 pb-4 text-sm text-muted-foreground">
              Nothing else is open after this one.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
