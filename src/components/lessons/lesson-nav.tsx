"use client";

// The contents of a public lesson: the course's units (as a menu), the unit's topics, and under the
// open topic its sections, with the one on screen marked. A sidebar from lg up; below that, a bar
// under the site header that opens the same contents in a sheet.
import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ClickIcon } from "@/components/ui/click-icon";
import { CheckIcon as AnimatedCheck } from "@animateicons/react/lucide/check-icon";
import { ChevronDownIcon as AnimatedChevronDown } from "@animateicons/react/lucide/chevron-down-icon";
import { ChevronsUpDownIcon as AnimatedChevronsUpDown } from "@animateicons/react/lucide/chevrons-up-down-icon";
import { ListIcon as AnimatedList } from "@animateicons/react/lucide/list-icon";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { readTopics, subscribeRead } from "./lesson-topic";

export interface NavUnit {
  unit: number;
  title: string;
  href: string;
}
export interface NavTopic {
  id: string;
  title: string;
  href: string;
}
export interface NavSection {
  id: string;
  title: string;
}

interface LessonNavProps {
  curriculumId: string;
  /** Every course with lessons, for the course menu. */
  courses: { name: string; href: string }[];
  courseName: string;
  courseHref: string;
  units: NavUnit[];
  unit: number;
  topics: NavTopic[];
  active: string;
  sections: NavSection[];
}

