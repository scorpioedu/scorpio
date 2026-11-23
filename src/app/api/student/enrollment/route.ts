import { NextResponse } from "next/server";
import { authenticateRequest, withAuthorizedRequest } from "@/lib/auth-verify";
import { findClassByCode } from "@/lib/class-enrollment";
import { adminDb } from "@/lib/firebase-admin";
import { parseJsonBody } from "@/lib/api-schema";
import { enrollmentBody } from "@/lib/schemas/api-bodies";

export const POST = withAuthorizedRequest(
  async (req) => {
    const caller = (await authenticateRequest(req))!;
    const parsed = await parseJsonBody(req, enrollmentBody);
    if (!parsed.ok) return parsed.response;
    const { code, action } = parsed.data;
    const userRef = adminDb.collection("users").doc(caller.uid);
    const studentRef = adminDb.collection("students").doc(caller.uid);

    const result = await adminDb.runTransaction(async (transaction) => {
      const profile = (await transaction.get(userRef)).data();
      if (profile?.role !== "student") return { error: "Student account required", status: 403 };

      let enrollment: {
        teacherId: string | null;
        courseId: string | null;
        organizationId: string | null;
      } = {
        teacherId: null,
        courseId: null,
        organizationId: null,
      };
      if (action !== "leave") {
        const course = await findClassByCode(code, transaction);
        if (!course)
          return {
            error: "This class code is invalid or the class is no longer available.",
            status: 400,
          };
        // A plain join never moves a student out of a class; "switch" does, in this same transaction,
        // so a failed join can't leave them in no class at all.
        if (action !== "switch" && profile.courseId && profile.courseId !== course.courseId) {
          return {
            error:
              "You already belong to another class. Leave it first, or switch classes from the invite page.",
            status: 409,
          };
        }
        const { teacherId, courseId, organizationId } = course;
        enrollment = { teacherId, courseId, organizationId };
      }
      // joinedClassAt feeds the admin activation funnel; rejoining the same class keeps the first date.
      const joinedClassAt =
        action === "leave" ? null : profile.courseId === enrollment.courseId ? undefined : new Date();
      const update = joinedClassAt === undefined ? enrollment : { ...enrollment, joinedClassAt };
      transaction.set(userRef, update, { merge: true });
      transaction.set(studentRef, update, { merge: true });
      return null;
    });

    return result
      ? NextResponse.json({ error: result.error }, { status: result.status })
      : NextResponse.json({ success: true });
  },
  { rateLimit: "write" },
);
