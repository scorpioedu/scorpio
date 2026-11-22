// The machine-checkable form of a problem: its givens, one expression for the answer and the answer's
// unit. evaluateSpec recomputes the answer with the units carried through every step, so a key can
// be checked without a person or a model (src/lib/content/verify.ts). Pure: no AI, no I/O, no eval;
// the only import is the grader's unit table.
//
// Expression language
//   numbers      1.5   .5   3e8   1.6E-19
//   operators    + - * / ^   parentheses, unary minus. ^ binds tightest and to the right, so
//                -2^2 is -4 and 2^3^2 is 2^9. There is no implied multiplication: write 2*R, not 2R.
//   functions    sqrt abs exp ln log (base 10) sin cos tan asin acos atan atan2(y, x) min max
//                round (to the nearest whole number, for answers that are counts or quantum numbers)
//   names        the spec's givens and steps, then the constants below. A given or step with the
//                same name as a constant replaces it (a problem that says "use g = 10 m/s^2" lists g).
//
// Units and angles
//   Every given is converted to SI before the expression runs and every value carries its dimensions.
//   Adding or comparing unlike quantities, a function of a quantity that is not a pure number, and a
//   result whose dimensions are not those of `unit` are all errors.
//   Trigonometric functions take RADIANS. A given in degrees is written { value: 30, unit: "deg" }
//   (or "°") and is converted like any other unit, so sin(theta) is right for it. A bare number in
//   the expression is in radians; write sin(30*deg) for a literal angle in degrees. asin, acos, atan
//   and atan2 return radians; give `unit: "deg"` to have the result in degrees.
//   Temperatures: "°C" is a reading on the Celsius scale (20 °C becomes 293.15 K); "C°" is a
//   difference; "K" is both. Inside a larger unit, as in "J/(kg·°C)", °C is a difference.

import {
  fromSI,
  parseUnit,
  sameDims,
  toSI,
  type Dims,
  type Unit,
} from "../../../functions/src/units";

export interface SpecGiven {
  value: number;
  /** "" for a pure number. */
  unit: string;
  /**
   * Set for a quantity the text names only by a letter ("a disk of mass M"). The value is then
   * arbitrary: the answer must not depend on it, and verify.ts checks that by changing it.
   */
  symbol?: string;
  /** A standard value the text does not state (the density of water). */
  assumed?: boolean;
}

export interface ProblemSpec {
  givens: Record<string, SpecGiven>;
  /** The answer, over the given names, the steps and the constants. */
  expr: string;
  /** Unit of the result; "" for a pure number. */
  unit: string;
  /**
   * Optional named intermediate results. Each may use the givens, the constants and the other steps,
   * in any order (a database may not keep the order written), but not itself.
   */
  steps?: Record<string, string>;
  /**
   * Optional other routes to the same answer (energy as well as angular momentum, say). verify.ts
   * requires each to agree with `expr`; it is how over-determined data that contradict each other
   * are caught.
   */
  alt?: string[];
  /** Numbers in the problem text that the answer deliberately does not use. */
  extraneous?: number[];
  /**
   * For a problem whose text holds a ```dg circuit diagram: what the key is, as a quantity the
   * circuit solver (src/lib/diagram/circuit-solve.ts) computes from the drawing. verify.ts
   * (`circuit-consistent`) then requires the solver's value to agree with the key, so the picture,
   * the spec and the key cannot drift apart. Leave it out when the key is something else.
   */
  circuit?: SpecCircuit;
}

/** The solver quantities a key can be checked against. */
export const SPEC_CIRCUIT_QUANTITIES = [
  "current",
  "voltage",
  "power",
  "resistance",
  "time-constant",
] as const;

