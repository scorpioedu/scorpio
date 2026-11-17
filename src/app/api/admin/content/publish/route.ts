import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { withAuthorizedRequest, type AuthorizedContext } from "@/lib/auth-verify";
import { adminDb } from "@/lib/firebase-admin";
import { errorResponse } from "@/lib/api-errors";
import { parseJsonBody } from "@/lib/api-schema";
import { contentPublishBody } from "@/lib/schemas/api-bodies";
import { splitAssignmentQuestions } from "@/lib/assignment-security";
import { assertValidAnswerKeys } from "@/lib/answer-key-access";
import { compareTopicIds, normaliseApTags } from "@/data/ap";
import { toAssignmentQuestion, validateDraftProblem } from "@/lib/content/problem-format";
import { CONTENT_DRAFTS } from "@/lib/content/drafts";

/** The library's older topic filter, so reviewed AP sets also show under it. */
const LEGACY_TOPIC: Record<number, string> = {
  1: "kinematics",
  2: "dynamics",
  3: "energy",
  4: "energy",
  5: "rotation",
  6: "rotation",
  7: "oscillations",
  8: "fluids",
};

/**
 * POST /api/admin/content/publish { draftIds, title, description? }
 * Turns approved drafts from one AP unit into a global Waypoints assignment (auto-graded, answer
 * key and distractors stored server-side) and marks the drafts published.
 */
async function handlePublish(req: NextRequest, { caller, requestId }: AuthorizedContext) {
  try {
    const parsed = await parseJsonBody(req, contentPublishBody, { message: "Invalid request" });
    if (!parsed.ok) return parsed.response;
    const { draftIds, title, description } = parsed.data;
    if (new Set(draftIds).size !== draftIds.length)
      return NextResponse.json({ error: "Duplicate problems" }, { status: 400 });

    const refs = draftIds.map((id) => adminDb.collection(CONTENT_DRAFTS).doc(id));
    const docs = await adminDb.getAll(...refs);
    const drafts = docs.map((d) => ({ id: d.id, data: d.data() }));
    const notApproved = drafts.filter((d) => d.data?.status !== "approved");
    if (notApproved.length)
      return NextResponse.json(
        { error: "Only approved problems can be published", ids: notApproved.map((d) => d.id) },
        { status: 409 },
      );
    // An AI may approve a draft to save a person time, but only a person's approval can go live.
    // The local emulator is the exception, so AI-reviewed sets can be tried end to end there.
    const aiOnly = drafts.filter((d) => d.data?.reviewKind === "ai");
    if (aiOnly.length && !process.env.FIRESTORE_EMULATOR_HOST)
      return NextResponse.json(
        {
          error: "These problems were only checked by AI. A person must approve them first.",
          ids: aiOnly.map((d) => d.id),
        },
        { status: 409 },
      );
    const units = new Set(drafts.map((d) => d.data!.apUnit));
    if (units.size !== 1)
      return NextResponse.json({ error: "Publish one AP unit at a time" }, { status: 400 });

    // Re-check every problem on the way out; approval happened earlier and the rules may be newer.
    const questions = [];
    for (const d of drafts) {
      const v = validateDraftProblem(d.data!.problem, d.data!.apTopic);
      if (!v.problem || v.errors.length)
        return NextResponse.json(
          { error: `Problem ${d.id} no longer passes checks`, errors: v.errors },
          { status: 422 },
        );
      questions.push(toAssignmentQuestion(v.problem, randomUUID()));
    }
    assertValidAnswerKeys(questions);
    const { publicQuestions, answers, distractors } = splitAssignmentQuestions(questions);
    const unit = [...units][0] as number;
    const topics = [...new Set(drafts.map((d) => d.data!.apTopic as string))].sort(compareTopicIds);

    const ref = adminDb.collection("assignments").doc();
    const batch = adminDb.batch();
    batch.set(ref, {
      title,
      description: description || "",
      topic: LEGACY_TOPIC[unit] || "other",
      ...normaliseApTags({ apUnit: unit, apTopics: topics }),
      teacherId: caller.uid,
      organizationId: null,
      courseId: null,
      visibility: "global",
      gradingType: "ai",
      type: "standard",
      questions: publicQuestions,
      totalPoints: questions.reduce((sum, q) => sum + q.points, 0),
      rubric: null,
      answerKeySeparated: true,
      contentSource: "scorpio-reviewed",
      contentDraftIds: draftIds,
      forkCount: 0,
      dueDate: null,
      createdAt: new Date(),
    });
    batch.set(adminDb.collection("assignment_keys").doc(ref.id), {
      answers,
      ...(Object.keys(distractors).length ? { distractors } : {}),
      rubric: "",
      teacherId: caller.uid,
    });
    for (const r of refs) batch.update(r, { status: "published", assignmentId: ref.id });
    await batch.commit();
    return NextResponse.json({ id: ref.id });
  } catch (error) {
    return errorResponse(error, "admin/content/publish", requestId);
  }
}

export const POST = withAuthorizedRequest(handlePublish, { admin: true, rateLimit: "write" });
