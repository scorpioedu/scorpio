// Checks a unit's guide file: what the schema cannot say. Pure (no files, no network), so the
// command-line tool (tools/verify-guides.cjs) and the test run share it.
//
// Errors fail the run. Warnings are printed and do not.
import katex from "katex";
import { apTopic, apUnit, apUnits, compareTopicIds, misconceptionsForCourse } from "@/data/ap";
import { CURRICULA, getCurriculum } from "@/data/curricula";
import { render } from "@/lib/diagram";
import { isSafeSvg } from "@/lib/diagram/safe";
import { requiresDerivation } from "./index";
import {
  isNumericAnswer,
  unitGuideSchema,
  type GuideEquation,
  type TopicGuide,
  type WorkedExample,
  type WorkedExampleSpec,
} from "./schema";
import { expressionNames, fillTemplate, placeholders, tryItCorners } from "./try-it";
import { SPEC_CONSTANTS, SPEC_FUNCTIONS, parseSpecUnit } from "@/lib/content/spec";
import { sameQuantity, textNumbers } from "@/lib/content/verify";

/**
 * Words per topic across the prose fields: the big idea, the explanation, the derivation, the
 * worked examples (prompt, steps, answer), the misconceptions and check-yourself. Not counted:
 * the equation cards and captions (short reference text beside a formula or a picture), labels
 * (variable names, example titles), teacher notes and diagram sources. `COUNTED` is the list.
 */
const COUNTED =
  /^(bigIdea|explanation|derivation|workedExamples\[\d+\]\.(prompt|steps\[\d+\]|answer)|misconceptions\[\d+\]\.\w+|checkYourself\[\d+\]\.\w+)$/;
export const WORD_BOUNDS = { min: 400, max: 900 } as const;

// ---- Markdown: math and diagrams ---------------------------------------------------------------

const DG_FENCE = /```dg[^\n]*\n([\s\S]*?)```/g;
const ANY_FENCE = /```[\s\S]*?```/g;
const DISPLAY_MATH = /\$\$([\s\S]+?)\$\$/g;
const INLINE_MATH = /(?<!\\)\$((?:\\.|[^$\\\n])+?)\$/g;

/** The sources of the ```dg blocks in a Markdown string. */
export function diagramBlocks(markdown: string): string[] {
  return [...markdown.matchAll(DG_FENCE)].map((m) => m[1].trim());
}

export interface MathSpan {
  latex: string;
  display: boolean;
}

/**
 * The math in a Markdown string, the way remark-math reads it: `$$…$$` is display math, `$…$` is
 * inline, and `\$` is a dollar sign. Fenced and inline code are skipped. `unbalanced` is true when
 * a `$` is left over, which would swallow the text after it.
 */
export function mathSpans(markdown: string): { spans: MathSpan[]; unbalanced: boolean } {
  let rest = markdown.replace(ANY_FENCE, " ").replace(/`[^`\n]*`/g, " ");
  const spans: MathSpan[] = [];
  rest = rest.replace(DISPLAY_MATH, (_all, latex: string) => {
    spans.push({ latex: latex.trim(), display: true });
    return " ";
  });
  rest = rest.replace(INLINE_MATH, (_all, latex: string) => {
    spans.push({ latex, display: false });
    return " ";
  });
  return { spans, unbalanced: /(?<!\\)\$/.test(rest) };
}

/** null when KaTeX can typeset the string, else its message. Strict: KaTeX warnings count. */
export function latexError(latex: string, display = false): string | null {
  try {
    katex.renderToString(latex, { throwOnError: true, displayMode: display, strict: "error" });
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/**
 * Words a student reads: diagram blocks are dropped, each piece of math counts as one word, and
 * Markdown punctuation is not counted.
 */
export function countWords(markdown: string): number {
  return markdown
    .replace(ANY_FENCE, " ")
    .replace(DISPLAY_MATH, " math ")
    .replace(INLINE_MATH, " math ")
    .replace(/[*_#>`|~[\]()]/g, " ")
    .split(/\s+/)
    .filter((w) => /[A-Za-z0-9]/.test(w)).length;
}

