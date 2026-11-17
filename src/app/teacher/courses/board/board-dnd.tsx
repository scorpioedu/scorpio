"use client";

// Drag and drop for the Status board (@dnd-kit): the sensors (mouse, touch with a press delay,
// keyboard), which droppable a dragged card is over, and the wrappers that make a card draggable.
// What a drop means is decided by boardDrop in src/lib/course-board.ts.
import type { ReactNode } from "react";
import { GripVertical } from "lucide-react";
import {
  KeyboardCode,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { DROP_ASSIGNED, DROP_UP_NEXT, type BoardColumnId } from "@/lib/course-board";

const isPlace = (id: unknown) => String(id).startsWith("drop:");

/**
 * The droppable under the pointer, a card before the column it sits in. With the keyboard there is
 * no pointer, so it is whatever the moved card overlaps most.
 */
export const boardCollision: CollisionDetection = (args) => {
  const under = pointerWithin(args);
  const hits = under.length ? under : rectIntersection(args);
  if (!hits.length) return [];
  const card = hits.find((h) => !isPlace(h.id));
  return [card ?? hits[0]];
};

/**
 * Where the arrow keys carry a card. Sideways goes to the other column's drop box (right from Up
 * next, left from Assigned) and back to where the card started; up and down step through the Up
 * next cards. Returns the new top-left corner for the carried card.
 */
export const boardKeyboardCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
  const { active, over, droppableRects } = context;
  const moves: string[] = [
    KeyboardCode.Up,
    KeyboardCode.Down,
    KeyboardCode.Left,
    KeyboardCode.Right,
  ];
  if (!active || !moves.includes(event.code)) return undefined;
  event.preventDefault();
  const data = active.data.current as
    (DragData & { sortable?: { items: (string | number)[] } }) | undefined;
  const fromUpNext = data?.column === "upNext";
  // An Up next card's own slot is a droppable, so its place is known even after the page scrolls.
  const home = droppableRects.get(active.id) ?? active.rect.current.initial;
  const at = (rect: { left: number; top: number } | null | undefined) =>
    rect ? { x: rect.left, y: rect.top } : undefined;
  const away = fromUpNext ? KeyboardCode.Right : KeyboardCode.Left;
  const back = fromUpNext ? KeyboardCode.Left : KeyboardCode.Right;
  if (event.code === away) {
    // Land just under the drop box's top edge, so its words stay readable above the card.
    const box = droppableRects.get(fromUpNext ? DROP_ASSIGNED : DROP_UP_NEXT);
    return box ? { x: box.left, y: box.bottom - 12 } : undefined;
  }
  if (event.code === back) return at(home);
  // Up and down reorder Up next; an Assigned card has nowhere to go that way.
  const items = fromUpNext ? (data?.sortable?.items ?? []) : [];
  const from = items.indexOf(over && items.includes(over.id) ? over.id : active.id);
  const to = from + (event.code === KeyboardCode.Down ? 1 : -1);
  if (from < 0 || to < 0 || to >= items.length) return undefined;
  return at(items[to] === active.id ? home : droppableRects.get(items[to]));
};

export function useBoardSensors() {
  return useSensors(
    // A small move starts a drag, so a click on a card's buttons still works.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // On a phone a press and hold picks a card up; a swipe still scrolls.
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: boardKeyboardCoordinates }),
  );
}

/** What a card tells the board about itself while it is dragged. */
export interface DragData {
  column: BoardColumnId;
}

function Handle({
  label,
  setRef,
  attributes,
}: {
  label: string;
  setRef: (el: HTMLElement | null) => void;
  attributes: object;
}) {
  return (
    <button
      type="button"
      ref={setRef}
      aria-label={label}
      className="cursor-grab rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
      {...attributes}
    >
      <GripVertical className="size-4" aria-hidden />
    </button>
  );
}

const item = (dragging: boolean, disabled: boolean) =>
  cn(
    "touch-manipulation select-none rounded-2xl",
    !disabled && "cursor-grab active:cursor-grabbing",
    dragging && "opacity-40",
  );

/** An Up next card: can be reordered among the others and dragged to Assigned. */
export function SortableCard({
  id,
  label,
  disabled,
  children,
}: {
  id: string;
  /** For the drag handle, e.g. "Move 5A Torque basics". */
  label: string;
  disabled: boolean;
  children: (handle: ReactNode) => ReactNode;
}) {
  const data: DragData = { column: "upNext" };
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, data, disabled });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={item(isDragging, disabled)}
      {...listeners}
    >
      {children(
        disabled ? null : (
          <Handle label={label} setRef={setActivatorNodeRef} attributes={attributes} />
        ),
      )}
    </li>
  );
}

/** An Assigned card: can be dragged back to Up next. */
export function DraggableCard({
  id,
  label,
  disabled,
  children,
}: {
  id: string;
  label: string;
  disabled: boolean;
  children: (handle: ReactNode) => ReactNode;
}) {
  const data: DragData = { column: "assigned" };
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, isDragging } = useDraggable({
    id,
    data,
    disabled,
  });
  return (
    <li ref={setNodeRef} className={item(isDragging, disabled)} {...listeners}>
      {children(
        disabled ? null : (
          <Handle label={label} setRef={setActivatorNodeRef} attributes={attributes} />
        ),
      )}
    </li>
  );
}

/** Makes a whole column a place to drop on; `active` lights it while a card that fits is dragged. */
export function useColumnDrop(id: string, active: boolean) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !active });
  return { setNodeRef, isOver: active && isOver };
}

/** The dashed box at the top of a column that says what dropping there does. */
export function DropHint({
  id,
  over,
  children,
}: {
  id: string;
  over: boolean;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-2xl border-2 border-dashed px-3 py-5 text-center text-sm font-medium transition-colors",
        over || isOver
          ? "border-primary bg-primary/15 text-primary"
          : "border-primary/50 bg-primary/5 text-primary",
      )}
    >
      {children}
    </div>
  );
}
