// Shared types and helpers for the assignment editor (create page and the assignment's Problems tab).
import { getAssignmentPoints, splitAssignmentPoints } from "@/lib/assignment-points";
import { parseNumericKey } from "../../../../functions/src/grading-core";

export type QuestionType = "text" | "multiple-choice" | "true-false" | "short-answer" | "numeric";

export interface Question {
  id: string;
  text: string;
  type: QuestionType;
  options?: string[];
  correctAnswer?: string;
  points: number;
  /** Numeric only: accepted relative error in percent (default 3). */
  tolerance?: number;
  /** Numeric only: expected significant figures; unset means not checked. */
  sigFigs?: number;
  [field: string]: unknown;
}

export interface RawQuestion {
  id?: string;
  type?: string;
  text?: string;
  options?: string[];
  correctAnswer?: unknown;
  answer?: unknown;
  expectedAnswer?: unknown;
  points?: number;
  [key: string]: unknown;
}

export const QUESTION_TYPES = [
  { type: "text", label: "Free Response" },
  { type: "short-answer", label: "Short Answer" },
  { type: "numeric", label: "Numeric" },
  { type: "multiple-choice", label: "Multiple Choice" },
  { type: "true-false", label: "True/False" },
] as const;

const TYPES = ["text", "multiple-choice", "true-false", "short-answer", "numeric"];

/**
 * A stored question in the editor's shape: answer resolved from legacy fields, type normalised,
 * true/false and multiple-choice keys matched to their options. `keepId` keeps the stored id
 * (editing an assignment, so grades stay attached); otherwise a new id is made (copies).
 */
export function toEditorQuestion(question: RawQuestion, keepId = false): Question {
  let resolvedAnswer = (
    question.correctAnswer ??
    question.answer ??
    question.expectedAnswer ??
    ""
  ).toString();

  let normalizedType = question.type;
  if (normalizedType === "free-response") normalizedType = "text";
  if (normalizedType === "numerical")
    normalizedType = parseNumericKey(resolvedAnswer) ? "numeric" : "short-answer";
  if (!normalizedType || !TYPES.includes(normalizedType)) {
    normalizedType = question.options?.length ? "multiple-choice" : "short-answer";
  }

  if (normalizedType === "true-false") {
    const lower = resolvedAnswer.trim().toLowerCase();
    if (lower === "true" || lower === "t") resolvedAnswer = "True";
    else if (lower === "false" || lower === "f") resolvedAnswer = "False";
  }

  const cleanOptions = Array.isArray(question.options) ? question.options : [];
  if (normalizedType === "multiple-choice" && cleanOptions.length) {
    const exactMatch = cleanOptions.find((opt: string) => opt.trim() === resolvedAnswer.trim());
    if (exactMatch) {
      resolvedAnswer = exactMatch;
    } else {
      const ciMatch = cleanOptions.find(
        (opt: string) => opt.trim().toLowerCase() === resolvedAnswer.trim().toLowerCase(),
      );
      if (ciMatch) {
        resolvedAnswer = ciMatch;
      } else if (/^[A-D]$/i.test(resolvedAnswer.trim())) {
        const letterIndex = resolvedAnswer.trim().toUpperCase().charCodeAt(0) - 65;
        if (cleanOptions[letterIndex]) resolvedAnswer = cleanOptions[letterIndex];
      } else if (/^[0-3]$/.test(resolvedAnswer.trim())) {
        const numIndex = parseInt(resolvedAnswer.trim(), 10);
        if (cleanOptions[numIndex]) resolvedAnswer = cleanOptions[numIndex];
      }
    }
  }

  return {
    ...question,
    id:
      keepId && typeof question.id === "string" && question.id ? question.id : crypto.randomUUID(),
    text: (question.text ?? "").toString(),
    type: normalizedType as QuestionType,
    options: cleanOptions,
    correctAnswer: resolvedAnswer,
    points: question.points || 10,
  };
}

/** A generated or imported question, with a new id. */
export function fromGenerated(q: RawQuestion): Question {
  return {
    id: crypto.randomUUID(),
    text: (q.text || "").toString(),
    type: (q.type as QuestionType) || "short-answer",
    options: q.options || [],
    correctAnswer: (q.correctAnswer ?? "").toString(),
    points: typeof q.points === "number" ? q.points : 10,
  };
}

