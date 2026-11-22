// circuit: schematic diagrams from a description of what is connected to what. The author names
// the nodes each element sits between; the renderer works out the series / parallel structure and
// draws a tidy rectangular schematic, so the wiring can't be drawn wrong.
//
// circuit
// battery a d 12V "ε" [r=0.5Ω]            first node is the + terminal
// resistor a b 4Ω R_1 [i=I_1]             value and label are optional; i= draws a current arrow a->b
// capacitor b c 10μF C   inductor b c 2mH L   bulb b c   wire c d
// switch a b open|closed S
// ammeter c d   voltmeter b c             an ammeter sits in series, a voltmeter across
// series a d resistor 4Ω R_1 switch open S capacitor 10μF C     a chain from a to d
// parallel b c resistor 6Ω R_2 resistor 3Ω R_3                 each element from b to c
// ground d     node b "B"                 ground symbol; a labelled dot on a node
// at a 0,2 b 2,2 c 2,0 d 0,0              optional: place every node on a grid yourself (y up)
//
// Layout: the first battery goes on the left; everything else is reduced to series and parallel
// groups and drawn as rungs between a top and a bottom rail. A circuit that is not series-parallel
// (a bridge) needs `at`.

import { type Circuit, type CircuitElement, circuitFromDoc, solveCircuit } from "./circuit-solve";
import { type DgError, type Doc } from "./parse";
import { ACCENT, arrow, f1, line, plain, poly, text, textWidth, wrap, type P } from "./svg";

type El =
  | CircuitElement
  | { type: "gap"; id: string; a: string; b: string; labels: string[]; line: number };
type Tree =
  | { k: "leaf"; el: El; flip: boolean; ord: number }
  | { k: "ser"; items: Tree[]; ord: number }
  | { k: "par"; items: Tree[]; ord: number };
type Block = { L: number; R: number; H: number; place: (x: number, y: number, h: number) => void };
type Rect = [number, number, number, number];

const VH = 84; // a vertical element's share of a rung
const HMIN = 84; // a horizontal element's share of a rail
const GAPX = 22;
const MINCOL = 72;
const LINE_H = 15;
const SCALE = 1.3;

/** Half-length along the wire, half-width on the label side, half-width on the other side. */
const SIZE: Record<El["type"], [number, number, number]> = {
  resistor: [20, 8, 8],
  battery: [4, 13, 13],
  capacitor: [4, 12, 12],
  inductor: [18, 7, 2],
  bulb: [12, 12, 12],
  switch: [13, 14, 4],
  ammeter: [12, 12, 12],
  voltmeter: [12, 12, 12],
  wire: [0, 2, 2],
  gap: [9, 4, 4],
};
const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];
const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const mul = (a: P, k: number): P => [a[0] * k, a[1] * k];
const key = (p: P) => `${Math.round(p[0] * 2)},${Math.round(p[1] * 2)}`;

const hasR = (el: El): el is CircuitElement =>
  el.type === "battery" && (el as CircuitElement).r !== undefined;
function labelLines(el: El): string[] {
  if (el.type === "gap") return [];
  const out = [...el.labels];
  if (el.valueText) out.push(el.valueText);
  if (el.rText) out.push(`r = ${el.rText}`);
  return out;
}
function dims(el: El) {
  let [half, hw] = SIZE[el.type];
  const hwo = SIZE[el.type][2];
  if (hasR(el)) half = 22;
  if (el.type === "switch" && (el as CircuitElement).open === false) hw = 5;
  const lines = labelLines(el);
  return {
    half,
    hw,
    hwo,
    lines,
    lw: Math.max(0, ...lines.map(textWidth)),
    lh: lines.length * LINE_H,
  };
}
/** A short name for messages and alt text: the label, else the kind of element. */
function nameOf(el: El): string {
  if (el.type === "gap") return "a break";
  const l = el.labels[0] ? plain(el.labels[0]) : "";
  const kind = el.type === "switch" ? `${el.open === false ? "closed" : "open"} switch` : el.type;
  if (l) return ["resistor", "capacitor", "inductor"].includes(el.type) ? l : `${kind} ${l}`;
  return el.valueText ? `${el.valueText} ${kind}` : kind;
}
function describe(el: El): string {
  if (el.type === "gap") return "a break in the wire";
  const n = nameOf(el);
  const extra = [
    el.labels[0] && el.valueText ? el.valueText : "",
    el.rText ? `internal resistance ${el.rText}` : "",
  ].filter(Boolean);
  return extra.length ? `${n} (${extra.join(", ")})` : n;
}

