"use client";

// Study > Lessons: the unit lessons (the course guides) for the course the student's class
// follows, as cards in the class's order, with the unit the student is on marked. Lessons for the
// other courses sit below, folded away; a student whose class follows no course roadmap sees them
// all.
import { CURRICULA } from "@/data/curricula";
import { guideUnits } from "@/lib/guides";
import type { StudentRoadmap } from "@/lib/student-roadmap";
import { WorkspaceHeader } from "@/components/ui/workspace";
import {
  StudentGuideGrid,
  type GuideCardUnit,
} from "@/components/dashboard/student-course-roadmap";
import { useStudentRoadmap } from "@/components/student/use-student-roadmap";

const COURSES_WITH_GUIDES = CURRICULA.filter((c) => guideUnits(c.id).length > 0);

const allUnits = (curriculumId: string): GuideCardUnit[] =>
  guideUnits(curriculumId).map((unit) => ({ unit }));

/** The class's units in its order with the student's progress, then any other unit with a lesson. */
function classUnits(roadmap: StudentRoadmap): GuideCardUnit[] {
  const planned = roadmap.units.map((u) => ({ unit: u.unit, state: u.state }));
  const seen = new Set(planned.map((u) => u.unit));
  return [...planned, ...allUnits(roadmap.curriculumId).filter((u) => !seen.has(u.unit))];
}

function CourseSection({ curriculumId, units }: { curriculumId: string; units: GuideCardUnit[] }) {
  const name = CURRICULA.find((c) => c.id === curriculumId)?.name ?? curriculumId;
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold tracking-tight">{name}</h2>
      <StudentGuideGrid curriculumId={curriculumId} units={units} />
    </section>
  );
}

export default function StudentLessonsPage() {
  const state = useStudentRoadmap();
  const classCourse = state.status === "ready" ? state.roadmap.curriculumId : null;
  const others = COURSES_WITH_GUIDES.filter((c) => c.id !== classCourse);

  return (
    <div className="space-y-8">
      <WorkspaceHeader
        title="Lessons"
        description={
          state.status === "ready"
            ? `The units of ${state.roadmap.courseName}, in your class's order. Each lesson walks through a unit's topics with worked examples and common mistakes.`
            : "Each lesson walks through a unit's topics with worked examples and common mistakes."
        }
      />

      {state.status === "loading" ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading your course…
        </p>
      ) : state.status === "error" ? (
        <p role="alert" className="text-sm text-muted-foreground">
          Your class&apos;s course could not be loaded. The lessons for every course are below.
        </p>
      ) : state.status === "ready" ? (
        <StudentGuideGrid
          curriculumId={state.roadmap.curriculumId}
          units={classUnits(state.roadmap)}
        />
      ) : null}

      {state.status !== "loading" &&
        (classCourse ? (
          others.length > 0 && (
            <details className="space-y-4 border-t border-border pt-5">
              <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                Lessons for other courses
              </summary>
              <div className="space-y-8 pt-4">
                {others.map((c) => (
                  <CourseSection key={c.id} curriculumId={c.id} units={allUnits(c.id)} />
                ))}
              </div>
            </details>
          )
        ) : (
          <div className="space-y-8">
            {others.map((c) => (
              <CourseSection key={c.id} curriculumId={c.id} units={allUnits(c.id)} />
            ))}
          </div>
        ))}
    </div>
  );
}
