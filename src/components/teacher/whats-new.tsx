"use client";

import { useState } from "react";
import Link from "next/link";
import { Megaphone } from "lucide-react";
import { ClickIcon } from "@/components/ui/click-icon";
import { ChevronDownIcon as AnimatedChevronDown } from "@animateicons/react/lucide/chevron-down-icon";
import { XIcon as AnimatedX } from "@animateicons/react/lucide/x-icon";
import { useAuth } from "@/contexts/auth-context";
import { updateUserProfile } from "@/lib/firebase";
import { unseenWhatsNew, WHATS_NEW } from "@/lib/whats-new";
import { cn } from "@/lib/utils";

/**
 * A quiet "What's new" strip at the top of teacher pages. Collapsed it is one line the teacher can
 * ignore; "See what changed" opens the list. Dismissing stores the newest entry id in
 * preferences.whatsNewSeen, so it stays gone on every device until the next entry ships.
 */
export function WhatsNew() {
  const { user, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (!user || !profile || profile.role !== "teacher" || dismissed) return null;
  const entries = unseenWhatsNew(profile.preferences?.whatsNewSeen, profile.createdAt);
  if (entries.length === 0) return null;

  const latest = entries[0];
  const dismiss = () => {
    setDismissed(true);
    void updateUserProfile(user.uid, {
      preferences: { ...profile.preferences, whatsNewSeen: WHATS_NEW[0].id },
    }).catch(() => {});
  };

  return (
    <section
      aria-label="What's new in Scorpio"
      className="mb-6 rounded-xl border border-border/60 bg-card/60 text-sm backdrop-blur-sm"
    >
      <div className="flex items-center gap-2 px-4 py-2.5">
        <Megaphone className="size-4 shrink-0 text-primary" aria-hidden />
        <p className="min-w-0 flex-1 truncate">
          <span className="font-medium">What&apos;s new:</span>{" "}
          <span className="text-muted-foreground">{latest.title}</span>
          {entries.length > 1 && (
            <span className="text-muted-foreground"> and {entries.length - 1} more</span>
          )}
        </p>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {open ? "Hide" : "See what changed"}
          <ClickIcon
            icon={AnimatedChevronDown}
            className={cn("size-3.5 transition-transform", open && "rotate-180")}
          />
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss what's new"
          title="Dismiss"
          className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ClickIcon icon={AnimatedX} className="size-4" />
        </button>
      </div>
      {open && (
        <div className="space-y-4 border-t border-border/60 px-4 py-3">
          {entries.map((entry) => (
            <div key={entry.id}>
              <p className="font-medium">
                {entry.title}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  {new Date(`${entry.date}T12:00:00Z`).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </p>
              <ul className="mt-1.5 space-y-1.5 text-muted-foreground">
                {entry.items.map((item) => (
                  <li key={item.text} className="flex gap-2">
                    <span
                      aria-hidden
                      className="mt-2 size-1 shrink-0 rounded-full bg-purple-400/70"
                    />
                    <span>
                      {item.text}
                      {item.href && item.linkLabel && (
                        <>
                          {" "}
                          <Link
                            href={item.href}
                            className="font-medium text-foreground underline underline-offset-2 hover:text-purple-300"
                          >
                            {item.linkLabel}
                          </Link>
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <button
            type="button"
            onClick={dismiss}
            className="rounded-md border border-border/60 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
          >
            Got it
          </button>
        </div>
      )}
    </section>
  );
}
