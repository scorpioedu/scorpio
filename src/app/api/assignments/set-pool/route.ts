import { NextResponse } from "next/server";
import { withAuthorizedRequest } from "@/lib/auth-verify";
import { adminDb } from "@/lib/firebase-admin";
import { errorResponse } from "@/lib/api-errors";
import { mergeAnswerKey } from "@/lib/assignment-security";
import { assignmentAccess } from "@/lib/answer-key-access";
import {
  PlanGateError,
  assertCanCloneAssignment,
  planGateResponse,
  resolveCallerPlan,
} from "@/lib/plan-gates";

/**
 * GET /api/assignments/set-pool?sourceId= -> { questions: [{ text, type, options?, points?, apTopic?, correctAnswer }] }
 *
 * Every problem of a published course set with its correct answer, in the set's order, so a teacher
 * can read the problems and their answers and choose which ones the class gets BEFORE assigning.
 * Teachers only, and only for a set they could copy: the same checks POST /api/assignments/clone
 * makes, which hands the same key to the copy. Distractor tags and worked solutions are not sent.
 */
export const GET = withAuthorizedRequest(
  async (req, { caller, profile, requestId }) => {
    const sourceId = req.nextUrl.searchParams.get("sourceId") ?? "";
    if (!sourceId || sourceId.includes("/") || sourceId.length > 200)
      return NextResponse.json({ error: "Invalid set" }, { status: 400 });
    try {
      const source = (await adminDb.collection("assignments").doc(sourceId).get()).data();
      if (!source || !assignmentAccess(source, caller.uid, profile))
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      if (source.visibility !== "global" || typeof source.curriculumSetKey !== "string")
        return NextResponse.json({ error: "Not a course set" }, { status: 400 });
      assertCanCloneAssignment({
        plan: await resolveCallerPlan(profile.organizationId),
        source,
        callerUid: caller.uid,
      });
      const key = (await adminDb.collection("assignment_keys").doc(sourceId).get()).data();
      const questions = mergeAnswerKey(source, key).questions.map((merged) => {
        const q = merged as Record<string, unknown>;
        return {
          text: typeof q.text === "string" ? q.text : "",
          type: typeof q.type === "string" ? q.type : undefined,
          ...(Array.isArray(q.options) ? { options: q.options.map(String) } : {}),
          ...(typeof q.points === "number" ? { points: q.points } : {}),
          ...(typeof q.apTopic === "string" ? { apTopic: q.apTopic } : {}),
          correctAnswer: String(q.correctAnswer ?? ""),
        };
      });
      return NextResponse.json({ questions });
    } catch (error) {
      if (error instanceof PlanGateError) return planGateResponse(error);
      return errorResponse(error, "assignments/set-pool", requestId);
    }
  },
  { teacher: true, rateLimit: "write" },
);
