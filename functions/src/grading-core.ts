// One grading core for both paths: the teacher-triggered Next.js route (src/app/api/grade) and the
// Cloud Function that grades on submit (functions/src/grading.ts). Deterministic checks run first;
// the AI grader is only called for free-response answers (and numeric answers we cannot read).
// Dependency-free so `functions/` can compile it without the Next.js toolchain.

import {
  convert,
  isDimensionless,
  parseQuantity,
  parseUnit,
  sameDims,
  type ParsedQuantity,
  type Unit,
} from "./units";

export type QuestionType = "text" | "short-answer" | "multiple-choice" | "true-false" | "numeric";

export interface GradableQuestion {
  id: string;
  text: string;
  type?: string;
  /** Missing means 10 (legacy default). 0 is a real, ungraded-for-points question. */
  points?: number;
  /** MC: option text. TF: "True"/"False". Numeric: "12.5 m/s". Text/short-answer: reference answer. */
  correctAnswer?: string;
  options?: string[];
  /** Numeric only: relative tolerance in percent. Defaults to DEFAULT_TOLERANCE_PERCENT. */
  tolerance?: number;
  /** Numeric only: expected significant figures. Unset means sig figs are not checked. */
  sigFigs?: number;
  [field: string]: unknown;
}

export interface SubmittedAnswer {
  questionId: string;
  answer?: unknown;
  [field: string]: unknown;
}

export type GradingMethod = "exact" | "numeric" | "ai" | "none";

export interface AiGradeInput {
  question: string;
  answer: string;
  /** The teacher's expected answer for this question, when there is one. */
  reference?: string;
  /** The assignment-wide rubric, when there is one. */
  rubric?: string;
}

export interface AiGradeOutput {
  /** 0..10 */
  score: number;
  feedback: string;
  reasoning: string;
  misconceptions?: string[];
  needsReview?: boolean;
  reviewReason?: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export type AiGrader = (input: AiGradeInput) => Promise<AiGradeOutput>;

export const DEFAULT_POINTS = 10;
export const DEFAULT_TOLERANCE_PERCENT = 3;
/** Right number, missing or wrong unit. AP rubrics usually withhold the point; we give half and say why. */
export const UNIT_ERROR_CREDIT = 0.5;
/** Correct value, sig figs off by more than one from what the question asked for. */
export const SIG_FIG_CREDIT = 0.9;
/** Numeric answers without any number this long (in words) go to the AI grader instead of scoring 0. */
const MIN_WORDS_FOR_AI_FALLBACK = 3;

export const pointsOf = (q: Pick<GradableQuestion, "points">) =>
  typeof q.points === "number" && Number.isFinite(q.points) && q.points >= 0
    ? q.points
    : DEFAULT_POINTS;

const round2 = (n: number) => Math.round(n * 100) / 100;

// --- Deterministic checks --------------------------------------------------------------------

export interface CheckResult {
  /** 0..1 of the question's points. */
  fraction: number;
  feedback: string;
  misconceptions: string[];
}

const normaliseText = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9.\-+/ ]+/g, " ")
    .replace(/\b(the|a|an)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.$/, "");

/** MC answers are stored as option text; legacy keys may be a letter ("B") or an index ("1"). */
export function resolveChoice(key: string, options: string[] = []): string {
  const k = key.trim();
  const exact =
    options.find((o) => o.trim() === k) ??
    options.find((o) => o.trim().toLowerCase() === k.toLowerCase());
  if (exact) return exact;
  if (/^[A-Ja-j]$/.test(k) && options[k.toUpperCase().charCodeAt(0) - 65])
    return options[k.toUpperCase().charCodeAt(0) - 65];
  return k;
}

export function checkChoice(answer: string, question: GradableQuestion): CheckResult {
  const key =
    question.type === "true-false"
      ? normaliseBool(question.correctAnswer || "")
      : resolveChoice(question.correctAnswer || "", question.options);
  const given =
    question.type === "true-false"
      ? normaliseBool(answer)
      : resolveChoice(answer, question.options);
  const correct = given.trim().toLowerCase() === key.trim().toLowerCase();
  return {
    fraction: correct ? 1 : 0,
    feedback: correct ? "Correct." : "Incorrect.",
    misconceptions: [],
  };
}

function normaliseBool(s: string): string {
  const v = s.trim().toLowerCase();
  if (["true", "t", "yes"].includes(v)) return "True";
  if (["false", "f", "no"].includes(v)) return "False";
  return s.trim();
}

/** Within `tolerancePct` percent of `expected` (or exactly equal when expected is 0). */
function close(actual: number, expected: number, tolerancePct: number, slack = 0): boolean {
  const diff = Math.abs(actual - expected);
  if (diff <= slack) return true;
  if (expected === 0) return diff <= 1e-12;
  return diff / Math.abs(expected) <= tolerancePct / 100;
}

