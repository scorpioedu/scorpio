"use client";
import { authenticatedFetch } from "@/lib/authenticated-fetch";

import { useState, useEffect, useRef, Suspense } from "react";
import { parseAssignmentDefaults } from "@/lib/assignment-defaults";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { doc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/auth-context";
import { useSelectedClass } from "@/contexts/selected-class-context";
import { useUnsavedGuard } from "@/hooks/use-unsaved-guard";
import { validateQuestionAnswers } from "@/lib/assignment-validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, ChevronDown, Eye, Loader2, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { TeacherPageHeader } from "@/components/teacher/workspace";
import { SmartDateTimePicker } from "@/components/ui/smart-datetime-picker";
import { QuestionsEditor } from "@/components/teacher/assignment-editor/questions-editor";
import { QuestionSources } from "@/components/teacher/assignment-editor/question-sources";
import { SettingsFields } from "@/components/teacher/assignment-editor/settings-fields";
import { StudentPreviewContent } from "@/components/teacher/assignment-editor/student-preview";
import {
  DEFAULT_SETTINGS,
  settingsFrom,
  getAssignmentPoints,
  summarisePoints,
  toEditorQuestion,
  type AssignmentSettingsValue,
  type Question,
  type RawQuestion,
} from "@/components/teacher/assignment-editor/types";

function AdvancedSettings({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <button
        type="button"
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-4 text-left hover:bg-muted/50 focus-visible:outline-ring focus-visible:outline-offset-[-2px] sm:px-6"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <Settings2 className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="flex-1 space-y-1">
          <span className="block text-sm font-semibold">Advanced settings</span>
          <span className="block text-sm text-muted-foreground">
            Time limits, student tools, and sharing
          </span>
        </span>
        <ChevronDown
          className={`size-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open && <div className="divide-y border-t px-4 sm:px-6">{children}</div>}
    </div>
  );
}

interface CourseItem {
  id: string;
  name?: string;
  code?: string;
  assignmentDefaults?: unknown;
}

export default function CreateAssignmentPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="animate-spin" />
        </div>
      }
    >
      <CreateAssignmentForm />
    </Suspense>
  );
}

function CreateAssignmentForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const forkId = searchParams?.get("fork");
  const initialCourseId = searchParams?.get("courseId");
  const { user, profile } = useAuth();
  const { classes, classId: selectedClassId } = useSelectedClass({ allowAll: true, mirror: false });
  const courses: CourseItem[] = classes ?? [];
  const [chosenCourseId, setChosenCourseId] = useState("");
  const selectedCourseId =
    chosenCourseId ||
    courses.find((course) => course.id === initialCourseId)?.id ||
    courses.find((course) => course.id === selectedClassId)?.id ||
    "";
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [settings, setSettings] = useState<AssignmentSettingsValue>(DEFAULT_SETTINGS);
  const [questions, setQuestions] = useState<Question[]>([]);

  // A class's assignment settings are where a new assignment's settings start. A copied assignment keeps
  // the settings it came with, so only a class chosen by hand (or linked from the Courses page) applies them.
  const applyClassDefaults = (courseId: string) => {
    const defaults = parseAssignmentDefaults(
      courses.find((course) => course.id === courseId)?.assignmentDefaults,
    );
    if (!defaults) return;
    setSettings((current) => ({
      ...current,
      timeLimit: defaults.timeLimit ?? "",
      gradingType: defaults.gradingType,
      allowCalculator: defaults.allowCalculator,
      allowAIHelp: defaults.allowAIHelp,
      requireWorkSubmission: defaults.requireWorkSubmission,
      enableTabDetection: defaults.enableTabDetection,
      lockdownMode: defaults.lockdownMode,
    }));
  };
  // The class linked from the Courses page (?courseId=) applies once its settings have loaded.
  const appliedLinkedRef = useRef(false);
  useEffect(() => {
    if (appliedLinkedRef.current || forkId === "true" || !initialCourseId || !classes) return;
    appliedLinkedRef.current = true;
    applyClassDefaults(initialCourseId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes, initialCourseId, forkId]);
  const [assignmentPoints, setAssignmentPoints] = useState(100);
  const [customPoints, setCustomPoints] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // Forks are copied server-side by POST /api/assignments/clone (answer key included); the copy is
  // the teacher's own, so GET /api/assignments returns it with its answers.
  const forkCopyId = searchParams?.get("copy");
  useEffect(() => {
    if (forkId !== "true" || !forkCopyId || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await authenticatedFetch(
          `/api/assignments?id=${encodeURIComponent(forkCopyId)}`,
        );
        if (!res.ok) throw new Error("Unable to load the copy");
        const assignment = await res.json();
        if (cancelled) return;
        setTitle(assignment.title || "");
        setDescription(assignment.description || "");
        // Every setting comes with the copy (time limit, lockdown, tools, grading); sharing starts private.
        setSettings({ ...settingsFrom(assignment), visibility: "private" });
        if (assignment.questions?.length) {
          const copiedQuestions = assignment.questions.map((question: RawQuestion) =>
            toEditorQuestion(question),
          );
          setQuestions(copiedQuestions);
          setAssignmentPoints(assignment.totalPoints ?? getAssignmentPoints(copiedQuestions));
          setCustomPoints(true);
        }
        toast.success("Ready to edit. Choose a class to assign it.");
      } catch (e) {
        console.error("Error loading forked assignment", e);
        if (!cancelled) toast.error("Could not load that assignment.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [forkId, forkCopyId, user]);

  // Leaving with a title or questions typed asks first (not after a successful create).
  const [created, setCreated] = useState(false);
  const { guardDialog } = useUnsavedGuard(
    !created && (title.trim() !== "" || questions.length > 0 || description.trim() !== ""),
  );

  const summary = summarisePoints(questions, assignmentPoints, customPoints);
  const { validTotal, scoredQuestions, pointsError } = summary;
  const { timeLimit } = settings;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourseId) {
      toast.error("Please select a class for this assignment.");
      return;
    }
    if (questions.length === 0 || pointsError) {
      toast.error(pointsError || "Add at least one question before creating the assignment.");
      return;
    }
    if (timeLimit !== "" && timeLimit < 0) {
      toast.error("Enter a time limit of 0 or more minutes in Advanced settings.");
      return;
    }

    // Validate that every question has a correct answer specified
    const validation = validateQuestionAnswers(questions);
    if (!validation.valid) {
      toast.error(validation.error || "Please select a correct answer.");
      if (validation.questionIndex !== undefined) {
        const qId = questions[validation.questionIndex]?.id;
        if (qId)
          document
            .getElementById(`question-${qId}`)
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }
    setLoading(true);
    try {
      // 1. Create assignment
      const createResponse = await authenticatedFetch("/api/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          topic: settings.topic,
          apCourse: settings.apUnit ? settings.apCourse : null,
          apUnit: settings.apUnit,
          apTopics: settings.apUnit ? settings.apTopics : [],
          teacherId: user?.uid,
          organizationId: profile?.organizationId || null,
          visibility: settings.visibility,
          courseId: selectedCourseId,
          dueDate: dueDate ?? null,
          timeLimit: timeLimit === "" ? null : Number(timeLimit),
          gradingType: settings.gradingType,
          requireWorkSubmission: settings.requireWorkSubmission,
          enableTabDetection: settings.enableTabDetection,
          lockdownMode: settings.lockdownMode,
          allowAIHelp: settings.allowAIHelp,
          allowCalculator: settings.allowCalculator,
          totalPoints: assignmentPoints,
          questions: scoredQuestions,
          createdAt: new Date(),
          type: "standard",
          googleFormLink: null,
          rubric: null,
        }),
      });

      if (!createResponse.ok)
        throw new Error((await createResponse.json()).error || "Could not create assignment");

      // A fork was first copied server-side (with its answer key) so the editor could load it; the
      // assignment just created replaces that draft copy, so remove it instead of leaving a duplicate.
      if (forkCopyId) {
        await deleteDoc(doc(db, "assignments", forkCopyId)).catch((error) =>
          console.error("Could not remove the draft copy", error),
        );
        sessionStorage.removeItem("forked_assignment");
      }

      // The email notifications to students are now automatically handled in the background
      // by the Firebase Cloud Function 'onAssignmentCreated'.

      setCreated(true);
      const { id } = await createResponse.json();
      toast.success("Assignment created");
      router.push(
        typeof id === "string"
          ? `/teacher/assignment-view?id=${encodeURIComponent(id)}`
          : "/teacher/assignments",
      );
    } catch (error) {
      console.error("Error creating assignment:", error);
      toast.error("Couldn’t create the assignment. Your changes are still here. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href="/teacher/assignments"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Assignments
      </Link>
      <TeacherPageHeader title="New assignment" />

      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <form onSubmit={handleSubmit} className="space-y-6">
          <Card className="gap-5">
            <CardHeader className="px-4 sm:px-6">
              <h2 className="font-semibold">Assignment details</h2>
            </CardHeader>
            <CardContent className="space-y-5 px-4 sm:px-6">
              <div className="space-y-2">
                <Label htmlFor="title">Assignment title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="e.g. Unit 1 review"
                  required
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_8rem]">
                <div className="space-y-2 sm:col-span-2 lg:col-span-1">
                  <Label htmlFor="course">Class</Label>
                  <Select
                    value={selectedCourseId}
                    onValueChange={(value) => {
                      setChosenCourseId(value);
                      applyClassDefaults(value);
                    }}
                    required
                  >
                    <SelectTrigger id="course" className="w-full">
                      <SelectValue placeholder="Choose a class" />
                    </SelectTrigger>
                    <SelectContent>
                      {courses.length === 0 ? (
                        <SelectItem value="none" disabled>
                          No classes found
                        </SelectItem>
                      ) : (
                        courses.map((course) => (
                          <SelectItem key={course.id} value={course.id}>
                            {course.name} ({course.code})
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <SmartDateTimePicker
                  value={dueDate?.toISOString()}
                  onChange={setDueDate}
                  label="Due date"
                  placeholder="e.g. Friday at 5 pm"
                />
                <div className="space-y-2">
                  <Label htmlFor="assignment-points">Total points</Label>
                  <Input
                    id="assignment-points"
                    type="number"
                    min={1}
                    step={1}
                    required
                    value={assignmentPoints || ""}
                    onChange={(event) => setAssignmentPoints(event.target.valueAsNumber || 0)}
                    aria-invalid={!validTotal}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">
                  Student instructions{" "}
                  <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="What should students know before they start?"
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="gap-5">
            <CardHeader className="flex flex-wrap items-start justify-between gap-3 px-4 sm:px-6">
              <div>
                <h2 className="font-semibold">Questions</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Write your own, generate them, or import text.
                </p>
              </div>
              <QuestionSources
                userId={user?.uid}
                onAdd={(added) => setQuestions((current) => [...current, ...added])}
              />
            </CardHeader>
            <CardContent className="space-y-4 px-4 sm:px-6">
              <QuestionsEditor
                questions={questions}
                setQuestions={setQuestions}
                summary={summary}
                assignmentPoints={assignmentPoints}
                customPoints={customPoints}
                setCustomPoints={setCustomPoints}
                rubricTopic={title}
                userId={user?.uid}
              />
            </CardContent>
          </Card>

          <AdvancedSettings>
            <SettingsFields
              value={settings}
              onChange={setSettings}
              hasNetwork={!!profile?.organizationId}
            />
          </AdvancedSettings>

          <div className="z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background p-3 shadow-sm sm:sticky sm:bottom-20 sm:px-4">
            <p className="text-sm text-muted-foreground">
              {questions.length} {questions.length === 1 ? "question" : "questions"}
              {validTotal && (
                <>
                  {" "}
                  <span aria-hidden="true">·</span> {assignmentPoints}{" "}
                  {assignmentPoints === 1 ? "point" : "points"}
                </>
              )}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <DialogTrigger asChild>
                <Button type="button" variant="outline">
                  <Eye /> Preview
                </Button>
              </DialogTrigger>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="animate-spin" />}
                {loading ? "Creating…" : "Create assignment"}
              </Button>
            </div>
          </div>
        </form>

        <StudentPreviewContent
          title={title}
          description={description}
          dueDate={dueDate}
          totalPoints={validTotal ? assignmentPoints : 0}
          timeLimit={timeLimit}
          questions={scoredQuestions}
          onClose={() => setIsPreviewOpen(false)}
        />
      </Dialog>
      {guardDialog}
    </div>
  );
}
