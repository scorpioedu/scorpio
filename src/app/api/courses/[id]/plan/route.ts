import { NextResponse } from "next/server";
import { withAuthorizedRequest } from "@/lib/auth-verify";
import { adminDb, adminFieldWithValue } from "@/lib/firebase-admin";
import { errorResponse } from "@/lib/api-errors";
import { parseJsonBody } from "@/lib/api-schema";
import { coursePlanBody } from "@/lib/schemas/api-bodies";
import { isDefaultPlan, parsePlan } from "@/lib/curriculum-plan";
import { parseDaysOff } from "@/lib/school-calendar";

/**
 * PATCH /api/courses/{id}/plan
 *   { plan?: { order, skipped } | null, daysOff?: DayOff[] | null, unassignSkipped?: boolean }
 *   -> { id, plan, daysOff, archived? }   (only the fields that were sent)
 * The class's owner changes how the class follows its course (order of units and sets, skipped sets)
 * and the class's school calendar. `null` clears a field, which means "the course as written" and
 * "the default US calendar". A plan needs the class to follow a course.
 * Skipping a set means the class does not do it. With `unassignSkipped` the class's own copies of the
 * skipped sets are archived in the same write (students stop seeing them, their work is kept, and
 * assigning the set again restores the copy); `archived` lists the ids, so the change can be undone.
 * Without it no assignment is touched.
 * Clients cannot write `curriculumPlan` or `daysOff` themselves (firestore.rules).
 */
export const PATCH = withAuthorizedRequest(
  async (req, { caller, requestId }) => {
    const parsed = await parseJsonBody(req, coursePlanBody, { message: "Invalid request" });
    if (!parsed.ok) return parsed.response;
    const { plan, daysOff, unassignSkipped } = parsed.data;
    if (plan === undefined && daysOff === undefined)
      return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
    // /api/courses/{id}/plan
    const id = decodeURIComponent(req.nextUrl.pathname.split("/").filter(Boolean).at(-2) ?? "");
    if (!id || id.includes("/"))
      return NextResponse.json({ error: "Invalid class" }, { status: 400 });
    try {
      const ref = adminDb.collection("courses").doc(id);
      const course = (await ref.get()).data();
      if (!course || course.teacherId !== caller.uid)
        return NextResponse.json({ error: "Access denied" }, { status: 403 });

      const update: Record<string, unknown> = {};
      const out: Record<string, unknown> = { id };
      let skipped: string[] = [];
      if (plan !== undefined) {
        if (plan === null) {
          update.curriculumPlan = adminFieldWithValue.delete();
          out.plan = null;
        } else {
          if (typeof course.curriculumId !== "string")
            return NextResponse.json(
              { error: "This class does not follow a course" },
              { status: 400 },
            );
          const checked = parsePlan(course.curriculumId, plan);
          if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
          // A plan that changes nothing is not stored, so the class keeps tracking the course.
          const same = isDefaultPlan(course.curriculumId, checked.plan);
          update.curriculumPlan = same ? adminFieldWithValue.delete() : checked.plan;
          out.plan = same ? null : checked.plan;
          skipped = checked.plan.skipped;
        }
      }
      if (daysOff !== undefined) {
        if (daysOff === null) {
          update.daysOff = adminFieldWithValue.delete();
          out.daysOff = null;
        } else {
          const checked = parseDaysOff(daysOff);
          if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
          update.daysOff = checked.daysOff;
          out.daysOff = checked.daysOff;
        }
      }
      if (!(unassignSkipped && plan !== undefined)) {
        await ref.update(update);
        return NextResponse.json(out);
      }
      // The plan and the copies it takes away change together.
      const batch = adminDb.batch();
      batch.update(ref, update);
      const archived: string[] = [];
      if (skipped.length) {
        const keys = new Set(skipped);
        const copies = await adminDb
          .collection("assignments")
          .where("courseId", "==", id)
          .where("teacherId", "==", caller.uid)
          .get();
        const now = new Date();
        for (const doc of copies.docs) {
          const a = doc.data();
          if (
            a.archivedAt == null &&
            typeof a.curriculumSetKey === "string" &&
            keys.has(a.curriculumSetKey) &&
            // Set keys repeat between courses: only copies of this course's sets.
            (a.curriculumId === undefined || a.curriculumId === course.curriculumId)
          ) {
            batch.update(doc.ref, { archivedAt: now, updatedAt: now });
            archived.push(doc.id);
          }
        }
      }
      out.archived = archived;
      await batch.commit();
      return NextResponse.json(out);
    } catch (error) {
      return errorResponse(error, "courses/plan", requestId);
    }
  },
  { teacher: true, rateLimit: "write" },
);
