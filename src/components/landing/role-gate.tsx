"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { ArrowLeft, ArrowRight, GraduationCap, Presentation } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { FieldLines } from "@/components/landing/auth-split";
import { Logo } from "@/components/ui/logo";

// Auth is not loaded on the landing page, so this can't skip signed-in visitors.
const SEEN_KEY = "scorpio-role-gate-seen";

type Role = "student" | "teacher";

// Tiny external store over localStorage so the gate opens after hydration without setState in an effect.
const listeners = new Set<() => void>();
let dismissed = false;
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};
const hasSeen = () => {
  if (dismissed || document.documentElement.hasAttribute("data-to-portal")) return true;
  try {
    return !!localStorage.getItem(SEEN_KEY);
  } catch {
    return false;
  }
};

const roles: { role: Role; label: string; blurb: string; Icon: typeof GraduationCap }[] = [
  {
    role: "student",
    label: "Student",
    blurb: "I have a class code from my teacher",
    Icon: GraduationCap,
  },
  {
    role: "teacher",
    label: "Teacher",
    blurb: "I want to assign, grade and track work",
    Icon: Presentation,
  },
];

/** First-visit prompt: pick student or teacher, then go straight to sign up / log in. */
export function RoleGate() {
  const [role, setRole] = useState<Role | null>(null);
  // The server snapshot is "seen" so the dialog never renders into the static HTML.
  const seen = useSyncExternalStore(subscribe, hasSeen, () => true);
  const open = !seen;

  // Remember the visit once they pick a path (or choose to just browse).
  const leave = () => {
    dismissed = true;
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {}
    listeners.forEach((cb) => cb());
  };
  const browse = leave;

  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="gap-0 overflow-hidden rounded-3xl border-border/70 p-0 shadow-2xl sm:max-w-4xl md:grid-cols-[0.85fr_1.15fr]"
      >
        {/* Brand panel, same field lines as the login page */}
        <aside className="relative hidden min-h-[34rem] flex-col overflow-hidden border-r border-border/60 bg-muted/20 p-9 md:flex">
          <div className="relative z-10 flex items-center gap-2.5">
            <Logo size={30} className="text-primary" />
            <span className="text-lg font-semibold tracking-tight">Scorpio</span>
          </div>
          <FieldLines flip={false} />
        </aside>

        <div className="relative flex flex-col justify-center px-7 py-10 sm:px-12 sm:py-14">
          <div className="mb-6 flex items-center gap-2 md:hidden">
            <Logo size={24} className="text-primary" />
            <span className="font-semibold tracking-tight">Scorpio</span>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={role ?? "pick"}
              initial={{ opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -18 }}
              transition={{ duration: 0.22, ease: [0.32, 0, 0.35, 1] }}
            >
              <DialogTitle className="text-balance text-3xl font-semibold leading-tight tracking-[-0.035em] sm:text-[2.1rem]">
                {role ? "Great, let's get you in." : "Let's set up your workspace."}
              </DialogTitle>
              <DialogDescription className="mt-3 max-w-sm text-[0.95rem] leading-relaxed">
                {role
                  ? "Create a new account, or log in if you already have one."
                  : "Tell us how you'll use Scorpio and we'll take you to the right place."}
              </DialogDescription>

              <div className="my-8 border-t border-dashed border-border" />

              {role ? (
                <div className="grid gap-3">
                  <Link
                    href={`/signup?role=${role}`}
                    onClick={leave}
                    className="group flex items-center justify-between rounded-xl bg-primary px-5 py-4 text-sm font-medium text-primary-foreground shadow-sm shadow-primary/25 transition-transform hover:-translate-y-px active:scale-[0.98]"
                  >
                    Create a {role} account
                    <ArrowRight
                      aria-hidden
                      className="size-4 transition-transform group-hover:translate-x-0.5"
                    />
                  </Link>
                  <Link
                    href={`/login?role=${role}`}
                    onClick={leave}
                    className="flex items-center justify-between rounded-xl border border-border px-5 py-4 text-sm font-medium transition-all hover:bg-muted active:scale-[0.98]"
                  >
                    I already have an account
                    <ArrowRight aria-hidden className="size-4 text-muted-foreground" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => setRole(null)}
                    className="mt-2 inline-flex cursor-pointer items-center gap-1.5 self-start text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <ArrowLeft aria-hidden className="size-3.5" /> Change role
                  </button>
                </div>
              ) : (
                <div className="grid gap-3">
                  {roles.map(({ role: r, label, blurb, Icon }, i) => (
                    <motion.button
                      key={r}
                      type="button"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.06 + i * 0.07, duration: 0.3 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setRole(r)}
                      className="group flex cursor-pointer items-center gap-4 rounded-xl border border-border bg-muted/30 p-5 text-left transition-all hover:-translate-y-px hover:border-primary/50 hover:bg-muted/60"
                    >
                      <span className="grid size-12 shrink-0 place-items-center rounded-lg border border-border bg-background text-primary">
                        <Icon aria-hidden className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-base font-semibold tracking-tight">
                          {label}
                        </span>
                        <span className="block text-sm text-muted-foreground">{blurb}</span>
                      </span>
                      <ArrowRight
                        aria-hidden
                        className="size-4 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:text-primary"
                      />
                    </motion.button>
                  ))}
                  <button
                    type="button"
                    onClick={browse}
                    className="mt-1 cursor-pointer self-center justify-self-center text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                  >
                    I&apos;m just browsing
                  </button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}