export interface SpecCircuit {
  /**
   * "current" (A) through `element`; "voltage" (V) across it (a battery's terminal voltage);
   * "power" (W) it dissipates or delivers; "resistance" (Ω): the equivalent resistance outside
   * the single battery; "time-constant" (s): R·C or L/R of a circuit with one capacitor or one
   * inductor. Sizes are compared, not signs: a key is a magnitude.
   */
  quantity: (typeof SPEC_CIRCUIT_QUANTITIES)[number];
  /**
   * The element, by the label drawn on it ("R_2", "ε"; "R2" also finds R_2) or, unlabelled, its
   * type letter and number in the order written (R1, C1, V1 for a battery). Needed for current,
   * voltage and power unless the circuit has exactly one battery, which is then meant. Not used
   * for resistance or time-constant.
   */
  element?: string;
  /**
   * "steady" (default): long after switching, capacitors open and inductors plain wire.
   * "t0": just after switching with nothing stored, capacitors plain wire and inductors open.
   */
  at?: "steady" | "t0";
  /** Use every switch as "closed" or "open" instead of as drawn (the state the question asks about). */
  switches?: "closed" | "open";
}

export type SpecResult = { ok: true; value: number; unit: string } | { ok: false; error: string };

const D = (m = 0, kg = 0, s = 0, A = 0, K = 0, mol = 0, cd = 0): Dims => [m, kg, s, A, K, mol, cd];
const NONE = D();

/**
 * Physical constants an expression may name, in SI. CODATA 2018 values; the AP tables round them
 * (k = 9.0e9, G = 6.67e-11, c = 3.00e8), which is well inside the 0.5% a key is checked to.
 * `g` is the AP convention 9.8 m/s^2. `e` is the elementary charge (use exp() for Euler's number).
 */
export const SPEC_CONSTANTS: Record<string, { value: number; unit: string; dims: Dims }> = {
  g: { value: 9.8, unit: "m/s^2", dims: D(1, 0, -2) },
  G: { value: 6.6743e-11, unit: "N m^2/kg^2", dims: D(3, -1, -2) },
  k: { value: 8.9875517923e9, unit: "N m^2/C^2", dims: D(3, 1, -4, -2) },
  c: { value: 299792458, unit: "m/s", dims: D(1, 0, -1) },
  e: { value: 1.602176634e-19, unit: "C", dims: D(0, 0, 1, 1) },
  eps0: { value: 8.8541878128e-12, unit: "F/m", dims: D(-3, -1, 4, 2) },
  mu0: { value: 1.25663706212e-6, unit: "T m/A", dims: D(1, 1, -2, -2) },
  h: { value: 6.62607015e-34, unit: "J s", dims: D(2, 1, -1) },
  R: { value: 8.314462618, unit: "J/(mol K)", dims: D(2, 1, -2, 0, -1, -1) },
  kB: { value: 1.380649e-23, unit: "J/K", dims: D(2, 1, -2, 0, -1) },
  NA: { value: 6.02214076e23, unit: "mol^-1", dims: D(0, 0, 0, 0, 0, -1) },
  sigma: { value: 5.670374419e-8, unit: "W/(m^2 K^4)", dims: D(0, 1, -3, 0, -4) },
  me: { value: 9.1093837015e-31, unit: "kg", dims: D(0, 1) },
  mp: { value: 1.67262192369e-27, unit: "kg", dims: D(0, 1) },
  atm: { value: 101325, unit: "Pa", dims: D(-1, 1, -2) },
  pi: { value: Math.PI, unit: "", dims: NONE },
  /** One degree in radians, for literal angles: sin(30*deg). */
  deg: { value: Math.PI / 180, unit: "", dims: NONE },
};

/** The functions an expression may call. Exported so the guide checks read the same list. */
export const SPEC_FUNCTIONS: ReadonlySet<string> = new Set([
  "sqrt",
  "abs",
  "exp",
  "ln",
  "log",
  "sin",
  "cos",
  "tan",
  "asin",
  "acos",
  "atan",
  "atan2",
  "min",
  "max",
  "round",
]);
const FUNCTIONS = SPEC_FUNCTIONS;

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** Own keys only: "constructor" is not a step of every spec. */
const has = (object: object, key: string) => Object.prototype.hasOwnProperty.call(object, key);