export function renderCircuit(
  doc: Doc,
  errs: DgError[],
  warns: DgError[] = [],
): { svg: string; alt: string } {
  const c = circuitFromDoc(doc, errs);
  if (!c.elements.length) {
    // first, so a wrong first guess at the syntax is reported at the top
    errs.unshift({
      line: doc.head.line,
      msg: "circuit has no elements; write one per line with its two nodes, e.g. battery a b 12V then resistor a b 4Ω",
    });
    return { svg: "", alt: "" };
  }
  physicsChecks(c, warns);

  // ---- drawing surface ----
  let body = "";
  const rects: Rect[] = [];
  const arms = new Map<string, { p: P; n: number }>();
  const nodePts = new Map<string, P[]>();
  const arm = (p: P) => {
    const k = key(p);
    const a = arms.get(k);
    if (a) a.n++;
    else arms.set(k, { p, n: 1 });
  };
  const box = (r: Rect) => rects.push(r);
  const wire = (a: P, b: P) => {
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.01) return;
    body += line(a, b);
    arm(a);
    arm(b);
    box([Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]);
  };
  const put = (p: P, s: string, anchor: "start" | "middle" | "end", extra = "") => {
    const w = textWidth(s);
    const left = anchor === "start" ? p[0] : anchor === "end" ? p[0] - w : p[0] - w / 2;
    box([left - 2, p[1] - 8, left + w + 2, p[1] + 8]);
    body += text(p, s, anchor, ` stroke="none"${extra}`);
  };
  type Spot = { p: P; s: string; anchor: "start" | "middle" | "end" };
  const labelJobs: Spot[][][] = []; // per element: candidate placements, each a list of lines
  const seeNode = (n: string, p: P) => {
    if (!nodePts.has(n)) nodePts.set(n, []);
    nodePts.get(n)!.push(p);
  };

  /** One element drawn straight from A (its first node) to B, labels on the side ln points to. */
  const drawElement = (el: El, A: P, B: P, lnIn: P) => {
    const d = sub(B, A);
    const len = Math.hypot(d[0], d[1]) || 1;
    const u: P = [d[0] / len, d[1] / len];
    let n: P = [-u[1], u[0]];
    if (n[0] * lnIn[0] + n[1] * lnIn[1] < 0) n = mul(n, -1);
    const M = mul(add(A, B), 0.5);
    const L = (al: number, pe: number): P => add(M, add(mul(u, al), mul(n, pe)));
    const { half, hw, hwo, lines } = dims(el);
    seeNode(el.a, A);
    seeNode(el.b, B);
    arm(A);
    arm(B);
    if (el.type === "wire") {
      body += line(A, B);
      box([Math.min(A[0], B[0]), Math.min(A[1], B[1]), Math.max(A[0], B[0]), Math.max(A[1], B[1])]);
    } else {
      body += line(A, L(-half, 0)) + line(L(half, 0), B);
      const corners = [L(-half, hw), L(half, hw), L(-half, -hwo), L(half, -hwo), A, B];
      box([
        Math.min(...corners.map((p) => p[0])),
        Math.min(...corners.map((p) => p[1])),
        Math.max(...corners.map((p) => p[0])),
        Math.max(...corners.map((p) => p[1])),
      ]);
    }
    const zig = (from: number, to: number, amp: number, teeth: number): P[] => {
      const pts: P[] = [L(from, 0)];
      const step = (to - from) / teeth;
      for (let i = 0; i < teeth; i++) pts.push(L(from + step * (i + 0.5), i % 2 ? amp : -amp));
      pts.push(L(to, 0));
      return pts;
    };
    switch (el.type) {
      case "resistor":
        body += poly(zig(-20, 20, 7.5, 6), false, ` fill="none"`);
        break;
      case "battery": {
        const at = hasR(el) ? -14 : 0;
        body += line(L(at - 3.5, -12), L(at - 3.5, 12), ` stroke-width="1.5"`);
        body += line(L(at + 3.5, -6), L(at + 3.5, 6), ` stroke-width="3.5" stroke-linecap="butt"`);
        // the long plate is the + terminal; say so, on the side away from the labels
        const plus = L(at - 12, -8);
        body += `<text x="${f1(plus[0])}" y="${f1(plus[1])}" text-anchor="middle" dominant-baseline="middle" stroke="none" font-size="11">+</text>`;
        if (hasR(el)) {
          body += line(L(at - 22 + 14, 0), L(at - 3.5, 0)) + line(L(at + 3.5, 0), L(-2, 0));
          body += poly(zig(-2, 22, 5, 6), false, ` fill="none"`);
        }
        break;
      }
      case "capacitor":
        body += line(L(-4, -11), L(-4, 11), ` stroke-width="2"`);
        body += line(L(4, -11), L(4, 11), ` stroke-width="2"`);
        break;
      case "inductor": {
        const pts: P[] = [];
        for (let b = 0; b < 4; b++)
          for (let i = b ? 1 : 0; i <= 8; i++) {
            const th = Math.PI * (1 - i / 8);
            pts.push(L(-13.5 + b * 9 + 4.5 * Math.cos(th), 6.5 * Math.sin(th)));
          }
        body += poly(pts, false, ` fill="none"`);
        break;
      }
      case "bulb": {
        body += `<circle cx="${f1(M[0])}" cy="${f1(M[1])}" r="12" fill="none"/>`;
        const k = 12 * Math.SQRT1_2;
        body += line([M[0] - k, M[1] - k], [M[0] + k, M[1] + k]);
        body += line([M[0] - k, M[1] + k], [M[0] + k, M[1] - k]);
        break;
      }
      case "switch": {
        const [p, q] = [L(-11, 0), L(11, 0)];
        body += el.open === false ? line(p, q) : line(p, L(9, 12));
        for (const t of [p, q])
          body += `<circle cx="${f1(t[0])}" cy="${f1(t[1])}" r="2.5" fill="var(--dg-bg,#fff)"/>`;
        body += line(L(-13, 0), L(-13.5, 0)) + line(L(13, 0), L(13.5, 0));
        break;
      }
      case "ammeter":
      case "voltmeter":
        body += `<circle cx="${f1(M[0])}" cy="${f1(M[1])}" r="12" fill="none"/>`;
        body += `<text x="${f1(M[0])}" y="${f1(M[1] + 0.5)}" text-anchor="middle" dominant-baseline="middle" stroke="none" font-size="13">${el.type === "ammeter" ? "A" : "V"}</text>`;
        break;
      case "gap":
        for (const t of [L(-9, 0), L(9, 0)])
          body += `<circle cx="${f1(t[0])}" cy="${f1(t[1])}" r="2.5" fill="var(--dg-bg,#fff)"/>`;
        break;
    }
    // labels: beside a vertical element, above or below a horizontal one. They are placed once
    // everything is drawn, on the other side if the first choice would sit on something.
    if (lines.length) {
      const beside = (sign: number): Spot[] => {
        const x = M[0] + sign * (hw * Math.abs(n[0]) + half * Math.abs(u[0]) + 7);
        return lines.map((s, i) => ({
          p: [x, M[1] + (i - (lines.length - 1) / 2) * LINE_H],
          s,
          anchor: sign > 0 ? "start" : "end",
        }));
      };
      const over = (up: boolean): Spot[] => {
        const off = hw * Math.abs(n[1]) + half * Math.abs(u[1]) + 11;
        return lines.map((s, i) => ({
          p: [M[0], up ? M[1] - off - (lines.length - 1 - i) * LINE_H : M[1] + off + i * LINE_H],
          s,
          anchor: "middle",
        }));
      };
      labelJobs.push(
        Math.abs(n[0]) > 0.5
          ? [beside(Math.sign(n[0])), beside(-Math.sign(n[0]))]
          : [over(n[1] < 0), over(n[1] >= 0)],
      );
    }
    if (el.type !== "gap" && el.arrow) {
      const rev = el.arrow.reverse ? -1 : 1;
      const c0 = L(0, -(hwo + 10));
      const a0 = add(c0, mul(u, -13 * rev)),
        a1 = add(c0, mul(u, 13 * rev));
      body += arrow(a0, a1, ACCENT, 1.75, 8);
      box([
        Math.min(a0[0], a1[0]) - 4,
        Math.min(a0[1], a1[1]) - 4,
        Math.max(a0[0], a1[0]) + 4,
        Math.max(a0[1], a1[1]) + 4,
      ]);
      const w = textWidth(el.arrow.label);
      const lp = L(0, -(hwo + 10 + 7 + Math.abs(n[0]) * (w / 2 + 2) + Math.abs(n[1]) * 6));
      put(lp, el.arrow.label, "middle", ` fill="${ACCENT}"`);
    }
  };

  let alt: string;
  const placed = Object.keys(c.positions).length > 0;
  if (placed) alt = layoutPlaced(c, errs, warns, drawElement, wire);
  else {
    const tree = spTree(c, errs);
    if (!tree) return { svg: "", alt: "" };
    alt = layoutAuto(tree, drawElement, wire);
    arrowCheck(c, warns);
  }
  if (errs.length) return { svg: "", alt: "" };

  // ---- element labels: the first candidate side that is clear of symbols, wires and labels ----
  const spotRect = (t: Spot): Rect => {
    const w = textWidth(t.s);
    const left = t.anchor === "start" ? t.p[0] : t.anchor === "end" ? t.p[0] - w : t.p[0] - w / 2;
    return [left - 1, t.p[1] - 7, left + w + 1, t.p[1] + 7];
  };
  const clear = (r: Rect) =>
    !rects.some((q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1]);
  for (const cands of labelJobs) {
    const pick = cands.find((c) => c.every((t) => clear(spotRect(t)))) ?? cands[0];
    for (const t of pick) put(t.p, t.s, t.anchor);
  }

  // ---- junction dots, node labels, ground ----
  for (const { p, n } of arms.values())
    if (n >= 3) body += `<circle cx="${f1(p[0])}" cy="${f1(p[1])}" r="3" stroke="none"/>`;
  const ys = [...arms.values()].map((a) => a.p[1]);
  const [topY, botY] = [Math.min(...ys), Math.max(...ys)];
  const overlaps = (r: Rect, skip?: Rect) =>
    rects.some((q) => q !== skip && r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1]);
  for (const [n, s] of Object.entries(c.nodeLabels)) {
    const pts = nodePts.get(n);
    if (!pts) continue;
    // a junction if the node has one, else its first corner
    const p = pts.find((q) => (arms.get(key(q))?.n ?? 0) >= 3) ?? pts[0];
    body += `<circle cx="${f1(p[0])}" cy="${f1(p[1])}" r="3" stroke="none"/>`;
    const w = textWidth(s);
    const above: [P, "start" | "end" | "middle"][] = [
      [[p[0] - 7, p[1] - 12], "end"],
      [[p[0] + 7, p[1] - 12], "start"],
    ];
    const below: [P, "start" | "end" | "middle"][] = [
      [[p[0] - 7, p[1] + 13], "end"],
      [[p[0] + 7, p[1] + 13], "start"],
    ];
    const cands =
      Math.abs(p[1] - botY) < 1 && botY - topY > 1 ? [...below, ...above] : [...above, ...below];
    const rectOf = ([q, a]: [P, string]): Rect => {
      const left = a === "start" ? q[0] : a === "end" ? q[0] - w : q[0] - w / 2;
      return [left - 1, q[1] - 7, left + w + 1, q[1] + 7];
    };
    const [q, a] = cands.find((cand) => !overlaps(rectOf(cand))) ?? cands[0];
    put(q, s, a);
  }
  if (c.ground !== undefined) {
    const pts = nodePts.get(c.ground) ?? [];
    if (pts.length) {
      const p = pts.reduce((best, q) => (q[1] > best[1] ? q : best));
      body += line(p, [p[0], p[1] + 12]);
      [9, 6, 3].forEach((w, i) => {
        body += line([p[0] - w, p[1] + 12 + i * 4], [p[0] + w, p[1] + 12 + i * 4]);
      });
      box([p[0] - 9, p[1], p[0] + 9, p[1] + 21]);
      alt += ` Node ${c.ground} is grounded.`;
    }
  }
  const arrows = c.elements.filter((e) => e.arrow);
  if (arrows.length)
    alt += ` Current arrows: ${arrows.map((e) => `${plain(e.arrow!.label)} at ${nameOf(e)}`).join(", ")}.`;
  const labelled = Object.values(c.nodeLabels);
  if (labelled.length) alt += ` Labelled points: ${labelled.map(plain).join(", ")}.`;

  const PAD = 10;
  const x0 = Math.min(...rects.map((r) => r[0])) - PAD,
    x1 = Math.max(...rects.map((r) => r[2])) + PAD;
  const y0 = Math.min(...rects.map((r) => r[1])) - PAD,
    y1 = Math.max(...rects.map((r) => r[3])) + PAD;
  // Drawn larger than it is laid out, with the labels kept at the usual text size: symbols a
  // comfortable size, and more air round every label.
  const scaled = `<g transform="scale(${SCALE})" font-size="${f1(13 / SCALE)}">${body}</g>`;
  return {
    svg: wrap((x1 - x0) * SCALE, (y1 - y0) * SCALE, scaled, alt, x0 * SCALE, y0 * SCALE),
    alt,
  };
}

