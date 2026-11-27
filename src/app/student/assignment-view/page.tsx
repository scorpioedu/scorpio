"use client";
import { isSubmissionLate, type DueDateLike } from "@/lib/due-date";
import { WorkspaceHeader } from "@/components/ui/workspace";
import { authenticatedFetch } from "@/lib/authenticated-fetch";

import { useCallback, useEffect, useState, useRef, Suspense } from "react";
import { useModalA11y } from "@/hooks/use-modal-a11y";
import { getTimerExpiryAction, GRACE_PERIOD_SECONDS } from "@/lib/assignment-timer";
import { useSearchParams, useRouter } from "next/navigation";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { db, uploadFilesToStorage, type WorkFile } from "@/lib/firebase";
import { SubmittedDialog } from "@/components/student/submitted-dialog";
import { useStudentAi } from "@/contexts/student-ai-context";
import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { motion, AnimatePresence } from "framer-motion";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  ArrowLeft,
  Send,
  MessagesSquare,
  CheckCircle,
  Clock,
  AlertTriangle,
  Play,
  Upload,
  X,
  FileText,
  Image as ImageIcon,
  AlertCircle,
  Save,
  Lock,
  Hand,
  Calculator,
  LineChart,
} from "lucide-react";
import { toast } from "sonner";
import { MathInputField } from "@/components/math-input";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import "katex/dist/katex.min.css";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { getAssignmentPoints } from "@/lib/assignment-points";
import {
  ScientificCalculator,
  type CalculatorMode,
} from "@/components/calculator/scientific-calculator";
import { RaiseHelpPanel } from "@/components/student/raise-help-panel";
import { errorMessage } from "@/lib/error-utils";
import type { SolutionsResponse } from "@/app/api/assignments/[id]/solutions/types";
import { SolutionBlock, solutionsNotice } from "./solution-block";
import {
  GuideLink,
  guideUnitOf,
  misconceptionGuideHref,
  topicGuideHref,
  useUnitGuides,
} from "./guide-links";
import { ReadFirst } from "./read-first";
import { lessonCourse, readFirstTopics } from "@/lib/read-first";

interface Question {
  id: string;
  text: string;
  type: "text" | "multiple-choice" | "true-false" | "short-answer" | "numeric";
  options?: string[];
  correctAnswer?: string;
  points?: number;
  /** The AP topic the question practises ("4.2"), on course sets. */
  apTopic?: string;
}

/** One answer inside a stored submission; graded fields are present once a teacher or the AI has graded it. */
interface SubmissionAnswer {
  questionId: string;
  answer?: string;
  score?: number;
  feedback?: string;
  [key: string]: unknown;
}

/** A stored submission as returned by Firestore or the submissions API. */
interface ExistingSubmission {
  id: string;
  status?: string;
  graded?: boolean;
  score?: number;
  answers?: SubmissionAnswer[];
  [key: string]: unknown;
}

interface Assignment {
  id: string;
  title: string;
  description: string;
  dueDate: Date | null;
  questions: Question[];
  gradingType?: "ai" | "manual";
  timeLimit?: number;
  requireWorkSubmission?: boolean;
  allowAIHelp?: boolean;
  allowCalculator?: boolean;
  enableTabDetection?: boolean;
  lockdownMode?: boolean;
  type?: string;
  teacherId?: string;
  courseId?: string;
  /** The course the assignment is a set of; its guides are linked from the questions. */
  curriculumId?: string;
  /** "Read the lessons first": the topics to read before the problems open, and their course. */
  readFirst?: { curriculumId: string; topics: string[] };
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

function AssignmentDetailContent() {
  const isMobile = useIsMobile();
  const searchParams = useSearchParams();
  const id = searchParams ? (searchParams.get("id") ?? "") : "";
  // Opened from Grades ("Full view"): Back returns there instead of to Assignments.
  const backHref =
    searchParams?.get("from") === "grades" ? "/student/grades" : "/student/assignments";
  // Home's "Start your first assignment" adds this: a new student gets the short briefing first.
  const firstAssignment = searchParams?.get("first") === "1";
  const router = useRouter();
  const { user, profile } = useAuth();
  // Hints need Raise on for the class as well as allowed on this assignment.
  const aiOn = useStudentAi() === true;
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [confirmBlank, setConfirmBlank] = useState(false);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const totalPoints = getAssignmentPoints(assignment?.questions);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [existingSubmission, setExistingSubmission] = useState<ExistingSubmission | null>(null);

  // Timer State
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  /** Every lesson the teacher asked for is read (always true when none is asked for). */
  const [lessonsRead, setLessonsRead] = useState(false);
  const [timerActive, setTimerActive] = useState(false);
  const [inGracePeriod, setInGracePeriod] = useState(false);

  // File Upload State
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ [key: number]: number }>({});

