"use client";

// A title you can click to rename. Enter or leaving the field saves; Escape cancels.
import { useEffect, useRef, useState, type ElementType } from "react";
import { Check, Loader2, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

export function InlineTitle({
  value,
  onSave,
  as: Tag = "span",
  maxLength = 200,
  className,
  inputClassName,
  label = "Rename",
}: {
  value: string;
  /** Throw to stay in edit mode; show your own toast. */
  onSave: (next: string) => Promise<void> | void;
  as?: ElementType;
  maxLength?: number;
  className?: string;
  inputClassName?: string;
  label?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  const commit = async () => {
    const next = draft.trim();
    if (!next || next === value) return setEditing(false);
    setSaving(true);
    try {
      await onSave(next);
      setEditing(false);
    } catch {
      input.current?.focus();
    } finally {
      setSaving(false);
    }
  };

  if (editing)
    return (
      <span className="inline-flex w-full min-w-0 items-center gap-1">
        <input
          ref={input}
          value={draft}
          maxLength={maxLength}
          aria-label={label}
          disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              setDraft(value);
              setEditing(false);
            }
          }}
          className={cn(
            "min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring",
            inputClassName,
          )}
        />
        {saving ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : (
          <Check className="size-4 text-muted-foreground" aria-hidden />
        )}
      </span>
    );

  return (
    <Tag className={cn("group inline-flex min-w-0 items-center gap-1.5", className)}>
      <span className="min-w-0 break-words">{value}</span>
      <button
        type="button"
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        aria-label={`${label}: ${value}`}
        className="shrink-0 rounded p-0.5 text-muted-foreground opacity-60 transition-opacity hover:bg-accent hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Pencil className="size-3.5" />
      </button>
    </Tag>
  );
}
