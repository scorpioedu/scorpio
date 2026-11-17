"use client";

// The Status board: every set of the class's course in one of four columns, by where it stands
// (see boardColumns in src/lib/course-board.ts for the rules). Above the columns: the class's
// numbers, a unit filter and Show done.
import { useMemo, useState } from "react";
import type { Curriculum } from "@/data/curricula";
import {
  boardColumns,
  boardStats,
  filterBoard,
  plannedDates,
  type BoardCard as Card,
} from "@/lib/course-board";
import type { Pacing } from "@/lib/course-pacing";
import type { RoadmapUnit } from "@/lib/curriculum-roadmap";
import { Button } from "@/components/ui/button";
import type { PreviewTarget } from "../set-preview-dialog";
import type { ClassProgress } from "../use-course-data";
import type { SetRowActions } from "../use-set-actions";
import { BoardCard, ParkedBoardCard, type BoardCardContext } from "./board-card";
import { BoardColumn } from "./board-column";
import { BoardStats } from "./board-stats";
import { UnitFilter } from "./unit-filter";

/** Cards shown before "+n more" in Up next and Done. */
const UP_NEXT_SHOWN = 6;
const DONE_SHOWN = 4;

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

export function CourseBoard({
  curriculum,
  roadmap,
  progress,
  pacing,
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
  /** The unit the board is narrowed to (?unit=), or null. */
  unit: number | null;
  onUnit: (unit: number | null) => void;
  /** Show every finished set instead of the latest few. */
  showDone: boolean;
  onShowDone: (show: boolean) => void;
  busy: boolean;
  onPreview: (t: PreviewTarget) => void;
  actions: SetRowActions;
}) {
  const [allUpNext, setAllUpNext] = useState(false);
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

  const ctx: BoardCardContext = {
    curriculumId: curriculum.id,
    unitTitle: (n) => units.find((u) => u.unit === n)?.title ?? "",
    students,
    planned,
    busy,
    onPreview,
    actions,
  };

  // One unit is short enough to show whole.
  const upNext =
    allUpNext || shownUnit !== null ? columns.upNext : columns.upNext.slice(0, UP_NEXT_SHOWN);
  const done = showDone ? columns.done : columns.done.slice(0, DONE_SHOWN);
  const cards = (column: "upNext" | "assigned" | "needsYou" | "done", list: Card[]) =>
    list.map((card) => (
      <li key={card.key}>
        <BoardCard column={column} card={card} ctx={ctx} />
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
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <BoardColumn
          id="upNext"
          count={columns.upNext.length}
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
          {cards("upNext", upNext)}
        </BoardColumn>
        <BoardColumn
          id="assigned"
          count={columns.assigned.length}
          empty="Nothing is out with students. Press Assign on a set in Up next to hand it out."
        >
          {cards("assigned", columns.assigned)}
        </BoardColumn>
        <BoardColumn
          id="needsYou"
          count={columns.needsYou.length}
          empty="Written answers and changed answer keys land here."
        >
          {cards("needsYou", columns.needsYou)}
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
          {cards("done", done)}
        </BoardColumn>
      </div>
    </div>
  );
}
