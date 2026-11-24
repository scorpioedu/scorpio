"use client";

// Raise chat, shared by students (/student/tutor) and teachers (/teacher/raise). Both keep their chats
// in tutor_sessions under their own uid (the field is named studentId for history; the rules only
// check it is the caller). RAISE_VARIANTS holds what differs: endpoint, copy, starters, modes.
import { authenticatedFetch } from "@/lib/authenticated-fetch";

import * as React from "react";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/contexts/auth-context";
import { JoinClassForm } from "@/components/student/join-class-form";
import { ChatContainerContent, ChatContainerRoot } from "@/components/prompt-kit/chat-container";
import {
  Message as PromptMessage,
  MessageAction,
  MessageActions,
  MessageContent,
} from "@/components/prompt-kit/message";
import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from "@/components/prompt-kit/prompt-input";
import { ScrollButton } from "@/components/prompt-kit/scroll-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { RaiseLogo } from "@/components/ui/raise-logo";
import { RaiseImpactNote } from "@/components/student/raise-impact-note";
import { RaiseImpactNotice } from "@/components/raise/raise-impact-notice";
import { hideOpenDiagramBlock } from "@/lib/diagram/blocks";
import { cn } from "@/lib/utils";
import { Organization } from "@/lib/types";
import { db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  collection,
  query,
  where,
  deleteDoc,
  addDoc,
} from "firebase/firestore";
import { toast } from "sonner";
import {
  ArrowLeft,
  Activity,
  FileQuestion,
  ListChecks,
  ArrowUp,
  Check,
  Copy,
  Edit2,
  LineChart,
  MessageSquare,
  Mic,
  MicOff,
  MoreHorizontal,
  Move,
  PanelLeft,
  Pencil,
  PlusIcon,
  Search,
  Trash,
  Trash2,
  Triangle,
  X,
} from "lucide-react";

// Typewriter effect for fresh assistant responses
// The reveal takes a set time, not a set speed: about 2.5 ms a character, between 0.4 s and 1.5 s.
// (It used to add one character every 8 ms and re-render the markdown each time, so a long reply
// took a minute or more.)
function revealMs(length: number): number {
  return Math.min(1500, Math.max(400, length * 2.5));
}

function Typewriter({ text, onDone }: { text: string; onDone?: () => void }) {
  const [displayed, setDisplayed] = useState("");
  // The parent passes a new onDone on every render; keep it in a ref so a re-render (a save landing,
  // the session list updating) does not restart the reveal from the start.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (!text) return;
    const duration = revealMs(text.length);
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      setDisplayed(text.slice(0, Math.ceil(progress * text.length)));
      if (progress < 1) frame = requestAnimationFrame(step);
      else onDoneRef.current?.();
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [text]);

  // A diagram appears whole once its block has finished typing.
  return <MarkdownRenderer>{hideOpenDiagramBlock(displayed)}</MarkdownRenderer>;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  type?: "concept" | "problem";
}

interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

function groupSessionsByPeriod(sessions: ChatSession[]) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400000;
  const startOf7Days = startOfToday - 6 * 86400000;
  const startOf30Days = startOfToday - 29 * 86400000;

  const groups: { period: string; conversations: ChatSession[] }[] = [
    { period: "Today", conversations: [] },
    { period: "Yesterday", conversations: [] },
    { period: "Last 7 days", conversations: [] },
    { period: "Last 30 days", conversations: [] },
    { period: "Older", conversations: [] },
  ];

  sessions.forEach((session) => {
    const time = session.updatedAt || session.createdAt || 0;
    if (time >= startOfToday) {
      groups[0].conversations.push(session);
    } else if (time >= startOfYesterday) {
      groups[1].conversations.push(session);
    } else if (time >= startOf7Days) {
      groups[2].conversations.push(session);
    } else if (time >= startOf30Days) {
      groups[3].conversations.push(session);
    } else {
      groups[4].conversations.push(session);
    }
  });

  return groups.filter((g) => g.conversations.length > 0);
}

// Each example asks for something Raise can draw (a graph, the forces on an object, a setup), so a
// first reply shows a diagram and not only text. They use Concept mode: in Problem mode Raise asks
// the student to draw their own free-body diagram.
const STARTER_PROMPTS = [
  {
    tag: "Motion graph",
    icon: LineChart,
    prompt:
      "Show me a velocity–time graph for a ball thrown straight up, and explain what the slope and the area tell me.",
  },
  {
    tag: "Forces",
    icon: Move,
    prompt: "Draw the forces on a box sliding down a rough 30° ramp and explain each one.",
  },
  {
    tag: "Setup",
    icon: Triangle,
    prompt:
      "Sketch a cart on a table tied over a pulley to a hanging mass, and explain why they share one acceleration.",
  },
  {
    tag: "Oscillation",
    icon: Activity,
    prompt:
      "Graph position against time for a mass on a spring and show where amplitude and period appear on it.",
  },
];

const FOLLOW_UPS = [
  "Can you show that as a diagram?",
  "Give me a worked example.",
  "Quiz me on this.",
];