/** Parses a numeric answer key. Undefined when the key is not a single number with an optional known unit. */
export function parseNumericKey(key: string | undefined): ParsedQuantity | undefined {
  if (!key) return undefined;
  const q = parseQuantity(key);
  if (!q || q.trailingText) return undefined;
  // "Newton's 3rd law" would read as no number; "3 apples" leaves trailing text. Both are not numeric keys.
  return q;
}

/**
 * Grades a numeric answer against a key like "12.5 m/s". Returns undefined when the answer has no
 * number at all, so the caller can decide between 0 and the AI grader.
 *
 * Policy (documented in docs/grading.md):
 * - Value within tolerance after unit conversion (km/h vs m/s is fine): full credit.
 * - Value right in the key's unit but the unit is missing, of the wrong kind (J for W), or names a
 *   different amount (12.5 km/h for 12.5 m/s): UNIT_ERROR_CREDIT.
 * - Wrong sign or off by a power of ten: 0, with a hint naming the likely slip.
 * - Sig figs are only checked when the question sets `sigFigs`.
 * A rounded answer counts when the key lies within half a unit of the student's last digit and
 * the student gave at least 2 significant figures ("12" for 12.47).
 */
export function checkNumeric(answer: string, question: GradableQuestion): CheckResult | undefined {
  const key = parseNumericKey(question.correctAnswer);
  if (!key) throw new Error(`Question ${question.id} has no valid numeric answer key`);
  const given = parseQuantity(answer);
  if (!given) return undefined;

  const tolerance =
    typeof question.tolerance === "number" && question.tolerance >= 0
      ? question.tolerance
      : DEFAULT_TOLERANCE_PERCENT;
  const roundingSlack = (q: ParsedQuantity) => ((q.sigFigs ?? 0) >= 2 ? q.halfLastPlace : 0);
  const keyUnit = key.unit && !isDimensionless(key.unit) ? key.unit : undefined;
  const givenUnit =
    given.unit && !(isDimensionless(given.unit) && given.unit.factor === 1)
      ? given.unit
      : undefined;

  // The student's value expressed in the key's unit, when that is possible.
  let inKeyUnit: number | undefined;
  let slack = roundingSlack(given);
  let unitProblem: "missing" | "wrong-kind" | undefined;
  if (keyUnit && givenUnit) {
    if (sameDims(keyUnit.dims, givenUnit.dims)) {
      inKeyUnit = convert(given.value, givenUnit, keyUnit);
      slack = convert(slack, givenUnit, keyUnit);
    } else {
      unitProblem = "wrong-kind";
    }
  } else if (keyUnit && !givenUnit) {
    unitProblem = "missing";
  } else if (
    !keyUnit &&
    givenUnit &&
    key.unit &&
    isDimensionless(key.unit) &&
    isDimensionless(givenUnit)
  ) {
    // Angles: "30°" against "0.524 rad" or the other way round.
    inKeyUnit = convert(given.value, givenUnit, key.unit);
  } else {
    // Key has no unit (the question stated it): compare the bare numbers and ignore any unit written.
    inKeyUnit = given.value;
  }

  const finishWithSigFigs = (
    fraction: number,
    feedback: string,
    misconceptions: string[],
  ): CheckResult => {
    if (
      typeof question.sigFigs === "number" &&
      given.sigFigs !== undefined &&
      Math.abs(given.sigFigs - question.sigFigs) > 1
    ) {
      return {
        fraction: fraction * SIG_FIG_CREDIT,
        feedback: `${feedback} Give your answer to ${question.sigFigs} significant figures (you gave ${given.sigFigs}).`,
        misconceptions: [...misconceptions, "significant-figures"],
      };
    }
    return { fraction, feedback, misconceptions };
  };

  if (inKeyUnit !== undefined && close(inKeyUnit, key.value, tolerance, slack)) {
    return finishWithSigFigs(1, "Correct.", []);
  }

  // The number matches the key as written, but the unit does not back it up.
  const rawMatches = close(given.value, key.value, tolerance, roundingSlack(given));
  if (rawMatches && (unitProblem || (keyUnit && givenUnit))) {
    const why =
      unitProblem === "missing"
        ? "Your number is right, but it needs a unit."
        : unitProblem === "wrong-kind"
          ? `Your number is right, but "${given.unitText}" is the wrong kind of unit for this quantity.`
          : `Your number is right for a different unit: ${given.value} ${given.unitText} is not the same amount. Check your unit conversion.`;
    const tag =
      unitProblem === "missing"
        ? "unit-missing"
        : unitProblem === "wrong-kind"
          ? "unit-wrong"
          : "unit-conversion";
    return finishWithSigFigs(UNIT_ERROR_CREDIT, why, [tag]);
  }

  if (unitProblem === "wrong-kind") {
    return {
      fraction: 0,
      feedback: `"${given.unitText}" is the wrong kind of unit for this quantity. Check what the question asks for.`,
      misconceptions: ["unit-wrong"],
    };
  }

  const compare = inKeyUnit ?? given.value;
  if (key.value !== 0 && close(-compare, key.value, tolerance, slack)) {
    return {
      fraction: 0,
      feedback: "Check the sign of your answer: think about which direction is positive.",
      misconceptions: ["sign-error"],
    };
  }
  if (key.value !== 0 && compare !== 0) {
    const ratio = compare / key.value;
    const power = Math.round(Math.log10(Math.abs(ratio)));
    if (
      power !== 0 &&
      Math.abs(power) <= 9 &&
      ratio > 0 &&
      close(compare / Math.pow(10, power), key.value, tolerance, slack)
    ) {
      return {
        fraction: 0,
        feedback: `Your answer is off by a factor of 10^${power}. Check your unit prefixes and conversions (for example cm to m, or g to kg).`,
        misconceptions: ["power-of-ten"],
      };
    }
  }
  if (unitProblem === "missing") {
    return {
      fraction: 0,
      feedback: "Incorrect, and remember to include a unit.",
      misconceptions: ["unit-missing"],
    };
  }
  return {
    fraction: 0,
    feedback: "Incorrect. Recheck your setup and calculation.",
    misconceptions: [],
  };
}

