"use client";

import { useEffect, useState, useMemo } from "react";
import { collection, query, where, getDocs, getDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowUpRight, Award, CheckCircle2, ChevronDown, Clock, FileCheck2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { TONE, pillClass, scoreTone } from "@/components/student/tones";
import {
  assignmentIdsOf,
  buildSubmissionRows,
  loadAssignments,
  type AssignmentInfo,
  type RawSubmission,
} from "@/lib/student-submissions";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { WorkspaceHeader } from "@/components/ui/workspace";
import { MarkdownRenderer } from "@/components/markdown-renderer";

interface Submission {
  id: string;
  assignmentId: string;
  assignmentTitle: string;
  submittedAt: Date | null;
  score: number | null;
  graded: boolean;
  feedback?: string;
  answers?: GradedAnswer[];
  status?: string;
}

/** One graded answer as stored on a submission. */
interface GradedAnswer {
  questionId?: string;
  questionText: string;
  answer?: string;
  feedback?: string;
  score?: number;
}

/** How many recent scores the average card shows. */
const RECENT_SLOTS = 12;

const hasAnswers = (s: Submission) => s.graded && Array.isArray(s.answers) && s.answers.length > 0;

export default function StudentGradesPage() {
  const { user, profile } = useAuth();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  // Rows showing their problems. Until the student opens or closes one, the newest graded
  // submission with problems is open.
  const [openRows, setOpenRows] = useState<Set<string> | null>(null);

  useEffect(() => {
    async function fetchGrades() {
      if (!user) return;

      try {
        let studentTeacherId = profile?.teacherId;
        let studentCourseId = profile?.courseId;

        if (!studentTeacherId || !studentCourseId) {
          try {
            const studentDoc = await getDoc(doc(db, "students", user.uid));
            if (studentDoc.exists()) {
              const studentData = studentDoc.data();
              studentTeacherId = studentTeacherId || studentData.teacherId;
              studentCourseId = studentCourseId || studentData.courseId;
            }
          } catch (e) {
            console.error("Could not fetch legacy student profile", e);
          }
        }

        if (studentTeacherId && !studentCourseId) {
          const codeMatch = await getDocs(
            query(collection(db, "courses"), where("code", "==", studentTeacherId.trim())),
          );
          if (!codeMatch.empty) {
            const courseDoc = codeMatch.docs[0];
            const courseData = courseDoc.data();
            studentCourseId = courseDoc.id;
            studentTeacherId = courseData.teacherId;
          }
        }

        const q = query(collection(db, "submissions"), where("studentId", "==", user.uid));
        const snapshot = await getDocs(q);
        const raw: RawSubmission[] = snapshot.docs.map((d) => ({ id: d.id, data: d.data() }));

        // An assignment the student cannot read (rules deny legacy, deleted or other-class ones) is skipped on
        // its own; it used to reject the whole load and leave the page showing no grades at all.
        const assignments = await loadAssignments(
          assignmentIdsOf(raw),
          async (id) => {
            const assignmentDoc = await getDoc(doc(db, "assignments", id));
            return assignmentDoc.exists() ? (assignmentDoc.data() as AssignmentInfo) : null;
          },
          (id, e) => console.error("Could not read assignment", id, e),
        );
        const filteredSubmissions = buildSubmissionRows(raw, assignments, {
          courseId: studentCourseId,
          teacherId: studentTeacherId,
        }) as Submission[]; // newest first; answers are GradedAnswer[] for graded submissions

        setSubmissions(filteredSubmissions);
      } catch (error) {
        console.error("Error fetching grades:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchGrades();
  }, [user, profile]);

  const stats = useMemo(() => {
    const graded = submissions.filter((s) => s.graded && s.score !== null);
    const scores = graded.map((s) => s.score as number);
    const average = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const highest = scores.length > 0 ? Math.max(...scores) : 0;
    const total = submissions.length;
    const pending = submissions.filter((s) => !s.graded).length;

    // Oldest first, for the trend strip (the list itself is newest first).
    const recent = graded.slice(0, RECENT_SLOTS).reverse();
    return { average, highest, total, pending, hasScores: scores.length > 0, recent };
  }, [submissions]);

  if (loading) {
    return <LoadingSpinner fullPage />;
  }

  const newestWithProblems = submissions.find(hasAnswers)?.id;
  const shown = openRows ?? new Set(newestWithProblems ? [newestWithProblems] : []);
  const toggleRow = (id: string) => {
    const next = new Set(shown);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpenRows(next);
  };

  return (
    <div className="space-y-6">
      <WorkspaceHeader
        title="Grades"
        description="Everything you turned in, with your scores and your teacher’s feedback."
      />

      <section aria-label="Grade summary" className="grid gap-3 lg:grid-cols-[1.3fr_2fr]">
        {/* The average, large, with the recent scores as coloured bars. */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Your average
          </p>
          <p className="mt-1 text-5xl font-semibold tabular-nums tracking-tight">
            {stats.hasScores ? `${stats.average.toFixed(1)}%` : "—"}
          </p>
          {stats.recent.length > 0 ? (
            <div className="mt-5">
              {/* Twelve slots across the card; slots not filled yet are faint, so the strip
                  spans the card however few sets are graded. */}
              <div className="grid h-16 grid-cols-12 items-end gap-1.5" aria-hidden>
                {Array.from({ length: RECENT_SLOTS }, (_, i) => {
                  const s = stats.recent[i];
                  return s ? (
                    <div
                      key={s.id}
                      title={`${s.assignmentTitle}: ${s.score}%`}
                      className={`rounded-t-md ${TONE[scoreTone(s.score)].solid}`}
                      style={{ height: `${Math.max(8, s.score as number)}%` }}
                    />
                  ) : (
                    <div key={`empty-${i}`} className="h-1.5 rounded-full bg-muted" />
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Last {stats.recent.length} graded {stats.recent.length === 1 ? "set" : "sets"},
                oldest first
              </p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              Your average shows here once your teacher grades something.
            </p>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-3">
          <StatTile
            icon={Award}

            label="Highest score"
            value={stats.hasScores ? `${stats.highest}%` : "—"}
          />
          <StatTile icon={FileCheck2} label="Turned in" value={stats.total} />
          <StatTile icon={CheckCircle2} label="Graded" value={stats.total - stats.pending} />
          <StatTile icon={Clock} label="Awaiting grade" value={stats.pending} />
        </dl>
      </section>

      <section aria-labelledby="grade-history" className="space-y-3">
        <h2 id="grade-history" className="text-lg font-semibold">
          Turned in
        </h2>
        {submissions.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
            Work you turn in shows up here, with its score once your teacher grades it.
          </p>
        ) : (
          <ul className="overflow-hidden rounded-2xl border border-border bg-card divide-y divide-border">
            {submissions.map((submission) => {
              const scored = submission.graded && submission.score !== null;
              const tone = scored ? scoreTone(submission.score) : "quiet";
              const isOpen = shown.has(submission.id);
              return (
                <li key={submission.id}>
                  <div className="flex items-center gap-4 px-4 py-3.5 sm:px-5">
                    <div
                      className={`grid size-12 shrink-0 place-items-center rounded-xl text-sm font-semibold tabular-nums ${TONE[tone].tile}`}
                      aria-hidden
                    >
                      {scored ? `${submission.score}%` : <Clock className="size-4" />}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="break-words text-sm font-medium">
                        {submission.assignmentTitle}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {!submission.graded && (
                          <span className={pillClass("quiet")}>Awaiting grade</span>
                        )}
                        <span>
                          {submission.submittedAt
                            ? `Turned in ${submission.submittedAt.toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}`
                            : "—"}
                        </span>
                      </div>
                    </div>
                    {hasAnswers(submission) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0"
                        aria-expanded={isOpen}
                        aria-controls={`problems-${submission.id}`}
                        onClick={() => toggleRow(submission.id)}
                      >
                        <span className="hidden sm:inline">
                          {isOpen ? "Hide problems" : "Problems"}
                        </span>
                        <ChevronDown
                          className={`size-4 transition-transform sm:ml-1 ${isOpen ? "rotate-180" : ""}`}
                        />
                      </Button>
                    )}
                    <FullViewLink submission={submission} />
                  </div>
                  {isOpen && (
                    <div
                      id={`problems-${submission.id}`}
                      className="border-t border-border bg-muted/10 px-4 py-4 sm:px-5"
                    >
                      <QuestionList answers={submission.answers!} compact />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-card p-4">
      <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${TONE.quiet.tile}`}>
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
        <dd className="text-xl font-semibold tabular-nums">{value}</dd>
      </div>
    </div>
  );
}

/**
 * Opens the assignment itself, which for handed-in work is the full graded copy: the problem as set
 * (choices, diagrams), the student's answer, points, feedback and the worked solution.
 */
function FullViewLink({ submission }: { submission: Submission }) {
  return (
    <Button asChild variant="ghost" size="sm" className="shrink-0">
      <Link
        href={`/student/assignment-view?id=${encodeURIComponent(submission.assignmentId)}&from=grades`}
        aria-label={`Open ${submission.assignmentTitle} in full`}
      >
        <span className="hidden sm:inline">Full view</span>
        <ArrowUpRight className="size-4 sm:ml-1" />
      </Link>
    </Button>
  );
}

/**
 * Each problem with the student's answer, the points and the feedback. `compact` (inline under a
 * row) clamps long problem text; the full view shows everything.
 */
function QuestionList({
  answers,
  compact = false,
}: {
  answers: GradedAnswer[];
  compact?: boolean;
}) {
  return (
    <ol className={compact ? "space-y-4" : "space-y-6"}>
      {answers.map((q, idx) => (
        <li
          key={q.questionId || idx}
          className={`space-y-3 border-b border-border last:border-0 last:pb-0 ${compact ? "pb-4" : "pb-5"}`}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-semibold">Problem {idx + 1}</p>
            <span
              className={pillClass(
                typeof q.score === "number" && q.score === 0 ? "alert" : "quiet",
              )}
            >
              Points: {typeof q.score === "number" ? q.score : "-"}
            </span>
          </div>

          <div className={`break-words text-sm ${compact ? "line-clamp-3" : "font-medium"}`}>
            <MarkdownRenderer noProse>{q.questionText}</MarkdownRenderer>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Your answer</p>
              <div className="break-words rounded-lg bg-muted/40 p-3 text-sm">
                {q.answer?.trim() ? (
                  <MarkdownRenderer noProse>{q.answer}</MarkdownRenderer>
                ) : (
                  <span className="italic opacity-50">No answer provided</span>
                )}
              </div>
            </div>

            {q.feedback?.trim() && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-primary">Feedback</p>
                <div className="break-words rounded-lg border-l-2 border-primary bg-primary/5 p-3 text-sm">
                  <MarkdownRenderer noProse>{q.feedback}</MarkdownRenderer>
                </div>
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
