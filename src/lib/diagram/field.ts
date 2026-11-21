// field: electric and magnetic field pictures. The author places the sources; every field line,
// equipotential and force arrow is computed from the superposed field.
//
// field [xr=-4..4 yr=-3..3] [lines=8] ["title"]     window in world units (fitted if left out)
// charge x,y +2 ["label"]            point charge, signed relative size; lines per charge ∝ |q|
// plates x,y x,y [w=5]               centres of the + plate and the − plate; w = plate length
// uniform E right ["E"] [x=0..3 y=0..2] [n=6]       uniform field; direction, or in / out of the page
// uniform B in ["B"]                 a grid of crosses (in) or dots (out)
// wire x,y out ["I"] [2]             long straight wire seen end-on; current out of / into the page
// equi [n=7]                         dashed equipotentials at equal steps of potential
// gauss circle x,y r ["S"]   gauss rect x,y x,y ["S"]     dashed Gaussian surface
// test x,y + ["q"] [v=right]         test charge with its computed force (v= for a magnetic force)
// pt x,y "P"                         labelled point
//
// How the lines are made (and what bounds the work):
// - Point charges use the 3-D Coulomb field in the plane of the page. Lines start evenly round
//   each positive charge, round(lines·|q|/|q|min) of them, and are followed with 4th-order
//   Runge-Kutta steps of 0.2 × the distance to the nearest charge (clamped to 0.2%–2.5% of the
//   window, 5% outside it) until they reach a negative charge, leave a box one window-size larger
//   than the window on each side, or pass MAX_STEPS. Negative charges that receive fewer lines than
//   their share get the rest traced backwards from them, in their widest gaps. A flat picture of a
//   3-D field cannot make both ends come out evenly, so a negative charge next to a much larger
//   positive one can receive a line or two more than its share.
// - Plates are uniformly charged strips (2-D field, closed form), so the edge fringing is real.
// - Equipotentials, and the field lines of wires (level curves of the vector potential), are
//   contours found by marching squares on a GRID × GRID·h/w sample of the potential, at equal
//   steps, so their spacing shows the field strength.
// - Paths are simplified to 0.3 px, which keeps a typical picture under 15 kB.

import { type Cmd, type DgError, type Doc, angle, num, pair, range } from "./parse";
import {
  ACCENT,
  FORCE,
  arrow,
  braceSubscripts,
  f1,
  line,
  plain,
  text,
  textWidth,
  wrap,
  type P,
} from "./svg";

const MAX_STEPS = 3000;
const MAX_LINES = 72;
const GRID = 110;

type Charge = { p: P; q: number; label?: string; line: number };
type Plates = { a: P; b: P; w: number; line: number };
type Uniform = {
  kind: "E" | "B";
  dir: P | "in" | "out";
  mag: number;
  label: string;
  region?: [number, number, number, number];
  n: number;
  line: number;
};
type Wire = { p: P; i: number; label?: string; line: number };
type Gauss = { shape: "circle" | "rect"; a: P; b: P; r: number; label?: string; line: number };
type Test = { p: P; q: number; label?: string; v?: P; line: number };
type Strip = { c: P; u: P; half: number; sigma: number };

const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];
const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const mul = (a: P, k: number): P => [a[0] * k, a[1] * k];
const len = (a: P) => Math.hypot(a[0], a[1]);
const fmt = (n: number) => String(+n.toFixed(2)).replace("-", "−");

/** "+", "-2", "+2q", "−1.5" -> signed size. */
function readCharge(s: string | undefined): number | undefined {
  const m = s?.replace("−", "-").match(/^([+-])?(\d*\.?\d*)([A-Za-z]\w*)?$/);
  if (!m || (!m[1] && !m[2])) return undefined;
  const mag = m[2] === "" ? 1 : Number(m[2]);
  if (!Number.isFinite(mag)) return undefined;
  return (m[1] === "-" ? -1 : 1) * mag;
}

/** For tests and checks: how many lines were drawn, and how many leave / reach each charge (in source order). */
export type FieldStats = { lines: number; left: number[]; arrived: number[] };

