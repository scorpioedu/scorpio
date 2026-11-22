// wave: standing waves, a travelling wave, superposed pulses and slit patterns. The author names
// the situation; node positions, the summed pulse and the intensity curve are computed.
//
// wave string n=3 [free] [L=1.2 unit=m] [num]   standing wave on a string: fixed at both ends, or
//                                               `free` = fixed at the left, free at the right
// wave pipe n=2 [closed] [L=0.6 unit=m] [num]   air column: open at both ends, or `closed` =
//                                               closed at the left, open at the right
//                                               (free / closed allow odd harmonics only)
// wave travel [lambda=2 A=0.5 unit=m] [v=right] [num]   a sinusoid with λ and A marked
// wave pulses [xr=0..10] [num]                  superposition at one instant; then one line each:
//   pulse 3 h=1 w=2 [tri|rect|half] [v=right]     centre, height (may be negative), width, shape
// wave double [orders=2] [da=4] [lambda=500nm d=0.1mm L=2m] [num]   two-slit intensity pattern;
//                                               da = slit separation / slit width adds the envelope
// wave single [orders=3] [lambda=500nm a=0.05mm L=2m] [num]         one-slit pattern
//
// num prints the given numbers; num=all also prints computed ones (a wavelength, fringe positions).

import { type Cmd, type DgError, type Doc, range } from "./parse";
import { ACCENT, f1, plain, wrap, type P } from "./svg";
import { Canvas, argNum, curve, dimMark, finish, fmt, kvNum, unknownWords } from "./kit";

export type WaveModel =
  | {
      kind: "standing";
      medium: "string" | "pipe";
      /** The two ends, left then right. */
      ends: ["fixed" | "free" | "open" | "closed", "fixed" | "free" | "open" | "closed"];
      n: number;
      /** Displacement nodes and antinodes as fractions of the length, left to right. */
      nodes: number[];
      antinodes: number[];
      /** Wavelength / length: 2/n, or 4/n when one end differs from the other. */
      wavelengthOverL: number;
      L?: number;
      wavelength?: number;
    }
  | { kind: "travelling"; wavelength?: number; amplitude?: number }
  | {
      kind: "superposition";
      /** The summed displacement as [x, y] corner points. */
      sum: P[];
      max: number;
      min: number;
      at: (x: number) => number;
    }
  | {
      kind: "double-slit" | "single-slit";
      orders: number;
      /** Distance on the screen between neighbouring bright (double) or dark (single) fringes, in metres. */
      spacing?: number;
      /** Orders the single-slit envelope removes from a double-slit pattern. */
      missing: number[];
      /** Relative intensity at u = d·sinθ/λ (double) or a·sinθ/λ (single). */
      intensity: (u: number) => number;
    };

type Out = { svg: string; alt: string; wave?: WaveModel; scale?: string[] };

const KINDS = ["string", "pipe", "travel", "travelling", "traveling", "pulses", "double", "single"];
const ORD = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"];

export function renderWave(doc: Doc, errs: DgError[], warns: DgError[] = []): Out {
  const h = doc.head;
  const kind = h.args.find((a) => KINDS.includes(a));
  if (kind !== "pulses")
    for (const c of doc.cmds)
      errs.push({
        line: c.line,
        msg: `wave ${kind ?? ""} takes everything on its first line; it has no "${c.op}"`.replace(
          "  ",
          " ",
        ),
      });
  switch (kind) {
    case "string":
    case "pipe":
      return standing(h, kind, errs);
    case "travel":
    case "travelling":
    case "traveling":
      return travelling(h, errs);
    case "pulses":
      return pulses(doc, errs, warns);
    case "double":
    case "single":
      return slits(h, kind, errs);
    default:
      errs.push({
        line: h.line,
        msg: "wave needs a situation: wave string n=3, wave pipe closed n=3, wave travel, wave pulses, wave double or wave single",
      });
      return { svg: "", alt: "" };
  }
}

const numFlags = (h: Cmd) => ({
  num: h.args.includes("num") || "num" in h.kv,
  all: h.kv.num === "all",
});

/** k/n of L as text: 0, L/3, 2L/3, L. */
function frac(k: number, n: number): string {
  if (k === 0) return "0";
  const g = (a: number, b: number): number => (b ? g(b, a % b) : a);
  const d = g(k, n);
  const [p, q] = [k / d, n / d];
  return `${p === 1 ? "" : p}L${q === 1 ? "" : `/${q}`}`;
}

