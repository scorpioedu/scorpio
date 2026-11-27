"use client";

// Edit the class's order and skipped sets right on the roadmap: drag a unit or a set (or use the
// arrows / keyboard), tick Skip, then save. Sets never leave their unit. After saving, assigned sets
// can be re-dated so their due dates follow the new order.
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ClickIcon } from "@/components/ui/click-icon";
import { ArrowDownIcon as AnimatedArrowDown } from "@animateicons/react/lucide/arrow-down-icon";
import { ArrowUpIcon as AnimatedArrowUp } from "@animateicons/react/lucide/arrow-up-icon";
import { GripVerticalIcon as AnimatedGripVertical } from "@animateicons/react/lucide/grip-vertical-icon";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { apUnit } from "@/data/ap";
import { curriculumSet, getCurriculum } from "@/data/curricula";
import {
  defaultOrder,
  isDefaultPlan,
  keyUnit,
  moveSet,
  moveUnit,
  placeSet,
  placeUnit,
  toggleSkipped,
  unitOrder,
  type CurriculumPlan,
} from "@/lib/curriculum-plan";
import { redateToOrder } from "@/lib/course-pacing";
import { apiError, undoToast } from "@/lib/undo-toast";
import { updateAssignment } from "@/lib/assignment-actions";
import { useUnsavedGuard } from "@/hooks/use-unsaved-guard";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SaveBar } from "@/components/teacher/save-bar";
import { shortDate } from "./use-course-data";

export interface AssignedSet {
  key: string;
  id: string;
  due: Date;
}

function Handle({
  label,
  listeners,
  attributes,
}: {
  label: string;
  listeners?: object;
  attributes?: object;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <ClickIcon icon={AnimatedGripVertical} className="size-4" aria-hidden />
    </button>
  );
}

function Sortable({
  id,
  children,
}: {
  id: string;
  children: (handle: { listeners?: object; attributes?: object }) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "relative z-10 opacity-90 shadow-lg" : undefined}
    >
      {children({ listeners, attributes })}
    </li>
  );
}