/** Short answers that match the reference exactly (after normalising case and punctuation), or name the same unit. */
export function matchesReference(answer: string, reference: string): boolean {
  const a = normaliseText(answer);
  const r = normaliseText(reference);
  if (a && a === r) return true;
  const ua: Unit | undefined = parseUnit(answer.trim());
  const ur: Unit | undefined = parseUnit(reference.trim());
  return Boolean(
    ua && ur && sameDims(ua.dims, ur.dims) && Math.abs(ua.factor / ur.factor - 1) < 1e-9,
  );
}

/** Effective grading type. Legacy short answers with a numeric key ("9.8 m/s^2") are graded as numeric. */
export function effectiveType(question: GradableQuestion): QuestionType {
  const t = question.type;
  // "numerical" is the seeded waypoints' legacy name (migrated by tools/answer-key-migration.cjs).
  if (t === "numeric" || (t === "numerical" && parseNumericKey(question.correctAnswer)))
    return "numeric";
  if (t === "multiple-choice" || t === "true-false") return t;
  if (t === "short-answer" && parseNumericKey(question.correctAnswer)) return "numeric";
  if (t === "short-answer") return "short-answer";
  return "text";
}

// --- Orchestration ---------------------------------------------------------------------------

export interface GradedAnswer extends SubmittedAnswer {
  score: number;
  maxPoints: number;
  feedback: string;
  reasoning: string;
  method: GradingMethod;
  misconceptions: string[];
  /** Set when this answer needs a teacher; no score is final until they decide. */
  reviewFlag?: string;
  aiSuggestedScore?: number;
}

export interface SubmissionGrade {
  answers: (GradedAnswer | SubmittedAnswer)[];
  earnedPoints: number;
  totalPoints: number;
  /** Percent, rounded. */
  score: number;
  reviewReasons: string[];
  usage: { inputTokens: number; outputTokens: number };
  aiCalls: number;
}

export interface GradeOptions {
  /** Absent when AI grading is unavailable (no budget): AI-needing answers are flagged for review. */
  aiGrader?: AiGrader;
  globalRubric?: string;
  concurrency?: number;
  /** Feedback for AI answers that came back without any. */
  defaultFeedback?: string;
}

/** True when grading these answers might call the AI grader. Lets callers skip the budget check. */
export function needsAi(questions: GradableQuestion[], answers: SubmittedAnswer[]): boolean {
  return answers.some((ans) => {
    const q = questions.find((x) => x.id === ans.questionId);
    if (!q || typeof ans.answer !== "string" || !ans.answer.trim()) return false;
    const type = effectiveType(q);
    if (type === "text") return true;
    if (type === "short-answer") return !matchesReference(ans.answer, q.correctAnswer || "");
    if (type === "numeric")
      return (
        !parseQuantity(ans.answer) &&
        ans.answer.trim().split(/\s+/).length >= MIN_WORDS_FOR_AI_FALLBACK
      );
    return false;
  });
}