export function renderField(
  doc: Doc,
  errs: DgError[],
  warns: DgError[] = [],
): { svg: string; alt: string; stats?: FieldStats } {
  const h = doc.head;
  const charges: Charge[] = [];
  const plates: Plates[] = [];
  const uniforms: Uniform[] = [];
  const wires: Wire[] = [];
  const gausses: Gauss[] = [];
  const tests: Test[] = [];
  const pts: { p: P; label?: string }[] = [];
  let equi: { n: number; line: number } | undefined;
  const lab = (c: Cmd, i: number) => {
    const s = c.text ?? c.args[i];
    return s === undefined ? undefined : braceSubscripts(s);
  };
  const dirVec = (s: string | undefined, c: Cmd): P => {
    const d = (angle(s, c.line, errs) * Math.PI) / 180;
    return [Math.cos(d), Math.sin(d)];
  };

  for (const c of doc.cmds) {
    switch (c.op) {
      case "charge":
      case "q": {
        const p = pair(c.args[0], c.line, errs);
        const q = readCharge(c.args[1]);
        if (q === undefined || q === 0) {
          errs.push({
            line: c.line,
            msg: `charge needs a signed size after its position, e.g. charge 0,0 +1 or charge 2,0 -2 (got "${c.args[1] ?? ""}")`,
          });
          break;
        }
        const named = /[A-Za-z]/.test(c.args[1]) ? c.args[1] : undefined;
        charges.push({ p, q, label: lab(c, 2) ?? named, line: c.line });
        break;
      }
      case "plates": {
        const a = pair(c.args[0], c.line, errs),
          b = pair(c.args[1], c.line, errs);
        const d = len(sub(a, b));
        if (d < 1e-9) {
          errs.push({
            line: c.line,
            msg: "plates needs two different points: the centre of the + plate, then the centre of the − plate",
          });
          break;
        }
        const w = c.kv.w !== undefined ? num(c.kv.w, c.line, errs, "plate length w=") : 2.5 * d;
        plates.push({ a, b, w, line: c.line });
        break;
      }
      case "uniform": {
        const kind = c.args[0] === "E" || c.args[0] === "B" ? c.args[0] : undefined;
        if (!kind) {
          errs.push({
            line: c.line,
            msg: `uniform needs E or B, then a direction: uniform E right, uniform B in (got "${c.args[0] ?? ""}")`,
          });
          break;
        }
        const d = c.args[1];
        const dir: Uniform["dir"] =
          d === "in" || d === "into" ? "in" : d === "out" ? "out" : dirVec(d, c);
        let region: Uniform["region"];
        if (c.kv.x !== undefined || c.kv.y !== undefined) {
          const xr = c.kv.x !== undefined ? range(c.kv.x, c.line, errs) : [-Infinity, Infinity];
          const yr = c.kv.y !== undefined ? range(c.kv.y, c.line, errs) : [-Infinity, Infinity];
          region = [Math.min(...xr), Math.min(...yr), Math.max(...xr), Math.max(...yr)];
        }
        uniforms.push({
          kind,
          dir,
          mag: c.kv.mag !== undefined ? num(c.kv.mag, c.line, errs, "mag=") : 1,
          label: lab(c, 2) ?? kind,
          region,
          n: c.kv.n !== undefined ? num(c.kv.n, c.line, errs, "n=") : 6,
          line: c.line,
        });
        break;
      }
      case "wire": {
        const p = pair(c.args[0], c.line, errs);
        const d = c.args[1];
        if (d !== "in" && d !== "out" && d !== "into") {
          errs.push({
            line: c.line,
            msg: `wire needs the current's direction, out of or into the page: wire 0,0 out (got "${d ?? ""}")`,
          });
          break;
        }
        const rest = c.args.slice(2);
        const magTok = rest.find((t) => /^\d*\.?\d+$/.test(t));
        const mag = magTok !== undefined ? Number(magTok) : 1;
        const label = c.text ?? rest.find((t) => t !== magTok);
        if (!(mag > 0)) {
          errs.push({ line: c.line, msg: "a wire's relative current must be positive" });
          break;
        }
        wires.push({
          p,
          i: d === "out" ? mag : -mag,
          label: label && braceSubscripts(label),
          line: c.line,
        });
        break;
      }
      case "equi":
      case "equipotentials":
        equi = { n: c.kv.n !== undefined ? num(c.kv.n, c.line, errs, "n=") : 7, line: c.line };
        break;
      case "gauss": {
        const shape = c.args[0];
        if (shape === "circle") {
          const a = pair(c.args[1], c.line, errs);
          const r = num(c.args[2], c.line, errs, "radius");
          if (r > 0) gausses.push({ shape, a, b: a, r, label: lab(c, 3), line: c.line });
          else
            errs.push({
              line: c.line,
              msg: "gauss circle needs a centre and a positive radius: gauss circle 0,0 1.5",
            });
        } else if (shape === "rect") {
          const a = pair(c.args[1], c.line, errs),
            b = pair(c.args[2], c.line, errs);
          gausses.push({
            shape,
            a: [Math.min(a[0], b[0]), Math.min(a[1], b[1])],
            b: [Math.max(a[0], b[0]), Math.max(a[1], b[1])],
            r: 0,
            label: lab(c, 3),
            line: c.line,
          });
        } else
          errs.push({
            line: c.line,
            msg: `gauss needs circle or rect: gauss circle 0,0 1.5 "S" or gauss rect -1,-1 1,1 "S"`,
          });
        break;
      }
      case "test": {
        const p = pair(c.args[0], c.line, errs);
        const q = readCharge(c.args[1]);
        if (q === undefined || q === 0) {
          errs.push({
            line: c.line,
            msg: `test needs the charge's sign after its position: test 1,2 + or test 1,2 - (got "${c.args[1] ?? ""}")`,
          });
          break;
        }
        tests.push({
          p,
          q,
          label: lab(c, 2),
          v: c.kv.v !== undefined ? dirVec(c.kv.v, c) : undefined,
          line: c.line,
        });
        break;
      }
      case "pt":
      case "point":
        pts.push({ p: pair(c.args[0], c.line, errs), label: lab(c, 1) });
        break;
      default:
        errs.push({
          line: c.line,
          msg: `field has no "${c.op}" (use charge, plates, uniform, wire, equi, gauss, test, pt)`,
        });
    }
  }

  // ---- what cannot be drawn truthfully ----
  const eU = uniforms.filter((u) => u.kind === "E" && typeof u.dir !== "string");
  const bU = uniforms.filter((u) => u.kind === "B" && typeof u.dir !== "string");
  const pageU = uniforms.filter((u) => typeof u.dir === "string");
  if (plates.length && charges.length)
    errs.push({
      line: charges[0].line,
      msg: "plates and point charges cannot share a picture (their fields are drawn from different models); to show a charge between plates use test, which draws the force on it",
    });
  if (plates.length && eU.length)
    errs.push({
      line: eU[0].line,
      msg: "plates already make the field between them; remove the uniform E line",
    });
  if (charges.length && eU.some((u) => u.region))
    errs.push({
      line: eU.find((u) => u.region)!.line,
      msg: "a uniform E field limited to a region cannot be combined with point charges; drop x= and y= so it fills the window",
    });
  for (let i = 0; i < charges.length; i++)
    for (let j = i + 1; j < charges.length; j++)
      if (len(sub(charges[i].p, charges[j].p)) < 1e-9)
        errs.push({
          line: charges[j].line,
          msg: "two charges are at the same point; add them into one charge",
        });
  const hasE = charges.length > 0 || plates.length > 0 || uniforms.some((u) => u.kind === "E");
  const hasB = wires.length > 0 || uniforms.some((u) => u.kind === "B");
  if (!hasE && !hasB && !errs.length)
    errs.push({
      line: tests[0]?.line ?? equi?.line ?? h.line,
      msg: tests.length
        ? "the test charge has no field to feel: add a charge, plates, uniform or wire line first"
        : "field has no sources: add a charge, plates, uniform or wire line",
    });
  for (const u of uniforms)
    if (u.kind === "E" && typeof u.dir === "string")
      errs.push({
        line: u.line,
        msg: "an electric field into or out of the page is not drawn; give uniform E a direction in the page (right, left, up, down or degrees)",
      });
  if (equi && eU.some((u) => u.region))
    errs.push({
      line: equi.line,
      msg: "equipotentials need the uniform field to fill the window; drop x= and y= from the uniform E line",
    });
  if (equi && !hasE && (hasB || !errs.length))
    errs.push({
      line: equi.line,
      msg: "equipotentials need an electric field: add a charge, plates or uniform E",
    });
  if (errs.length) return { svg: "", alt: "" };

  // ---- window ----
  const strips: Strip[] = plates.flatMap((pl) => {
    const n = sub(pl.b, pl.a);
    const u: P = [-n[1] / len(n), n[0] / len(n)];
    return [
      { c: pl.a, u, half: pl.w / 2, sigma: 1 },
      { c: pl.b, u, half: pl.w / 2, sigma: -1 },
    ];
  });
  const interest: P[] = [
    ...charges.map((c) => c.p),
    ...wires.map((w) => w.p),
    ...tests.map((t) => t.p),
    ...pts.map((t) => t.p),
    ...strips.flatMap((s) => [add(s.c, mul(s.u, s.half)), add(s.c, mul(s.u, -s.half))]),
    ...gausses.flatMap((g): P[] =>
      g.shape === "circle"
        ? [
            [g.a[0] - g.r, g.a[1] - g.r],
            [g.a[0] + g.r, g.a[1] + g.r],
          ]
        : [g.a, g.b],
    ),
    ...uniforms.flatMap((u): P[] =>
      u.region
        ? ([
            [u.region[0], u.region[1]],
            [u.region[2], u.region[3]],
          ].filter((p) => p.every(Number.isFinite)) as P[])
        : [],
    ),
  ];
  let [x0, x1] = h.kv.xr !== undefined ? range(h.kv.xr, h.line, errs) : [NaN, NaN];
  let [y0, y1] = h.kv.yr !== undefined ? range(h.kv.yr, h.line, errs) : [NaN, NaN];
  if (errs.length) return { svg: "", alt: "" };
  const fit = (lo: number, hi: number, min: number): [number, number] => {
    const m = plates.length ? 1.2 : 2.2;
    let a = lo - m,
      b = hi + m;
    if (b - a < min) {
      const c = (a + b) / 2;
      a = c - min / 2;
      b = c + min / 2;
    }
    return [a, b];
  };
  const xsI = interest.length ? interest.map((p) => p[0]) : [0];
  const ysI = interest.length ? interest.map((p) => p[1]) : [0];
  if (Number.isNaN(x0)) [x0, x1] = fit(Math.min(...xsI), Math.max(...xsI), 6);
  if (Number.isNaN(y0)) [y0, y1] = fit(Math.min(...ysI), Math.max(...ysI), 4.5);
  if (!(x1 > x0) || !(y1 > y0)) {
    errs.push({
      line: h.line,
      msg: "the window is empty: write xr=-4..4 yr=-3..3 with the smaller number first",
    });
    return { svg: "", alt: "" };
  }
  const Ww = x1 - x0,
    Wh = y1 - y0,
    S = Math.max(Ww, Wh);
  const k = Math.min(430 / Ww, 320 / Wh, 80);
  const W = Ww * k,
    H = Wh * k;
  const scr = (p: P): P => [(p[0] - x0) * k, (y1 - p[1]) * k];
  const inside = (p: P, pad = 0) =>
    p[0] >= x0 - pad && p[0] <= x1 + pad && p[1] >= y0 - pad && p[1] <= y1 + pad;
  for (const o of [...charges, ...wires, ...tests])
    if (!inside(o.p))
      errs.push({
        line: o.line,
        msg: `${fmt(o.p[0])},${fmt(o.p[1])} is outside the window (x ${fmt(x0)}..${fmt(x1)}, y ${fmt(y0)}..${fmt(y1)}); move it or widen xr= yr=`,
      });
  const R = 10 / k; // a drawn charge's radius, in world units
  for (const t of tests) {
    const src = [...charges, ...wires].find((s) => len(sub(s.p, t.p)) < 2 * R);
    if (src)
      errs.push({
        line: t.line,
        msg: "the test charge sits on top of a source, where the field is not defined; move it away",
      });
    if (!t.v && !hasE)
      errs.push({
        line: t.line,
        msg: "a magnetic field pushes only on a moving charge: give the test charge a velocity, e.g. v=right",
      });
  }
  if (errs.length) return { svg: "", alt: "" };

  // ---- the fields ----
  const E0 = eU.reduce<P>((s, u) => add(s, mul(u.dir as P, u.mag)), [0, 0]);
  const inRegion = (u: Uniform, p: P) =>
    !u.region ||
    (p[0] >= u.region[0] && p[0] <= u.region[2] && p[1] >= u.region[1] && p[1] <= u.region[3]);
  const fieldE = (p: P): P => {
    let ex = 0,
      ey = 0;
    for (const u of eU)
      if (inRegion(u, p)) {
        ex += (u.dir as P)[0] * u.mag;
        ey += (u.dir as P)[1] * u.mag;
      }
    for (const c of charges) {
      const dx = p[0] - c.p[0],
        dy = p[1] - c.p[1];
      const r2 = dx * dx + dy * dy || 1e-18;
      const f = c.q / (r2 * Math.sqrt(r2));
      ex += f * dx;
      ey += f * dy;
    }
    for (const s of strips) {
      const d = sub(p, s.c);
      const X = d[0] * s.u[0] + d[1] * s.u[1];
      let Y = -d[0] * s.u[1] + d[1] * s.u[0];
      if (Math.abs(Y) < 1e-12) Y = 1e-12;
      const ea =
        (s.sigma * 0.5 * Math.log(((X + s.half) ** 2 + Y * Y) / ((X - s.half) ** 2 + Y * Y))) /
        Math.PI;
      const en = (s.sigma * (Math.atan((X + s.half) / Y) - Math.atan((X - s.half) / Y))) / Math.PI;
      ex += ea * s.u[0] - en * s.u[1];
      ey += ea * s.u[1] + en * s.u[0];
    }
    return [ex, ey];
  };
  const potential = (p: P): number => {
    let v = -(E0[0] * p[0] + E0[1] * p[1]);
    for (const c of charges) v += c.q / (len(sub(p, c.p)) || 1e-9);
    for (const s of strips) {
      const d = sub(p, s.c);
      const X = d[0] * s.u[0] + d[1] * s.u[1];
      let Y = -d[0] * s.u[1] + d[1] * s.u[0];
      if (Math.abs(Y) < 1e-12) Y = 1e-12;
      const F = (u: number) => 0.5 * u * Math.log(u * u + Y * Y) - u + Y * Math.atan(u / Y);
      v -= (s.sigma * (F(X + s.half) - F(X - s.half))) / Math.PI;
    }
    return v;
  };
  // in-plane B from the vector potential A (B = (dA/dy, −dA/dx)); Bz from fields into / out of the page
  const B0 = bU
    .filter((u) => !u.region)
    .reduce<P>((s, u) => add(s, mul(u.dir as P, u.mag)), [0, 0]);
  const vecPot = (p: P): number => {
    let a = B0[0] * p[1] - B0[1] * p[0];
    for (const w of wires) a -= w.i * Math.log(len(sub(p, w.p)) || 1e-9);
    return a;
  };
  const fieldB = (p: P): [number, number, number] => {
    let bx = 0,
      by = 0,
      bz = 0;
    for (const w of wires) {
      const d = sub(p, w.p);
      const r2 = d[0] * d[0] + d[1] * d[1] || 1e-18;
      bx += (-w.i * d[1]) / r2;
      by += (w.i * d[0]) / r2;
    }
    for (const u of uniforms) {
      if (u.kind !== "B" || !inRegion(u, p)) continue;
      if (u.dir === "out") bz += u.mag;
      else if (u.dir === "in") bz -= u.mag;
      else {
        bx += (u.dir as P)[0] * u.mag;
        by += (u.dir as P)[1] * u.mag;
      }
    }
    return [bx, by, bz];
  };

  // ---- drawing helpers ----
  let under = ""; // field lines and equipotentials
  let over = ""; // objects and labels
  const taken: [number, number, number, number][] = []; // where symbols of a page-field are not drawn
  const tag = (p: P, s: string, anchor: "start" | "middle" | "end" = "middle", extra = "") => {
    const w = textWidth(s);
    const left = anchor === "start" ? p[0] : anchor === "end" ? p[0] - w : p[0] - w / 2;
    taken.push([left - 3, p[1] - 9, left + w + 3, p[1] + 9]);
    // a patch of background behind the words, so field lines don't run through them
    over += `<rect x="${f1(left - 2)}" y="${f1(p[1] - 8)}" width="${f1(w + 4)}" height="16" rx="3" fill="var(--dg-bg,#fff)" fill-opacity=".8" stroke="none"/>`;
    over += text(p, s, anchor, ` stroke="none"${extra}`);
  };
  /** Cut a world polyline to the window, map to the screen, simplify. */
  const visible = (path: P[]): P[][] => {
    const out: P[][] = [];
    let cur: P[] = [];
    const cut = (a: P, b: P): P => {
      // a inside, b outside: the point where the segment leaves the window
      let t = 1;
      if (b[0] < x0) t = Math.min(t, (x0 - a[0]) / (b[0] - a[0]));
      if (b[0] > x1) t = Math.min(t, (x1 - a[0]) / (b[0] - a[0]));
      if (b[1] < y0) t = Math.min(t, (y0 - a[1]) / (b[1] - a[1]));
      if (b[1] > y1) t = Math.min(t, (y1 - a[1]) / (b[1] - a[1]));
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    };
    for (let i = 0; i < path.length; i++) {
      const p = path[i],
        inP = inside(p);
      if (i > 0) {
        const q = path[i - 1],
          inQ = inside(q);
        if (inQ && !inP) cur.push(cut(q, p));
        if (!inQ && inP) cur.push(cut(p, q));
      }
      if (inP) cur.push(p);
      else if (cur.length) {
        out.push(cur);
        cur = [];
      }
    }
    if (cur.length) out.push(cur);
    return out.map((w) => simplify(w.map(scr), 0.3)).filter((w) => w.length > 1);
  };
  const pathLen = (w: P[]) => w.slice(1).reduce((s, p, i) => s + len(sub(p, w[i])), 0);
  const polyD = (w: P[]) => w.map((p) => `${f1(p[0])},${f1(p[1])}`).join(" ");
  /** An arrowhead part-way along a screen path, pointing the way the path runs. */
  const head = (w: P[], at = 0.5, size = 7): string => {
    const total = pathLen(w);
    let run = 0;
    for (let i = 1; i < w.length; i++) {
      const seg = len(sub(w[i], w[i - 1]));
      if (run + seg >= total * at && seg > 0) {
        const t = (total * at - run) / seg;
        const u = mul(sub(w[i], w[i - 1]), 1 / seg);
        const tip = add(add(w[i - 1], mul(sub(w[i], w[i - 1]), t)), mul(u, size / 2));
        const base = sub(tip, mul(u, size));
        const n: P = [-u[1] * size * 0.42, u[0] * size * 0.42];
        return `<polygon points="${polyD([tip, add(base, n), sub(base, n)])}" fill="${ACCENT}" stroke="none"/>`;
      }
      run += seg;
    }
    return "";
  };
  const drawLine = (world: P[]) => {
    let drawn = 0;
    for (const w of visible(world)) {
      const L = pathLen(w);
      if (L < 8) continue;
      under += `<polyline points="${polyD(w)}"/>`;
      if (L > 34) under += head(w);
      drawn++;
    }
    return drawn;
  };

  // ---- electric field lines ----
  const said: string[] = [];
  let nLines = 0;
  let left: number[] = [];
  let arrivedCount: number[] = [];
  if (charges.length || strips.length) {
    const qmin = Math.min(...charges.map((c) => Math.abs(c.q)));
    const ratio = charges.length ? Math.max(...charges.map((c) => Math.abs(c.q))) / qmin : 1;
    let per =
      h.kv.lines !== undefined
        ? num(h.kv.lines, h.line, errs, "lines=")
        : charges.length <= 2 && ratio <= 2
          ? 12
          : 8;
    per = Math.max(2, Math.min(24, Math.round(per)));
    const want = (per0: number) =>
      charges.map((c) => Math.max(1, Math.round((per0 * Math.abs(c.q)) / qmin)));
    let quota = want(per);
    const most = () =>
      Math.max(
        quota.filter((_, i) => charges[i].q > 0).reduce((s, n) => s + n, 0),
        quota.filter((_, i) => charges[i].q < 0).reduce((s, n) => s + n, 0),
      );
    if (charges.length && most() > MAX_LINES) {
      while (per > 2 && most() > MAX_LINES) quota = want(--per);
      warns.push({
        line: h.line,
        kind: "readability",
        msg: `that would be more than ${MAX_LINES} field lines; drawing ${per} per smallest charge instead. Use smaller ratios between the charges`,
      });
    }
    const box = [x0 - S, y0 - S, x1 + S, y1 + S];
    const eRef =
      (charges.reduce((s, c) => s + Math.abs(c.q), 0) + strips.length) / (S * S) + len(E0);
    /**
     * Follow the field from p (sign +1) or against it (−1). Returns the path and where it ended:
     * the index of a charge, −2 a plate, −3 a point of zero field inside the window, −1 elsewhere.
     */
    const trace = (start: P, sign: 1 | -1, minus?: Strip[]): { path: P[]; hit: number } => {
      const path: P[] = [start];
      let p = start;
      let prev: P | undefined;
      const dir = (q: P): P | undefined => {
        const e = fieldE(q);
        const m = len(e);
        // inside the window a field this weak means a neutral point; far outside it is just distance
        return m < (inside(q) ? 0.02 : 1e-7) * eRef ? undefined : mul(e, sign / m);
      };
      for (let step = 0; step < MAX_STEPS; step++) {
        let dmin = Infinity;
        for (const c of charges) dmin = Math.min(dmin, len(sub(p, c.p)));
        let hStep = inside(p) ? Math.min(Math.max(0.2 * dmin, 0.002 * S), 0.025 * S) : 0.05 * S;
        if (strips.length) hStep = Math.min(hStep, 0.012 * S);
        const k1 = dir(p);
        // a point where the field is zero (it dies away, or turns back on itself): the line stops
        if (!k1 || (prev && k1[0] * prev[0] + k1[1] * prev[1] < 0.5))
          return { path, hit: inside(p) ? -3 : -1 };
        prev = k1;
        const k2 = dir(add(p, mul(k1, hStep / 2))) ?? k1;
        const k3 = dir(add(p, mul(k2, hStep / 2))) ?? k2;
        const k4 = dir(add(p, mul(k3, hStep))) ?? k3;
        // the field reverses within one step: the line has run head-on into a neutral point
        if ([k2, k3, k4].some((kk) => kk[0] * k1[0] + kk[1] * k1[1] < -0.2))
          return { path, hit: inside(p) ? -3 : -1 };
        const next: P = [
          p[0] + (hStep * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0])) / 6,
          p[1] + (hStep * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])) / 6,
        ];
        // ends on a charge of the other sign
        for (let i = 0; i < charges.length; i++) {
          const c = charges[i];
          if (Math.sign(c.q) === sign) continue;
          const d = sub(next, c.p);
          if (len(d) < R) {
            path.push(add(c.p, mul(d, (R * 0.9) / (len(d) || 1))));
            return { path, hit: i };
          }
        }
        // ends on the other plate
        for (const s of minus ?? []) {
          const a = sub(p, s.c),
            b = sub(next, s.c);
          const ya = -a[0] * s.u[1] + a[1] * s.u[0],
            yb = -b[0] * s.u[1] + b[1] * s.u[0];
          if (ya * yb < 0) {
            const t = ya / (ya - yb);
            const hitP = add(p, mul(sub(next, p), t));
            const xh = (hitP[0] - s.c[0]) * s.u[0] + (hitP[1] - s.c[1]) * s.u[1];
            if (Math.abs(xh) <= s.half) {
              path.push(hitP);
              return { path, hit: -2 };
            }
          }
        }
        path.push(next);
        p = next;
        if (p[0] < box[0] || p[0] > box[2] || p[1] < box[1] || p[1] > box[3]) break;
      }
      return { path, hit: -1 };
    };
    // Lines attached to each charge so far, by the angle at which they meet it.
    const attached: number[][] = charges.map(() => []);
    left = charges.map(() => 0);
    const nearest = (i: number) => {
      let best = -1;
      charges.forEach((c, j) => {
        if (
          j !== i &&
          (best < 0 || len(sub(c.p, charges[i].p)) < len(sub(charges[best].p, charges[i].p)))
        )
          best = j;
      });
      return best;
    };
    /** n evenly spaced directions; one points at the nearest unlike charge, none at a like one. */
    const ring = (i: number, n: number): number[] => {
      const j = nearest(i);
      if (j < 0) return Array.from({ length: n }, (_, m) => (2 * Math.PI * m) / n);
      const d = sub(charges[j].p, charges[i].p);
      const base = Math.atan2(d[1], d[0]);
      const off = Math.sign(charges[j].q) === Math.sign(charges[i].q) ? 0.5 : 0;
      return Array.from({ length: n }, (_, m) => base + (2 * Math.PI * (m + off)) / n);
    };
    const TAU = 2 * Math.PI;
    const norm = (a: number) => ((a % TAU) + TAU) % TAU;
    /** m more directions, spread as evenly as the directions already taken allow. */
    const fill = (taken: number[], m: number): number[] => {
      const all = taken.map(norm).sort((x, y) => x - y);
      const gaps = all.map((a, j) => ({
        a,
        g: j + 1 < all.length ? all[j + 1] - a : all[0] + TAU - a,
        k: 0,
      }));
      for (let n = 0; n < m; n++) {
        let best = gaps[0];
        for (const g of gaps) if (g.g / (g.k + 1) > best.g / (best.k + 1) + 1e-12) best = g;
        best.k++;
      }
      return gaps.flatMap((g) =>
        Array.from({ length: g.k }, (_, j) => norm(g.a + (g.g * (j + 1)) / (g.k + 1))),
      );
    };
    const from = (c: Charge, th: number): P => add(c.p, [R * Math.cos(th), R * Math.sin(th)]);
    const angleAt = (p: P, i: number) => Math.atan2(p[1] - charges[i].p[1], p[0] - charges[i].p[0]);
    under += `<g fill="none" stroke="${ACCENT}" stroke-width="1.2">`;
    // lines of a uniform field that the charges then bend
    if (len(E0) > 0 && charges.length) {
      const u = mul(E0, 1 / len(E0));
      const n: P = [-u[1], u[0]];
      const c: P = [(x0 + x1) / 2, (y0 + y1) / 2];
      const across = Math.abs(n[0]) * Ww + Math.abs(n[1]) * Wh;
      const back = (Math.abs(u[0]) * Ww + Math.abs(u[1]) * Wh) / 2 + 0.3 * S;
      const count = Math.max(2, Math.round(eU[0].n));
      for (let m = 0; m < count; m++) {
        const s = ((m + 0.5) / count - 0.5) * across;
        const { path, hit } = trace(add(add(c, mul(n, s)), mul(u, -back)), 1);
        if (hit >= 0) {
          if (attached[hit].length >= quota[hit]) continue;
          attached[hit].push(angleAt(path[path.length - 1], hit));
        }
        nLines += drawLine(path) ? 1 : 0;
      }
    }
    // Largest charges first: each starts with an even ring of lines. A line that ends on another
    // charge takes one of that charge's places; when more lines head for a charge than its share,
    // an evenly spread subset is kept and the others are redrawn in other directions. Smaller
    // charges then fill what they are still owed through their widest gaps. So every charge ends
    // with exactly its number of lines, at the cost of slightly uneven spacing round a large
    // charge that sits next to a much smaller one.
    const order = charges
      .map((_, i) => i)
      .sort((p, q) => Math.abs(charges[q].q) - Math.abs(charges[p].q) || p - q);
    for (const i of order) {
      const c = charges[i];
      const sign = c.q > 0 ? 1 : -1;
      const refused: number[] = [];
      for (let round = 0; round < 5 && attached[i].length < quota[i]; round++) {
        const need = quota[i] - attached[i].length;
        const fresh = attached[i].length + refused.length === 0;
        let seeds = fresh ? ring(i, need) : fill([...attached[i], ...refused], need);
        let traced = seeds.map((th) => ({ th, ...trace(from(c, th), sign) }));
        if (fresh && traced.some((t) => t.hit === -3)) {
          // a line ran into a point where the field is zero: turn the ring half a step
          const turned = seeds.map((th) => th + Math.PI / need);
          const again = turned.map((th) => ({ th, ...trace(from(c, th), sign) }));
          if (!again.some((t) => t.hit === -3)) [seeds, traced] = [turned, again];
        }
        // which of the lines heading for each charge it has room for
        const keep = new Set(traced);
        charges.forEach((_, d) => {
          const coming = traced.filter((t) => t.hit === d);
          const room = Math.max(0, quota[d] - attached[d].length);
          if (coming.length <= room) return;
          coming.sort(
            (p, q) =>
              norm(angleAt(p.path[p.path.length - 1], d)) -
              norm(angleAt(q.path[q.path.length - 1], d)),
          );
          const chosen = new Set(
            Array.from(
              { length: room },
              (_, j) => coming[Math.floor(((j + 0.5) * coming.length) / room)],
            ),
          );
          for (const t of coming) if (!chosen.has(t)) keep.delete(t);
        });
        for (const t of traced) {
          if (!keep.has(t)) {
            refused.push(t.th);
            continue;
          }
          attached[i].push(t.th);
          if (t.hit >= 0) attached[t.hit].push(angleAt(t.path[t.path.length - 1], t.hit));
          nLines += drawLine(sign > 0 ? t.path : [...t.path].reverse()) ? 1 : 0;
        }
      }
    }
    charges.forEach((c, i) => {
      if (c.q > 0) left[i] = attached[i].length;
    });
    arrivedCount = charges.map((c, i) => (c.q < 0 ? attached[i].length : 0));
    const short = charges.findIndex((_, i) => attached[i].length !== quota[i]);
    if (short >= 0)
      warns.push({
        line: charges[short].line,
        kind: "readability",
        msg: `this charge is drawn with ${attached[short].length} field lines where its size calls for ${quota[short]}; move the charges further apart or use simpler ratios`,
      });
    // plates: lines leave the + plate's inner face evenly, because its charge is spread evenly
    plates.forEach((pl, i) => {
      const [sp, sm] = [strips[2 * i], strips[2 * i + 1]];
      const toward = mul(sub(pl.b, pl.a), 1 / len(sub(pl.b, pl.a)));
      const count = Math.max(3, per + 1);
      for (let m = 0; m < count; m++) {
        const s = ((m + 0.5) / count - 0.5) * pl.w;
        const start = add(add(sp.c, mul(sp.u, s)), mul(toward, 0.004 * S));
        nLines += drawLine(trace(start, 1, [sm]).path) ? 1 : 0;
      }
    });
    under += `</g>`;
    if (charges.length)
      said.push(
        `electric field lines of ${charges.length === 1 ? "a point charge" : `${charges.length} point charges`} (${charges
          .map(
            (c) =>
              `${c.label ? `${plain(c.label)}, ` : ""}${c.q > 0 ? "+" : "−"}${fmt(Math.abs(c.q))} at (${fmt(c.p[0])}, ${fmt(c.p[1])})`,
          )
          .join(
            "; ",
          )}); lines leave positive charges and end on negative ones, ${per} per ${charges.length > 1 && new Set(charges.map((c) => Math.abs(c.q))).size > 1 ? "unit of the smallest charge" : "charge"}`,
      );
    if (len(E0) > 0 && charges.length) said.push("in a uniform external field");
    if (plates.length)
      said.push(
        `the electric field between ${plates.length === 1 ? "two parallel plates" : `${plates.length} pairs of parallel plates`}: evenly spaced lines from the positive plate to the negative plate, bulging outward at the edges`,
      );
  }

  // ---- uniform fields drawn directly: straight lines, or a grid of dots / crosses ----
  const regionRect = (u: Uniform): [number, number, number, number] => [
    Math.max(x0, u.region?.[0] ?? x0),
    Math.max(y0, u.region?.[1] ?? y0),
    Math.min(x1, u.region?.[2] ?? x1),
    Math.min(y1, u.region?.[3] ?? y1),
  ];
  const straight = uniforms.filter(
    (u) =>
      typeof u.dir !== "string" &&
      !(u.kind === "E" && charges.length) &&
      !(u.kind === "B" && wires.length && !u.region),
  );
  const labelAt = new Map<Uniform, P>();
  for (const u of straight) {
    const [rx0, ry0, rx1, ry1] = regionRect(u);
    const d = u.dir as P;
    const n: P = [-d[1], d[0]];
    const c: P = [(rx0 + rx1) / 2, (ry0 + ry1) / 2];
    const across = Math.abs(n[0]) * (rx1 - rx0) + Math.abs(n[1]) * (ry1 - ry0);
    const reach = len([rx1 - rx0, ry1 - ry0]);
    const count = Math.max(2, Math.round(u.n));
    under += `<g fill="none" stroke="${ACCENT}" stroke-width="1.2">`;
    for (let m = 0; m < count; m++) {
      const s = ((m + 0.5) / count - 0.5) * across;
      const mid = add(c, mul(n, s));
      // clip the infinite line to the region
      let t0 = -reach,
        t1 = reach;
      for (const [o, dd, lo, hi] of [
        [mid[0], d[0], rx0, rx1],
        [mid[1], d[1], ry0, ry1],
      ]) {
        if (Math.abs(dd) < 1e-12) {
          if (o < lo - 1e-9 || o > hi + 1e-9) t1 = t0 - 1;
          continue;
        }
        const [ta, tb] = [(lo - o) / dd, (hi - o) / dd];
        t0 = Math.max(t0, Math.min(ta, tb));
        t1 = Math.min(t1, Math.max(ta, tb));
      }
      if (t1 - t0 < 1e-9) continue;
      const w = [scr(add(mid, mul(d, t0))), scr(add(mid, mul(d, t1)))];
      under += `<polyline points="${polyD(w)}"/>` + head(w, 0.55);
      if (!labelAt.has(u)) {
        // name the field at an arrowhead, just off the line
        const at = add(w[0], mul(sub(w[1], w[0]), 0.55));
        const off = Math.abs(d[1]) > 0.7 ? [9 + textWidth(u.label) / 2, 0] : [14, -10];
        labelAt.set(u, add(at, off as P));
      }
      nLines++;
    }
    under += `</g>`;
    said.push(
      `a uniform ${u.kind === "E" ? "electric" : "magnetic"} field ${plain(u.label)} pointing ${compass(d)}${u.region ? " in part of the picture" : ""}`,
    );
  }

  // ---- magnetic field lines of wires: level curves of the vector potential ----
  let gridCache: { nx: number; ny: number } | undefined;
  const sample = (f: (p: P) => number) => {
    const nx = GRID,
      ny = Math.max(8, Math.round((GRID * Wh) / Ww));
    gridCache = { nx, ny };
    const v = new Float64Array((nx + 1) * (ny + 1));
    for (let j = 0; j <= ny; j++)
      for (let i = 0; i <= nx; i++) {
        const val = f([x0 + (Ww * i) / nx, y0 + (Wh * j) / ny]);
        v[j * (nx + 1) + i] = Number.isFinite(val) ? Math.max(-1e9, Math.min(1e9, val)) : 1e9;
      }
    return { v, nx, ny };
  };
  const toWorld = (g: P): P => [x0 + (Ww * g[0]) / gridCache!.nx, y0 + (Wh * g[1]) / gridCache!.ny];
  /** Robust range of a sampled potential, ignoring the spikes right at point sources. */
  const spread = (v: Float64Array, nx: number, ny: number, sources: P[], keep: number) => {
    const vals: number[] = [];
    for (let j = 0; j <= ny; j++)
      for (let i = 0; i <= nx; i++) {
        const p: P = [x0 + (Ww * i) / nx, y0 + (Wh * j) / ny];
        if (sources.every((s) => len(sub(p, s)) > keep)) vals.push(v[j * (nx + 1) + i]);
      }
    vals.sort((a, b) => a - b);
    return [vals[Math.floor(vals.length * 0.02)], vals[Math.floor(vals.length * 0.98)]];
  };
  if (wires.length) {
    const { v, nx, ny } = sample(vecPot);
    const [lo, hi] = spread(
      v,
      nx,
      ny,
      wires.map((w) => w.p),
      22 / k,
    );
    const n = Math.max(
      2,
      Math.min(
        16,
        Math.round(h.kv.lines !== undefined ? num(h.kv.lines, h.line, errs, "lines=") : 8),
      ),
    );
    under += `<g fill="none" stroke="${ACCENT}" stroke-width="1.2">`;
    for (let m = 0; m < n; m++) {
      const level = lo + ((m + 0.5) * (hi - lo)) / n;
      for (const g of contours(v, nx, ny, level + 1e-9 * (hi - lo))) {
        let world = g.map(toWorld);
        // run the way B points
        const i = Math.floor(world.length / 2);
        const b = fieldB(world[i]);
        const t = sub(world[Math.min(i + 1, world.length - 1)], world[Math.max(i - 1, 0)]);
        if (b[0] * t[0] + b[1] * t[1] < 0) world = world.reverse();
        const w = simplify(world.map(scr), 0.3);
        const L = pathLen(w);
        if (L < 24) continue;
        const closed = len(sub(w[0], w[w.length - 1])) < 1.5;
        under += `<polyline points="${polyD(w)}"/>` + head(w, closed ? 0.125 : 0.5);
        if (closed && L > 260) under += head(w, 0.625);
        nLines++;
      }
    }
    under += `</g>`;
    said.push(
      `magnetic field lines circling ${wires.length === 1 ? "a long straight wire" : `${wires.length} long straight wires`} seen end-on (${wires
        .map(
          (w) =>
            `${w.label ? `${plain(w.label)}, ` : ""}current ${w.i > 0 ? "out of" : "into"} the page at (${fmt(w.p[0])}, ${fmt(w.p[1])}): field ${w.i > 0 ? "counterclockwise" : "clockwise"}`,
        )
        .join("; ")})`,
    );
  }

  // ---- equipotentials ----
  // The strips stand in for conducting plates, which are equipotentials themselves: outside the
  // gap the model's contours would cut through them, so only the part between the plates is drawn.
  const betweenPlates = (world: P[]): P[][] => {
    if (!plates.length) return [world];
    const ok = (p: P) =>
      plates.some((pl, i) => {
        const sp = strips[2 * i];
        const gap = sub(pl.b, pl.a);
        const d = sub(p, pl.a);
        const t = (d[0] * gap[0] + d[1] * gap[1]) / (gap[0] * gap[0] + gap[1] * gap[1]);
        const xs = d[0] * sp.u[0] + d[1] * sp.u[1];
        return t > 0.04 && t < 0.96 && Math.abs(xs) <= sp.half * 1.12;
      });
    const out: P[][] = [];
    let cur: P[] = [];
    for (const p of world) {
      if (ok(p)) cur.push(p);
      else if (cur.length) {
        out.push(cur);
        cur = [];
      }
    }
    if (cur.length) out.push(cur);
    return out;
  };
  if (equi) {
    const { v, nx, ny } = sample(potential);
    const [lo, hi] = spread(
      v,
      nx,
      ny,
      charges.map((c) => c.p),
      26 / k,
    );
    const n = Math.max(2, Math.min(16, Math.round(equi.n)));
    const levels: number[] = [];
    if (lo < 0 && hi > 0) {
      const dv = (hi - lo) / (n + 1);
      for (let m = Math.ceil(lo / dv); m * dv < hi; m++) if (m * dv > lo) levels.push(m * dv);
    } else for (let m = 0; m < n; m++) levels.push(lo + ((m + 0.5) * (hi - lo)) / n);
    under += `<g fill="none" stroke-width="1" stroke-dasharray="4 3" stroke-opacity=".7">`;
    // A level that falls exactly on a row of samples (V = 0 on a line of symmetry) would be decided
    // by rounding noise; nudge every level off the samples by a part in a billion of the range.
    for (const level of levels)
      for (const g of contours(v, nx, ny, level + 1e-9 * (hi - lo)))
        for (const piece of betweenPlates(g.map(toWorld))) {
          const w = simplify(piece.map(scr), 0.3);
          if (pathLen(w) > 20) under += `<polyline points="${polyD(w)}"/>`;
        }
    under += `</g>`;
    said.push(
      "dashed equipotential lines at equal steps of potential, crossing the field lines at right angles",
    );
  }

  // ---- objects ----
  for (const u of uniforms) {
    const [rx0, ry0, rx1, ry1] = regionRect(u);
    const a = scr([rx0, ry1]),
      b = scr([rx1, ry0]);
    if (u.region)
      over += `<rect x="${f1(a[0])}" y="${f1(a[1])}" width="${f1(b[0] - a[0])}" height="${f1(b[1] - a[1])}" fill="none" stroke-width="1" stroke-dasharray="2 4" stroke-opacity=".5"/>`;
    const at = labelAt.get(u);
    if (at) tag(at, u.label, "middle", ` fill="${ACCENT}"`);
    else tag([a[0] + 8, a[1] + 13], u.label, "start", ` fill="${ACCENT}"`);
  }
  for (const pl of plates) {
    const n = sub(pl.b, pl.a);
    const u: P = [-n[1] / len(n), n[0] / len(n)];
    const out = mul(n, 1 / len(n));
    for (const [c, sign] of [
      [pl.a, "+"],
      [pl.b, "−"],
    ] as [P, string][]) {
      const e0 = scr(add(c, mul(u, pl.w / 2))),
        e1 = scr(add(c, mul(u, -pl.w / 2)));
      over += line(e0, e1, ` stroke-width="4" stroke-linecap="butt"`);
      taken.push([
        Math.min(e0[0], e1[0]) - 4,
        Math.min(e0[1], e1[1]) - 4,
        Math.max(e0[0], e1[0]) + 4,
        Math.max(e0[1], e1[1]) + 4,
      ]);
      // signs on the outer face
      const away = mul(out, sign === "+" ? -1 : 1);
      for (const f of [-0.36, -0.12, 0.12, 0.36]) {
        const p = scr(add(add(c, mul(u, f * pl.w)), mul(away, 11 / k)));
        over += `<text x="${f1(p[0])}" y="${f1(p[1])}" text-anchor="middle" dominant-baseline="middle" stroke="none" font-size="12">${sign}</text>`;
      }
    }
  }
  for (const g of gausses) {
    const dash = ` fill="none" stroke-width="1.5" stroke-dasharray="7 3 2 3"`;
    let corner: P;
    if (g.shape === "circle") {
      const c = scr(g.a);
      over += `<circle cx="${f1(c[0])}" cy="${f1(c[1])}" r="${f1(g.r * k)}"${dash}/>`;
      corner = [c[0] + g.r * k * 0.707 + 9, c[1] - g.r * k * 0.707 - 7];
    } else {
      const a = scr([g.a[0], g.b[1]]),
        b = scr([g.b[0], g.a[1]]);
      over += `<rect x="${f1(a[0])}" y="${f1(a[1])}" width="${f1(b[0] - a[0])}" height="${f1(b[1] - a[1])}"${dash}/>`;
      corner = [b[0] + 9, a[1] - 5];
    }
    if (g.label) tag(corner, g.label, "start");
    const within = (p: P) =>
      g.shape === "circle"
        ? len(sub(p, g.a)) - g.r
        : -Math.min(p[0] - g.a[0], g.b[0] - p[0], p[1] - g.a[1], g.b[1] - p[1]);
    const on = charges.find((c) => Math.abs(within(c.p)) < R);
    if (on)
      warns.push({
        line: g.line,
        kind: "physics",
        msg: `the Gaussian surface${g.label ? ` ${plain(g.label)}` : ""} passes through a charge, so the charge it encloses is not defined; make the surface clearly contain or clearly miss each charge`,
      });
    if (charges.length) {
      const net = charges.filter((c) => within(c.p) < 0).reduce((s, c) => s + c.q, 0);
      said.push(
        `a dashed Gaussian surface${g.label ? ` ${plain(g.label)}` : ""} enclosing net charge ${net > 0 ? "+" : net < 0 ? "−" : ""}${fmt(Math.abs(net))}`,
      );
    } else said.push(`a dashed Gaussian surface${g.label ? ` ${plain(g.label)}` : ""}`);
  }
  for (const c of charges) {
    const p = scr(c.p);
    over += `<circle cx="${f1(p[0])}" cy="${f1(p[1])}" r="10" fill="var(--dg-bg,#fff)"/>`;
    over += `<text x="${f1(p[0])}" y="${f1(p[1] + 0.5)}" text-anchor="middle" dominant-baseline="middle" stroke="none" font-size="15">${c.q > 0 ? "+" : "−"}</text>`;
    taken.push([p[0] - 12, p[1] - 12, p[0] + 12, p[1] + 12]);
    if (c.label) tag([p[0], p[1] + 21], c.label);
  }
  for (const w of wires) {
    const p = scr(w.p);
    over += `<circle cx="${f1(p[0])}" cy="${f1(p[1])}" r="8" fill="var(--dg-bg,#fff)"/>`;
    if (w.i > 0) over += `<circle cx="${f1(p[0])}" cy="${f1(p[1])}" r="2.6" stroke="none"/>`;
    else
      over +=
        line([p[0] - 4.5, p[1] - 4.5], [p[0] + 4.5, p[1] + 4.5]) +
        line([p[0] - 4.5, p[1] + 4.5], [p[0] + 4.5, p[1] - 4.5]);
    taken.push([p[0] - 10, p[1] - 10, p[0] + 10, p[1] + 10]);
    if (w.label) tag([p[0], p[1] + 19], w.label);
  }
  for (const t of pts) {
    const p = scr(t.p);
    over += `<circle cx="${f1(p[0])}" cy="${f1(p[1])}" r="3" stroke="none"/>`;
    taken.push([p[0] - 5, p[1] - 5, p[0] + 5, p[1] + 5]);
    if (t.label) {
      tag([p[0] + 8, p[1] - 10], t.label, "start");
      said.push(`point ${plain(t.label)} at (${fmt(t.p[0])}, ${fmt(t.p[1])})`);
    }
  }

  // ---- test charges and the forces on them ----
  const forces = tests.map((t) => {
    const e = hasE ? fieldE(t.p) : ([0, 0] as P);
    const fe = mul(e, t.q);
    const b = fieldB(t.p);
    const v = t.v ?? [0, 0];
    const fb: P = [t.q * v[1] * b[2], -t.q * v[0] * b[2]];
    const fz = t.q * (v[0] * b[1] - v[1] * b[0]);
    return { fe, fb, fz };
  });
  const feMax = Math.max(1e-300, ...forces.map((f) => len(f.fe)));
  const fbMax = Math.max(1e-300, ...forces.map((f) => len(f.fb)));
  tests.forEach((t, i) => {
    const p = scr(t.p);
    const f = forces[i];
    const who = t.label ? plain(t.label) : `a ${t.q > 0 ? "positive" : "negative"} test charge`;
    const draw = (vec: P, max: number, name: string, color: string) => {
      const m = len(vec);
      if (m < 1e-9 * max || m === 0) return false;
      const L = Math.max(18, (46 * m) / max);
      const u: P = [vec[0] / m, -vec[1] / m]; // to screen
      const a = add(p, mul(u, 8)),
        b = add(p, mul(u, 8 + L));
      over += arrow(a, b, color, 2, 9);
      // beside the arrow, near its tip: past the tip it would run into whatever the force points at
      let nrm: P = [-u[1], u[0]];
      if (nrm[0] < -1e-9 || (Math.abs(nrm[0]) < 1e-9 && nrm[1] > 0)) nrm = mul(nrm, -1);
      const off = 8 + (Math.abs(nrm[0]) * textWidth(name)) / 2 + Math.abs(nrm[1]) * 4;
      tag(add(sub(b, mul(u, 9)), mul(nrm, off)), name, "middle", ` fill="${color}"`);
      return true;
    };
    const both = hasE && hasB && t.v !== undefined;
    if (hasE) {
      if (draw(f.fe, feMax, both ? "F_E" : "F", FORCE))
        said.push(
          `the electric force on ${who} at (${fmt(t.p[0])}, ${fmt(t.p[1])}) points ${compass(f.fe)}`,
        );
      else {
        tag([p[0], p[1] - 16], "F = 0");
        said.push(`the electric force on ${who} is zero`);
      }
    }
    if (t.v) {
      const u: P = [t.v[0], -t.v[1]];
      over += arrow(add(p, mul(u, 8)), add(p, mul(u, 40)), "currentColor", 1.5, 8);
      tag(add(p, [u[0] * (46 + 4), u[1] * 50]), "v");
      if (hasB) {
        const name = both ? "F_B" : "F";
        if (draw(f.fb, fbMax, name, FORCE))
          said.push(
            `${who} moves ${compass(t.v)}; the magnetic force on it points ${compass(f.fb)}`,
          );
        else if (Math.abs(f.fz) > 1e-12) {
          // the force is along the line of sight: show it the way a current is shown
          const c: P = [p[0] - 2, p[1] + 22];
          over += `<circle cx="${f1(c[0])}" cy="${f1(c[1])}" r="6.5" fill="var(--dg-bg,#fff)"/>`;
          over +=
            f.fz > 0
              ? `<circle cx="${f1(c[0])}" cy="${f1(c[1])}" r="2.2" stroke="none"/>`
              : line([c[0] - 3.5, c[1] - 3.5], [c[0] + 3.5, c[1] + 3.5]) +
                line([c[0] - 3.5, c[1] + 3.5], [c[0] + 3.5, c[1] - 3.5]);
          tag([c[0] + 11, c[1]], `${name} ${f.fz > 0 ? "out of page" : "into page"}`, "start");
          said.push(
            `${who} moves ${compass(t.v)}; the magnetic force on it points ${f.fz > 0 ? "out of" : "into"} the page`,
          );
        } else {
          tag([p[0], p[1] + 20], `${name} = 0`);
          said.push(`${who} moves ${compass(t.v)}, along the field, so the magnetic force is zero`);
        }
      }
    }
    over += `<circle cx="${f1(p[0])}" cy="${f1(p[1])}" r="6.5" fill="var(--dg-bg,#fff)"/>`;
    over += `<text x="${f1(p[0])}" y="${f1(p[1] + 0.5)}" text-anchor="middle" dominant-baseline="middle" stroke="none" font-size="11">${t.q > 0 ? "+" : "−"}</text>`;
    taken.push([p[0] - 9, p[1] - 9, p[0] + 9, p[1] + 9]);
    if (t.label) {
      const side = (hasE ? f.fe[0] : f.fb[0]) > 0 ? -1 : 1;
      tag([p[0] + side * 11, p[1] - 12], t.label, side > 0 ? "start" : "end");
    }
  });

  // ---- fields into / out of the page: a grid of crosses / dots, kept clear of everything else ----
  let page = "";
  for (const u of pageU) {
    const [rx0, ry0, rx1, ry1] = regionRect(u);
    const a = scr([rx0, ry1]),
      b = scr([rx1, ry0]);
    const pitch = 34;
    const nxp = Math.max(1, Math.round((b[0] - a[0]) / pitch)),
      nyp = Math.max(1, Math.round((b[1] - a[1]) / pitch));
    for (let j = 0; j < nyp; j++)
      for (let i = 0; i < nxp; i++) {
        const p: P = [
          a[0] + ((i + 0.5) * (b[0] - a[0])) / nxp,
          a[1] + ((j + 0.5) * (b[1] - a[1])) / nyp,
        ];
        if (
          taken.some(
            (r) => p[0] > r[0] - 6 && p[0] < r[2] + 6 && p[1] > r[1] - 6 && p[1] < r[3] + 6,
          )
        )
          continue;
        page +=
          u.dir === "out"
            ? `<circle cx="${f1(p[0])}" cy="${f1(p[1])}" r="2.3" stroke="none" fill="${ACCENT}"/>`
            : `<path d="M${f1(p[0] - 4)},${f1(p[1] - 4)}l8,8m0,-8l-8,8" stroke="${ACCENT}" stroke-width="1.4" fill="none"/>`;
      }
    said.push(
      `a uniform ${u.kind === "E" ? "electric" : "magnetic"} field ${plain(u.label)} pointing ${u.dir === "out" ? "out of the page (dots)" : "into the page (crosses)"}${u.region ? " in part of the picture" : ""}`,
    );
  }

  const frame = `<rect x="0" y="0" width="${f1(W)}" height="${f1(H)}" fill="none" stroke-width="1" stroke-opacity=".22"/>`;
  let title = "";
  let top = -6;
  if (h.text) {
    title = text([W / 2, -13], h.text, "middle", ` stroke="none"`);
    top = -26;
  }
  const alt = `Field diagram${h.text ? ` (${plain(h.text)})` : ""}: ${said.join("; ")}.`;
  const side = Math.max(6, h.text ? (textWidth(h.text) - W) / 2 + 6 : 0);
  return {
    svg: wrap(W + 2 * side, H + 6 - top, frame + under + page + over + title, alt, -side, top),
    alt,
    stats: { lines: nLines, left, arrived: arrivedCount },
  };
}

