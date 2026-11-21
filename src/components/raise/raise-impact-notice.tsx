"use client";

import { Leaf } from "lucide-react";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Context = "demo" | "student" | "teacher";

// The public demo and the signed-in app remember the notice separately, so someone who saw it on
// /ai still sees it once in their class.
const SEEN_KEYS: Record<Context, string> = {
  demo: "scorpio-raise-impact-seen",
  student: "scorpio-raise-impact-seen-app",
  teacher: "scorpio-raise-impact-seen-app",
};

const SUSTAINABILITY_HREF: Record<Context, string> = {
  demo: "/sustainability",
  student: "/student/sustainability",
  teacher: "/teacher/sustainability",
};

const LIMIT_NOTE: Record<Context, string> = {
  demo: "this demo allows three questions.",
  student: "your class has an AI budget, and departments set a monthly spend limit.",
  teacher: "Raise draws on your department's AI budget, with a monthly spend limit.",
};

function readSeen(key: string) {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    // Storage blocked: show the notice and don't try to remember it.
    return false;
  }
}

const noSubscribe = () => () => {};

/*
 * Shown the first time someone opens Raise in this browser (Test Raise, or Raise for students and
 * teachers): every hint has an energy and water cost, and this says so plainly before they start.
 * Figures match the Sustainability page.
 */
export function RaiseImpactNotice({ context = "demo" }: { context?: Context }) {
  const key = SEEN_KEYS[context];
  // The server render says "seen" so nothing flashes; the browser then reads the real value.
  const seen = useSyncExternalStore(noSubscribe, () => readSeen(key), () => true);
  const [dismissed, setDismissed] = useState(false);
  const open = !seen && !dismissed;

  const dismiss = () => {
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      // Ignore; the notice just shows again next time.
    }
    setDismissed(true);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && dismiss()}>
      <DialogContent className="max-h-[90dvh] gap-0 overflow-y-auto rounded-2xl p-0 sm:max-w-md">
        <DialogHeader className="gap-0 p-6 pb-0 text-left sm:p-7 sm:pb-0">
          <span className="mb-5 grid size-10 place-items-center rounded-full border border-border bg-muted/50 text-primary">
            <Leaf aria-hidden="true" className="size-4.5" />
          </span>
          <DialogTitle className="text-xl font-medium tracking-[-0.02em]">
            AI has a real environmental cost
          </DialogTitle>
          <DialogDescription className="mt-3 text-[15px] leading-relaxed">
            Every hint Raise writes runs on a data center: about 0.2 Wh of electricity and up to
            0.5 mL of cooling water.
          </DialogDescription>
        </DialogHeader>

        <ul role="list" className="mx-6 mt-5 grid list-none gap-2.5 border-t border-border pt-5 text-[14px] text-muted-foreground sm:mx-7">
          <li>
            <span className="text-foreground">We keep replies short</span>, so the model generates
            fewer tokens per hint.
          </li>
          <li>
            <span className="text-foreground">We cap usage</span>: {LIMIT_NOTE[context]}
          </li>
          <li>
            <span className="text-foreground">We are not carbon neutral yet</span>, and plan to fund
            carbon removal once Scorpio is profitable.
          </li>
        </ul>

        <DialogFooter className="mt-7 flex-col-reverse gap-2 border-t border-border p-4 sm:flex-row sm:justify-end sm:px-7">
          <Button asChild variant="ghost" className="rounded-full">
            <Link href={SUSTAINABILITY_HREF[context]} onClick={dismiss}>
              How we measure it
            </Link>
          </Button>
          <Button onClick={dismiss} className="rounded-full px-5">
            Continue to Raise
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