// ---------------------------------------------------------------------------------------------
// Series / parallel structure

function reverse(t: Tree): Tree {
  if (t.k === "leaf") return { ...t, flip: !t.flip };
  if (t.k === "ser") return { ...t, items: t.items.map(reverse).reverse() };
  return { ...t, items: t.items.map(reverse) };
}
function join(k: "ser" | "par", parts: Tree[]): Tree {
  const items = parts.flatMap((p) => (p.k === k ? p.items : [p]));
  if (k === "par") items.sort((a, b) => a.ord - b.ord);
  return { k, items, ord: Math.min(...items.map((i) => i.ord)) };
}

/**
 * Reduce the circuit to a tree of series and parallel groups between the main battery's
 * terminals. The tree's root is a parallel group whose first item is the main battery.
 */
function spTree(c: Circuit, errs: DgError[]): Tree | undefined {
  const els: El[] = [...c.elements];
  const main = c.elements.find((e) => e.type === "battery") ?? c.elements[0];
  const [s, t] = [main.a, main.b];
  if (s === t) return undefined; // already reported

  // one drawing needs one connected circuit
  {
    const seen = new Set([s]);
    for (let grew = true; grew;) {
      grew = false;
      for (const e of els)
        if (seen.has(e.a) !== seen.has(e.b)) {
          seen.add(e.a);
          seen.add(e.b);
          grew = true;
        }
    }
    const lost = els.find((e) => !seen.has(e.a));
    if (lost) {
      errs.push({
        line: lost.line,
        msg: `the circuit is in separate pieces: ${nameOf(lost)} (nodes ${lost.a}, ${lost.b}) is not connected to ${nameOf(main)}; check the node names`,
      });
      return undefined;
    }
  }

  // Loose ends are drawn as a visible break in the wire, so the picture shows what was written.
  const deg = new Map<string, number>();
  for (const e of els) for (const n of [e.a, e.b]) deg.set(n, (deg.get(n) ?? 0) + 1);
  const loose = c.nodes.filter((n) => deg.get(n) === 1);
  const gap = (a: string, b: string) =>
    els.push({ type: "gap", id: `gap${els.length}`, a, b, labels: [], line: main.line });
  if (loose.length === 2) gap(loose[0], loose[1]);
  else
    for (const n of loose) {
      const other = els.find((e) => e.a === n || e.b === n)!;
      const far = other.a === n ? other.b : other.a;
      gap(n, n === t || far === t ? (n === s ? t : s) : t);
    }

  type Edge = { u: string; v: string; tree: Tree };
  let edges: Edge[] = els
    .filter((e) => e !== main)
    .map((el) => ({
      u: el.a,
      v: el.b,
      tree: { k: "leaf", el, flip: false, ord: els.indexOf(el) },
    }));
  const from = (e: Edge, n: string) => (e.u === n ? e.tree : reverse(e.tree));
  for (let changed = true; changed;) {
    changed = false;
    // parallel: two edges between the same pair of nodes
    outer: for (let i = 0; i < edges.length; i++)
      for (let j = i + 1; j < edges.length; j++) {
        const [a, b] = [edges[i], edges[j]];
        if ((a.u === b.u && a.v === b.v) || (a.u === b.v && a.v === b.u)) {
          edges[i] = { u: a.u, v: a.v, tree: join("par", [a.tree, from(b, a.u)]) };
          edges.splice(j, 1);
          changed = true;
          break outer;
        }
      }
    if (changed) continue;
    // series: a node (not a terminal) that joins exactly two edges
    for (const n of c.nodes.concat(els.flatMap((e) => [e.a, e.b]))) {
      if (n === s || n === t) continue;
      const inc = edges.filter((e) => e.u === n || e.v === n);
      if (inc.length !== 2 || inc.some((e) => e.u === e.v)) continue;
      const [e1, e2] = inc;
      const x = e1.u === n ? e1.v : e1.u,
        y = e2.u === n ? e2.v : e2.u;
      if (x === y) continue;
      const merged: Edge = { u: x, v: y, tree: join("ser", [from(e1, x), from(e2, n)]) };
      edges = edges.filter((e) => e !== e1 && e !== e2);
      edges.push(merged);
      changed = true;
      break;
    }
  }
  const mainLeaf: Tree = { k: "leaf", el: main, flip: false, ord: -1 };
  if (!edges.length) return { k: "par", items: [mainLeaf], ord: -1 };
  if (
    edges.length !== 1 ||
    !((edges[0].u === s && edges[0].v === t) || (edges[0].u === t && edges[0].v === s))
  ) {
    errs.push({
      line: c.line,
      msg: "this circuit is not a combination of series and parallel groups (a bridge, for example), so it cannot be laid out automatically; place the nodes yourself with an at line, e.g. at a 0,2 b 2,2 c 2,0 d 0,0",
    });
    return undefined;
  }
  return join("par", [mainLeaf, from(edges[0], s)]);
}

