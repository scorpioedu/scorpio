import { NextResponse } from "next/server";
import { withAuthorizedRequest } from "@/lib/auth-verify";
import { adminDb } from "@/lib/firebase-admin";
import { errorResponse } from "@/lib/api-errors";
import { mergeAnswerKey } from "@/lib/assignment-security";
import { parseDueDate } from "@/lib/due-date";
import type { QuestionSolution, SolutionsResponse } from "./types";

type Data = FirebaseFirestore.DocumentData;

const denied = () => NextResponse.json({ error: "Access denied" }, { status: 403 });
const text = (value: unknown) => (typeof value === "string" && value.trim() ? value : "");

/** The caller's own submission: the stable id first, then the query the student page uses (older ids). */
async function ownSubmission(uid: string, assignmentId: string): Promise<Data | undefined> {
  const submissions = adminDb.collection("submissions");
  const stable = (await submissions.doc(`${uid}_${assignmentId}`).get()).data();
  if (stable)
    return stable.studentId === uid && stable.assignmentId === assignmentId ? stable : undefined;
  const found = await submissions
    .where("assignmentId", "==", assignmentId)
    .where("studentId", "==", uid)
    .limit(1)
    .get();
  return found.docs[0]?.data();
}

/**
 * GET /api/assignments/{id}/solutions -> { solutions: { [questionId]: { answer, solution? } }, pending?, availableAt? }
 *
 * Correct answers and worked solutions for one assignment. Worked solutions live in the server-only
 * `assignment_solutions/{id}` doc ({ solutions: { [questionId]: string } }), written when a course
 * set is published or assigned; most assignments have none.
 *
 * - The assignment's owner always gets every answer and solution.
 * - A student gets them only when all of these hold, checked here with the server's clock:
 *   1. they are enrolled (the same test POST /api/submissions uses);
 *   2. their own submission is graded: `graded === true` and it is not a draft. Work waiting for
 *      the teacher (`pending_review`, or manual grading not done yet) is not graded;
 *   3. the due date has passed (strictly later than it). No readable due date: allowed once graded.
 *   Until then the reply is `{ solutions: {}, pending }` so the page can say when they appear.
 * - An assignment with no solutions doc gives a graded student only the answers that are already
 *   in the public question (older documents); the answer key is not read for them.
 * - Anyone else, and a missing assignment, gets the same 403.
 *
 * Submissions are final (no retakes or extensions) and time limits are kept in the browser, so
 * neither changes the rule. Late work is still accepted after the due date: a student who hands in
 * late sees solutions once that work is graded.
 */
export const GET = withAuthorizedRequest(
  async (req, { caller, profile, requestId }) => {
    const parts = req.nextUrl.pathname.split("/").filter(Boolean);
    const id = decodeURIComponent(parts.at(-2) ?? "");
    if (!id || id.includes("/"))
      return NextResponse.json({ error: "Invalid assignment" }, { status: 400 });
    try {
      const assignment = (await adminDb.collection("assignments").doc(id).get()).data();
      if (!assignment) return denied();
      const owner = profile.role === "teacher" && assignment.teacherId === caller.uid;

      let submission: Data | undefined;
      if (!owner) {
        if (profile.role !== "student" || !assignment.answerKeySeparated) return denied();
        const enrolled =
          assignment.visibility === "global" ||
          (assignment.visibility === "network" &&
            profile.organizationId &&
            assignment.organizationId === profile.organizationId) ||
          (assignment.courseId
            ? assignment.courseId === profile.courseId
            : assignment.teacherId === profile.teacherId);
        if (!enrolled) return denied();
        submission = await ownSubmission(caller.uid, id);
      }
      const graded = submission?.graded === true && submission.status !== "draft";

      const stored = (await adminDb.collection("assignment_solutions").doc(id).get()).data();
      const worked: Record<string, unknown> =
        stored?.solutions && typeof stored.solutions === "object" ? stored.solutions : {};
      const questions: Data[] = Array.isArray(assignment.questions) ? assignment.questions : [];
      const hasWorked = questions.some((q) => text(worked[q.id]));

      const solutions: Record<string, QuestionSolution> = {};
      const reply = (body: SolutionsResponse) =>
        NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });

      if (!owner) {
        // Answers already in the public question (older documents): what the page showed before.
        if (graded)
          for (const q of questions)
            if (text(q.correctAnswer)) solutions[q.id] = { answer: q.correctAnswer };
        if (!hasWorked) return reply({ solutions });
        const due = parseDueDate(assignment.dueDate);
        if (due && !(new Date() > due))
          return reply({ solutions, pending: "due", availableAt: due.toISOString() });
        if (!graded) return reply({ solutions, pending: "graded" });
      }

      const key = (await adminDb.collection("assignment_keys").doc(id).get()).data();
      for (const q of mergeAnswerKey(assignment, key).questions) {
        const solution = text(worked[q.id]);
        // A student gets the key only for questions that have a worked solution.
        if (!owner && !solution) continue;
        solutions[q.id] = { answer: q.correctAnswer, ...(solution ? { solution } : {}) };
      }
      return reply({ solutions });
    } catch (error) {
      return errorResponse(error, "assignments/solutions", requestId);
    }
  },
  { rateLimit: "write" },
);