// Teachers get full answers, so the starters are lesson-prep jobs; two still ask for a diagram.
const TEACHER_STARTERS = [
  {
    tag: "Practice set",
    icon: FileQuestion,
    prompt: "Write 3 AP Physics 1 problems on projectile motion, easy to hard, with an answer key.",
  },
  {
    tag: "Motion graph",
    icon: LineChart,
    prompt: "Draw a velocity–time graph for a ball thrown straight up and caught at the same height.",
  },
  {
    tag: "Forces",
    icon: Move,
    prompt: "Draw a free-body diagram for a block sliding down a rough 30° incline, and solve for its acceleration.",
  },
  {
    tag: "Misconceptions",
    icon: ListChecks,
    prompt: "What misconceptions do students usually have about Newton's third law, and how do I address each?",
  },
];

const TEACHER_FOLLOW_UPS = [
  "Make it harder.",
  "Write 3 more like this.",
  "Turn this into a short quiz.",
];

export type RaiseVariant = "student" | "teacher";

const RAISE_VARIANTS = {
  student: {
    endpoint: "/api/student/tutor",
    home: "/student",
    modes: true,
    starters: STARTER_PROMPTS,
    followUps: FOLLOW_UPS,
    heading: (name?: string) => (name ? `Hi ${name}, what are you stuck on?` : "What are you stuck on?"),
    intro: "Ask about an idea or a problem. Raise explains, draws diagrams and gives hints, not answers. It is optional.",
    placeholder: "Ask about a physics concept…",
  },
  teacher: {
    endpoint: "/api/teacher/raise",
    home: "/teacher",
    modes: false,
    starters: TEACHER_STARTERS,
    followUps: TEACHER_FOLLOW_UPS,
    heading: (name?: string) => (name ? `Hi ${name}, what are you preparing?` : "What are you preparing?"),
    intro: "Practice sets with answer keys, worked solutions, rubrics and diagrams. Unlike the student version, Raise gives you the whole answer.",
    placeholder: "Ask for a practice set, a worked solution, a diagram…",
  },
};