// ---------------------------------------------------------------------------------------------

function standing(h: Cmd, medium: "string" | "pipe", errs: DgError[]): Out {
  unknownWords(
    h,
    [...KINDS, "free", "fixed", "open", "closed", "num"],
    ["n", "L", "unit", "num"],
    errs,
    `use n= and any of: ${medium === "string" ? "free" : "closed"} L= unit= num`,
  );
  const mixed = medium === "string" ? h.args.includes("free") : h.args.includes("closed");
  const n = kvNum(h, "n", errs);
  const what =
    medium === "string"
      ? mixed
        ? "a string fixed at one end and free at the other"
        : "a string fixed at both ends"
      : mixed
        ? "a pipe closed at one end and open at the other"
        : "a pipe open at both ends";
  if (n === undefined) errs.push({ line: h.line, msg: `wave ${medium} needs the harmonic: n=3` });
  else if (!Number.isInteger(n) || n < 1)
    errs.push({ line: h.line, msg: `the harmonic n must be a whole number from 1, got ${n}` });
  else if (n > 12)
    errs.push({ line: h.line, msg: `harmonic ${n} is too crowded to draw; use n=12 or less` });
  else if (mixed && n % 2 === 0)
    errs.push({
      line: h.line,
      msg: `${what} has only odd harmonics (n = 1, 3, 5, …): its length is an odd number of quarter wavelengths, with a node at one end and an antinode at the other, so n=${n} is impossible. Use n=${n - 1} or n=${n + 1}`,
    });
  const L = kvNum(h, "L", errs);
  if (L !== undefined && !(L > 0)) errs.push({ line: h.line, msg: "L must be positive" });
  if (errs.length || n === undefined) return { svg: "", alt: "" };
  const unit = h.kv.unit ? ` ${h.kv.unit}` : "";
  const { num, all } = numFlags(h);

  // displacement shape g(u), u = x/L; den = how many equal parts the nodes and antinodes divide L into
  const openOpen = medium === "pipe" && !mixed;
  const g = (u: number) =>
    mixed
      ? Math.sin((n * Math.PI * u) / 2)
      : openOpen
        ? Math.cos(n * Math.PI * u)
        : Math.sin(n * Math.PI * u);
  const den = mixed ? n : 2 * n;
  const nodeK: number[] = [],
    antiK: number[] = [];
  for (let k = 0; k <= den; k++) (Math.abs(g(k / den)) < 1e-9 ? nodeK : antiK).push(k);
  const ratio = mixed ? 4 / n : 2 / n;
  const model: WaveModel = {
    kind: "standing",
    medium,
    ends:
      medium === "string"
        ? ["fixed", mixed ? "free" : "fixed"]
        : [mixed ? "closed" : "open", "open"],
    n,
    nodes: nodeK.map((k) => k / den),
    antinodes: antiK.map((k) => k / den),
    wavelengthOverL: ratio,
    L,
    wavelength: L === undefined ? undefined : L * ratio,
  };

  const W = 360,
    A = 32,
    WALL = 46;
  const cv = new Canvas();
  const pts = (sign: number): P[] =>
    Array.from({ length: 181 }, (_, i): P => [(i / 180) * W, -sign * A * g(i / 180)]);
  if (medium === "pipe") {
    cv.line([0, -WALL], [W, -WALL], ` stroke-width="2"`);
    cv.line([0, WALL], [W, WALL], ` stroke-width="2"`);
    if (mixed) cv.line([0, -WALL], [0, WALL], ` stroke-width="3"`);
  } else {
    // fixed end: a clamp with hatching; free end: a ring on a pole
    const clamp = (x: number, dir: 1 | -1) => {
      cv.line([x, -WALL], [x, WALL], ` stroke-width="3"`);
      for (let y = -WALL + 8; y <= WALL; y += 12)
        cv.line([x, y], [x + dir * 7, y - 7], ` stroke-width="1" stroke-opacity=".5"`);
    };
    clamp(0, -1);
    if (mixed) {
      cv.line([W, -WALL], [W, WALL], ` stroke-width="1.25"`);
      cv.add(`<circle cx="${W}" cy="${f1(-A * g(1))}" r="4" fill="var(--dg-bg,#fff)"/>`, [
        W + 4,
        0,
      ]);
    } else clamp(W, 1);
  }
  cv.line([0, 0], [W, 0], ` stroke-width="1" stroke-opacity=".35" stroke-dasharray="2 4"`);
  cv.add(curve(pts(-1), ` stroke="${ACCENT}" stroke-width="1.5" stroke-dasharray="5 4"`));
  cv.add(curve(pts(1), ` stroke="${ACCENT}" stroke-width="2.25"`), [0, -A], [W, A]);
  const yLab = WALL + 16;
  const size = den > 16 ? 10 : 12;
  for (let k = 0; k <= den; k++) {
    const x = (k / den) * W;
    const node = nodeK.includes(k);
    if (node) cv.add(`<circle cx="${f1(x)}" cy="0" r="3" stroke="none"/>`);
    cv.text([x, yLab], node ? "N" : "A", "middle", node ? "" : ` fill="${ACCENT}"`, size);
  }
  const lText = (s: string, v: number | undefined, show: boolean) =>
    show && v !== undefined ? `${s} = ${fmt(v)}${unit}` : s;
  dimMark(cv, [0, yLab + 22], [W, yLab + 22], lText("L", L, num));
  if (ratio <= 1) {
    // one wavelength, from the left end
    dimMark(cv, [0, -WALL - 14], [W * ratio, -WALL - 14], lText("λ", model.wavelength, all), -1);
  }

  const list = (ks: number[]) => ks.map((k) => frac(k, den)).join(", ");
  const mode = mixed ? (n + 1) / 2 : n;
  const alt =
    `Standing wave${h.text ? ` (${plain(h.text)})` : ""} ${medium === "string" ? "on" : "in"} ${what}, ` +
    `harmonic n = ${n}${mixed && n > 1 ? ` (the ${ORD[mode] ?? `${mode}th`} mode; even harmonics do not exist here)` : n === 1 ? " (the fundamental)" : ""}` +
    `${medium === "pipe" ? "; the curve shows the displacement of the air" : ""}. ` +
    `${nodeK.length} node${nodeK.length > 1 ? "s" : ""} at ${list(nodeK)}; ${antiK.length} antinode${antiK.length > 1 ? "s" : ""} at ${list(antiK)}. ` +
    `Wavelength ${frac(mixed ? 4 : 2, n)}${L !== undefined ? ` = ${fmt(L * ratio)}${unit} for L = ${fmt(L)}${unit}` : ""}.`;
  const b = finish(cv, h.text);
  return { svg: wrap(b.w, b.h, cv.body, alt, b.x0, b.y0), alt, wave: model };
}

