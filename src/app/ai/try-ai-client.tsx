"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, ArrowRight, RefreshCw, CornerDownLeft, Shapes } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { RaiseLogo } from "@/components/ui/raise-logo";
import { SiteHeader } from "@/components/landing/site-header";
import { SpaceBackground } from "@/components/ui/space-background";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { render } from "@/lib/diagram";
import { isSafeSvg } from "@/lib/diagram/safe";
import { hideOpenDiagramBlock } from "@/lib/diagram/blocks";
import { TRY_AI_STARTERS, withoutDiagrams, type TryAiStarter } from "@/lib/ai/try-ai-starters";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

// ─── Visitor storage ───────────────────────────────────────────────────────────

const LIMIT = 3;
const COUNT_KEY = "scorpio_ai_page_msg_count";
const VISITOR_KEY = "scorpio_ai_page_visitor_id";
const SESSION_MESSAGES_KEY = "scorpio_ai_session_messages";
const SESSION_QLEFT_KEY = "scorpio_ai_session_qleft";

function getOrCreateVisitorId(): string {
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = `v_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

function getLocalCount(): number {
  try {
    return parseInt(localStorage.getItem(COUNT_KEY) || "0", 10);
  } catch {
    return 0;
  }
}

function incrementLocalCount() {
  try {
    localStorage.setItem(COUNT_KEY, String(getLocalCount() + 1));
  } catch {}
}

function loadSessionMessages(): Message[] {
  try {
    const raw = sessionStorage.getItem(SESSION_MESSAGES_KEY);
    if (!raw) return [];
    const parsed: Message[] = JSON.parse(raw);
    return parsed.map((m) => ({ ...m, isStreaming: false }));
  } catch {
    return [];
  }
}

function saveSessionMessages(msgs: Message[]) {
  try {
    sessionStorage.setItem(
      SESSION_MESSAGES_KEY,
      JSON.stringify(msgs.map((m) => ({ ...m, isStreaming: false }))),
    );
  } catch {}
}

function loadSessionQLeft(): number | null {
  try {
    const raw = sessionStorage.getItem(SESSION_QLEFT_KEY);
    return raw === null ? null : parseInt(raw, 10);
  } catch {
    return null;
  }
}

function saveSessionQLeft(n: number) {
  try {
    sessionStorage.setItem(SESSION_QLEFT_KEY, String(n));
  } catch {}
}

function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_MESSAGES_KEY);
    sessionStorage.removeItem(SESSION_QLEFT_KEY);
    localStorage.setItem(COUNT_KEY, "0");
  } catch {}
}

// ─── Pieces ────────────────────────────────────────────────────────────────────

/** A starter's diagram, drawn small for its card. Draws nothing if it cannot be drawn. */
function DiagramThumb({ source }: { source: string }) {
  const svg = useMemo(() => {
    const r = render(source);
    return r.ok && r.svg && isSafeSvg(r.svg) ? r.svg : null;
  }, [source]);
  if (!svg) return null;
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex h-full w-full items-center justify-center text-foreground/80",
        "[--dg-accent:var(--primary)] [--dg-bg:var(--background)]",
        "[&_svg]:max-h-full [&_svg]:w-auto [&_svg]:max-w-full",
      )}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

function StarterCard({
  starter,
  index,
  diagrams,
  onPick,
}: {
  starter: TryAiStarter;
  index: number;
  diagrams: boolean;
  onPick: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onPick}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.08 + index * 0.05, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "group flex flex-col overflow-hidden rounded-2xl border border-border/80 bg-card/40 text-left backdrop-blur-sm cursor-pointer",
        "transition-[border-color,background-color,transform] duration-200",
        "hover:border-foreground/25 hover:bg-card/70 hover:-translate-y-0.5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      {diagrams && (
        <div className="h-[148px] border-b border-border/60 bg-background/50 px-6 py-4">
          <DiagramThumb source={starter.diagram} />
        </div>
      )}
      <div className="flex flex-1 flex-col gap-1.5 px-4 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13.5px] font-semibold text-foreground">{starter.label}</span>
          {diagrams && (
            <span className="shrink-0 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
              {starter.kind}
            </span>
          )}
        </div>
        <p className="text-[13px] leading-snug text-muted-foreground line-clamp-2 group-hover:text-foreground/80 transition-colors">
          {starter.prompt}
        </p>
      </div>
    </motion.button>
  );
}

const ASSISTANT_PROSE = cn(
  "text-[14.5px] leading-[1.75]",
  "[&_.katex]:text-[0.95em]",
  "[&_.katex-display]:my-3",
  "[&_p]:text-foreground [&_p]:leading-[1.75] [&_p]:my-1",
  "[&_strong]:font-semibold [&_strong]:text-foreground",
  "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_blockquote]:italic [&_blockquote]:my-3",
  "[&_ul]:my-2 [&_ul]:space-y-1 [&_li]:text-foreground",
  "[&_ol]:my-2 [&_ol]:space-y-1",
  "[&_code]:text-[0.84em] [&_code]:bg-muted [&_code]:rounded [&_code]:px-1.5 [&_code]:py-0.5",
  "[&_pre]:bg-muted [&_pre]:rounded-xl [&_pre]:p-4 [&_pre]:my-3 [&_pre]:overflow-x-auto",
  // Diagrams: a quiet panel with room around the drawing.
  "[&_figure]:my-4 [&_figure]:rounded-xl [&_figure]:border-border/70 [&_figure]:bg-background/70 [&_figure]:px-4 [&_figure]:py-5",
  "[&_figure_svg]:max-h-[300px] [&_figure_svg]:w-auto",
);

// ─── Page ──────────────────────────────────────────────────────────────────────

export function TryAiClient({ diagrams }: { diagrams: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [questionsLeft, setQuestionsLeft] = useState(LIMIT);
  const [visitorId, setVisitorId] = useState("");
  const [mounted, setMounted] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads browser storage after mount so the server render and the first client render match
    setMounted(true);
    setVisitorId(getOrCreateVisitorId());

    const sessionMsgs = loadSessionMessages();
    const sessionQLeft = loadSessionQLeft();
    if (sessionMsgs.length > 0) setMessages(sessionMsgs);
    setQuestionsLeft(sessionQLeft ?? Math.max(0, LIMIT - getLocalCount()));
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(scrollToBottom, [messages, isTyping, scrollToBottom]);

  const simulateStreaming = (fullText: string, messageId: string) => {
    const words = fullText.split(" ");
    let i = 0;
    let currentText = "";
    const interval = setInterval(() => {
      if (i < words.length) {
        currentText += (i === 0 ? "" : " ") + words[i];
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, content: currentText } : m)),
        );
        i++;
        scrollToBottom();
      } else {
        clearInterval(interval);
        setMessages((prev) => {
          const next = prev.map((m) =>
            m.id === messageId ? { ...m, content: fullText, isStreaming: false } : m,
          );
          saveSessionMessages(next);
          return next;
        });
      }
    }, 28);
  };

  const handleSend = useCallback(
    async (text: string, offlineResponse?: string) => {
      if (!text.trim() || questionsLeft <= 0 || isTyping) return;

      const newQ = questionsLeft - 1;
      setMessages((prev) => {
        const next = [...prev, { id: `u_${Date.now()}`, role: "user" as const, content: text }];
        saveSessionMessages(next);
        return next;
      });
      setInput("");
      setIsTyping(true);
      setQuestionsLeft(newQ);
      saveSessionQLeft(newQ);
      incrementLocalCount();

      if (offlineResponse) {
        setTimeout(() => {
          setIsTyping(false);
          const aid = `a_${Date.now()}`;
          setMessages((prev) => [
            ...prev,
            { id: aid, role: "assistant", content: "", isStreaming: true },
          ]);
          simulateStreaming(offlineResponse, aid);
        }, 500);
        return;
      }

      try {
        const res = await fetch("/api/chat/landing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, visitorId }),
        });
        const data = await res.json();
        setIsTyping(false);
        const aid = `a_${Date.now()}`;
        setMessages((prev) => [
          ...prev,
          { id: aid, role: "assistant", content: "", isStreaming: true },
        ]);
        simulateStreaming(
          res.ok ? data.text : data?.error || "Something went wrong. Please try again.",
          aid,
        );
      } catch {
        setIsTyping(false);
        setMessages((prev) => [
          ...prev,
          {
            id: `a_err_${Date.now()}`,
            role: "assistant",
            content: "Connection error. Please try again.",
          },
        ]);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [questionsLeft, isTyping, visitorId],
  );

  const reset = () => {
    clearSession();
    setMessages([]);
    setQuestionsLeft(LIMIT);
    setInput("");
    setTimeout(() => inputRef.current?.focus(), 80);
  };

  const isLimitReached = questionsLeft <= 0;
  const isEmpty = mounted && messages.length === 0;

  if (!mounted) return null;

  return (
    <div className="min-h-screen flex flex-col relative font-medium">
      <SpaceBackground />
      <SiteHeader />

      <div
        className={cn(
          "flex flex-col flex-1 mx-auto w-full px-5 relative z-10",
          isEmpty ? "max-w-[880px]" : "max-w-[720px]",
        )}
        style={{ paddingTop: "88px" }}
      >
        {/* ── Welcome ──────────────────────────────────────────────────── */}
        <AnimatePresence>
          {isEmpty && (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col flex-1 justify-center pt-6 pb-10"
            >
              <div className="flex items-center gap-2.5 mb-7">
                <div className="h-7 w-7 rounded-[7px] bg-primary flex items-center justify-center shadow-sm">
                  <RaiseLogo size={14} className="text-primary-foreground" />
                </div>
                <span className="text-[14px] font-semibold text-foreground">Raise</span>
                <span className="text-[11px] font-medium text-muted-foreground border border-border/80 rounded-md px-2 py-0.5 leading-none">
                  Physics tutor
                </span>
                {diagrams && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary border border-primary/30 bg-primary/5 rounded-md px-2 py-0.5 leading-none">
                    <Shapes className="h-3 w-3" aria-hidden="true" />
                    Draws diagrams
                  </span>
                )}
              </div>

              <h1 className="text-[30px] sm:text-[40px] font-bold tracking-[-0.035em] text-foreground leading-[1.1] mb-4">
                Ask a physics question.
                <br />
                <span className="text-muted-foreground">
                  {diagrams ? "Raise sketches it out with you." : "Raise helps you work it out."}
                </span>
              </h1>
              <p className="text-[15px] text-muted-foreground leading-[1.7] mb-9 max-w-[560px]">
                Raise answers with hints and questions, not the final answer.
                {diagrams &&
                  " When a picture helps, it draws the setup, the forces or the graph, and every drawing is checked before you see it."}{" "}
                <span className="text-foreground font-medium">
                  {questionsLeft} of {LIMIT} questions left.
                </span>
              </p>

              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60 mb-3">
                Try one
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {TRY_AI_STARTERS.map((s, i) => (
                  <StarterCard
                    key={s.label}
                    starter={s}
                    index={i}
                    diagrams={diagrams}
                    onPick={() =>
                      handleSend(s.prompt, diagrams ? s.response : withoutDiagrams(s.response))
                    }
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Conversation ─────────────────────────────────────────────── */}
        {!isEmpty && (
          <div className="flex-1 py-10 space-y-8">
            {messages.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
              >
                {m.role === "user" ? (
                  <div className="flex justify-end">
                    <div className="max-w-[80%] sm:max-w-[75%] bg-primary rounded-2xl rounded-tr-sm px-4 py-3 text-[14.5px] leading-[1.65] text-primary-foreground font-medium shadow-sm">
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-3 items-start">
                    <div className="h-6 w-6 rounded-[6px] bg-primary flex items-center justify-center shrink-0 mt-[2px] shadow-sm">
                      <RaiseLogo size={12} className="text-primary-foreground" />
                    </div>
                    <div className="flex-1 min-w-0 pt-[1px]">
                      <MarkdownRenderer
                        className={cn(
                          ASSISTANT_PROSE,
                          m.isStreaming &&
                            "after:content-[''] after:inline-block after:w-[2px] after:h-[1em] after:bg-foreground/40 after:ml-0.5 after:align-middle after:animate-pulse",
                        )}
                        noProse
                      >
                        {/* A diagram appears whole once its block has finished typing. */}
                        {(m.isStreaming ? hideOpenDiagramBlock(m.content) : m.content) || " "}
                      </MarkdownRenderer>
                    </div>
                  </div>
                )}
              </motion.div>
            ))}

            {isTyping && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex gap-3 items-center"
              >
                <div className="h-6 w-6 rounded-[6px] bg-primary flex items-center justify-center shrink-0">
                  <RaiseLogo size={12} className="text-primary-foreground" />
                </div>
                <div className="flex items-center gap-[5px]" aria-label="Raise is thinking">
                  {[0, 140, 280].map((d) => (
                    <span
                      key={d}
                      className="h-[5px] w-[5px] rounded-full bg-muted-foreground/40 animate-bounce"
                      style={{ animationDelay: `${d}ms` }}
                    />
                  ))}
                </div>
              </motion.div>
            )}

            <AnimatePresence>
              {isLimitReached && !isTyping && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="border border-border rounded-2xl px-5 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-muted/20"
                >
                  <div>
                    <p className="text-[14px] font-semibold text-foreground mb-0.5">
                      That&apos;s the demo
                    </p>
                    <p className="text-[13px] text-muted-foreground leading-relaxed">
                      In class, Raise works this way on every assignment, with limits the teacher
                      sets.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={reset}
                      className="text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Start over
                    </button>
                    <Button
                      asChild
                      size="sm"
                      className="rounded-full h-8 px-4 text-[13px] font-semibold cursor-pointer"
                    >
                      <Link href="/signup">
                        Get access
                        <ArrowRight className="h-3 w-3 ml-1" />
                      </Link>
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div ref={messagesEndRef} className="h-2" />
          </div>
        )}

        {/* ── Input ─────────────────────────────────────────────────────── */}
        <div
          className={cn(
            "sticky bottom-0 pb-5 pt-3 bg-background/80 backdrop-blur-xl",
            isEmpty && "mt-auto",
          )}
        >
          <div className="absolute inset-x-0 -top-8 h-8 bg-gradient-to-t from-background to-transparent pointer-events-none" />

          <div
            className={cn(
              "relative rounded-xl border border-border bg-background transition-all duration-200",
              "focus-within:border-foreground/25 focus-within:shadow-[0_0_0_3px_rgba(0,0,0,0.04)]",
              "dark:focus-within:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]",
              isLimitReached && "opacity-40 pointer-events-none select-none",
            )}
          >
            <Textarea
              aria-label="Ask Raise a physics question"
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(input);
                }
              }}
              placeholder={
                isLimitReached
                  ? "Demo limit reached"
                  : isEmpty
                    ? diagrams
                      ? "Ask about a setup, a force or a graph..."
                      : "Ask a physics question..."
                    : "Ask another question..."
              }
              className="w-full bg-transparent border-0 resize-none px-4 pt-3.5 pb-2 text-[14.5px] focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/40 min-h-[52px] max-h-[180px] leading-[1.6]"
              rows={1}
              disabled={isLimitReached || isTyping}
            />

            <div className="flex items-center justify-between px-3 pb-3 pt-1">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/40 select-none">
                <CornerDownLeft className="h-3 w-3" />
                <span>to send · Shift+Enter for new line</span>
              </div>
              <button
                type="button"
                aria-label="Send"
                onClick={() => handleSend(input)}
                disabled={!input.trim() || isLimitReached || isTyping}
                className={cn(
                  "h-7 w-7 rounded-lg flex items-center justify-center transition-all cursor-pointer",
                  input.trim() && !isLimitReached && !isTyping
                    ? "bg-foreground text-background hover:opacity-80 active:scale-95"
                    : "bg-muted text-muted-foreground/40 cursor-not-allowed",
                )}
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between mt-2 px-0.5">
            <p className="text-[11px] text-muted-foreground/40 font-medium">
              Each question is answered on its own; Raise doesn&apos;t see earlier ones here.
            </p>
            {isLimitReached ? (
              <button
                onClick={reset}
                className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-pointer flex items-center gap-1"
              >
                <RefreshCw className="h-2.5 w-2.5" />
                Start over
              </button>
            ) : (
              <p className="text-[11px] text-muted-foreground/40 shrink-0">
                {questionsLeft} of {LIMIT} left
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
