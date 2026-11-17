"use client";

// The one save pattern for multi-field edits: a bar pinned to the bottom of the page while there are
// unsaved changes, with Discard and Save. Pages pair it with useUnsavedGuard.
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SaveBar({
  dirty,
  saving = false,
  onSave,
  onDiscard,
  label = "Unsaved changes",
  saveLabel = "Save changes",
  note,
  className,
}: {
  dirty: boolean;
  saving?: boolean;
  onSave: () => void;
  onDiscard: () => void;
  label?: string;
  saveLabel?: string;
  /** Extra line under the label, e.g. "Saving re-grades 12 submissions". */
  note?: string;
  className?: string;
}) {
  if (!dirty && !saving) return null;
  return (
    <div
      role="region"
      aria-label="Unsaved changes"
      className={cn(
        "sticky bottom-4 z-30 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card/95 px-4 py-3 shadow-lg backdrop-blur",
        className,
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium">
          <span
            className="mr-2 inline-block size-2 rounded-full bg-amber-500 align-middle"
            aria-hidden
          />
          {label}
        </p>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={onDiscard} disabled={saving}>
          Discard
        </Button>
        <Button size="sm" onClick={onSave} disabled={saving}>
          {saving && <Loader2 className="animate-spin" />}
          {saving ? "Saving…" : saveLabel}
        </Button>
      </div>
    </div>
  );
}
