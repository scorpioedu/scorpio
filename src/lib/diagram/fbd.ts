// fbd: free-body diagrams. Forces start at the object and point outward.
//
// fbd [dot|box] ["m"] [tilt=30]   tilt rotates the box and draws slope axes
// f down F_g [1]                   direction (up/down/left/right or degrees), label, relative length
// f 30 T 1.2 ang=\theta            ang= marks the angle from the nearest axis

import { type DgError, type Doc, angle, num } from "./parse";
import { arc, arcLabelPos, arrow, f1, plain, poly, text, wrap, type P } from "./svg";

export type Force = { deg: number; label: string; len: number; ang?: string };

const BASE = 62; // px for length 1
const DIRNAME: Record<number, string> = { 0: "right", 90: "up", 180: "left", 270: "down" };

export function renderFbd(
  doc: Doc,
  errs: DgError[],
  warns: DgError[] = [],
  equilibrium = false,
): { svg: string; alt: string; forces: Force[] } {
  const h = doc.head;
  const shape = h.args[0] === "box" ? "box" : "dot";
  const tilt = h.kv.tilt ? num(h.kv.tilt, h.line, errs, "tilt angle") : 0;
  const forces: Force[] = [];
  for (const c of doc.cmds) {
    if (c.op !== "f") {
      errs.push({ line: c.line, msg: `fbd has no "${c.op}" (use f)` });
      continue;
    }
    const deg = ((angle(c.args[0], c.line, errs) % 360) + 360) % 360;
    // the label is a bare word (f down F_g 1) or quoted when it has spaces (f left "F_{B on A}" 1)
    const label = c.text ?? c.args[1];
    if (!label) errs.push({ line: c.line, msg: "force needs a label, e.g. f down F_g" });
    const lenArg = c.text !== undefined ? c.args[1] : c.args[2];
    const len = lenArg !== undefined ? num(lenArg, c.line, errs, "relative length") : 1;
    forces.push({ deg, label: label ?? "?", len, ang: c.kv.ang });
  }
  if (!forces.length) errs.push({ line: h.line, msg: "fbd has no forces" });

  // At rest or at constant velocity, the arrows must add to zero. Only checked when the lengths make
  // a claim: with every arrow the same length the diagram says nothing about magnitudes.
  const atRest = equilibrium || h.args.includes("eq") || "eq" in h.kv;
  const claimsSizes = new Set(forces.map((f) => f.len)).size > 1;
  if (atRest && claimsSizes && forces.length > 1) {
    let nx = 0,
      ny = 0;
    for (const f of forces) {
      nx += f.len * Math.cos((f.deg * Math.PI) / 180);
      ny += f.len * Math.sin((f.deg * Math.PI) / 180);
    }
    const net = Math.hypot(nx, ny),
      biggest = Math.max(...forces.map((f) => f.len));
    if (net > 0.2 * biggest)
      warns.push({
        line: h.line,
        kind: "physics",
        msg: `the body is at rest or at constant velocity, but its arrows don't balance (they leave a net arrow ${+net.toFixed(2)} long, pointing ${Math.round(((Math.atan2(ny, nx) * 180) / Math.PI + 360) % 360)}°); fix the lengths or make them all 1`,
      });
  }

  const rad = (d: number) => (d * Math.PI) / 180;
  const dir = (d: number): P => [Math.cos(rad(d)), -Math.sin(rad(d))]; // screen y down
  const hw = 28,
    hh = 20; // box half sizes

  // where a ray from the centre leaves the (possibly tilted) box
  const exit = (d: number): number => {
    if (shape === "dot") return 4;
    const local = rad(d - tilt);
    const cx = Math.abs(Math.cos(local)),
      cy = Math.abs(Math.sin(local));
    return Math.min(cx > 1e-9 ? hw / cx : Infinity, cy > 1e-9 ? hh / cy : Infinity);
  };

  let body = "";
  const ext: P[] = [
    [-hw - 10, -hh - 10],
    [hw + 10, hh + 10],
  ];
  if (tilt) {
    for (const d of [tilt, tilt + 90]) {
      const u = dir(d),
        r = 110;
      body += `<line x1="${f1(-u[0] * r)}" y1="${f1(-u[1] * r)}" x2="${f1(u[0] * r)}" y2="${f1(u[1] * r)}" stroke-dasharray="3 5" stroke-width="1" stroke-opacity=".45"/>`;
    }
  }
  if (shape === "box") {
    const c = [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ].map(([x, y]): P => {
      const a = rad(-tilt);
      return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
    });
    body += poly(c, true, ` fill="var(--dg-bg,#fff)" fill-opacity=".001"`);
    if (h.text) body += text([0, 0], h.text, "middle", ` stroke="none"`);
  } else {
    body += `<circle cx="0" cy="0" r="4.5" stroke="none"/>`;
    if (h.text) body += text([-10, 12], h.text, "end", ` stroke="none"`);
  }
  const seen = new Map<number, number>(); // forces sharing a direction sit side by side
  for (const f of forces) {
    const u = dir(f.deg);
    const nth = seen.get(f.deg) ?? 0;
    seen.set(f.deg, nth + 1);
    const total = forces.filter((g) => g.deg === f.deg).length;
    const shift = (nth - (total - 1) / 2) * 16; // px, perpendicular to the arrow
    const o: P = [-u[1] * shift, u[0] * shift];
    const s0 = (shape === "dot" && total > 1 ? 8 : exit(f.deg)) + 2;
    const a: P = [o[0] + u[0] * s0, o[1] + u[1] * s0];
    const b: P = [o[0] + u[0] * (s0 + BASE * f.len), o[1] + u[1] * (s0 + BASE * f.len)];
    body += arrow(a, b);
    // label just past the tip, nudged sideways for vertical arrows
    const lp: P = [b[0] + u[0] * 14 + (Math.abs(u[0]) < 0.3 ? 14 : 0), b[1] + u[1] * 12];
    const anchor = Math.abs(u[0]) < 0.3 ? "start" : u[0] > 0 ? "start" : "end";
    body += text(lp, f.label, anchor, ` stroke="none"`);
    ext.push(b, [lp[0] + (anchor === "end" ? -40 : 40), lp[1] + 10], [lp[0], lp[1] - 10]);
    if (f.ang) {
      const ref = Math.round((f.deg - tilt) / 90) * 90 + tilt;
      if (Math.abs(ref - f.deg) > 0.5) {
        const r = s0 + 26;
        body += arc([0, 0], r, ref, f.deg).replace("/>", ` stroke-width="1"/>`);
        body += text(
          arcLabelPos([0, 0], r, Math.min(ref, f.deg), Math.max(ref, f.deg), f.ang),
          f.ang,
          "middle",
          ` stroke="none"`,
        );
        const ru = dir(ref);
        body += `<line x1="0" y1="0" x2="${f1(ru[0] * (r + 8))}" y2="${f1(ru[1] * (r + 8))}" stroke-dasharray="3 3" stroke-width="1" stroke-opacity=".6"/>`;
      }
    }
  }

  const minX = Math.min(...ext.map((p) => p[0])) - 8,
    maxX = Math.max(...ext.map((p) => p[0])) + 8;
  const minY = Math.min(...ext.map((p) => p[1])) - 8,
    maxY = Math.max(...ext.map((p) => p[1])) + 8;
  const W = maxX - minX,
    H = maxY - minY;
  const alt =
    `Free-body diagram of ${shape === "box" ? "a block" : "an object"}${h.text ? ` (${plain(h.text)})` : ""}${tilt ? ` on a ${tilt}° slope` : ""}: ` +
    forces
      .map(
        (f) =>
          `${plain(f.label)} ${DIRNAME[f.deg] ?? `at ${f.deg}°`}${f.len !== 1 ? ` (length ${f.len})` : ""}`,
      )
      .join(", ") +
    ".";
  return {
    svg: wrap(W, H, `<g transform="translate(${f1(-minX)},${f1(-minY)})">${body}</g>`, alt),
    alt,
    forces,
  };
}
