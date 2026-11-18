/**
 * Who may see an assignment, and who may see its answer key.
 * - Answer keys (each question's correctAnswer, plus the rubric) go only to the owning teacher.
 * - Other teachers may read the public assignment when it is shared globally, or shared with their
 *   network (same organization).
 */

import { ClientError } from "./client-error";
import { parseNumericKey } from "../../functions/src/grading-core";
import { validateQuestionAnswers, type ValidatableQuestion } from "./assignment-validation";

/** Question fields that hold (or, on legacy and seeded documents, may hold) the answer key. */
export const ANSWER_KEY_FIELDS = [
  "correctAnswer",
  "answer",
  "expectedAnswer",
  "rubric",
  "distractors",
] as const;

type Record_ = Record<string, unknown>;

export type AssignmentAccess = "owner" | "shared" | null;

/** Returns "owner" (full key), "shared" (public view only) or null (no access). Teachers only. */
export function assignmentAccess(
  assignment: Record_ | undefined,
  callerUid: string,
  profile: Record_ | undefined,
): AssignmentAccess {
  if (!assignment || profile?.role !== "teacher") return null;
  if (assignment.teacherId === callerUid) return "owner";
  if (assignment.visibility === "global") return "shared";
  if (
    assignment.visibility === "network" &&
    profile.organizationId &&
    assignment.organizationId === profile.organizationId
  )
    return "shared";
  return null;
}

export function stripQuestionKey<T extends Record_>(
  question: T,
): Omit<T, (typeof ANSWER_KEY_FIELDS)[number]> {
  const copy: Record_ = { ...question };
  for (const field of ANSWER_KEY_FIELDS) delete copy[field];
  return copy as Omit<T, (typeof ANSWER_KEY_FIELDS)[number]>;
}

/** The assignment as a non-owner may see it: no per-question answers and no rubric. */
export function stripAnswerKey(assignment: Record_): Record_ {
  const { rubric: _rubric, questions, ...rest } = assignment;
  void _rubric;
  return {
    ...rest,
    questions: Array.isArray(questions)
      ? questions.map((q) => (q && typeof q === "object" ? stripQuestionKey(q as Record_) : q))
      : [],
  };
}

/** Legacy and seeded question types, mapped to the editor's types (same mapping as teacher/create).
 *  "numerical" falls back to short-answer only when its key is not a readable number. */
const LEGACY_TYPES: Record<string, string> = { "free-response": "text", numerical: "short-answer" };

/**
 * Normalizes a forked question's type and answer the way the editor does on load, so legacy
 * waypoints ("answer: 'true'", MC answers given as a letter) produce a valid answer key.
 */
export function normalizeForkedAnswer(
  question: Record_,
  answer: string,
): { type: unknown; answer: string } {
  const rawType = typeof question.type === "string" ? question.type : undefined;
  let type = rawType ? (LEGACY_TYPES[rawType] ?? rawType) : undefined;
  // A seeded "numerical" question becomes Numeric when its key is a readable number and unit.
  if (rawType === "numerical" && parseNumericKey(answer)) type = "numeric";
  let resolved = answer;
  if (type === "true-false") {
    const lower = resolved.trim().toLowerCase();
    if (lower === "true" || lower === "t") resolved = "True";
    else if (lower === "false" || lower === "f") resolved = "False";
  }
  const options = Array.isArray(question.options)
    ? question.options.filter((o): o is string => typeof o === "string")
    : [];
  if (type === "multiple-choice" && options.length && resolved.trim()) {
    const trimmed = resolved.trim();
    const match =
      options.find((o) => o.trim() === trimmed) ??
      options.find((o) => o.trim().toLowerCase() === trimmed.toLowerCase()) ??
      (/^[A-Z]$/i.test(trimmed) ? options[trimmed.toUpperCase().charCodeAt(0) - 65] : undefined) ??
      (/^\d$/.test(trimmed) ? options[Number(trimmed)] : undefined);
    if (match) resolved = match;
  }
  return { type: type ?? question.type, answer: resolved };
}

/** Server-side re-check of the editor's answer-key rules (an MC answer must be one of its options, ...). */
export function assertValidAnswerKeys(questions: Record_[]): void {
  const result = validateQuestionAnswers(questions as unknown as ValidatableQuestion[]);
  if (!result.valid) throw new ClientError(result.error || "Invalid answer key");
}
