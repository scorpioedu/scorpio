import { NextResponse, type NextRequest } from "next/server";
import { withAuthorizedRequest } from "@/lib/auth-verify";
import { adminDb } from "@/lib/firebase-admin";
import { errorResponse } from "@/lib/api-errors";
import { parseJsonBody } from "@/lib/api-schema";
import { lessonReadBody } from "@/lib/schemas/api-bodies";
import {
  LESSON_READS,
  lessonReadsDocId,
  readFirstTopics,
  type LessonReads,
} from "@/lib/read-first";

type Data = FirebaseFirestore.DocumentData;

const denied = () => NextResponse.json({ error: "Access denied" }, { status: 403 });
/** Who has read what is per person: never cached. */
const reply = (body: unknown) =>
  NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });

function assignmentIdOf(req: NextRequest): string | null {
  const id = decodeURIComponent(req.nextUrl.pathname.split("/").filter(Boolean).at(-2) ?? "");
  return id && !id.includes("/") ? id : null;
}

/** The same enrollment test POST /api/submissions uses. */
function enrolled(assignment: Data, profile: Data): boolean {
  return Boolean(
    assignment.visibility === "global" ||
    (assignment.visibility === "network" &&
      profile.organizationId &&
      assignment.organizationId === profile.organizationId) ||
    (assignment.courseId
      ? assignment.courseId === profile.courseId
      : assignment.teacherId === profile.teacherId),
  );
}

/** Only the topics still asked for, with readable times. */
function readsOf(doc: Data | undefined, topics: string[]): LessonReads {
  const out: LessonReads = {};
  const reads = doc?.reads && typeof doc.reads === "object" ? doc.reads : {};
  for (const t of topics) {
    const at = reads[t];
    const date = typeof at?.toDate === "function" ? at.toDate() : at instanceof Date ? at : null;
    if (date) out[t] = date.toISOString();
  }
  return out;
}

/**
 * GET /api/assignments/{id}/lesson-reads
 *   student (enrolled) -> { topics, reads }: the lessons to read first and which they have read.
 *   owner (teacher)    -> { topics, students: { [studentId]: reads } }.
 * POST /api/assignments/{id}/lesson-reads { topic } (student) -> { topics, reads }: marks one read.
 *
 * Read marks live in the server-only `lesson_reads/{assignmentId}_{studentId}` doc
 * ({ assignmentId, studentId, teacherId, courseId, reads: { "4.1": Timestamp } }); no Firestore rule
 * matches it. An assignment that asks for no reading (readFirst off, or no topic with a lesson)
 * gives `topics: []`, and a POST to it is refused.
 */
export const GET = withAuthorizedRequest(
  async (req, { caller, profile, requestId }) => {
    const id = assignmentIdOf(req);
    if (!id) return NextResponse.json({ error: "Invalid assignment" }, { status: 400 });
    try {
      const assignment = (await adminDb.collection("assignments").doc(id).get()).data();
      if (!assignment) return denied();
      const topics = readFirstTopics(assignment);
      if (profile.role === "teacher" && assignment.teacherId === caller.uid) {
        const snap = await adminDb.collection(LESSON_READS).where("assignmentId", "==", id).get();
        const students: Record<string, LessonReads> = {};
        for (const doc of snap.docs) {
          const d = doc.data();
          if (typeof d.studentId === "string") students[d.studentId] = readsOf(d, topics);
        }
        return reply({ topics, students });
      }
      if (profile.role !== "student" || !enrolled(assignment, profile)) return denied();
      const own = (
        await adminDb.collection(LESSON_READS).doc(lessonReadsDocId(id, caller.uid)).get()
      ).data();
      return reply({ topics, reads: readsOf(own, topics) });
    } catch (error) {
      return errorResponse(error, "assignments/lesson-reads", requestId);
    }
  },
  { rateLimit: "write" },
);

export const POST = withAuthorizedRequest(
  async (req, { caller, profile, requestId }) => {
    const id = assignmentIdOf(req);
    if (!id) return NextResponse.json({ error: "Invalid assignment" }, { status: 400 });
    const parsed = await parseJsonBody(req, lessonReadBody, { message: "Invalid lesson" });
    if (!parsed.ok) return parsed.response;
    if (profile.role !== "student")
      return NextResponse.json({ error: "Student account required" }, { status: 403 });
    try {
      const assignment = (await adminDb.collection("assignments").doc(id).get()).data();
      if (!assignment || !enrolled(assignment, profile)) return denied();
      const topics = readFirstTopics(assignment);
      if (!topics.includes(parsed.data.topic))
        return NextResponse.json(
          { error: "This lesson is not part of the assignment" },
          { status: 400 },
        );
      const ref = adminDb.collection(LESSON_READS).doc(lessonReadsDocId(id, caller.uid));
      // A map key, not a field path: "4.1" stays one key under `reads`.
      await ref.set(
        {
          assignmentId: id,
          studentId: caller.uid,
          teacherId: assignment.teacherId ?? null,
          courseId: assignment.courseId ?? null,
          reads: { [parsed.data.topic]: new Date() },
          updatedAt: new Date(),
        },
        { merge: true },
      );
      return reply({ topics, reads: readsOf((await ref.get()).data(), topics) });
    } catch (error) {
      return errorResponse(error, "assignments/lesson-reads", requestId);
    }
  },
  { rateLimit: "write" },
);