function describeTree(t: Tree, top = true): string {
  if (t.k === "leaf") return describe(t.el);
  const parts = t.items.map((i) => describeTree(i, false));
  const s =
    t.k === "ser"
      ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]} in series`
      : `${parts.join(" in parallel with ")}`;
  return top ? s : `[${s}]`;
}

function layoutAuto(
  root: Tree,
  drawElement: (el: El, A: P, B: P, ln: P) => void,
  wire: (a: P, b: P) => void,
): string {
  const drawLeaf = (t: Tree & { k: "leaf" }, p0: P, p1: P, ln: P) =>
    t.flip ? drawElement(t.el, p1, p0, ln) : drawElement(t.el, p0, p1, ln);

  const leafV = (t: Tree & { k: "leaf" }, side: 1 | -1): Block => {
    const d = dims(t.el);
    const lab = d.lines.length ? d.hw + 7 + d.lw + 4 : d.hw + 4;
    const arrowLabel = t.el.type !== "gap" ? t.el.arrow?.label : undefined;
    const opp = d.hwo + (arrowLabel !== undefined ? 10 + 9 + textWidth(arrowLabel) + 6 : 4);
    return {
      L: side > 0 ? opp : lab,
      R: side > 0 ? lab : opp,
      H: Math.max(VH, 2 * d.half + 40, d.lh + 34),
      place: (x, y, h) => drawLeaf(t, [x, y], [x, y + h], [side, 0]),
    };
  };
  const hLen = (t: Tree & { k: "leaf" }) => {
    const d = dims(t.el);
    return Math.max(HMIN, d.lw + 26, 2 * d.half + 40);
  };
  const stack = (blocks: Block[]): Block => ({
    L: Math.max(...blocks.map((b) => b.L)),
    R: Math.max(...blocks.map((b) => b.R)),
    H: blocks.reduce((s, b) => s + b.H, 0),
    place(x, y, h) {
      const extra = (h - this.H) / blocks.length;
      let cur = y;
      for (const b of blocks) {
        b.place(x, cur, b.H + extra);
        cur += b.H + extra;
      }
    },
  });
  const blockOf = (t: Tree, side: 1 | -1, outerR: boolean): Block =>
    t.k === "leaf"
      ? leafV(t, side)
      : t.k === "ser"
        ? stack(t.items.map((i) => blockOf(i, side, false)))
        : par(t.items, outerR, 1);

  /** The outermost rung bends round the corners: leading elements lie on the top rail, trailing ones on the bottom. */
  const bend = (chain: Tree[]): { pre: Tree[]; pivot: Tree[]; post: Tree[] } => {
    const isLeaf = (t: Tree) => t.k === "leaf";
    if (chain.every(isLeaf)) {
      const k = chain.length;
      const nPre = k <= 3 ? k - 1 : Math.ceil((k - 1) / 2);
      return { pre: chain.slice(0, nPre), pivot: [chain[nPre]], post: chain.slice(nPre + 1) };
    }
    let i = 0;
    while (isLeaf(chain[i])) i++;
    let j = chain.length;
    while (isLeaf(chain[j - 1])) j--;
    return { pre: chain.slice(0, i), pivot: chain.slice(i, j), post: chain.slice(j) };
  };

  function par(items: Tree[], outerR: boolean, firstSide: 1 | -1): Block {
    const cols = items.map((it, i) => {
      const chain = it.k === "ser" ? it.items : [it];
      const last = i === items.length - 1 && items.length > 1;
      const b = last && outerR ? bend(chain) : { pre: [], pivot: chain, post: [] };
      const side = i === 0 ? firstSide : 1;
      const block =
        b.pivot.length === 1
          ? blockOf(b.pivot[0], side, last && outerR)
          : stack(b.pivot.map((p) => blockOf(p, side, false)));
      return { ...b, block };
    });
    const off: number[] = [0];
    const runLen = (ts: Tree[]) =>
      ts.length ? ts.reduce((s, t) => s + hLen(t as Tree & { k: "leaf" }), 0) + 20 : 0;
    for (let i = 1; i < cols.length; i++)
      off[i] =
        off[i - 1] +
        Math.max(
          cols[i - 1].block.R + GAPX + cols[i].block.L,
          MINCOL,
          runLen(cols[i].pre),
          runLen(cols[i].post),
        );
    const run = (ts: Tree[], xa: number, xb: number, y: number, top: boolean) => {
      // top rail: walked left to right; bottom rail: the chain continues right to left
      const order = top ? ts : [...ts].reverse();
      const total = order.reduce((s, t) => s + hLen(t as Tree & { k: "leaf" }), 0);
      const pad = (xb - xa - total) / (order.length + 1);
      let cur = xa;
      for (const t of order) {
        const len = hLen(t as Tree & { k: "leaf" });
        wire([cur, y], [cur + pad, y]);
        const [l, r]: [P, P] = [
          [cur + pad, y],
          [cur + pad + len, y],
        ];
        if (top) drawLeaf(t as Tree & { k: "leaf" }, l, r, [0, -1]);
        else drawLeaf(t as Tree & { k: "leaf" }, r, l, [0, 1]);
        cur += pad + len;
      }
      wire([cur, y], [xb, y]);
    };
    return {
      L: cols[0].block.L,
      R: off[off.length - 1] + cols[cols.length - 1].block.R,
      H: Math.max(...cols.map((q) => q.block.H)),
      place(x, y, h) {
        cols.forEach((q, i) => {
          q.block.place(x + off[i], y, h);
          if (i === 0) return;
          run(q.pre, x + off[i - 1], x + off[i], y, true);
          run(q.post, x + off[i - 1], x + off[i], y + h, false);
        });
      },
    };
  }

  const items = root.k === "par" ? root.items : [root];
  const block = par(items, true, -1);
  block.place(0, 0, Math.max(block.H, 104));
  const [main, ...rest] = items;
  const restDesc = rest.length
    ? ` connected across ${describeTree(rest.length === 1 ? rest[0] : { k: "par", items: rest, ord: 0 })}`
    : "";
  return `Circuit diagram: ${describeTree(main)}${restDesc}.`;
}

/** Every node placed by the author: each element is drawn straight between its two nodes. */
function layoutPlaced(
  c: Circuit,
  errs: DgError[],
  warns: DgError[],
  drawElement: (el: El, A: P, B: P, ln: P) => void,
  wire: (a: P, b: P) => void,
): string {
  void wire;
  const U = 104;
  const pos = new Map<string, P>(Object.entries(c.positions));
  for (const ch of c.chains) {
    const [a, b] = [pos.get(ch.from), pos.get(ch.to)];
    if (!a || !b) continue;
    ch.mids.forEach((m, i) => {
      const t = (i + 1) / (ch.mids.length + 1);
      pos.set(m, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    });
  }
  const missing = c.nodes.filter((n) => !pos.has(n) && !n.startsWith("_"));
  if (missing.length) {
    errs.push({
      line: c.line,
      msg: `at places some nodes but not ${missing.join(", ")}; place every node, or remove the at line to let the circuit lay itself out`,
    });
    return "";
  }
  const S = (n: string): P => {
    const p = pos.get(n) ?? [0, 0];
    return [p[0] * U, -p[1] * U];
  };
  const all = [...pos.values()];
  const centre: P = [
    (all.reduce((s, p) => s + p[0], 0) / all.length) * U,
    (-all.reduce((s, p) => s + p[1], 0) / all.length) * U,
  ];
  const seen = new Map<string, El>();
  for (const el of c.elements) {
    const [A, B] = [S(el.a), S(el.b)];
    const pairKey = [key(A), key(B)].sort().join("|");
    const len = Math.hypot(A[0] - B[0], A[1] - B[1]);
    if (len < 1) {
      errs.push({ line: el.line, msg: `nodes ${el.a} and ${el.b} are placed on the same point` });
      continue;
    }
    if (seen.has(pairKey)) {
      errs.push({
        line: el.line,
        msg: `${nameOf(el)} would be drawn on top of ${nameOf(seen.get(pairKey)!)}; give it its own nodes, placed apart, and join them with wires`,
      });
      continue;
    }
    seen.set(pairKey, el);
    const d = dims(el);
    if (len < 2 * d.half + 16)
      warns.push({
        line: el.line,
        kind: "readability",
        msg: `nodes ${el.a} and ${el.b} are too close together to fit ${nameOf(el)}; place them at least 1 apart`,
      });
    const M = mul(add(A, B), 0.5);
    let out = sub(M, centre);
    if (Math.hypot(out[0], out[1]) < 4) out = [0.3, -1];
    drawElement(el, A, B, out);
  }
  return `Circuit diagram: ${c.elements.map((e) => `${describe(e)} between ${e.a} and ${e.b}`).join("; ")}.`;
}

// ---------------------------------------------------------------------------------------------
// Physics checks: things a drawn circuit can say that are false or that a student would be marked
// wrong for.

function physicsChecks(c: Circuit, warns: DgError[]): void {
  const els = c.elements;
  const connected = (use: CircuitElement[], a: string, b: string): boolean => {
    const seen = new Set([a]);
    for (let grew = true; grew;) {
      grew = false;
      for (const e of use)
        if (seen.has(e.a) !== seen.has(e.b)) {
          seen.add(e.a);
          seen.add(e.b);
          grew = true;
        }
    }
    return seen.has(b);
  };
  /** Elements that are on no closed loop in the graph made of `use`. */
  const offLoop = (use: CircuitElement[]) =>
    use.filter(
      (e) =>
        !connected(
          use.filter((x) => x !== e),
          e.a,
          e.b,
        ),
    );
  const deg = new Map<string, number>();
  for (const e of els) for (const n of [e.a, e.b]) deg.set(n, (deg.get(n) ?? 0) + 1);

  // an open loop that no switch explains
  const stranded = offLoop(els);
  for (const b of stranded.filter((e) => e.type === "battery"))
    warns.push({
      line: b.line,
      kind: "physics",
      msg: `${nameOf(b)} is not part of a closed loop, and no open switch explains the break; no current can flow as drawn. Connect its terminals through the circuit (the last element must return to node ${b.b})`,
    });
  // a loose end
  for (const e of els)
    for (const n of [e.a, e.b])
      if (deg.get(n) === 1)
        warns.push({
          line: e.line,
          kind: "physics",
          msg: `${nameOf(e)} has a loose end: nothing else is connected to node ${n}`,
        });

  // nodes joined by bare conductors (wires and closed switches)
  const bare = (withAmmeters: boolean) => {
    const use = els.filter(
      (e) =>
        e.type === "wire" ||
        (e.type === "switch" && e.open === false) ||
        (withAmmeters && e.type === "ammeter"),
    );
    return (a: string, b: string) => a === b || connected(use, a, b);
  };
  const same = bare(false);
  for (const b of els.filter((e) => e.type === "battery" && !e.r))
    if (same(b.a, b.b))
      warns.push({
        line: b.line,
        kind: "physics",
        msg: `${nameOf(b)} is short-circuited: bare wire joins its two terminals, so the current would be unlimited. Put the wire's nodes somewhere else or add a resistance to that path`,
      });
  // an ammeter across a component
  for (const m of els.filter((e) => e.type === "ammeter")) {
    if (same(m.a, m.b)) continue;
    const across = els.find(
      (e) =>
        e !== m &&
        !["wire", "ammeter", "voltmeter"].includes(e.type) &&
        !(e.type === "switch" && e.open === false) &&
        ((same(e.a, m.a) && same(e.b, m.b)) || (same(e.a, m.b) && same(e.b, m.a))),
    );
    if (across)
      warns.push({
        line: m.line,
        kind: "physics",
        msg: `${nameOf(m)} is connected in parallel across ${nameOf(across)}; an ammeter goes in series with what it measures (as drawn it shorts ${nameOf(across)} out). Give it its own node in the branch`,
      });
  }
  // a voltmeter in series: taking it out (it carries no current) breaks a loop for other elements
  for (const m of els.filter((e) => e.type === "voltmeter")) {
    const without = els.filter((e) => e !== m);
    const cut = offLoop(without).filter((e) => !stranded.includes(e) && e.type !== "voltmeter");
    const onlyAcross =
      cut.length === 1 &&
      ((same(cut[0].a, m.a) && same(cut[0].b, m.b)) ||
        (same(cut[0].a, m.b) && same(cut[0].b, m.a)));
    if (cut.length && !onlyAcross)
      warns.push({
        line: m.line,
        kind: "physics",
        msg: `${nameOf(m)} is in series with ${nameOf(cut[0])}; a voltmeter goes across (in parallel with) what it measures, on the same two nodes. In series it blocks the current`,
      });
  }
}

