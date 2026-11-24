"use client";

// Find a topic across every course's lessons. "/" focuses the field; results are links.
import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SearchTopic {
  course: string;
  unit: number;
  unitTitle: string;
  id: string;
  title: string;
  href: string;
}

const MAX_RESULTS = 8;

function score(t: SearchTopic, words: string[]): number {
  const title = t.title.toLowerCase();
  const rest = `${t.unitTitle} ${t.course}`.toLowerCase();
  let s = 0;
  for (const w of words) {
    if (t.id === w) s += 10;
    else if (title.startsWith(w)) s += 4;
    else if (new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(title)) s += 3;
    else if (title.includes(w)) s += 2;
    else if (rest.includes(w)) s += 1;
    else return 0;
  }
  return s;
}

export function LessonSearch({ topics }: { topics: SearchTopic[] }) {
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, select, [contenteditable='true']")) return;
      e.preventDefault();
      input.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => {
    const words = deferred.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return topics
      .map((t) => ({ t, s: score(t, words) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, MAX_RESULTS)
      .map((r) => r.t);
  }, [deferred, topics]);

  const open = query.trim().length > 0;

  return (
    <div className="relative">
      <label htmlFor={`${listId}-q`} className="sr-only">
        Search lessons
      </label>
      <div
        className={cn(
          "flex h-14 items-center gap-3 rounded-2xl border border-border bg-background px-4 shadow-sm shadow-black/[0.03] transition-[border-color,box-shadow] focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/10",
          open && "rounded-b-none",
        )}
      >
        <Search aria-hidden className="size-5 shrink-0 text-muted-foreground" />
        <input
          ref={input}
          id={`${listId}-q`}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setQuery("");
          }}
          placeholder="Search a topic: torque, Gauss's law, 3.4…"
          autoComplete="off"
          aria-controls={open ? listId : undefined}
          className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground/70 [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              input.current?.focus();
            }}
            aria-label="Clear the search"
            className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        ) : (
          <kbd className="hidden shrink-0 rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground sm:block">
            /
          </kbd>
        )}
      </div>

      {open && (
        <div
          id={listId}
          className="absolute inset-x-0 top-full z-20 overflow-hidden rounded-b-2xl border border-t-0 border-border bg-popover shadow-xl shadow-black/10"
        >
          {results.length ? (
            <ul role="list" className="max-h-[22rem] list-none overflow-y-auto p-1.5">
              {results.map((t) => (
                <li key={t.href}>
                  <Link
                    href={t.href}
                    className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                  >
                    <span className="w-10 shrink-0 font-mono text-xs tabular-nums text-primary">
                      {t.id}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{t.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {t.course} · Unit {t.unit}: {t.unitTitle}
                      </span>
                    </span>
                    <ArrowRight
                      aria-hidden
                      className="size-4 shrink-0 text-muted-foreground opacity-0 transition-[opacity,transform] group-hover:translate-x-0.5 group-hover:opacity-100 group-focus-visible:opacity-100"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p role="status" className="px-4 py-5 text-sm text-muted-foreground">
              No topic matches “{query.trim()}”.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
