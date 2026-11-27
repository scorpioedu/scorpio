"use client";

import { useEffect, useState } from "react";
import {
  collection,
  getCountFromServer,
  getDocs,
  query,
  where,
  limit,
  startAfter,
  doc,
  getDoc,
  type Query,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db, updateUserProfile } from "@/lib/firebase";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { PlusCircle, Upload, PackageCheck, ShieldCheck } from "lucide-react";
import { ClickIcon } from "@/components/ui/click-icon";
import { ArrowRightIcon as AnimatedArrowRight } from "@animateicons/react/lucide/arrow-right-icon";
import { CirclePlusIcon as AnimatedCirclePlus } from "@animateicons/react/lucide/circle-plus-icon";
import { PackageCheckIcon as AnimatedPackageCheck } from "@animateicons/react/lucide/package-check-icon";
import { UploadIcon as AnimatedUpload } from "@animateicons/react/lucide/upload-icon";
import Link from "next/link";
import { NAV_ICONS } from "@/components/nav-icons";
import { useRouter } from "next/navigation";
import { isCurrentAssignment, timeOf } from "@/lib/assignment-listing";
import { WELCOME_SKIPPED_KEY } from "@/lib/first-run";
import { RundownDialog } from "@/components/ui/rundown-dialog";
import {
  SetupChecklist,
  setupSteps,
  type SetupProgress,
} from "@/components/teacher/setup-checklist";
import { TeacherPageHeader } from "@/components/teacher/workspace";
import { InviteColleagueCard } from "@/components/teacher/invite-colleague-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  chunk,
  summarizeSubmissionCounts,
  unionCount,
  type SubmissionCountParts,
} from "@/lib/count-math";
import {
  TeacherDashboardContent,
  type TeacherDashboardStats,
} from "@/components/teacher/dashboard-content";
import {
  copyClassInvite,
  useClassManager,
  type TeacherClass,
} from "@/components/teacher/class-manager";

interface Submission {
  id: string;
  graded?: boolean;
  status?: string;
  studentName?: string;
  assignmentId?: string;
  assignmentTitle?: string;
}

type PendingSubmission = Submission & { assignmentTitle: string };

type Course = TeacherClass;

interface RecentAssignment {
  id: string;
  title?: string;
  dueDate?: string | number | Date | { seconds: number };
}

const emptySnapshot = { docs: [], size: 0 };

// firestore.rules (RT-14) authorises submission reads with ownsAssignment(resource.data.assignmentId), which
// Firestore can only evaluate for queries constrained to ONE assignment: an `in` over several ids is denied
// (verified on the emulator). So submissions are counted per assignment, not per 30-id chunk. Raise this
// only after the rules allow multi-assignment queries (e.g. a teacherId on submissions).
const SUBMISSION_QUERY_CHUNK = 1;

const zeroParts: SubmissionCountParts = { total: 0, drafts: 0, graded: 0, gradedDrafts: 0 };

async function countOf(q: Query): Promise<number> {
  return (await getCountFromServer(q)).data().count;
}

/** Aggregate counts for one `assignmentId in [...]` chunk (equality filters only, so no composite index). */
async function countSubmissionParts(assignmentIds: string[]): Promise<SubmissionCountParts> {
  const inChunk = where("assignmentId", "in", assignmentIds);
  const submissions = collection(db, "submissions");
  const [total, drafts, graded, gradedDrafts] = await Promise.all([
    countOf(query(submissions, inChunk)),
    countOf(query(submissions, inChunk, where("status", "==", "draft"))),
    countOf(query(submissions, inChunk, where("graded", "==", true))),
    countOf(
      query(submissions, inChunk, where("graded", "==", true), where("status", "==", "draft")),
    ),
  ]);
  return { total, drafts, graded, gradedDrafts };
}