/** The section whose heading was last scrolled past the top of the page. */
function useActiveSection(ids: string[]): string | undefined {
  const [current, setCurrent] = useState<string | undefined>(undefined);
  const key = ids.join("|");
  useEffect(() => {
    const els = key
      .split("|")
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => !!el);
    if (!els.length) return;
    const onScroll = () => {
      const line = Math.min(260, window.innerHeight * 0.3);
      let at: string | undefined;
      for (const el of els) if (el.getBoundingClientRect().top <= line) at = el.id;
      // At the very bottom the last section counts, even if its heading never reaches the line.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4)
        at = els.at(-1)!.id;
      setCurrent(at);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [key]);
  return current;
}

const emptySet = new Set<string>();

const triggerClass =
  "group flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted data-[state=open]:bg-muted focus-visible:bg-muted focus-visible:outline-none";
const chevronClass =
  "size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground";
const menuClass =
  "max-h-[min(28rem,70dvh)] w-[var(--radix-dropdown-menu-trigger-width)] min-w-64 overflow-y-auto p-1 shadow-xl shadow-black/20";

function Contents({
  curriculumId,
  courses,
  courseName,
  courseHref,
  units,
  unit,
  topics,
  active,
  sections,
  current,
  onNavigate,
}: LessonNavProps & { current?: string; onNavigate?: () => void }) {
  const marks = useSyncExternalStore(
    subscribeRead,
    () => [...readTopics(curriculumId)].join(","),
    () => "",
  );
  const read = marks ? new Set(marks.split(",")) : emptySet;
  const unitAt = units.findIndex((u) => u.unit === unit);
  const unitInfo = units[unitAt];

  return (
    <nav aria-label="Lesson contents" className="space-y-6 text-sm">
      {/* Course and unit as one control: two rows, each opening its own menu. */}
      <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-muted/40">
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Course: ${courseName}. Choose another course`}
              className={triggerClass}
            >
              <span className="w-12 shrink-0 text-[11px] text-muted-foreground">Course</span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{courseName}</span>
              <ClickIcon icon={AnimatedChevronsUpDown} aria-hidden className={chevronClass} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={6} className={menuClass}>
            {courses.map((c) => {
              const current = c.href === courseHref;
              return (
                <DropdownMenuItem key={c.href} asChild>
                  <Link
                    href={c.href}
                    onClick={onNavigate}
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-[13px] leading-snug",
                      current && "bg-muted font-medium",
                    )}
                  >
                    <span className="min-w-0 flex-1">{c.name}</span>
                    {current && (
                      <ClickIcon
                        icon={AnimatedCheck}
                        aria-hidden
                        className="size-4 shrink-0 text-primary"
                      />
                    )}
                  </Link>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title={unitInfo?.title}
              aria-label={`Unit ${unit}: ${unitInfo?.title ?? ""}. Choose another unit`}
              className={triggerClass}
            >
              <span className="w-12 shrink-0 text-[11px] text-muted-foreground">
                Unit <span className="font-mono tabular-nums text-primary">{unit}</span>
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                {unitInfo?.title ?? `Unit ${unit}`}
              </span>
              <ClickIcon icon={AnimatedChevronsUpDown} aria-hidden className={chevronClass} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={6} className={menuClass}>
            {units.map((u) => {
              const current = u.unit === unit;
              return (
                <DropdownMenuItem key={u.unit} asChild>
                  <Link
                    href={u.href}
                    onClick={onNavigate}
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-md px-2 py-2",
                      current && "bg-muted",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-7 shrink-0 place-items-center rounded-md font-mono text-xs tabular-nums",
                        current
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {u.unit}
                    </span>
                    <span
                      className={cn(
                        "min-w-0 flex-1 text-[13px] leading-snug",
                        current && "font-medium",
                      )}
                    >
                      {u.title}
                    </span>
                    {current && (
                      <ClickIcon
                        icon={AnimatedCheck}
                        aria-hidden
                        className="size-4 shrink-0 text-primary"
                      />
                    )}
                  </Link>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ol role="list" className="list-none space-y-0.5">
        {topics.map((t) => {
          const isActive = t.id === active;
          return (
            <li key={t.id}>
              <Link
                href={t.href}
                onClick={onNavigate}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex min-h-10 items-start gap-2.5 rounded-lg px-2.5 py-2 leading-snug transition-colors",
                  isActive
                    ? "bg-primary/10 font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "mt-px w-7 shrink-0 font-mono text-xs leading-5 tabular-nums",
                    isActive ? "text-primary" : "text-muted-foreground/80",
                  )}
                >
                  {t.id}
                </span>
                <span className="min-w-0 flex-1">{t.title}</span>
                {read.has(t.id) && !isActive && (
                  <ClickIcon
                    icon={AnimatedCheck}
                    className="mt-0.5 size-3.5 shrink-0 text-primary"
                    aria-label="Read"
                  />
                )}
              </Link>
              {isActive && sections.length > 0 && (
                <ol role="list" className="my-1 ml-[1.375rem] list-none border-l border-border">
                  {sections.map((s) => (
                    <li key={s.id}>
                      <a
                        href={`#${s.id}`}
                        onClick={onNavigate}
                        aria-current={current === s.id ? "location" : undefined}
                        className={cn(
                          "-ml-px flex min-h-8 items-center border-l py-1 pl-4 text-[13px] transition-colors",
                          current === s.id
                            ? "border-primary font-medium text-foreground"
                            : "border-transparent text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                        )}
                      >
                        {s.title}
                      </a>
                    </li>
                  ))}
                </ol>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function LessonNav(props: LessonNavProps) {
  const current = useActiveSection(props.sections.map((s) => s.id));
  const [open, setOpen] = useState(false);
  const activeTopic = props.topics.find((t) => t.id === props.active);
  const currentTitle = props.sections.find((s) => s.id === current)?.title;

  return (
    <>
      {/* Phone and tablet: a bar under the site header. */}
      <div className="sticky top-14 z-30 transition-[top] duration-300 ease-out motion-reduce:transition-none [html[data-header-hidden]_&]:top-0 -mx-5 border-b border-border/60 bg-background/85 px-5 backdrop-blur-lg sm:-mx-8 sm:px-8 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-12 w-full items-center gap-3 text-left text-sm"
          aria-label="Open the lesson contents"
        >
          <ClickIcon
            icon={AnimatedList}
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground"
          />
          <span className="min-w-0 flex-1 truncate">
            <span className="font-mono text-xs tabular-nums text-primary">{props.active}</span>{" "}
            <span className="font-medium">{activeTopic?.title}</span>
            {currentTitle && <span className="text-muted-foreground"> · {currentTitle}</span>}
          </span>
          <ClickIcon
            icon={AnimatedChevronDown}
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground"
          />
        </button>
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-[min(22rem,88vw)] gap-0 overflow-y-auto p-5 pt-12">
          <SheetTitle className="sr-only">Lesson contents</SheetTitle>
          <Contents {...props} current={current} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Desktop: the sidebar. */}
      <aside className="hidden lg:block">
        <div className="sticky top-20 max-h-[calc(100dvh-6rem)] transition-[top] duration-300 ease-out motion-reduce:transition-none [html[data-header-hidden]_&]:top-8 overflow-y-auto pb-8 pr-2 [scrollbar-width:thin]">
          <Contents {...props} current={current} />
        </div>
      </aside>
    </>
  );
}