/** A value in SI with its dimensions. */
interface Quantity {
  value: number;
  dims: Dims;
}

type Token =
  | { kind: "number"; value: number; text: string }
  | { kind: "name"; text: string }
  | { kind: "op"; text: string };

class SpecError extends Error {}

function tokenise(expr: string): Token[] {
  const tokens: Token[] = [];
  const pattern =
    /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|([-+*/^(),]))/y;
  let pos = 0;
  while (pos < expr.length) {
    if (/^\s*$/.test(expr.slice(pos))) break;
    pattern.lastIndex = pos;
    const m = pattern.exec(expr);
    if (!m) throw new SpecError(`Unexpected "${expr.slice(pos).trim()[0]}" in "${expr}"`);
    if (m[1] !== undefined) tokens.push({ kind: "number", value: Number(m[1]), text: m[1] });
    else if (m[2] !== undefined) tokens.push({ kind: "name", text: m[2] });
    else tokens.push({ kind: "op", text: m[3] });
    pos = pattern.lastIndex;
  }
  if (!tokens.length) throw new SpecError("The expression is empty");
  return tokens;
}

const SI_SYMBOLS = ["m", "kg", "s", "A", "K", "mol", "cd"];

/** Dimensions for an error message: "kg·m^2/s^2". */
export function formatDims(dims: Dims): string {
  const part = (i: number, p: number) => (p === 1 ? SI_SYMBOLS[i] : `${SI_SYMBOLS[i]}^${p}`);
  const up = dims.map((p, i) => (p > 1e-9 ? part(i, round(p)) : "")).filter(Boolean);
  const down = dims.map((p, i) => (p < -1e-9 ? part(i, round(-p)) : "")).filter(Boolean);
  if (!up.length && !down.length) return "a pure number";
  return (up.join("·") || "1") + (down.length ? "/" + down.join("/") : "");
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;
const isPure = (q: Quantity) => sameDims(q.dims, NONE);

function evaluate(expr: string, lookup: (name: string) => Quantity | undefined): Quantity {
  const tokens = tokenise(expr);
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (text: string) => peek()?.kind === "op" && peek().text === text;
  const expect = (text: string) => {
    if (!isOp(text)) throw new SpecError(`Expected "${text}" in "${expr}"`);
    pos++;
  };

  const pure = (q: Quantity, what: string): number => {
    if (!isPure(q))
      throw new SpecError(`${what} needs a pure number, not ${formatDims(q.dims)}, in "${expr}"`);
    return q.value;
  };
  const alike = (a: Quantity, b: Quantity, what: string) => {
    if (!sameDims(a.dims, b.dims))
      throw new SpecError(
        `${what} mixes ${formatDims(a.dims)} and ${formatDims(b.dims)} in "${expr}"`,
      );
  };
  const number = (value: number): Quantity => ({ value, dims: NONE });

  const call = (name: string, args: Quantity[]): Quantity => {
    const arity = name === "atan2" ? 2 : name === "min" || name === "max" ? -1 : 1;
    if (arity === -1 ? args.length < 2 : args.length !== arity)
      throw new SpecError(`${name}() has the wrong number of arguments in "${expr}"`);
    const [a, b] = args;
    switch (name) {
      case "sqrt":
        return { value: Math.sqrt(a.value), dims: a.dims.map((d) => d / 2) as Dims };
      case "abs":
        return { value: Math.abs(a.value), dims: a.dims };
      case "min":
      case "max":
        for (const other of args.slice(1)) alike(a, other, `${name}()`);
        return {
          value: (name === "min" ? Math.min : Math.max)(...args.map((q) => q.value)),
          dims: a.dims,
        };
      case "atan2":
        alike(a, b, "atan2()");
        return number(Math.atan2(a.value, b.value));
      case "round":
        return number(Math.round(pure(a, "round()")));
      case "exp":
        return number(Math.exp(pure(a, "exp()")));
      case "ln":
        return number(Math.log(pure(a, "ln()")));
      case "log":
        return number(Math.log10(pure(a, "log()")));
      case "sin":
        return number(Math.sin(pure(a, "sin()")));
      case "cos":
        return number(Math.cos(pure(a, "cos()")));
      case "tan":
        return number(Math.tan(pure(a, "tan()")));
      case "asin":
        return number(Math.asin(pure(a, "asin()")));
      case "acos":
        return number(Math.acos(pure(a, "acos()")));
      default:
        return number(Math.atan(pure(a, "atan()")));
    }
  };

  // sum := product (("+" | "-") product)*
  const parseSum = (): Quantity => {
    let left = parseProduct();
    while (isOp("+") || isOp("-")) {
      const op = tokens[pos++].text;
      const right = parseProduct();
      alike(left, right, op === "+" ? "A sum" : "A difference");
      left = {
        value: op === "+" ? left.value + right.value : left.value - right.value,
        dims: left.dims,
      };
    }
    return left;
  };

  // product := unary (("*" | "/") unary)*
  const parseProduct = (): Quantity => {
    let left = parseUnary();
    while (isOp("*") || isOp("/")) {
      const sign = tokens[pos++].text === "*" ? 1 : -1;
      const right = parseUnary();
      left = {
        value: sign === 1 ? left.value * right.value : left.value / right.value,
        dims: left.dims.map((d, i) => d + sign * right.dims[i]) as Dims,
      };
    }
    return left;
  };

  // unary := ("-" | "+") unary | power
  const parseUnary = (): Quantity => {
    if (isOp("-")) {
      pos++;
      const q = parseUnary();
      return { value: -q.value, dims: q.dims };
    }
    if (isOp("+")) {
      pos++;
      return parseUnary();
    }
    return parsePower();
  };

  // power := atom ("^" unary)?   (the exponent may carry its own sign: 10^-3)
  const parsePower = (): Quantity => {
    const base = parseAtom();
    if (!isOp("^")) return base;
    pos++;
    const exponent = pure(parseUnary(), "An exponent");
    return {
      value: Math.pow(base.value, exponent),
      dims: base.dims.map((d) => d * exponent) as Dims,
    };
  };

  const parseAtom = (): Quantity => {
    const tok = peek();
    if (!tok) throw new SpecError(`"${expr}" ends too soon`);
    pos++;
    if (tok.kind === "number") return number(tok.value);
    if (tok.kind === "op" && tok.text === "(") {
      const inner = parseSum();
      expect(")");
      return inner;
    }
    if (tok.kind === "name") {
      if (isOp("(")) {
        if (!FUNCTIONS.has(tok.text))
          throw new SpecError(`Unknown function ${tok.text}() in "${expr}"`);
        pos++;
        const args = [parseSum()];
        while (isOp(",")) {
          pos++;
          args.push(parseSum());
        }
        expect(")");
        return call(tok.text, args);
      }
      const known = lookup(tok.text);
      if (!known) throw new SpecError(`Unknown name "${tok.text}" in "${expr}"`);
      return known;
    }
    throw new SpecError(`Unexpected "${tok.text}" in "${expr}"`);
  };

  const result = parseSum();
  if (pos !== tokens.length) throw new SpecError(`Unexpected "${tokens[pos].text}" in "${expr}"`);
  if (!Number.isFinite(result.value))
    throw new SpecError(`"${expr}" has no finite value (${result.value})`);
  return result;
}

/**
 * A spec unit ("" is a pure number). Celsius is read; see the note on temperatures above. A
 * reciprocal may be written "1/s", "1/mm" or "1/(m s)" as well as "s^-1" (the grader's parser does
 * not read a leading 1, so this adds to it without changing anything it already reads).
 */
export function parseSpecUnit(unit: string): Unit | undefined {
  if (typeof unit !== "string") return undefined;
  if (!unit.trim()) return { factor: 1, dims: NONE };
  const parsed = parseUnit(unit, { temperature: true });
  if (parsed) return parsed;
  const per = unit.match(/^\s*1\s*\/\s*(\S.*)$/);
  const below =
    per && !/^1\s*\//.test(per[1]) ? parseUnit(per[1], { temperature: true }) : undefined;
  // 0 - d, not -d: no -0 in the dimensions
  return below && { factor: 1 / below.factor, dims: below.dims.map((d) => 0 - d) as Dims };
}

/** Name lookup for one spec: givens, constants, and steps worked out the first time they are named. */
function buildScope(spec: ProblemSpec): (name: string) => Quantity | undefined {
  const scope = new Map<string, Quantity>();
  for (const [name, c] of Object.entries(SPEC_CONSTANTS))
    scope.set(name, { value: c.value, dims: c.dims });
  if (!spec.givens || typeof spec.givens !== "object")
    throw new SpecError("The spec has no givens");
  for (const [name, given] of Object.entries(spec.givens)) {
    if (!NAME.test(name) || FUNCTIONS.has(name))
      throw new SpecError(`"${name}" cannot be the name of a given`);
    if (!given || typeof given.value !== "number" || !Number.isFinite(given.value))
      throw new SpecError(`Given ${name} has no numeric value`);
    const unit = parseSpecUnit(given.unit);
    if (!unit) throw new SpecError(`Given ${name} has an unknown unit "${given.unit}"`);
    scope.set(name, { value: toSI(given.value, unit), dims: unit.dims });
  }
  const steps = spec.steps ?? {};
  const working = new Set<string>();
  const lookup = (name: string): Quantity | undefined => {
    const known = scope.get(name);
    if (known && !has(steps, name)) return known;
    if (!has(steps, name)) return undefined;
    if (known) return known;
    if (working.has(name)) throw new SpecError(`Step ${name} is defined in terms of itself`);
    working.add(name);
    const value = evaluate(steps[name], lookup);
    working.delete(name);
    scope.set(name, value);
    return value;
  };
  for (const [name, step] of Object.entries(steps)) {
    if (!NAME.test(name) || FUNCTIONS.has(name))
      throw new SpecError(`"${name}" cannot be the name of a step`);
    if (has(spec.givens, name)) throw new SpecError(`Step ${name} has the name of a given`);
    if (typeof step !== "string") throw new SpecError(`Step ${name} is not an expression`);
    scope.delete(name); // a step replaces a constant of the same name
  }
  // Every step is worked out, used or not, so a broken one is reported.
  for (const name of Object.keys(steps)) lookup(name);
  return lookup;
}

/**
 * Evaluates one expression of a spec (`expr` unless another is passed, as for `alt`) and returns the
 * value in the spec's unit.
 */
export function evaluateSpecExpr(spec: ProblemSpec, expr: string): SpecResult {
  try {
    if (!spec || typeof spec !== "object") throw new SpecError("Not a spec");
    if (typeof expr !== "string") throw new SpecError("The spec has no expression");
    const unit = parseSpecUnit(spec.unit);
    if (!unit) throw new SpecError(`Unknown result unit "${spec.unit}"`);
    const result = evaluate(expr, buildScope(spec));
    if (!sameDims(result.dims, unit.dims))
      throw new SpecError(
        `The expression gives ${formatDims(result.dims)}, but the unit "${spec.unit}" is ${formatDims(unit.dims)}`,
      );
    return { ok: true, value: fromSI(result.value, unit), unit: spec.unit };
  } catch (error) {
    if (error instanceof SpecError) return { ok: false, error: error.message };
    throw error;
  }
}

/** Recomputes a problem's answer from its spec, in the spec's unit, or says why it cannot. */
export function evaluateSpec(spec: ProblemSpec): SpecResult {
  return evaluateSpecExpr(spec, spec?.expr);
}

/** The numbers written in an expression (and its steps and alternatives), for matching against the text. */
export function specLiterals(spec: ProblemSpec): number[] {
  const out: number[] = [];
  for (const expr of [spec.expr, ...Object.values(spec.steps ?? {}), ...(spec.alt ?? [])]) {
    try {
      for (const t of tokenise(expr)) if (t.kind === "number") out.push(t.value);
    } catch {
      // A broken expression is reported by evaluateSpec.
    }
  }
  return out;
}

/**
 * The shape of a spec's calculation with names and numbers blanked: "v * ( v - v )". Two problems
 * with the same shape are the same calculation with other numbers. Steps are substituted first, so
 * a spec written with steps and one written in a single line compare equal.
 */
export function specShape(spec: ProblemSpec): string {
  const steps = spec.steps ?? {};
  const expand = (expr: string, depth: number): string[] => {
    let tokens: Token[];
    try {
      tokens = tokenise(expr);
    } catch {
      return ["?"];
    }
    return tokens.flatMap((t, i) => {
      if (t.kind === "number") return ["n"];
      if (t.kind === "op") return [t.text];
      const next = tokens[i + 1];
      if (next?.kind === "op" && next.text === "(" && FUNCTIONS.has(t.text)) return [t.text];
      if (has(steps, t.text) && depth < 20) return ["(", ...expand(steps[t.text], depth + 1), ")"];
      return ["v"];
    });
  };
  return expand(spec.expr, 0).join(" ");
}

/** Structural check of a stored spec. Returns the problems found (none when it is well formed). */
export function specShapeErrors(raw: unknown): string[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return ["The spec is not an object"];
  const s = raw as Record<string, unknown>;
  const errors: string[] = [];
  if (typeof s.expr !== "string" || !s.expr.trim()) errors.push("The spec has no expression");
  if (typeof s.unit !== "string") errors.push('The spec has no unit (use "" for a pure number)');
  if (!s.givens || typeof s.givens !== "object" || Array.isArray(s.givens))
    errors.push("The spec has no givens");
  else
    for (const [name, g] of Object.entries(s.givens as Record<string, unknown>)) {
      const given = g as Record<string, unknown> | null;
      if (!given || typeof given.value !== "number" || typeof given.unit !== "string")
        errors.push(`Given ${name} needs a numeric value and a unit`);
    }
  if (s.steps !== undefined && (!s.steps || typeof s.steps !== "object" || Array.isArray(s.steps)))
    errors.push("steps must be an object of name: expression");
  if (s.alt !== undefined && !(Array.isArray(s.alt) && s.alt.every((a) => typeof a === "string")))
    errors.push("alt must be a list of expressions");
  if (
    s.extraneous !== undefined &&
    !(Array.isArray(s.extraneous) && s.extraneous.every((n) => typeof n === "number"))
  )
    errors.push("extraneous must be a list of numbers");
  if (s.circuit !== undefined) {
    const c = s.circuit as Record<string, unknown> | null;
    if (!c || typeof c !== "object" || Array.isArray(c))
      errors.push("circuit must be an object like { quantity, element }");
    else {
      if (!(SPEC_CIRCUIT_QUANTITIES as readonly unknown[]).includes(c.quantity))
        errors.push(`circuit.quantity must be one of ${SPEC_CIRCUIT_QUANTITIES.join(", ")}`);
      if (c.element !== undefined && (typeof c.element !== "string" || !c.element.trim()))
        errors.push("circuit.element must be the name of an element");
      if (c.at !== undefined && c.at !== "steady" && c.at !== "t0")
        errors.push('circuit.at must be "steady" or "t0"');
      if (c.switches !== undefined && c.switches !== "closed" && c.switches !== "open")
        errors.push('circuit.switches must be "closed" or "open"');
    }
  }
  return errors;
}
