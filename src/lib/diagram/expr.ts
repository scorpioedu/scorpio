// Safe math expressions for `fn` lines. No eval: a tiny recursive-descent
// parser that compiles to a closure. One free variable (whatever name the
// author uses: t, x, ...). Supports + - * / ^, unary minus, parentheses,
// pi, e and a handful of functions.

const FNS: Record<string, (x: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  sqrt: Math.sqrt,
  abs: Math.abs,
  exp: Math.exp,
  ln: Math.log,
  log: Math.log10,
};
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E, g: 9.8 };

type F = (v: number) => number;

export function compile(src: string): { f?: F; err?: string } {
  const toks = src.match(/\d*\.?\d+(?:e-?\d+)?|[A-Za-z_]\w*|[-+*/^()]/g) ?? [];
  if (toks.join("") !== src.replace(/\s+/g, "")) return { err: `unexpected character in "${src}"` };
  let i = 0;
  let freeVar: string | undefined;
  const peek = () => toks[i];
  const take = () => toks[i++];

  function expr(): F {
    let l = term();
    while (peek() === "+" || peek() === "-") {
      const op = take(),
        a = l,
        b = term();
      l = op === "+" ? (v) => a(v) + b(v) : (v) => a(v) - b(v);
    }
    return l;
  }
  function term(): F {
    let l = unary();
    while (peek() === "*" || peek() === "/") {
      const op = take(),
        a = l,
        b = unary();
      l = op === "*" ? (v) => a(v) * b(v) : (v) => a(v) / b(v);
    }
    return l;
  }
  function unary(): F {
    if (peek() === "-") {
      take();
      const a = unary();
      return (v) => -a(v);
    }
    return power();
  }
  function power(): F {
    const a = atom();
    if (peek() === "^") {
      take();
      const b = unary();
      return (v) => a(v) ** b(v);
    }
    return a;
  }
  function atom(): F {
    const t = take();
    if (t === undefined) throw new Error("expression ends early");
    if (t === "(") {
      const a = expr();
      if (take() !== ")") throw new Error("missing )");
      return a;
    }
    if (/^[\d.]/.test(t)) {
      const n = Number(t);
      return () => n;
    }
    if (t in FNS) {
      if (take() !== "(") throw new Error(`${t} needs ( )`);
      const a = expr();
      if (take() !== ")") throw new Error("missing )");
      const fn = FNS[t];
      return (v) => fn(a(v));
    }
    if (t in CONSTS && t !== freeVar) {
      const n = CONSTS[t];
      return () => n;
    }
    if (/^[A-Za-z_]/.test(t)) {
      if (freeVar && freeVar !== t)
        throw new Error(`two variables "${freeVar}" and "${t}"; use numbers`);
      freeVar = t;
      return (v) => v;
    }
    throw new Error(`unexpected "${t}"`);
  }

  try {
    const f = expr();
    if (i < toks.length) return { err: `unexpected "${toks[i]}" in "${src}"` };
    return { f };
  } catch (e) {
    return { err: `${(e as Error).message} in "${src}"` };
  }
}
