import { NextResponse } from "next/server";
import { withAuthorizedRequest } from "@/lib/auth-verify";
import { adminDb } from "@/lib/firebase-admin";
import { errorResponse } from "@/lib/api-errors";
import { parseJsonBody } from "@/lib/api-schema";
import { updateAssignmentBody } from "@/lib/schemas/api-bodies";
import { mergeAnswerKey, splitAssignmentQuestions } from "@/lib/assignment-security";
import { assertValidAnswerKeys } from "@/lib/answer-key-access";
import { isApTopicId, normaliseApTags } from "@/data/ap";
import { changedQuestionIds, regradeSubmission } from "@/lib/regrade";
import { pointsOf, type GradableQuestion } from "../../../../../functions/src/grading-core";

/**
 * PATCH /api/assignments/{id} -> { ok, submissions, regraded, needsReview }
 * The owner edits an assignment: title, description, due date, settings, problems, or archives it.
 * When problems change and students have handed work in, answers to the questions whose grading changed
 * are re-graded without the AI; answers the teacher graded by hand keep their score, and answers that
 * would need the AI keep their score and are listed for the teacher (`reviewQuestions`).
 */
export const PATCH = withAuthorizedRequest(
  async (req, { caller, requestId }) => {
    const parsed = await parseJsonBody(req, updateAssignmentBody, { message: "Invalid change" });
    if (!parsed.ok) return parsed.response;
    const id = decodeURIComponent(req.nextUrl.pathname.split("/").filter(Boolean).at(-1) ?? "");
    if (!id || id.includes("/"))
      return NextResponse.json({ error: "Invalid assignment" }, { status: 400 });
    const {
      questions: rawQuestions,
      archived,
      dueDate,
      title,
      rubric,
      apCourse,
      apUnit,
      apTopics,
      ...fields
    } = parsed.data;
    try {
      const ref = adminDb.collection("assignments").doc(id);
      const keyRef = adminDb.collection("assignment_keys").doc(id);
      const current = (await ref.get()).data();
      if (!current || current.teacherId !== caller.uid)
        return NextResponse.json({ error: "Access denied" }, { status: 403 });

      const update: Record<string, unknown> = { ...fields, updatedAt: new Date() };
      if (title !== undefined) update.title = title;
      if (dueDate !== undefined) update.dueDate = dueDate == null ? null : new Date(dueDate);
      if (archived !== undefined) update.archivedAt = archived ? new Date() : null;
      if (apCourse !== undefined || apUnit !== undefined || apTopics !== undefined)
        Object.assign(
          update,
          normaliseApTags({
            apCourse: apCourse === undefined ? current.apCourse : apCourse,
            apUnit: apUnit === undefined ? current.apUnit : apUnit,
            apTopics: apTopics === undefined ? current.apTopics : apTopics,
          }),
        );

      const keyUpdate: Record<string, unknown> = {};
      if (rubric !== undefined) keyUpdate.rubric = rubric ?? "";

      let changed: string[] = [];
      let nextQuestions: GradableQuestion[] | null = null;
      if (rawQuestions) {
        const questions = rawQuestions.map(({ apTopic, ...q }) =>
          isApTopicId(apTopic) ? { ...q, apTopic } : q,
        );
        assertValidAnswerKeys(questions);
        const { publicQuestions, answers, distractors } = splitAssignmentQuestions(questions);
        const key = (await keyRef.get()).data();
        const before = mergeAnswerKey(current, key).questions as GradableQuestion[];
        nextQuestions = questions as GradableQuestion[];
        changed = changedQuestionIds(before, nextQuestions);
        update.questions = publicQuestions;
        update.answerKeySeparated = true;
        update.totalPoints = nextQuestions.reduce((sum, q) => sum + pointsOf(q), 0);
        keyUpdate.answers = answers;
        keyUpdate.distractors = distractors;
      }

      const batch = adminDb.batch();
      batch.update(ref, update);
      if (Object.keys(keyUpdate).length)
        batch.set(keyRef, { ...keyUpdate, teacherId: caller.uid }, { merge: true });
      await batch.commit();

      // Re-grade handed-in work. Removed questions also change totals, so every submission is checked.
      let submissions = 0;
      let regraded = 0;
      let needsReview = 0;
      if (nextQuestions) {
        const snap = await adminDb.collection("submissions").where("assignmentId", "==", id).get();
        const changedSet = new Set(changed);
        const writes: [FirebaseFirestore.DocumentReference, Record<string, unknown>][] = [];
        for (const doc of snap.docs) {
          const s = doc.data();
          if (!Array.isArray(s.answers)) continue;
          submissions++;
          const result = await regradeSubmission(nextQuestions, s, changedSet);
          regraded += result.regraded > 0 ? 1 : 0;
          needsReview += result.reviewQuestions.length > 0 ? 1 : 0;
          writes.push([
            doc.ref,
            {
              answers: result.answers,
              reviewQuestions: result.reviewQuestions,
              ...(s.graded
                ? {
                    score: result.score,
                    earnedPoints: result.earnedPoints,
                    totalPoints: result.totalPoints,
                  }
                : {}),
              ...(result.regraded ? { regradedAt: new Date() } : {}),
            },
          ]);
        }
        for (let i = 0; i < writes.length; i += 400) {
          const b = adminDb.batch();
          writes.slice(i, i + 400).forEach(([r, d]) => b.update(r, d));
          await b.commit();
        }
      }
      return NextResponse.json({ ok: true, submissions, regraded, needsReview, changed });
    } catch (error) {
      return errorResponse(error, "assignments/update", requestId);
    }
  },
  { teacher: true, rateLimit: "write" },
);
