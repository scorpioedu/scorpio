// rigid: extended-body force diagrams for rotation. Forces act at stated points on a rod or a
// disc; the net torque and the net force are computed from where and how they act.
//
// rigid rod L=4 [tilt=20] [eq] [dims] [unit=m] ["beam"]   positions run 0..L from the left end
// rigid disc r=0.5 [eq] [unit=m]                          positions are angles round the rim
//                                                         (or r,angle for a point inside)
// pivot 0             the axis of rotation (rod: a position, or left / center / right);
//                     a disc turns about its centre
// support 3.5         a prop under the rod (drawn only: write its force as an f line)
// f 2 down F_g 2      position, direction, label, relative size. Directions: up down left right
//                     or degrees; on a disc also cw / ccw (along the rim)
// dim 0 2 "L/2"       a distance mark between two positions (no label: the number); on a disc,
//                     dim 90 "R" marks the radius to that point. `dims` marks every force's
//                     distance from the pivot.
//
// `eq` declares the body in equilibrium (as `fbd … eq` does). Then the torques about the pivot
// must cancel, and with no pivot the forces must cancel too (a pivot supplies whatever force is
// missing, so it is not checked). Sizes of 1 throughout make no claim and are not checked.
// Torque is counter-clockwise positive, in (size × distance) units.

import { type Cmd, type DgError, type Doc } from "./parse";
import { f1, plain, poly, wrap, type P } from "./svg";
import { Canvas, type Anchor, argNum, dimMark, finish, fmt, kvNum, unknownWords } from "./kit";

export interface RigidModel {
  body: "rod" | "disc";
  /** Where torques are taken: the pivot's position on a rod (its centre when there is no pivot); "centre" for a disc. */
  about: number | "centre";
  forces: { label: string; deg: number; size: number; torque: number }[];
  /** Counter-clockwise positive. */
  netTorque: number;
  /** [right, up]. */
  netForce: [number, number];
  declaredEquilibrium: boolean;
  /** Net torque is zero (and net force too, when there is no pivot), to 2 %. */
  balanced: boolean;
}

type Out = { svg: string; alt: string; rigid?: RigidModel };
type Force = {
  r: P;
  at: P;
  where: string;
  deg: number;
  label: string;
  size: number;
  given: boolean;
  line: number;
};

const DIRS: Record<string, number> = { right: 0, up: 90, left: 180, down: 270 };
const rad = (d: number) => (d * Math.PI) / 180;