// ---------------------------------------------------------------------------------------------

function travelling(h: Cmd, errs: DgError[]): Out {
  unknownWords(
    h,
    [...KINDS, "num"],
    ["lambda", "A", "unit", "v", "cycles", "num"],
    errs,
    "use any of: lambda= A= unit= v=right cycles= num",
  );
  const lambda = kvNum(h, "lambda", errs),
    amp = kvNum(h, "A", errs);
  const cycles = kvNum(h, "cycles", errs, 2.5)!;
  if (lambda !== undefined && !(lambda > 0))
    errs.push({ line: h.line, msg: "lambda must be positive" });
  if (amp !== undefined && !(amp > 0)) errs.push({ line: h.line, msg: "A must be positive" });
  if (!(cycles >= 1.5 && cycles <= 5))
    errs.push({ line: h.line, msg: "cycles must be between 1.5 and 5" });
  const v = h.kv.v;
  if (v !== undefined && !["right", "left"].includes(v))
    errs.push({ line: h.line, msg: `v must be right or left, got "${v}"` });
  if (errs.length) return { svg: "", alt: "" };
  const unit = h.kv.unit ? ` ${h.kv.unit}` : "";
  const { num } = numFlags(h);

  const K = 380 / cycles, // px per wavelength
    A = 40;
  const W = K * cycles;
  const cv = new Canvas();
  cv.line([-6, 0], [W + 6, 0], ` stroke-width="1" stroke-opacity=".5" stroke-dasharray="5 4"`);
  const pts: P[] = [];
  for (let i = 0; i <= 240; i++) {
    const x = (i / 240) * W;
    pts.push([x, -A * Math.sin((2 * Math.PI * x) / K)]);
  }
  cv.add(curve(pts, ` stroke="${ACCENT}" stroke-width="2.25"`), [0, -A], [W, A]);
  // wavelength: crest to crest
  dimMark(
    cv,
    [K / 4, -A - 14],
    [(5 * K) / 4, -A - 14],
    num && lambda !== undefined ? `λ = ${fmt(lambda)}${unit}` : "λ",
    -1,
  );
  // amplitude: from the rest position to the height of a crest, marked beside the wave
  cv.line([-18, -A], [K / 4, -A], ` stroke-width="1" stroke-opacity=".4" stroke-dasharray="2 3"`);
  dimMark(cv, [-18, -A], [-18, 0], num && amp !== undefined ? `A = ${fmt(amp)}${unit}` : "A", 1);
  if (v) {
    const d = v === "right" ? 1 : -1;
    const x = W / 2 + K * 0.75 + (cycles < 2.2 ? -K * 0.5 : 0);
    cv.arrow([x - d * 22, -A - 34], [x + d * 22, -A - 34], "currentColor", 2, 8);
    cv.text([x, -A - 46], "v", "middle");
  }
  const alt =
    `Travelling wave${h.text ? ` (${plain(h.text)})` : ""}: a sinusoid, ${fmt(cycles)} wavelengths shown${v ? `, moving ${v}` : ""}. ` +
    `The wavelength λ${lambda !== undefined ? ` (${fmt(lambda)}${unit})` : ""} is marked from crest to crest and the amplitude A${amp !== undefined ? ` (${fmt(amp)}${unit})` : ""} from the rest position to a crest.`;
  const b = finish(cv, h.text);
  return {
    svg: wrap(b.w, b.h, cv.body, alt, b.x0, b.y0),
    alt,
    wave: { kind: "travelling", wavelength: lambda, amplitude: amp },
  };
}

