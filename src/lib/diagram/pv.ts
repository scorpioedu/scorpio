// pv: pressure–volume diagrams. The author names the states and the kind of process between
// them; the curve of each process and the work it does are computed.
//
// pv [num] [P=kPa V=L] ["title"]       num numbers the axes; P= V= are the axis units
// state A V=1 P=4                      a state; give V and P, or leave one off when a process
// state B V=2                          that reaches the state fixes it (here P is computed)
// isothermal A B [shade] ["label"]     also: isobaric, isochoric, adiabatic A B gamma=1.4, line
//                                      shade fills the work under that process
// shade cycle                          fills the area a closed cycle encloses (its net work)
// isotherms 3                          a family of isotherms in the background
//
// Work is the work done BY the gas, ∫P dV: positive in an expansion; a clockwise cycle does
// positive net work. (Work done ON the gas is the negative.) Adiabatic gamma defaults to 5/3.

import { type Cmd, type DgError, type Doc } from "./parse";
import { ACCENT, braceSubscripts, f1, plain, wrap, type P } from "./svg";
import { Canvas, type Anchor, chevron, curve, finish, fmt, kvNum, unknownWords } from "./kit";

export type ProcessType = "isobaric" | "isochoric" | "isothermal" | "adiabatic" | "line";
export interface PvModel {
  states: Record<string, { V: number; P: number }>;
  processes: {
    from: string;
    to: string;
    type: ProcessType;
    gamma?: number;
    /** Work done by the gas, in (pressure unit × volume unit). */
    work: number;
    /** The same in joules, when both axis units are known. */
    workJ?: number;
    /** False when the stated end state does not follow from the start state by this process. */
    consistent: boolean;
  }[];
  /** The processes join end to end and return to the first state. */
  cycle: boolean;
  /** Net work done by the gas round the cycle (positive = clockwise). */
  netWork?: number;
  netWorkJ?: number;
  unitP?: string;
  unitV?: string;
}

type Out = { svg: string; alt: string; pv?: PvModel; scale?: string[]; read?: string[] };
type State = { name: string; V?: number; P?: number; line: number };
type Proc = {
  from: State;
  to: State;
  type: ProcessType;
  gamma: number;
  shade: boolean;
  label?: string;
  line: number;
};

const TYPES: Record<string, ProcessType> = {
  isobaric: "isobaric",
  isochoric: "isochoric",
  isovolumetric: "isochoric",
  isothermal: "isothermal",
  adiabatic: "adiabatic",
  line: "line",
};
const P_UNITS: Record<string, number> = { Pa: 1, kPa: 1e3, MPa: 1e6, atm: 101325, bar: 1e5 };
const V_UNITS: Record<string, number> = {
  "m^3": 1,
  m3: 1,
  "m³": 1,
  L: 1e-3,
  mL: 1e-6,
  "cm^3": 1e-6,
  cm3: 1e-6,
  "cm³": 1e-6,
};
const TOL = 0.02;

