"use client";

// The roadmap: one section per unit, in the class's order. Each set shows what it is, whether it is
// assigned, how the class did, and a Preview button; each unit shows what students got wrong.
import Link from "next/link";
import { Check, ChevronRight, Eye, EyeOff, Plus } from "lucide-react";
import { getCurriculum, type Curriculum } from "@/data/curricula";
import { setProfile } from "@/data/curricula/profiles";
import { AVAILABILITY_LABEL, type RoadmapSet, type RoadmapUnit } from "@/lib/curriculum-roadmap";
import type { UnitInsight } from "@/lib/course-progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { DueDateChip } from "@/components/teacher/due-date-chip";
import { AssignmentActionsMenu } from "@/components/teacher/assignment-actions-menu";
import { assignmentHref } from "@/lib/assignment-actions";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { PreviewTarget } from "./set-preview-dialog";
import { shortDate, type ClassProgress } from "./use-course-data";

const percent = (share: number) => `${Math.round(share * 100)}%`;

export function MisconceptionList({ insight }: { insight: UnitInsight }) {
  return (
    <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-4">
      <p className="text-sm font-medium">
        What students got wrong{" "}
        <span className="font-normal text-muted-foreground">
          ({insight.studentsInScope} student{insight.studentsInScope === 1 ? "" : "s"} with graded
          work)
        </span>
      </p>
      <ul className="space-y-3">
        {insight.top.map((m) => (
          <li key={m.tag} className="space-y-0.5 text-sm">
            <p className="break-words">
              <span className="font-medium">{m.label}</span>{" "}
              <span className="text-muted-foreground">
                · {m.studentCount} of {insight.studentsInScope} students ({percent(m.studentShare)})
              </span>
            </p>
            <p className="break-words text-muted-foreground">{m.suggestion}</p>
          </li>
        ))}
      </ul>
      <Link
        href="/teacher/insights"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        Full misconception report <ChevronRight className="size-3" aria-hidden />
      </Link>
    </div>
  );
}

function unitState(
  u: RoadmapUnit,
  isNext: boolean,
): { label: string; tone: "done" | "next" | "plain" } {
  const wanted = u.sets.filter((s) => !s.skipped);
  if (wanted.length === 0) return { label: "Skipped", tone: "plain" };
  if (wanted.every((s) => !s.published && !s.assigned))
    return {
      label: wanted.every((s) => s.availability === "planned") ? "Planned" : "Not published yet",
      tone: "plain",
    };
  if (u.allAssigned) return { label: "Assigned", tone: "done" };
  if (isNext) return { label: "Next up", tone: "next" };
  if (wanted.some((s) => s.assigned)) return { label: "Partly assigned", tone: "plain" };
  return { label: "Not assigned", tone: "plain" };
}

export interface SetRowActions {
  /** Assign this one set (opens the assign dialog with just it). */
  onAssignSet?: (s: RoadmapSet) => void;
  /** Skip or un-skip the set for this class (only for classes that follow the course). */
  onToggleSkip?: (s: RoadmapSet) => void;
  /** Change the class copy's due date. Throw to keep the picker open. */
  onChangeDue?: (s: RoadmapSet, due: Date | null) => Promise<void>;
  /** The class copy was archived or restored from its menu. */
  onCopyChanged?: () => void;
}

