// Server-only store for AI-drafted problems awaiting human review (`content_drafts`; no Firestore
// rule exposes it). Shared by the admin content API routes.

import { model } from "@/lib/ai/config";
import { DEFAULT_AP_COURSE, isApCourseId, type ApCourseId } from "@/data/ap";
import type { ModelCall } from "./problem-generator";
import type { DraftProblem } from "./problem-format";

export const CONTENT_DRAFTS = "content_drafts";

export type DraftStatus = "draft" | "approved" | "rejected" | "published";

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
  /** "ai": an AI solved and approved it; a person must approve it again before it can go live. */
  reviewKind?: "human" | "ai" | null;
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
