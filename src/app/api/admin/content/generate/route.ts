import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { withAuthorizedRequest, type AuthorizedContext } from "@/lib/auth-verify";
import { adminDb } from "@/lib/firebase-admin";
import { errorResponse } from "@/lib/api-errors";
import { parseJsonBody } from "@/lib/api-schema";
import { contentGenerateBody } from "@/lib/schemas/api-bodies";
import { billingContext } from "@/lib/billing-context";
import { apTopic } from "@/data/ap";
import { generateProblems } from "@/lib/content/problem-generator";
import {
  CONTENT_DRAFTS,
  geminiModelCall,
  serialiseDraft,
  type ContentDraft,
} from "@/lib/content/drafts";

/**
 * POST /api/admin/content/generate { apTopic, count, difficulty? }
 * Drafts problems for one AP topic, checks each key with an independent solve, and stores them as
 * drafts. Nothing reaches students until a person approves and publishes it.
 */
async function handleGenerate(req: NextRequest, { caller, requestId }: AuthorizedContext) {
  try {
    const parsed = await parseJsonBody(req, contentGenerateBody, { message: "Invalid request" });
    if (!parsed.ok) return parsed.response;
    const topic = apTopic(parsed.data.apTopic);
    if (!topic) return NextResponse.json({ error: "Unknown AP topic" }, { status: 400 });

    // Admin-only, so the pipeline is billed to the content org when one is configured, else uncapped.
    const drafts = await billingContext.run(
      { organizationId: process.env.CONTENT_ORG_ID || "", userId: caller.uid, type: "content" },
      () => generateProblems(parsed.data, geminiModelCall),
    );

    const batchId = randomUUID();
    const batch = adminDb.batch();
    const saved = drafts.map((d) => {
      const ref = adminDb.collection(CONTENT_DRAFTS).doc();
      const doc: ContentDraft = {
        course: "physics-1",
        apUnit: topic.unit,
        apTopic: topic.id,
        status: "draft",
        problem: d.problem ?? null,
        original: JSON.parse(JSON.stringify(d.raw ?? null)),
        errors: d.errors,
        warnings: d.warnings,
        check: d.check ?? null,
        edited: false,
        batchId,
        generatedBy: caller.uid,
        createdAt: new Date(),
        reviewedBy: null,
        reviewedAt: null,
        reviewNote: null,
        assignmentId: null,
      };
      batch.set(ref, doc);
      return serialiseDraft(ref.id, doc);
    });
    await batch.commit();
    return NextResponse.json({ batchId, drafts: saved });
  } catch (error) {
    return errorResponse(error, "admin/content/generate", requestId);
  }
}

export const POST = withAuthorizedRequest(handleGenerate, { admin: true, rateLimit: "generate" });