export function SetRow({
  curriculumId,
  s,
  hasClass,
  students,
  progress,
  onPreview,
  actions = {},
}: {
  curriculumId: string;
  s: RoadmapSet;
  hasClass: boolean;
  students: number;
  progress: ClassProgress | null;
  onPreview: (t: PreviewTarget) => void;
  actions?: SetRowActions;
}) {
  const profile = setProfile(curriculumId, s.set.key);
  const p = progress?.sets[s.set.key];
  // A copy still carrying the published title ("AP Physics 1 · Unit 3A · …") reads as the set's own
  // title; one the teacher renamed shows the new name.
  const published = getCurriculum(curriculumId)?.name;
  const title =
    s.copyTitle && !(published && s.copyTitle.startsWith(`${published} · Unit `))
      ? s.copyTitle
      : s.set.title;
  const canAssign = hasClass && !!s.published && !s.assigned && !s.skipped && !!actions.onAssignSet;
  return (
    <li
      className={`flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-3 text-sm ${s.skipped && !s.assigned ? "opacity-60" : ""}`}
    >
      <div className="min-w-0 flex-1 basis-64 space-y-0.5">
        <p className="flex flex-wrap items-baseline gap-x-2 break-words font-medium">
          <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
            {s.set.key}
          </span>
          {s.assignmentId ? (
            <Link
              href={assignmentHref(s.assignmentId)}
              className="hover:text-primary hover:underline"
            >
              {title}
            </Link>
          ) : (
            <span>{title}</span>
          )}
        </p>
        <p className="break-words text-muted-foreground">{s.set.description}</p>
        {profile && (
          <p className="text-xs text-muted-foreground">
            {profile.problems} problems · about {profile.minutes} min
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-start gap-1.5 sm:items-end">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {s.assigned ? (
            actions.onChangeDue ? (
              <>
                <Check className="size-4 text-green-600" aria-hidden />
                <span className="sr-only">Assigned.</span>
                <DueDateChip due={s.dueDate} onChange={(d) => actions.onChangeDue!(s, d)} />
              </>
            ) : (
              <>
                <Check className="size-4 text-green-600" aria-hidden />
                Assigned{s.dueDate ? ` · due ${shortDate(s.dueDate)}` : ""}
              </>
            )
          ) : s.skipped ? (
            "Skipped for this class"
          ) : !s.published ? (
            AVAILABILITY_LABEL[s.availability]
          ) : hasClass ? (
            s.archivedId ? (
              "Archived · assign to restore it"
            ) : (
              "Not assigned yet"
            )
          ) : (
            "Ready to assign"
          )}
        </span>
        {s.assigned && p && (
          <span className="text-xs text-muted-foreground">
            {p.submitted} of {Math.max(students, p.submitted)} submitted
            {p.averageScore !== null ? ` · average ${p.averageScore}%` : ""}
            {p.pending ? ` · ${p.pending} to review` : ""}
          </span>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          {canAssign && (
            <Button size="sm" onClick={() => actions.onAssignSet!(s)}>
              <Plus aria-hidden /> {s.archivedId ? "Restore" : "Assign"}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              onPreview({
                curriculumId,
                set: s.set,
                publishedId: s.published?.id ?? null,
                assignmentId: s.assignmentId,
              })
            }
          >
            <Eye aria-hidden /> Preview
          </Button>
          {s.assignmentId ? (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link href={assignmentHref(s.assignmentId)}>
                  Results <ChevronRight aria-hidden />
                </Link>
              </Button>
              {actions.onCopyChanged && (
                <AssignmentActionsMenu
                  id={s.assignmentId}
                  title={title}
                  hideOpen
                  onChanged={actions.onCopyChanged}
                  extraItems={
                    actions.onToggleSkip ? (
                      <DropdownMenuItem onSelect={() => actions.onToggleSkip!(s)}>
                        <EyeOff /> {s.skipped ? "Stop skipping" : "Skip in this class's plan"}
                      </DropdownMenuItem>
                    ) : null
                  }
                />
              )}
            </>
          ) : (
            actions.onToggleSkip && (
              <Button variant="ghost" size="sm" onClick={() => actions.onToggleSkip!(s)}>
                {s.skipped ? "Unskip" : "Skip"}
              </Button>
            )
          )}
        </div>
      </div>
    </li>
  );
}

export function RoadmapTab({
  curriculum,
  roadmap,
  className,
  progress,
  nextUnitNumber,
  busy,
  onAssign,
  onPreview,
  actions,
}: {
  curriculum: Curriculum;
  roadmap: RoadmapUnit[];
  /** The chosen class's name, or null when the teacher has no class. */
  className: string | null;
  progress: ClassProgress | null;
  nextUnitNumber: number | undefined;
  busy: boolean;
  onAssign: (u: RoadmapUnit) => void;
  onPreview: (t: PreviewTarget) => void;
  actions?: SetRowActions;
}) {
  const hasClass = className !== null;
  const open = String(
    nextUnitNumber ??
      roadmap.find((u) => u.sets.some((s) => s.assigned))?.unit ??
      roadmap[0]?.unit ??
      "",
  );
  return (
    <Accordion
      type="multiple"
      defaultValue={open ? [open] : []}
      // Re-open the right unit when the class changes.
      key={`${className}-${open}`}
      className="rounded-2xl border border-border bg-card"
    >
      {roadmap.map((u, i) => {
        const state = unitState(u, u.unit === nextUnitNumber);
        const wanted = u.sets.filter((s) => !s.skipped);
        const assigned = wanted.filter((s) => s.assigned).length;
        const insight = progress?.units.find((x) => x.unit === u.unit);
        return (
          <AccordionItem key={u.unit} value={String(u.unit)} className="px-4 sm:px-5">
            <AccordionTrigger className="gap-3 py-4 hover:no-underline">
              <span className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-1 text-left">
                <span className="min-w-0">
                  <span className="block break-words text-base font-semibold">
                    <span className="text-muted-foreground">{i + 1}.</span> Unit {u.unit}:{" "}
                    {u.info?.title}
                  </span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    {hasClass
                      ? `${assigned} of ${wanted.length} sets assigned`
                      : `${u.sets.length} sets`}
                    {u.sets.length !== wanted.length
                      ? ` · ${u.sets.length - wanted.length} skipped`
                      : ""}
                  </span>
                </span>
                {hasClass && (
                  <Badge
                    variant={state.tone === "next" ? "default" : "secondary"}
                    className={state.tone === "done" ? "text-green-700 dark:text-green-400" : ""}
                  >
                    {state.label}
                  </Badge>
                )}
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-4">
              {u.info?.summary && <p className="text-muted-foreground">{u.info.summary}</p>}
              <div className="flex flex-wrap items-center gap-2">
                {hasClass && u.assignable.length > 0 && (
                  <Button size="sm" onClick={() => onAssign(u)} disabled={busy}>
                    Assign {u.assignable.length === wanted.length ? "this unit" : "the rest"} (
                    {u.assignable.length} set{u.assignable.length === 1 ? "" : "s"})
                  </Button>
                )}
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/teacher/courses/${curriculum.id}/${u.unit}`}>
                    Unit guide <ChevronRight aria-hidden />
                  </Link>
                </Button>
              </div>
              <ul className="divide-y divide-border rounded-xl border border-border">
                {u.sets.map((s) => (
                  <SetRow
                    key={s.set.key}
                    curriculumId={curriculum.id}
                    s={s}
                    hasClass={hasClass}
                    students={progress?.students ?? 0}
                    progress={progress}
                    onPreview={onPreview}
                    actions={actions}
                  />
                ))}
              </ul>
              {insight && insight.top.length > 0 && <MisconceptionList insight={insight} />}
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
