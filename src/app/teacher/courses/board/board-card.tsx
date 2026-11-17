"use client";

// One set on the Status board. The same card in every column; what it shows depends on the column:
// a planned date and Assign in Up next, hand-ins and the due date in Assigned, what is waiting in
// Needs you, the average in Done. Skipped and unpublished sets are dimmed under Up next.
import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  CalendarDays,
  ChevronRight,
  Eye,
  EyeOff,
  MoreHorizontal,
  Plus,
} from "lucide-react";
import { setProfile } from "@/data/curricula/profiles";
import { assignmentHref } from "@/lib/assignment-actions";
import type { BoardCard as Card, BoardColumnId, ParkedCard } from "@/lib/course-board";
import { AVAILABILITY_LABEL } from "@/lib/curriculum-roadmap";
import { cn } from "@/lib/utils";
import { AssignmentActionsMenu } from "@/components/teacher/assignment-actions-menu";
import { DueDateChip } from "@/components/teacher/due-date-chip";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PreviewTarget } from "../set-preview-dialog";
import { shortDate } from "../use-course-data";
import { setDisplayTitle, type SetRowActions } from "../use-set-actions";

/** What every card on the board needs besides its own set. */
export interface BoardCardContext {
  curriculumId: string;
  unitTitle: (unit: number) => string;
  /** Roster size, for "8 of 13 handed in". */
  students: number;
  /** Where each unassigned set lands at the current pace. */
  planned: Map<string, Date>;
  /** A change is being saved: buttons that would start another are off. */
  busy: boolean;
  onPreview: (t: PreviewTarget) => void;
  actions: SetRowActions;
  /** Move a set one place in Up next (undefined when the class has no plan to change). */
  onMove?: (card: Card, dir: -1 | 1) => void;
  /** Whether Move up / Move down would change anything for this card. */
  canMove?: (card: Card, dir: -1 | 1) => boolean;
}

const pill = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium";
const amber = "bg-amber-500/15 text-amber-700 dark:text-amber-400";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function Shell({
  card,
  ctx,
  className,
  title,
  menu,
  handle,
  children,
}: {
  card: Card;
  ctx: BoardCardContext;
  className?: string;
  /** The title as a link or button. */
  title: ReactNode;
  menu?: ReactNode;
  /** The drag handle, for cards that can be moved. */
  handle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <article
      aria-label={`${card.key} ${setDisplayTitle(ctx.curriculumId, card.s)}`}
      className={cn("space-y-2.5 rounded-2xl border border-border bg-card p-4 text-sm", className)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Unit {card.unit} · {ctx.unitTitle(card.unit)}
          </p>
          <h3 className="break-words font-semibold leading-snug">{title}</h3>
        </div>
        {(menu || handle) && (
          <div className="-mr-2 -mt-1.5 flex shrink-0 items-center">
            {handle}
            {menu}
          </div>
        )}
      </div>
      {children}
    </article>
  );
}

function previewTarget(card: Card, ctx: BoardCardContext): PreviewTarget {
  return {
    curriculumId: ctx.curriculumId,
    set: card.s.set,
    publishedId: card.s.published?.id ?? null,
    assignmentId: card.s.assignmentId,
  };
}

/** The set's key and name; opens the preview (not assigned) or the assignment (assigned). */
function Title({ card, ctx }: { card: Card; ctx: BoardCardContext }) {
  const text = (
    <>
      <span className="tabular-nums">{card.key}</span> {setDisplayTitle(ctx.curriculumId, card.s)}
    </>
  );
  return card.s.assignmentId ? (
    <Link href={assignmentHref(card.s.assignmentId)} className="hover:text-primary hover:underline">
      {text}
    </Link>
  ) : (
    <button
      type="button"
      onClick={() => ctx.onPreview(previewTarget(card, ctx))}
      className="text-left hover:text-primary hover:underline"
    >
      {text}
    </button>
  );
}

function problems(card: Card, ctx: BoardCardContext): string | null {
  const n = card.s.published?.questionCount || setProfile(ctx.curriculumId, card.key)?.problems;
  return n ? plural(n, "problem") : null;
}

function handedIn(card: Card, ctx: BoardCardContext) {
  const submitted = card.progress?.submitted ?? 0;
  const of = Math.max(ctx.students, submitted);
  // Nobody is on the roster yet, so there is nobody to hand anything in.
  return { submitted, of, text: of === 0 ? "No students yet" : `${submitted} of ${of} handed in` };
}

/** Preview and Results, for the ⋯ menu of an assigned set. */
function copyMenuItems(card: Card, ctx: BoardCardContext) {
  return (
    <>
      <DropdownMenuItem asChild>
        <Link href={assignmentHref(card.s.assignmentId!)}>
          <BarChart3 /> Results
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => ctx.onPreview(previewTarget(card, ctx))}>
        <Eye /> Preview
      </DropdownMenuItem>
    </>
  );
}

