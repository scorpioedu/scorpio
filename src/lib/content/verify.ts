// The answer-key verifier: every check a problem must pass before it is marked "verified" and may be
// published without a person re-solving it. One function per check, and verifyProblem to run them
// all. Pure (no AI, no Firestore, no files): tools/verify-content.cjs feeds it the content files and
// the publish route asks it whether a stored verification still describes the problem.
//
// The checks, by the name each has in Verification.checks:
//   recompute            the spec's expression gives the key (numeric problems)
//   spec-matches-text    the spec's givens are the numbers in the text, and no number is left over
//   solution-consistent  the key's number appears in the worked solution
//   grader-round-trip    the real grader gives the key full credit and every distractor none
//   mc-quantity          the spec picks the keyed option and no other (multiple choice with a spec)
//   blind-solves         at least two solvers who never saw the key agree with it
//   near-duplicate       no other problem of the set is the same calculation in the same words
//   not-stale            a stored verification was made for the text as it is now
//   basis                not a check: what the verdict rests on ("spec" or "solver-agreement-only")
// docs/content-pipeline.md has the longer description.

import { createHash } from "node:crypto";
import { DEFAULT_AP_COURSE, isApCourseId, type ApCourseId } from "@/data/ap";
import {
  DEFAULT_TOLERANCE_PERCENT,
  checkChoice,
  checkNumeric,
  parseNumericKey,
} from "../../../functions/src/grading-core";
import {
  fromSI,
  normaliseMathText,
  parseQuantity,
  parseUnit,
  sameDims,
  toSI,
  type ParsedQuantity,
  type Unit,
} from "../../../functions/src/units";
import {
  answerAgrees,
  validateDraftProblem,
  type DraftProblem,
  type Verification,
} from "./problem-format";
import {
  evaluateSpec,
  evaluateSpecExpr,
  parseSpecUnit,
  specLiterals,
  specShape,
  specShapeErrors,
  type ProblemSpec,
  type SpecResult,
} from "./spec";

/** The key must be within this of the recomputed answer (the grader's own default is 3%). */
export const RECOMPUTE_TOLERANCE = 0.005;
/**
 * A key written to few digits may be further off than RECOMPUTE_TOLERANCE if it is the answer
 * correctly rounded and no more than this share of the grading tolerance away (2% at the default
 * 3%), so that a student's unrounded answer still sits inside what the grader accepts with room to
 * spare. "11 N" for 11.2 N passes; "1.0 m/s" for 1.04 m/s does not.
 */
export const ROUNDED_KEY_SHARE = 2 / 3;
/** Two routes to the same answer (`alt`) must agree this closely; each is rounded on the way. */
export const ALT_TOLERANCE = 0.01;
/** Blind solvers that must agree with the key. */
export const SOLVERS_NEEDED = 2;
/** Text similarity (0..1) from which two problems with the same calculation count as duplicates. */
export const DUPLICATE_SIMILARITY = 0.6;
/** Text similarity from which two problems count as duplicates whatever their specs say. */
export const DUPLICATE_SIMILARITY_TEXT_ONLY = 0.85;

export interface CheckOutcome {
  pass: boolean;
  detail?: string;
  /** True when the check could not be made for want of evidence (no spec, too few solvers). */
  missing?: boolean;
}

/** One blind solve: who, and what they answered. `textHash` is the version of the problem they saw. */
export interface SolverAnswer {
  id: string;
  answer: string;
  textHash?: string;
}

/** What verifyProblem needs of a draft; a ContentDraft or a record from a content file both fit. */
export interface VerifiableDraft {
  id?: string;
  course?: unknown;
  apTopic?: string;
  problem?: DraftProblem | null;
  reviewKind?: string | null;
  verification?: Verification | null;
}

export interface VerifyContext {
  /** The other problems of the same set, for the near-duplicate check. */
  siblings?: VerifiableDraft[];
  /** Timestamp for the record (defaults to now). */
  now?: string;
}

/**
 * "verified": every check passed. "failed": a check contradicts the problem. "incomplete": nothing
 * is wrong, but evidence is missing (a numeric problem without a spec, fewer than two blind solves).
 */
export type Verdict = "verified" | "failed" | "incomplete";

export interface VerifyResult {
  verification: Verification;
  verdict: Verdict;
  /** Names of the checks that failed. */
  failed: string[];
  /** Names of the checks that could not be made. */
  missing: string[];
}

const pass = (detail?: string): CheckOutcome => ({ pass: true, ...(detail ? { detail } : {}) });
const fail = (detail: string): CheckOutcome => ({ pass: false, detail });
const missing = (detail: string): CheckOutcome => ({ pass: false, detail, missing: true });

