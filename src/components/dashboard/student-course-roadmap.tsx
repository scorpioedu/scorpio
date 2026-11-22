"use client";

// The course the student's class follows, two ways: the unit guides as cards (Study > Guides) and
// a short progress summary for the dashboard.
import Link from "next/link";
import { ArrowRight, BookOpen, Check } from "lucide-react";
import { hasUnitGuide, studentGuideHref } from "@/lib/guides";
import { apUnit } from "@/data/ap";
import { getCurriculum } from "@/data/curricula";
import type { StudentRoadmap, StudentUnit } from "@/lib/student-roadmap";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

/** A unit shown as a guide card; `state` is the student's progress when it is their class's course. */
export interface GuideCardUnit {
  unit: number;
  state?: StudentUnit["state"];
}

/**
 * The unit guides of a course as cards, for Study > Lessons: each card is the unit's title and
 * summary and opens its guide. The unit the student is on is marked; a unit without a guide yet is
 * shown but does not link.
 */
export function StudentGuideGrid({
  curriculumId,
  units,
}: {
  curriculumId: string;
  units: GuideCardUnit[];
}) {
  const course = getCurriculum(curriculumId)?.apCourse;
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {units.map(({ unit, state }) => {
        const info = apUnit(unit, course);
        const title = info?.title ?? `Unit ${unit}`;
        const hasGuide = hasUnitGuide(curriculumId, unit);
        const current = state === "current";
        const body = (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Unit {unit}
              </span>
              {current ? (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                  You&apos;re here
                </span>
              ) : state === "done" ? (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Check className="size-3.5 text-green-600" aria-hidden /> Done
                </span>
              ) : null}
            </div>
            <h3 className="mt-2 break-words text-base font-semibold tracking-tight text-foreground">
              {title}
            </h3>
            {info?.summary && (
              <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                {info.summary}
              </p>
            )}
            <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-xs text-muted-foreground">
              <span>
                {info ? `${info.topics.length} ${info.topics.length === 1 ? "topic" : "topics"}` : ""}
              </span>
              {hasGuide ? (
                <span className="inline-flex items-center gap-1 font-medium text-foreground transition-colors group-hover:text-primary">
                  <BookOpen className="size-3.5" aria-hidden /> Read lesson
                  <ArrowRight
                    className="size-3.5 transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </span>
              ) : (
                <span>Lesson coming soon</span>
              )}
            </div>
          </>
        );
        const box = `flex h-full flex-col rounded-xl border bg-card p-5 ${
          current ? "border-primary/60 ring-1 ring-primary/20" : "border-border/80"
        }`;
        return (
          <li key={unit}>
            {hasGuide ? (
              <Link
                href={studentGuideHref(curriculumId, unit)}
                aria-current={current ? "step" : undefined}
                className={`group ${box} transition-all hover:border-primary/50 hover:bg-muted/20 focus-visible:outline-2 focus-visible:outline-ring`}
              >
                {body}
              </Link>
            ) : (
              <div className={`${box} opacity-60`}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** The dashboard's short version: overall progress, the unit in progress and a way to the guides. */
export function StudentRoadmapSummary({ roadmap }: { roadmap: StudentRoadmap }) {
  const current = roadmap.units.find((u) => u.state === "current");
  return (
    <Card className="h-full gap-3 py-4 shadow-none">
      <CardHeader className="flex items-start justify-between gap-3 px-5">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Course progress
          </p>
          <h2 className="mt-1 break-words text-sm font-semibold tracking-tight">
            {roadmap.courseName}
          </h2>
        </div>
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 text-xs text-muted-foreground hover:text-foreground"
        >
          <Link href="/student/lessons">
            All units <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-2.5 px-5">
        <div className="space-y-1.5">
          <Progress
            value={roadmap.planned ? (roadmap.done / roadmap.planned) * 100 : 0}
            aria-label={`${roadmap.done} of ${roadmap.planned} sets handed in`}
            className="h-1.5"
          />
          <p className="text-xs text-muted-foreground">
            {roadmap.done} of {roadmap.planned} sets handed in
          </p>
        </div>
        {current && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border/80 bg-muted/30 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Current unit
              </p>
              <p className="break-words text-sm font-medium">{current.label}</p>
            </div>
            {hasUnitGuide(roadmap.curriculumId, current.unit) && (
              <Button asChild size="sm" variant="outline" className="h-8 shrink-0 text-xs">
                <Link href={studentGuideHref(roadmap.curriculumId, current.unit)}>
                  <BookOpen aria-hidden /> Lesson
                </Link>
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