// ---------------------------------------------------------------------------------------------

type Pulse = {
  c: number;
  h: number;
  w: number;
  shape: "tri" | "rect" | "half";
  v?: string;
  line: number;
};
const SHAPES: Record<string, Pulse["shape"]> = {
  tri: "tri",
  triangle: "tri",
  rect: "rect",
  square: "rect",
  half: "half",
  sine: "half",
  bump: "half",
};
const SHAPE_NAME = { tri: "triangular", rect: "rectangular", half: "rounded" };

function pulses(doc: Doc, errs: DgError[], warns: DgError[]): Out {
  const h = doc.head;
  unknownWords(h, [...KINDS, "num"], ["xr", "num"], errs, "use xr=0..10 and num");
  const ps: Pulse[] = [];
  for (const c of doc.cmds) {
    if (c.op !== "pulse") {
      errs.push({ line: c.line, msg: `wave pulses has no "${c.op}" (use pulse 3 h=1 w=2)` });
      continue;
    }
    unknownWords(
      c,
      Object.keys(SHAPES),
      ["h", "w", "v", "x"],
      errs,
      "use pulse 3 h=1 w=2 tri|rect|half v=right",
      1,
    );
    const x = argNum(c.args[0]) ?? kvNum(c, "x", errs);
    const hh = kvNum(c, "h", errs, 1)!,
      w = kvNum(c, "w", errs, 2)!;
    if (x === undefined) {
      errs.push({ line: c.line, msg: "pulse needs the position of its centre: pulse 3 h=1 w=2" });
      continue;
    }
    if (!(w > 0)) errs.push({ line: c.line, msg: "the pulse width w must be positive" });
    if (hh === 0) errs.push({ line: c.line, msg: "the pulse height h cannot be 0" });
    if (c.kv.v !== undefined && !["right", "left"].includes(c.kv.v))
      errs.push({ line: c.line, msg: `v must be right or left, got "${c.kv.v}"` });
    const word = c.args.slice(1).find((a) => a in SHAPES);
    ps.push({ c: x, h: hh, w, shape: word ? SHAPES[word] : "tri", v: c.kv.v, line: c.line });
  }
  if (ps.length < 2)
    errs.push({ line: h.line, msg: "wave pulses needs two pulse lines, e.g. pulse 3 h=1 w=2" });
  if (ps.length > 4) errs.push({ line: ps[4].line, msg: "at most 4 pulses can be drawn" });
  let lo = Math.min(...ps.map((p) => p.c - p.w / 2)) - 1,
    hi = Math.max(...ps.map((p) => p.c + p.w / 2)) + 1;
  if (h.kv.xr) [lo, hi] = range(h.kv.xr, h.line, errs);
  if (!(hi > lo)) errs.push({ line: h.line, msg: "xr must run from a smaller to a larger number" });
  if (errs.length) return { svg: "", alt: "" };

  const one = (p: Pulse, x: number) => {
    const u = Math.abs(x - p.c) / (p.w / 2);
    if (u >= 1) return 0;
    return p.shape === "rect"
      ? p.h
      : p.shape === "tri"
        ? p.h * (1 - u)
        : p.h * Math.cos((u * Math.PI) / 2);
  };
  const sumAt = (x: number) => ps.reduce((s, p) => s + one(p, x), 0);
  // sample at every corner (from both sides, so a step stays a step) and finely along curves
  const xs = new Set<number>([lo, hi]);
  for (const p of ps) for (const x of [p.c - p.w / 2, p.c, p.c + p.w / 2]) xs.add(x);
  if (ps.some((p) => p.shape === "half"))
    for (let i = 0; i <= 400; i++) xs.add(lo + ((hi - lo) * i) / 400);
  const grid = [...xs].filter((x) => x >= lo && x <= hi).sort((a, b) => a - b);
  const E = (hi - lo) * 1e-7;
  const sample = (f: (x: number) => number): P[] => {
    const out: P[] = [];
    for (const x of grid)
      for (const y of [f(x - E), f(x + E)])
        if (!out.length || out[out.length - 1][0] !== x || out[out.length - 1][1] !== y)
          out.push([x, y]);
    return out;
  };
  const sum = sample(sumAt);
  const max = Math.max(...sum.map((p) => p[1])),
    min = Math.min(...sum.map((p) => p[1]));

  const kx = 400 / (hi - lo);
  const top = Math.max(0.5, ...ps.map((p) => p.h), max),
    bot = Math.min(-0.5, ...ps.map((p) => p.h), min);
  const ky = Math.min(30, 150 / (top - bot));
  const rowH = (top - bot) * ky;
  const { num } = numFlags(h);
  const cv = new Canvas();
  const scale: string[] = [];
  const rows: [string, number][] = [
    ["pulses", 0],
    ["sum", rowH + 30],
  ];
  for (const [name, y0] of rows) {
    const S = (p: P): P => [(p[0] - lo) * kx, y0 - p[1] * ky];
    // unit grid, so heights can be read and compared
    const faint = ` stroke-width="1" stroke-opacity=".13"`;
    if (hi - lo <= 30)
      for (let x = Math.ceil(lo); x <= hi + 1e-9; x++) cv.line(S([x, top]), S([x, bot]), faint);
    if (top - bot <= 12)
      for (let y = Math.ceil(bot); y <= top + 1e-9; y++)
        if (y !== 0) cv.line(S([lo, y]), S([hi, y]), faint);
    cv.line(S([lo, 0]), S([hi, 0]), ` stroke-width="1" stroke-opacity=".6"`);
    cv.text([-10, y0], name, "end", ` fill-opacity=".7"`, 11);
    if (name === "sum") cv.add(curve(sum.map(S), ` stroke="${ACCENT}" stroke-width="2.5"`));
    else
      ps.forEach((p, i) => {
        cv.add(
          curve(
            sample((x) => one(p, x)).map(S),
            ` stroke-width="2"${i % 2 ? ` stroke-dasharray="6 4"` : ""}`,
          ),
        );
        if (p.v) {
          const d = p.v === "right" ? 1 : -1;
          const ya = y0 - p.h * ky - Math.sign(p.h) * 12;
          cv.arrow(
            [S([p.c, 0])[0] - d * 13, ya],
            [S([p.c, 0])[0] + d * 13, ya],
            "currentColor",
            1.75,
            7,
          );
        }
      });
    cv.see(S([lo, top]));
    cv.see(S([hi, bot]));
    if (num && name === "sum") {
      const step = hi - lo > 14 ? 2 : 1;
      for (let x = Math.ceil(lo / step) * step; x <= hi + 1e-9; x += step) {
        cv.text([S([x, 0])[0], y0 - bot * ky + 13], fmt(x), "middle", "", 10);
        scale.push(fmt(x));
      }
      for (let y = Math.ceil(bot); y <= top + 1e-9; y++) {
        cv.text([S([hi, y])[0] + 8, S([hi, y])[1]], fmt(y), "start", "", 10);
        scale.push(fmt(y));
      }
    }
  }
  if (ps.every((p, i) => i === 0 || Math.abs(p.c - ps[0].c) >= (p.w + ps[0].w) / 2))
    warns.push({
      line: ps[1].line,
      kind: "readability",
      msg: "the pulses do not overlap at this instant, so their sum is just the two pulses side by side; move the centres closer to show superposition",
    });

  const where = (v: number) => {
    const hit = sum.filter((p) => Math.abs(p[1] - v) < 1e-9).map((p) => p[0]);
    const [a, b] = [Math.min(...hit), Math.max(...hit)];
    return a === b ? `x = ${fmt(a)}` : `x = ${fmt(a)} to ${fmt(b)}`;
  };
  const alt =
    `Superposition of ${ps.length} pulses at one instant${h.text ? ` (${plain(h.text)})` : ""}: ` +
    ps
      .map(
        (p) =>
          `a ${SHAPE_NAME[p.shape]} pulse of height ${fmt(p.h)} and width ${fmt(p.w)} centred at x = ${fmt(p.c)}${p.v ? ` moving ${p.v}` : ""}`,
      )
      .join("; ") +
    `. Below them, their sum: ${max > 1e-9 ? `greatest displacement ${fmt(max)} at ${where(max)}` : "nowhere above the rest position"}` +
    `${min < -1e-9 ? `, lowest ${fmt(min)} at ${where(min)}` : ""}.`;
  const b = finish(cv, h.text);
  return {
    svg: wrap(b.w, b.h, cv.body, alt, b.x0, b.y0),
    alt,
    scale,
    wave: { kind: "superposition", sum, max, min, at: sumAt },
  };
}

