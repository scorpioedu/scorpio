"use client";

// One home per assignment: results, its problems (edit in place) and its settings.
// Title and due date are edited in the header and save at once; problems and settings are a draft
// with a save bar. Changing an answer key re-grades handed-in work (see PATCH /api/assignments/{id}).
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { ArrowLeft, ChevronRight, Download, Eye, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/auth-context";
import { useSelectedClass } from "@/contexts/selected-class-context";
import { getTeacherAssignment } from "@/lib/authenticated-fetch";
import { downloadCSV } from "@/lib/utils";
import { parseDueDate } from "@/lib/due-date";
import { validateQuestionAnswers } from "@/lib/assignment-validation";
import { changedQuestionIds } from "@/lib/regrade";
import { dueParam, updateAssignment, type AssignmentPatch } from "@/lib/assignment-actions";
import { undoToast } from "@/lib/undo-toast";
import { useUnsavedGuard } from "@/hooks/use-unsaved-guard";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { TeacherSummary } from "@/components/teacher/workspace";
import { InlineTitle } from "@/components/teacher/inline-title";
import { DueDateChip } from "@/components/teacher/due-date-chip";
import { SaveBar } from "@/components/teacher/save-bar";
import { AssignmentActionsMenu } from "@/components/teacher/assignment-actions-menu";
import { QuestionsEditor } from "@/components/teacher/assignment-editor/questions-editor";
import { QuestionSources } from "@/components/teacher/assignment-editor/question-sources";
import { SettingsFields } from "@/components/teacher/assignment-editor/settings-fields";
import { StudentPreviewContent } from "@/components/teacher/assignment-editor/student-preview";
import {
  getAssignmentPoints,
  settingsFrom,
  summarisePoints,
  toEditorQuestion,
  type AssignmentSettingsValue,
  type Question,
  type RawQuestion,
} from "@/components/teacher/assignment-editor/types";
import type { GradableQuestion } from "../../../../functions/src/grading-core";
import type { Organization } from "@/lib/types";

type Tab = "results" | "problems" | "settings";
const TABS: Tab[] = ["results", "problems", "settings"];

interface AssignmentDoc {
  id: string;
  title: string;
  description?: string;
  courseId?: string | null;
  dueDate: Date | null;
  archived: boolean;
  totalPoints?: number;
  questions: Question[];
  settings: AssignmentSettingsValue;
  curriculumSetKey?: string;
  raw: Record<string, unknown>;
}

interface Submission {
  id: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  submittedAt: Date;
  score?: number | null;
  reviewQuestions?: string[];
}

interface Draft {
  description: string;
  settings: AssignmentSettingsValue;
  questions: Question[];
  assignmentPoints: number;
  customPoints: boolean;
}

function draftFrom(a: AssignmentDoc): Draft {
  return {
    description: a.description ?? "",
    settings: a.settings,
    questions: a.questions,
    assignmentPoints: a.totalPoints ?? getAssignmentPoints(a.questions),
    customPoints: true,
  };
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

async function loadAssignment(id: string): Promise<AssignmentDoc> {
  const snap = await getTeacherAssignment(id);
  const data = snap.data() as Record<string, unknown>;
  return {
    id,
    title: String(data.title || "Untitled assignment"),
    description: typeof data.description === "string" ? data.description : "",
    courseId: typeof data.courseId === "string" ? data.courseId : null,
    dueDate: parseDueDate(data.dueDate as never),
    archived: data.archivedAt != null,
    totalPoints: typeof data.totalPoints === "number" ? data.totalPoints : undefined,
    questions: ((data.questions as RawQuestion[]) || []).map((q) => toEditorQuestion(q, true)),
    settings: settingsFrom(data),
    curriculumSetKey: typeof data.curriculumSetKey === "string" ? data.curriculumSetKey : undefined,
    raw: data,
  };
}

async function loadSubmissions(id: string): Promise<Submission[]> {
  const snapshot = await getDocs(
    query(collection(db, "submissions"), where("assignmentId", "==", id)),
  );
  const rows = await Promise.all(
    snapshot.docs.map(async (d) => {
      const data = d.data();
      if (data.status === "draft") return null;
      let studentName = data.studentName || "Unknown Student";
      let studentEmail = data.studentEmail || "";
      if (studentName === "Unknown Student" && data.studentId) {
        try {
          const userDoc = await getDoc(doc(db, "users", data.studentId));
          if (userDoc.exists()) {
            const u = userDoc.data();
            studentName = u.displayName || u.name || studentName;
            studentEmail = u.email || studentEmail;
          }
        } catch {
          /* keep the stored name */
        }
      }
      return {
        id: d.id,
        studentId: data.studentId,
        studentName,
        studentEmail,
        submittedAt: data.submittedAt?.toDate?.() || new Date(data.submittedAt),
        score: data.score,
        reviewQuestions: Array.isArray(data.reviewQuestions) ? data.reviewQuestions : [],
      } as Submission;
    }),
  );
  return rows.filter((s): s is Submission => s !== null);
}

function AssignmentHub() {
  const { user, profile, loading: authLoading } = useAuth();
  const { classes } = useSelectedClass({ allowAll: true, mirror: false });
  const router = useRouter();
  const searchParams = useSearchParams();
  const assignmentId = searchParams?.get("id") ?? "";
  const initialTab = searchParams?.get("tab");
  const [tab, setTabState] = useState<Tab>(
    TABS.includes(initialTab as Tab) ? (initialTab as Tab) : "results",
  );

  const [assignment, setAssignment] = useState<AssignmentDoc | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmRegrade, setConfirmRegrade] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [organization, setOrganization] = useState<Organization | null>(null);

  useEffect(() => {
    if (!profile?.organizationId) return;
    let active = true;
    getDoc(doc(db, "organizations", profile.organizationId))
      .then(
        (snap) =>
          active &&
          snap.exists() &&
          setOrganization({ id: snap.id, ...snap.data() } as Organization),
      )
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [profile?.organizationId]);
  const isFreePlan =
    authLoading ||
    !organization ||
    (organization.planId === "free" &&
      (organization.aiBudgetLimit || 0) <= (organization.aiUsageCurrent || 0));

  const uid = user?.uid;
  useEffect(() => {
    if (!assignmentId || !uid) return;
    let active = true;
    Promise.all([loadAssignment(assignmentId), loadSubmissions(assignmentId)])
      .then(([a, subs]) => {
        if (!active) return;
        if (a.raw.teacherId && a.raw.teacherId !== uid) return setStatus("missing");
        setAssignment(a);
        setDraft(draftFrom(a));
        setSubmissions(subs);
        setStatus("ready");
      })
      .catch(() => active && setStatus("missing"));
    return () => {
      active = false;
    };
  }, [assignmentId, uid]);

  const original = useMemo(() => (assignment ? draftFrom(assignment) : null), [assignment]);
  const dirty = !!draft && !!original && !sameJson(draft, original);
  const { guardDialog } = useUnsavedGuard(dirty);

  const setTab = useCallback((next: Tab) => {
    setTabState(next);
    const url = new URL(window.location.href);
    if (next === "results") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url.pathname + url.search);
  }, []);

  // With points per question the total is their sum; split evenly, it is the number the teacher sets.
  const totalPoints = draft
    ? draft.customPoints
      ? draft.questions.reduce((t, q) => t + (Number(q.points) || 0), 0)
      : draft.assignmentPoints
    : 0;
  const summary = draft ? summarisePoints(draft.questions, totalPoints, draft.customPoints) : null;

  // Which questions' grading the draft changes (the server decides again on save).
  const gradingChanges = useMemo(() => {
    if (!assignment || !summary) return { changed: 0, removed: 0 };
    const before = assignment.questions as GradableQuestion[];
    const after = summary.scoredQuestions as GradableQuestion[];
    const ids = new Set(after.map((q) => q.id));
    return {
      changed: changedQuestionIds(before, after).length,
      removed: before.filter((q) => !ids.has(q.id)).length,
    };
  }, [assignment, summary]);

  if (status === "loading") return <LoadingSpinner fullPage />;
  if (status === "missing" || !assignment || !draft || !summary) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-xl font-bold">Assignment not found</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/teacher/assignments">Back to assignments</Link>
        </Button>
      </div>
    );
  }

  const handedIn = submissions.length;
  const affectsGrades = handedIn > 0 && (gradingChanges.changed > 0 || gradingChanges.removed > 0);
  const className = classes?.find((c) => c.id === assignment.courseId)?.name;

  const patchHeader = async (
    patch: AssignmentPatch,
    apply: Partial<AssignmentDoc>,
    undo: AssignmentPatch,
    revert: Partial<AssignmentDoc>,
    message: string,
  ) => {
    try {
      await updateAssignment(assignment.id, patch);
      setAssignment((cur) => (cur ? { ...cur, ...apply } : cur));
      undoToast(message, async () => {
        await updateAssignment(assignment.id, undo);
        setAssignment((cur) => (cur ? { ...cur, ...revert } : cur));
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
      throw error;
    }
  };

  const save = async () => {
    if (draft.questions.length === 0)
      return toast.error("An assignment needs at least one question.");
    if (summary.pointsError) return toast.error(summary.pointsError);
    const validation = validateQuestionAnswers(draft.questions);
    if (!validation.valid) {
      setTab("problems");
      return toast.error(validation.error || "Every question needs an answer key.");
    }
    setConfirmRegrade(false);
    setSaving(true);
    const before = original!;
    const patch: AssignmentPatch = {};
    if (draft.description !== before.description) patch.description = draft.description;
    const s = draft.settings;
    const o = before.settings;
    if (s.topic !== o.topic) patch.topic = s.topic;
    if (s.timeLimit !== o.timeLimit)
      patch.timeLimit = s.timeLimit === "" ? null : Number(s.timeLimit);
    for (const key of [
      "gradingType",
      "requireWorkSubmission",
      "enableTabDetection",
      "lockdownMode",
      "allowAIHelp",
      "allowCalculator",
    ] as const)
      if (s[key] !== o[key]) (patch as Record<string, unknown>)[key] = s[key];
    if (s.apUnit !== o.apUnit || !sameJson(s.apTopics, o.apTopics)) {
      (patch as Record<string, unknown>).apUnit = s.apUnit;
      (patch as Record<string, unknown>).apTopics = s.apUnit ? s.apTopics : [];
    }
    const questionsChanged = !sameJson(summary.scoredQuestions, before.questions);
    if (questionsChanged) patch.questions = summary.scoredQuestions;
    try {
      const result = await updateAssignment(assignment.id, patch);
      const next: AssignmentDoc = {
        ...assignment,
        description: draft.description,
        settings: draft.settings,
        questions: summary.scoredQuestions,
        totalPoints: summary.scoredQuestions.reduce((t, q) => t + q.points, 0),
      };
      setAssignment(next);
      setDraft(draftFrom(next));
      if (questionsChanged && result.submissions > 0) {
        setSubmissions(await loadSubmissions(assignment.id));
        const parts = [`Saved. Re-graded ${result.regraded} of ${result.submissions} submissions`];
        if (result.needsReview) parts.push(`${result.needsReview} need your review`);
        toast.success(parts.join(" · "));
      } else toast.success("Changes saved");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save. Your changes are still here.",
      );
    } finally {
      setSaving(false);
    }
  };

  const scores = submissions.flatMap(({ score }) => (typeof score === "number" ? [score] : []));
  const gradedCount = scores.length;
  const averageScore = gradedCount
    ? Math.round(scores.reduce((t, x) => t + x, 0) / gradedCount)
    : 0;
  const reviewCount = submissions.filter((s) => s.reviewQuestions?.length).length;

  return (
    <div className="space-y-6">
      <Link
        href="/teacher/assignments"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Assignments
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div className="min-w-0 flex-1 space-y-2">
          <InlineTitle
            as="h1"
            value={assignment.title}
            label="Rename assignment"
            className="text-3xl font-semibold tracking-tight"
            inputClassName="text-2xl font-semibold"
            onSave={(title) =>
              patchHeader(
                { title },
                { title },
                { title: assignment.title },
                { title: assignment.title },
                "Renamed",
              )
            }
          />
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {className && <Badge variant="secondary">{className}</Badge>}
            {assignment.curriculumSetKey && (
              <Badge variant="outline">Set {assignment.curriculumSetKey}</Badge>
            )}
            {assignment.archived && (
              <Badge variant="outline">Archived · hidden from students</Badge>
            )}
            <DueDateChip
              due={assignment.dueDate}
              onChange={(dueDate) =>
                patchHeader(
                  { dueDate: dueParam(dueDate) },
                  { dueDate },
                  { dueDate: dueParam(assignment.dueDate) },
                  { dueDate: assignment.dueDate },
                  dueDate ? "Due date changed" : "Due date removed",
                )
              }
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={handedIn === 0}
            onClick={() =>
              downloadCSV(
                `${assignment.title || "assignment"}-grades.csv`,
                submissions.map((s) => ({
                  submissionId: s.id,
                  studentId: s.studentId,
                  studentName: s.studentName,
                  studentEmail: s.studentEmail,
                  submittedAt: s.submittedAt?.toString?.() || String(s.submittedAt),
                  score: s.score ?? "",
                  graded: typeof s.score === "number" ? "true" : "false",
                })),
              )
            }
          >
            <Download /> Export CSV
          </Button>
          <AssignmentActionsMenu
            id={assignment.id}
            title={assignment.title}
            archived={assignment.archived}
            hideOpen
            onChanged={(archived) => setAssignment((cur) => (cur ? { ...cur, archived } : cur))}
            onDeleted={() => router.push("/teacher/assignments")}
          />
        </div>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="results">Results{handedIn ? ` (${handedIn})` : ""}</TabsTrigger>
          <TabsTrigger value="problems">Problems ({draft.questions.length})</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="results" className="mt-6 space-y-6">
          <TeacherSummary
            label="Assignment overview"
            items={[
              { label: "Submissions", value: handedIn },
              { label: "Graded", value: gradedCount },
              { label: "Average score", value: gradedCount ? `${averageScore}%` : "—" },
              { label: "Need review", value: reviewCount },
            ]}
          />
          <Card className="min-w-0 gap-0 py-0">
            <CardHeader className="px-4 py-4 sm:px-5">
              <h2 className="text-base font-semibold">Submissions</h2>
            </CardHeader>
            <CardContent className="border-t p-0">
              {handedIn === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                  No submissions yet.
                </p>
              ) : (
                <Table aria-label="Assignment submissions">
                  <TableHeader className="bg-muted/40">
                    <TableRow>
                      <TableHead className="pl-4 sm:pl-5">Student</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead className="pr-4 text-right sm:pr-5">Review</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {submissions.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="max-w-64 whitespace-normal py-3 pl-4 sm:pl-5">
                          <p className="break-words font-medium">{s.studentName}</p>
                          <p className="break-all text-xs text-muted-foreground">
                            {s.studentEmail}
                          </p>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm">{s.submittedAt.toLocaleDateString()}</p>
                          <p className="text-xs text-muted-foreground">
                            {s.submittedAt.toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </TableCell>
                        <TableCell className="font-medium tabular-nums">
                          {typeof s.score === "number" ? (
                            `${s.score}%`
                          ) : (
                            <span className="text-muted-foreground">Pending</span>
                          )}
                          {s.reviewQuestions?.length ? (
                            <Badge
                              variant="outline"
                              className="ml-2 border-amber-500/40 text-amber-700 dark:text-amber-400"
                            >
                              Check {s.reviewQuestions.length} answer
                              {s.reviewQuestions.length === 1 ? "" : "s"}
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell className="pr-4 text-right sm:pr-5">
                          <Button
                            asChild
                            variant={typeof s.score === "number" ? "ghost" : "outline"}
                            size="sm"
                          >
                            <Link href={`/teacher/submission/grade?id=${s.id}`}>
                              {typeof s.score === "number" ? "Review" : "Grade"} <ChevronRight />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="problems" className="mt-6 space-y-4">
          {handedIn > 0 && (
            <div className="flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
              <p>
                {handedIn} student{handedIn === 1 ? " has" : "s have"} handed this in. Fixing
                wording is safe. Changing an answer key, choices or points re-grades their answers
                to that question when you save; answers you graded by hand keep your score, and
                written answers are flagged for you to check.
              </p>
            </div>
          )}
          <Card className="gap-5">
            <CardHeader className="flex flex-wrap items-start justify-between gap-3 px-4 sm:px-6">
              <div>
                <h2 className="font-semibold">Problems</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Edit the wording, answer key or choices; add, remove or reorder problems.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <QuestionSources
                  isFreePlan={isFreePlan}
                  userId={user?.uid}
                  onAdd={(added) =>
                    setDraft((d) => (d ? { ...d, questions: [...d.questions, ...added] } : d))
                  }
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setPreviewOpen(true)}
                >
                  <Eye /> Student view
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 px-4 sm:px-6">
              <div className="flex items-center gap-3">
                <Label htmlFor="assignment-points" className="shrink-0">
                  Total points
                </Label>
                <input
                  id="assignment-points"
                  type="number"
                  min={1}
                  step={1}
                  disabled={draft.customPoints}
                  value={totalPoints || ""}
                  onChange={(e) =>
                    setDraft({ ...draft, assignmentPoints: e.target.valueAsNumber || 0 })
                  }
                  className="h-8 w-24 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-70"
                />
                {draft.customPoints && (
                  <span className="text-xs text-muted-foreground">
                    The sum of each problem&apos;s points
                  </span>
                )}
              </div>
              <QuestionsEditor
                questions={draft.questions}
                setQuestions={(update) =>
                  setDraft((d) =>
                    d
                      ? {
                          ...d,
                          questions: typeof update === "function" ? update(d.questions) : update,
                        }
                      : d,
                  )
                }
                summary={summary}
                assignmentPoints={totalPoints}
                customPoints={draft.customPoints}
                setCustomPoints={(customPoints) =>
                  setDraft((d) => (d ? { ...d, customPoints, assignmentPoints: totalPoints } : d))
                }
                rubricTopic={assignment.title}
                userId={user?.uid}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="mt-6 space-y-4">
          <Card className="gap-5">
            <CardContent className="space-y-2 px-4 sm:px-6">
              <Label htmlFor="description">Student instructions</Label>
              <Textarea
                id="description"
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="What should students know before they start?"
                rows={3}
              />
            </CardContent>
          </Card>
          <div className="divide-y rounded-xl border bg-card px-4 sm:px-6">
            <SettingsFields
              value={draft.settings}
              onChange={(settings) => setDraft({ ...draft, settings })}
              isFreePlan={isFreePlan}
              hasNetwork={!!profile?.organizationId}
              showSharing={false}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Sharing to Waypoints is changed from the assignments list.
          </p>
        </TabsContent>
      </Tabs>

      <SaveBar
        dirty={dirty}
        saving={saving}
        note={
          affectsGrades
            ? `Saving re-grades answers in ${handedIn} submission${handedIn === 1 ? "" : "s"}.`
            : summary.pointsError || undefined
        }
        onDiscard={() => setDraft(original)}
        onSave={() => (affectsGrades ? setConfirmRegrade(true) : save())}
      />

      <ConfirmDialog
        open={confirmRegrade}
        onOpenChange={setConfirmRegrade}
        variant="default"
        title="Save and re-grade?"
        description={`${handedIn} student${handedIn === 1 ? " has" : "s have"} handed this in. Answers to the ${
          gradingChanges.changed + gradingChanges.removed
        } changed or removed problem${gradingChanges.changed + gradingChanges.removed === 1 ? "" : "s"} will be re-graded against the new key. Scores you set by hand stay as they are; written answers that need a person are flagged for you.`}
        confirmText="Save and re-grade"
        cancelText="Keep editing"
        onConfirm={save}
      />

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <StudentPreviewContent
          title={assignment.title}
          description={draft.description}
          dueDate={assignment.dueDate}
          totalPoints={summary.validTotal ? totalPoints : 0}
          timeLimit={draft.settings.timeLimit}
          questions={summary.scoredQuestions}
          onClose={() => setPreviewOpen(false)}
          subtitle="What students see, including your unsaved changes."
        />
      </Dialog>
      {guardDialog}
    </div>
  );
}

export default function AssignmentPage() {
  return (
    <Suspense fallback={<LoadingSpinner fullPage />}>
      <AssignmentHub />
    </Suspense>
  );
}