// ---- Equations: is every symbol explained? -----------------------------------------------------

export interface SymbolToken {
  /** "p", "v", "\\theta" */
  base: string;
  /** The subscript with markup removed: "f", "avg", "1i". Empty when there is none. */
  sub: string;
}

const WRAPPERS = /\\(?:vec|hat|bar|overline|mathbf|boldsymbol|bm)\s*\{([^{}]*)\}/g;
const TEXT_COMMANDS = new Set(["text", "mathrm", "textrm", "textbf", "operatorname", "textit"]);
const GREEK = new Set(
  "alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa lambda mu nu xi rho sigma tau upsilon phi varphi chi psi omega Gamma Theta Lambda Xi Pi Phi Psi Omega".split(
    " ",
  ),
);

/** The brace group or single token starting at `i`; returns its content and where it ends. */
function group(s: string, i: number): { body: string; end: number } {
  while (s[i] === " ") i++;
  if (s[i] !== "{") {
    const cmd = s.slice(i).match(/^\\[A-Za-z]+/);
    const len = cmd ? cmd[0].length : 1;
    return { body: s.slice(i, i + len), end: i + len };
  }
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === "{") depth++;
    else if (s[j] === "}" && --depth === 0) return { body: s.slice(i + 1, j), end: j + 1 };
  }
  return { body: s.slice(i + 1), end: s.length };
}

/**
 * The symbols in a piece of LaTeX, best effort. The heuristic:
 * - a symbol is a Latin letter or a Greek command, with its subscript if it has one (`v_f`,
 *   `F_{\text{avg}}`, `m_1`); `\vec{}`, `\hat{}` and similar wrappers are looked through;
 * - `\Delta`, `\Sigma`, `\pi`, function names (`\sin`), other commands, numbers, superscripts'
 *   own markup and anything inside `\text{}` are not symbols;
 * - a `d` directly before a letter is read as a differential (`dp`, `dt`), not a symbol.
 * It cannot tell a symbol from a unit written outside `\text{}`, so units belong in `\text{}`.
 */
export function latexSymbols(latex: string): SymbolToken[] {
  let s = latex;
  for (let before = ""; before !== s;) {
    before = s;
    s = s.replace(WRAPPERS, "$1");
  }
  const out: SymbolToken[] = [];
  const push = (base: string, i: number): number => {
    let j = i;
    while (s[j] === " ") j++;
    // A superscript may sit between the symbol and its subscript: v^2_f.
    if (s[j] === "^") {
      const sup = group(s, j + 1);
      let k = sup.end;
      while (s[k] === " ") k++;
      if (s[k] === "_") j = k;
    }
    let sub = "";
    if (s[j] === "_") {
      const g = group(s, j + 1);
      sub = g.body.replace(/\\[A-Za-z]+/g, "").replace(/[{}\s,]/g, "");
      i = g.end;
    }
    out.push({ base, sub });
    return i;
  };
  for (let i = 0; i < s.length;) {
    const ch = s[i];
    if (ch === "\\") {
      const name = s.slice(i + 1).match(/^[A-Za-z]+/)?.[0];
      if (!name) {
        i += 2; // \, \; \\ and friends
        continue;
      }
      i += 1 + name.length;
      if (TEXT_COMMANDS.has(name)) i = group(s, i).end;
      else if (GREEK.has(name)) i = push(`\\${name}`, i);
      continue;
    }
    if (ch === "_") {
      i = group(s, i + 1).end; // a subscript on something that is not a symbol
      continue;
    }
    if (/[A-Za-z]/.test(ch)) {
      if (ch === "d" && /^(?:[A-Za-z]|\\[A-Za-z])/.test(s.slice(i + 1))) {
        i++;
        continue;
      }
      i = push(ch, i + 1);
      continue;
    }
    i++;
  }
  return out;
}

