// One column of the Status board: a heading with a count, then its cards (or a line saying why it is empty).
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { BoardColumnId } from "@/lib/course-board";

export const COLUMN_TITLE: Record<BoardColumnId, string> = {
  upNext: "Up next",
  assigned: "Assigned",
  needsYou: "Needs you",
  done: "Done",
};

export function BoardColumn({
  id,
  count,
  empty,
  children,
  footer,
  top,
  dropRef,
  highlight = false,
  className,
}: {
  id: BoardColumnId;
  count: number;
  /** Shown when the column has no cards. */
  empty: string;
  /** The cards, as <li> elements. */
  children?: ReactNode;
  /** Under the cards: "+8 more", parked sets. */
  footer?: ReactNode;
  /** Above the cards: the dashed "Drop to assign" box while a card is dragged. */
  top?: ReactNode;
  /** Makes the whole column a place to drop a dragged card. */
  dropRef?: (el: HTMLElement | null) => void;
  /** A dragged card is over the column. */
  highlight?: boolean;
  className?: string;
}) {
  const heading = `board-${id}`;
  return (
    <section
      id={`column-${id}`}
      ref={dropRef}
      aria-labelledby={heading}
      className={cn(
        "flex min-h-56 min-w-0 flex-col gap-3 rounded-3xl border border-border bg-muted/30 p-3 transition-colors",
        highlight && "border-primary/60 bg-primary/5",
        className,
      )}
    >
      <h2 id={heading} className="flex items-center gap-2 px-2 pt-1.5 text-sm font-semibold">
        {COLUMN_TITLE[id]}
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
            id === "needsYou" && count > 0
              ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
              : "bg-muted text-muted-foreground",
          )}
        >
          {count}
          <span className="sr-only"> {count === 1 ? "set" : "sets"}</span>
        </span>
      </h2>
      {top}
      {count > 0 ? (
        <ul className="space-y-3">{children}</ul>
      ) : top ? null : (
        <p className="px-3 py-6 text-center text-sm text-muted-foreground">{empty}</p>
      )}
      {footer}
    </section>
  );
}