// ---------------------------------------------------------------------------------------------

const LENGTH_UNITS: Record<string, number> = {
  nm: 1e-9,
  um: 1e-6,
  μm: 1e-6,
  µm: 1e-6,
  mm: 1e-3,
  cm: 1e-2,
  m: 1,
};

/** "500nm", "0.1mm", "2m", "5e-7" -> metres. */
function length(h: Cmd, key: string, errs: DgError[]): number | undefined {
  const s = h.kv[key];
  if (s === undefined) return undefined;
  const m = s.match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(nm|um|μm|µm|mm|cm|m)?$/);
  const v = m ? Number(m[1]) * (m[2] ? LENGTH_UNITS[m[2]] : 1) : NaN;
  if (!(v > 0)) {
    errs.push({
      line: h.line,
      msg: `${key} needs a positive length such as 500nm, 0.1mm or 2m, got "${s}"`,
    });
    return undefined;
  }
  return v;
}
/** A screen distance in the unit that reads best (for `like`, so a row of them shares one unit). */
function niceLength(m: number, like = m): string {
  const a = Math.abs(like);
  if (m === 0) return "0";
  return a >= 1 ? `${fmt(m)} m` : a >= 1e-2 ? `${fmt(m * 100)} cm` : `${fmt(m * 1e3)} mm`;
}

