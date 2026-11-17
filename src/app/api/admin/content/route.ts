import { NextRequest, NextResponse } from "next/server";
import { withAuthorizedRequest, type AuthorizedContext } from "@/lib/auth-verify";
import { adminDb } from "@/lib/firebase-admin";
import { errorResponse } from "@/lib/api-errors";
import { parseJsonBody } from "@/lib/api-schema";
import { contentReviewBody } from "@/lib/schemas/api-bodies";
import { validateDraftProblem } from "@/lib/content/problem-format";
import { CONTENT_DRAFTS, serialiseDraft, type DraftStatus } from "@/lib/content/drafts";

const STATUSES: DraftStatus[] = ["draft", "approved", "rejected", "published"];

/** GET /api/admin/content?status=&apUnit= : drafts for the review screen, newest first. */
async function handleList(req: NextRequest, { requestId }: AuthorizedContext) {
  try {
    const status = req.nextUrl.searchParams.get("status");
    const unit = req.nextUrl.searchParams.get("apUnit");
    let q: FirebaseFirestore.Query = adminDb.collection(CONTENT_DRAFTS);
    if (status) {
      if (!STATUSES.includes(status as DraftStatus))
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      q = q.where("status", "==", status);
    }
    if (unit) {
      const n = Number(unit);
      if (!Number.isInteger(n) || n < 1 || n > 8)
        return NextResponse.json({ error: "Invalid AP unit" }, { status: 400 });
      q = q.where("apUnit", "==", n);
    }
    const snap = await q.limit(500).get();
    const drafts = snap.docs
      .map((d) => serialiseDraft(d.id, d.data()))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return NextResponse.json({ drafts });
  } catch (error) {
    return errorResponse(error, "admin/content", requestId);
  }
}

/**
 * PATCH /api/admin/content { id, action, problem?, note? }
 * save: store the reviewer's edits (re-validated). approve: same, and only if it now passes with
 * no errors. reject / reopen: change status. Published drafts are frozen.
 */
async function handleReview(req: NextRequest, { caller, requestId }: AuthorizedContext) {
  try {
    const parsed = await parseJsonBody(req, contentReviewBody, { message: "Invalid review" });
    if (!parsed.ok) return parsed.response;
    const { id, action, problem, note, reviewer = "human" } = parsed.data;
    const ref = adminDb.collection(CONTENT_DRAFTS).doc(id);
    const current = (await ref.get()).data();
    if (!current) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    if (current.status === "published")
      return NextResponse.json(
        { error: "Published problems cannot be changed here" },
        { status: 409 },
      );

    const update: Record<string, unknown> = {
      reviewedBy: caller.uid,
      reviewedAt: new Date(),
      ...(note !== undefined ? { reviewNote: note } : {}),
    };
    if (action === "save" || action === "approve") {
      const candidate = problem ?? current.problem;
      const v = validateDraftProblem(candidate, current.apTopic);
      if (problem) {
        update.edited = true;
        update.errors = v.errors;
        update.warnings = v.warnings;
        if (v.problem) update.problem = v.problem;
      }
      if (action === "approve") {
        if (!v.problem || v.errors.length)
          return NextResponse.json(
            { error: "Fix these before approving", errors: v.errors },
            { status: 422 },
          );
        update.problem = v.problem;
        update.status = "approved";
        update.reviewKind = reviewer;
      }
    } else if (action === "reject") {
      update.status = "rejected";
    } else if (action === "reopen") {
      update.status = "draft";
      update.reviewKind = null;
    }
    await ref.update(update);
    return NextResponse.json({ draft: serialiseDraft(id, { ...current, ...update }) });
  } catch (error) {
    return errorResponse(error, "admin/content", requestId);
  }
}

export const GET = withAuthorizedRequest(handleList, { admin: true, rateLimit: "write" });
export const PATCH = withAuthorizedRequest(handleReview, { admin: true, rateLimit: "write" });
