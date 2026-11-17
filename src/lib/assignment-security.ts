import { ClientError } from "./client-error";
import { MISCONCEPTION_IDS } from "../../functions/src/misconceptions";
export interface Distractor {
  answer: string;
  misconception: string;
}
const MAX_DISTRACTORS = 10;
export interface AssignmentQuestion {
  id: string;
  text: string;
  type?: string;
  points?: number;
  correctAnswer?: string;
  [field: string]: unknown;
}
interface AssignmentRecord {
  questions?: AssignmentQuestion[];
  rubric?: string;
  [field: string]: unknown;
}
interface AnswerKey {
  answers?: Record<string, string>;
  rubric?: string;
  distractors?: Record<string, Distractor[]>;
}
/** Known wrong answers live in the key: telling a student which option is a known misconception tells them it is wrong. */
function parseDistractors(raw: unknown): Distractor[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw) || raw.length > MAX_DISTRACTORS)
    throw new ClientError("Invalid distractors");
  return raw.map((d) => {
    if (
      !d ||
      typeof d !== "object" ||
      typeof d.answer !== "string" ||
      !d.answer.trim() ||
      d.answer.length > 500 ||
      typeof d.misconception !== "string" ||
      !MISCONCEPTION_IDS.has(d.misconception)
    )
      throw new ClientError("Invalid distractors");
    return { answer: d.answer.trim(), misconception: d.misconception };
  });
}
export function splitAssignmentQuestions(questions: Record<string, unknown>[]) {
  const answers: Record<string, string> = Object.create(null);
  const distractors: Record<string, Distractor[]> = Object.create(null);
  const publicQuestions = questions.map(
    ({ correctAnswer, distractors: rawDistractors, ...question }) => {
      if (
        typeof question.id !== "string" ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(question.id) ||
        ["__proto__", "constructor", "prototype"].includes(question.id) ||
        Object.prototype.hasOwnProperty.call(answers, question.id)
      )
        throw new ClientError("Question IDs must be unique and valid");
      if (
        typeof question.text !== "string" ||
        !question.text.trim() ||
        question.text.length > 50000
      )
        throw new ClientError("Invalid question text");
      if (
        question.points !== undefined &&
        (typeof question.points !== "number" ||
          !Number.isFinite(question.points) ||
          question.points < 0)
      )
        throw new ClientError("Invalid question points");
      if (correctAnswer !== undefined && typeof correctAnswer !== "string")
        throw new ClientError("Invalid answer key");
      answers[question.id] = correctAnswer ?? "";
      const parsed = parseDistractors(rawDistractors);
      if (parsed?.length) distractors[question.id] = parsed;
      return question as AssignmentQuestion;
    },
  );
  return { publicQuestions, answers, distractors };
}
export function mergeAnswerKey(assignment: AssignmentRecord, key?: AnswerKey) {
  return {
    ...assignment,
    rubric: key?.rubric || assignment.rubric || "",
    questions: (assignment.questions || []).map((q) => ({
      ...q,
      correctAnswer:
        key?.answers?.[q.id] ??
        q.correctAnswer ??
        ((q as Record<string, unknown>).answer as string | undefined) ??
        "",
      ...(key?.distractors?.[q.id] ? { distractors: key.distractors[q.id] } : {}),
    })),
  };
}
