// The format AI-drafted AP problems take, and the server-side checks every draft must pass before a
// person can approve it. Pure (no AI, no Firestore) so the review API and tests share it.

import { DEFAULT_AP_COURSE, apTopic, isApTopicId, type ApCourseId } from "@/data/ap";
import {
  MISCONCEPTION_IDS,
  misconceptionTag,
  misconceptionUnits,
} from "../../../functions/src/misconceptions";
import {
  checkChoice,
  checkNumeric,
  parseNumericKey,
  type GradableQuestion,
} from "../../../functions/src/grading-core";

export type ProblemType = "numeric" | "multiple-choice";
export type Difficulty = "easy" | "medium" | "hard";

export interface DraftProblem {
  text: string;
  type: ProblemType;
  /** Numeric: value + unit ("2.4 m/s"). MC: the text of the right option. */
  correctAnswer: string;
  options?: string[];
  /** Numeric: accepted relative error in percent. */
  tolerance?: number;
  /** Worked solution, for the reviewer only. Never shown to students. */
  solution: string;
  distractors: { answer: string; misconception: string }[];
  difficulty: Difficulty;
  points: number;
  apTopic: string;
}

export interface ValidationResult {
  /** Present when the draft is usable (possibly after dropping bad distractors). */
  problem?: DraftProblem;
  /** Fatal problems: the draft cannot be approved until they are fixed. */
  errors: string[];
  /** Things the reviewer should look at; they do not block approval. */
  warnings: string[];
}

const MAX_TEXT = 4000;
const MAX_SOLUTION = 6000;
const MAX_OPTION = 300;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * Checks a drafted (or reviewer-edited) problem. Distractors with unknown tags, or that the grader
 * would mark correct, are dropped with a warning rather than failing the whole draft.
 */
export function validateDraftProblem(
  raw: unknown,
  topicId: string,
  course: ApCourseId = DEFAULT_AP_COURSE,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!raw || typeof raw !== "object") return { errors: ["Not an object"], warnings };
  const r = raw as Record<string, unknown>;
  if (!isApTopicId(topicId, course)) errors.push(`Unknown AP topic ${topicId}`);

  const text = str(r.text, MAX_TEXT);
  if (text.length < 20) errors.push("Problem text is missing or too short");
  const type: ProblemType | undefined =
    r.type === "numeric" || r.type === "multiple-choice" ? r.type : undefined;
  if (!type) errors.push('Type must be "numeric" or "multiple-choice"');
  const correctAnswer = str(r.correctAnswer, 300);
  if (!correctAnswer) errors.push("Answer key is missing");
  const solution = str(r.solution, MAX_SOLUTION);
  if (solution.length < 20) warnings.push("No worked solution to check the key against");
  const difficulty: Difficulty = ["easy", "medium", "hard"].includes(r.difficulty as string)
    ? (r.difficulty as Difficulty)
    : "medium";
  const points =
    typeof r.points === "number" && Number.isInteger(r.points) && r.points >= 1 && r.points <= 100
      ? r.points
      : 10;

  let options: string[] | undefined;
  let tolerance: number | undefined;
  if (type === "multiple-choice") {
    options = Array.isArray(r.options)
      ? r.options.map((o) => str(o, MAX_OPTION)).filter(Boolean)
      : [];
    if (options.length < 3 || options.length > 6)
      errors.push("Multiple choice needs 3 to 6 options");
    if (new Set(options.map((o) => o.toLowerCase())).size !== options.length)
      errors.push("Options repeat");
    if (correctAnswer && !options.includes(correctAnswer))
      errors.push("The answer key is not one of the options (it must match an option exactly)");
  }
  if (type === "numeric") {
    const key = parseNumericKey(correctAnswer);
    if (!key) errors.push(`Answer key "${correctAnswer}" is not a number with a known unit`);
    else if (!key.unit) warnings.push("Answer key has no unit; make sure the question states it");
    if (r.tolerance !== undefined) {
      if (typeof r.tolerance === "number" && r.tolerance >= 0 && r.tolerance <= 20)
        tolerance = r.tolerance;
      else warnings.push("Tolerance ignored (must be 0–20%); the default 3% applies");
    }
  }

  const distractors: DraftProblem["distractors"] = [];
  if (Array.isArray(r.distractors)) {
    for (const d of r.distractors.slice(0, 10)) {
      const answer = str((d as Record<string, unknown>)?.answer, 300);
      const misconception = str((d as Record<string, unknown>)?.misconception, 80);
      if (!answer || !MISCONCEPTION_IDS.has(misconception) || misconception === "other") {
        warnings.push(
          `Dropped distractor "${answer || "?"}" (unknown misconception "${misconception}")`,
        );
        continue;
      }
      distractors.push({ answer, misconception });
    }
  }
  if (errors.length || !type) return { errors, warnings };

  const question: GradableQuestion = {
    id: "draft",
    text,
    type,
    correctAnswer,
    options,
    tolerance,
  };
  // A distractor the grader would mark right is a bug in the draft (or the key).
  const kept = distractors.filter((d) => {
    const check =
      type === "numeric" ? checkNumeric(d.answer, question) : checkChoice(d.answer, question);
    if (!check) {
      warnings.push(`Dropped distractor "${d.answer}" (no number in it)`);
      return false;
    }
    if (check.fraction > 0) {
      warnings.push(`Dropped distractor "${d.answer}": the grader would give it credit`);
      return false;
    }
    if (type === "multiple-choice" && !options!.includes(d.answer)) {
      warnings.push(`Dropped distractor "${d.answer}": not one of the options`);
      return false;
    }
    return true;
  });
  if (type === "multiple-choice" && kept.length < options!.length - 1)
    warnings.push("Some wrong options have no misconception tag");

  const unit = apTopic(topicId, course)?.unit;
  for (const d of kept) {
    const tag = misconceptionTag(d.misconception);
    // null: the tag belongs to another course altogether; it is flagged like a wrong unit.
    const tagUnits = tag ? misconceptionUnits(tag, course) : [];
    if (unit && (tagUnits === null || (tagUnits.length && !tagUnits.includes(unit))))
      warnings.push(
        `"${d.misconception}" is not usually a Unit ${unit} misconception; check it fits`,
      );
  }

  return {
    problem: {
      text,
      type,
      correctAnswer,
      ...(options ? { options } : {}),
      ...(tolerance !== undefined ? { tolerance } : {}),
      solution,
      distractors: kept,
      difficulty,
      points,
      apTopic: topicId,
    },
    errors,
    warnings,
  };
}

/** Does an independent answer agree with the key? Uses the real grader, so units and tolerance apply. */
export function answerAgrees(problem: DraftProblem, answer: string): boolean {
  const question: GradableQuestion = {
    id: "draft",
    text: problem.text,
    type: problem.type,
    correctAnswer: problem.correctAnswer,
    options: problem.options,
    tolerance: problem.tolerance,
  };
  const check =
    problem.type === "numeric" ? checkNumeric(answer, question) : checkChoice(answer, question);
  return !!check && check.fraction === 1;
}

/** The assignment question a published draft becomes (the key and distractors go to the key doc). */
export function toAssignmentQuestion(problem: DraftProblem, id: string) {
  return {
    id,
    text: problem.text,
    type: problem.type,
    points: problem.points,
    correctAnswer: problem.correctAnswer,
    ...(problem.options ? { options: problem.options } : {}),
    ...(problem.tolerance !== undefined ? { tolerance: problem.tolerance } : {}),
    distractors: problem.distractors,
    apTopic: problem.apTopic,
  };
}