/** First `wanted` submitted (non-draft) ungraded submissions, reading only what is needed. */
async function firstPendingSubmissions(chunks: string[][], wanted: number): Promise<Submission[]> {
  const found: Submission[] = [];
  const pageSize = 10;
  for (const ids of chunks) {
    let cursor: QueryDocumentSnapshot | undefined;
    while (found.length < wanted) {
      const base = [
        collection(db, "submissions"),
        where("assignmentId", "in", ids),
        where("graded", "==", false),
      ] as const;
      const snap = await getDocs(
        cursor
          ? query(...base, startAfter(cursor), limit(pageSize))
          : query(...base, limit(pageSize)),
      ).catch(() => emptySnapshot);
      for (const d of snap.docs) {
        const sub = { id: d.id, ...d.data() } as Submission;
        if (sub.status !== "draft" && found.length < wanted) found.push(sub);
      }
      if (snap.docs.length < pageSize) break;
      cursor = snap.docs[snap.docs.length - 1] as QueryDocumentSnapshot;
    }
    if (found.length >= wanted) break;
  }
  return found;
}

/**
 * Distinct students linked to this teacher directly or through one of their classes, via inclusion-exclusion
 * on count queries: |A| + |B| - |A and B|. Falls back to reading the documents if counting is unavailable.
 */
async function countMyStudents(teacherId: string, courseIds: string[]): Promise<number> {
  const users = collection(db, "users");
  const student = where("role", "==", "student");
  const byTeacher = query(users, where("teacherId", "==", teacherId), student);
  // Per class, not `in`: the users rule looks up each class (ownsCourse), and an `in` over more than
  // 10 classes is refused. A student has one courseId, so per-class counts add up exactly.
  const sum = (ns: number[]) => ns.reduce((n, x) => n + x, 0);
  try {
    if (courseIds.length === 0) return await countOf(byTeacher);
    const [a, b, both] = await Promise.all([
      countOf(byTeacher),
      Promise.all(
        courseIds.map((c) => countOf(query(users, where("courseId", "==", c), student))),
      ).then(sum),
      Promise.all(
        courseIds.map((c) =>
          countOf(
            query(users, where("teacherId", "==", teacherId), where("courseId", "==", c), student),
          ),
        ),
      ).then(sum),
    ]);
    return unionCount(a, b, both);
  } catch {
    const [unifiedSnap, ...byCourse] = await Promise.all([
      getDocs(byTeacher).catch(() => emptySnapshot),
      ...courseIds.map((c) =>
        getDocs(query(users, where("courseId", "==", c), student)).catch(() => emptySnapshot),
      ),
    ]);
    return new Set([...unifiedSnap.docs, ...byCourse.flatMap((snap) => snap.docs)].map((d) => d.id))
      .size;
  }
}

function assignmentDueLabel(dueDate: RecentAssignment["dueDate"]) {
  if (!dueDate) return "No due date";

  const date =
    typeof dueDate === "object" && "seconds" in dueDate
      ? new Date(dueDate.seconds * 1000)
      : new Date(dueDate);
  return `Due ${date.toLocaleDateString()}`;
}

