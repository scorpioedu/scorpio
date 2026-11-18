"use client";

import { useId, useState } from "react";
import { usePathname } from "next/navigation";
import { MessageSquarePlus } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import {
  buildFeedbackPayload,
  feedbackAreaForPath,
  type FeedbackKind,
} from "@/lib/support/feedback";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const CHOICES: Array<{ kind: FeedbackKind; label: string }> = [
  { kind: "feature", label: "Suggest a feature" },
  { kind: "bug", label: "Report a problem" },
];

/**
 * Small "Feedback" button on every signed-in page. Reports go to /api/support/report (support_tickets),
 * which is read at /admin/feedback. Sits just above the Support chat button, bottom right.
 */
export function FeedbackWidget() {
  const pathname = usePathname();
  const { user } = useAuth();
  const area = feedbackAreaForPath(pathname);
  const fieldId = useId();

  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FeedbackKind>("feature");
  const [text, setText] = useState("");
  const [tryingTo, setTryingTo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticketId, setTicketId] = useState<string | null>(null);

  if (!user || !area) return null;

  function reset() {
    setText("");
    setTryingTo("");
    setError(null);
    setTicketId(null);
    setKind("feature");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !area || !text.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await authenticatedFetch("/api/support/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildFeedbackPayload({
            kind,
            text,
            tryingTo,
            pathname: pathname ?? "",
            area,
            user: { uid: user.uid, email: user.email, displayName: user.displayName },
          }),
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success || !data.ticketId) {
        throw new Error(data.error || "We could not send your feedback. Please try again.");
      }
      setTicketId(data.ticketId);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "We could not send your feedback. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            "fixed bottom-[76px] right-4 z-30 sm:bottom-[88px] sm:right-6",
            "flex h-8 items-center gap-1.5 rounded-full border bg-background/90 px-3 text-xs font-medium text-muted-foreground shadow-md backdrop-blur",
            "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <MessageSquarePlus className="size-3.5" aria-hidden="true" />
          Feedback
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send feedback</DialogTitle>
          <DialogDescription>
            We read every message and aim to reply within two days.
          </DialogDescription>
        </DialogHeader>
        {ticketId ? (
          <div className="space-y-4" role="status">
            <p className="text-sm">
              Thank you. Your feedback was received. Reference:{" "}
              <span className="font-mono">{ticketId}</span>
            </p>
            <Button onClick={() => setOpen(false)}>Close</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div role="radiogroup" aria-label="Type of feedback" className="grid grid-cols-2 gap-2">
              {CHOICES.map((c) => (
                <Button
                  key={c.kind}
                  type="button"
                  role="radio"
                  aria-checked={kind === c.kind}
                  variant={kind === c.kind ? "default" : "outline"}
                  size="sm"
                  onClick={() => setKind(c.kind)}
                >
                  {c.label}
                </Button>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${fieldId}-text`}>
                {kind === "bug" ? "What went wrong?" : "What would you like to see?"}
              </Label>
              <Textarea
                id={`${fieldId}-text`}
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                maxLength={5000}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${fieldId}-trying`}>What were you trying to do? (optional)</Label>
              <Textarea
                id={`${fieldId}-trying`}
                value={tryingTo}
                onChange={(e) => setTryingTo(e.target.value)}
                rows={2}
                maxLength={1000}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              We include this page, your role and your account email. Please don&apos;t paste
              passwords.
            </p>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" disabled={submitting || !text.trim()}>
              {submitting ? "Sending…" : "Send feedback"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
