// Server-only store for AI-drafted problems awaiting human review (`content_drafts`; no Firestore
// rule exposes it). Shared by the admin content API routes.

import { model } from "@/lib/ai/config";
import { DEFAULT_AP_COURSE, isApCourseId, type ApCourseId } from "@/data/ap";
import type { ModelCall } from "./problem-generator";
import type { DraftProblem, Verification } from "./problem-format";

export const CONTENT_DRAFTS = "content_drafts";

export type DraftStatus = "draft" | "approved" | "rejected" | "published";
export type ReviewKind = "human" | "ai" | "verified" | "owner-accepted";

export interface ContentDraft {
  /** The AP course `apUnit` and `apTopic` belong to. */
  course: ApCourseId;
  apUnit: number;
  apTopic: string;
  status: DraftStatus;
  /** The current (possibly reviewer-edited) problem. Undefined when the AI's draft was unusable. */
  problem: DraftProblem | null;
  /** What the model first returned, for reference. */
  original: unknown;
  errors: string[];
  warnings: string[];
  check: { answer: string; agrees: boolean; reasoning: string } | null;
  edited: boolean;
  batchId: string;
  generatedBy: string;
  createdAt: Date;
  reviewedBy?: string | null;
  reviewedAt?: Date | null;
  reviewNote?: string | null;
  /**
   * Who stands behind the approval. "ai": an AI solved and approved it; it cannot go live as it is.
   * "verified": it passed every check of the verifier (`verification` below); publishable while the
   * problem still matches the hash that was verified. "owner-accepted": the owner took the AI review
   * as it is (tools/content-drafts.cjs import --accept-ai-review).
   */
  reviewKind?: ReviewKind | null;
  /** Set with reviewKind "verified" by tools/verify-content.cjs --write. */
  verification?: Verification | null;
  /** Blind solver answers recorded by tools/verify-content.cjs record-solve, each for one version of the text. */
  solves?: { id: string; answer: string; textHash: string; recordedAt?: string }[];
  assignmentId?: string | null;
}

/** The AP course a stored draft belongs to. Drafts written before there were other courses: AP Physics 1. */
export function draftCourse(draft: { course?: unknown } | undefined | null): ApCourseId {
  return isApCourseId(draft?.course) ? draft.course : DEFAULT_AP_COURSE;
}

/** Gemini through the app's single provider choke point (PII scrub, budget, timeouts). */
export const geminiModelCall: ModelCall = async ({
  systemInstruction,
  prompt,
  temperature,
  maxOutputTokens,
}) => {
  const result = await model.generateContent({
    systemInstruction,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature, maxOutputTokens, responseMimeType: "application/json" },
  });
  const response = await result.response;
  return {
    text: response.text(),
    usage: {
      inputTokens: response.usageMetadata?.promptTokenCount || 0,
      outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
    },
  };
};

/** Firestore Timestamps -> ISO strings for the review screen. */
export function serialiseDraft(id: string, data: FirebaseFirestore.DocumentData) {
  const iso = (v: unknown) =>
    v && typeof (v as { toDate?: unknown }).toDate === "function"
      ? (v as { toDate: () => Date }).toDate().toISOString()
      : v instanceof Date
        ? v.toISOString()
        : null;
  return { id, ...data, createdAt: iso(data.createdAt), reviewedAt: iso(data.reviewedAt) };
}