export default function TeacherDashboard({ onLoaded }: { onLoaded?: () => void }) {
  const { user, profile } = useAuth();
  const router = useRouter();
  const networkId = profile?.organizationId;
  const [network, setNetwork] = useState<{ id: string; name: string } | null>(null);
  const [networkError, setNetworkError] = useState(false);
  const [setupError, setSetupError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [classAssignmentIds, setClassAssignmentIds] = useState<string[]>([]);
  const [stats, setStats] = useState<TeacherDashboardStats>({
    totalAssignments: 0,
    totalStudents: 0,
    completedSubmissions: 0,
    pendingSubmissions: 0,
  });
  const [recentAssignments, setRecentAssignments] = useState<RecentAssignment[]>([]);
  const [pendingGrading, setPendingGrading] = useState<PendingSubmission[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [dataReady, setDataReady] = useState(false);
  const [setupOverride, setSetupOverride] = useState<"started" | "done" | null>(null);
  const classManager = useClassManager({
    classes: courses,
    setClasses: setCourses,
    canCreate: !!networkId && dataReady && !setupError,
  });

  useEffect(() => {
    if (dataReady && onLoaded) {
      onLoaded();
    }
  }, [dataReady, onLoaded]);

  useEffect(() => {
    if (!networkId) return;
    let active = true;
    getDoc(doc(db, "organizations", networkId))
      .then((snapshot) => {
        if (!snapshot.exists()) throw new Error("Network unavailable");
        if (active) setNetwork({ id: networkId, name: snapshot.data().name || "Your Network" });
      })
      .catch(() => {
        if (active) setNetworkError(true);
      });
    return () => {
      active = false;
    };
  }, [networkId, retry]);

  useEffect(() => {
    let active = true;
    async function fetchStats() {
      if (!user) return;
      try {
        const [courseSnapshot, assignmentsSnap] = await Promise.all([
          getDocs(query(collection(db, "courses"), where("teacherId", "==", user.uid))),
          getDocs(query(collection(db, "assignments"), where("teacherId", "==", user.uid))),
        ]);
        if (!active) return;

        const courseDocs = courseSnapshot.docs;
        setCourses(courseDocs.map((doc) => ({ id: doc.id, ...doc.data() }) as Course));
        setClassAssignmentIds(
          assignmentsSnap.docs.map((doc) => doc.data().courseId).filter(Boolean),
        );

        const myCourseIdsArr = courseDocs.slice(0, 30).map((doc) => doc.id);
        // RT-29 / I-012: totals come from aggregate count queries (1 billed read per 1000 index entries)
        // instead of downloading every student and submission document.
        const totalStudents = await countMyStudents(user.uid, myCourseIdsArr);
        if (!active) return;

        // Submissions can't be queried by teacher, so count per chunk of the teacher's assignments.
        const myAssignmentIdsArr = assignmentsSnap.docs.map((d) => d.id);
        const subChunks = chunk(myAssignmentIdsArr, SUBMISSION_QUERY_CHUNK);
        const countParts = await Promise.all(
          subChunks.map((ids) => countSubmissionParts(ids).catch(() => zeroParts)),
        );
        // Only look inside chunks the counts say contain something waiting to be graded.
        const chunksWithPending = subChunks.filter(
          (_, i) => summarizeSubmissionCounts([countParts[i]]).pendingSubmissions > 0,
        );
        const pendingSubmissionDocs = await firstPendingSubmissions(chunksWithPending, 3);

        if (!active) return;
        // Same rule as My Assignments: no archived assignments, none in archived classes, and not the
        // published course library.
        const archivedClassIds = new Set(
          courseDocs.filter((d) => d.data().archivedAt).map((d) => d.id),
        );
        const current = assignmentsSnap.docs.filter((d) =>
          isCurrentAssignment(d.data(), archivedClassIds),
        );
        setStats({
          totalAssignments: current.length,
          totalStudents,
          ...summarizeSubmissionCounts(countParts),
        });

        // Recent assignments: the three newest current ones (already loaded above).
        setRecentAssignments(
          [...current]
            .sort((a, b) => timeOf(b.data().createdAt) - timeOf(a.data().createdAt))
            .slice(0, 3)
            .map((doc) => ({ id: doc.id, ...doc.data() }) as RecentAssignment),
        );

        // Pending grading (ungraded submissions from MY assignments)
        const pendingSubs = pendingSubmissionDocs;

        // Get assignment titles
        const assignmentsMap = new Map(assignmentsSnap.docs.map((doc) => [doc.id, doc.data()]));

        // Only include pending submissions whose assignmentId exists in assignmentsMap
        const pendingWithDetails = pendingSubs
          .map((sub) => {
            const assignmentId = sub.assignmentId;
            if (!assignmentId) return null;

            const assignment = assignmentsMap.get(assignmentId);
            if (!assignment) return null;

            return {
              ...sub,
              assignmentTitle: assignment.title || "Untitled",
            } satisfies PendingSubmission;
          })
          .filter((sub): sub is PendingSubmission => sub !== null);

        setPendingGrading(pendingWithDetails);
      } catch (error) {
        console.error("Error fetching stats:", error);
        if (active) setSetupError(true);
      } finally {
        if (active) setDataReady(true);
      }
    }

    fetchStats();
    return () => {
      active = false;
    };
  }, [user, retry]);

  // A teacher with no classes goes to the guided first-run page (unless they skipped it before).
  useEffect(() => {
    if (!dataReady || setupError || !networkId || !profile || courses.length > 0) return;
    let skipped = profile.preferences?.welcomeSkipped === true;
    try {
      skipped ||= localStorage.getItem(WELCOME_SKIPPED_KEY) === "1";
    } catch {
      /* storage unavailable */
    }
    if (!skipped) router.replace("/teacher/welcome");
  }, [dataReady, setupError, networkId, profile, courses.length, router]);

  function retrySetup() {
    setNetworkError(false);
    setSetupError(false);
    setDataReady(false);
    setRetry((value) => value + 1);
  }

  const firstClass = courses[0];
  const hasClassAssignment = courses.some((course) => classAssignmentIds.includes(course.id));
  const networkName = network?.id === networkId ? network?.name : null;

  // The setup card stays until students have turned work in. A teacher who was already past that
  // before the card existed never sees it; one who watched it fill in gets the finished state once.
  const setupProgress: SetupProgress = {
    hasClass: courses.length > 0,
    hasAssignment: hasClassAssignment,
    students: stats.totalStudents,
    submissions: stats.completedSubmissions + stats.pendingSubmissions,
  };
  const setupState = setupOverride ?? profile?.preferences?.setupChecklist;
  const setupUnfinished = setupSteps(setupProgress).next !== null;
  const showSetup = setupUnfinished || setupState === "started";

  // Remember that this teacher saw the card unfinished, so they get its finished state later.
  const uid = user?.uid;
  const preferences = profile?.preferences;
  const markStarted =
    dataReady && !setupError && !!networkId && !!profile && setupUnfinished && !setupState;
  useEffect(() => {
    if (!markStarted || !uid) return;
    updateUserProfile(uid, { preferences: { ...preferences, setupChecklist: "started" } }).catch(
      () => {},
    );
    // preferences is read once, when the flag flips; it must not re-run this write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markStarted, uid]);

  function saveSetupState(value: "started" | "done") {
    if (!user) return;
    setSetupOverride(value);
    updateUserProfile(user.uid, {
      preferences: { ...profile?.preferences, setupChecklist: value },
    }).catch(() => {
      /* The card still works; it just won't remember across devices. */
    });
  }

  return (
    <div className="space-y-6">
      <TeacherPageHeader
        title="Home"
        description={`Welcome, ${(profile?.displayName || user?.displayName || "").trim().split(/\s+/)[0] || "teacher"}.`}
      >
        <RundownDialog
          userRole="teacher"
          triggerLabel="Guide"
          title="Teacher guide"
          steps={[
            {
              title: "1. Home",
              description:
                "What needs you today: work waiting to be graded, recent assignments, your classes and their join codes, and the setup steps for a new term.",
              icon: NAV_ICONS.home,
            },
            {
              title: "2. Course",
              description:
                "The roadmap your class follows through the year, unit by unit. Assign a set, move due dates on the Calendar, skip or reorder sets, and see what students got wrong in each unit.",
              icon: NAV_ICONS.course,
            },
            {
              title: "3. Assignments",
              description:
                "Everything you have assigned, wherever it came from. The Library tab has ready-made Waypoint sets from Scorpio and your department that you can copy and edit.",
              icon: NAV_ICONS.assignments,
            },
            {
              title: "4. New assignment",
              description:
                "Build your own assignment: paste text or upload a file and Scorpio turns it into questions you can edit before assigning.",
              icon: PlusCircle,
            },
            {
              title: "5. Grading",
              description:
                "The Gradebook shows every student and assignment; open a submission to check the automatic grade, change it and leave feedback. Misconceptions ranks the wrong ideas showing up across your classes.",
              icon: NAV_ICONS.grading,
            },
            {
              title: "6. Classes",
              description:
                "Make classes, share join codes and invite links, change class settings, and manage each roster. Learning insights shows how students use Raise.",
              icon: NAV_ICONS.classes,
            },
            {
              title: "7. Formula vault",
              description:
                "Choose which equations students can see in each class, or add your own.",
              icon: PackageCheck,
            },
            {
              title: "8. Uploads",
              description: "Share PDFs, images and notes with a class.",
              icon: Upload,
            },
            {
              title: "9. Department",
              description: "Your department: colleagues, invites, Raise usage limits and billing.",
              icon: NAV_ICONS.department,
            },
            {
              title: "10. How Socratic AI Works",
              description:
                "Scorpio's AI acts as a 4-layer pedagogical guardrail. It assesses student input for logic, identifies the specific misconception, and provides a scaffolded hint rather than the answer. This ensures verifiable academic integrity at scale.",
              icon: ShieldCheck,
              isSpecial: true,
            },
          ]}
        />
        <Button asChild>
          <Link href="/teacher/create">
            <ClickIcon icon={AnimatedCirclePlus} />
            New assignment
          </Link>
        </Button>
      </TeacherPageHeader>

      {setupError || networkError ? (
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Couldn’t load your setup</CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={retrySetup}>
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : !profile || (networkId && (!networkName || !dataReady)) ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading your classroom setup…
        </p>
      ) : !networkId ? (
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Set up your Network</CardTitle>
            <CardDescription>
              Create or join a Network to start teaching and share resources with colleagues.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/teacher/network">Set up your Network</Link>
            </Button>
          </CardContent>
        </Card>
      ) : showSetup ? (
        <SetupChecklist
          progress={setupProgress}
          className={firstClass?.name}
          classId={firstClass?.id}
          onCreateClass={classManager.openCreate}
          onCopyLink={() => firstClass && copyClassInvite(firstClass, true)}
          onCopyCode={() => firstClass && copyClassInvite(firstClass, false)}
          onDismiss={() => saveSetupState("done")}
        />
      ) : null}

      {networkId && profile && dataReady && !setupError ? <InviteColleagueCard /> : null}

      <TeacherDashboardContent
        stats={stats}
        aside={
          networkName ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3">
              <div className="min-w-0">
                <p className="break-words text-sm font-medium">{networkName}</p>
                <p className="text-sm text-muted-foreground">
                  Share teaching resources and collaborate with colleagues.
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href="/teacher/network">Open Department</Link>
              </Button>
            </div>
          ) : undefined
        }
        dataReady={dataReady}
        pending={{
          action: (
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="h-7 text-xs text-muted-foreground hover:text-foreground"
            >
              <Link href="/teacher/grades">
                Gradebook <ClickIcon icon={AnimatedArrowRight} className="size-3.5" />
              </Link>
            </Button>
          ),
          rows: pendingGrading.map((submission) => (
            <li
              key={submission.id}
              className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-muted/30 transition-colors"
            >
              <div className="min-w-0">
                <p className="break-words text-sm font-medium text-foreground">
                  {submission.assignmentTitle}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {submission.studentName || "Student submission"}
                </p>
              </div>
              <Button asChild size="sm" variant="outline" className="h-8 text-xs">
                <Link
                  href={`/teacher/submission/grade?id=${submission.id}`}
                  aria-label={`Grade ${submission.assignmentTitle}`}
                >
                  Grade <ClickIcon icon={AnimatedArrowRight} className="size-3.5" />
                </Link>
              </Button>
            </li>
          )),
        }}
        assignments={{
          action: (
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="h-7 text-xs text-muted-foreground hover:text-foreground"
            >
              <Link href="/teacher/assignments">
                All Assignments <ClickIcon icon={AnimatedArrowRight} className="size-3.5" />
              </Link>
            </Button>
          ),
          rows: recentAssignments.map((assignment) => (
            <li key={assignment.id}>
              <Link
                href={`/teacher/assignment-view?id=${assignment.id}`}
                className="group flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-muted/30 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              >
                <div className="min-w-0">
                  <span className="block break-words text-sm font-medium text-foreground transition-colors group-hover:text-primary">
                    {assignment.title || "Untitled"}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {assignmentDueLabel(assignment.dueDate)}
                  </span>
                </div>
                <ClickIcon
                  icon={AnimatedArrowRight}
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                />
              </Link>
            </li>
          )),
        }}
        classes={{
          action: (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                asChild
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
              >
                <Link href="/teacher/students">
                  Manage <ClickIcon icon={AnimatedArrowRight} className="size-3.5" />
                </Link>
              </Button>
              {classManager.createButton}
            </div>
          ),
          rows: classManager.rows,
        }}
      />

      <nav aria-label="Classroom tools" className="flex flex-wrap gap-2">
        <Button variant="outline" asChild>
          <Link href="/teacher/uploads">
            <ClickIcon icon={AnimatedUpload} /> Upload PDF
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/teacher/vault">
            <ClickIcon icon={AnimatedPackageCheck} /> Formula vault
          </Link>
        </Button>
      </nav>

      {classManager.dialogs}
    </div>
  );
}
