// Small drawing and parsing helpers shared by the second batch of kinds (ray, wave, pv, levels,
// rigid). Kept apart from svg.ts so the older kinds' output cannot change by accident.

import { type Cmd, type DgError } from "./parse";
import { arrow, f1, line, poly, text, textWidth, type P } from "./svg";

export type Anchor = "start" | "middle" | "end";

/** A number as a student reads it: at most `sig` significant figures, a real minus sign. */
export function fmt(n: number, sig = 3): string {
  if (!Number.isFinite(n)) return n > 0 ? "∞" : n < 0 ? "−∞" : "?";
  if (n === 0) return "0";
  const a = Math.abs(n);
  const s =
    a >= 1e5 || a < 1e-3
      ? n
          .toExponential(Math.max(0, sig - 1))
          .replace(/\.?0+e/, "e")
          .replace(/e\+?(-?)(\d+)/, "×10^{$1$2}")
      : String(+n.toPrecision(sig));
  return s.replace(/-/g, "−");
}

/** key=number on a command; `dflt` when absent. Accepts a typographic minus. */
export function kvNum(c: Cmd, key: string, errs: DgError[], dflt?: number): number | undefined {
  const s = c.kv[key];
  if (s === undefined) return dflt;
  const n = Number(s.replace("−", "-"));
  if (!Number.isFinite(n)) {
    errs.push({ line: c.line, msg: `${key} needs a number, got "${s}"` });
    return dflt;
  }
  return n;
}

/** A bare number argument. */
export function argNum(s: string | undefined): number | undefined {
  if (s === undefined || s === "") return undefined;
  const n = Number(s.replace("−", "-"));
  return Number.isFinite(n) ? n : undefined;
}

/** Report the words and keys on a command that the kind does not know. */
export function unknownWords(
  c: Cmd,
  words: readonly string[],
  keys: readonly string[],
  errs: DgError[],
  hint: string,
  skipArgs = 0,
): void {
  for (const a of c.args.slice(skipArgs))
    if (!words.includes(a)) errs.push({ line: c.line, msg: `${c.op} has no "${a}" (${hint})` });
  for (const k of Object.keys(c.kv))
    if (!keys.includes(k)) errs.push({ line: c.line, msg: `${c.op} has no "${k}=" (${hint})` });
}

/** Tracks what has been drawn, for the view box and for keeping labels apart. */
export class Canvas {
  body = "";
  private pts: P[] = [];
  private boxes: [number, number, number, number][] = [];

  see(p: P, w = 0, h = 0): void {
    this.pts.push([p[0] - w, p[1] - h], [p[0] + w, p[1] + h]);
  }
  add(svg: string, ...pts: P[]): void {
    this.body += svg;
    for (const p of pts) this.see(p);
  }
  line(a: P, b: P, extra = ""): void {
    this.add(line(a, b, extra), a, b);
  }
  dashed(a: P, b: P, extra = ""): void {
    this.add(line(a, b, ` stroke-dasharray="5 4"${extra}`), a, b);
  }
  arrow(a: P, b: P, color?: string, width = 2, head = 9): void {
    this.add(arrow(a, b, color, width, head), a, b);
    this.see(b, 4, 4);
  }
  private rect(p: P, s: string, anchor: Anchor, size: number): [number, number, number, number] {
    const w = (textWidth(s) * size) / 13;
    const left = anchor === "start" ? p[0] : anchor === "end" ? p[0] - w : p[0] - w / 2;
    return [left - 2, p[1] - size * 0.62, left + w + 2, p[1] + size * 0.62];
  }
  private hits(r: [number, number, number, number]): boolean {
    return this.boxes.some((q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1]);
  }
  /** Draw a label and remember its box. */
  text(p: P, s: string, anchor: Anchor = "middle", extra = "", size = 13): void {
    const r = this.rect(p, s, anchor, size);
    this.boxes.push(r);
    this.pts.push([r[0], r[1]], [r[2], r[3]]);
    this.body += text(
      p,
      s,
      anchor,
      ` stroke="none"${size !== 13 ? ` font-size="${size}"` : ""}${extra}`,
    );
  }
  /** Draw a label at the first candidate position that is clear of every label so far. */
  place(cands: [P, Anchor][], s: string, extra = "", size = 13): P {
    const [p, a] = cands.find(([q, an]) => !this.hits(this.rect(q, s, an, size))) ?? cands[0];
    this.text(p, s, a, extra, size);
    return p;
  }
  /** Keep labels placed later off this area (a symbol, an arrowhead). */
  reserve(x0: number, y0: number, x1: number, y1: number): void {
    this.boxes.push([Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)]);
  }
  /** Keep labels placed later off a line (a ray, a force arrow). */
  reserveLine(a: P, b: P, half = 3): void {
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 6));
    for (let i = 0; i <= n; i++) {
      const p: P = [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n];
      this.boxes.push([p[0] - half, p[1] - half, p[0] + half, p[1] + half]);
    }
  }
  bounds(pad = 10): { x0: number; y0: number; w: number; h: number } {
    const pts = this.pts.length ? this.pts : ([[0, 0]] as P[]);
    const x0 = Math.min(...pts.map((p) => p[0])) - pad,
      x1 = Math.max(...pts.map((p) => p[0])) + pad;
    const y0 = Math.min(...pts.map((p) => p[1])) - pad,
      y1 = Math.max(...pts.map((p) => p[1])) + pad;
    return { x0, y0, w: x1 - x0, h: y1 - y0 };
  }
}

