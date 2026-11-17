import { NextRequest, NextResponse } from "next/server";
import { withAuthorizedRequest, type AuthorizedContext } from "@/lib/auth-verify";
import { adminDb } from "@/lib/firebase-admin";
import { errorResponse } from "@/lib/api-errors";
import { getCurriculum } from "@/data/curricula";
import { normalisePlan } from "@/lib/curriculum-plan";
import {
  buildSetProgress,
  buildUnitInsights,
  studentsByUnit,
  type ProgressSubmission,
} from "@/lib/course-progress";
import type { InsightEvent } from "@/lib/insights";
import { MISCONCEPTION_EVENTS } from "../../../../../../functions/src/misconception-events";

// Class progress on a course roadmap (/teacher/courses). Like /api/teacher/insights, this is the only
// way to read misconception events, and it reads only the caller's own class.

const MAX_EVENTS = 20000;
const MAX_ASSIGNMENTS = 300;
const ID = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * GET /api/teacher/courses/progress?courseId=&curriculumId= ->
 *   { courseId, curriculumId, students, sets: { [setKey]: SetProgress }, units: UnitInsight[], truncated }
 * `students` is the class roster size. `sets` has one entry per course set assigned to the class.
 * `units` lists up to three misconceptions per unit with a re-teach suggestion. The class does not
 * have to follow a course: sets assigned from one still count. `curriculumId` picks the course to
 * report on; without it, it is the course the class follows, else the one its sets came from.
 */
async function handleGet(req: NextRequest, { caller, requestId }: AuthorizedContext) {
  const courseId = req.nextUrl.searchParams.get("courseId") ?? "";
  if (!ID.test(courseId)) return NextResponse.json({ error: "Invalid class" }, { status: 400 });
  try {
    const course = (await adminDb.collection("courses").doc(courseId).get()).data();
    if (!course || course.teacherId !== caller.uid)
      return NextResponse.json({ error: "Access denied" }, { status: 403 });

    const [assignmentSnap, rosterSnap, eventSnap] = await Promise.all([
      adminDb
        .collection("assignments")
        .where("teacherId", "==", caller.uid)
        .where("courseId", "==", courseId)
        .limit(MAX_ASSIGNMENTS)
        .get(),
      adminDb.collection("users").where("courseId", "==", courseId).get(),
      adminDb
        .collection(MISCONCEPTION_EVENTS)
        .where("teacherId", "==", caller.uid)
        .limit(MAX_EVENTS)
        .get(),
    ]);

    const assignments = assignmentSnap.docs
      .map((d) => ({
        id: d.id,
        curriculumId: d.data().curriculumId,
        curriculumSetKey: d.data().curriculumSetKey,
      }))
      .filter((a) => typeof a.curriculumSetKey === "string");
    const asked = req.nextUrl.searchParams.get("curriculumId");
    if (asked !== null && !getCurriculum(asked))
      return NextResponse.json({ error: "Unknown course" }, { status: 400 });
    const curriculumId =
      asked ??
      (typeof course.curriculumId === "string"
        ? course.curriculumId
        : (assignments.find((a) => typeof a.curriculumId === "string")?.curriculumId ?? null));
    const courseSets = assignments.filter((a) => a.curriculumId === curriculumId);

    const submissions: ProgressSubmission[] = [];
    for (let i = 0; i < courseSets.length; i += 30) {
      const ids = courseSets.slice(i, i + 30).map((a) => a.id);
      const snap = await adminDb.collection("submissions").where("assignmentId", "in", ids).get();
      for (const s of snap.docs) {
        const d = s.data();
        if (typeof d.studentId === "string")
          submissions.push({
            assignmentId: d.assignmentId,
            studentId: d.studentId,
            status: d.status,
            graded: d.graded,
            score: d.score,
          });
      }
    }

    const setIds = new Set(courseSets.map((a) => a.id));
    const events = eventSnap.docs
      .map((d) => d.data() as InsightEvent)
      .filter((e) => e.courseId === courseId && setIds.has(e.assignmentId));
    const students = rosterSnap.docs.filter((d) => d.data().role === "student").length;

    return NextResponse.json({
      courseId,
      curriculumId,
      students,
      sets: buildSetProgress(courseSets, submissions),
      units:
        curriculumId && getCurriculum(curriculumId)
          ? buildUnitInsights(curriculumId, events, {
              studentsByUnit: studentsByUnit(courseSets, submissions),
              assignedKeys: courseSets.map((a) => a.curriculumSetKey as string),
              skippedKeys:
                course.curriculumId === curriculumId
                  ? normalisePlan(curriculumId, course.curriculumPlan).skipped
                  : [],
            })
          : [],
      truncated: eventSnap.size >= MAX_EVENTS,
    });
  } catch (error) {
    return errorResponse(error, "teacher/courses/progress", requestId);
  }
}

export const GET = withAuthorizedRequest(handleGet, { teacher: true, rateLimit: "insights" });
