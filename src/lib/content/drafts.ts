// Server-only store for AI-drafted problems awaiting human review (`content_drafts`; no Firestore
// rule exposes it). Shared by the admin content API routes.

import { model } from "@/lib/ai/config";
import type { ModelCall } from "./problem-generator";
import type { DraftProblem } from "./problem-format";

export const CONTENT_DRAFTS = "content_drafts";

export type DraftStatus = "draft" | "approved" | "rejected" | "published";

export interface ContentDraft {
  course: "physics-1";
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
  assignmentId?: string | null;
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
