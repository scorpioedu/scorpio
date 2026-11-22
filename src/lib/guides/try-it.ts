// "Try it" diagrams: a diagram source with {{...}} placeholders and one slider per parameter.
// A placeholder holds a parameter name ({{m}}) or arithmetic over parameters ({{m*v}}), so a
// picture can show a quantity that follows from the sliders. Pure; no eval.

export interface TryItParam {
  name: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  unit: string;
}

const FUNCTIONS: Record<string, (...a: number[]) => number> = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  min: Math.min,
  max: Math.max,
  round: Math.round,
};

const TOKEN = /\s*(\d*\.?\d+(?:e-?\d+)?|[A-Za-z_]\w*|[-+*/^(),])/y;

/** A name a try-it expression may use without it being a slider: its functions and pi. */
function isTryItName(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(FUNCTIONS, name) || name === "pi";
}

/**
 * Names an expression reads, leaving out what the language itself provides. By default that is
 * this file's functions and pi (a try-it placeholder); a caller checking another language passes
 * its own built-ins (the guide check passes the spec evaluator's functions and constants).
 */
export function expressionNames(
  expr: string,
  builtIn: (name: string) => boolean = isTryItName,
): string[] {
  const names = expr.match(/[A-Za-z_]\w*/g) ?? [];
  return [...new Set(names.filter((n) => !builtIn(n)))];
}

/**
 * Value of an arithmetic expression: + - * / ^, unary minus, parentheses, pi, and
 * sqrt abs sin cos tan min max round. Throws on anything else, an unknown name, or a result that
 * is not a finite number.
 */
export function evaluate(expr: string, vars: Record<string, number>): number {
  const tokens: string[] = [];
  TOKEN.lastIndex = 0;
  let at = 0;
  while (at < expr.length) {
    if (/^\s*$/.test(expr.slice(at))) break;
    TOKEN.lastIndex = at;
    const m = TOKEN.exec(expr);
    if (!m) throw new Error(`unexpected character in "${expr}"`);
    tokens.push(m[1]);
    at = TOKEN.lastIndex;
  }
  let i = 0;
  const peek = () => tokens[i];
  const take = () => tokens[i++];
  const expect = (t: string) => {
    if (take() !== t) throw new Error(`expected "${t}" in "${expr}"`);
  };

  function sum(): number {
    let v = product();
    while (peek() === "+" || peek() === "-") v = take() === "+" ? v + product() : v - product();
    return v;
  }
  function product(): number {
    let v = unary();
    while (peek() === "*" || peek() === "/") v = take() === "*" ? v * unary() : v / unary();
    return v;
  }
  function unary(): number {
    if (peek() === "-") {
      take();
      return -unary();
    }
    return power();
  }
  function power(): number {
    const base = atom();
    if (peek() === "^") {
      take();
      return Math.pow(base, unary());
    }
    return base;
  }
  function atom(): number {
    const t = take();
    if (t === undefined) throw new Error(`"${expr}" ends too soon`);
    if (t === "(") {
      const v = sum();
      expect(")");
      return v;
    }
    if (/^[\d.]/.test(t)) return Number(t);
    if (/^[A-Za-z_]/.test(t)) {
      if (peek() === "(") {
        const fn = FUNCTIONS[t];
        if (!fn) throw new Error(`unknown function "${t}"`);
        take();
        const args = [sum()];
        while (peek() === ",") {
          take();
          args.push(sum());
        }
        expect(")");
        return fn(...args);
      }
      if (t === "pi") return Math.PI;
      if (!Object.hasOwn(vars, t)) throw new Error(`unknown name "${t}"`);
      return vars[t];
    }
    throw new Error(`unexpected "${t}" in "${expr}"`);
  }

  const value = sum();
  if (i < tokens.length) throw new Error(`unexpected "${tokens[i]}" in "${expr}"`);
  if (!Number.isFinite(value)) throw new Error(`"${expr}" is not a finite number`);
  return value;
}

const PLACEHOLDER = /\{\{([^{}]+)\}\}/g;

/** The expressions inside a template's {{...}} placeholders, in order. */
export function placeholders(template: string): string[] {
  return [...template.matchAll(PLACEHOLDER)].map((m) => m[1].trim());
}

/** At most three decimals, no trailing zeros, never "-0": what a diagram coordinate can read. */
export function formatValue(n: number): string {
  return String(Number(n.toFixed(3)) + 0);
}

/** The diagram source with every placeholder replaced by its value. Throws like `evaluate`. */
export function fillTemplate(template: string, values: Record<string, number>): string {
  return template.replace(PLACEHOLDER, (_all, expr: string) =>
    formatValue(evaluate(expr.trim(), values)),
  );
}

/** Every parameter at its default. */
export function defaultValues(params: readonly TryItParam[]): Record<string, number> {
  return Object.fromEntries(params.map((p) => [p.name, p.default]));
}

/**
 * The settings a "try it" diagram must draw at: every parameter at its minimum, default and
 * maximum, then each parameter alone at its two ends with the others at their defaults.
 */
export function tryItCorners(params: readonly TryItParam[]): Record<string, number>[] {
  const all = (pick: (p: TryItParam) => number) =>
    Object.fromEntries(params.map((p) => [p.name, pick(p)]));
  const corners = [all((p) => p.min), all((p) => p.default), all((p) => p.max)];
  for (const p of params)
    for (const v of [p.min, p.max]) corners.push({ ...defaultValues(params), [p.name]: v });
  return corners;
}
