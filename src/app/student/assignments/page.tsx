"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, getDocs, query, where, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/auth-context";
import { JoinClassPrompt } from "@/components/student/join-class-form";
import { WorkspaceHeader } from "@/components/ui/workspace";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { ClickIcon } from "@/components/ui/click-icon";
import { ChevronDownIcon as AnimatedChevronDown } from "@animateicons/react/lucide/chevron-down-icon";
import { groupByUnit, sortByDueThenCourse } from "@/lib/student-grouping";
import { TONE, pillClass, type Tone } from "@/components/student/tones";
import { normalisePlan } from "@/lib/curriculum-plan";
import { getCurriculum } from "@/data/curricula";
import type { ApCourseId } from "@/data/ap";

/** A stored due date (Timestamp, ISO string or epoch ms) as a Date, or null when there is none. */
function toDueDate(v: unknown): Date | null {
  if (!v) return null;
  const d =
    typeof (v as { toDate?: unknown }).toDate === "function"
      ? (v as { toDate: () => Date }).toDate()
      : new Date(v as string | number);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Sort key that puts assignments with no due date last in either direction. */
const dueTime = (d: Date | null, dir: 1 | -1) => (d ? d.getTime() : dir * Number.MAX_SAFE_INTEGER);

interface Assignment {
  id: string;
  title: string;
  description: string;
  /** null when the teacher set no due date (shown as "No due date", never past due). */
  dueDate: Date | null;
  questions?: unknown[];
  courseId: string;
  teacherId: string;
  curriculumSetKey?: string;
  curriculumSequence?: number;
}

export default function StudentAssignmentsPage() {
  const { user, profile } = useAuth();
  // Set by the lookup below, which also checks the older students/{uid} enrollment record.
  const [notInClass, setNotInClass] = useState(false);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  // Set when the student's class follows a course roadmap; then assignments are grouped by unit.
  const [followsCourse, setFollowsCourse] = useState(false);
  // The class's own order of sets, when its teacher changed it.
  const [setOrder, setSetOrder] = useState<string[] | undefined>(undefined);
  const [apCourse, setApCourse] = useState<ApCourseId | undefined>(undefined);
  /** The course the class follows now; sets from a course it followed before are not on its roadmap. */
  const [classCurriculum, setClassCurriculum] = useState<string | undefined>(undefined);
  // "todo" (the default): what is still to hand in, by due date then course order, with handed-in
  // work behind a button. "all": every assignment with the status filter and, for a class on a
  // course roadmap, grouped by unit.
  const [view, setView] = useState<"todo" | "all">("todo");
  const [showSubmitted, setShowSubmitted] = useState(false);
  // When the page opened, for "due this week" (render must not read the clock).
  const [openedAt] = useState(() => Date.now());
  const [filter, setFilter] = useState<string>("all");
  const [sort, setSort] = useState<string>("dueDateAsc");

  useEffect(() => {
    async function fetchData() {
      if (!user) return;
      try {
        // Source of truth: Use unified profile if available, otherwise fallback to legacy students collection
        let teacherId = profile?.teacherId;
        let courseId = profile?.courseId;

        if (!courseId || !teacherId) {
          try {
            const studentDoc = await getDoc(doc(db, "students", user.uid));
            if (studentDoc.exists()) {
              const studentData = studentDoc.data();
              teacherId = teacherId || studentData.teacherId;
              courseId = courseId || studentData.courseId;
            }
          } catch (e) {
            console.error("Could not fetch legacy student profile", e);
          }
        }
        setNotInClass(!teacherId && !courseId);

        let data: Assignment[] = [];
        if (courseId) {
          try {
            const classDoc = await getDoc(doc(db, "courses", courseId));
            const curriculumId = classDoc.data()?.curriculumId;
            setFollowsCourse(typeof curriculumId === "string");
            setApCourse(getCurriculum(curriculumId)?.apCourse);
            setClassCurriculum(getCurriculum(curriculumId)?.id);
            // The class's order of sets (the course's own order when the teacher kept it).
            setSetOrder(
              getCurriculum(curriculumId)
                ? normalisePlan(curriculumId, classDoc.data()?.curriculumPlan).order
                : undefined,
            );
          } catch {
            setFollowsCourse(false);
          }
          // New system: filter by specific course
          const assignmentsSnap = await getDocs(
            query(
              collection(db, "assignments"),
              where("answerKeySeparated", "==", true),
              where("courseId", "==", courseId),
            ),
          );
          // Archived assignments are hidden from students (the teacher can restore them).
          data = assignmentsSnap.docs
            .filter((doc) => doc.data().archivedAt == null)
            .map((doc) => ({
              id: doc.id,
              ...doc.data(),
              dueDate: toDueDate(doc.data().dueDate),
            })) as Assignment[];
        } else if (teacherId) {
          // Fallback for legacy connections
          const assignmentsSnap = await getDocs(
            query(
              collection(db, "assignments"),
              where("answerKeySeparated", "==", true),
              where("teacherId", "==", teacherId),
              where("courseId", "==", null),
            ),
          );
          // Archived assignments are hidden from students (the teacher can restore them).
          data = assignmentsSnap.docs
            .filter((doc) => doc.data().archivedAt == null)
            .map((doc) => ({
              id: doc.id,
              ...doc.data(),
              dueDate: toDueDate(doc.data().dueDate),
            })) as Assignment[];
        }
        setAssignments(data);

        const submissionsSnap = await getDocs(
          query(collection(db, "submissions"), where("studentId", "==", user.uid)),
        );
        const submittedIds = new Set(
          submissionsSnap.docs
            .filter((doc) => doc.data().status !== "draft")
            .map((doc) => doc.data().assignmentId),
        );
        setSubmissions(submittedIds);
      } catch (error) {
        console.error("Error fetching assignments:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [user, profile]);

  const isPastDue = (date: Date | null) => !!date && new Date(date) < new Date();

  function formatDueDate(dueDate: Date | null | undefined, isSubmitted: boolean) {
    if (!dueDate || isNaN(new Date(dueDate).getTime())) {
      return {
        formattedDate: "No due date",
        relativeText: isSubmitted ? "Submitted" : "Open",
        urgency: "normal" as const,
        tone: "quiet" as Tone,
      };
    }

    const now = new Date();
    const due = new Date(dueDate);

    // Strip time for day comparison
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
    const diffDays = Math.round((dueDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    const formattedDate = due.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: due.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });

    let relativeText = "";
    let urgency: "normal" | "urgent" | "past" | "submitted" = "normal";

    if (isSubmitted) {
      relativeText = "Submitted";
      urgency = "submitted";
    } else if (diffDays < 0) {
      const daysAgo = Math.abs(diffDays);
      relativeText = daysAgo === 1 ? "1 day overdue" : `${daysAgo} days overdue`;
      urgency = "past";
    } else if (diffDays === 0) {
      relativeText = "Due today";
      urgency = "urgent";
    } else if (diffDays === 1) {
      relativeText = "Due tomorrow";
      urgency = "urgent";
    } else if (diffDays <= 7) {
      relativeText = `In ${diffDays} days`;
      urgency = "normal";
    } else {
      relativeText = `${Math.ceil(diffDays / 7)} weeks left`;
      urgency = "normal";
    }

    // Overdue in the destructive colour, due within a week in the brand colour, the rest quiet.
    const tone: Tone =
      urgency === "past" ? "alert" : urgency !== "submitted" && diffDays <= 7 ? "accent" : "quiet";
    return { formattedDate, relativeText, urgency, tone };
  }

  // Filtering
  let filteredAssignments = assignments.filter((assignment) => {
    const isSubmitted = submissions.has(assignment.id);
    const pastDue = isPastDue(assignment.dueDate);
    if (filter === "submitted") return isSubmitted;
    if (filter === "pending") return !isSubmitted && !pastDue;
    if (filter === "pastDue") return !isSubmitted && pastDue;
    return true;
  });

  const counts = {
    all: assignments.length,
    pending: assignments.filter((a) => !submissions.has(a.id) && !isPastDue(a.dueDate)).length,
    submitted: assignments.filter((a) => submissions.has(a.id)).length,
    pastDue: assignments.filter((a) => !submissions.has(a.id) && isPastDue(a.dueDate)).length,
  };

  const toDo = sortByDueThenCourse(
    assignments.filter((a) => !submissions.has(a.id)),
    setOrder,
  );
  const handedIn = sortByDueThenCourse(
    assignments.filter((a) => submissions.has(a.id)),
    setOrder,
    -1,
  );

  const weekAhead = openedAt + 7 * 86_400_000;
  const dueBuckets = {
    overdue: toDo.filter((a) => isPastDue(a.dueDate)).length,
    week: toDo.filter(
      (a) => a.dueDate && !isPastDue(a.dueDate) && new Date(a.dueDate).getTime() <= weekAhead,
    ).length,
    later: toDo.filter((a) => !a.dueDate || new Date(a.dueDate).getTime() > weekAhead).length,
  };

  // Sorting
  filteredAssignments = filteredAssignments.sort((a, b) => {
    if (sort === "dueDateAsc") {
      return dueTime(a.dueDate, 1) - dueTime(b.dueDate, 1);
    } else if (sort === "dueDateDesc") {
      return dueTime(b.dueDate, -1) - dueTime(a.dueDate, -1);
    } else if (sort === "titleAsc") {
      return a.title.localeCompare(b.title);
    } else if (sort === "titleDesc") {
      return b.title.localeCompare(a.title);
    }
    return 0;
  });

  const renderItem = (assignment: Assignment) => {
    const isSubmitted = submissions.has(assignment.id);
    const dateInfo = formatDueDate(assignment.dueDate, isSubmitted);

    return (
      <li
        key={assignment.id}
        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-l-4 px-5 py-4 transition-colors hover:bg-muted/20 ${TONE[dateInfo.tone].bar}`}
      >
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="break-words text-sm font-semibold text-foreground">
              {assignment.title}
            </h2>
            {isSubmitted && <span className={pillClass("quiet")}>Submitted</span>}
          </div>
          {assignment.description && (
            <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {assignment.description}
            </p>
          )}
          <p className="text-xs text-muted-foreground/80">
            {assignment.questions?.length || 0}{" "}
            {assignment.questions?.length === 1 ? "question" : "questions"}
          </p>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-5 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-border/60">
          <div className="text-left sm:text-right space-y-0.5 min-w-[110px]">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Due Date
            </p>
            <p className="text-sm font-semibold tabular-nums text-foreground">
              {dateInfo.formattedDate}
            </p>
            <p className={`${pillClass(dateInfo.tone)} tabular-nums`}>{dateInfo.relativeText}</p>
          </div>

          <Button
            asChild
            size="sm"
            variant={isSubmitted ? "outline" : "default"}
            className="shrink-0 h-9 px-4 text-xs font-medium"
          >
            <Link
              href={`/student/assignment-view?id=${assignment.id}`}
              aria-label={`${isSubmitted ? "View" : "Start"} ${assignment.title}`}
            >
              {isSubmitted ? "View" : "Start"}
            </Link>
          </Button>
        </div>
      </li>
    );
  };

  const groups = followsCourse
    ? groupByUnit(filteredAssignments, setOrder, apCourse, classCurriculum)
    : null;

  return (
    <div className="space-y-6">
      <WorkspaceHeader title="Assignments" description="Open coursework and check what’s due." />
      <div
        role="tablist"
        aria-label="Assignments view"
        className="inline-flex rounded-lg border border-border bg-muted/40 p-1"
      >
        {(
          [
            ["todo", `To do${loading ? "" : ` (${toDo.length})`}`],
            ["all", "All coursework"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            onClick={() => setView(id)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              view === id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "todo" ? (
        <div className="space-y-4">
          {!loading && toDo.length > 0 && (
            <div className="grid grid-cols-3 gap-3" aria-label="What is left">
              {(
                [
                  ["alert", "Overdue", dueBuckets.overdue],
                  ["accent", "Due this week", dueBuckets.week],
                  ["quiet", "Later", dueBuckets.later],
                ] as const
              ).map(([tone, label, n]) => (
                <div key={label} className="rounded-xl border border-border bg-card p-3 sm:p-4">
                  <p className="text-xs font-medium text-muted-foreground">{label}</p>
                  <p
                    className={`text-2xl font-semibold tabular-nums ${n > 0 && tone !== "quiet" ? TONE[tone].text : "text-foreground"}`}
                  >
                    {n}
                  </p>
                </div>
              ))}
            </div>
          )}
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border/80 bg-muted/40 px-5 py-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                To do ({toDo.length})
              </span>
              <span className="text-xs text-muted-foreground">
                {followsCourse ? "By due date, then course order" : "Earliest due first"}
              </span>
            </div>
            {loading ? (
              <p role="status" className="p-6 text-sm text-muted-foreground">
                Loading assignments…
              </p>
            ) : notInClass ? (
              <JoinClassPrompt what="your assignments" />
            ) : toDo.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                {assignments.length === 0
                  ? "No coursework assigned yet."
                  : "You’re all caught up. Nothing is left to hand in."}
              </p>
            ) : (
              <ul className="divide-y divide-border">{toDo.map(renderItem)}</ul>
            )}
          </div>

          {!loading && handedIn.length > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                aria-expanded={showSubmitted}
                aria-controls="past-submissions"
                onClick={() => setShowSubmitted((v) => !v)}
              >
                {showSubmitted
                  ? "Hide past submissions"
                  : `Show past submissions (${handedIn.length})`}
                <ClickIcon
                  icon={AnimatedChevronDown}
                  className={`ml-1.5 size-3.5 opacity-60 transition-transform ${showSubmitted ? "rotate-180" : ""}`}
                />
              </Button>
              {showSubmitted && (
                <div
                  id="past-submissions"
                  className="overflow-hidden rounded-xl border border-border bg-card"
                >
                  <div className="flex items-center justify-between border-b border-border/80 bg-muted/40 px-5 py-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Past submissions ({handedIn.length})
                    </span>
                    <span className="text-xs text-muted-foreground">Latest due first</span>
                  </div>
                  <ul className="divide-y divide-border">{handedIn.map(renderItem)}</ul>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 items-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9">
                  Status:{" "}
                  {(() => {
                    if (filter === "all") return `All (${counts.all})`;
                    if (filter === "submitted") return `Submitted (${counts.submitted})`;
                    if (filter === "pending") return `Pending (${counts.pending})`;
                    if (filter === "pastDue") return `Past Due (${counts.pastDue})`;
                    return "All";
                  })()}{" "}
                  <ClickIcon icon={AnimatedChevronDown} className="w-3.5 h-3.5 ml-1.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onSelect={() => setFilter("all")}>
                  All ({counts.all})
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setFilter("pending")}>
                  Pending ({counts.pending})
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setFilter("submitted")}>
                  Submitted ({counts.submitted})
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setFilter("pastDue")}>
                  Past Due ({counts.pastDue})
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {!followsCourse && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9">
                    Sort by:{" "}
                    {(() => {
                      if (sort === "dueDateAsc") return "Due Date (Earliest)";
                      if (sort === "dueDateDesc") return "Due Date (Latest)";
                      if (sort === "titleAsc") return "Title (A–Z)";
                      if (sort === "titleDesc") return "Title (Z–A)";
                      return "Due Date (Earliest)";
                    })()}{" "}
                    <ClickIcon
                      icon={AnimatedChevronDown}
                      className="w-3.5 h-3.5 ml-1.5 opacity-60"
                    />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onSelect={() => setSort("dueDateAsc")}>
                    Due Date (Earliest)
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setSort("dueDateDesc")}>
                    Due Date (Latest)
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setSort("titleAsc")}>
                    Title (A–Z)
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setSort("titleDesc")}>
                    Title (Z–A)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border/80 bg-muted/40 px-5 py-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Coursework ({filteredAssignments.length})
              </span>
              <span className="text-xs text-muted-foreground">
                {followsCourse
                  ? "By unit, in course order"
                  : sort === "dueDateAsc"
                    ? "Earliest due first"
                    : sort === "dueDateDesc"
                      ? "Latest due first"
                      : sort === "titleAsc"
                        ? "Alphabetical (A–Z)"
                        : "Alphabetical (Z–A)"}
              </span>
            </div>

            {loading ? (
              <p role="status" className="p-6 text-sm text-muted-foreground">
                Loading assignments…
              </p>
            ) : filteredAssignments.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">No assignments match this view.</p>
            ) : groups ? (
              <div>
                {groups.map((group) => (
                  <section key={group.id} aria-labelledby={`group-${group.id}`}>
                    <h2
                      id={`group-${group.id}`}
                      className="border-b border-border/80 bg-muted/20 px-5 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      {group.label}
                    </h2>
                    <ul className="divide-y divide-border border-b border-border last:border-b-0">
                      {group.items.map(renderItem)}
                    </ul>
                  </section>
                ))}
              </div>
            ) : (
              <ul className="divide-y divide-border">{filteredAssignments.map(renderItem)}</ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
