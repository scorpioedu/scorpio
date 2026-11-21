import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { withAuthorizedRequest, type AuthorizedContext } from "@/lib/auth-verify";
import { adminDb } from "@/lib/firebase-admin";
import { errorResponse } from "@/lib/api-errors";
import { parseJsonBody } from "@/lib/api-schema";
import { contentPublishBody } from "@/lib/schemas/api-bodies";
import { splitAssignmentQuestions } from "@/lib/assignment-security";
import { assertValidAnswerKeys } from "@/lib/answer-key-access";
import { compareTopicIds, normaliseApTags, type ApCourseId } from "@/data/ap";
import { toAssignmentQuestion, validateDraftProblem } from "@/lib/content/problem-format";
import { CONTENT_DRAFTS, draftCourse } from "@/lib/content/drafts";
import { verificationIsCurrent } from "@/lib/content/verify";
import { curriculumSet, displayTitle, getCurriculum, setSequence } from "@/data/curricula";

/** The library's older topic filter, so reviewed AP sets also show under it. */
const MECHANICS_TOPIC: Record<number, string> = {
  1: "kinematics",
  2: "dynamics",
  3: "energy",
  4: "energy",
  5: "rotation",
  6: "rotation",
  7: "oscillations",
  8: "fluids",
};
const PHYSICS_2_TOPIC: Record<number, string> = {
  9: "thermodynamics",
  10: "em",
  11: "em",
  12: "em",
  13: "waves",
  14: "waves",
  15: "modern",
};
const PHYSICS_C_EM_TOPIC: Record<number, string> = {
  8: "em",
  9: "em",
  10: "em",
  11: "em",
  12: "em",
  13: "em",
};
const LEGACY_TOPIC: Record<ApCourseId, Record<number, string>> = {
  "physics-1": MECHANICS_TOPIC,
  "physics-2": PHYSICS_2_TOPIC,
  "physics-c-mech": MECHANICS_TOPIC,
  "physics-c-em": PHYSICS_C_EM_TOPIC,
};

/**
 * POST /api/admin/content/publish { draftIds, title, description? } or { curriculumId, setKey }
 * With a curriculum set, the drafts, title, description and question order come from the definition in
 * src/data/curricula, the assignment records which set it is, and a set can only be published once.
 * The assignment's `apCourse` is the course definition's; without one it is the drafts' own course.
 * Turns approved drafts from one AP unit of one AP course into a global Waypoints assignment (auto-graded, answer
 * key and distractors stored server-side) and marks the drafts published.
 */
async function handlePublish(req: NextRequest, { caller, requestId }: AuthorizedContext) {
  try {
    const parsed = await parseJsonBody(req, contentPublishBody, { message: "Invalid request" });
    if (!parsed.ok) return parsed.response;
    let draftIds = parsed.data.draftIds ?? [];
    let title = parsed.data.title ?? "";
    let description = parsed.data.description;
    let curriculum: {
      curriculumId: string;
      curriculumSetKey: string;
      curriculumSequence: number;
    } | null = null;
    let definitionCourse: ApCourseId | null = null;
    if (parsed.data.curriculumId !== undefined && parsed.data.setKey !== undefined) {
      const { curriculumId, setKey } = parsed.data;
      const set = curriculumSet(curriculumId, setKey);
      if (!getCurriculum(curriculumId) || !set)
        return NextResponse.json({ error: "Unknown course set" }, { status: 400 });
      const existing = await adminDb
        .collection("assignments")
        .where("visibility", "==", "global")
        .where("curriculumId", "==", curriculumId)
        .where("curriculumSetKey", "==", setKey)
        .limit(1)
        .get();
      if (!existing.empty)
        return NextResponse.json({ error: "This set is already published" }, { status: 409 });
      draftIds = set.draftIds;
      if (set.draftIds.length === 0)
        return NextResponse.json(
          { error: "This set is planned: it has no problems yet" },
          { status: 400 },
        );
      title = displayTitle(set, getCurriculum(curriculumId)!.name);
      definitionCourse = getCurriculum(curriculumId)!.apCourse;
      description = set.description;
      curriculum = {
        curriculumId,
        curriculumSetKey: setKey,
        curriculumSequence: setSequence(curriculumId, setKey),
      };
    }
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
    // An AI may approve a draft to save a person time, but that alone cannot go live. What can: a
    // person's approval ("human"), the owner's acceptance ("owner-accepted"), or the verifier's mark
    // ("verified") for as long as the problem is the one that was verified.
    // The local emulator is the exception, so AI-reviewed sets can be tried end to end there.
    if (!process.env.FIRESTORE_EMULATOR_HOST) {
      const aiOnly = drafts.filter((d) => d.data?.reviewKind === "ai");
      if (aiOnly.length)
        return NextResponse.json(
          {
            error: "These problems were only checked by AI. A person must approve them first.",
            ids: aiOnly.map((d) => d.id),
          },
          { status: 409 },
        );
      // Editing a verified problem leaves its mark behind; the stored hash is what shows it.
      const stale = drafts.filter(
        (d) => d.data?.reviewKind === "verified" && !verificationIsCurrent(d.data),
      );
      if (stale.length)
        return NextResponse.json(
          {
            error:
              "These problems changed after they were verified (or have no verification record). Verify them again or have a person approve them.",
            ids: stale.map((d) => d.id),
          },
          { status: 409 },
        );
    }
    const units = new Set(drafts.map((d) => d.data!.apUnit));
    const courses = new Set(drafts.map((d) => draftCourse(d.data)));
    if (units.size !== 1 || courses.size !== 1)
      return NextResponse.json({ error: "Publish one AP unit at a time" }, { status: 400 });
    // Unit numbers repeat between courses: Unit 2 drafts of AP Physics 1 must not fill a C: Mechanics set.
    const apCourse = [...courses][0];
    if (definitionCourse && definitionCourse !== apCourse)
      return NextResponse.json(
        { error: "These problems were written for another AP course" },
        { status: 400 },
      );

    // Re-check every problem on the way out; approval happened earlier and the rules may be newer.
    const questions = [];
    for (const d of drafts) {
      const v = validateDraftProblem(d.data!.problem, d.data!.apTopic, apCourse);
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
      topic: LEGACY_TOPIC[apCourse][unit] || "other",
      ...normaliseApTags({ apCourse, apUnit: unit, apTopics: topics }),
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
      ...(curriculum ?? {}),
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