export function renderPv(doc: Doc, errs: DgError[], warns: DgError[] = []): Out {
  const h = doc.head;
  unknownWords(h, ["num"], ["P", "V", "num"], errs, "use num and the axis units P=kPa V=L");
  const num = h.args.includes("num") || "num" in h.kv;
  const [unitP, unitV] = [h.kv.P, h.kv.V];

  const states = new Map<string, State>();
  const procs: Proc[] = [];
  let shadeCycle = false,
    shadeLine = 0,
    family = 0;
  const stateOf = (c: Cmd, name: string | undefined): State | undefined => {
    const s = name === undefined ? undefined : states.get(name);
    if (!s)
      errs.push({
        line: c.line,
        msg:
          name === undefined
            ? `${c.op} needs two states: ${c.op} A B`
            : `no state "${name}"; define it first with state ${name} V=1 P=4`,
      });
    return s;
  };
  for (const c of doc.cmds) {
    const op = c.op.toLowerCase();
    if (op === "state") {
      const name = c.args[0];
      unknownWords(c, [], ["V", "P"], errs, "use state A V=1 P=4", 1);
      if (!name) errs.push({ line: c.line, msg: "state needs a name: state A V=1 P=4" });
      else if (states.has(name)) errs.push({ line: c.line, msg: `state ${name} is defined twice` });
      else {
        const s: State = { name, V: kvNum(c, "V", errs), P: kvNum(c, "P", errs), line: c.line };
        if ((s.V !== undefined && !(s.V > 0)) || (s.P !== undefined && !(s.P > 0)))
          errs.push({ line: c.line, msg: "V and P must be positive" });
        if (s.V === undefined && s.P === undefined)
          errs.push({
            line: c.line,
            msg: `state ${name} needs V= or P= (both, unless a process fixes one)`,
          });
        states.set(name, s);
      }
    } else if (op in TYPES) {
      unknownWords(c, ["shade"], ["gamma"], errs, `use ${op} A B, with shade or a "label"`, 2);
      const [a, b] = [stateOf(c, c.args[0]), stateOf(c, c.args[1])];
      const gamma = kvNum(c, "gamma", errs, 5 / 3)!;
      if (!(gamma > 1))
        errs.push({
          line: c.line,
          msg: "gamma must be greater than 1 (5/3 monatomic, 1.4 diatomic)",
        });
      if ("gamma" in c.kv && TYPES[op] !== "adiabatic")
        errs.push({ line: c.line, msg: `gamma belongs to an adiabatic process, not ${op}` });
      if (a && b && a === b) errs.push({ line: c.line, msg: `${op} needs two different states` });
      else if (a && b)
        procs.push({
          from: a,
          to: b,
          type: TYPES[op],
          gamma,
          shade: c.args.includes("shade"),
          label: c.text,
          line: c.line,
        });
    } else if (op === "shade") {
      if (c.args[0] === "cycle" || !c.args.length) {
        shadeCycle = true;
        shadeLine = c.line;
      } else
        errs.push({
          line: c.line,
          msg: `shade cycle fills a closed cycle; to shade one process write shade after it (isobaric A B shade)`,
        });
    } else if (op === "isotherms") {
      const n = Number(c.args[0] ?? 3);
      if (!Number.isInteger(n) || n < 1 || n > 8)
        errs.push({ line: c.line, msg: "isotherms takes how many to draw, 1 to 8: isotherms 3" });
      else family = n;
    } else
      errs.push({
        line: c.line,
        msg: `pv has no "${c.op}" (use state, isobaric, isochoric, isothermal, adiabatic, line, shade cycle, isotherms)`,
      });
  }
  if (!states.size) errs.push({ line: h.line, msg: "pv needs states: state A V=1 P=4" });

  // ---- fill in the coordinate a process fixes ----
  const known = (s: State) => s.V !== undefined && s.P !== undefined;
  for (let changed = true; changed;) {
    changed = false;
    for (const p of procs)
      for (const [a, b] of [
        [p.from, p.to],
        [p.to, p.from],
      ]) {
        if (!known(a) || known(b)) continue;
        const [V, Pr] = [a.V!, a.P!];
        const k = p.type === "adiabatic" ? p.gamma : 1;
        if (p.type === "isobaric" && b.P === undefined) b.P = Pr;
        else if (p.type === "isochoric" && b.V === undefined) b.V = V;
        else if (p.type === "isothermal" || p.type === "adiabatic") {
          if (b.V !== undefined) b.P = Pr * (V / b.V) ** k;
          else b.V = V * (Pr / b.P!) ** (1 / k);
        }
        if (known(b)) changed = true;
      }
  }
  for (const s of states.values())
    if (!known(s) && (s.V !== undefined || s.P !== undefined))
      errs.push({
        line: s.line,
        msg: `state ${s.name} needs ${s.V === undefined ? "V=" : "P="} too: no isothermal, adiabatic, isobaric or isochoric process from a known state fixes it`,
      });
  if (errs.length) return { svg: "", alt: "" };

  // ---- each process: is the end state consistent, what path is drawn, how much work ----
  const pu = unitP ? P_UNITS[unitP] : undefined,
    vu = unitV ? V_UNITS[unitV] : undefined;
  const toJ = pu !== undefined && vu !== undefined ? pu * vu : undefined;
  const paths: P[][] = [];
  const model: PvModel = { states: {}, processes: [], cycle: false, unitP, unitV };
  for (const s of states.values()) model.states[s.name] = { V: s.V!, P: s.P! };
  const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b));
  for (const p of procs) {
    const [V1, P1, V2, P2] = [p.from.V!, p.from.P!, p.to.V!, p.to.P!];
    const tag = `${p.type} ${p.from.name}→${p.to.name}`;
    let consistent = true;
    const bad = (msg: string) => {
      consistent = false;
      warns.push({ line: p.line, kind: "physics", msg: `${tag}: ${msg}` });
    };
    if (p.type === "isobaric" && rel(P1, P2) > TOL)
      bad(
        `the pressure must stay the same, but ${p.from.name} has P = ${fmt(P1)} and ${p.to.name} has P = ${fmt(P2)}`,
      );
    if (p.type === "isochoric" && rel(V1, V2) > TOL)
      bad(
        `the volume must stay the same, but ${p.from.name} has V = ${fmt(V1)} and ${p.to.name} has V = ${fmt(V2)}`,
      );
    if (p.type === "isothermal" && rel(P1 * V1, P2 * V2) > TOL)
      bad(
        `P·V must stay the same, but it is ${fmt(P1 * V1)} at ${p.from.name} and ${fmt(P2 * V2)} at ${p.to.name}; for V = ${fmt(V2)} the pressure is ${fmt((P1 * V1) / V2)} (leave P off ${p.to.name} and it is computed)`,
      );
    if (p.type === "adiabatic" && rel(P1 * V1 ** p.gamma, P2 * V2 ** p.gamma) > TOL)
      bad(
        `P·V^γ must stay the same (γ = ${fmt(p.gamma)}); for V = ${fmt(V2)} the pressure is ${fmt(P1 * (V1 / V2) ** p.gamma)}, not ${fmt(P2)} (leave P off ${p.to.name} and it is computed)`,
      );
    if ((p.type === "isothermal" || p.type === "adiabatic") && rel(V1, V2) < 1e-9 && consistent)
      bad("the two states are the same point");
    // the drawn path always joins the two states: a power law P·V^k through both
    const curved = (p.type === "isothermal" || p.type === "adiabatic") && rel(V1, V2) > 1e-9;
    const k = curved ? Math.log(P2 / P1) / Math.log(V1 / V2) : 0;
    const pts: P[] = [];
    if (curved)
      for (let i = 0; i <= 48; i++) {
        const V = V1 + ((V2 - V1) * i) / 48;
        pts.push([V, P1 * (V1 / V) ** k]);
      }
    else pts.push([V1, P1], [V2, P2]);
    paths.push(pts);
    const work = !curved
      ? ((P1 + P2) / 2) * (V2 - V1)
      : Math.abs(k - 1) < 1e-9
        ? P1 * V1 * Math.log(V2 / V1)
        : (P1 * V1 - P2 * V2) / (k - 1);
    model.processes.push({
      from: p.from.name,
      to: p.to.name,
      type: p.type,
      gamma: p.type === "adiabatic" ? p.gamma : undefined,
      work,
      workJ: toJ === undefined ? undefined : work * toJ,
      consistent,
    });
  }
  model.cycle =
    procs.length >= 2 && procs.every((p, i) => p.to === procs[(i + 1) % procs.length].from);
  if (model.cycle) {
    model.netWork = model.processes.reduce((s, p) => s + p.work, 0);
    if (toJ !== undefined) model.netWorkJ = model.netWork * toJ;
  }
  if (shadeCycle && !model.cycle)
    errs.push({
      line: shadeLine,
      msg: "shade cycle needs a closed cycle: each process must start where the one before ended, and the last must return to the first state",
    });
  if (errs.length) return { svg: "", alt: "" };

  // ---- axes ----
  const all = [...states.values()];
  const axis = (vals: number[]): [number, number] => {
    const [lo, hi] = [Math.min(...vals), Math.max(...vals)];
    if (lo > 0.55 * hi && hi > lo) return [lo - 0.6 * (hi - lo), hi + 0.3 * (hi - lo)];
    return [0, hi * 1.2];
  };
  const [v0, v1] = axis(all.map((s) => s.V!)),
    [p0, p1] = axis(all.map((s) => s.P!));
  const W = 300,
    H = 220;
  const S = (q: P): P => [((q[0] - v0) / (v1 - v0)) * W, -((q[1] - p0) / (p1 - p0)) * H];
  const cv = new Canvas();
  const scale: string[] = [];

  // background isotherms, evenly spaced in temperature (P·V)
  if (family) {
    const [lo, hi] = [Math.max(v0, v1 * 0.02) * Math.max(p0, p1 * 0.02), v1 * p1];
    for (let i = 1; i <= family; i++) {
      const c = lo + ((hi - lo) * 0.82 * i) / (family + 0.6);
      const pts: P[] = [];
      for (let j = 0; j <= 60; j++) {
        const V = Math.max(v0, c / p1) + ((v1 - Math.max(v0, c / p1)) * j) / 60;
        if (V > 0 && c / V >= p0 && c / V <= p1 * 1.0001) pts.push(S([V, c / V]));
      }
      if (pts.length > 1)
        cv.add(
          curve(
            pts,
            ` stroke="${ACCENT}" stroke-width="1" stroke-opacity=".6" stroke-dasharray="4 3"`,
          ),
        );
    }
  }
  // shading: under a process down to the V axis, or the inside of the cycle
  const fill = (pts: P[]) =>
    cv.add(
      `<polygon points="${pts.map((q) => `${f1(q[0])},${f1(q[1])}`).join(" ")}" fill="${ACCENT}" fill-opacity=".2" stroke="none"/>`,
    );
  procs.forEach((p, i) => {
    if (!p.shade) return;
    const pts = paths[i];
    fill([S([pts[0][0], p0]), ...pts.map(S), S([pts[pts.length - 1][0], p0])]);
  });
  if (shadeCycle) fill(paths.flatMap((pts) => pts.map(S)));

  // axes
  cv.arrow([0, 0], [W + 16, 0], "currentColor", 1.5, 8);
  cv.arrow([0, 0], [0, -H - 16], "currentColor", 1.5, 8);
  cv.text([W + 22, 0], `V${unitV ? ` (${unitV})` : ""}`, "start");
  cv.text([0, -H - 26], `P${unitP ? ` (${unitP})` : ""}`, "middle");
  if (num) {
    const ticks = (lo: number, hi: number) => {
      const raw = (hi - lo) / 5;
      const pw = 10 ** Math.floor(Math.log10(raw));
      const m = raw / pw;
      const step = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * pw;
      const out: number[] = [];
      for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi - step * 0.3; v += step)
        out.push(+v.toPrecision(12));
      return out;
    };
    for (const v of ticks(v0, v1)) {
      const x = S([v, p0])[0];
      cv.line([x, 0], [x, 4], ` stroke-width="1"`);
      cv.line([x, 0], [x, -H], ` stroke-width="1" stroke-opacity=".1"`);
      if (x > 6 || v0 !== 0) cv.text([x, 14], fmt(v), "middle", "", 11);
      scale.push(fmt(v));
    }
    for (const v of ticks(p0, p1)) {
      const y = S([v0, v])[1];
      cv.line([0, y], [-4, y], ` stroke-width="1"`);
      cv.line([0, y], [W, y], ` stroke-width="1" stroke-opacity=".1"`);
      if (y < -6 || p0 !== 0) cv.text([-8, y], fmt(v), "end", "", 11);
      scale.push(fmt(v));
    }
    if (v0 === 0 && p0 === 0) cv.text([-6, 12], "0", "end", "", 11);
  }

  // processes, each with an arrowhead at its middle
  const centre: P = [
    all.reduce((s, q) => s + S([q.V!, q.P!])[0], 0) / all.length,
    all.reduce((s, q) => s + S([q.V!, q.P!])[1], 0) / all.length,
  ];
  const away = (q: P, d: number): P => {
    let u: P = [q[0] - centre[0], q[1] - centre[1]];
    const l = Math.hypot(u[0], u[1]);
    u = l < 2 ? [0.7, -0.7] : [u[0] / l, u[1] / l];
    return [q[0] + u[0] * d, q[1] + u[1] * d];
  };
  procs.forEach((p, i) => {
    const pts = paths[i].map(S);
    cv.add(curve(pts, ` stroke-width="2.25"`), ...pts);
    for (let j = 1; j < pts.length; j++) cv.reserveLine(pts[j - 1], pts[j], 4);
    const mid = Math.floor(pts.length / 2);
    const [a, b] = pts.length > 2 ? [pts[mid - 1], pts[mid + 1]] : [pts[0], pts[1]];
    const m: P = pts.length > 2 ? pts[mid] : [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    cv.add(chevron(m, b[0] - a[0], b[1] - a[1], "currentColor", 11));
    cv.reserve(m[0] - 7, m[1] - 7, m[0] + 7, m[1] + 7);
  });
  for (const s of all) {
    const q = S([s.V!, s.P!]);
    cv.add(`<circle cx="${f1(q[0])}" cy="${f1(q[1])}" r="3.6" stroke="none"/>`, q);
    cv.reserve(q[0] - 5, q[1] - 5, q[0] + 5, q[1] + 5);
  }
  for (const s of all) {
    const q = S([s.V!, s.P!]);
    const out = away(q, 15);
    const cands: [P, Anchor][] = [
      [out, "middle"],
      [[q[0] + 11, q[1] - 12], "start"],
      [[q[0] - 11, q[1] - 12], "end"],
      [[q[0] + 11, q[1] + 13], "start"],
      [[q[0] - 11, q[1] + 13], "end"],
      [[q[0] + 13, q[1]], "start"],
      [[q[0] - 13, q[1]], "end"],
      [away(q, 26), "middle"],
    ];
    cv.place(cands, braceSubscripts(s.name));
  }
  procs.forEach((p, i) => {
    if (!p.label) return;
    const pts = paths[i].map(S);
    const mid = Math.floor(pts.length / 2);
    const [a, b2] = pts.length > 2 ? [pts[mid - 1], pts[mid + 1]] : [pts[0], pts[1]];
    const m: P = pts.length > 2 ? pts[mid] : [(a[0] + b2[0]) / 2, (a[1] + b2[1]) / 2];
    const l = Math.hypot(b2[0] - a[0], b2[1] - a[1]) || 1;
    let n: P = [-(b2[1] - a[1]) / l, (b2[0] - a[0]) / l];
    // the side of the path that faces away from the middle of the diagram first
    if (n[0] * (m[0] - centre[0]) + n[1] * (m[1] - centre[1]) < 0) n = [-n[0], -n[1]];
    const w = (p.label.length * 6.5) / 2;
    const at = (d: number): [P, Anchor] => [
      [m[0] + n[0] * (d + Math.sign(d) * Math.abs(n[0]) * w), m[1] + n[1] * d],
      "middle",
    ];
    cv.place([at(15), at(-15), at(26), at(-26), at(38)], p.label, "", 12);
  });

  // ---- alt text ----
  const u = (x: string | undefined) => (x ? ` ${x}` : "");
  const how = (p: Proc) =>
    p.type === "line"
      ? "straight line"
      : `${p.type}${p.type === "isochoric" ? "" : p.to.V! > p.from.V! ? " expansion" : " compression"}`;
  let alt =
    `Pressure–volume diagram${h.text ? ` (${plain(h.text)})` : ""}: ` +
    `states ${all.map((s) => `${plain(s.name)} (V = ${fmt(s.V!)}${u(unitV)}, P = ${fmt(s.P!)}${u(unitP)})`).join(", ")}. `;
  if (procs.length)
    alt += `Processes: ${procs.map((p) => `${plain(p.from.name)} to ${plain(p.to.name)} ${how(p)}${p.shade ? " (area under it shaded: the work done by the gas)" : ""}`).join("; ")}. `;
  if (model.cycle)
    alt += `They form a closed cycle, drawn ${model.netWork! > 0 ? "clockwise (net work done by the gas)" : model.netWork! < 0 ? "counter-clockwise (net work done on the gas)" : "enclosing no area"}${shadeCycle ? "; the enclosed area, the net work, is shaded" : ""}. `;
  if (family) alt += `${family} isotherms are drawn in the background. `;
  alt += num ? "The axes are numbered." : "The axes have no numbers.";
  const read = num ? all.flatMap((s) => [fmt(s.V!), fmt(s.P!)]) : [];
  const b = finish(cv, h.text);
  return { svg: wrap(b.w, b.h, cv.body, alt, b.x0, b.y0), alt, pv: model, scale, read };
}