/** A short chat title from the student's first question, cut at a word. */
function titleFromQuestion(question: string): string {
  const text = question.replace(/\s+/g, " ").trim();
  if (text.length <= 42) return text || "New chat";
  const cut = text.slice(0, 42);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 20 ? cut.lastIndexOf(" ") : 42)}…`;
}

const EASE = [0.16, 1, 0.3, 1] as const;
const RISE = {
  hidden: { opacity: 0, y: 10 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.35, ease: EASE } },
};

/** Raise's mark, shown beside its messages. */
function RaiseAvatar({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary",
        className,
      )}
    >
      <RaiseLogo size={14} />
    </span>
  );
}

/** "Thinking" with a highlight sweeping across the words while a reply is on its way. */
function ThinkingLine() {
  return (
    <motion.div
      role="status"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, ease: EASE }}
      className="flex items-center gap-3"
    >
      <motion.span
        animate={{ scale: [1, 1.08, 1] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
      >
        <RaiseAvatar />
      </motion.span>
      <motion.span
        className="bg-clip-text text-sm font-medium text-transparent"
        style={{
          backgroundImage:
            "linear-gradient(90deg, var(--muted-foreground) 35%, var(--foreground) 50%, var(--muted-foreground) 65%)",
          backgroundSize: "200% 100%",
        }}
        animate={{ backgroundPosition: ["100% 0%", "-100% 0%"] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
      >
        Working through it…
      </motion.span>
    </motion.div>
  );
}

const MODES = [
  { value: "concept" as const, label: "Concept", hint: "Explain an idea" },
  { value: "problem" as const, label: "Problem", hint: "Work through a problem with hints" },
];

export function RaiseChat({ variant }: { variant: RaiseVariant }) {
  const cfg = RAISE_VARIANTS[variant];
  const router = useRouter();
  const { user, profile } = useAuth();

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const openedNewest = useRef(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<"concept" | "problem">("concept");
  const [typingId, setTypingId] = useState<string | null>(null);

  // Sidebar & Search state
  // Chat history starts open on a wide screen and closed on a phone, until the student chooses.
  const [sidebarChoice, setSidebarOpen] = useState<boolean | null>(null);
  const isMobile = useIsMobile();
  const sidebarOpen = sidebarChoice ?? !isMobile;
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [showSearchInput, setShowSearchInput] = useState(false);

  // Rename modal / inline state
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editingTitleText, setEditingTitleText] = useState("");

  // Delete modal state
  const [sessionToDelete, setSessionToDelete] = useState<ChatSession | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<{ stop: () => void; start: () => void } | null>(null);

  // Plan check & usage state
  const [rateLimitError, setRateLimitError] = useState<string | null>(null);
  const [orgData, setOrgData] = useState<Organization | null>(null);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll when messages change or loading
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, isLoading]);

  // Plan verification
  useEffect(() => {
    async function checkPlan() {
      const studentProfile = profile as (typeof profile & { teacherId?: string }) | null;
      let organizationId = studentProfile?.organizationId;

      if (!organizationId && studentProfile?.teacherId) {
        try {
          const teacherDoc = await getDoc(doc(db, "users", studentProfile.teacherId));
          if (teacherDoc.exists()) {
            organizationId = teacherDoc.data()?.organizationId;
          }
        } catch (e) {
          console.error("Error fetching teacher org", e);
        }
      }

      if (!organizationId) return;

      try {
        const orgSnap = await getDoc(doc(db, "organizations", organizationId));
        if (orgSnap.exists()) {
          const data = orgSnap.data() as Organization;
          setOrgData(data);
        }
      } catch (e) {
        console.error("Error checking plan:", e);
      }
    }
    if (profile) checkPlan();
  }, [profile]);

  // Load all sessions from Firestore
  useEffect(() => {
    if (!user || user.uid === "loading") return;

    const sessionsRef = collection(db, "tutor_sessions");
    const q = query(sessionsRef, where("studentId", "==", user.uid));

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const loaded: ChatSession[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            title: data.title || "Untitled Chat",
            messages: data.messages || [],
            createdAt:
              data.createdAt?.toMillis?.() ??
              (data.createdAt?.seconds ? data.createdAt.seconds * 1000 : 0),
            updatedAt:
              data.updatedAt?.toMillis?.() ??
              (data.updatedAt?.seconds ? data.updatedAt.seconds * 1000 : 0),
          };
        });

        loaded.sort((a, b) => b.updatedAt - a.updatedAt);
        setSessions(loaded);

        // Open the newest conversation once, when the page loads. Later changes to the list (a
        // delete, a rename, a save from another tab) must not pull the student out of New Chat.
        if (!openedNewest.current) {
          openedNewest.current = true;
          setActiveSessionId((curr) => curr ?? loaded[0]?.id ?? null);
        }
      },
      (error) => {
        console.error("Sessions listener error:", error);
      },
    );

    return () => unsubscribe();
  }, [user]);

  // Load active session messages from Firestore
  useEffect(() => {
    // Every place that clears the active session also clears the messages.
    if (!user || !activeSessionId) return;

    const sessionRef = doc(db, "tutor_sessions", activeSessionId);
    const unsubscribe = onSnapshot(
      sessionRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setMessages(data.messages || []);
        }
      },
      (error) => {
        console.error("Active session listener error:", error);
      },
    );

    return () => unsubscribe();
  }, [user, activeSessionId]);

  // Switch session
  const switchSession = useCallback((session: ChatSession) => {
    setActiveSessionId(session.id);
    setMessages(session.messages);
    setRateLimitError(null);
    setTypingId(null);
  }, []);

  // Create new session
  const createNewSession = useCallback(async () => {
    setActiveSessionId(null);
    setMessages([]);
    setPrompt("");
    setRateLimitError(null);
    setTypingId(null);
  }, []);

  // Delete chat session
  const handleDeleteSession = useCallback(
    async (session: ChatSession) => {
      if (!user) return;
      try {
        await deleteDoc(doc(db, "tutor_sessions", session.id));
        toast.success(`Deleted "${session.title}"`);

        if (activeSessionId === session.id) {
          const remaining = sessions.filter((s) => s.id !== session.id);
          if (remaining.length > 0) {
            setActiveSessionId(remaining[0].id);
            setMessages(remaining[0].messages);
          } else {
            setActiveSessionId(null);
            setMessages([]);
          }
        }
      } catch (err) {
        console.error("Delete session error:", err);
        toast.error("Failed to delete chat");
      }
    },
    [user, activeSessionId, sessions],
  );

  // Rename session
  const handleRename = useCallback(
    async (sessionId: string, newTitle: string) => {
      if (!user || !newTitle.trim()) {
        setEditingTitleId(null);
        return;
      }
      try {
        await updateDoc(doc(db, "tutor_sessions", sessionId), {
          title: newTitle.trim(),
          updatedAt: serverTimestamp(),
        });
        setEditingTitleId(null);
        toast.success("Chat renamed");
      } catch (e) {
        console.error("Rename error:", e);
        toast.error("Failed to rename chat");
      }
    },
    [user],
  );

  // Delete single message
  const handleDeleteMessage = useCallback(
    async (messageId: string) => {
      const updated = messages.filter((m) => m.id !== messageId);
      setMessages(updated);

      if (activeSessionId) {
        try {
          await updateDoc(doc(db, "tutor_sessions", activeSessionId), {
            messages: updated,
            updatedAt: serverTimestamp(),
          });
          toast.success("Message deleted");
        } catch (e) {
          console.error("Error deleting message:", e);
          toast.error("Failed to delete message from history");
        }
      }
    },
    [messages, activeSessionId],
  );

  // Edit / Reprompt user message
  const handleEditMessage = useCallback((content: string) => {
    setPrompt(content);
  }, []);

  // Copy message to clipboard
  const handleCopyMessage = useCallback((content: string) => {
    navigator.clipboard.writeText(content);
    toast.success("Copied to clipboard");
  }, []);

  // Keyboard shortcut: Cmd+N / Ctrl+N for new chat, Cmd+K for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSidebarOpen(false);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        createNewSession();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSidebarOpen(true);
        setShowSearchInput(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [createNewSession]);

  // Voice recording toggle
  const toggleVoiceRecording = useCallback(() => {
    if (typeof window === "undefined") return;

    const windowWithSpeech = window as unknown as {
      SpeechRecognition?: new () => {
        continuous: boolean;
        interimResults: boolean;
        lang: string;
        onstart: () => void;
        onresult: (event: {
          results: { [key: number]: { [key: number]: { transcript: string } } };
        }) => void;
        onerror: (event: { error: string }) => void;
        onend: () => void;
        start: () => void;
        stop: () => void;
      };
      webkitSpeechRecognition?: new () => {
        continuous: boolean;
        interimResults: boolean;
        lang: string;
        onstart: () => void;
        onresult: (event: {
          results: { [key: number]: { [key: number]: { transcript: string } } };
        }) => void;
        onerror: (event: { error: string }) => void;
        onend: () => void;
        start: () => void;
        stop: () => void;
      };
    };

    const SpeechRecognitionClass =
      windowWithSpeech.SpeechRecognition || windowWithSpeech.webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      toast.error("Voice input is not supported by your browser");
      return;
    }

    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }

    try {
      const recognition = new SpeechRecognitionClass();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "en-US";

      recognition.onstart = () => {
        setIsRecording(true);
        toast.info("Listening... Speak your physics question");
      };

      recognition.onresult = (event: {
        results: { [key: number]: { [key: number]: { transcript: string } } };
      }) => {
        const transcript = event.results[0]?.[0]?.transcript;
        if (transcript) {
          setPrompt((prev) => (prev ? `${prev} ${transcript}` : transcript));
        }
      };

      recognition.onerror = (event: { error: string }) => {
        console.error("Speech recognition error:", event.error);
        setIsRecording(false);
        toast.error("Voice recognition failed. Please try typing.");
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error("Voice start error:", err);
      setIsRecording(false);
      toast.error("Could not start voice input");
    }
  }, [isRecording]);

  // Submit chat prompt
  const handleSubmit = async (textToSubmit?: string) => {
    const inputContent = (textToSubmit || prompt).trim();
    if (!inputContent || isLoading) return;

    setRateLimitError(null);

    if (!user || user.uid === "loading") {
      toast.error("Please wait... loading user profile");
      return;
    }

    setPrompt("");
    setIsLoading(true);

    const newUserMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: inputContent,
      type: mode,
    };

    // Create session in Firestore if none active. It starts with the question in it: the session
    // listener replaces the messages with the saved ones, and an empty list would hide the question
    // until the reply arrives.
    let sessionId = activeSessionId;
    const createdForThisMessage = !sessionId;
    if (!sessionId) {
      try {
        const newRef = await addDoc(collection(db, "tutor_sessions"), {
          studentId: user.uid,
          title: inputContent.slice(0, 35) || "New Physics Chat",
          messages: [newUserMessage],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        sessionId = newRef.id;
        setActiveSessionId(sessionId);
      } catch (err) {
        console.error("Error creating session:", err);
        toast.error("Failed to initialize conversation");
        setIsLoading(false);
        return;
      }
    }

    const updatedMessages = [...messages, newUserMessage];
    setMessages(updatedMessages);

    try {
      const chatHistory = messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      const res = await authenticatedFetch(cfg.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          variant === "student"
            ? { message: inputContent, userId: user.uid, role: "student", mode, chatHistory }
            : { message: inputContent, userId: user.uid, chatHistory },
        ),
      });

      const data = await res.json();
      // A plain 500 says only "Internal server error"; the generic text below reads better. Other
      // statuses (budget limits, 502/503 "please try again") carry a message meant for students.
      if (!res.ok) throw new Error(res.status === 500 ? "" : data.error || "");

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.response,
        type: mode,
      };

      const finalMessages = [...updatedMessages, assistantMessage];
      setMessages(finalMessages);
      setTypingId(assistantMessage.id);

      // Title the chat after its first question. (The title endpoint is a placeholder that answers
      // "Physics conversation" for everything, which made every chat in the list look the same.)
      const newTitle = finalMessages.length === 2 ? titleFromQuestion(inputContent) : undefined;

      if (sessionId) {
        await updateDoc(doc(db, "tutor_sessions", sessionId), {
          messages: finalMessages,
          updatedAt: serverTimestamp(),
          ...(newTitle ? { title: newTitle } : {}),
        });
      }
    } catch (error: unknown) {
      console.error("Error getting response:", error);
      // Server errors carry a friendly message (budget, 502/503 "please try again"); network and JSON
      // failures do not, so they get the generic text.
      const errMessage =
        error instanceof Error &&
        !(error instanceof TypeError) &&
        !(error instanceof SyntaxError) &&
        error.message
          ? error.message
          : "Sorry, I encountered an error answering your question. Please try again.";

      // A failed turn is never stored as an assistant message (RT-17, F-003): drop it from the chat, give the
      // text back to the input so the student can resend, and show the error in the banner instead.
      setMessages(messages);
      setTypingId(null);
      setPrompt(inputContent);
      setRateLimitError(errMessage);
      // A conversation created just for this message would stay in the list with nothing in it.
      if (createdForThisMessage && sessionId) {
        setActiveSessionId(null);
        deleteDoc(doc(db, "tutor_sessions", sessionId)).catch((e) =>
          console.error("Could not remove the empty conversation:", e),
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Filtered sessions for sidebar
  const filteredSessions = useMemo(() => {
    if (!sidebarSearch.trim()) return sessions;
    const queryStr = sidebarSearch.toLowerCase();
    return sessions.filter(
      (s) =>
        s.title.toLowerCase().includes(queryStr) ||
        s.messages.some((m) => m.content.toLowerCase().includes(queryStr)),
    );
  }, [sessions, sidebarSearch]);

  // Grouped history
  const groupedSessions = useMemo(
    () => groupSessionsByPeriod(filteredSessions),
    [filteredSessions],
  );

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  // Not in a class yet: the API would refuse the first message, so say so before they type one.
  if (variant === "student" && profile && !profile.organizationId && !profile.teacherId) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-background p-4">
        <Card className="w-full max-w-md shadow-none">
          <CardContent className="space-y-4 pt-8 pb-8">
            <div className="space-y-2">
              <CardTitle className="text-xl font-bold">Raise opens once you’re in a class</CardTitle>
              <CardDescription>
                Raise is the tutor that gives hints on your class’s work. Enter the class code from
                your teacher and it will be ready here.
              </CardDescription>
            </div>
            <JoinClassForm />
          </CardContent>
        </Card>
      </div>
    );
  }

  // The counter is per calendar month; one left over from an earlier month counts as zero.
  const usageProfile = profile as
    (typeof profile & { tutorUsageCurrent?: number; usageMonth?: string }) | null;
  const usageIsCurrent =
    !usageProfile?.usageMonth || usageProfile.usageMonth === new Date().toISOString().slice(0, 7);
  const tutorUsage = usageIsCurrent ? usageProfile?.tutorUsageCurrent || 0 : 0;
  const tutorLimit = orgData?.aiTutorLimitPerStudent ?? 0;
  const firstName = profile?.displayName?.split(" ")[0];

  const usageMeter = (
    <div className="mt-2 flex items-center justify-between gap-3 px-1 text-[11px] text-muted-foreground">
      {variant === "teacher" ? (
        <span>Uses your department&apos;s AI budget</span>
      ) : tutorLimit > 0 ? (
        <div
          className="flex items-center gap-2"
          title="Your teacher's department sets this monthly allowance"
        >
          <div
            role="progressbar"
            aria-label="Raise messages used this month"
            aria-valuemin={0}
            aria-valuemax={tutorLimit}
            aria-valuenow={Math.min(tutorUsage, tutorLimit)}
            className="h-1.5 w-24 overflow-hidden rounded-full bg-muted"
          >
            <motion.div
              className={cn(
                "h-full rounded-full",
                tutorUsage / tutorLimit > 0.8 ? "bg-amber-500" : "bg-primary",
              )}
              initial={false}
              animate={{ width: `${Math.min(100, (tutorUsage / tutorLimit) * 100)}%` }}
              transition={{ duration: 0.5, ease: EASE }}
            />
          </div>
          <span>
            <span className="font-medium tabular-nums text-foreground">
              {tutorUsage} of {tutorLimit}
            </span>{" "}
            messages used this month
          </span>
        </div>
      ) : (
        <span>
          <span className="font-medium tabular-nums text-foreground">{tutorUsage}</span>{" "}
          {tutorUsage === 1 ? "message" : "messages"} used this month
        </span>
      )}
      <span className="hidden sm:inline">Enter to send · Shift + Enter for a new line</span>
    </div>
  );

  const composer = (
    <PromptInput
      isLoading={isLoading}
      value={prompt}
      onValueChange={setPrompt}
      onSubmit={() => handleSubmit()}
      className="relative w-full rounded-2xl border border-border bg-card p-0 pt-1 shadow-sm transition-shadow focus-within:border-primary/40 focus-within:ring-4 focus-within:ring-primary/10"
    >
      <div className="flex flex-col">
        <PromptInputTextarea
          aria-label="Message Raise"
          placeholder={
            !cfg.modes || mode === "concept"
              ? cfg.placeholder
              : "Describe the problem and what you’ve tried…"
          }
          className="min-h-[48px] pt-3.5 pl-5 pr-4 text-[14px] leading-relaxed"
        />

        <PromptInputActions className="mt-2 flex w-full items-center justify-between gap-2 px-3 pb-3">
          {/* Left Actions */}
          <div className="flex items-center gap-1.5">
            {cfg.modes && (
            <div
              role="group"
              aria-label="Kind of help"
              className="flex items-center rounded-full border border-border bg-muted/50 p-0.5"
            >
              {MODES.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  title={item.hint}
                  onClick={() => setMode(item.value)}
                  aria-pressed={mode === item.value}
                  className={cn(
                    "cursor-pointer rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                    mode === item.value
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
            )}
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-1.5">
            <PromptInputAction tooltip={isRecording ? "Stop listening" : "Voice input"}>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(
                  "size-8 rounded-full text-muted-foreground transition-colors cursor-pointer",
                  isRecording && "bg-destructive/10 text-destructive animate-pulse",
                )}
                aria-label={isRecording ? "Stop listening" : "Voice input"}
                onClick={toggleVoiceRecording}
              >
                {isRecording ? <MicOff size={16} /> : <Mic size={16} />}
              </Button>
            </PromptInputAction>

            <Button
              type="button"
              size="icon"
              aria-label="Send message"
              disabled={!prompt.trim() || isLoading}
              onClick={() => handleSubmit()}
              className="size-8 rounded-full shadow-xs transition-transform active:scale-95 cursor-pointer"
            >
              {!isLoading ? (
                <ArrowUp size={16} />
              ) : (
                <span className="size-2 rounded-2xs bg-background animate-spin" />
              )}
            </Button>
          </div>
        </PromptInputActions>
      </div>
    </PromptInput>
  );

  const rateLimitBanner = rateLimitError && (
    <div className="mx-auto w-full max-w-3xl shrink-0 px-4 py-2">
      <div className="flex items-center justify-between rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
        <span>{rateLimitError}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs text-destructive hover:bg-destructive/20"
          onClick={() => setRateLimitError(null)}
        >
          Dismiss
        </Button>
      </div>
    </div>
  );

  const showWelcome = messages.length === 0 && !isLoading;

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative flex min-h-0 flex-1 w-full overflow-hidden bg-background text-foreground">
        <RaiseImpactNotice context={variant} />
        {/* ========================================================================= */}
        {/* SIDEBAR: Chat History (Full Height Left Panel)                           */}
        {/* ========================================================================= */}
        {sidebarOpen && (
          <button
            type="button"
            aria-label="Dismiss chat history"
            tabIndex={-1}
            className="absolute inset-0 z-20 bg-black/40 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <aside
          aria-label="Chat history"
          inert={!sidebarOpen}
          className={cn(
            "absolute inset-y-0 left-0 z-30 flex h-full shrink-0 flex-col border-r border-border bg-card md:relative",
            sidebarOpen ? "w-[min(19rem,85vw)]" : "hidden",
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 pt-2 shrink-0 h-12">
            <span className="pl-1.5 text-sm font-semibold tracking-tight text-foreground">
              Chats
            </span>

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "size-7 rounded-full text-muted-foreground hover:text-foreground transition-colors cursor-pointer",
                  showSearchInput && "bg-muted text-foreground",
                )}
                onClick={() => setShowSearchInput(!showSearchInput)}
                title="Search chats (⌘K)"
              >
                <Search className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 rounded-full text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                onClick={() => setSidebarOpen(false)}
                aria-label="Close chat history"
              >
                <PanelLeft className="size-4" />
              </Button>
            </div>
          </div>

          {/* New Chat & Search Toolbar */}
          <div className="p-3 space-y-2 shrink-0">
            <Button
              variant="outline"
              className="w-full justify-start h-9 font-medium text-xs cursor-pointer"
              onClick={() => {
                createNewSession();
                if (isMobile) setSidebarOpen(false);
              }}
            >
              <span className="flex items-center gap-2">
                <PlusIcon className="size-3.5" />
                <span>New chat</span>
              </span>
            </Button>

            {showSearchInput && (
              <div className="relative flex items-center animate-in fade-in slide-in-from-top-1 duration-150">
                <Search className="absolute left-2.5 size-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search conversations..."
                  value={sidebarSearch}
                  onChange={(e) => setSidebarSearch(e.target.value)}
                  className="h-8 pl-8 pr-7 text-xs rounded-lg border-border/60 bg-background focus-visible:ring-1 focus-visible:ring-primary/40"
                  autoFocus
                />
                {sidebarSearch && (
                  <button
                    type="button"
                    className="absolute right-2 text-muted-foreground hover:text-foreground cursor-pointer"
                    onClick={() => setSidebarSearch("")}
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Scrollable Conversation List */}
          <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-3">
            {groupedSessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <MessageSquare className="size-8 text-muted-foreground/30 mb-2 stroke-[1.5]" />
                <p className="text-xs font-medium text-muted-foreground">
                  {sidebarSearch ? "No matching chats found" : "No conversation history"}
                </p>
                <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                  {sidebarSearch
                    ? "Try a different search query"
                    : "Your past discussions will appear here"}
                </p>
              </div>
            ) : (
              groupedSessions.map((group) => (
                <div key={group.period} className="space-y-1">
                  <div className="text-[11px] font-medium text-muted-foreground px-2.5 py-1">
                    {group.period}
                  </div>
                  <div className="space-y-0.5">
                    {group.conversations.map((conversation) => {
                      const isActive = conversation.id === activeSessionId;
                      const isEditing = editingTitleId === conversation.id;

                      if (isEditing) {
                        return (
                          <div
                            key={conversation.id}
                            className="flex items-center gap-1 rounded-xl border border-border bg-muted p-1 px-1.5"
                          >
                            <Input
                              value={editingTitleText}
                              onChange={(e) => setEditingTitleText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter")
                                  handleRename(conversation.id, editingTitleText);
                                if (e.key === "Escape") setEditingTitleId(null);
                              }}
                              className="h-7 text-xs px-2 bg-background border-none focus-visible:ring-0"
                              autoFocus
                              maxLength={50}
                            />
                            <Button
                              aria-label="Save conversation title"
                              size="icon"
                              variant="ghost"
                              className="size-6 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10 cursor-pointer"
                              onClick={() => handleRename(conversation.id, editingTitleText)}
                            >
                              <Check className="size-3.5" />
                            </Button>
                            <Button
                              aria-label="Cancel renaming"
                              size="icon"
                              variant="ghost"
                              className="size-6 text-muted-foreground hover:bg-muted cursor-pointer"
                              onClick={() => setEditingTitleId(null)}
                            >
                              <X className="size-3.5" />
                            </Button>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={conversation.id}
                          className={cn(
                            "group relative flex items-center justify-between rounded-lg px-2.5 py-1 text-[13px] transition-colors cursor-pointer",
                            isActive
                              ? "bg-muted text-foreground border border-transparent"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted/60 border border-transparent",
                          )}
                        >
                          <button
                            type="button"
                            aria-current={isActive ? "true" : undefined}
                            onClick={() => {
                              switchSession(conversation);
                              if (isMobile) setSidebarOpen(false);
                            }}
                            className="flex min-w-0 flex-1 items-center gap-2 rounded-sm py-1 pr-1 text-left focus-visible:outline-2 focus-visible:outline-ring"
                          >
                            <span className="truncate font-normal">{conversation.title}</span>
                          </button>

                          {/* Dropdown Menu for Rename & Delete */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className={cn(
                                  "size-6 rounded-full transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 hover:bg-muted/80 cursor-pointer",
                                  isActive && "opacity-100",
                                )}
                                aria-label={`Options for ${conversation.title}`}
                              >
                                <MoreHorizontal className="size-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-36">
                              <DropdownMenuItem
                                className="gap-2 cursor-pointer text-xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingTitleId(conversation.id);
                                  setEditingTitleText(conversation.title);
                                }}
                              >
                                <Edit2 className="size-3.5" /> Rename
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="gap-2 cursor-pointer text-xs text-destructive focus:text-destructive focus:bg-destructive/10"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSessionToDelete(conversation);
                                  setDeleteDialogOpen(true);
                                }}
                              >
                                <Trash2 className="size-3.5" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* ========================================================================= */}
        {/* MAIN CHAT CONTENT AREA (Rigid Flex Column)                                */}
        {/* ========================================================================= */}
        <section
          inert={sidebarOpen && isMobile}
          aria-label="Raise conversation"
          className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        >
          {/* Top Header */}
          <header className="z-10 flex w-full shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/60 px-3 py-2 sm:px-4">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {!sidebarOpen && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 rounded-full text-muted-foreground hover:text-foreground cursor-pointer"
                  onClick={() => setSidebarOpen(true)}
                  aria-label="Open chat history"
                >
                  <PanelLeft className="size-4" />
                </Button>
              )}
              <div className="flex items-center gap-2 min-w-0">
                <span className="truncate text-sm font-medium text-foreground">
                  {activeSession?.title || "New chat"}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1">
              {variant === "student" && <RaiseImpactNote linkToSustainability />}

              {activeSession && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="Conversation options">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem
                      className="gap-2 cursor-pointer text-xs"
                      onClick={() => {
                        setSidebarOpen(true);
                        setEditingTitleId(activeSession.id);
                        setEditingTitleText(activeSession.title);
                      }}
                    >
                      <Edit2 className="size-3.5" /> Rename
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="gap-2 cursor-pointer text-xs text-destructive focus:text-destructive"
                      onClick={() => {
                        setSessionToDelete(activeSession);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="size-3.5" /> Delete Chat
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-muted-foreground hover:text-foreground"
                aria-label="Back to dashboard"
                onClick={() => router.push(cfg.home)}
              >
                <ArrowLeft className="size-3.5" />
                <span className="hidden sm:inline">Dashboard</span>
              </Button>
            </div>
          </header>

          {showWelcome ? (
            <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-4 pt-[8vh] pb-8 sm:pt-[12vh]">
              <motion.div
                key={activeSessionId ?? "new"}
                className="w-full max-w-2xl"
                initial="hidden"
                animate="shown"
                variants={{ shown: { transition: { staggerChildren: 0.06 } } }}
              >
                <motion.div variants={RISE} className="flex items-center gap-3">
                  <RaiseAvatar className="size-10 rounded-xl [&_svg]:size-5" />
                  <span className="text-sm font-medium text-muted-foreground">Raise</span>
                </motion.div>
                <motion.h2
                  variants={RISE}
                  className="mt-4 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
                >
                  {cfg.heading(firstName)}
                </motion.h2>
                <motion.p
                  variants={RISE}
                  className="mt-2 text-sm leading-relaxed text-muted-foreground"
                >
                  {cfg.intro}
                </motion.p>

                <motion.div variants={RISE} className="mt-6">
                  {composer}
                  {usageMeter}
                </motion.div>
                {rateLimitBanner}

                <motion.p
                  variants={RISE}
                  className="mt-8 text-xs font-medium text-muted-foreground"
                >
                  Try one. Raise can draw these.
                </motion.p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {cfg.starters.map((item) => {
                    const Icon = item.icon;
                    return (
                      <motion.button
                        key={item.prompt}
                        type="button"
                        variants={RISE}
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          setMode("concept");
                          setPrompt(item.prompt);
                          handleSubmit(item.prompt);
                        }}
                        className="group flex cursor-pointer flex-col gap-2 rounded-xl border border-border bg-card p-3.5 text-left transition-colors hover:border-primary/40 hover:bg-muted/40"
                      >
                        <span className="flex items-center gap-2 text-xs font-medium text-foreground">
                          <span className="flex size-6 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                            <Icon className="size-3.5" />
                          </span>
                          {item.tag}
                        </span>
                        <span className="text-[13px] leading-relaxed text-muted-foreground">
                          {item.prompt}
                        </span>
                      </motion.button>
                    );
                  })}
                </div>
              </motion.div>
            </div>
          ) : (
            <>
              {/* Scrollable messages */}
              <ChatContainerRoot
                ref={chatContainerRef}
                className="flex-1 min-h-0 overflow-y-auto relative w-full"
              >
                <ChatContainerContent className="mx-auto max-w-3xl space-y-6 px-4 py-8 md:px-6">
                  {
                    /* Message List */
                    messages.map((message, index) => {
                      const isAssistant = message.role === "assistant";
                      const isLastMessage = index === messages.length - 1;
                      const isTyping = isAssistant && isLastMessage && message.id === typingId;

                      return (
                        <motion.div
                          // older saved messages may have no id
                          key={message.id || `m${index}`}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3, ease: EASE }}
                        >
                          <PromptMessage
                            className={cn(
                              "flex w-full flex-col gap-2",
                              isAssistant ? "items-start" : "items-end",
                            )}
                          >
                            {isAssistant ? (
                              /* Assistant Message */
                              <div className="group flex w-full flex-col gap-1.5">
                                <div className="flex items-center gap-2">
                                  <RaiseAvatar />
                                  <span className="text-sm font-semibold text-foreground">
                                    Raise
                                  </span>
                                </div>

                                <MessageContent
                                  className="prose dark:prose-invert max-w-none bg-transparent p-0 pl-9 text-[15px] leading-relaxed"
                                  markdown={!isTyping}
                                >
                                  {isTyping ? (
                                    <Typewriter
                                      text={message.content}
                                      onDone={() => setTypingId(null)}
                                    />
                                  ) : (
                                    message.content
                                  )}
                                </MessageContent>

                                {/* Assistant Actions */}
                                <MessageActions
                                  className={cn(
                                    "pl-7.5 flex gap-1 pt-1 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100",
                                    isLastMessage && "opacity-100",
                                  )}
                                >
                                  <MessageAction tooltip="Copy message">
                                    <Button
                                      aria-label="Copy message"
                                      variant="ghost"
                                      size="icon"
                                      className="size-7 rounded-full text-muted-foreground hover:text-foreground cursor-pointer"
                                      onClick={() => handleCopyMessage(message.content)}
                                    >
                                      <Copy className="size-3.5" />
                                    </Button>
                                  </MessageAction>

                                  <MessageAction tooltip="Delete message">
                                    <Button
                                      aria-label="Delete message"
                                      variant="ghost"
                                      size="icon"
                                      className="size-7 rounded-full text-muted-foreground hover:text-destructive cursor-pointer"
                                      onClick={() => handleDeleteMessage(message.id)}
                                    >
                                      <Trash className="size-3.5" />
                                    </Button>
                                  </MessageAction>
                                </MessageActions>
                              </div>
                            ) : (
                              /* User Message */
                              <div className="group flex flex-col items-end gap-1 max-w-[85%] sm:max-w-[75%]">
                                <MessageContent className="rounded-2xl rounded-br-md border border-primary/15 bg-primary/10 text-foreground px-4 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap">
                                  {message.content}
                                </MessageContent>

                                {/* User Actions */}
                                <MessageActions className="flex gap-1 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 pr-1">
                                  <MessageAction tooltip="Edit prompt">
                                    <Button
                                      aria-label="Edit message"
                                      variant="ghost"
                                      size="icon"
                                      className="size-7 rounded-full text-muted-foreground hover:text-foreground cursor-pointer"
                                      onClick={() => handleEditMessage(message.content)}
                                    >
                                      <Pencil className="size-3.5" />
                                    </Button>
                                  </MessageAction>

                                  <MessageAction tooltip="Copy text">
                                    <Button
                                      aria-label="Copy message"
                                      variant="ghost"
                                      size="icon"
                                      className="size-7 rounded-full text-muted-foreground hover:text-foreground cursor-pointer"
                                      onClick={() => handleCopyMessage(message.content)}
                                    >
                                      <Copy className="size-3.5" />
                                    </Button>
                                  </MessageAction>

                                  <MessageAction tooltip="Delete prompt">
                                    <Button
                                      aria-label="Delete message"
                                      variant="ghost"
                                      size="icon"
                                      className="size-7 rounded-full text-muted-foreground hover:text-destructive cursor-pointer"
                                      onClick={() => handleDeleteMessage(message.id)}
                                    >
                                      <Trash className="size-3.5" />
                                    </Button>
                                  </MessageAction>
                                </MessageActions>
                              </div>
                            )}
                          </PromptMessage>
                        </motion.div>
                      );
                    })
                  }

                  <AnimatePresence>{isLoading && <ThinkingLine key="thinking" />}</AnimatePresence>

                  {/* Quick replies once Raise has finished answering */}
                  {!isLoading &&
                    !typingId &&
                    messages.length > 0 &&
                    messages[messages.length - 1].role === "assistant" && (
                      <motion.div
                        initial="hidden"
                        animate="shown"
                        variants={{ shown: { transition: { staggerChildren: 0.05 } } }}
                        className="flex flex-wrap gap-2 pl-9"
                      >
                        {cfg.followUps.map((text) => (
                          <motion.button
                            key={text}
                            type="button"
                            variants={RISE}
                            whileTap={{ scale: 0.97 }}
                            onClick={() => handleSubmit(text)}
                            className="cursor-pointer rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                          >
                            {text}
                          </motion.button>
                        ))}
                      </motion.div>
                    )}

                  <div ref={messagesEndRef} />
                </ChatContainerContent>

                {/* Floating Scroll to Bottom Button */}
                <div className="sticky bottom-4 right-4 flex justify-end px-6 pointer-events-none">
                  <div className="pointer-events-auto">
                    <ScrollButton
                      containerRef={chatContainerRef}
                      className="shadow-lg border-border/60 bg-card/90"
                    />
                  </div>
                </div>
              </ChatContainerRoot>

              {rateLimitBanner}

              <div className="shrink-0 px-3 pb-3 md:px-4 md:pb-4">
                <div className="mx-auto max-w-3xl">
                  {composer}
                  {usageMeter}
                </div>
              </div>
            </>
          )}
        </section>

        {/* ========================================================================= */}
        {/* CONFIRM DELETE DIALOG                                                     */}
        {/* ========================================================================= */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle className="text-base">Delete Conversation</DialogTitle>
              <DialogDescription className="text-xs">
                Are you sure you want to delete &quot;{sessionToDelete?.title}&quot;? This action
                cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" size="sm" onClick={() => setDeleteDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (sessionToDelete) {
                    handleDeleteSession(sessionToDelete);
                  }
                  setDeleteDialogOpen(false);
                  setSessionToDelete(null);
                }}
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MotionConfig>
  );
}
