"use client";

// What a teacher can do to one set of a course, for one class: assign it, change its due date, skip
// it. The List (roadmap rows) and the Calendar (a set's popover, a drop on a day) both call these, so
// a change behaves the same wherever it is made. Every change shows an Undo message.
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { DEFAULT_SET_SIZE, getCurriculum, type Curriculum } from "@/data/curricula";
import {
  cloneSetToClass,
  planAssignments,
  restoresArchived,
  runAssignments,
  type AssignableSet,
  type PlannedAssignment,
} from "@/lib/assign-sets";
import type { ClassAssignment, RoadmapSet, RoadmapUnit } from "@/lib/curriculum-roadmap";
import { isDefaultPlan, toggleSkipped, type CurriculumPlan } from "@/lib/curriculum-plan";
import type { SchoolDayTest } from "@/lib/school-calendar";
import { loadClassAssignments } from "@/lib/curriculum-client";
import { dueParam, updateAssignment } from "@/lib/assignment-actions";
import { apiError, undoToast } from "@/lib/undo-toast";
import { PROBLEMS_PER_SET, parseProblemsPerSet } from "@/lib/assignment-defaults";
import { shortDate, type CourseData } from "./use-course-data";

/** What the assign dialog is open for. */
export interface Assigning {
  label: string;
  sets: AssignableSet[];
  /** Unit to re-plan from on a fresh read; absent for a single set. */
  unit?: RoadmapUnit;
}

export interface SetRowActions {
  /** Assign this one set (opens the assign dialog with just it). */
  onAssignSet?: (s: RoadmapSet) => void;
  /** Assign this one set at once, due on the given day (dropped on a day of the Calendar). */
  onAssignOn?: (s: RoadmapSet, due: Date) => void;
  /** Skip or un-skip the set for this class (only for classes that follow the course). */
  onToggleSkip?: (s: RoadmapSet) => void;
  /** Change the class copy's due date. Throw to keep the picker open. */
  onChangeDue?: (s: RoadmapSet, due: Date | null) => Promise<void>;
  /** The class copy was archived or restored from its menu. */
  onCopyChanged?: () => void;
}

/**
 * The title a teacher reads for a set. A copy still carrying the published title
 * ("AP Physics 1 · Unit 3A · …") reads as the set's own title; one the teacher renamed shows the new name.
 */
export function setDisplayTitle(curriculumId: string, s: RoadmapSet): string {
  const published = getCurriculum(curriculumId)?.name;
  return s.copyTitle && !(published && s.copyTitle.startsWith(`${published} · Unit `))
    ? s.copyTitle
    : s.set.title;
}

