import { parseNumericKey } from "../../functions/src/grading-core";

export interface ValidatableQuestion {
  id?: string;
  type: "text" | "multiple-choice" | "true-false" | "short-answer" | "numeric";
  text?: string;
  options?: string[];
  correctAnswer?: string;
  tolerance?: number;
  sigFigs?: number;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  questionIndex?: number;
}

export function validateQuestionAnswers(questions: ValidatableQuestion[]): ValidationResult {
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const qNum = i + 1;
    if (q.type === "multiple-choice") {
      const hasValidSelected = Boolean(
        q.correctAnswer && q.options?.some((opt) => opt.trim() && opt === q.correctAnswer),
      );
      if (!hasValidSelected) {
        return {
          valid: false,
          error: `Question ${qNum} (Multiple Choice): please select which option is the correct answer.`,
          questionIndex: i,
        };
      }
    } else if (q.type === "true-false") {
      if (!q.correctAnswer || (q.correctAnswer !== "True" && q.correctAnswer !== "False")) {
        return {
          valid: false,
          error: `Question ${qNum} (True/False): please select whether True or False is the correct answer.`,
          questionIndex: i,
        };
      }
    } else if (q.type === "numeric") {
      if (!parseNumericKey(q.correctAnswer)) {
        return {
          valid: false,
          error: `Question ${qNum} (Numeric): enter the correct answer as a number with its unit, like 12.5 m/s.`,
          questionIndex: i,
        };
      }
      if (
        q.tolerance !== undefined &&
        (typeof q.tolerance !== "number" ||
          !Number.isFinite(q.tolerance) ||
          q.tolerance < 0 ||
          q.tolerance > 100)
      ) {
        return {
          valid: false,
          error: `Question ${qNum} (Numeric): tolerance must be between 0 and 100%.`,
          questionIndex: i,
        };
      }
      if (
        q.sigFigs !== undefined &&
        (!Number.isInteger(q.sigFigs) || q.sigFigs < 1 || q.sigFigs > 15)
      ) {
        return {
          valid: false,
          error: `Question ${qNum} (Numeric): significant figures must be a whole number from 1 to 15.`,
          questionIndex: i,
        };
      }
    } else if (q.type === "short-answer") {
      if (!q.correctAnswer || !q.correctAnswer.trim()) {
        return {
          valid: false,
          error: `Question ${qNum} (Short Answer): please provide an expected answer for grading.`,
          questionIndex: i,
        };
      }
    }
  }
  return { valid: true };
}
