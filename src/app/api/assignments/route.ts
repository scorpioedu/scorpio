import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, withAuthorizedRequest } from "@/lib/auth-verify";
import { adminDb } from "@/lib/firebase-admin";
import { splitAssignmentQuestions, mergeAnswerKey } from "@/lib/assignment-security";
import { parseJsonBody } from "@/lib/api-schema";
import { createAssignmentBody } from "@/lib/schemas/api-bodies";
import { errorResponse } from "@/lib/api-errors";
import { assertValidAnswerKeys, assignmentAccess, stripAnswerKey } from "@/lib/answer-key-access";
import { assertCanCreateAssignment, resolveCallerPlan } from "@/lib/plan-gates";
import { apCourseOf, isApTopicId, normaliseApTags } from "@/data/ap";
import { hintsAllowedFor } from "@/lib/student-ai";

export const POST = withAuthorizedRequest(
  async (req, { requestId }) => {
    const caller = (await authenticateRequest(req))!;
    const parsed = await parseJsonBody(req, createAssignmentBody, {
      message: "Invalid assignment",
    });
    if (!parsed.ok) return parsed.response;
    const data = parsed.data;
    const profile = (await adminDb.collection("users").doc(caller.uid).get()).data()!;
    let course: FirebaseFirestore.DocumentData | undefined;
    if (data.courseId) {
      course = (await adminDb.collection("courses").doc(data.courseId).get()).data();
      if (course?.teacherId !== caller.uid)
        return NextResponse.json({ error: "Invalid class" }, { status: 403 });
    }
    // Hints need Raise on for the class; an assignment in no class, or in one with Raise off, has none.
    data.allowAIHelp = hintsAllowedFor(course, data.allowAIHelp);
    const {
      rubric,
      dueDate,
      questions: rawQuestions,
      apCourse,
      apUnit,
      apTopics,
      ...fields
    } = data;
    // A question's own AP topic is kept only when it is a real topic id.
    const questions = rawQuestions.map(({ apTopic, ...q }) =>
      isApTopicId(apTopic, apCourseOf(apCourse)) ? { ...q, apTopic } : q,
    );
    let split: ReturnType<typeof splitAssignmentQuestions>;
    try {
      assertCanCreateAssignment({
        plan: resolveCallerPlan(profile.organizationId),
        visibility: data.visibility,
      });
      assertValidAnswerKeys(questions);
      split = splitAssignmentQuestions(questions);
    } catch (error) {
      return errorResponse(error, "assignments", requestId);
    }
    const { publicQuestions, answers, distractors } = split;
    const ref = adminDb.collection("assignments").doc();
    const batch = adminDb.batch();
    batch.set(ref, {
      ...fields,
      ...normaliseApTags({ apCourse, apUnit, apTopics }),
      teacherId: caller.uid,
      organizationId: profile.organizationId || null,
      questions: publicQuestions,
      rubric: null,
      answerKeySeparated: true,
      dueDate: dueDate ? new Date(dueDate) : null,
      createdAt: new Date(),
    });
    batch.set(adminDb.collection("assignment_keys").doc(ref.id), {
      answers,
      ...(Object.keys(distractors).length ? { distractors } : {}),
      rubric: rubric || "",
      teacherId: caller.uid,
    });
    await batch.commit();
    return NextResponse.json({ id: ref.id });
  },
  { teacher: true, rateLimit: "write" },
);

export async function GET(req: NextRequest) {
  const caller = await authenticateRequest(req);
  if (!caller) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id || id.includes("/"))
    return NextResponse.json({ error: "Invalid assignment" }, { status: 400 });
  const assignment = (await adminDb.collection("assignments").doc(id).get()).data();
  const profile = (await adminDb.collection("users").doc(caller.uid).get()).data();
  const access = assignmentAccess(assignment, caller.uid, profile);
  if (!access) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  // Answer keys and rubrics go only to the owner; other teachers see the public assignment.
  if (access !== "owner") return NextResponse.json(stripAnswerKey(assignment!));
  const key = (await adminDb.collection("assignment_keys").doc(id).get()).data();
  return NextResponse.json(mergeAnswerKey(assignment!, key));
}