/**
 * Symbols an equation uses that its variable list does not explain. A listed symbol covers the
 * same symbol with the same subscript, and a listed symbol with no subscript covers every
 * subscripted form (`v` covers `v_i` and `v_f`; `v_i` alone does not cover `v_f`).
 */
export function unexplainedSymbols(equation: GuideEquation): string[] {
  const listed = equation.variables.flatMap((v) => latexSymbols(v.symbol));
  const show = (t: SymbolToken) => (t.sub ? `${t.base}_${t.sub}` : t.base);
  const missing = latexSymbols(equation.latex).filter(
    (t) => !listed.some((l) => l.base === t.base && (l.sub === "" || l.sub === t.sub)),
  );
  return [...new Set(missing.map(show))];
}

// ---- Worked examples ---------------------------------------------------------------------------

export type SpecEvaluation =
  { ok: true; value: number; unit: string } | { ok: false; error: string };
/**
 * INTEGRATION HOOK. The evaluator is `evaluateSpec` from src/lib/content/spec.ts, passed in. (This
 * file does import that module's function and constant names, for the shape check, and the problem
 * verifier's number reader.) Until it is passed (`verifyUnitGuide(data, { evaluate: evaluateSpec })`,
 * in tools/verify-guides.cjs and __tests__/guides-content.test.ts), worked examples are checked for
 * shape only.
 */
export type SpecEvaluator = (spec: WorkedExampleSpec) => SpecEvaluation;

