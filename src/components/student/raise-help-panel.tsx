"use client";

import { useEffect, useRef } from "react";
import { ClickIcon } from "@/components/ui/click-icon";
import { ArrowUpIcon as AnimatedArrowUp } from "@animateicons/react/lucide/arrow-up-icon";
import { CheckIcon as AnimatedCheck } from "@animateicons/react/lucide/check-icon";
import { CopyIcon as AnimatedCopy } from "@animateicons/react/lucide/copy-icon";
import { RotateCcwIcon as AnimatedRotateCcw } from "@animateicons/react/lucide/rotate-ccw-icon";
import { XIcon as AnimatedX } from "@animateicons/react/lucide/x-icon";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { RaiseImpactNote } from "@/components/student/raise-impact-note";
import { cn } from "@/lib/utils";

export interface RaiseHelpMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const QUICK_PROMPTS = [
  {
    label: "Which ideas apply?",
    forQuestion: (n: number) => `What physics principles or laws apply to Question ${n}?`,
    general: "What physics principles should I look for here?",
  },
  {
    label: "Hint for a first step",
    forQuestion: (n: number) => `Can you give me a first step hint for Question ${n}?`,
    general: "Can you give me a first step hint?",
  },
  {
    label: "Check my approach",
    forQuestion: (n: number) => `How do I sanity-check my approach and units for Question ${n}?`,
    general: "How do I check my approach and units?",
  },
];

/**
 * The Raise panel inside an assignment. The same panel is used in the desktop side panel and the
 * phone drawer.
 */
export function RaiseHelpPanel({
  questions,
  messages,
  loading,
  input,
  onInputChange,
  onSend,
  focusedQuestionIndex,
  onFocusChange,
  onReset,
  onClose,
  copiedMessageId,
  onCopy,
}: {
  questions: { id: string; points?: number }[];
  messages: RaiseHelpMessage[];
  loading: boolean;
  input: string;
  onInputChange: (value: string) => void;
  onSend: (message?: string) => void;
  focusedQuestionIndex: number | null;
  onFocusChange: (index: number | null) => void;
  onReset: () => void;
  onClose: () => void;
  copiedMessageId: string | null;
  onCopy: (id: string, text: string) => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const focusedNumber = focusedQuestionIndex === null ? null : focusedQuestionIndex + 1;

  useEffect(() => {
    const container = endRef.current?.parentElement;
    container?.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <h3 className="pl-1 text-sm font-semibold tracking-tight">Raise</h3>
        <div className="flex items-center gap-0.5">
          <RaiseImpactNote />
          <Button
            aria-label="Clear conversation"
            title="Clear conversation"
            variant="ghost"
            size="icon"
            onClick={onReset}
            disabled={messages.length === 0}
            className="size-8 text-muted-foreground hover:text-foreground"
          >
            <ClickIcon icon={AnimatedRotateCcw} className="size-4" />
          </Button>
          <Button
            aria-label="Close Raise"
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="size-8 text-muted-foreground hover:text-foreground"
          >
            <ClickIcon icon={AnimatedX} className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Optional. Ask for a hint if you get stuck. Raise guides your thinking and does not
              give answers.
            </p>
            <div className="flex flex-col items-start gap-1.5">
              {QUICK_PROMPTS.map((item) => (
                <Button
                  key={item.label}
                  variant="outline"
                  size="sm"
                  disabled={loading}
                  className="h-8 text-xs font-normal"
                  onClick={() =>
                    onSend(focusedNumber ? item.forQuestion(focusedNumber) : item.general)
                  }
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) =>
          msg.role === "user" ? (
            <div key={msg.id} className="flex justify-end">
              <div className="max-w-[90%] whitespace-pre-wrap rounded-2xl bg-muted px-3.5 py-2 text-[13.5px] leading-relaxed text-foreground">
                {msg.content}
              </div>
            </div>
          ) : (
            <div key={msg.id} className="group space-y-1">
              <MarkdownRenderer
                className={cn(
                  "text-[13.5px] leading-relaxed text-foreground",
                  "[&_.katex]:text-[0.95em] [&_p]:my-1 [&_ul]:my-1.5 [&_ul]:space-y-1 [&_ol]:my-1.5 [&_ol]:space-y-1",
                  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-xs",
                )}
              >
                {msg.content}
              </MarkdownRenderer>
              <button
                type="button"
                onClick={() => onCopy(msg.id, msg.content)}
                className="flex cursor-pointer items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              >
                {copiedMessageId === msg.id ? (
                  <>
                    <ClickIcon icon={AnimatedCheck} className="size-3" /> Copied
                  </>
                ) : (
                  <>
                    <ClickIcon icon={AnimatedCopy} className="size-3" /> Copy
                  </>
                )}
              </button>
            </div>
          ),
        )}

        {loading && (
          <div role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.3s]" />
            <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.15s]" />
            <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60" />
            <span className="ml-1.5">Working on it…</span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="shrink-0 space-y-2 border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="shrink-0">About</span>
          <Select
            value={focusedQuestionIndex === null ? "all" : String(focusedQuestionIndex)}
            onValueChange={(val) => onFocusChange(val === "all" ? null : parseInt(val))}
          >
            <SelectTrigger
              size="sm"
              aria-label="Question this is about"
              className="h-7 w-auto gap-1.5 px-2 text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start">
              <SelectItem value="all" className="text-xs">
                The whole assignment
              </SelectItem>
              {questions.map((q, i) => (
                <SelectItem key={q.id} value={String(i)} className="text-xs">
                  Question {i + 1}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-end gap-2 rounded-xl border border-border bg-card p-1.5 focus-within:ring-2 focus-within:ring-ring/40">
          <Textarea
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            aria-label="Message Raise"
            placeholder={focusedNumber ? `Ask about Question ${focusedNumber}…` : "Ask for a hint…"}
            disabled={loading}
            rows={1}
            className="max-h-[140px] min-h-[36px] resize-none border-0 bg-transparent p-2 text-sm leading-relaxed shadow-none focus-visible:ring-0 dark:bg-transparent"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
          />
          <Button
            aria-label="Send message"
            onClick={() => onSend()}
            disabled={loading || !input.trim()}
            size="icon"
            className="size-8 shrink-0 rounded-full"
          >
            <ClickIcon icon={AnimatedArrowUp} className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