export function renderRigid(
  doc: Doc,
  errs: DgError[],
  warns: DgError[] = [],
  equilibrium = false,
): Out {
  const h = doc.head;
  const disc = h.args.some((a) => ["disc", "disk", "wheel", "pulley"].includes(a));
  unknownWords(
    h,
    ["rod", "beam", "bar", "plank", "disc", "disk", "wheel", "pulley", "eq", "dims"],
    ["L", "r", "tilt", "unit"],
    errs,
    "use rod L=4 or disc r=1, and any of: tilt=20 eq dims unit=m",
  );
  const unit = h.kv.unit ? ` ${h.kv.unit}` : "";
  const L = kvNum(h, "L", errs, 1)!,
    R = kvNum(h, "r", errs, 1)!;
  const tilt = disc ? 0 : kvNum(h, "tilt", errs, 0)!;
  if (!(L > 0) || !(R > 0)) errs.push({ line: h.line, msg: "L and r must be positive" });
  const eq = equilibrium || h.args.includes("eq");

  const K = disc ? 72 / R : 300 / L; // px per unit
  const u: P = [Math.cos(rad(tilt)), -Math.sin(rad(tilt))]; // along the rod, on screen
  const up: P = [-Math.sin(rad(tilt)), -Math.cos(rad(tilt))]; // out of its top face
  /** A position on the body: [world vector from the reference point (right, up)], and screen point. */
  const locate = (s: string | undefined, c: Cmd): { r: P; at: P; where: string } | undefined => {
    if (disc) {
      const m = s?.match(/^(?:(-?[\d.]+),)?(-?[\d.]+)$/);
      if (!m) {
        errs.push({
          line: c.line,
          msg: `on a disc a position is an angle round the rim (90 = top), or r,angle; got "${s ?? ""}"`,
        });
        return undefined;
      }
      const rho = m[1] === undefined ? R : Number(m[1]),
        a = Number(m[2]);
      if (rho < 0 || rho > R * 1.0001)
        errs.push({ line: c.line, msg: `r = ${rho} is outside the disc (radius ${R})` });
      const r: P = [rho * Math.cos(rad(a)), rho * Math.sin(rad(a))];
      return {
        r,
        at: [r[0] * K, -r[1] * K],
        where: `${fmt(a)}°${rho === R ? " on the rim" : `, ${fmt(rho)}${unit} from the centre`}`,
      };
    }
    const named: Record<string, number> = {
      left: 0,
      center: L / 2,
      centre: L / 2,
      middle: L / 2,
      right: L,
    };
    const v = s !== undefined && s in named ? named[s] : argNum(s);
    if (v === undefined) {
      errs.push({
        line: c.line,
        msg: `${c.op} needs a position along the rod (0 to ${fmt(L)}), got "${s ?? "nothing"}"`,
      });
      return undefined;
    }
    if (v < -1e-9 || v > L * (1 + 1e-9))
      errs.push({
        line: c.line,
        msg: `position ${v} is off the rod, which runs from 0 to ${fmt(L)}`,
      });
    return {
      r: [v * Math.cos(rad(tilt)), v * Math.sin(rad(tilt))],
      at: [v * K * u[0], v * K * u[1]],
      where: `${fmt(v)}${unit}`,
    };
  };

  let pivot: { s: number; at: P } | undefined;
  const supports: P[] = [];
  const forces: Force[] = [];
  const dims: { a: P; b: P; label: string }[] = [];
  for (const c of doc.cmds) {
    if (c.op === "pivot" || c.op === "hinge" || c.op === "axis") {
      if (disc) {
        if (c.args[0] && !["center", "centre"].includes(c.args[0]))
          errs.push({ line: c.line, msg: "a disc turns about its centre; remove the pivot line" });
        continue;
      }
      const p = locate(c.args[0], c);
      if (p) pivot = { s: Math.hypot(p.r[0], p.r[1]), at: p.at };
    } else if (c.op === "support") {
      if (disc) errs.push({ line: c.line, msg: "support belongs to a rod" });
      else
        for (const a of c.args.length ? c.args : [undefined]) {
          const p = locate(a, c);
          if (p) supports.push(p.at);
        }
    } else if (c.op === "f" || c.op === "force") {
      const p = locate(c.args[0], c);
      const d = c.args[1];
      let deg: number | undefined = d !== undefined && d in DIRS ? DIRS[d] : argNum(d);
      if (disc && p && (d === "ccw" || d === "cw")) {
        const a = (Math.atan2(p.r[1], p.r[0]) * 180) / Math.PI;
        deg = a + (d === "ccw" ? 90 : -90);
      }
      if (deg === undefined) {
        errs.push({
          line: c.line,
          msg: `f needs a position, a direction (up down left right${disc ? " cw ccw" : ""} or degrees) and a label: f 2 down F_g 2`,
        });
        continue;
      }
      const label = c.text ?? c.args[2];
      const sizeArg = c.text !== undefined ? c.args[2] : c.args[3];
      const size = sizeArg === undefined ? 1 : argNum(sizeArg);
      if (!label) errs.push({ line: c.line, msg: "a force needs a label: f 2 down F_g 2" });
      if (size === undefined || !(size > 0))
        errs.push({
          line: c.line,
          msg: `the relative size of a force must be a positive number, got "${sizeArg}"`,
        });
      if (p)
        forces.push({
          ...p,
          deg: ((deg % 360) + 360) % 360,
          label: label ?? "?",
          size: size && size > 0 ? size : 1,
          given: sizeArg !== undefined,
          line: c.line,
        });
    } else if (c.op === "dim") {
      if (disc) {
        const p = locate(c.args[0], c);
        if (p)
          dims.push({
            a: [0, 0],
            b: p.at,
            label: c.text ?? `${fmt(Math.hypot(p.r[0], p.r[1]))}${unit}`,
          });
      } else {
        const [a, b] = [locate(c.args[0], c), locate(c.args[1], c)];
        if (a && b) {
          const d = Math.abs(Math.hypot(b.r[0], b.r[1]) - Math.hypot(a.r[0], a.r[1]));
          if (d < 1e-9) errs.push({ line: c.line, msg: "dim needs two different positions" });
          else dims.push({ a: a.at, b: b.at, label: c.text ?? `${fmt(d)}${unit}` });
        }
      }
    } else
      errs.push({ line: c.line, msg: `rigid has no "${c.op}" (use pivot, support, f and dim)` });
  }
  if (!forces.length) errs.push({ line: h.line, msg: "rigid needs forces: f 2 down F_g 2" });
  if (errs.length) return { svg: "", alt: "" };

  // ---- physics: torques about the pivot (the centre when there is none) ----
  const about: P = disc
    ? [0, 0]
    : (() => {
        const s = pivot ? pivot.s : L / 2;
        return [s * Math.cos(rad(tilt)), s * Math.sin(rad(tilt))] as P;
      })();
  let fx = 0,
    fy = 0,
    ccw = 0,
    cw = 0;
  const torques = forces.map((f) => {
    const F: P = [f.size * Math.cos(rad(f.deg)), f.size * Math.sin(rad(f.deg))];
    fx += F[0];
    fy += F[1];
    const t = (f.r[0] - about[0]) * F[1] - (f.r[1] - about[1]) * F[0];
    if (t > 0) ccw += t;
    else cw -= t;
    return Math.abs(t) < 1e-12 ? 0 : t;
  });
  const net = ccw - cw;
  const sumF = forces.reduce((s, f) => s + f.size, 0);
  const hasPivot = disc || pivot !== undefined;
  const torqueOk = Math.abs(net) <= 0.02 * Math.max(ccw + cw, 1e-12);
  const forceOk = hasPivot || Math.hypot(fx, fy) <= 0.02 * sumF;
  const model: RigidModel = {
    body: disc ? "disc" : "rod",
    about: disc ? "centre" : pivot ? pivot.s : L / 2,
    forces: forces.map((f, i) => ({
      label: f.label,
      deg: f.deg,
      size: f.size,
      torque: torques[i],
    })),
    netTorque: Math.abs(net) < 1e-12 ? 0 : net,
    netForce: [Math.abs(fx) < 1e-12 ? 0 : fx, Math.abs(fy) < 1e-12 ? 0 : fy],
    declaredEquilibrium: eq,
    balanced: torqueOk && forceOk,
  };
  if (eq && forces.some((f) => f.given)) {
    const point = disc ? "the centre" : pivot ? "the pivot" : "the centre of the rod";
    if (!torqueOk)
      warns.push({
        line: h.line,
        kind: "physics",
        msg: `the body is declared in equilibrium, but the torques about ${point} do not balance: ${fmt(ccw)} counter-clockwise against ${fmt(cw)} clockwise (size × distance). Fix a size or a position`,
      });
    if (!forceOk)
      warns.push({
        line: h.line,
        kind: "physics",
        msg: `the body is declared in equilibrium with no pivot, but the forces do not balance (they leave ${fmt(Math.hypot(fx, fy))} at ${fmt(((Math.atan2(fy, fx) * 180) / Math.PI + 360) % 360)}°); add the missing force or fix a size`,
      });
  }

  // ---- draw ----
  const cv = new Canvas();
  const T = 7; // half thickness of the rod
  const pt = (a: P, du: number, dn: number): P => [
    a[0] + u[0] * du + up[0] * dn,
    a[1] + u[1] * du + up[1] * dn,
  ];
  const end: P = [L * K * u[0], L * K * u[1]];
  if (disc) {
    cv.add(
      `<circle cx="0" cy="0" r="${f1(R * K)}" fill="currentColor" fill-opacity=".06" stroke-width="2"/>`,
      [-R * K, -R * K],
      [R * K, R * K],
    );
    cv.add(`<circle cx="0" cy="0" r="4" stroke="none"/>`);
  } else {
    const corners = [pt([0, 0], 0, T), pt(end, 0, T), pt(end, 0, -T), pt([0, 0], 0, -T)];
    cv.add(
      poly(corners, true, ` fill="currentColor" fill-opacity=".06" stroke-width="2"`),
      ...corners,
    );
    const prop = (a: P, hinge: boolean) => {
      const top: P = [a[0], a[1] + (hinge ? 0 : T / Math.max(0.35, Math.cos(rad(tilt))))];
      const base = top[1] + (hinge ? 30 : 24);
      cv.add(
        poly(
          [top, [top[0] - 12, base], [top[0] + 12, base]],
          true,
          ` fill="var(--dg-bg,#fff)" stroke-width="1.75"`,
        ),
        [top[0] - 16, base],
        [top[0] + 16, base],
      );
      cv.line([top[0] - 17, base], [top[0] + 17, base], ` stroke-width="1.75"`);
      for (let x = -14; x <= 14; x += 7)
        cv.line(
          [top[0] + x, base],
          [top[0] + x - 5, base + 6],
          ` stroke-width="1" stroke-opacity=".5"`,
        );
      if (hinge)
        cv.add(
          `<circle cx="${f1(a[0])}" cy="${f1(a[1])}" r="4" fill="var(--dg-bg,#fff)" stroke-width="1.75"/>`,
        );
      cv.reserve(top[0] - 16, top[1], top[0] + 16, base + 6);
    };
    for (const s of supports) prop(s, false);
    if (pivot) prop(pivot.at, true);
  }

  // forces: tails on the body, lengths in proportion
  const big = Math.max(...forces.map((f) => f.size));
  const tips: { f: Force; tip: P; d: P }[] = [];
  const stack = new Map<string, number>();
  for (const f of forces) {
    const d: P = [Math.cos(rad(f.deg)), -Math.sin(rad(f.deg))];
    const key = `${f1(f.at[0])},${f1(f.at[1])},${f1(f.deg)}`;
    const nth = stack.get(key) ?? 0; // two forces on one point in one direction sit side by side
    stack.set(key, nth + 1);
    const a: P = [f.at[0] - d[1] * nth * 12, f.at[1] + d[0] * nth * 12];
    const len = Math.max(26, (78 * f.size) / big);
    const tip: P = [a[0] + d[0] * len, a[1] + d[1] * len];
    cv.arrow(a, tip, undefined, 2.25, 10);
    cv.add(`<circle cx="${f1(a[0])}" cy="${f1(a[1])}" r="2.6" stroke="none"/>`);
    cv.reserveLine(a, tip, 4);
    tips.push({ f, tip, d });
  }
  // distance marks, on the side of the rod with fewer arrows
  if (!disc && h.args.includes("dims")) {
    const from = pivot ? pivot.at : ([0, 0] as P);
    const seen = new Set<string>();
    for (const f of forces) {
      const dist = Math.hypot(f.at[0] - from[0], f.at[1] - from[1]) / K;
      const key = f1(dist).toString();
      if (dist < 1e-9 || seen.has(key + (f.at[0] < from[0]))) continue;
      seen.add(key + (f.at[0] < from[0]));
      dims.push({ a: from, b: f.at, label: `${fmt(dist)}${unit}` });
    }
  }
  if (disc)
    for (const d of dims) {
      cv.dashed([0, 0], d.b, ` stroke-width="1" stroke-opacity=".7"`);
      const m: P = [d.b[0] / 2, d.b[1] / 2];
      const l = Math.hypot(d.b[0], d.b[1]) || 1;
      const n: P = [-d.b[1] / l, d.b[0] / l];
      cv.place(
        [
          [[m[0] + n[0] * 11, m[1] + n[1] * 11], "middle"],
          [[m[0] - n[0] * 11, m[1] - n[1] * 11], "middle"],
        ],
        d.label,
        "",
        11,
      );
    }
  else if (dims.length) {
    const below = forces.filter((f) => Math.sin(rad(f.deg - tilt)) < -0.2).length;
    const above = forces.filter((f) => Math.sin(rad(f.deg - tilt)) > 0.2).length;
    const side = above < below ? 1 : -1;
    // each mark takes the first row its span is free in
    const rows: [number, number][][] = [];
    const along = (p: P) => p[0] * u[0] + p[1] * u[1];
    for (const d of [...dims].sort(
      (p, q) => Math.abs(along(p.b) - along(p.a)) - Math.abs(along(q.b) - along(q.a)),
    )) {
      const [s0, s1] = [Math.min(along(d.a), along(d.b)), Math.max(along(d.a), along(d.b))];
      let row = rows.findIndex((r) => r.every(([a, b]) => s1 <= a + 1 || s0 >= b - 1));
      if (row < 0) row = rows.push([]) - 1;
      rows[row].push([s0, s1]);
      const off = side * (T + 16 + row * 28 + (side < 0 && (pivot || supports.length) ? 34 : 0));
      dimMark(
        cv,
        pt([s0 * u[0], s0 * u[1]], 0, off),
        pt([s1 * u[0], s1 * u[1]], 0, off),
        d.label,
        side > 0 ? -1 : 1,
      );
    }
  }

  for (const { f, tip, d } of tips) {
    const side: Anchor = Math.abs(d[0]) < 0.35 ? "middle" : d[0] > 0 ? "start" : "end";
    const beyond: P = [tip[0] + d[0] * 9, tip[1] + d[1] * 13];
    cv.place(
      [
        [beyond, side],
        [[tip[0] + 9, tip[1] + d[1] * 2], "start"],
        [[tip[0] - 9, tip[1] + d[1] * 2], "end"],
        [[beyond[0], beyond[1] + d[1] * 14], side],
        [[tip[0] - d[0] * 22 + 9, tip[1] - d[1] * 22], "start"],
        [[tip[0] - d[0] * 22 - 9, tip[1] - d[1] * 22], "end"],
      ],
      f.label,
    );
  }

  const dirName = (deg: number) =>
    Object.entries(DIRS).find(([, v]) => Math.abs(v - deg) < 1e-6)?.[0] ?? `at ${fmt(deg)}°`;
  const alt =
    `Force diagram of ${disc ? `a disc${"r" in h.kv ? ` of radius ${fmt(R)}${unit}` : ""}, free to turn about its centre` : `a rod${"L" in h.kv ? ` ${fmt(L)}${unit} long` : ""}${tilt ? ` tilted ${fmt(tilt)}°` : ""}${pivot ? `, pivoted ${fmt(pivot.s)}${unit} from its left end` : ""}${supports.length ? `, resting on ${supports.length} support${supports.length > 1 ? "s" : ""}` : ""}`}` +
    `${h.text ? ` (${plain(h.text)})` : ""}. Forces: ` +
    forces
      .map(
        (f) =>
          `${plain(f.label)} ${dirName(f.deg)} at ${f.where}${f.given ? ` (size ${fmt(f.size)})` : ""}`,
      )
      .join("; ") +
    `.${eq ? " The body is in equilibrium." : ""}`;
  const b = finish(cv, h.text);
  return { svg: wrap(b.w, b.h, cv.body, alt, b.x0, b.y0), alt, rigid: model };
}
