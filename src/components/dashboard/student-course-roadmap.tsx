"use client";

// The course the student's class follows, as a short progress summary for the dashboard. The full
// unit list, with each unit's lessons and practice, is Study.
import Link from "next/link";
import { ClickIcon } from "@/components/ui/click-icon";
import { ArrowRightIcon as AnimatedArrowRight } from "@animateicons/react/lucide/arrow-right-icon";
import { BookOpenIcon as AnimatedBookOpen } from "@animateicons/react/lucide/book-open-icon";
import { hasUnitGuide, studentGuideHref } from "@/lib/guides";
import type { StudentRoadmap } from "@/lib/student-roadmap";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

/** The dashboard's short version: overall progress, the unit in progress and a way to Study. */
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
          <Link href="/student/study">
            All units <ClickIcon icon={AnimatedArrowRight} className="size-3.5" aria-hidden />
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
                  <ClickIcon icon={AnimatedBookOpen} aria-hidden /> Lesson
                </Link>
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