const near = (a: number, b: number, rel = 1e-9) =>
  Math.abs(a - b) <= rel * Math.max(Math.abs(a), Math.abs(b), Number.MIN_VALUE);

/** A number for a message: 6 significant figures, no trailing zeros. */
const show = (n: number) => String(Number(n.toPrecision(6)));

// --- Hash -------------------------------------------------------------------------------------

/** Keys sorted at every level, so the hash does not depend on the order a database returns them in. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.keys(value as object)
      .sort()
      .map((k) => [k, canonical((value as Record<string, unknown>)[k])]);
  return value;
}

/**
 * The hash a verification is bound to: the problem's text, options, key and spec. Changing any of
 * them makes a stored verification stale. The solution, distractors and points are not part of it.
 */
export function contentHash(
  problem: Pick<DraftProblem, "text" | "correctAnswer" | "options" | "spec">,
): string {
  const parts = [
    problem.text,
    problem.options ?? null,
    problem.correctAnswer,
    problem.spec ? canonical(problem.spec) : null,
  ];
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

// --- Numbers in running text --------------------------------------------------------------------

export interface TextNumber {
  value: number;
  /** As written, without the unit. */
  raw: string;
  /** The unit that follows, when one can be read ("0.80 m", "35.0 degrees", "25%"). */
  unit?: Unit;
  /**
   * True for a small whole number that names something ("Disk 2", "fragment 1") rather than
   * measuring it. Labels are never reported as unused.
   */
  label: boolean;
  /** Half of one unit in the last digit written, when at least two significant figures were given; else 0. */
  roundingSlack: number;
}

const MANTISSA = String.raw`(?:\d{1,3}(?:,\d{3})+(?!\d)|\d+)(?:\.\d+)?|\.\d+`;
const TIMES_TEN = String.raw`\s*(?:×|x|X|\*|·)\s*10\s*\^\s*\(?\s*([+-]?\d+)\s*\)?`;
const E_NOTATION = String.raw`[eE]([+-]?\d+)(?![A-Za-z0-9.])`;
const POWER_OF_TEN = String.raw`\s*\^\s*\(?\s*([+-]?\d+)\s*\)?`;

/** The unit written after a number, if any. `rest` is the text straight after the number. */
function unitAfter(rest: string): Unit | undefined {
  const temperature = { temperature: true };
  // Attached: "25%", "38.0°", "20cm". A single attached letter is algebra ("2R", "6.0t"), not a unit.
  const attached = rest.match(/^(?:°\s?C\b|[°%]|[A-Za-zΩµμ]{2,}(?![A-Za-z0-9^(_]))/);
  if (attached) return parseUnit(attached[0], temperature);
  // "2.0-cm-tall"
  const hyphen = rest.match(/^-([A-Za-zΩµμ]+)(?=-)/);
  if (hyphen) return parseUnit(hyphen[1], temperature);
  if (!/^ \S/.test(rest)) return undefined;
  const words: string[] = [];
  for (const word of rest.trim().split(/\s+/).slice(0, 4)) {
    const bare = word.replace(/[.,;:?!)]+$/, "");
    if (!bare) break;
    words.push(bare);
    if (bare !== word) break; // punctuation ends the phrase
  }
  for (let n = words.length; n > 0; n--) {
    const unit = parseUnit(words.slice(0, n).join(" "), temperature);
    if (unit) return unit;
  }
  return undefined;
}

/**
 * Every number written in a piece of problem or solution text, with scientific notation read as one
 * number ("3.0 x 10^8", "3.0e8", "6.42 * 10^23", "10^-7"). Left out: exponents ("m/s^2"), digits that
 * are part of a name ("m1", "x_0", "lithium-7") and ordinals ("3rd"). Signs are not read; compare
 * magnitudes.
 */
export function textNumbers(
  text: string,
  opts: { joinSpacedThousands?: boolean } = {},
): TextNumber[] {
  let t = normaliseMathText(text ?? "");
  // "76 800 J" in a solution is one number.
  if (opts.joinSpacedThousands) t = t.replace(/(?<![\d.,])(\d{1,3}) (?=\d{3}(?![\d]))/g, "$1");
  const pattern = new RegExp(`(${MANTISSA})(?:${TIMES_TEN}|${E_NOTATION}|(${POWER_OF_TEN}))?`, "g");
  const out: TextNumber[] = [];
  for (let m = pattern.exec(t); m; m = pattern.exec(t)) {
    const before = t.slice(0, m.index);
    const mantissa = m[1];
    let raw = m[0];
    const plain = mantissa.replace(/,/g, "");
    let value = Number(plain);
    // Through the decimal string, so that "6.42 * 10^23" is exactly the number 6.42e23.
    if (m[2] !== undefined) value = Number(`${plain}e${Number(m[2])}`);
    else if (m[3] !== undefined) value = Number(`${plain}e${Number(m[3])}`);
    else if (m[4] !== undefined) {
      // "10^-7" is a power of ten; any other "n^k" is a number followed by an exponent.
      if (mantissa === "10") value = Number(`1e${Number(m[5])}`);
      else {
        raw = mantissa;
        pattern.lastIndex = m.index + mantissa.length;
      }
    }
    const end = m.index + raw.length;
    const rest = t.slice(end);
    // Part of a name (E1, x_0, H2O), a decimal's tail, an exponent, an isotope, an ordinal.
    if (/[A-Za-z_\d]$/.test(before)) continue;
    if (/\d\.$/.test(before)) continue;
    if (/(?:\^|\*\*)\s*\(?\s*[+-]?$/.test(before)) continue;
    if (/[A-Za-z]-$/.test(before)) continue;
    if (/^(?:st|nd|rd|th)\b/.test(rest)) continue;
    if (!Number.isFinite(value)) continue;
    const unit = unitAfter(rest);
    const plainInteger = /^\d$/.test(raw) && value >= 1;
    const label = plainInteger && !unit && /[A-Za-z]\s$/.test(before) && !/^[A-Za-z(]/.test(rest);
    const digits = mantissa.replace(/,/g, "");
    const decimals = digits.includes(".") ? digits.split(".")[1].length : 0;
    const significant = digits.replace(".", "").replace(/^0+/, "");
    // As the grader counts them: the trailing zeros of "1200" are not certain digits.
    const sigFigs = decimals ? significant.length : significant.replace(/0+$/, "").length;
    const roundingSlack =
      sigFigs >= 2 && Number(digits) !== 0
        ? (0.5 * Math.abs(value)) / Number(digits) / Math.pow(10, decimals)
        : 0;
    out.push({ value, raw, ...(unit ? { unit } : {}), label, roundingSlack });
  }
  return out;
}

/** Is the text number this quantity? Either the same number as written, or the same amount in another unit. */
function sameQuantity(n: TextNumber, value: number, unit: Unit | undefined): boolean {
  if (near(Math.abs(n.value), Math.abs(value))) return true;
  if (!n.unit || !unit || !sameDims(n.unit.dims, unit.dims)) return false;
  return near(Math.abs(toSI(n.value, n.unit)), Math.abs(toSI(value, unit)));
}

// --- Spec evaluation shared by the checks -------------------------------------------------------

/**
 * evaluateSpec plus the two things a single evaluation cannot show: every `alt` route agrees with
 * the main expression, and the answer does not depend on the values chosen for symbolic givens.
 */
export function computeSpec(spec: ProblemSpec): SpecResult {
  const shape = specShapeErrors(spec);
  if (shape.length) return { ok: false, error: shape.join("; ") };
  const main = evaluateSpec(spec);
  if (!main.ok) return main;
  const agree = (a: number, b: number, tolerance: number) =>
    Math.abs(a - b) <= tolerance * Math.max(Math.abs(a), Math.abs(b)) || Math.abs(a - b) < 1e-12;
  for (const alt of spec.alt ?? []) {
    const other = evaluateSpecExpr(spec, alt);
    if (!other.ok) return { ok: false, error: `Alternative route: ${other.error}` };
    if (!agree(other.value, main.value, ALT_TOLERANCE))
      return {
        ok: false,
        error: `Two routes disagree: "${spec.expr}" gives ${show(main.value)} but "${alt}" gives ${show(other.value)} ${spec.unit}. The data contradict each other`,
      };
  }
  const symbols = Object.entries(spec.givens).filter(([, g]) => g.symbol !== undefined);
  if (symbols.length) {
    const changed: ProblemSpec = { ...spec, givens: { ...spec.givens } };
    symbols.forEach(([name, g], i) => {
      changed.givens[name] = { ...g, value: g.value * (1.37 + 0.29 * i) + 0.11 };
    });
    const again = evaluateSpec(changed);
    if (!again.ok || !agree(again.value, main.value, 1e-9))
      return {
        ok: false,
        error: `The answer depends on the value chosen for ${symbols.map(([n]) => n).join(", ")}, which the text gives only as symbols`,
      };
  }
  return main;
}

/** One unit in the last significant digit of a key as written ("12.5" -> 0.1, "1200" -> 100). */
function lastPlace(key: ParsedQuantity): number {
  if (key.sigFigs && key.value !== 0)
    return Math.pow(10, Math.floor(Math.log10(Math.abs(key.value))) - key.sigFigs + 1);
  return 2 * key.halfLastPlace;
}

/** The spec's result in the unit a quantity (a key or an option) is written in. */
function inUnitOf(
  result: { value: number; unit: string },
  target: ParsedQuantity,
): { value: number } | { error: string } {
  const specUnit = parseSpecUnit(result.unit);
  if (!specUnit) return { error: `Unknown unit "${result.unit}"` };
  // No unit on the key: the question states it ("give your answer in degrees"), so compare numbers.
  if (!target.unit) return { value: result.value };
  if (!sameDims(target.unit.dims, specUnit.dims))
    return {
      error: `The spec's unit "${result.unit}" and "${target.unitText}" are different kinds of quantity`,
    };
  return { value: fromSI(toSI(result.value, specUnit), target.unit) };
}

/**
 * Does a recomputed value match a written quantity, in value and in the digits it claims?
 * Within RECOMPUTE_TOLERANCE and not more than one unit off in the last digit written. A key with few
 * digits ("0.16 T" for 0.1587) may be further away when it is the value correctly rounded and still
 * within ROUNDED_KEY_SHARE of the grading tolerance.
 */
function matchesWritten(
  value: number,
  written: ParsedQuantity,
  tolerancePct: number = DEFAULT_TOLERANCE_PERCENT,
): { ok: boolean; why?: string } {
  const diff = Math.abs(value - written.value);
  const place = lastPlace(written);
  if (written.value === 0)
    return diff <= Math.max(place / 2, 1e-9) ? { ok: true } : { ok: false, why: "is not zero" };
  // Relative to the recomputed answer, which is the one taken to be right.
  const rel = value === 0 ? Infinity : diff / Math.abs(value);
  if (rel > RECOMPUTE_TOLERANCE * (1 + 1e-9)) {
    const rounded = place > 0 && diff <= (place / 2) * (1 + 1e-9);
    if (rounded && rel <= (tolerancePct / 100) * ROUNDED_KEY_SHARE) return { ok: true };
    return {
      ok: false,
      why: rounded
        ? `is ${(rel * 100).toFixed(1)}% away: rounded too far for a ${tolerancePct}% grading tolerance`
        : Number.isFinite(rel)
          ? `is ${(rel * 100).toFixed(rel < 0.1 ? 2 : 0)}% away`
          : "should be zero",
    };
  }
  // Within 0.5% but off by more than one unit in the last digit written: the key claims digits it does not have.
  if (place > 0 && diff > place * (1 + 1e-9))
    return { ok: false, why: "is right to 0.5% but not to the digits the key gives" };
  return { ok: true };
}

// --- The checks -------------------------------------------------------------------------------

/** recompute: the spec's expression, evaluated with units, gives the numeric key. */
export function checkRecompute(problem: DraftProblem): CheckOutcome {
  if (!problem.spec) return missing("No spec: the key cannot be recomputed");
  const key = parseNumericKey(problem.correctAnswer);
  if (!key) return fail(`The key "${problem.correctAnswer}" is not a number with a known unit`);
  const result = computeSpec(problem.spec);
  if (!result.ok) return fail(result.error);
  const value = inUnitOf(result, key);
  if ("error" in value) return fail(value.error);
  const tolerance =
    typeof problem.tolerance === "number" && problem.tolerance >= 0
      ? problem.tolerance
      : DEFAULT_TOLERANCE_PERCENT;
  const match = matchesWritten(value.value, key, tolerance);
  const computed = `${show(value.value)}${key.unitText ? " " + key.unitText : ""}`;
  if (!match.ok)
    return fail(`The spec gives ${computed}; the key "${problem.correctAnswer}" ${match.why}`);
  return pass(`spec gives ${computed}`);
}

/**
 * spec-matches-text: every given is a number written in the text (as written, or the same amount in
 * another unit: 0.15 m for "15 cm"), a symbolic given's letter is in the text, and every number in
 * the text is used by a given, written in the expression, or listed as `extraneous`. Zero and labels
 * ("Disk 2") are never reported as unused.
 */
export function checkSpecMatchesText(problem: DraftProblem): CheckOutcome {
  const spec = problem.spec;
  if (!spec) return missing("No spec");
  const shape = specShapeErrors(spec);
  if (shape.length) return fail(shape.join("; "));
  const numbers = textNumbers(problem.text);
  const problems: string[] = [];
  const givens = Object.entries(spec.givens).map(([name, given]) => ({
    name,
    given,
    unit: parseSpecUnit(given.unit),
  }));
  for (const { name, given, unit } of givens) {
    if (given.assumed) continue;
    if (given.symbol !== undefined) {
      const symbol = given.symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (!symbol || !new RegExp(`(?<![A-Za-z0-9_])${symbol}(?![A-Za-z0-9_])`).test(problem.text))
        problems.push(`symbol "${given.symbol}" (${name}) is not in the text`);
      continue;
    }
    if (!numbers.some((n) => sameQuantity(n, given.value, unit)))
      problems.push(
        `given ${name} = ${given.value}${given.unit ? " " + given.unit : ""} is not in the text`,
      );
  }
  const literals = specLiterals(spec);
  const extraneous = spec.extraneous ?? [];
  const unused = numbers.filter(
    (n) =>
      !n.label &&
      n.value !== 0 &&
      !givens.some(
        ({ given, unit }) => given.symbol === undefined && sameQuantity(n, given.value, unit),
      ) &&
      !literals.some((l) => near(Math.abs(l), Math.abs(n.value))) &&
      !extraneous.some((x) => near(Math.abs(x), Math.abs(n.value))),
  );
  if (unused.length)
    problems.push(
      `the text has numbers the spec does not use: ${[...new Set(unused.map((n) => n.raw))].join(", ")}`,
    );
  for (const x of extraneous)
    if (!numbers.some((n) => near(Math.abs(x), Math.abs(n.value))))
      problems.push(`extraneous ${x} is not in the text`);
  return problems.length ? fail(problems.join("; ")) : pass();
}

/** Do all the options read as quantities (a number first, optionally a unit or the same words after it)? */
export function optionQuantities(problem: DraftProblem): ParsedQuantity[] | undefined {
  if (problem.type !== "multiple-choice" || !problem.options?.length) return undefined;
  const parsed = problem.options.map((o) =>
    /^\s*(?:[-+−–]|\d|\.\d|\(|≈|~)/.test(o) ? parseQuantity(o, { temperature: true }) : undefined,
  );
  return parsed.every((q): q is ParsedQuantity => !!q) ? parsed : undefined;
}

/**
 * solution-consistent: the key's number appears in the worked solution (within rounding, in any
 * notation). A solution that ends on another value is how most wrong keys were made. Multiple choice
 * is checked when its options are quantities; other keys have no number to look for.
 */
export function checkSolutionConsistent(problem: DraftProblem): CheckOutcome {
  let key: ParsedQuantity | undefined;
  if (problem.type === "numeric") key = parseNumericKey(problem.correctAnswer);
  else {
    const options = optionQuantities(problem);
    const index = problem.options?.indexOf(problem.correctAnswer) ?? -1;
    if (!options || index < 0) return pass("not applicable: the key is not a quantity");
    key = options[index];
  }
  if (!key) return fail(`The key "${problem.correctAnswer}" is not a number`);
  const solution = textNumbers(problem.solution ?? "", { joinSpacedThousands: true });
  // "1/4" in a solution is the number 0.25.
  for (const m of normaliseMathText(problem.solution ?? "").matchAll(
    /(?<![\d.\w^])(\d+)\s*\/\s*(\d+)(?!\d|\.\d|\s*\/)/g,
  ))
    if (Number(m[2]) !== 0)
      solution.push({
        value: Number(m[1]) / Number(m[2]),
        raw: m[0],
        label: false,
        roundingSlack: 0,
      });
  if (!solution.length) return fail("The solution has no numbers to check the key against");
  const slack = (key.sigFigs ?? 0) >= 2 ? key.halfLastPlace : 0;
  const target = Math.abs(key.value);
  // Either side may be the rounder one: "3.4" in the solution stands for a key of 3.45, as it would for the grader.
  const matches = (value: number, solutionSlack: number) =>
    Math.abs(Math.abs(value) - target) <=
    Math.max(RECOMPUTE_TOLERANCE * target, slack, solutionSlack, 1e-12) * (1 + 1e-9);
  const found = solution.some((n) => {
    if (matches(n.value, n.roundingSlack)) return true;
    if (!n.unit || !key!.unit || !sameDims(n.unit.dims, key!.unit.dims)) return false;
    const scale = n.unit.factor / key!.unit.factor;
    return matches(fromSI(toSI(n.value, n.unit), key!.unit), n.roundingSlack * scale);
  });
  return found
    ? pass()
    : fail(`The key "${problem.correctAnswer}" does not appear in the worked solution`);
}

/**
 * grader-round-trip: the real grading code gives the key full credit against itself and gives no
 * distractor any; a multiple-choice key is one of exactly 4 different options; and the draft passes
 * validateDraftProblem.
 */
export function checkGraderRoundTrip(
  problem: DraftProblem,
  topicId: string,
  course: ApCourseId = DEFAULT_AP_COURSE,
): CheckOutcome {
  const problems: string[] = [];
  const validation = validateDraftProblem(problem, topicId, course);
  problems.push(...validation.errors);
  if (!validation.errors.length) {
    if (!answerAgrees(problem, problem.correctAnswer))
      problems.push(`The grader does not give the key "${problem.correctAnswer}" full credit`);
    const question = {
      id: "draft",
      text: problem.text,
      type: problem.type,
      correctAnswer: problem.correctAnswer,
      options: problem.options,
      tolerance: problem.tolerance,
    };
    for (const d of problem.distractors ?? []) {
      const check =
        problem.type === "numeric"
          ? checkNumeric(d.answer, question)
          : checkChoice(d.answer, question);
      if (check && check.fraction > 0)
        problems.push(`The grader gives the distractor "${d.answer}" credit`);
      if (problem.type === "multiple-choice" && !problem.options?.includes(d.answer))
        problems.push(`The distractor "${d.answer}" is not one of the options`);
    }
  }
  if (problem.type === "multiple-choice") {
    const options = problem.options ?? [];
    const unique = new Set(options.map((o) => o.trim().toLowerCase()));
    if (options.length !== 4) problems.push(`Multiple choice has ${options.length} options, not 4`);
    if (unique.size !== options.length) problems.push("Options repeat");
    if (options.filter((o) => o === problem.correctAnswer).length !== 1)
      problems.push("The key is not exactly one of the options");
  }
  return problems.length ? fail([...new Set(problems)].join("; ")) : pass();
}

/**
 * mc-quantity: for multiple choice with a spec, the recomputed answer is the keyed option and is not
 * within tolerance of any other option.
 */
export function checkMcQuantity(problem: DraftProblem): CheckOutcome {
  if (!problem.spec) return missing("No spec");
  const options = optionQuantities(problem);
  if (!options)
    return fail(
      "The problem has a spec but its options are not quantities; a spec cannot pick one",
    );
  const result = computeSpec(problem.spec);
  if (!result.ok) return fail(result.error);
  // "1.5 m*v^2" against a pure number: the letters are algebra, the same in every option, not a unit.
  const specUnit = parseSpecUnit(result.unit);
  const algebraic =
    !!specUnit &&
    sameDims(specUnit.dims, [0, 0, 0, 0, 0, 0, 0]) &&
    options.every(
      (o) => o.unitText === options[0].unitText && o.trailingText === options[0].trailingText,
    );
  const selected: string[] = [];
  for (const [i, option] of options.entries()) {
    const value = algebraic ? { value: result.value } : inUnitOf(result, option);
    if ("error" in value) return fail(`Option "${problem.options![i]}": ${value.error}`);
    if (matchesWritten(value.value, option).ok) selected.push(problem.options![i]);
  }
  const computed = `${show(result.value)}${result.unit ? " " + result.unit : ""}`;
  if (!selected.length) return fail(`The spec gives ${computed}, which is none of the options`);
  if (selected.length > 1)
    return fail(
      `The spec gives ${computed}, which fits more than one option: ${selected.join(" | ")}`,
    );
  if (selected[0] !== problem.correctAnswer)
    return fail(
      `The spec gives ${computed}: option "${selected[0]}", not the key "${problem.correctAnswer}"`,
    );
  return pass(`spec gives ${computed}`);
}

/**
 * blind-solves: at least SOLVERS_NEEDED solvers who were not shown the key agree with it, judged by
 * the real grader, and they outnumber those who disagree. Multiple-choice answers are option text
 * (tools/verify-content.cjs turns the letter a solver chose on a shuffled sheet back into the text).
 * One answer counts per solver id (the last); answers given for another version of the text do not count.
 */
export function checkBlindSolves(
  problem: DraftProblem,
  solverAnswers: SolverAnswer[],
): { outcome: CheckOutcome; solvers: Verification["solvers"] } {
  const hash = contentHash(problem);
  const current = new Map<string, SolverAnswer>();
  let stale = 0;
  for (const s of solverAnswers ?? []) {
    if (!s || typeof s.id !== "string" || typeof s.answer !== "string") continue;
    if (s.textHash !== undefined && s.textHash !== hash) stale++;
    else current.set(s.id, s);
  }
  const solvers = [...current.values()].map((s) => {
    let agrees = false;
    try {
      agrees = answerAgrees(problem, s.answer);
    } catch {
      // No valid key to grade against; grader-round-trip reports it.
    }
    return { id: s.id, answer: s.answer, agrees };
  });
  const agree = solvers.filter((s) => s.agrees).length;
  const disagree = solvers.length - agree;
  const tally =
    `${agree} of ${solvers.length} solvers agree` +
    (stale ? `; ${stale} answered an earlier version of the text` : "");
  let outcome: CheckOutcome;
  if (agree >= SOLVERS_NEEDED && agree > disagree) outcome = pass(tally);
  else if (disagree > 0 && disagree >= agree)
    outcome = fail(
      `${tally}: ${solvers
        .filter((s) => !s.agrees)
        .map((s) => `${s.id} answered "${s.answer}"`)
        .join("; ")}`,
    );
  else outcome = missing(`${tally}; ${SOLVERS_NEEDED} are needed`);
  return { outcome, solvers };
}

/** Word 3-grams of a text with every number blanked, for comparing two problems' wording. */
function shingles(text: string): Set<string> {
  const words = normaliseMathText(text ?? "")
    .toLowerCase()
    .replace(/\d+(?:\.\d+)?/g, "#")
    .split(/[^a-z#]+/)
    .filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + 2 < words.length; i++) out.add(words.slice(i, i + 3).join(" "));
  return out;
}

/** 0..1: the share of three-word runs two texts have in common, numbers aside. */
export function textSimilarity(a: string, b: string): number {
  const x = shingles(a);
  const y = shingles(b);
  if (!x.size || !y.size) return 0;
  let common = 0;
  for (const s of x) if (y.has(s)) common++;
  return common / (x.size + y.size - common);
}

/**
 * near-duplicate: no other problem of the set is the same calculation (the same spec shape) in nearly
 * the same words, or, whatever the specs say, almost word for word the same.
 */
export function checkNearDuplicate(
  draft: VerifiableDraft,
  siblings: VerifiableDraft[],
): CheckOutcome {
  const problem = draft.problem;
  if (!problem) return pass();
  const shape = problem.spec ? specShape(problem.spec) : undefined;
  const twins: string[] = [];
  for (const other of siblings) {
    if (other === draft || !other.problem || (draft.id !== undefined && other.id === draft.id))
      continue;
    const similarity = textSimilarity(problem.text, other.problem.text);
    const sameShape =
      shape !== undefined && !!other.problem.spec && specShape(other.problem.spec) === shape;
    if (
      similarity >= DUPLICATE_SIMILARITY_TEXT_ONLY ||
      (sameShape && similarity >= DUPLICATE_SIMILARITY)
    )
      twins.push(
        `${other.id ?? "another problem"} (${Math.round(similarity * 100)}% the same words${sameShape ? ", same calculation" : ""})`,
      );
  }
  return twins.length ? fail(`Near-duplicate of ${twins.join(", ")}`) : pass();
}

/** not-stale: a verification already stored on the draft was made for the problem as it is now. */
export function checkNotStale(draft: VerifiableDraft): CheckOutcome {
  if (!draft.problem || !draft.verification) return pass();
  return draft.verification.textHash === contentHash(draft.problem)
    ? pass()
    : fail("The problem changed after it was verified; it must be solved and verified again");
}

// --- Everything together ------------------------------------------------------------------------

/** The checks that need no solver: what can be said about a draft from its own content. */
export function deterministicChecks(
  draft: VerifiableDraft,
  context: VerifyContext = {},
): Record<string, CheckOutcome> {
  const problem = draft.problem;
  if (!problem) return { "grader-round-trip": fail("The draft has no problem") };
  const course = isApCourseId(draft.course) ? draft.course : DEFAULT_AP_COURSE;
  const checks: Record<string, CheckOutcome> = {};
  if (problem.type === "numeric") {
    checks["recompute"] = checkRecompute(problem);
    if (problem.spec) checks["spec-matches-text"] = checkSpecMatchesText(problem);
  } else if (problem.spec) {
    checks["mc-quantity"] = checkMcQuantity(problem);
    checks["spec-matches-text"] = checkSpecMatchesText(problem);
  }
  checks["solution-consistent"] = checkSolutionConsistent(problem);
  checks["grader-round-trip"] = checkGraderRoundTrip(
    problem,
    draft.apTopic ?? problem.apTopic,
    course,
  );
  checks["near-duplicate"] = checkNearDuplicate(draft, context.siblings ?? []);
  return checks;
}

/**
 * Runs every check on one draft. `solverAnswers` are the blind solves recorded for it. Returns the
 * Verification record (to store only when the verdict is "verified") and the verdict.
 *
 * A numeric problem needs a spec. Multiple choice without one (conceptual questions, options that are
 * not quantities) rests on the blind solves alone and is marked checks.basis.detail =
 * "solver-agreement-only" so such problems can be counted.
 */
export function verifyProblem(
  draft: VerifiableDraft,
  solverAnswers: SolverAnswer[] = [],
  context: VerifyContext = {},
): VerifyResult {
  const outcomes = deterministicChecks(draft, context);
  const problem = draft.problem;
  let solvers: Verification["solvers"] = [];
  if (problem) {
    const blind = checkBlindSolves(problem, solverAnswers);
    outcomes["blind-solves"] = blind.outcome;
    solvers = blind.solvers;
    outcomes["not-stale"] = checkNotStale(draft);
    outcomes["basis"] = pass(
      problem.type === "multiple-choice" && !problem.spec ? "solver-agreement-only" : "spec",
    );
  }
  const failed = Object.keys(outcomes).filter((k) => !outcomes[k].pass && !outcomes[k].missing);
  const lacking = Object.keys(outcomes).filter((k) => outcomes[k].missing);
  const checks: Verification["checks"] = {};
  for (const [name, o] of Object.entries(outcomes))
    checks[name] = { pass: o.pass, ...(o.detail ? { detail: o.detail } : {}) };
  return {
    verification: {
      textHash: problem ? contentHash(problem) : "",
      checks,
      solvers,
      verifiedAt: context.now ?? new Date().toISOString(),
    },
    verdict: failed.length ? "failed" : lacking.length ? "incomplete" : "verified",
    failed,
    missing: lacking,
  };
}

/**
 * Is a draft marked "verified" still entitled to the mark? Its stored verification must be for the
 * problem as it is now, every check in it must have passed, and it must hold the blind solves.
 * The publish route asks this; nothing here re-runs a check.
 */
export function verificationIsCurrent(draft: VerifiableDraft): boolean {
  const v = draft.verification;
  if (!draft.problem || !v || typeof v !== "object") return false;
  if (typeof v.textHash !== "string" || v.textHash !== contentHash(draft.problem)) return false;
  const checks = Object.values(v.checks ?? {});
  if (!checks.length || checks.some((c) => !c || c.pass !== true)) return false;
  return (v.solvers ?? []).filter((s) => s && s.agrees === true).length >= SOLVERS_NEEDED;
}

// --- Blind solve sheets -------------------------------------------------------------------------

/** The order a solver sees a problem's options in: fixed for one solver and problem, different between solvers. */
export function shuffledOptions(options: string[], solverId: string, draftId: string): string[] {
  const rank = (option: string, i: number) =>
    createHash("sha256").update(`${solverId}\n${draftId}\n${i}\n${option}`).digest("hex");
  return options
    .map((option, i) => ({ option, key: rank(option, i) }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((x) => x.option);
}

/** What a blind solver is shown: the question and, for multiple choice, the shuffled options. No key, solution or distractor tags. */
export function solveSheetEntry(draft: VerifiableDraft & { id: string }, solverId: string) {
  const problem = draft.problem!;
  return {
    id: draft.id,
    type: problem.type,
    text: problem.text,
    ...(problem.options ? { options: shuffledOptions(problem.options, solverId, draft.id) } : {}),
    textHash: contentHash(problem),
  };
}

/**
 * A solver's raw answer as the text to record. For multiple choice a letter ("B") or "B. text" is
 * read against the order that solver was shown; option text is kept as it is. Undefined when a
 * multiple-choice answer names no option.
 */
export function resolveSolverAnswer(
  draft: VerifiableDraft & { id: string },
  solverId: string,
  answer: string,
): string | undefined {
  const problem = draft.problem!;
  const raw = String(answer ?? "").trim();
  if (problem.type !== "multiple-choice" || !problem.options) return raw || undefined;
  const exact = problem.options.find((o) => o.trim().toLowerCase() === raw.toLowerCase());
  if (exact) return exact;
  const shown = shuffledOptions(problem.options, solverId, draft.id);
  const letter = raw.match(/^\(?([A-Ja-j])\)?(?:[.):]\s*([\s\S]*))?$/);
  if (!letter) return undefined;
  const byLetter = shown[letter[1].toUpperCase().charCodeAt(0) - 65];
  if (!byLetter) return undefined;
  // "B. text" must name the same option twice, or the solver's sheet was not this one.
  if (letter[2] && letter[2].trim().toLowerCase() !== byLetter.trim().toLowerCase())
    return undefined;
  return byLetter;
}
