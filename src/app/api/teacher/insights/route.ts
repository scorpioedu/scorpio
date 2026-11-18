import { NextRequest, NextResponse } from "next/server";
import { withAuthorizedRequest, type AuthorizedContext } from "@/lib/auth-verify";
import { adminDb } from "@/lib/firebase-admin";
import { errorResponse } from "@/lib/api-errors";
import {
  buildInsightsReport,
  filterEvents,
  type InsightEvent,
  type InsightFilters,
} from "@/lib/insights";
import { DEFAULT_AP_COURSE, apUnit, isApCourseId } from "@/data/ap";
import { MISCONCEPTION_EVENTS } from "../../../../../functions/src/misconception-events";

// The class misconception report. Events are server-only (no Firestore rule exposes them), so
// this route is the one way to read them, and it only ever reads the caller's own events.

const MAX_EVENTS = 20000;
const MAX_NAMED_STUDENTS = 300;
const MAX_SCOPE_ASSIGNMENTS = 90;
const ID = /^[A-Za-z0-9_-]{1,128}$/;

async function handleGet(req: NextRequest, { caller, requestId }: AuthorizedContext) {
  try {
    const params = req.nextUrl.searchParams;
    const filters: InsightFilters = {};
    const courseId = params.get("courseId");
    const assignmentId = params.get("assignmentId");
    const unit = params.get("apUnit");
    if (courseId) {
      if (!ID.test(courseId)) return NextResponse.json({ error: "Invalid class" }, { status: 400 });
      filters.courseId = courseId;
    }
    if (assignmentId) {
      if (!ID.test(assignmentId))
        return NextResponse.json({ error: "Invalid assignment" }, { status: 400 });
      filters.assignmentId = assignmentId;
    }
    // Unit numbers repeat between AP courses, so a unit is read with its course (AP Physics 1 when
    // none is sent, which is what every link saved before there were other courses means).
    const course = params.get("apCourse");
    if (course) {
      if (!isApCourseId(course))
        return NextResponse.json({ error: "Invalid AP course" }, { status: 400 });
      filters.apCourse = course;
    }
    if (unit) {
      const n = Number(unit);
      if (!Number.isInteger(n) || !apUnit(n, filters.apCourse ?? DEFAULT_AP_COURSE))
        return NextResponse.json({ error: "Invalid AP unit" }, { status: 400 });
      filters.apUnit = n;
    }
    filters.includePending = params.get("pending") !== "0";

    const [eventSnap, courseSnap, assignmentSnap] = await Promise.all([
      adminDb
        .collection(MISCONCEPTION_EVENTS)
        .where("teacherId", "==", caller.uid)
        .limit(MAX_EVENTS)
        .get(),
      adminDb.collection("courses").where("teacherId", "==", caller.uid).get(),
      adminDb
        .collection("assignments")
        .where("teacherId", "==", caller.uid)
        .select("title", "courseId", "apCourse", "apUnit", "apTopics", "createdAt")
        .get(),
    ]);

    const events = eventSnap.docs.map((d) => d.data() as InsightEvent);
    const classes = courseSnap.docs.map((d) => ({
      id: d.id,
      name: typeof d.data().name === "string" ? d.data().name : "Class",
    }));
    const classNames = Object.fromEntries(classes.map((c) => [c.id, c.name]));
    const assignments = assignmentSnap.docs.map((d) => {
      const a = d.data();
      return {
        id: d.id,
        title: typeof a.title === "string" ? a.title : "Untitled assignment",
        courseId: typeof a.courseId === "string" ? a.courseId : null,
        apCourse:
          typeof a.apUnit === "number"
            ? isApCourseId(a.apCourse)
              ? a.apCourse
              : DEFAULT_AP_COURSE
            : null,
        apUnit: typeof a.apUnit === "number" ? a.apUnit : null,
        createdAt: a.createdAt?.toMillis?.() ?? 0,
      };
    });

    // Events of the chosen unit or course, whatever the class or assignment.
    const inUnit = filterEvents(events, { apUnit: filters.apUnit, apCourse: filters.apCourse });

    // Denominator: students with graded work in scope, so "8 of 24 students" is honest.
    const scopeAssignments = assignments
      .filter(
        (a) =>
          (!filters.courseId || a.courseId === filters.courseId) &&
          (!filters.assignmentId || a.id === filters.assignmentId) &&
          ((filters.apUnit === undefined && filters.apCourse === undefined) ||
            ((filters.apUnit === undefined || a.apUnit === filters.apUnit) &&
              a.apCourse === (filters.apCourse ?? DEFAULT_AP_COURSE)) ||
            inUnit.some((e) => e.assignmentId === a.id)),
      )
      .sort((x, y) => y.createdAt - x.createdAt)
      .slice(0, MAX_SCOPE_ASSIGNMENTS);
    const studentsInScope = new Set<string>();
    for (let i = 0; i < scopeAssignments.length; i += 30) {
      const ids = scopeAssignments.slice(i, i + 30).map((a) => a.id);
      const subs = await adminDb
        .collection("submissions")
        .where("assignmentId", "in", ids)
        .select("studentId", "status")
        .get();
      for (const s of subs.docs) {
        const { studentId, status } = s.data();
        if (
          typeof studentId === "string" &&
          (status === "graded" || (filters.includePending && status === "pending_review"))
        )
          studentsInScope.add(studentId);
      }
    }

    // Names only for the students the report will list.
    const filteredStudentIds = [
      ...new Set(
        filterEvents(events, { ...filters, includePending: true }).map((e) => e.studentId),
      ),
    ].slice(0, MAX_NAMED_STUDENTS);
    const names: Record<string, string> = {};
    if (filteredStudentIds.length) {
      const docs = await adminDb.getAll(
        ...filteredStudentIds.map((id) => adminDb.collection("users").doc(id)),
      );
      for (const d of docs) {
        const u = d.data();
        // Only the teacher's own students are named; anyone else stays "Student".
        if (u && u.role === "student")
          names[d.id] = String(u.displayName || u.name || "Student").slice(0, 80);
      }
    }

    const report = buildInsightsReport(events, filters, names, {
      classNames,
      studentsInScope: studentsInScope.size,
    });
    return NextResponse.json({
      filters,
      classes,
      assignments: assignments
        .sort((x, y) => y.createdAt - x.createdAt)
        .map(({ createdAt: _c, ...a }) => (void _c, a)),
      truncated: eventSnap.size >= MAX_EVENTS,
      ...report,
    });
  } catch (error) {
    return errorResponse(error, "teacher/insights", requestId);
  }
}

export const GET = withAuthorizedRequest(handleGet, { teacher: true, rateLimit: "insights" });
