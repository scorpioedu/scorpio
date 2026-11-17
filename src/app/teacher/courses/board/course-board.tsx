"use client";

// The Status board: every set of the class's course in one of four columns, by where it stands
// (see boardColumns in src/lib/course-board.ts for the rules). Above the columns: the class's
// numbers, a unit filter and Show done. Cards can be dragged: Up next to Assigned assigns the set,
// Assigned to Up next archives its copy, and Up next cards can be reordered inside their unit.
// Each drag has a button that does the same (Assign, ⋯ Archive, ⋯ Move up / Move down).
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DndContext, DragOverlay, type Announcements, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Curriculum } from "@/data/curricula";
import {
  DROP_ASSIGNED,
  DROP_UP_NEXT,
  boardColumns,
  boardDrop,
  boardStats,
  dropInUpNext,
  filterBoard,
  nextAssignDate,
  nudgeInUpNext,
  plannedDates,
  type BoardCard as Card,
  type BoardColumnId,
  type UpNextMove,
} from "@/lib/course-board";
import type { Pacing } from "@/lib/course-pacing";
import type { RoadmapSet, RoadmapUnit } from "@/lib/curriculum-roadmap";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { PreviewTarget } from "../set-preview-dialog";
import { shortDate, type ClassProgress } from "../use-course-data";
import { setDisplayTitle, type SetRowActions } from "../use-set-actions";
import { BoardCard, ParkedBoardCard, type BoardCardContext } from "./board-card";
import { BoardColumn } from "./board-column";
import {
  boardCollision,
  DraggableCard,
  DropHint,
  SortableCard,
  useBoardSensors,
  useColumnDrop,
  type DragData,
} from "./board-dnd";
import { BoardStats } from "./board-stats";
import { UnitFilter } from "./unit-filter";

/** Cards shown before "+n more" in Up next and Done. */
const UP_NEXT_SHOWN = 6;
const DONE_SHOWN = 4;

const OTHER_UNIT = "Sets stay inside their unit. Use Reorder or skip to move a whole unit.";

function More({ count, label, onClick }: { count: number; label: string; onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="self-center text-muted-foreground"
      onClick={onClick}
    >
      + {count} more {label}
    </Button>
  );
}

/** What the board can change besides what a roadmap row can. */
export interface BoardActions extends SetRowActions {
  /** Assign one set now with this due date (a card dropped on Assigned). */
  onAssignNow: (s: RoadmapSet, due: Date) => void;
  /** Archive the class's copy (a card dropped on Up next). */
  onArchive: (s: RoadmapSet) => void;
  /** Save a new order of sets; undefined when the class does not follow the course. */
  onReorder?: (order: string[], done: string) => void;
}