function compass(v: P): string {
  const deg = ((Math.atan2(v[1], v[0]) * 180) / Math.PI + 360) % 360;
  const names = [
    "right",
    "up and to the right",
    "up",
    "up and to the left",
    "left",
    "down and to the left",
    "down",
    "down and to the right",
  ];
  const near = Math.round(deg / 45) % 8;
  return Math.abs(deg - Math.round(deg / 45) * 45) < 12 ? names[near] : `at ${Math.round(deg)}°`;
}

/** Douglas-Peucker. */
function simplify(pts: P[], eps: number): P[] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = pts[a],
      [bx, by] = pts[b];
    const dx = bx - ax,
      dy = by - ay;
    const L = Math.hypot(dx, dy);
    let worst = 0,
      at = -1;
    for (let i = a + 1; i < b; i++) {
      const d =
        L < 1e-12
          ? Math.hypot(pts[i][0] - ax, pts[i][1] - ay)
          : Math.abs(dy * (pts[i][0] - ax) - dx * (pts[i][1] - ay)) / L;
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (worst > eps && at > 0) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/**
 * Marching squares: the level curves of a sampled function, as polylines in grid coordinates.
 * v is row-major, (nx+1) × (ny+1) samples.
 */
function contours(v: Float64Array, nx: number, ny: number, level: number): P[][] {
  const at = (i: number, j: number) => v[j * (nx + 1) + i];
  // a crossing lives on a grid edge: horizontal edge (i,j)-(i+1,j) or vertical edge (i,j)-(i,j+1)
  const hKey = (i: number, j: number) => 2 * (j * (nx + 1) + i);
  const vKey = (i: number, j: number) => 2 * (j * (nx + 1) + i) + 1;
  const where = new Map<number, P>();
  const cross = (key: number, i0: number, j0: number, i1: number, j1: number) => {
    if (!where.has(key)) {
      const [a, b] = [at(i0, j0), at(i1, j1)];
      const t = (level - a) / (b - a);
      where.set(key, [i0 + (i1 - i0) * t, j0 + (j1 - j0) * t]);
    }
    return key;
  };
  const segs: [number, number][] = [];
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const a = at(i, j) >= level,
        b = at(i + 1, j) >= level,
        c = at(i + 1, j + 1) >= level,
        d = at(i, j + 1) >= level;
      const code = (a ? 1 : 0) | (b ? 2 : 0) | (c ? 4 : 0) | (d ? 8 : 0);
      if (code === 0 || code === 15) continue;
      const B = () => cross(hKey(i, j), i, j, i + 1, j),
        Rr = () => cross(vKey(i + 1, j), i + 1, j, i + 1, j + 1),
        T = () => cross(hKey(i, j + 1), i, j + 1, i + 1, j + 1),
        Lf = () => cross(vKey(i, j), i, j, i, j + 1);
      switch (code) {
        case 1:
        case 14:
          segs.push([Lf(), B()]);
          break;
        case 2:
        case 13:
          segs.push([B(), Rr()]);
          break;
        case 4:
        case 11:
          segs.push([Rr(), T()]);
          break;
        case 8:
        case 7:
          segs.push([T(), Lf()]);
          break;
        case 3:
        case 12:
          segs.push([Lf(), Rr()]);
          break;
        case 6:
        case 9:
          segs.push([B(), T()]);
          break;
        default: {
          // saddle: the cell's centre value says which corners are joined
          const centre = (at(i, j) + at(i + 1, j) + at(i + 1, j + 1) + at(i, j + 1)) / 4 >= level;
          if ((code === 5) === centre) segs.push([Lf(), T()], [B(), Rr()]);
          else segs.push([Lf(), B()], [Rr(), T()]);
        }
      }
    }
  // join segments that share an edge crossing
  const ends = new Map<number, number[]>();
  segs.forEach(([a, b], s) => {
    for (const e of [a, b]) {
      if (!ends.has(e)) ends.set(e, []);
      ends.get(e)!.push(s);
    }
  });
  const used = new Uint8Array(segs.length);
  const out: P[][] = [];
  const walk = (s: number, fromKey: number): number[] => {
    const keys: number[] = [];
    let cur = s,
      key = fromKey;
    for (;;) {
      used[cur] = 1;
      key = segs[cur][0] === key ? segs[cur][1] : segs[cur][0];
      keys.push(key);
      const next = ends.get(key)!.find((n) => !used[n]);
      if (next === undefined) break;
      cur = next;
    }
    return keys;
  };
  for (let s = 0; s < segs.length; s++) {
    if (used[s]) continue;
    const fwd = walk(s, segs[s][0]);
    const back = walk(s, segs[s][1]); // the other way from the same segment (empty for a loop)
    const keys = [...back.slice(1).reverse(), segs[s][0], ...fwd];
    const pts = keys.map((kk) => where.get(kk)!);
    if (back.length > 1 || keys.length > 2) out.push(pts);
  }
  return out;
}