function slits(h: Cmd, kind: "double" | "single", errs: DgError[]): Out {
  const dbl = kind === "double";
  unknownWords(
    h,
    [...KINDS, "num"],
    dbl ? ["orders", "da", "lambda", "d", "L", "num"] : ["orders", "lambda", "a", "L", "num"],
    errs,
    dbl
      ? "use any of: orders=2 da=4 lambda=500nm d=0.1mm L=2m num"
      : "use any of: orders=3 lambda=500nm a=0.05mm L=2m num",
  );
  const orders = kvNum(h, "orders", errs, dbl ? 2 : 3)!;
  if (!Number.isInteger(orders) || orders < 1 || orders > 5)
    errs.push({ line: h.line, msg: "orders must be a whole number from 1 to 5" });
  const da = dbl ? kvNum(h, "da", errs) : undefined;
  if (da !== undefined && !(da > 1))
    errs.push({
      line: h.line,
      msg: "da is slit separation ÷ slit width and must be more than 1 (the slits cannot overlap)",
    });
  const lambda = length(h, "lambda", errs),
    sep = length(h, dbl ? "d" : "a", errs),
    L = length(h, "L", errs);
  if (errs.length) return { svg: "", alt: "" };
  const spacing =
    lambda !== undefined && sep !== undefined && L !== undefined ? (lambda * L) / sep : undefined;
  const sinc2 = (x: number) => (Math.abs(x) < 1e-9 ? 1 : (Math.sin(x) / x) ** 2);
  const intensity = (u: number) =>
    dbl ? Math.cos(Math.PI * u) ** 2 * (da ? sinc2((Math.PI * u) / da) : 1) : sinc2(Math.PI * u);
  const missing: number[] = [];
  if (da)
    for (let m = 1; m <= orders; m++)
      if (Math.abs(m / da - Math.round(m / da)) < 1e-9) missing.push(m);
  const { num, all } = numFlags(h);

  const uMax = orders + (dbl ? 0.5 : 0.45);
  const W = 420,
    H = 96;
  const X = (u: number) => (u / uMax) * (W / 2);
  const cv = new Canvas();
  const scale: string[] = [];
  const pts: P[] = [];
  for (let i = 0; i <= 480; i++) {
    const u = -uMax + (2 * uMax * i) / 480;
    pts.push([X(u), -H * intensity(u)]);
  }
  cv.add(
    `<polygon points="${[[-W / 2, 0], ...pts, [W / 2, 0]].map((p) => `${f1(p[0])},${f1(p[1])}`).join(" ")}" fill="${ACCENT}" fill-opacity=".14" stroke="none"/>`,
  );
  cv.add(curve(pts, ` stroke="${ACCENT}" stroke-width="2"`), [-W / 2, -H], [W / 2, 0]);
  cv.line([-W / 2 - 8, 0], [W / 2 + 8, 0], ` stroke-width="1.25"`);
  cv.text([0, -H - 13], "central maximum", "middle", "", 12);
  const yM = 15;
  cv.text([-W / 2 - 12, yM], "m =", "end", "", 11);
  for (let m = -orders; m <= orders; m++) {
    if (!dbl && m === 0) continue;
    if (missing.includes(Math.abs(m))) continue;
    cv.line([X(m), 0], [X(m), 4], ` stroke-width="1"`);
    cv.text([X(m), yM], fmt(m), "middle", "", 11);
    scale.push(fmt(m)); // an order number is a tick label, not a claim
    if (all && spacing !== undefined)
      cv.text([X(m), yM + 15], niceLength(m * spacing, spacing), "middle", "", 10);
  }
  let yAxis = yM + (all && spacing !== undefined ? 32 : 18);
  cv.text(
    [0, yAxis],
    `position on the screen${dbl ? "" : " (m marks the dark fringes)"}`,
    "middle",
    ` fill-opacity=".7"`,
    11,
  );
  cv.text([-W / 2 - 12, -H / 2], "intensity", "end", ` fill-opacity=".7"`, 11);
  if (num) {
    const given = [
      ["λ", h.kv.lambda],
      [dbl ? "d" : "a", h.kv[dbl ? "d" : "a"]],
      ["L", h.kv.L],
    ].filter((g) => g[1] !== undefined);
    if (given.length) {
      yAxis += 16;
      cv.text(
        [0, yAxis],
        given
          .map(([k, v]) => `${k} = ${String(v).replace(/([\d.])([a-zμµ]+)$/, "$1 $2")}`)
          .join(",  "),
        "middle",
        "",
        11,
      );
    }
  }
  const alt = dbl
    ? `Double-slit intensity pattern${h.text ? ` (${plain(h.text)})` : ""}: evenly spaced bright fringes, the central maximum (m = 0) in the middle and orders m = ±1 to ±${orders} on each side` +
      `${da ? `, their heights falling off under the single-slit envelope (slit separation ${fmt(da)} times the slit width)${missing.length ? `; order${missing.length > 1 ? "s" : ""} ±${missing.join(", ±")} missing` : ""}` : ", all equally bright"}.` +
      `${spacing !== undefined ? ` Fringe spacing λL/d = ${niceLength(spacing)}.` : ""}`
    : `Single-slit intensity pattern${h.text ? ` (${plain(h.text)})` : ""}: a broad central maximum twice as wide as the side fringes, with dark fringes m = ±1 to ±${orders} and much dimmer bright fringes between them.` +
      `${spacing !== undefined ? ` Dark fringes are λL/a = ${niceLength(spacing)} apart; the central maximum is ${niceLength(2 * spacing)} wide.` : ""}`;
  const b = finish(cv, h.text);
  return {
    svg: wrap(b.w, b.h, cv.body, alt, b.x0, b.y0),
    alt,
    scale,
    wave: { kind: dbl ? "double-slit" : "single-slit", orders, spacing, missing, intensity },
  };
}