/**
 * With one battery and only resistive elements in a series-parallel circuit, the direction of
 * every current is fixed whatever the values are: an arrow drawn the other way is false.
 */
function arrowCheck(c: Circuit, warns: DgError[]): void {
  const arrows = c.elements.filter((e) => e.arrow);
  if (!arrows.length) return;
  if (c.elements.filter((e) => e.type === "battery").length !== 1) return;
  if (c.elements.some((e) => e.type === "capacitor" || e.type === "inductor")) return;
  const filled: Circuit = {
    ...c,
    elements: c.elements.map((e) =>
      e.value === undefined && ["battery", "resistor", "bulb"].includes(e.type)
        ? { ...e, value: 1 }
        : e,
    ),
  };
  const sol = solveCircuit(filled);
  if (!sol.ok) return;
  for (const e of arrows) {
    const r = sol.elements[e.id];
    const drawn = e.arrow!.reverse ? -1 : 1;
    if (Math.abs(r.current) > 1e-9 && Math.sign(r.current) !== drawn)
      warns.push({
        line: e.line,
        kind: "physics",
        msg: `current arrow ${plain(e.arrow!.label)} at ${nameOf(e)} points against the current: conventional current leaves the battery's + terminal and passes through ${nameOf(e)} from node ${r.from} to node ${r.to}. Swap ${e.arrow!.reverse ? "ir= for i=" : "i= for ir="}`,
      });
  }
}