/** A dimension mark: a thin line from a to b with end ticks and a label beside its middle. */
export function dimMark(cv: Canvas, a: P, b: P, s: string, side: 1 | -1 = 1): void {
  // side 1 is below a mark drawn left to right, whichever way its ends were given
  if (b[0] < a[0] - 0.5 || (Math.abs(b[0] - a[0]) <= 0.5 && b[1] < a[1])) [a, b] = [b, a];
  const d: P = [b[0] - a[0], b[1] - a[1]];
  const len = Math.hypot(d[0], d[1]) || 1;
  const n: P = [(-d[1] / len) * side, (d[0] / len) * side];
  const thin = ` stroke-width="1" stroke-opacity=".7"`;
  cv.line(a, b, thin);
  for (const p of [a, b])
    cv.line([p[0] - n[0] * 4, p[1] - n[1] * 4], [p[0] + n[0] * 4, p[1] + n[1] * 4], thin);
  const off = 10 + (Math.abs(n[0]) * textWidth(s) * 11) / 26;
  // beside the middle, or further along the mark when something is already there
  cv.place(
    [0.5, 0.3, 0.7, 0.15, 0.85].map((t): [P, Anchor] => [
      [a[0] + d[0] * t + n[0] * off, a[1] + d[1] * t + n[1] * off],
      "middle",
    ]),
    s,
    "",
    11,
  );
  cv.reserveLine(a, b);
}

/** A small filled arrowhead at p pointing along (dx, dy): marks the direction of a ray or a path. */
export function chevron(p: P, dx: number, dy: number, color: string, size = 7): string {
  const l = Math.hypot(dx, dy) || 1;
  const u: P = [dx / l, dy / l];
  const tip: P = [p[0] + u[0] * size * 0.55, p[1] + u[1] * size * 0.55];
  const back = (s: number): P => [
    p[0] - u[0] * size * 0.45 - u[1] * s * size * 0.42,
    p[1] - u[1] * size * 0.45 + u[0] * s * size * 0.42,
  ];
  return poly([tip, back(1), back(-1)], true, ` fill="${color}" stroke="none"`);
}

/** A smooth curve through sampled points. */
export function curve(pts: P[], extra = ""): string {
  return `<polyline points="${pts.map((p) => `${f1(p[0])},${f1(p[1])}`).join(" ")}" fill="none"${extra}/>`;
}

/** Title above everything drawn so far. Returns the finished view box. */
export function finish(cv: Canvas, title: string | undefined, pad = 10) {
  if (title) {
    const b = cv.bounds(0);
    cv.text([b.x0 + b.w / 2, b.y0 - 14], title, "middle");
  }
  return cv.bounds(pad);
}