function CopyMenu({ card, ctx }: { card: Card; ctx: BoardCardContext }) {
  if (!card.s.assignmentId || !ctx.actions.onCopyChanged) return null;
  return (
    <AssignmentActionsMenu
      id={card.s.assignmentId}
      title={setDisplayTitle(ctx.curriculumId, card.s)}
      onChanged={ctx.actions.onCopyChanged}
      extraItems={copyMenuItems(card, ctx)}
    />
  );
}

function UpNextCard({
  card,
  ctx,
  handle,
}: {
  card: Card;
  ctx: BoardCardContext;
  handle?: ReactNode;
}) {
  const planned = ctx.planned.get(card.key);
  const { onAssignSet, onToggleSkip } = ctx.actions;
  const count = problems(card, ctx);
  return (
    <Shell
      card={card}
      ctx={ctx}
      handle={handle}
      title={<Title card={card} ctx={ctx} />}
      menu={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${card.key}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onSelect={() => ctx.onPreview(previewTarget(card, ctx))}>
              <Eye /> Preview
            </DropdownMenuItem>
            {ctx.onMove && (
              <>
                <DropdownMenuItem
                  disabled={ctx.busy || !ctx.canMove?.(card, -1)}
                  onSelect={() => ctx.onMove!(card, -1)}
                >
                  <ArrowUp /> Move up
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={ctx.busy || !ctx.canMove?.(card, 1)}
                  onSelect={() => ctx.onMove!(card, 1)}
                >
                  <ArrowDown /> Move down
                </DropdownMenuItem>
              </>
            )}
            {onToggleSkip && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => onToggleSkip(card.s)}>
                  <EyeOff /> Skip for this class
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {card.s.archivedId ? "Archived · Restore brings it back" : count}
        </span>
        {planned && (
          <span
            title="Planned due date at this pace"
            className={cn(pill, "border border-border font-normal text-muted-foreground")}
          >
            <CalendarDays className="size-3.5" aria-hidden />
            <span className="sr-only">Planned due date </span>
            {shortDate(planned)}
          </span>
        )}
      </div>
      {onAssignSet && (
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          disabled={ctx.busy}
          onClick={() => onAssignSet(card.s)}
        >
          <Plus aria-hidden /> {card.s.archivedId ? "Restore" : "Assign"}
        </Button>
      )}
    </Shell>
  );
}

const PARKED_LABEL: Record<ParkedCard["reason"], string> = {
  skipped: "Skipped",
  unpublished: AVAILABILITY_LABEL.awaiting,
  planned: AVAILABILITY_LABEL.planned,
};

function Parked({ card, ctx }: { card: ParkedCard; ctx: BoardCardContext }) {
  const { onToggleSkip } = ctx.actions;
  return (
    <Shell
      card={card}
      ctx={ctx}
      className="border-dashed bg-transparent"
      title={<Title card={card} ctx={ctx} />}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={cn(pill, "bg-muted font-normal text-muted-foreground")}>
          {PARKED_LABEL[card.reason]}
        </span>
        {card.reason === "skipped" && onToggleSkip && (
          <Button
            variant="ghost"
            size="sm"
            className="-mr-2 h-7"
            onClick={() => onToggleSkip(card.s)}
          >
            Unskip
          </Button>
        )}
      </div>
    </Shell>
  );
}

function AssignedCard({
  card,
  ctx,
  handle,
}: {
  card: Card;
  ctx: BoardCardContext;
  handle?: ReactNode;
}) {
  const { submitted, of, text } = handedIn(card, ctx);
  const overdue = card.progress?.overdue ?? 0;
  const full = of > 0 && submitted >= of;
  const { onChangeDue } = ctx.actions;
  return (
    <Shell
      card={card}
      ctx={ctx}
      handle={handle}
      title={<Title card={card} ctx={ctx} />}
      menu={<CopyMenu card={card} ctx={ctx} />}
    >
      <div
        role="progressbar"
        aria-label="Handed in"
        aria-valuemin={0}
        aria-valuemax={of}
        aria-valuenow={submitted}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn("h-full rounded-full", full ? "bg-green-500" : "bg-primary")}
          style={{ width: `${of ? (submitted / of) * 100 : 0}%` }}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {card.progress ? text : "Loading…"}
          {overdue > 0 && (
            <span className={cn(pill, "bg-destructive/10 text-destructive")}>
              {overdue} overdue
            </span>
          )}
        </span>
        {onChangeDue ? (
          <DueDateChip
            due={card.s.dueDate}
            className="-mr-2"
            onChange={(d) => onChangeDue(card.s, d)}
          />
        ) : (
          card.s.dueDate && (
            <span className="text-xs text-muted-foreground">{shortDate(card.s.dueDate)}</span>
          )
        )}
      </div>
    </Shell>
  );
}