export function PlanEditor({
  classId,
  className,
  curriculumId,
  saved,
  assigned,
  onSaved,
  onDatesMoved,
  onDone,
}: {
  classId: string;
  className: string;
  curriculumId: string;
  saved: CurriculumPlan;
  /** The class's assigned sets with due dates, for re-dating after a reorder. */
  assigned: AssignedSet[];
  onSaved: (plan: CurriculumPlan | null) => void;
  onDatesMoved: () => Promise<void>;
  onDone: () => void;
}) {
  const [plan, setPlan] = useState(saved);
  const [busy, setBusy] = useState(false);
  const dirty =
    plan.order.join() !== saved.order.join() || plan.skipped.join() !== saved.skipped.join();
  const { runGuarded, guardDialog } = useUnsavedGuard(dirty);
  const units = unitOrder(plan.order);
  const course = getCurriculum(curriculumId)?.apCourse;
  const assignedKeys = useMemo(() => new Set(assigned.map((a) => a.key)), [assigned]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onUnitDrag = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const to = units.indexOf(Number(String(over.id).slice(2)));
    setPlan({ ...plan, order: placeUnit(plan.order, Number(String(active.id).slice(2)), to) });
  };
  const onSetDrag =
    (keys: string[]) =>
    ({ active, over }: DragEndEvent) => {
      if (!over || active.id === over.id) return;
      setPlan({
        ...plan,
        order: placeSet(plan.order, String(active.id), keys.indexOf(String(over.id))),
      });
    };

  /** The class's copies archived by the last save (sets that were skipped while assigned). */
  async function patchPlan(next: CurriculumPlan | null, unassign = false) {
    const res = await authenticatedFetch(`/api/courses/${encodeURIComponent(classId)}/plan`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: next, ...(unassign ? { unassignSkipped: true } : {}) }),
    });
    if (!res.ok) throw new Error(await apiError(res, "Could not save the order."));
    const body = await res.json();
    return {
      plan: (body.plan ?? null) as CurriculumPlan | null,
      archived: Array.isArray(body.archived) ? (body.archived as string[]) : [],
    };
  }

  async function moveDates(changes: { id: string; due: Date }[]) {
    const res = await authenticatedFetch(`/api/courses/${encodeURIComponent(classId)}/due-dates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        updates: changes.map((c) => ({ assignmentId: c.id, dueDate: c.due.toISOString() })),
      }),
    });
    if (!res.ok) throw new Error(await apiError(res, "Could not move the due dates."));
    await onDatesMoved();
  }

  /** Offer to hand the assigned sets' dates out again in the new order. */
  function offerRedate(order: string[]) {
    const changes = redateToOrder(order, assigned);
    if (!changes.length) return;
    const before = changes.map((c) => ({
      id: c.id,
      due: assigned.find((a) => a.id === c.id)!.due,
    }));
    toast(
      `${changes.length} assigned set${changes.length === 1 ? " is" : "s are"} now out of date order`,
      {
        description: "Swap their due dates so they follow the new order? The same dates are used.",
        duration: 15000,
        action: {
          label: "Re-date",
          onClick: async () => {
            try {
              await moveDates(changes);
              undoToast(`Re-dated ${changes.length} set${changes.length === 1 ? "" : "s"}`, () =>
                moveDates(before),
              );
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Could not move the due dates.");
            }
          },
        },
      },
    );
  }

  async function save(next: CurriculumPlan | null) {
    setBusy(true);
    const previous = saved;
    try {
      // Skipping a set the class has takes it away from the class (its copy is archived).
      const { plan: stored, archived } = await patchPlan(next, true);
      onSaved(stored);
      if (archived.length) await onDatesMoved();
      const effective = stored ?? { order: defaultOrder(curriculumId), skipped: [] };
      setPlan(effective);
      const took = archived.length
        ? ` ${archived.length} skipped set${archived.length === 1 ? " was" : "s were"} taken away from the class; students' work is kept.`
        : "";
      undoToast(
        (stored ? `Order saved for ${className}.` : `${className} follows the course as written.`) +
          took,
        async () => {
          const back = await patchPlan(isDefaultPlan(curriculumId, previous) ? null : previous);
          for (const id of archived) await updateAssignment(id, { archived: false });
          onSaved(back.plan);
          if (archived.length) await onDatesMoved();
          setPlan(back.plan ?? { order: defaultOrder(curriculumId), skipped: [] });
        },
      );
      offerRedate(effective.order);
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the order.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
        <p className="min-w-0 flex-1">
          <span className="font-medium">Editing the order for {className}.</span>{" "}
          <span className="text-muted-foreground">
            Drag units or sets by the handle (or focus a handle and use the arrow keys), or use the
            arrows. A skipped set is left out of the class: if it is already assigned, saving takes
            it away from students and keeps their work.
          </span>
        </p>
        <div className="flex gap-2">
          {!isDefaultPlan(curriculumId, saved) && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => save(null)}>
              Reset to the course as written
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => runGuarded(onDone)}>
            Done
          </Button>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onUnitDrag}>
        <SortableContext items={units.map((u) => `u-${u}`)} strategy={verticalListSortingStrategy}>
          <ol className="space-y-3">
            {units.map((unit, ui) => {
              const keys = plan.order.filter((k) => keyUnit(k) === unit);
              return (
                <Sortable key={unit} id={`u-${unit}`}>
                  {(handle) => (
                    <div className="rounded-xl border border-border bg-card">
                      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <Handle label={`Drag unit ${unit}`} {...handle} />
                          <span className="min-w-0 break-words text-sm font-semibold">
                            <span className="text-muted-foreground">{ui + 1}.</span> Unit {unit}:{" "}
                            {apUnit(unit, course)?.title}
                          </span>
                        </span>
                        <span className="flex shrink-0 gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Move unit ${unit} earlier`}
                            disabled={ui === 0}
                            onClick={() =>
                              setPlan({ ...plan, order: moveUnit(plan.order, unit, -1) })
                            }
                          >
                            <ClickIcon icon={AnimatedArrowUp} aria-hidden />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Move unit ${unit} later`}
                            disabled={ui === units.length - 1}
                            onClick={() =>
                              setPlan({ ...plan, order: moveUnit(plan.order, unit, 1) })
                            }
                          >
                            <ClickIcon icon={AnimatedArrowDown} aria-hidden />
                          </Button>
                        </span>
                      </div>
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={onSetDrag(keys)}
                      >
                        <SortableContext items={keys} strategy={verticalListSortingStrategy}>
                          <ul className="divide-y divide-border text-sm">
                            {keys.map((key, si) => {
                              const skipped = plan.skipped.includes(key);
                              const due = assigned.find((a) => a.key === key)?.due;
                              return (
                                <Sortable key={key} id={key}>
                                  {(setHandle) => (
                                    <div className="flex flex-wrap items-center justify-between gap-2 bg-card px-3 py-1.5">
                                      <span className="flex min-w-0 items-center gap-1.5">
                                        <Handle label={`Drag ${key}`} {...setHandle} />
                                        <span
                                          className={`min-w-0 break-words ${skipped ? "text-muted-foreground line-through" : ""}`}
                                        >
                                          {key} · {curriculumSet(curriculumId, key)?.title}
                                        </span>
                                        {due && (
                                          <span className="text-xs text-muted-foreground">
                                            due {shortDate(due)}
                                          </span>
                                        )}
                                      </span>
                                      <span className="flex shrink-0 items-center gap-1">
                                        <label className="mr-2 flex items-center gap-2 text-xs text-muted-foreground">
                                          <Checkbox
                                            checked={skipped}
                                            onCheckedChange={() =>
                                              setPlan(toggleSkipped(plan, key))
                                            }
                                            aria-label={`Skip ${key}`}
                                          />
                                          Skip{assignedKeys.has(key) ? " (unassigns it)" : ""}
                                        </label>
                                        <Button
                                          variant="ghost"
                                          size="icon-sm"
                                          aria-label={`Move ${key} earlier`}
                                          disabled={si === 0}
                                          onClick={() =>
                                            setPlan({
                                              ...plan,
                                              order: moveSet(plan.order, key, -1),
                                            })
                                          }
                                        >
                                          <ClickIcon icon={AnimatedArrowUp} aria-hidden />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="icon-sm"
                                          aria-label={`Move ${key} later`}
                                          disabled={si === keys.length - 1}
                                          onClick={() =>
                                            setPlan({ ...plan, order: moveSet(plan.order, key, 1) })
                                          }
                                        >
                                          <ClickIcon icon={AnimatedArrowDown} aria-hidden />
                                        </Button>
                                      </span>
                                    </div>
                                  )}
                                </Sortable>
                              );
                            })}
                          </ul>
                        </SortableContext>
                      </DndContext>
                    </div>
                  )}
                </Sortable>
              );
            })}
          </ol>
        </SortableContext>
      </DndContext>

      <SaveBar
        dirty={dirty}
        saving={busy}
        saveLabel="Save order"
        onDiscard={() => setPlan(saved)}
        onSave={() => save(plan)}
      />
      {guardDialog}
    </div>
  );
}