export interface PointsSummary {
  validTotal: boolean;
  scoredQuestions: Question[];
  allocatedPoints: number;
  pointsError: string;
}

/** Points per question: split evenly from the total, or each question's own (custom). */
export function summarisePoints(
  questions: Question[],
  assignmentPoints: number,
  customPoints: boolean,
): PointsSummary {
  const validTotal = Number.isSafeInteger(assignmentPoints) && assignmentPoints > 0;
  const evenlySplitPoints = splitAssignmentPoints(
    validTotal ? assignmentPoints : 0,
    questions.length,
  );
  const scoredQuestions = customPoints
    ? questions
    : questions.map((question, index) => ({ ...question, points: evenlySplitPoints[index] }));
  const allocatedPoints = scoredQuestions.reduce((total, question) => total + question.points, 0);
  const remainingPoints = assignmentPoints - allocatedPoints;

  let pointsError = "";
  if (!validTotal) {
    pointsError = "Enter a positive whole number for the assignment total.";
  } else if (assignmentPoints < questions.length) {
    pointsError = "The assignment needs at least 1 point per question.";
  } else if (scoredQuestions.some(({ points }) => !Number.isSafeInteger(points) || points < 1)) {
    pointsError = "Give each question at least 1 whole point.";
  } else if (questions.length > 0 && remainingPoints !== 0) {
    const difference = Math.abs(remainingPoints);
    const pointCount = `${difference} ${difference === 1 ? "point" : "points"}`;
    pointsError =
      remainingPoints > 0
        ? `${pointCount} left to assign.`
        : `${pointCount} over the assignment total.`;
  }
  return { validTotal, scoredQuestions, allocatedPoints, pointsError };
}

export { getAssignmentPoints };

/** Move the item at `index` by `delta` places (clamped). */
export function moveItem<T>(list: T[], index: number, delta: number): T[] {
  const to = Math.max(0, Math.min(list.length - 1, index + delta));
  if (to === index) return list;
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(to, 0, item);
  return next;
}

/** Remove choice `index`; the key is cleared if it pointed at the removed choice. */
export function removeChoice(question: Question, index: number): Partial<Question> {
  const options = (question.options ?? []).filter((_, i) => i !== index);
  const removed = question.options?.[index];
  return {
    options,
    correctAnswer:
      removed !== undefined && question.correctAnswer === removed ? "" : question.correctAnswer,
  };
}

export interface AssignmentSettingsValue {
  topic: string;
  apUnit: number | null;
  apTopics: string[];
  timeLimit: number | "";
  allowCalculator: boolean;
  allowAIHelp: boolean;
  requireWorkSubmission: boolean;
  enableTabDetection: boolean;
  lockdownMode: boolean;
  gradingType: "ai" | "manual";
  visibility: "private" | "network" | "global";
}

export const DEFAULT_SETTINGS: AssignmentSettingsValue = {
  topic: "other",
  apUnit: null,
  apTopics: [],
  timeLimit: "",
  allowCalculator: false,
  allowAIHelp: false,
  requireWorkSubmission: false,
  enableTabDetection: true,
  lockdownMode: false,
  gradingType: "ai",
  visibility: "private",
};

/** Settings stored on an assignment doc, over the defaults. */
export function settingsFrom(a: Record<string, unknown>): AssignmentSettingsValue {
  const bool = (k: keyof AssignmentSettingsValue) =>
    typeof a[k] === "boolean" ? (a[k] as boolean) : (DEFAULT_SETTINGS[k] as boolean);
  return {
    topic: typeof a.topic === "string" && a.topic ? a.topic : DEFAULT_SETTINGS.topic,
    apUnit: typeof a.apUnit === "number" ? a.apUnit : null,
    apTopics: Array.isArray(a.apTopics) ? (a.apTopics as string[]) : [],
    timeLimit: typeof a.timeLimit === "number" ? a.timeLimit : "",
    allowCalculator: bool("allowCalculator"),
    allowAIHelp: bool("allowAIHelp"),
    requireWorkSubmission: bool("requireWorkSubmission"),
    enableTabDetection: bool("enableTabDetection"),
    lockdownMode: bool("lockdownMode"),
    gradingType: a.gradingType === "manual" ? "manual" : "ai",
    visibility:
      a.visibility === "network" || a.visibility === "global"
        ? (a.visibility as "network" | "global")
        : "private",
  };
}