async function mapLimited<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;
  let firstError: unknown;
  const worker = async () => {
    while (!failed && next < items.length) {
      const i = next++;
      try {
        results[i] = await fn(items[i]);
      } catch (error) {
        if (!failed) {
          failed = true;
          firstError = error;
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  if (failed) throw firstError;
  return results;
}

/**
 * Grades every answer. AI failures (provider errors, invalid replies) reject the whole call so the
 * caller routes the submission to teacher review; suspected injection or missing AI budget flags
 * just that answer. Questions with no submitted answer still count toward the total.
 */
export async function gradeSubmissionAnswers(
  questions: GradableQuestion[],
  answers: SubmittedAnswer[],
  options: GradeOptions = {},
): Promise<SubmissionGrade> {
  const totalPoints = round2(questions.reduce((sum, q) => sum + pointsOf(q), 0));
  const usage = { inputTokens: 0, outputTokens: 0 };
  let aiCalls = 0;

  const gradeOne = async (ans: SubmittedAnswer): Promise<GradedAnswer | SubmittedAnswer> => {
    const question = questions.find((q) => q.id === ans.questionId);
    if (!question) return ans;
    const maxPoints = pointsOf(question);
    const text = typeof ans.answer === "string" ? ans.answer : "";
    const base = { ...ans, maxPoints, reasoning: "", misconceptions: [] as string[] };
    const fromCheck = (check: CheckResult, method: GradingMethod): GradedAnswer => ({
      ...base,
      score: round2(check.fraction * maxPoints),
      feedback: check.feedback,
      misconceptions: check.misconceptions,
      method,
    });

    if (!text.trim())
      return { ...base, score: 0, feedback: "No answer submitted.", method: "none" };

    const type = effectiveType(question);
    if (type === "multiple-choice" || type === "true-false") {
      if (!question.correctAnswer)
        return {
          ...base,
          score: 0,
          feedback: "",
          method: "none",
          reviewFlag: "No answer key; teacher review required",
        };
      return fromCheck(checkChoice(text, question), "exact");
    }

    const reference = question.correctAnswer?.trim() || undefined;
    if (type === "numeric") {
      if (!parseNumericKey(question.correctAnswer)) {
        return {
          ...base,
          score: 0,
          feedback: "",
          method: "none",
          reviewFlag: "Numeric answer key is missing or unreadable; teacher review required",
        };
      }
      const check = checkNumeric(text, question);
      if (check) return fromCheck(check, "numeric");
      if (text.trim().split(/\s+/).length < MIN_WORDS_FOR_AI_FALLBACK) {
        return {
          ...base,
          score: 0,
          feedback:
            "We couldn't find a number in your answer. Enter a value with its unit, like 12.5 m/s.",
          method: "numeric",
        };
      }
      // A worded answer ("twelve and a half metres per second"): let the AI read it against the key.
    } else if (type === "short-answer" && reference && matchesReference(text, reference)) {
      return { ...base, score: maxPoints, feedback: "Correct.", method: "exact" };
    }

    if (!options.aiGrader) {
      return {
        ...base,
        score: 0,
        feedback: "",
        method: "ai",
        reviewFlag: "AI grading unavailable; teacher review required",
      };
    }
    aiCalls++;
    const result = await options.aiGrader({
      question: question.text,
      answer: text,
      reference,
      rubric: options.globalRubric || undefined,
    });
    if (result.usage) {
      usage.inputTokens += result.usage.inputTokens;
      usage.outputTokens += result.usage.outputTokens;
    }
    const suggested = round2((result.score / 10) * maxPoints);
    if (result.needsReview) {
      return {
        ...base,
        score: 0,
        feedback: "",
        method: "ai",
        misconceptions: result.misconceptions || [],
        reviewFlag: result.reviewReason || "Teacher review required",
        aiSuggestedScore: suggested,
      };
    }
    return {
      ...base,
      score: suggested,
      feedback: result.feedback || options.defaultFeedback || "No feedback provided.",
      reasoning: result.reasoning || "",
      misconceptions: result.misconceptions || [],
      method: "ai",
    };
  };

  const graded = await mapLimited(answers, options.concurrency ?? 3, gradeOne);
  const reviewReasons = graded.flatMap((a) =>
    typeof (a as GradedAnswer).reviewFlag === "string"
      ? [(a as GradedAnswer).reviewFlag as string]
      : [],
  );
  const earnedPoints = round2(
    graded.reduce(
      (sum, a) =>
        sum + (typeof (a as GradedAnswer).score === "number" ? (a as GradedAnswer).score : 0),
      0,
    ),
  );
  return {
    answers: graded,
    earnedPoints,
    totalPoints,
    score: totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0,
    reviewReasons,
    usage,
    aiCalls,
  };
}