function NeedsYouCard({ card, ctx }: { card: Card; ctx: BoardCardContext }) {
  const pending = card.progress?.pending ?? 0;
  const flagged = card.progress?.needsReview ?? 0;
  return (
    <Shell
      card={card}
      ctx={ctx}
      className="border-amber-500/50"
      title={<Title card={card} ctx={ctx} />}
      menu={<CopyMenu card={card} ctx={ctx} />}
    >
      <div className="flex flex-wrap gap-1.5">
        {pending > 0 && (
          <span className={cn(pill, amber)}>Check {plural(pending, "written answer")}</span>
        )}
        {flagged > 0 && <span className={cn(pill, amber)}>Key changed · {flagged} to check</span>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{handedIn(card, ctx).text}</span>
        <Button size="sm" asChild>
          <Link href={assignmentHref(card.s.assignmentId!)}>
            {pending > 0 ? "Grade" : "Review"}
            <span className="sr-only"> {card.key}</span>
          </Link>
        </Button>
      </div>
    </Shell>
  );
}

function DoneCard({ card, ctx }: { card: Card; ctx: BoardCardContext }) {
  const average = card.progress?.averageScore ?? null;
  return (
    <Shell
      card={card}
      ctx={ctx}
      title={<Title card={card} ctx={ctx} />}
      menu={<CopyMenu card={card} ctx={ctx} />}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        {average === null ? (
          <span className={cn(pill, "bg-muted font-normal text-muted-foreground")}>
            {handedIn(card, ctx).submitted ? "Not graded" : "No hand-ins"}
          </span>
        ) : (
          <span className={cn(pill, "bg-green-500/15 text-green-700 dark:text-green-400")}>
            Avg {average}%
          </span>
        )}
        <Link
          href={assignmentHref(card.s.assignmentId!)}
          className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          Results<span className="sr-only"> for {card.key}</span>
          <ChevronRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    </Shell>
  );
}

export function BoardCard({
  column,
  card,
  ctx,
  handle,
}: {
  column: BoardColumnId;
  card: Card;
  ctx: BoardCardContext;
  /** The drag handle (Up next and Assigned cards can be moved). */
  handle?: ReactNode;
}) {
  if (column === "upNext") return <UpNextCard card={card} ctx={ctx} handle={handle} />;
  if (column === "assigned") return <AssignedCard card={card} ctx={ctx} handle={handle} />;
  if (column === "needsYou") return <NeedsYouCard card={card} ctx={ctx} />;
  return <DoneCard card={card} ctx={ctx} />;
}

export function ParkedBoardCard({ card, ctx }: { card: ParkedCard; ctx: BoardCardContext }) {
  return (
    <div className="opacity-70">
      <Parked card={card} ctx={ctx} />
    </div>
  );
}
