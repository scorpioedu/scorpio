import { NextRequest, NextResponse } from "next/server";
import { withAuthorizedRequest, type AuthorizedContext } from "@/lib/auth-verify";
import { adminDb } from "@/lib/firebase-admin";
import { errorResponse } from "@/lib/api-errors";
import { CONTENT_DRAFTS } from "@/lib/content/drafts";
import { getCurriculum, setSequence } from "@/data/curricula";
import { draftState } from "@/lib/curriculum-roadmap";

/**
 * GET /api/admin/content/sets?curriculumId= : for each set of a course, the state of its drafts and
 * whether it is already published as a global waypoint. Admin only; read-only.
 */
async function handleSets(req: NextRequest, { requestId }: AuthorizedContext) {
  try {
    const curriculum = getCurriculum(req.nextUrl.searchParams.get("curriculumId"));
    if (!curriculum) return NextResponse.json({ error: "Unknown course" }, { status: 400 });
    const ids = [...new Set(curriculum.sets.flatMap((s) => s.draftIds))];
    const [docs, publishedSnap] = await Promise.all([
      ids.length
        ? adminDb.getAll(...ids.map((id) => adminDb.collection(CONTENT_DRAFTS).doc(id)))
        : Promise.resolve([]),
      adminDb
        .collection("assignments")
        .where("visibility", "==", "global")
        .where("curriculumId", "==", curriculum.id)
        .get(),
    ]);
    const byId = new Map(docs.map((d) => [d.id, d.exists ? d.data() : undefined]));
    const published = new Map(
      publishedSnap.docs.map((d) => [String(d.data().curriculumSetKey), d.id]),
    );
    return NextResponse.json({
      curriculumId: curriculum.id,
      sets: curriculum.sets.map((s) => ({
        key: s.key,
        unit: s.unit,
        title: s.title,
        topics: s.topics,
        sequence: setSequence(curriculum.id, s.key),
        assignmentId: published.get(s.key) ?? null,
        drafts: s.draftIds.map((id) => ({ id, state: draftState(byId.get(id)) })),
      })),
    });
  } catch (error) {
    return errorResponse(error, "admin/content/sets", requestId);
  }
}

export const GET = withAuthorizedRequest(handleSets, { admin: true, rateLimit: "write" });