export function CourseBoard({
  curriculum,
  roadmap,
  progress,
  pacing,
  planOrder,
  unit,
  onUnit,
  showDone,
  onShowDone,
  busy,
  onPreview,
  actions,
}: {
  curriculum: Curriculum;
  roadmap: RoadmapUnit[];
  /** Null while the class's progress is loading. */
  progress: ClassProgress | null;
  pacing: Pacing;
  /** The class's order of sets, when it follows the course (needed to reorder Up next). */
  planOrder: string[] | null;
  /** The unit the board is narrowed to (?unit=), or null. */
  unit: number | null;
  onUnit: (unit: number | null) => void;
  /** Show every finished set instead of the latest few. */
  showDone: boolean;
  onShowDone: (show: boolean) => void;
  busy: boolean;
  onPreview: (t: PreviewTarget) => void;
  actions: BoardActions;
}) {
  const [allUpNext, setAllUpNext] = useState(false);
  const [dragging, setDragging] = useState<{ card: Card; column: BoardColumnId } | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<Card | null>(null);
  const sensors = useBoardSensors();
  const students = progress?.students ?? 0;
  const all = useMemo(
    () => boardColumns(roadmap, progress?.sets, students),
    [roadmap, progress, students],
  );
  const stats = useMemo(() => boardStats(all), [all]);
  const units = useMemo(
    () => roadmap.map((u) => ({ unit: u.unit, title: u.info?.title ?? "" })),
    [roadmap],
  );
  // A unit that is not in this course (an old link) shows everything.
  const shownUnit = units.some((u) => u.unit === unit) ? unit : null;
  const columns = useMemo(() => filterBoard(all, shownUnit), [all, shownUnit]);
  const planned = useMemo(() => plannedDates(pacing), [pacing]);
  const assignDate = useMemo(() => nextAssignDate(pacing), [pacing]);
  const queue = useMemo(() => all.upNext.map((c) => c.key), [all]);
  const title = (card: Card) => `${card.key} ${setDisplayTitle(curriculum.id, card.s)}`;

  const canReorder = !!actions.onReorder && !!planOrder;
  const reorder = (card: Card, move: UpNextMove, done: string) => {
    if (move.ok) actions.onReorder?.(move.order, done);
    else if (move.reason === "unit") toast.info(OTHER_UNIT);
  };

  const ctx: BoardCardContext = {
    curriculumId: curriculum.id,
    unitTitle: (n) => units.find((u) => u.unit === n)?.title ?? "",
    students,
    planned,
    busy,
    onPreview,
    actions,
    ...(canReorder
      ? {
          canMove: (card, dir) => nudgeInUpNext(planOrder, queue, card.key, dir).ok,
          onMove: (card, dir) =>
            reorder(
              card,
              nudgeInUpNext(planOrder, queue, card.key, dir),
              `${card.key} moved ${dir < 0 ? "up" : "down"}`,
            ),
        }
      : {}),
  };

  // One unit is short enough to show whole.
  const upNext =
    allUpNext || shownUnit !== null ? columns.upNext : columns.upNext.slice(0, UP_NEXT_SHOWN);
  const done = showDone ? columns.done : columns.done.slice(0, DONE_SHOWN);
  const shownQueue = upNext.map((c) => c.key);
  const find = (key: unknown) =>
    [...columns.upNext, ...columns.assigned].find((c) => c.key === String(key));

  const archive = (card: Card) =>
    // Work that students handed in is hidden with the copy, so ask first.
    card.progress?.submitted ? setConfirmArchive(card) : actions.onArchive(card.s);

  const drop = ({ over }: DragEndEvent) => {
    const from = dragging;
    setDragging(null);
    if (!from || busy) return;
    const { card } = from;
    const what = boardDrop(from.column, card.key, over ? String(over.id) : null, shownQueue);
    if (what?.type === "assign" && assignDate) actions.onAssignNow(card.s, assignDate);
    else if (what?.type === "archive") archive(card);
    else if (what?.type === "reorder") {
      if (!canReorder) toast.info("Follow the course to reorder its sets.");
      else
        reorder(
          card,
          dropInUpNext(planOrder, card.key, what.overKey),
          `${card.key} moved ${planOrder.indexOf(what.overKey) < planOrder.indexOf(card.key) ? "up" : "down"}`,
        );
    }
  };

  /** What a screen reader hears for where the card is. */
  const where = (key: unknown, column: BoardColumnId | undefined, over: unknown): string => {
    const card = find(key);
    if (!card || !column) return "";
    const what = boardDrop(column, card.key, over == null ? null : String(over), shownQueue);
    if (what?.type === "assign")
      return `Over Assigned. Drop to assign ${card.key}${assignDate ? `, due ${shortDate(assignDate)}` : ""}.`;
    if (what?.type === "archive") return `Over Up next. Drop to archive ${card.key}.`;
    if (what?.type === "reorder")
      return canReorder && dropInUpNext(planOrder, card.key, what.overKey).ok
        ? `Over ${what.overKey}. Drop to put ${card.key} in its place.`
        : `Over ${what.overKey}. ${card.key} cannot move there.`;
    return `${card.key} is not over a place to drop.`;
  };
  const column = (active: { data: { current?: unknown } }) =>
    (active.data.current as DragData | undefined)?.column;
  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      const card = find(active.id);
      if (!card) return undefined;
      return column(active) === "upNext"
        ? `Picked up ${title(card)}. Move right to Assigned to hand it out, or up and down to reorder.`
        : `Picked up ${title(card)}. Move left to Up next to archive it.`;
    },
    onDragOver: ({ active, over }) => where(active.id, column(active), over?.id),
    onDragEnd: ({ active, over }) => {
      const from = column(active);
      const what =
        from && boardDrop(from, String(active.id), over ? String(over.id) : null, shownQueue);
      return what ? `${active.id} dropped.` : `${active.id} was put back.`;
    },
    onDragCancel: ({ active }) => `Move cancelled. ${active.id} is back where it was.`,
  };

  const fromUpNext = dragging?.column === "upNext";
  const fromAssigned = dragging?.column === "assigned";
  const assignedDrop = useColumnDrop(`${DROP_ASSIGNED}:column`, fromUpNext);
  const upNextDrop = useColumnDrop(`${DROP_UP_NEXT}:column`, fromAssigned);

  const plain = (id: "needsYou" | "done", list: Card[]) =>
    list.map((card) => (
      <li key={card.key}>
        <BoardCard column={id} card={card} ctx={ctx} />
      </li>
    ));

  return (
    <div className="space-y-4">
      <BoardStats
        stats={stats}
        finish={pacing.finish}
        remaining={pacing.remaining}
        loading={progress === null}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <UnitFilter units={units} value={shownUnit} onChange={onUnit} />
        {columns.done.length > DONE_SHOWN && (
          <Button
            variant="outline"
            size="sm"
            aria-pressed={showDone}
            onClick={() => onShowDone(!showDone)}
          >
            {showDone ? "Show fewer done" : `Show done (${columns.done.length})`}
          </Button>
        )}
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={boardCollision}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable:
              "To pick up a set, press space or enter on its move button. Use the arrow keys to carry it between Up next and Assigned, or up and down to reorder Up next. Press space or enter again to drop it, or escape to cancel.",
          },
        }}
        onDragStart={({ active }) => {
          const card = find(active.id);
          const from = column(active);
          setDragging(card && from ? { card, column: from } : null);
        }}
        onDragEnd={drop}
        onDragCancel={() => setDragging(null)}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <BoardColumn
            id="upNext"
            count={columns.upNext.length}
            dropRef={upNextDrop.setNodeRef}
            highlight={upNextDrop.isOver}
            top={
              fromAssigned && (
                <DropHint id={DROP_UP_NEXT} over={upNextDrop.isOver}>
                  Drop to archive · students stop seeing it
                </DropHint>
              )
            }
            empty={
              columns.parked.length
                ? "Nothing here is ready to assign."
                : "Every set is assigned. Nothing is waiting."
            }
            footer={
              <>
                {upNext.length < columns.upNext.length && (
                  <More
                    count={columns.upNext.length - upNext.length}
                    label="planned"
                    onClick={() => setAllUpNext(true)}
                  />
                )}
                {columns.parked.length > 0 && (
                  <ul aria-label="Skipped or not published yet" className="space-y-3">
                    {columns.parked.map((card) => (
                      <li key={card.key}>
                        <ParkedBoardCard card={card} ctx={ctx} />
                      </li>
                    ))}
                  </ul>
                )}
              </>
            }
          >
            <SortableContext items={shownQueue} strategy={verticalListSortingStrategy}>
              {upNext.map((card) => (
                <SortableCard
                  key={card.key}
                  id={card.key}
                  label={`Move ${title(card)}`}
                  disabled={busy}
                >
                  {(handle) => <BoardCard column="upNext" card={card} ctx={ctx} handle={handle} />}
                </SortableCard>
              ))}
            </SortableContext>
          </BoardColumn>
          <BoardColumn
            id="assigned"
            count={columns.assigned.length}
            dropRef={assignedDrop.setNodeRef}
            highlight={assignedDrop.isOver}
            top={
              fromUpNext && (
                <DropHint id={DROP_ASSIGNED} over={assignedDrop.isOver}>
                  Drop to assign{assignDate ? ` · due ${shortDate(assignDate)}` : ""}
                </DropHint>
              )
            }
            empty="Nothing is out with students. Drag a set here from Up next, or press Assign on it."
          >
            {columns.assigned.map((card) => (
              <DraggableCard
                key={card.key}
                id={card.key}
                label={`Move ${title(card)}`}
                disabled={busy}
              >
                {(handle) => <BoardCard column="assigned" card={card} ctx={ctx} handle={handle} />}
              </DraggableCard>
            ))}
          </BoardColumn>
          <BoardColumn
            id="needsYou"
            count={columns.needsYou.length}
            empty="Written answers and changed answer keys land here."
          >
            {plain("needsYou", columns.needsYou)}
          </BoardColumn>
          <BoardColumn
            id="done"
            count={columns.done.length}
            empty="Sets move here once everyone has handed them in, or the due date has passed with nobody missing."
            footer={
              done.length < columns.done.length && (
                <More
                  count={columns.done.length - done.length}
                  label="done"
                  onClick={() => onShowDone(true)}
                />
              )
            }
          >
            {plain("done", done)}
          </BoardColumn>
        </div>
        <DragOverlay>
          {dragging && (
            <div className="rotate-1 cursor-grabbing rounded-2xl shadow-xl ring-2 ring-primary">
              <BoardCard column={dragging.column} card={dragging.card} ctx={ctx} />
            </div>
          )}
        </DragOverlay>
      </DndContext>
      <ConfirmDialog
        open={confirmArchive !== null}
        onOpenChange={(open) => !open && setConfirmArchive(null)}
        title={confirmArchive ? `Archive ${title(confirmArchive)}?` : ""}
        description={
          confirmArchive
            ? `${confirmArchive.progress?.submitted} ${confirmArchive.progress?.submitted === 1 ? "student has" : "students have"} handed it in. Their work is kept and comes back if you assign the set again, but students stop seeing it.`
            : ""
        }
        confirmText="Archive"
        onConfirm={() => confirmArchive && actions.onArchive(confirmArchive.s)}
      />
    </div>
  );
}
