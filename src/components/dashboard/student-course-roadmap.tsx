"use client";

// The student's path through the course their class follows: units in the class's order, how many
// sets they have handed in, and what to do next.
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import type { StudentRoadmap, StudentUnit } from "@/lib/student-roadmap";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

const STATE_TEXT: Record<StudentUnit["state"], string> = {
  done: "Done",
  current: "In progress",
  upcoming: "Assigned",
  "not-assigned": "Not assigned yet",
};

const due = (d: Date | null) =>
  d
    ? `due ${d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`
    : "no due date";

export function StudentCourseRoadmap({ roadmap }: { roadmap: StudentRoadmap }) {
  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-none">
      <CardHeader className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 bg-muted/40 px-5 py-3.5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">
            {roadmap.courseName} roadmap
          </h2>
          <p className="text-xs text-muted-foreground">
            {roadmap.done} of {roadmap.planned} sets handed in
          </p>
        </div>
        {roadmap.upNext && (
          <Button asChild size="sm">
            <Link href={`/student/assignment-view?id=${encodeURIComponent(roadmap.upNext.id)}`}>
              Continue <ArrowRight aria-hidden />
            </Link>
          </Button>
        )}
      </CardHeader>
      <CardContent className="p-0">
        <ol className="divide-y divide-border">
          {roadmap.units.map((u) => (
            <li
              key={u.unit}
              aria-current={u.state === "current" ? "step" : undefined}
              className={`space-y-2 px-5 py-3.5 ${u.state === "not-assigned" ? "opacity-60" : ""}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <p className="min-w-0 break-words text-sm font-medium">{u.label}</p>
                <p className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                  {u.state === "done" && <Check className="size-3.5 text-green-600" aria-hidden />}
                  {STATE_TEXT[u.state]}
                  {u.state !== "not-assigned" && ` · ${u.done} of ${u.planned} sets`}
                  {u.averageScore !== null && ` · ${u.averageScore}%`}
                </p>
              </div>
              {u.state !== "not-assigned" && (
                <Progress
                  value={u.planned ? (u.done / u.planned) * 100 : 0}
                  aria-label={`${u.label}: ${u.done} of ${u.planned} sets handed in`}
                  className="h-1.5"
                />
              )}
              {u.state === "current" && u.next && (
                <p className="text-xs text-muted-foreground">
                  Next:{" "}
                  <Link
                    href={`/student/assignment-view?id=${encodeURIComponent(u.next.id)}`}
                    className="font-medium text-foreground underline-offset-2 hover:underline"
                  >
                    {u.next.title}
                  </Link>{" "}
                  ({due(u.next.dueDate)})
                </p>
              )}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