  // Tab unfocus tracking
  const [unfocusCount, setUnfocusCount] = useState(0);
  const [showUnfocusPopup, setShowUnfocusPopup] = useState(false);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const ignoreNextBlurRef = useState({ current: false })[0];
  const lastUploadClickTime = useRef<number>(0);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (assignment?.lockdownMode && hasStarted && !submitted) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    const handleCopy = (e: ClipboardEvent) => {
      if (assignment?.lockdownMode) {
        e.preventDefault();
        // Use toast or alert
        toast.error("Copying is disabled in Lockdown Mode to maintain academic integrity.");
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      if (assignment?.lockdownMode) {
        e.preventDefault();
      }
    };

    const handleFullscreenChange = () => {
      if (assignment?.lockdownMode && hasStarted && !submitted && !document.fullscreenElement) {
        setUnfocusCount((count) => count + 1);
        setShowUnfocusPopup(true);
      }
    };

    const handleBlur = () => {
      if (!assignment?.enableTabDetection || !hasStarted || submitted) return;

      if (ignoreNextBlurRef.current) {
        ignoreNextBlurRef.current = false;
        return;
      }

      // Check if it's really a tab switch by checking visibilityState
      // Also ignore if we recently clicked an upload button to avoid file picker false positives
      const timeSinceUploadClick = Date.now() - lastUploadClickTime.current;
      if (timeSinceUploadClick < 2000) {
        return;
      }

      if (document.visibilityState === "hidden" || !document.hasFocus()) {
        setUnfocusCount((count) => count + 1);
        setShowUnfocusPopup(true);
      }
    };

    // Discourage browser back button in lockdown
    const handlePopState = (e: PopStateEvent) => {
      if (assignment?.lockdownMode && hasStarted && !submitted) {
        window.history.pushState(null, "", window.location.href);
        toast.error(
          "Navigation is locked. Please complete and submit your assignment before leaving.",
        );
      }
    };

    if (assignment?.lockdownMode && hasStarted && !submitted) {
      window.history.pushState(null, "", window.location.href);
      window.addEventListener("popstate", handlePopState);
    }

    if (assignment?.enableTabDetection && hasStarted && !submitted) {
      window.addEventListener("blur", handleBlur);
      document.addEventListener("visibilitychange", handleBlur);
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("copy", handleCopy);
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleBlur);
    };
  }, [ignoreNextBlurRef, assignment, submitted, hasStarted]);

  useEffect(() => {
    async function fetchAssignment() {
      if (!id || !user) return;

      try {
        const docSnap = await getDoc(doc(db, "assignments", id));
        if (docSnap.exists()) {
          const data = docSnap.data();

          // Check if student belongs to this teacher or course (New Unified Logic)
          let studentCourseId = profile?.courseId;
          let studentTeacherId = profile?.teacherId;

          // Fallback to legacy if profile is not yet fully populated or missing
          if (!studentCourseId || !studentTeacherId) {
            try {
              const studentDoc = await getDoc(doc(db, "students", user.uid));
              if (studentDoc.exists()) {
                const sData = studentDoc.data();
                studentCourseId = studentCourseId || sData.courseId;
                studentTeacherId = studentTeacherId || sData.teacherId;
              }
            } catch (e) {
              console.error("Could not fetch legacy student profile", e);
            }
          }

          // --- LEGACY RESOLUTION START ---
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
          // --- LEGACY RESOLUTION END ---

          if (data.courseId) {
            // Strict Course Check
            if (studentCourseId !== data.courseId) {
              console.log("Unauthorized: Student not in this course");
              setLoading(false);
              return;
            }
          } else if (data.teacherId) {
            // Legacy Teacher Check
            if (studentTeacherId !== data.teacherId) {
              console.log("Unauthorized: Student linked to different teacher");
              setLoading(false);
              return;
            }
          }

          const assignmentData = {
            id: docSnap.id,
            title: data.title,
            description: data.description,
            dueDate: data.dueDate?.toDate?.() ?? (data.dueDate ? new Date(data.dueDate) : null),
            questions: data.questions || [],
            gradingType: data.gradingType || "ai",
            timeLimit: data.timeLimit,
            requireWorkSubmission: data.requireWorkSubmission || false,
            allowAIHelp: data.allowAIHelp || false,
            allowCalculator: data.allowCalculator || false,
            enableTabDetection: data.enableTabDetection ?? true,
            // Assignments saved without this field have always opened locked, and teachers may be
            // relying on that, so they stay locked. Everything created now writes the field: the
            // editor and the copy route both default it to off.
            lockdownMode: data.lockdownMode ?? true,
            type: data.type || "standard",
            teacherId: data.teacherId || studentTeacherId,
            courseId: data.courseId || studentCourseId,
            curriculumId: typeof data.curriculumId === "string" ? data.curriculumId : undefined,
            readFirst: (() => {
              const topics = readFirstTopics(data);
              const course = lessonCourse(data);
              return topics.length && course ? { curriculumId: course, topics } : undefined;
            })(),
          };

          setAssignment(assignmentData);

          // Check for existing submission
          const submissionsQuery = query(
            collection(db, "submissions"),
            where("assignmentId", "==", id),
            where("studentId", "==", user.uid),
          );
          const submissionsSnap = await getDocs(submissionsQuery);
          if (!submissionsSnap.empty) {
            const existingData = submissionsSnap.docs[0].data();
            setExistingSubmission({ ...existingData, id: submissionsSnap.docs[0].id });

            if (existingData.status === "draft") {
              setSubmitted(false);
              setHasStarted(true);
            } else {
              setSubmitted(true);
              setHasStarted(true); // Already submitted means started
            }

            // Populate answers from existing submission
            const existingAnswers: Record<string, string> = {};
            (existingData.answers as SubmissionAnswer[] | undefined)?.forEach((ans) => {
              existingAnswers[ans.questionId] = ans.answer as string;
            });
            setAnswers(existingAnswers);
          } else {
            // Check for local start time if not submitted
            if (assignmentData.timeLimit) {
              const storedStart = localStorage.getItem(`assignment_start_${id}_${user.uid}`);
              if (storedStart) {
                const startTime = parseInt(storedStart);
                const elapsed = Math.floor((Date.now() - startTime) / 1000);
                const remaining = assignmentData.timeLimit * 60 - elapsed;

                if (remaining > 0) {
                  setTimeLeft(remaining);
                  setHasStarted(true);
                  setTimerActive(true);
                } else {
                  // Time expired while away
                  setTimeLeft(0);
                  setHasStarted(true);
                  // We should probably auto-submit here or show expired state
                  // For now, let's just set it to 0 and let the timer effect handle it
                }
              }
            } else if (!firstAssignment && !assignmentData.readFirst) {
              // No timer and nothing to read first, so "started" immediately
              setHasStarted(true);
            }
          }
        }
      } catch (error) {
        console.error("Error fetching assignment:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchAssignment();
  }, [id, user, profile, firstAssignment]);

  // Correct answers and worked solutions. The server decides what this student may see (graded,
  // and past the due date); a failure leaves the page as it is without them.
  const [solutions, setSolutions] = useState<SolutionsResponse | null>(null);
  const assignmentId = assignment?.id;
  useEffect(() => {
    if (!assignmentId || !user) return;
    let active = true;
    authenticatedFetch(`/api/assignments/${encodeURIComponent(assignmentId)}/solutions`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: SolutionsResponse | null) => {
        if (active && data && typeof data.solutions === "object") setSolutions(data);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [assignmentId, user]);

  // Guides are loaded only for graded work whose answers carry a misconception tag.
  const isGraded = !!existingSubmission?.graded;
  const taggedUnits = isGraded
    ? (assignment?.questions ?? []).flatMap((q) => {
        const tags = existingSubmission?.answers?.find(
          (a) => a.questionId === q.id,
        )?.misconceptions;
        const unit = guideUnitOf(q.apTopic);
        return unit !== null && Array.isArray(tags) && tags.length ? [unit] : [];
      })
    : [];
  const unitGuides = useUnitGuides(assignment?.curriculumId, taggedUnits);

  // Timer: one interval for as long as the timer is active (H-002). Expiry is handled in the next effect.
  useEffect(() => {
    if (!timerActive) return;

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null || prev <= 0) return 0;
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [timerActive]);

  // Latest handleSubmit (kept current by an effect after its definition), so expiry never submits a stale closure.
  const handleSubmitRef = useRef<() => Promise<void>>(async () => {});

  const hasGraceOption = Boolean(assignment?.requireWorkSubmission && assignment?.timeLimit);
  useEffect(() => {
    if (!timerActive) return;
    const action = getTimerExpiryAction(timeLeft, inGracePeriod, hasGraceOption);
    if (action === "start-grace") {
      // Work submission is required with a time limit: enter the grace period
      setInGracePeriod(true);
      setTimeLeft(GRACE_PERIOD_SECONDS);
    } else if (action === "submit") {
      setTimerActive(false);
      handleSubmitRef.current(); // Auto-submit
    }
  }, [timerActive, timeLeft, inGracePeriod, hasGraceOption]);

  const handleStartAssignment = () => {
    if (!assignment || !user) return;

    const now = Date.now();
    localStorage.setItem(`assignment_start_${assignment.id}_${user.uid}`, now.toString());

    if (assignment.timeLimit) {
      setTimeLeft(assignment.timeLimit * 60);
      setTimerActive(true);
    }
    setHasStarted(true);

    // Request fullscreen for Lockdown Mode
    if (assignment.lockdownMode) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
        // If it fails (some browsers or if not user-triggered), we still continue,
        // but tab detection will catch them anyway
      });
    }
  };

  // AI Helper Logic
  const [aiHelperOpen, setAiHelperOpen] = useState(false);
  const closeAiHelper = useCallback(() => setAiHelperOpen(false), []);
  const mobileDrawerRef = useModalA11y<HTMLDivElement>(isMobile && aiHelperOpen, closeAiHelper);
  const [aiMessages, setAiMessages] = useState<ChatMessage[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [focusedQuestionIndex, setFocusedQuestionIndex] = useState<number | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [calculatorMode, setCalculatorMode] = useState<CalculatorMode>("desmos-sci");
  const [calculatorRestore, setCalculatorRestore] = useState(0);

  const handleCopyMessage = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMessageId(id);
    toast.success("Copied");
    setTimeout(() => setCopiedMessageId(null), 2000);
  };

  const handleResetChat = () => {
    setAiMessages([]);
    setAiInput("");
    toast.info("Conversation cleared");
  };

  const openGraph = () => {
    setCalculatorMode("desmos-graph");
    setCalculatorRestore((n) => n + 1);
    setCalculatorOpen(true);
  };

  const handleAiSendMessage = async (customMessage?: string) => {
    const textToSend = customMessage || aiInput;
    if (!textToSend.trim() || aiLoading || !assignment) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: textToSend,
    };

    setAiMessages((prev) => [...prev, userMessage]);
    if (!customMessage) setAiInput("");
    setAiLoading(true);

    try {
      // Highlight focused question in the prompt context if one is selected
      const focusedContext =
        focusedQuestionIndex !== null && assignment.questions[focusedQuestionIndex]
          ? `\nCURRENT STUDENT FOCUS: Question ${focusedQuestionIndex + 1} (${assignment.questions[focusedQuestionIndex].points || 10} pts): "${assignment.questions[focusedQuestionIndex].text}"\n\n`
          : "";

      // Construct comprehensive context
      const assignmentContext = `${focusedContext}ASSIGNMENT TITLE: ${assignment.title}
ASSIGNMENT DESCRIPTION: ${assignment.description}

ASSIGNMENT QUESTIONS:
${assignment.questions
  .map((q, i) => {
    const optionsStr =
      q.type === "multiple-choice" && q.options
        ? `\nOptions: ${q.options.map((opt, idx) => `${String.fromCharCode(65 + idx)}) ${opt}`).join(", ")}`
        : "";
    const isFocused = i === focusedQuestionIndex ? " [CURRENTLY FOCUSED BY STUDENT]" : "";
    return `QUESTION ${i + 1}${isFocused}:
Type: ${q.type}
Text: ${q.text || "[This question has no text description. Refer to the assignment title/description.]"}${optionsStr}`;
  })
  .join("\n\n")}`;

      // Include current student answers in context if they exist
      const studentAnswersContext =
        Object.keys(answers).length > 0
          ? `\n\nSTUDENT'S CURRENT ANSWERS (DRAFT):\n${assignment.questions
              .map((q, i) => (answers[q.id] ? `Question ${i + 1} Answer: ${answers[q.id]}` : ""))
              .filter(Boolean)
              .join("\n")}`
          : "";

      const fullContext = assignmentContext + studentAnswersContext;

      // Map local ChatMessage to the format our API expects
      const historyForAi = aiMessages.map((m) => ({ role: m.role, content: m.content }));

      const response = await authenticatedFetch("/api/student/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage.content,
          userId: user?.uid,
          role: "student",
          mode: "tutor",
          chatHistory: historyForAi,
          assignmentContext: fullContext,
          // Lets the server pick the diagram kinds of this assignment's course.
          assignmentId: assignment?.id,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        // A plain 500 says only "Internal server error"; the generic text in the catch reads better.
        throw new Error(response.status === 500 ? "" : errorData.error || "");
      }

      const data = await response.json();
      const responseText = data.response || "No response received.";

      const aiResponse: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: responseText,
      };
      setAiMessages((prev) => [...prev, aiResponse]);
    } catch (error: unknown) {
      console.error("AI Error:", error);
      setAiMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: errorMessage(error) || "Raise couldn't reply just now. Please try again.",
        },
      ]);
    } finally {
      setAiLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles: File[] = [];
    const invalidFiles: string[] = [];

    files.forEach((file) => {
      const isValidType = file.type === "application/pdf" || file.type.startsWith("image/");
      const isValidSize = file.size <= 10 * 1024 * 1024; // 10MB limit (images will be compressed)

      if (!isValidType) {
        invalidFiles.push(`${file.name}: Invalid type (PDF or images only)`);
      } else if (!isValidSize) {
        invalidFiles.push(`${file.name}: Too large (max 10MB)`);
      } else {
        validFiles.push(file);
      }
    });

    if (invalidFiles.length > 0) {
      toast.error("Some files were not added:\n" + invalidFiles.join("\n"));
    }

    setUploadedFiles([...uploadedFiles, ...validFiles]);
    // Reset upload progress for new files
    setUploadProgress({});
  };

  const removeFile = (index: number) => {
    setUploadedFiles(uploadedFiles.filter((_, i) => i !== index));
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const calculateProgress = () => {
    if (!assignment) return 0;
    const answeredCount = Object.keys(answers).length;
    return Math.round((answeredCount / assignment.questions.length) * 100);
  };

  const handleSaveDraft = async () => {
    if (!assignment || !user) return false;
    ignoreNextBlurRef.current = true;
    setSubmitting(true);
    try {
      // Fetch student name from profile or students collection
      let studentName = profile?.displayName || user.displayName || "";
      if (!studentName) {
        try {
          const studentDoc = await getDoc(doc(db, "students", user.uid));
          if (studentDoc.exists()) {
            studentName = studentDoc.data().name || studentName;
          }
        } catch (error) {
          console.error("Error fetching student name:", error);
        }
      }

      const answersArray = assignment.questions.map((q) => ({
        questionId: q.id,
        questionText: q.text,
        answer: answers[q.id] || "",
      }));

      const submissionData = {
        assignmentId: assignment.id,
        studentId: user.uid,
        studentName: studentName,
        studentEmail: user.email,
        answers: answersArray,
        status: "draft",
        teacherId: assignment.teacherId,
        courseId: assignment.courseId,
        updatedAt: new Date(),
      };

      const response = await authenticatedFetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...submissionData, submissionId: existingSubmission?.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setExistingSubmission({ ...submissionData, id: result.id });
      toast.success("Draft saved!");
      return true;
    } catch (error) {
      console.error("Error saving draft:", error);
      toast.error("Failed to save draft.");
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const handleBackClick = () => {
    if (submitted || !hasStarted) {
      router.push(backHref);
      return;
    }
    setShowLeaveDialog(true);
  };

  const handleSaveAndLeave = async () => {
    if (await handleSaveDraft()) {
      router.push("/student/assignments");
    }
  };

  const handleSubmit = async () => {
    console.log("handleSubmit called");
    setSubmitError(null);
    if (!assignment || !user) return;
    ignoreNextBlurRef.current = true;
    // Validate work submission
    if (assignment.requireWorkSubmission && uploadedFiles.length === 0) {
      toast.error("Please upload your work (PDF or images) before submitting.");
      return;
    }
    setSubmitting(true);
    setUploadProgress({}); // Reset progress

    try {
      // Upload files to Firebase Storage (Blaze plan compatible)
      let workFilesData: WorkFile[] = [];
      if (uploadedFiles.length > 0) {
        workFilesData = await uploadFilesToStorage(
          uploadedFiles,
          user.uid,
          (fileIndex, progress) => {
            setUploadProgress((prev) => ({ ...prev, [fileIndex]: progress }));
          },
        );
      }

      const answersArray = assignment.questions.map((q) => ({
        questionId: q.id,
        questionText: q.text,
        answer: answers[q.id] || "",
      }));

      // Fetch student name from profile or students collection
      let studentName = profile?.displayName || user.displayName || "";
      if (!studentName) {
        try {
          const studentDoc = await getDoc(doc(db, "students", user.uid));
          if (studentDoc.exists()) {
            studentName = studentDoc.data().name || studentName;
          }
        } catch (error) {
          console.error("Error fetching student name:", error);
        }
      }

      // Check due date enforcement
      const isLate = isSubmissionLate(
        assignment.dueDate as DueDateLike | null | undefined,
        new Date(),
      );

      // Remove forbidden fields for student update
      const submissionData: Record<string, unknown> = {
        assignmentId: assignment.id,
        studentId: user.uid,
        studentName: studentName,
        studentEmail: user.email,
        answers: answersArray,
        submittedAt: new Date(),
        isLate,
        graded: false,
        totalPoints,
        earnedPoints: null,
        workFiles: workFilesData,
        unfocusCount,
        status: "submitted",
        teacherId: assignment.teacherId,
        courseId: assignment.courseId,
      };

      // Do not include score, feedback, gradedAnswers if present
      delete submissionData.score;
      delete submissionData.feedback;
      delete submissionData.gradedAnswers;

      const response = await authenticatedFetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...submissionData, submissionId: existingSubmission?.id }),
      });
      if (!response.ok) throw new Error((await response.json()).error || "Submission failed");

      const saved = await response.json().catch(() => ({}));
      setSubmitted(true);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      // Stay here: the dialog confirms the hand-in and shows the score when grading lands.
      if (typeof saved.id === "string") setSubmittedId(saved.id);
      else router.push("/student/grades");
    } catch (error) {
      console.error("Error submitting:", error);
      setSubmitError(error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    handleSubmitRef.current = handleSubmit;
  });

  if (loading) {
    return <LoadingSpinner fullPage />;
  }

  if (!assignment) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] w-full text-destructive font-bold">
        Assignment not found
      </div>
    );
  }

  if (!hasStarted && !submitted) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
          <Button variant="ghost" size="sm" onClick={handleBackClick}>
            <ArrowLeft /> Assignments
          </Button>
          <WorkspaceHeader title={assignment.title} description={assignment.description} />
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">
              {assignment.questions.length}{" "}
              {assignment.questions.length === 1 ? "question" : "questions"} · {totalPoints} points
            </Badge>
            <Badge variant="outline">
              {assignment.timeLimit ? `${assignment.timeLimit} minute limit` : "No time limit"}
            </Badge>
            {assignment.requireWorkSubmission && (
              <Badge variant="outline">Work upload required</Badge>
            )}
          </div>
          {assignment.readFirst && (
            <ReadFirst
              assignmentId={assignment.id}
              curriculumId={assignment.readFirst.curriculumId}
              topics={assignment.readFirst.topics}
              onAllRead={setLessonsRead}
            />
          )}
          <section
            aria-labelledby="before-start"
            className="space-y-2 rounded-xl border border-border bg-card p-4 sm:p-5"
          >
            <h2 id="before-start" className="text-base font-semibold">
              Before you start
            </h2>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
              {assignment.timeLimit && <li>The timer starts immediately and cannot be paused.</li>}
              {assignment.requireWorkSubmission && (
                <li>Upload a PDF or images of your work before submitting.</li>
              )}
              {assignment.requireWorkSubmission && assignment.timeLimit && (
                <li>After time expires, you have five minutes to upload your work.</li>
              )}
              {assignment.lockdownMode && (
                <li>
                  Lockdown starts in fullscreen. Switching tabs, exiting fullscreen, or attempting
                  to copy or paste may be logged. Right-click is disabled.
                </li>
              )}
              {!assignment.lockdownMode && (
                <li>
                  You don’t have to finish in one go. Save Draft keeps your answers so you can come
                  back.
                </li>
              )}
              {aiOn && (
                <li>
                  {assignment.allowAIHelp
                    ? "Stuck? Raise hand, at the top, gives you a hint on the question you’re on. It won’t give the answer."
                    : "Your teacher has turned hints off for this one, so Raise won’t open here."}
                </li>
              )}
              <li>
                {assignment.gradingType === "manual"
                  ? "Your teacher grades this one, so your score shows up on Grades once they have."
                  : assignment.questions.some((q) => q.type === "text")
                    ? "Multiple-choice and numeric answers are checked when you submit. Your teacher looks over written answers, so your score shows up on Grades once they have."
                    : "When you submit, it is graded straight away and you see feedback on each question."}
              </li>
              <li>Use a stable connection and keep this page open.</li>
            </ul>
          </section>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={handleStartAssignment}
              disabled={!!assignment.readFirst && !lessonsRead}
            >
              <Play /> Start Assignment
            </Button>
            {assignment.readFirst && !lessonsRead && (
              <p className="text-sm text-muted-foreground">
                Read the lesson{assignment.readFirst.topics.length === 1 ? "" : "s"} above to start.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  const blankCount = assignment.questions.filter((q) => !(answers[q.id] ?? "").trim()).length;

  const raisePanel = (
    <RaiseHelpPanel
      questions={assignment.questions}
      messages={aiMessages}
      loading={aiLoading}
      input={aiInput}
      onInputChange={setAiInput}
      onSend={handleAiSendMessage}
      focusedQuestionIndex={focusedQuestionIndex}
      onFocusChange={setFocusedQuestionIndex}
      onReset={handleResetChat}
      onClose={closeAiHelper}
      copiedMessageId={copiedMessageId}
      onCopy={handleCopyMessage}
    />
  );

  return (
    <div className="relative flex min-h-0 flex-1 w-full overflow-hidden bg-background">
      <Dialog open={showUnfocusPopup}>
        <DialogContent
          className={`sm:max-w-md border-2 ${unfocusCount <= 1 ? "border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30" : "border-red-500 bg-red-50 dark:bg-red-950/30"}`}
          showCloseButton={false}
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle
              className={`flex items-center gap-2 text-lg font-bold ${unfocusCount <= 1 ? "text-yellow-700 dark:text-yellow-500" : "text-red-600"}`}
            >
              {unfocusCount <= 1 ? (
                <AlertCircle className="h-6 w-6 text-yellow-600" />
              ) : (
                <AlertTriangle className="h-6 w-6 text-red-500" />
              )}
              {unfocusCount <= 1 ? "Tab Switch Detected" : "Academic Integrity Violation"}
            </DialogTitle>
            <DialogDescription
              className={`pt-3 text-sm leading-relaxed ${unfocusCount <= 1 ? "text-yellow-800/80 dark:text-yellow-200/80" : "text-red-800/80 dark:text-red-200/80"}`}
            >
              {unfocusCount <= 1 ? (
                <div className="space-y-2 font-medium">
                  <p>It looks like you navigated away from the assignment tab.</p>
                  <p>
                    Please remain on this page to ensure your assessment is completed without
                    interruption. This is your first warning.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p>You have left this page {unfocusCount} times.</p>
                  {/* Nothing is sent when the page loses focus; the count goes with the submission.
                      Say exactly that rather than claim the teacher has already been told. */}
                  <p className="font-bold text-red-700 dark:text-red-400">
                    Your teacher will see this count when you submit.
                  </p>
                  <p className="text-xs opacity-80 mt-2 italic">
                    Continued violations may result in disciplinary action or a zero on this
                    assessment.
                  </p>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center mt-6">
            <Button
              size="lg"
              variant={unfocusCount <= 1 ? "default" : "destructive"}
              onClick={() => setShowUnfocusPopup(false)}
              className="w-full sm:w-auto px-10 shadow-lg font-bold uppercase tracking-wide cursor-pointer"
            >
              {unfocusCount <= 1 ? "Return to Assignment" : "Acknowledge Violation"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <SubmittedDialog
        submissionId={submittedId}
        assignmentId={assignment.id}
        title={assignment.title}
        teacherGraded={assignment.gradingType === "manual"}
      />

      <Dialog open={confirmBlank} onOpenChange={setConfirmBlank}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {blankCount === 1 ? "1 question is blank" : `${blankCount} questions are blank`}
            </DialogTitle>
            <DialogDescription>
              Blank answers get no points, and you can’t change them after you submit.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => setConfirmBlank(false)}>
              Keep working
            </Button>
            <Button
              onClick={() => {
                setConfirmBlank(false);
                void handleSubmit();
              }}
            >
              Submit anyway
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save your progress?</DialogTitle>
            <DialogDescription>Save a draft before leaving?</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => router.push("/student/assignments")}>
              Leave without saving
            </Button>
            <Button onClick={handleSaveAndLeave} disabled={submitting}>
              <Save className="mr-2 h-4 w-4" />
              Save draft & leave
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ResizablePanelGroup direction="horizontal" className="h-full w-full">
        <ResizablePanel
          id="main-content"
          order={1}
          defaultSize={aiHelperOpen && !isMobile ? 68 : 100}
          className="h-full flex flex-col min-w-0"
        >
          <div className="flex-1 overflow-y-auto relative scroll-smooth">
            <div className="mx-auto max-w-4xl space-y-5 px-4 pb-16 sm:px-6">
              <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-border bg-background py-3">
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleBackClick}
                    className="px-2 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back
                  </Button>
                  {assignment.lockdownMode && hasStarted && !submitted && (
                    <div className="flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive">
                      <Lock className="h-3 w-3" />
                      Locked
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="hidden flex-col items-end lg:flex">
                    <span className="text-xs text-muted-foreground">Progress</span>
                    <div className="w-24 h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-500"
                        style={{ width: `${calculateProgress()}%` }}
                      />
                    </div>
                  </div>

                  {timeLeft !== null && !submitted && (
                    <div className="flex flex-col items-end gap-1">
                      {inGracePeriod && (
                        <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                          GRACE PERIOD
                        </span>
                      )}
                      <div
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md font-mono font-bold text-sm ${inGracePeriod ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" : timeLeft < 60 ? "bg-destructive/10 text-destructive" : "bg-secondary"}`}
                      >
                        <Clock className="h-3.5 w-3.5" />
                        {formatTime(timeLeft)}
                      </div>
                    </div>
                  )}

                  {assignment?.allowCalculator && !submitted && (
                    <Button
                      variant={calculatorOpen ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => setCalculatorOpen(!calculatorOpen)}
                      aria-label="Calculator"
                      aria-pressed={calculatorOpen}
                    >
                      <Calculator className="h-4 w-4" />
                      <span className="hidden sm:inline">Calculator</span>
                    </Button>
                  )}

                  {aiOn && assignment?.allowAIHelp && !submitted && (
                    <Button
                      variant={aiHelperOpen ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => setAiHelperOpen(!aiHelperOpen)}
                      aria-label="Raise hand"
                      aria-pressed={aiHelperOpen}
                    >
                      <Hand className={`h-4 w-4`} />
                      <span className="hidden sm:inline">Raise hand</span>
                    </Button>
                  )}
                </div>
              </div>

              <section className="border-b border-border pb-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h1 className="break-words text-2xl font-semibold tracking-tight">
                      {assignment.title}
                    </h1>
                    <CardDescription className="mt-2 max-w-2xl leading-relaxed">
                      {assignment.description}
                    </CardDescription>
                  </div>
                  {submitted && (
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <Badge variant="secondary">
                        {existingSubmission?.graded ? (
                          <>
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Graded
                          </>
                        ) : (
                          <>
                            <Clock className="h-3 w-3 mr-1" />
                            Submitted
                          </>
                        )}
                      </Badge>
                      {existingSubmission?.graded && existingSubmission?.score !== undefined && (
                        <div className="text-2xl font-black tracking-tighter text-card-foreground">
                          {existingSubmission.score}%
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="mt-5 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {assignment.dueDate && (
                    <Badge variant="outline" className="bg-muted/50">
                      <Clock className="mr-1.5 h-3.5 w-3.5" />
                      Due {new Date(assignment.dueDate).toLocaleDateString()}
                    </Badge>
                  )}
                  <Badge variant="outline" className="bg-muted/50">
                    <FileText className="mr-1.5 h-3.5 w-3.5" />
                    {assignment.questions.length}{" "}
                    {assignment.questions.length === 1 ? "question" : "questions"}
                  </Badge>
                  <Badge variant="outline" className="bg-muted/50">
                    {totalPoints} points total
                  </Badge>
                  {assignment.timeLimit && (
                    <Badge variant="outline" className="bg-muted/50">
                      {assignment.timeLimit} minute limit
                    </Badge>
                  )}
                </div>
                {solutionsNotice(solutions) && (
                  <p className="mt-3 text-xs text-muted-foreground">{solutionsNotice(solutions)}</p>
                )}
              </section>

              <div className="space-y-4">
                {assignment.questions.map((question, index) => {
                  const gradedAnswer = isGraded
                    ? existingSubmission?.answers?.find((a) => a.questionId === question.id)
                    : undefined;
                  // Following a link while the page watches for tab switches would count against
                  // the student, so those assignments get the guide link once they are handed in.
                  const watched =
                    !submitted && (assignment.lockdownMode || assignment.enableTabDetection);
                  const guideHref = watched
                    ? null
                    : topicGuideHref(assignment.curriculumId, question.apTopic);
                  const mistakeHref = gradedAnswer
                    ? misconceptionGuideHref(
                        assignment.curriculumId,
                        question.apTopic,
                        gradedAnswer.misconceptions,
                        unitGuides.get(guideUnitOf(question.apTopic) ?? -1),
                      )
                    : null;
                  return (
                    <Card
                      key={question.id}
                      className="overflow-hidden gap-0 border-border py-0 shadow-none"
                    >
                      <CardHeader className="bg-muted/20 border-b px-4 pt-3 [.border-b]:pb-3 sm:px-6">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <h2 className="text-sm font-semibold">Question {index + 1}</h2>
                            {existingSubmission?.graded && (
                              <Badge variant="secondary" className="text-[10px] font-bold">
                                {existingSubmission.answers?.find(
                                  (a) => a.questionId === question.id,
                                )?.score ?? 0}{" "}
                                / {question.points ?? 10} PTS
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {assignment.allowCalculator && !submitted && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={openGraph}
                                className="h-7 gap-1.5 px-2 text-xs font-normal text-muted-foreground hover:text-foreground"
                                aria-label={`Graph for Question ${index + 1}`}
                                title="Open the graphing calculator"
                              >
                                <LineChart className="size-3.5" />
                                Graph
                              </Button>
                            )}
                            {guideHref && (
                              <GuideLink href={guideHref} newTab={!submitted}>
                                Lesson
                              </GuideLink>
                            )}
                            <Badge variant="outline">{question.points || 10} pts</Badge>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4 p-4 sm:p-6">
                        <MarkdownRenderer className="prose prose-sm dark:prose-invert max-w-none text-foreground leading-relaxed">
                          {question.text}
                        </MarkdownRenderer>

                        <div className="pt-2">
                          {question.type === "multiple-choice" && question.options ? (
                            <RadioGroup
                              value={answers[question.id] || ""}
                              onValueChange={(value) =>
                                setAnswers({ ...answers, [question.id]: value })
                              }
                              disabled={submitted}
                            >
                              {question.options.map((option, optionIndex) => (
                                <div key={optionIndex} className="flex items-center space-x-2">
                                  <RadioGroupItem
                                    value={option}
                                    id={`${question.id}-${optionIndex}`}
                                  />
                                  <Label htmlFor={`${question.id}-${optionIndex}`}>{option}</Label>
                                </div>
                              ))}
                            </RadioGroup>
                          ) : question.type === "true-false" ? (
                            <RadioGroup
                              value={answers[question.id] || ""}
                              onValueChange={(value) =>
                                setAnswers({ ...answers, [question.id]: value })
                              }
                              disabled={submitted}
                            >
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="True" id={`${question.id}-true`} />
                                <Label htmlFor={`${question.id}-true`}>True</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="False" id={`${question.id}-false`} />
                                <Label htmlFor={`${question.id}-false`}>False</Label>
                              </div>
                            </RadioGroup>
                          ) : question.type === "numeric" ? (
                            <MathInputField
                              value={answers[question.id] || ""}
                              onChange={(value) => setAnswers({ ...answers, [question.id]: value })}
                              placeholder="Your answer with its unit, like 12.5 m/s"
                              ariaLabel={`Answer to question ${index + 1}`}
                              disabled={submitted}
                              rows={1}
                            />
                          ) : question.type === "short-answer" ? (
                            <MathInputField
                              value={answers[question.id] || ""}
                              onChange={(value) => setAnswers({ ...answers, [question.id]: value })}
                              placeholder="Type your answer here…"
                              ariaLabel={`Answer to question ${index + 1}`}
                              disabled={submitted}
                              rows={2}
                            />
                          ) : (
                            <MathInputField
                              value={answers[question.id] || ""}
                              onChange={(value) => setAnswers({ ...answers, [question.id]: value })}
                              placeholder="Type your answer here…"
                              ariaLabel={`Answer to question ${index + 1}`}
                              disabled={submitted}
                              rows={4}
                            />
                          )}
                        </div>

                        {existingSubmission?.graded && (
                          <div className="mt-8 pt-6 border-t space-y-4">
                            {existingSubmission.answers?.find((a) => a.questionId === question.id)
                              ?.feedback && (
                              <div className="bg-muted/30 rounded-xl p-5 border">
                                <div className="flex items-center gap-2 mb-2">
                                  <MessagesSquare className="h-4 w-4 text-primary" />
                                  <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                                    Feedback
                                  </span>
                                </div>
                                <div className="text-sm leading-relaxed text-foreground italic">
                                  &quot;
                                  {
                                    existingSubmission.answers?.find(
                                      (a) => a.questionId === question.id,
                                    )?.feedback
                                  }
                                  &quot;
                                </div>
                              </div>
                            )}

                            {mistakeHref && (
                              <GuideLink href={mistakeHref}>Why this is a common mistake</GuideLink>
                            )}

                            <SolutionBlock
                              correctAnswer={question.correctAnswer}
                              score={gradedAnswer?.score}
                              points={question.points || 10}
                              solution={solutions?.solutions[question.id]}
                              pending={solutionsNotice(solutions)}
                            />
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {!submitted && assignment.requireWorkSubmission && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Upload className="h-5 w-5" />
                      Upload Your Work{" "}
                      {assignment.requireWorkSubmission && <span className="text-red-500">*</span>}
                    </CardTitle>
                    <CardDescription>
                      {inGracePeriod
                        ? "Time's up! You have 5 minutes to upload your work before automatic submission."
                        : "Upload PDFs or images of your work. Required to submit this assignment."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-4">
                      <input
                        type="file"
                        id="workFiles"
                        accept="application/pdf,image/*"
                        multiple
                        onChange={handleFileChange}
                        className="hidden"
                        disabled={submitted}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          lastUploadClickTime.current = Date.now();
                          document.getElementById("workFiles")?.click();
                        }}
                        disabled={submitted}
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        Choose Files
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        PDF or Images (Max 10MB each, images will be compressed)
                      </span>
                    </div>

                    {uploadedFiles.length > 0 && (
                      <div className="space-y-2">
                        <Label>Uploaded Files ({uploadedFiles.length})</Label>
                        <div className="space-y-2">
                          {uploadedFiles.map((file, index) => (
                            <div
                              key={index}
                              className="flex items-center justify-between p-2 bg-secondary rounded-md"
                            >
                              <div className="flex items-center gap-2 flex-1">
                                {file.type === "application/pdf" ? (
                                  <FileText className="h-4 w-4" />
                                ) : (
                                  <ImageIcon className="h-4 w-4" />
                                )}
                                <div className="flex-1 min-w-0">
                                  <span className="text-sm truncate block">{file.name}</span>
                                  <span className="text-xs text-muted-foreground">
                                    ({(file.size / 1024).toFixed(1)} KB)
                                  </span>
                                  {submitting && uploadProgress[index] !== undefined && (
                                    <div className="mt-1">
                                      <div className="w-full bg-muted rounded-full h-1.5">
                                        <div
                                          className="bg-primary h-1.5 rounded-full transition-all duration-300"
                                          style={{ width: `${uploadProgress[index]}%` }}
                                        ></div>
                                      </div>
                                      <span className="text-xs text-muted-foreground mt-1">
                                        {uploadProgress[index] < 100 ? "Uploading..." : "Complete"}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeFile(index)}
                                disabled={submitted || submitting}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {!submitted && (
                <div className="flex flex-wrap justify-end gap-2">
                  {submitError && (
                    <div className="border border-destructive/30 bg-destructive/10 text-destructive rounded p-2 text-sm text-center w-full">
                      Submission failed: {submitError}
                    </div>
                  )}
                  {!assignment.lockdownMode && (
                    <Button
                      onClick={handleSaveDraft}
                      disabled={submitting}
                      variant="outline"
                      className="w-full sm:w-auto"
                    >
                      Save Draft
                    </Button>
                  )}
                  <Button
                    onClick={() => (blankCount > 0 ? setConfirmBlank(true) : handleSubmit())}
                    disabled={
                      submitting || (assignment.requireWorkSubmission && uploadedFiles.length === 0)
                    }
                    className="w-full sm:w-auto"
                  >
                    {submitting ? (
                      Object.keys(uploadProgress).length > 0 ? (
                        `Uploading... (${Math.round(Object.values(uploadProgress).reduce((a, b) => a + b, 0) / Object.keys(uploadProgress).length)}%)`
                      ) : (
                        "Submitting..."
                      )
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Submit Assignment
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </ResizablePanel>

        {!isMobile && aiOn && aiHelperOpen && (
          <>
            <ResizableHandle withHandle />
            <ResizablePanel
              id="ai-tutor-panel"
              order={2}
              defaultSize={32}
              minSize={22}
              className="flex h-full flex-col overflow-hidden"
            >
              {raisePanel}
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isMobile && aiOn && aiHelperOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setAiHelperOpen(false)}
              aria-hidden="true"
              className="fixed inset-0 bg-black/40 z-[100]"
            />
            <motion.div
              ref={mobileDrawerRef}
              role="dialog"
              aria-modal="true"
              aria-label="Raise"
              tabIndex={-1}
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 right-0 z-[101] flex w-[88%] max-w-[420px] flex-col bg-background shadow-2xl border-l border-border outline-none"
            >
              {raisePanel}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Scientific Calculator Floating Widget */}
      {assignment?.allowCalculator && (
        <ScientificCalculator
          isOpen={calculatorOpen}
          onClose={() => setCalculatorOpen(false)}
          mode={calculatorMode}
          onModeChange={setCalculatorMode}
          restoreSignal={calculatorRestore}
        />
      )}
    </div>
  );
}

export default function AssignmentDetailPage() {
  return (
    <Suspense fallback={<LoadingSpinner fullPage />}>
      <AssignmentDetailContent />
    </Suspense>
  );
}