const ANSWER_NUMBER = /(?<![\w.^_{])(-?\d+(?:\.\d+)?)(?:\s*(?:×|\\times)\s*10\^\{?(-?\d+)\}?)?/g;

/**
 * The numbers an answer states, each with the half-width of its last written digit
 * ("0.75" is 0.75 ± 0.005; "1.2 × 10^3" is 1200 ± 50).
 */
export function answerNumbers(answer: string): { value: number; tolerance: number }[] {
  return [...answer.replace(/−/g, "-").matchAll(ANSWER_NUMBER)].map((m) => {
    const decimals = m[1].split(".")[1]?.length ?? 0;
    const scale = Math.pow(10, Number(m[2] ?? 0));
    return { value: Number(m[1]) * scale, tolerance: 0.5 * Math.pow(10, -decimals) * scale };
  });
}

/** Text with LaTeX unit markup removed, so "\\text{kg}\\cdot\\text{m/s}" reads as "kg·m/s". */
function plainUnits(s: string): string {
  return s
    .replace(/\\cdot/g, "·")
    .replace(/\\(?:text|mathrm)\s*\{/g, "")
    .replace(/\\[,;! ]|[{}\s]/g, "");
}

/**
 * Problems with one worked example (empty = fine). Without an evaluator only the shape is checked:
 * a numeric answer has a spec, the spec's expression reads only its givens, and the answer names
 * the spec's unit. With one, the spec is evaluated and the answer must state that value, to the
 * digits it is written with.
 */
export function checkWorkedExample(example: WorkedExample, evaluate?: SpecEvaluator): string[] {
  const errors: string[] = [];
  const { spec } = example;
  if (!spec) {
    if (isNumericAnswer(example.answer)) errors.push("a numeric answer needs a spec");
    return errors;
  }
  const names = Object.keys(spec.givens);
  if (!names.length) errors.push("spec has no givens");
  // The spec evaluator's own functions (ln, exp, asin...) are not givens. Its constants (g, k, eps0,
  // e...) are allowed too: a given of the same name replaces one, as in evaluateSpec.
  const builtIn = (n: string) => SPEC_FUNCTIONS.has(n) || Object.hasOwn(SPEC_CONSTANTS, n);
  for (const name of expressionNames(spec.expr, builtIn))
    if (!names.includes(name)) errors.push(`spec.expr reads "${name}", which is not a given`);
  const stated = answerNumbers(example.answer);
  if (!stated.length) errors.push("the example has a spec but its answer states no number");
  if (spec.unit && !plainUnits(example.answer).includes(plainUnits(spec.unit)))
    errors.push(`the answer does not name the spec's unit "${spec.unit}"`);
  if (!evaluate || errors.length) return errors;

  const result = evaluate(spec);
  if (!result.ok) return [`spec could not be evaluated: ${result.error}`];
  if (result.unit.trim() !== spec.unit.trim())
    errors.push(`spec evaluates in "${result.unit}", not in its stated unit "${spec.unit}"`);
  if (!stated.some((n) => Math.abs(n.value - result.value) <= n.tolerance * (1 + 1e-9)))
    errors.push(
      `the answer states ${stated.map((n) => n.value).join(", ")} but the spec computes ${Number(result.value.toPrecision(6))}`,
    );
  return errors;
}

// ---- A unit's guide file -----------------------------------------------------------------------

export interface TopicStats {
  topic: string;
  words: number;
  diagrams: number;
}

export interface GuideReport {
  curriculumId: string | null;
  unit: number | null;
  errors: string[];
  warnings: string[];
  topics: TopicStats[];
}

export interface VerifyOptions {
  /** See `SpecEvaluator`. Left out, worked examples are checked for shape only. */
  evaluate?: SpecEvaluator;
}

/** Every string a student reads as Markdown, with where it is (for messages). */
function proseFields(g: TopicGuide): [string, string][] {
  return [
    ["bigIdea", g.bigIdea],
    ...(g.picture ? [["picture.caption", g.picture.caption] as [string, string]] : []),
    ["explanation", g.explanation],
    ...g.equations.flatMap((e, i): [string, string][] => [
      [`equations[${i}].meaning`, e.meaning],
      ...e.variables.map((v, j): [string, string] => [
        `equations[${i}].variables[${j}].name`,
        v.name,
      ]),
      [`equations[${i}].useWhen`, e.useWhen],
      [`equations[${i}].notWhen`, e.notWhen],
    ]),
    ...(g.derivation ? [["derivation", g.derivation] as [string, string]] : []),
    ...g.workedExamples.flatMap((w, i): [string, string][] => [
      [`workedExamples[${i}].title`, w.title],
      [`workedExamples[${i}].prompt`, w.prompt],
      ...w.steps.map((s, j): [string, string] => [`workedExamples[${i}].steps[${j}]`, s]),
      [`workedExamples[${i}].answer`, w.answer],
    ]),
    ...g.misconceptions.flatMap((m, i): [string, string][] => [
      [`misconceptions[${i}].wrong`, m.wrong],
      [`misconceptions[${i}].right`, m.right],
    ]),
    ...g.checkYourself.flatMap((c, i): [string, string][] => [
      [`checkYourself[${i}].q`, c.q],
      [`checkYourself[${i}].a`, c.a],
    ]),
    ...(g.tryIt?.caption ? [["tryIt.caption", g.tryIt.caption] as [string, string]] : []),
  ];
}

/** Draws a diagram; returns what is wrong with it and what is only hard to read. */
export function checkDiagram(source: string): { errors: string[]; warnings: string[] } {
  const r = render(source);
  const errors = r.errors.map((e) => `line ${e.line}: ${e.msg}`);
  if (!r.ok && !errors.length) errors.push("could not be drawn");
  if (r.ok && !isSafeSvg(r.svg)) errors.push("draws markup the page will not show");
  const warnings: string[] = [];
  for (const w of r.warnings)
    (w.kind === "physics" ? errors : warnings).push(`line ${w.line}: ${w.msg}`);
  return { errors, warnings };
}

const paragraphs = (markdown: string) =>
  markdown
    .replace(ANY_FENCE, "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p && !/^\$\$[\s\S]*\$\$$/.test(p));

/**
 * Everything wrong with one unit's guide file. `data` is the parsed JSON, not yet trusted.
 * Checked: the schema; the file's course and unit exist; one guide for every AP topic of the unit
 * and none for any other; LaTeX compiles (equation cards, variable symbols, and math in every
 * Markdown field); every diagram draws with nothing physically wrong; "try it" diagrams draw at
 * their ends; equation symbols are explained; misconception tags belong to the course;
 * prerequisites exist and come earlier; the calculus-based courses have derivations; word counts.
 */
export function verifyUnitGuide(data: unknown, options: VerifyOptions = {}): GuideReport {
  const report: GuideReport = {
    curriculumId: null,
    unit: null,
    errors: [],
    warnings: [],
    topics: [],
  };
  const parsed = unitGuideSchema.safeParse(data);
  if (!parsed.success) {
    report.errors = parsed.error.issues.map(
      (i) => `schema: ${i.path.map(String).join(".") || "(file)"}: ${i.message}`,
    );
    return report;
  }
  const file = parsed.data;
  report.curriculumId = file.curriculumId;
  report.unit = file.unit;
  const curriculum = getCurriculum(file.curriculumId);
  if (!curriculum) {
    report.errors.push(`unknown course "${file.curriculumId}"`);
    return report;
  }
  const course = curriculum.apCourse;
  const unit = apUnit(file.unit, course);
  if (!unit) {
    report.errors.push(`${curriculum.name} has no unit ${file.unit}`);
    return report;
  }

  // One guide per AP topic of the unit.
  const seen = new Set<string>();
  for (const g of file.guides) {
    if (seen.has(g.topic)) report.errors.push(`${g.topic}: more than one guide`);
    seen.add(g.topic);
    if (!unit.topics.some((t) => t.id === g.topic))
      report.errors.push(`${g.topic}: not a topic of unit ${file.unit}`);
  }
  for (const t of unit.topics)
    if (!seen.has(t.id))
      report.errors.push(`${t.id}: no guide (every topic of the unit needs one)`);

  const tags = new Set(misconceptionsForCourse(course).map((t) => t.id));
  for (const g of file.guides) {
    const error = (where: string, msg: string) => report.errors.push(`${g.topic} ${where}: ${msg}`);
    const warn = (where: string, msg: string) =>
      report.warnings.push(`${g.topic} ${where}: ${msg}`);
    let diagrams = 0;
    const diagram = (where: string, source: string) => {
      diagrams++;
      const d = checkDiagram(source);
      d.errors.forEach((m) => error(where, `diagram ${m}`));
      d.warnings.forEach((m) => warn(where, `diagram ${m}`));
    };
    const markdown = (where: string, value: string) => {
      const open = (value.match(/```/g) ?? []).length;
      if (open % 2) error(where, "a ``` block is not closed");
      diagramBlocks(value).forEach((src) => diagram(where, src));
      const { spans, unbalanced } = mathSpans(value);
      if (unbalanced) error(where, "a $ is not closed (write \\$ for a dollar sign)");
      for (const s of spans) {
        const bad = latexError(s.latex, s.display);
        if (bad) error(where, `LaTeX "${s.latex}": ${bad}`);
      }
    };

    const prose = proseFields(g);
    prose.forEach(([where, value]) => markdown(where, value));
    if (g.teacherNotes) markdown("teacherNotes", g.teacherNotes);

    if (/[.!?]\s+[A-Z]/.test(g.bigIdea.replace(INLINE_MATH, "x")))
      error("bigIdea", "must be one sentence");
    const paras = paragraphs(g.explanation).length;
    if (paras < 2 || paras > 4) error("explanation", `has ${paras} paragraphs; write 2 to 4`);

    if (g.picture) diagram("picture", g.picture.diagram);

    g.equations.forEach((e, i) => {
      const where = `equations[${i}]`;
      const bad = latexError(e.latex, true);
      if (bad) error(where, `LaTeX "${e.latex}": ${bad}`);
      e.variables.forEach((v) => {
        const badSymbol = latexError(v.symbol);
        if (badSymbol) error(where, `symbol "${v.symbol}": ${badSymbol}`);
      });
      const missing = unexplainedSymbols(e);
      if (missing.length) error(where, `variables do not explain ${missing.join(", ")}`);
    });

    if (requiresDerivation(course) && !g.derivation)
      error("derivation", `${curriculum.name} guides must derive their results`);

    g.workedExamples.forEach((w, i) => {
      const where = `workedExamples[${i}]`;
      checkWorkedExample(w, options.evaluate).forEach((m) => error(where, m));
      if (w.spec) {
        // The problem verifier's reading of numbers and its relative comparison, so "7.35 × 10^22 kg"
        // states 7.35e22 and "15 cm" states 0.15 m.
        // Guides space a unit with "\ " ($2.0\ \text{kg}$), which the shared reader leaves alone.
        const stated = textNumbers(w.prompt.replace(/\\ /g, " "));
        for (const [name, given] of Object.entries(w.spec.givens))
          if (!stated.some((n) => sameQuantity(n, given.value, parseSpecUnit(given.unit))))
            warn(where, `the prompt does not state ${name} = ${given.value} ${given.unit}`.trim());
      }
    });

    g.misconceptions.forEach((m, i) => {
      if (m.tag && !tags.has(m.tag))
        error(
          `misconceptions[${i}]`,
          `"${m.tag}" is not a misconception tag of ${curriculum.name}`,
        );
    });

    if (g.tryIt) {
      const names = g.tryIt.params.map((p) => p.name);
      if (new Set(names).size !== names.length) error("tryIt", "two parameters share a name");
      const used = new Set(placeholders(g.tryIt.diagram).flatMap((p) => expressionNames(p)));
      for (const n of used) if (!names.includes(n)) error("tryIt", `{{${n}}} has no parameter`);
      for (const n of names)
        if (!used.has(n)) error("tryIt", `parameter "${n}" is not in the diagram`);
      if (!placeholders(g.tryIt.diagram).length)
        error("tryIt", "the diagram has no {{placeholders}}");
      diagrams++;
      if ([...used].every((n) => names.includes(n)))
        for (const values of tryItCorners(g.tryIt.params)) {
          const at = names.map((n) => `${n}=${values[n]}`).join(", ");
          try {
            const d = checkDiagram(fillTemplate(g.tryIt.diagram, values));
            d.errors.forEach((m) => error("tryIt", `at ${at}: diagram ${m}`));
          } catch (e) {
            error("tryIt", `at ${at}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
    }

    for (const p of g.prerequisites ?? []) {
      if (!apTopic(p, course)) error("prerequisites", `${p} is not a topic of ${curriculum.name}`);
      else if (compareTopicIds(p, g.topic) >= 0)
        error("prerequisites", `${p} does not come before ${g.topic}`);
    }

    const words = prose
      .filter(([where]) => COUNTED.test(where))
      .reduce((n, [, value]) => n + countWords(value), 0);
    if (words < WORD_BOUNDS.min || words > WORD_BOUNDS.max)
      error("length", `${words} words; a topic needs ${WORD_BOUNDS.min} to ${WORD_BOUNDS.max}`);
    report.topics.push({ topic: g.topic, words, diagrams });
  }
  // The same message twice (a tryIt that fails the same way at several settings) says nothing new.
  report.errors = [...new Set(report.errors)];
  report.warnings = [...new Set(report.warnings)];
  return report;
}

export interface CourseCoverage {
  curriculumId: string;
  name: string;
  withGuide: number[];
  missing: number[];
}

/** For every course, which units have a guide file and which do not. Missing is not a failure yet. */
export function guideCoverage(files: readonly (readonly [string, number])[]): CourseCoverage[] {
  return CURRICULA.map((c) => {
    const have = new Set(files.filter(([id]) => id === c.id).map(([, unit]) => unit));
    const units = apUnits(c.apCourse).map((u) => u.unit);
    return {
      curriculumId: c.id,
      name: c.name,
      withGuide: units.filter((u) => have.has(u)),
      missing: units.filter((u) => !have.has(u)),
    };
  });
}