const message = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export function useSetActions({
  data,
  curriculum,
  follows,
  plan,
  startDate,
  spacing,
  isSchoolDay,
  openAssign,
  closeAssign,
}: {
  data: CourseData;
  curriculum: Curriculum;
  /** The class follows this course, so it has a plan that can be changed. */
  follows: boolean;
  plan: CurriculumPlan | null;
  /** First due date for a unit assigned from the dialog. */
  startDate: Date | null;
  spacing: number;
  isSchoolDay: SchoolDayTest;
  openAssign: (target: Assigning) => void;
  closeAssign: () => void;
}) {
  const { user, selected, published } = data;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const curriculumId = curriculum.id;

  /** The class's copies that came from this course (keys like "4A" repeat across courses). */
  const ofCourse = useCallback(
    (a: ClassAssignment) =>
      (a.curriculumId === undefined || a.curriculumId === curriculumId) &&
      typeof a.curriculumSetKey === "string",
    [curriculumId],
  );

  const toAssignable = useCallback(
    (sets: RoadmapSet[]): AssignableSet[] =>
      sets.map((s) => ({
        sourceId: s.published!.id,
        key: s.set.key,
        title: (published ?? []).find((p) => p.id === s.published!.id)?.title ?? s.set.title,
        poolSize: s.published!.questionCount,
      })),
    [published],
  );

  /** Assign what the dialog confirmed (a unit, the rest of one, or a single set). */
  async function assign(target: Assigning, planned: PlannedAssignment[]) {
    if (!selected || !user || !startDate) return;
    setBusy("assign");
    setError("");
    // Fresh read, so a set assigned elsewhere (or in another tab) is not copied twice.
    let todo = planned;
    let archived = new Map<string, { id: string; questionCount?: number }>();
    try {
      const fresh = (await loadClassAssignments(user.uid, selected.id)).filter(ofCourse);
      const have = new Set(fresh.filter((a) => !a.archived).map((a) => String(a.curriculumSetKey)));
      archived = new Map(
        fresh
          .filter((a) => a.archived && a.id)
          .map((a) => [String(a.curriculumSetKey), { id: a.id!, questionCount: a.questionCount }]),
      );
      if (planned.some((p) => have.has(p.key)))
        todo = planAssignments(target.sets, have, startDate, spacing, isSchoolDay).map(
          // The re-plan keeps the number of problems the teacher chose.
          (p): PlannedAssignment =>
            planned[0]?.count === undefined ? p : { ...p, count: planned[0].count },
        );
    } catch {
      /* keep the plan the teacher confirmed */
    }
    try {
      // An archived copy of a set is restored (with its students' work) instead of copied again,
      // unless the teacher chose another number of problems than it has (see restoresArchived).
      await runAssignments(todo, (item) => {
        const copy = archived.get(item.key);
        return copy && restoresArchived(item, copy)
          ? updateAssignment(copy.id, { archived: false, dueDate: dueParam(item.due) })
          : cloneSetToClass(authenticatedFetch, selected.id, item);
      });
      void rememberCount(todo[0]?.count);
      toast.success(
        todo.length ? `${target.label} assigned to ${selected.name}.` : "Nothing new to assign.",
      );
      closeAssign();
    } catch (e) {
      closeAssign();
      setError(
        `${message(e, "Could not assign.")} Press assign again to continue; sets already assigned are kept.`,
      );
    } finally {
      await data.refreshClass();
      setBusy(null);
    }
  }

  /**
   * Remember the number of problems chosen in the dialog as the class's own, so the dialog opens on it
   * next time. Nothing else uses it, and a failure only means the dialog opens on the usual five.
   */
  async function rememberCount(count: number | undefined) {
    if (!selected || count === undefined) return;
    if (count === (parseProblemsPerSet(selected.assignmentDefaults) ?? DEFAULT_SET_SIZE)) return;
    try {
      const res = await authenticatedFetch(
        `/api/courses/${encodeURIComponent(selected.id)}/assignment-defaults`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [PROBLEMS_PER_SET]: count }),
        },
      );
      if (!res.ok) return;
      data.patchClass(selected.id, { assignmentDefaults: (await res.json()).assignmentDefaults });
    } catch {
      /* not worth a message */
    }
  }

  /**
   * Assign one set straight away with the given due date (a planned set dropped on a day of the
   * Calendar). The Undo archives the copy again, which hides it from students and makes the set
   * planned again.
   */
  async function assignNow(s: RoadmapSet, due: Date) {
    if (!selected || !user || !s.published) return;
    const key = s.set.key;
    setBusy("assign");
    try {
      const fresh = (await loadClassAssignments(user.uid, selected.id)).filter(
        (a) => ofCourse(a) && a.curriculumSetKey === key,
      );
      if (fresh.some((a) => !a.archived)) {
        toast.info(`${key} is already assigned to ${selected.name}.`);
        return;
      }
      const archivedId = fresh.find((a) => a.archived && a.id)?.id;
      let id: string;
      if (archivedId) {
        await updateAssignment(archivedId, { archived: false, dueDate: dueParam(due) });
        id = archivedId;
      } else {
        id = await cloneSetToClass(authenticatedFetch, selected.id, {
          ...toAssignable([s])[0],
          due,
        });
      }
      await data.refreshClass();
      undoToast(
        `${key} assigned to ${selected.name}, due ${shortDate(due)}`,
        async () => {
          await updateAssignment(id, { archived: true });
          await data.refreshClass();
        },
        `${key} is not assigned any more`,
      );
    } catch (e) {
      toast.error(message(e, "Could not assign this set."));
      await data.refreshClass();
    } finally {
      setBusy(null);
    }
  }

  async function savePlan(next: CurriculumPlan | null) {
    if (!selected) return null;
    const res = await authenticatedFetch(`/api/courses/${encodeURIComponent(selected.id)}/plan`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: next }),
    });
    if (!res.ok) throw new Error(await apiError(res, "Could not save the change."));
    const stored = ((await res.json()).plan ?? null) as CurriculumPlan | null;
    data.patchClass(selected.id, { curriculumPlan: stored });
    return stored;
  }

  /** A plan that changes nothing is stored as "no plan". */
  const toStore = (p: CurriculumPlan) => (isDefaultPlan(curriculumId, p) ? null : p);

  /** Save a change to the class's plan and offer to undo it. */
  async function changePlan(next: CurriculumPlan, done: string) {
    if (!follows || !plan) return;
    const previous = plan;
    try {
      await savePlan(toStore(next));
      undoToast(done, () => savePlan(toStore(previous)));
    } catch (e) {
      toast.error(message(e, "Could not save the change."));
    }
  }

  const toggleSkip = (s: RoadmapSet) =>
    plan && selected
      ? changePlan(
          toggleSkipped(plan, s.set.key),
          s.skipped
            ? `${s.set.key} is back in the plan`
            : `${s.set.key} skipped for ${selected.name}`,
        )
      : undefined;

  async function changeDue(s: RoadmapSet, due: Date | null) {
    if (!s.assignmentId) return;
    const id = s.assignmentId;
    const before = s.dueDate;
    try {
      await updateAssignment(id, { dueDate: dueParam(due) });
      await data.refreshClass();
      undoToast(
        due ? `${s.set.key} now due ${shortDate(due)}` : `${s.set.key} has no due date`,
        async () => {
          await updateAssignment(id, { dueDate: dueParam(before) });
          await data.refreshClass();
        },
      );
    } catch (e) {
      toast.error(message(e, "Could not change the due date."));
      throw e;
    }
  }

  const canPlan = follows && !!plan;
  const rowActions: SetRowActions | undefined = selected
    ? {
        onAssignSet: (s) =>
          openAssign({ label: `${s.set.key}: ${s.set.title}`, sets: toAssignable([s]) }),
        onAssignOn: (s, due) => void assignNow(s, due),
        onToggleSkip: canPlan ? (s) => void toggleSkip(s) : undefined,
        onChangeDue: changeDue,
        onCopyChanged: () => void data.refreshClass(),
      }
    : undefined;

  return {
    busy,
    error,
    setError,
    toAssignable,
    assign,
    savePlan,
    rowActions,
  };
}

export type SetActions = ReturnType<typeof useSetActions>;
