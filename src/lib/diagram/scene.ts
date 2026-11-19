// scene: physical setups drawn in world units (y up). Scaled to fit.
// Named objects expose anchors so later lines can attach to them:
//   point = x,y | id | id.anchor | any of those + dx,dy   e.g. A.t+0,0.5
//
// ground 0..6 [y=0]          wall 0 [0..3] [side=r]      ceil 4 [1..3]
// surf p p                   hatched surface, hatch on the right of p->p
// block A 2,0 [w=1 h=.7 rot=0] "m"        anchors c t b l r tl tr bl br
// block A on=R t=.5 "m"                   sits on incline R, fraction t up the slope
// ball  B 1,1 [r=.3] "m"   / ball B on=R t=.3
// pulley P 4,3 [r=.3]                     anchors c t b l r
// incline R 0,0 30 5 [flip] [lab=\theta]  anchors bot top corner
// pend  Q 2,4 1.5 20 ["m"] [lab=\theta]   pivot, length, degrees from vertical; anchors pivot bob
// rope p p [p..]   rod p p   dash p p   spring p p [n=8]
// hinge p    dot p ["label"]    text p "label"
// f p dir len ["label"]                   arrow; dir = degrees or up/down/left/right
// ang p a0 a1 ["θ"]                       angle arc at p between two directions
// dim p p ["L"] [off=14]                  dimension line
// alt "..."                               override generated alt text

import { type Cmd, type DgError, type Doc, angle, num, range } from "./parse";
import {
  ACCENT,
  arc,
  arcLabelPos,
  arrow,
  f1,
  line,
  plain,
  poly,
  text as svgText,
  textWidth,
  wrap,
  type P,
} from "./svg";

type Shape =
  | { t: "line"; pts: P[]; w?: number; dash?: boolean }
  | { t: "poly"; pts: P[]; fill?: string }
  | { t: "circle"; c: P; r: number; fill?: string }
  | { t: "pin"; c: P }
  | {
      t: "text";
      p: P;
      s: string;
      dx?: number;
      dy?: number;
      anchor?: "start" | "middle" | "end";
      fit?: [number, number];
    }
  | { t: "arrow"; a: P; b: P; s?: string; line?: number }
  | { t: "hatch"; a: P; b: P }
  | { t: "arc"; c: P; a0: number; a1: number; s?: string; r?: number }
  | { t: "spring"; a: P; b: P; n: number }
  | { t: "dim"; a: P; b: P; s?: string; off: number };

type Anchors = Record<string, P>;
type Obj = { kind: string; a: Anchors; along?: (t: number) => P; rot?: number; label?: string };

// commands from the other kinds, or common guesses, and what to use instead
const HINT: Record<string, string> = {
  seg: "rod for a solid bar, rope for a string, surf for a surface",
  line: "rope, rod or dash",
  arrow: "f",
  force: "f",
  vec: "f",
  label: "text",
  circle: "ball",
  floor: "ground",
  angle: "ang",
};

const rad = (d: number) => (d * Math.PI) / 180;
const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];
const mul = (a: P, k: number): P => [a[0] * k, a[1] * k];
const polar = (d: number, len = 1): P => [Math.cos(rad(d)) * len, Math.sin(rad(d)) * len];

export function renderScene(
  doc: Doc,
  errs: DgError[],
  warns: DgError[] = [],
): { svg: string; alt: string } {
  const objs = new Map<string, Obj>();
  const shapes: Shape[] = [];
  const said: string[] = [];
  let altOverride: string | undefined;

  const pt = (s: string | undefined, c: Cmd): P => {
    const m = s?.match(
      /^(?:(-?[\d.]+),(-?[\d.]+)|([A-Za-z]\w*)(?:\.(\w+))?)(?:\+(-?[\d.]+),(-?[\d.]+))?$/,
    );
    if (!m) {
      errs.push({ line: c.line, msg: `expected a point (2,3 or A.t), got "${s ?? ""}"` });
      return [0, 0];
    }
    let p: P;
    if (m[1] !== undefined) p = [+m[1], +m[2]];
    else {
      const o = objs.get(m[3]);
      if (!o) {
        errs.push({ line: c.line, msg: `"${m[3]}" is not defined above this line` });
        return [0, 0];
      }
      const key = m[4] ?? "c";
      if (!(key in o.a)) {
        errs.push({
          line: c.line,
          msg: `${m[3]} (${o.kind}) has no anchor "${key}"; it has ${Object.keys(o.a).join(" ")}`,
        });
        return [0, 0];
      }
      p = o.a[key];
    }
    return m[5] !== undefined ? add(p, [+m[5], +m[6]]) : p;
  };
  // A single-point object. A number after the point is an offset written with a space
  // ("ball B P.r -0.8"); it used to be dropped silently, drawing the ball on the pulley.
  const onePoint = (c: Cmd): P => {
    const p = pt(c.args[0], c);
    const extra = c.args[1];
    if (extra !== undefined && /^[-+]?[\d.]+(,[-+]?[\d.]+)?$/.test(extra))
      errs.push({
        line: c.line,
        msg: `"${extra}" after the point is not read; write an offset as ${c.args[0]}+dx,dy (e.g. ${c.args[0]}+0,${extra.includes(",") ? extra.split(",")[1] : extra})`,
      });
    return p;
  };
  // optional leading id: "block A 2,0" vs "block 2,0"
  const idOf = (c: Cmd): string | undefined =>
    c.args[0] && /^[A-Za-z]\w*$/.test(c.args[0]) ? c.args.shift() : undefined;
  const define = (id: string | undefined, o: Obj, c: Cmd) => {
    if (!id) return;
    if (objs.has(id)) errs.push({ line: c.line, msg: `"${id}" is already defined` });
    objs.set(id, o);
  };
  const lab = (c: Cmd) => c.text ?? c.kv.label;

  for (const c of doc.cmds) {
    switch (c.op) {
      case "ground": {
        const [x0, x1] = range(c.args[0], c.line, errs);
        const y = c.kv.y ? num(c.kv.y, c.line, errs) : 0;
        shapes.push({ t: "hatch", a: [x0, y], b: [x1, y] });
        break;
      }
      case "wall": {
        const x = num(c.args[0], c.line, errs);
        const [y0, y1] = c.args[1] ? range(c.args[1], c.line, errs) : [0, 2];
        shapes.push(
          c.kv.side === "r"
            ? { t: "hatch", a: [x, y0], b: [x, y1] }
            : { t: "hatch", a: [x, y1], b: [x, y0] },
        );
        said.push("a wall");
        break;
      }
      case "ceil": {
        const y = num(c.args[0], c.line, errs);
        const [x0, x1] = c.args[1] ? range(c.args[1], c.line, errs) : [-1, 1];
        shapes.push({ t: "hatch", a: [x1, y], b: [x0, y] });
        said.push("a ceiling");
        break;
      }
      case "surf": {
        // polyline: curved tracks are just more points
        if (c.args.length < 2) errs.push({ line: c.line, msg: "surf needs at least two points" });
        const ps = c.args.map((a) => pt(a, c));
        for (let i = 1; i < ps.length; i++) shapes.push({ t: "hatch", a: ps[i - 1], b: ps[i] });
        break;
      }

      case "incline": {
        const id = idOf(c);
        const p0 = pt(c.args[0], c);
        const th = num(c.args[1], c.line, errs, "incline angle");
        const L = num(c.args[2], c.line, errs, "incline length");
        const flip = c.args.includes("flip");
        const sx = flip ? -1 : 1;
        const top: P = add(p0, [sx * L * Math.cos(rad(th)), L * Math.sin(rad(th))]);
        const corner: P = [top[0], p0[1]];
        shapes.push({ t: "poly", pts: [p0, corner, top], fill: "currentColor" });
        if (c.kv.lab !== "none")
          shapes.push({
            t: "arc",
            c: p0,
            a0: flip ? 180 - th : 0,
            a1: flip ? 180 : th,
            s: c.kv.lab ?? `${th}°`,
            r: 34,
          });
        define(
          id,
          {
            kind: "incline",
            a: { bot: p0, top, corner },
            along: (t) => add(p0, mul([top[0] - p0[0], top[1] - p0[1]], t)),
            rot: sx * th,
          },
          c,
        );
        said.push(`an incline at ${c.kv.lab ? plain(c.kv.lab) : `${th}°`}`);
        break;
      }
      case "block":
      case "ball": {
        const id = idOf(c);
        let base: P,
          rot = c.kv.rot ? num(c.kv.rot, c.line, errs) : 0;
        let onWhat = "";
        if (c.kv.on) {
          const o = objs.get(c.kv.on);
          if (!o?.along) {
            errs.push({ line: c.line, msg: `on=${c.kv.on} must name an incline defined above` });
            base = [0, 0];
          } else {
            base = o.along(c.kv.t ? num(c.kv.t, c.line, errs) : 0.5);
            rot = o.rot ?? 0;
            onWhat = " on the incline";
          }
        } else base = onePoint(c);
        const u = polar(rot),
          n = polar(rot + 90);
        if (c.op === "block") {
          const w = c.kv.w ? num(c.kv.w, c.line, errs) : 1,
            h = c.kv.h ? num(c.kv.h, c.line, errs) : 0.7;
          const bl = add(base, mul(u, -w / 2)),
            br = add(base, mul(u, w / 2));
          const tl = add(bl, mul(n, h)),
            tr = add(br, mul(n, h));
          const ctr = add(base, mul(n, h / 2));
          shapes.push({ t: "poly", pts: [bl, br, tr, tl] });
          if (lab(c)) shapes.push({ t: "text", p: ctr, s: lab(c)!, fit: [w, h] });
          define(
            id,
            {
              kind: "block",
              label: lab(c),
              a: {
                c: ctr,
                t: add(base, mul(n, h)),
                b: base,
                l: add(ctr, mul(u, -w / 2)),
                r: add(ctr, mul(u, w / 2)),
                tl,
                tr,
                bl,
                br,
              },
            },
            c,
          );
          said.push(`a block${lab(c) ? ` ${plain(lab(c)!)}` : ""}${onWhat}`);
        } else {
          const r = c.kv.r ? num(c.kv.r, c.line, errs) : 0.3;
          const ctr = c.kv.on ? add(base, mul(n, r)) : base;
          shapes.push({ t: "circle", c: ctr, r });
          if (lab(c)) shapes.push({ t: "text", p: ctr, s: lab(c)! });
          define(
            id,
            {
              kind: "ball",
              label: lab(c),
              a: {
                c: ctr,
                t: add(ctr, [0, r]),
                b: add(ctr, [0, -r]),
                l: add(ctr, [-r, 0]),
                r: add(ctr, [r, 0]),
              },
            },
            c,
          );
          said.push(`a round object${lab(c) ? ` ${plain(lab(c)!)}` : ""}${onWhat}`);
        }
        break;
      }
      case "loop": {
        // a vertical circular track (roller-coaster loop): the rider is inside, the support outside
        const id = idOf(c);
        const ctr = pt(c.args[0], c);
        const r =
          c.args[1] !== undefined
            ? num(c.args[1], c.line, errs, "loop radius")
            : c.kv.r
              ? num(c.kv.r, c.line, errs)
              : 1;
        const n = 36;
        const ring: P[] = [];
        // counter-clockwise in world coordinates (y up): hatches fall on the right of each step, outside
        for (let i = 0; i <= n; i++) ring.push(add(ctr, polar(-90 + (360 * i) / n, r)));
        for (let i = 1; i < ring.length; i++)
          shapes.push({ t: "hatch", a: ring[i - 1], b: ring[i] });
        define(
          id,
          {
            kind: "loop",
            a: {
              c: ctr,
              t: add(ctr, [0, r]),
              b: add(ctr, [0, -r]),
              l: add(ctr, [-r, 0]),
              r: add(ctr, [r, 0]),
            },
          },
          c,
        );
        said.push(`a circular loop of radius ${r}`);
        break;
      }

      case "pulley": {
        const id = idOf(c);
        const ctr = onePoint(c);
        const r = c.kv.r ? num(c.kv.r, c.line, errs) : 0.3;
        shapes.push({ t: "circle", c: ctr, r }, { t: "pin", c: ctr });
        define(
          id,
          {
            kind: "pulley",
            a: {
              c: ctr,
              t: add(ctr, [0, r]),
              b: add(ctr, [0, -r]),
              l: add(ctr, [-r, 0]),
              r: add(ctr, [r, 0]),
            },
          },
          c,
        );
        said.push("a pulley");
        break;
      }
      case "pend": {
        const id = idOf(c);
        const pv = pt(c.args[0], c);
        const L = num(c.args[1], c.line, errs, "length");
        const th = num(c.args[2], c.line, errs, "angle from vertical");
        const bob = add(pv, polar(-90 + th, L));
        const r = Math.max(0.1, L * 0.08);
        shapes.push(
          { t: "hatch", a: add(pv, [0.4, 0]), b: add(pv, [-0.4, 0]) },
          { t: "line", pts: [pv, add(pv, [0, -L])], dash: true },
          { t: "line", pts: [pv, add(pv, polar(-90 + th, L - r))] },
          { t: "circle", c: bob, r, fill: "currentColor" },
        );
        if (c.kv.lab !== "none")
          shapes.push({
            t: "arc",
            c: pv,
            a0: Math.min(-90, -90 + th),
            a1: Math.max(-90, -90 + th),
            s: c.kv.lab ?? `${Math.abs(th)}°`,
            r: 30,
          });
        if (lab(c))
          shapes.push({
            t: "text",
            p: bob,
            s: lab(c)!,
            dx: th >= 0 ? 16 : -16,
            anchor: th >= 0 ? "start" : "end",
          });
        define(id, { kind: "pendulum", a: { pivot: pv, bob, c: bob } }, c);
        said.push(`a pendulum of length ${L} pulled ${Math.abs(th)}° from vertical`);
        break;
      }
      case "rope":
      case "rod":
      case "dash": {
        if (c.args.length < 2) errs.push({ line: c.line, msg: `${c.op} needs two points` });
        shapes.push({
          t: "line",
          pts: c.args.map((a) => pt(a, c)),
          w: c.op === "rod" ? 4 : 1.5,
          dash: c.op === "dash",
        });
        if (c.op === "rod") said.push("a rod");
        break;
      }
      case "spring":
        shapes.push({
          t: "spring",
          a: pt(c.args[0], c),
          b: pt(c.args[1], c),
          n: c.kv.n ? num(c.kv.n, c.line, errs) : 8,
        });
        said.push("a spring");
        break;
      case "hinge":
        shapes.push({ t: "pin", c: pt(c.args[0], c) });
        said.push("a hinge");
        break;
      case "dot": {
        const id = c.args.length > 1 ? idOf(c) : undefined; // "dot O 0,0" names a point
        const p = pt(c.args[0], c);
        define(id, { kind: "point", a: { c: p } }, c);
        shapes.push({ t: "circle", c: p, r: 0, fill: "currentColor" });
        if (lab(c)) shapes.push({ t: "text", p, s: lab(c)!, dx: 8, dy: -10, anchor: "start" });
        break;
      }
      case "text":
        shapes.push({ t: "text", p: pt(c.args[0], c), s: lab(c) ?? "" });
        break;
      case "f": {
        const a = pt(c.args[0], c);
        const d = angle(c.args[1], c.line, errs);
        const len = c.args[2] ? num(c.args[2], c.line, errs, "length") : 1;
        const s = c.args[3] ?? c.text;
        shapes.push({ t: "arrow", a, b: add(a, polar(d, len)), s, line: c.line });
        if (s) said.push(`arrow ${plain(s)}`);
        break;
      }
      case "ang": {
        const p = pt(c.args[0], c);
        shapes.push({
          t: "arc",
          c: p,
          a0: angle(c.args[1], c.line, errs),
          a1: angle(c.args[2], c.line, errs),
          s: c.text,
          r: 28,
        });
        break;
      }
      case "dim":
        shapes.push({
          t: "dim",
          a: pt(c.args[0], c),
          b: pt(c.args[1], c),
          s: c.text,
          off: c.kv.off ? +c.kv.off : 14,
        });
        break;
      case "alt":
        altOverride = c.text;
        break;
      default:
        errs.push({
          line: c.line,
          msg: `scene has no "${c.op}"${HINT[c.op] ? `; use ${HINT[c.op]}` : ""} (scene has ground wall ceil surf block ball pulley incline pend rope rod dash spring hinge dot text f ang dim alt)`,
        });
    }
  }

  // ---- sanity: an arrow drawn through the inside of a block or ball ----
  // A push ends at the object and a pull starts at it; neither crosses it.
  // (Gemini drew a 30°-below push from a block's corner straight through it.)
  const inside = (p: P, q: P[]) => {
    let inn = false;
    for (let i = 0, j = q.length - 1; i < q.length; j = i++)
      if (
        q[i][1] > p[1] !== q[j][1] > p[1] &&
        p[0] < ((q[j][0] - q[i][0]) * (p[1] - q[i][1])) / (q[j][1] - q[i][1]) + q[i][0]
      )
        inn = !inn;
    return inn;
  };
  for (const ar of shapes) {
    if (ar.t !== "arrow") continue;
    for (const o of shapes) {
      const n = 20;
      let hit = 0;
      for (let i = 1; i < n; i++) {
        const p: P = [
          ar.a[0] + ((ar.b[0] - ar.a[0]) * i) / n,
          ar.a[1] + ((ar.b[1] - ar.a[1]) * i) / n,
        ];
        if (o.t === "poly" && !o.fill && inside(p, o.pts)) hit++;
        else if (
          o.t === "circle" &&
          o.r > 0 &&
          !o.fill &&
          Math.hypot(p[0] - o.c[0], p[1] - o.c[1]) < o.r * 0.9
        )
          hit++;
      }
      // circles: velocity arrows often start at a ball's centre, so only flag ones that pass right through
      const limit = o.t === "circle" ? 0.75 : 0.3;
      if (hit / (n - 1) > limit) {
        warns.push({
          line: ar.line ?? doc.head.line,
          kind: "physics",
          msg: `arrow${ar.s ? ` "${plain(ar.s)}"` : ""} runs through the inside of a ${o.t === "circle" ? "round object" : "block"}; a push should end at its edge and a pull start at its edge`,
        });
        break;
      }
    }
  }

  // ---- sanity: two round objects (balls, pulleys) drawn on top of each other ----
  // Gemini placed a hanging mass on the pulley's rim instead of below it.
  const rounds = [...objs.entries()].filter(([, o]) => o.kind === "ball" || o.kind === "pulley");
  for (let i = 0; i < rounds.length; i++)
    for (let j = i + 1; j < rounds.length; j++) {
      const [ia, a] = rounds[i],
        [ib, b] = rounds[j];
      const ra = Math.hypot(a.a.r[0] - a.a.c[0], a.a.r[1] - a.a.c[1]),
        rb = Math.hypot(b.a.r[0] - b.a.c[0], b.a.r[1] - b.a.c[1]);
      if (Math.hypot(a.a.c[0] - b.a.c[0], a.a.c[1] - b.a.c[1]) < (ra + rb) * 0.9)
        warns.push({
          line: doc.head.line,
          kind: "physics",
          msg: `${ia} and ${ib} are drawn on top of each other; move one so they don't overlap`,
        });
    }

  // ---- sanity: a force labelled "X on Y" belongs to Y, and a contact force pushes ----
  // Gemini drew "F of B on A" on block A pointing toward B; between touching blocks that force
  // pushes A away from B. Objects are matched by id or label; unknown names are not checked.
  const bodies = [...objs.entries()]
    .filter(([, o]) => o.kind === "block" || o.kind === "ball")
    .map(([id, o]) => {
      const xs = Object.values(o.a).map((p) => p[0]),
        ys = Object.values(o.a).map((p) => p[1]);
      return {
        id,
        o,
        box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] as const,
      };
    });
  const named = (name: string) =>
    bodies.find(
      (b) =>
        b.id.toLowerCase() === name.toLowerCase() ||
        (b.o.label && plain(b.o.label).trim().toLowerCase() === name.toLowerCase()),
    );
  const near = (p: P, b: (typeof bodies)[number], pad = 0.15) =>
    p[0] >= b.box[0] - pad &&
    p[0] <= b.box[2] + pad &&
    p[1] >= b.box[1] - pad &&
    p[1] <= b.box[3] + pad;
  for (const ar of shapes) {
    if (ar.t !== "arrow" || !ar.s) continue;
    const m = plain(ar.s).match(/(?:^|[_\s{(,])([A-Za-z0-9]+)\s+on\s+([A-Za-z0-9]+)/);
    if (!m) continue;
    const by = named(m[1]),
      on = named(m[2]);
    if (!on) continue;
    if (!near(ar.a, on) && !near(ar.b, on)) {
      warns.push({
        line: ar.line ?? doc.head.line,
        kind: "physics",
        msg: `arrow "${plain(ar.s)}" is a force on ${m[2]}, so it should start or end at ${m[2]}`,
      });
      continue;
    }
    if (by && by !== on) {
      const gap = Math.max(
        by.box[0] - on.box[2],
        on.box[0] - by.box[2],
        by.box[1] - on.box[3],
        on.box[1] - by.box[3],
      );
      const away: P = [
        (on.box[0] + on.box[2]) / 2 - (by.box[0] + by.box[2]) / 2,
        (on.box[1] + on.box[3]) / 2 - (by.box[1] + by.box[3]) / 2,
      ];
      const d: P = [ar.b[0] - ar.a[0], ar.b[1] - ar.a[1]];
      if (gap < 0.1 && d[0] * away[0] + d[1] * away[1] < 0)
        warns.push({
          line: ar.line ?? doc.head.line,
          kind: "physics",
          msg: `${m[1]} and ${m[2]} touch, so the contact force of ${m[1]} on ${m[2]} pushes ${m[2]} away from ${m[1]}; this arrow points toward ${m[1]}`,
        });
    }
  }

  // ---- fit world to screen ----
  const wpts: P[] = shapes.flatMap((s) => {
    switch (s.t) {
      case "line":
      case "poly":
        return s.pts;
      case "circle":
        return [add(s.c, [-s.r, -s.r]), add(s.c, [s.r, s.r])];
      case "pin":
      case "arc":
        return [s.c];
      case "text":
        return [s.p];
      default:
        return [s.a, s.b];
    }
  });
  if (!wpts.length) {
    errs.push({ line: doc.head.line, msg: "scene has nothing to draw" });
    wpts.push([0, 0], [1, 1]);
  }
  const x0 = Math.min(...wpts.map((p) => p[0])),
    x1 = Math.max(...wpts.map((p) => p[0]));
  const y0 = Math.min(...wpts.map((p) => p[1])),
    y1 = Math.max(...wpts.map((p) => p[1]));
  const maxW = doc.head.kv.w ? +doc.head.kv.w : 420,
    maxH = doc.head.kv.h ? +doc.head.kv.h : 280;
  const k = Math.min(maxW / Math.max(x1 - x0, 1e-6), maxH / Math.max(y1 - y0, 1e-6), 90);
  const PAD = 34;
  const W = (x1 - x0) * k + 2 * PAD,
    H = (y1 - y0) * k + 2 * PAD;
  // Labels are sized in px, not world units, so they can overhang the world box.
  // Track each one and grow the viewBox: a clipped "1.80 m" reads as "80 m".
  const box = { x0: 0, y0: 0, x1: W, y1: H };
  type Anchor = "start" | "middle" | "end";
  type Rect = [number, number, number, number]; // x0 y0 x1 y1
  const placed: Rect[] = []; // every label drawn so far
  const rect = (p: P, str: string, anchor: Anchor): Rect => {
    const w = textWidth(str);
    const left = anchor === "start" ? p[0] : anchor === "end" ? p[0] - w : p[0] - w / 2;
    return [left - 2, p[1] - 8, left + w + 2, p[1] + 8];
  };
  const text = (p: P, str: string, anchor: Anchor = "middle", extra = "") => {
    const r = rect(p, str, anchor);
    placed.push(r);
    box.x0 = Math.min(box.x0, r[0] - 2);
    box.x1 = Math.max(box.x1, r[2] + 2);
    box.y0 = Math.min(box.y0, r[1] - 2);
    box.y1 = Math.max(box.y1, r[3] + 2);
    return svgText(p, str, anchor, extra);
  };
  const S = (p: P): P => [PAD + (p[0] - x0) * k, PAD + (y1 - p[1]) * k];
  // arrow shafts in screen space, so a label isn't put on top of another arrow
  const shafts: [P, P][] = [
    ...shapes
      .filter((x): x is Extract<Shape, { t: "arrow" }> => x.t === "arrow")
      .map((x): [P, P] => [S(x.a), S(x.b)]),
    ...shapes
      .filter((x): x is Extract<Shape, { t: "hatch" }> => x.t === "hatch")
      .map((x): [P, P] => [S(x.a), S(x.b)]), // surfaces
  ];
  // solid objects (blocks, balls, pulleys): a moved label shouldn't land inside one
  const solids: Rect[] = shapes.flatMap((x): Rect[] => {
    if (x.t === "poly" && !x.fill) {
      const q = x.pts.map(S);
      return [
        [
          Math.min(...q.map((v) => v[0])),
          Math.min(...q.map((v) => v[1])),
          Math.max(...q.map((v) => v[0])),
          Math.max(...q.map((v) => v[1])),
        ],
      ];
    }
    if (x.t === "circle" && x.r > 0) {
      const c = S(x.c),
        r = x.r * k;
      return [[c[0] - r, c[1] - r, c[0] + r, c[1] + r]];
    }
    return [];
  });
  const overlap = (r: Rect, q: Rect) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1];
  const hits = (r: Rect) =>
    placed.some((q) => overlap(r, q)) ||
    solids.some((q) => overlap(r, q)) ||
    shafts.some(([a, b]) => {
      for (let t = 0; t <= 1; t += 1 / 16) {
        const x = a[0] + (b[0] - a[0]) * t,
          y = a[1] + (b[1] - a[1]) * t;
        if (x > r[0] && x < r[2] && y > r[1] && y < r[3]) return true;
      }
      return false;
    });
  /** First candidate spot that overlaps nothing; the first one if all collide. */
  const best = (cands: [P, Anchor][], str: string): [P, Anchor] =>
    cands.find(([p, a]) => !hits(rect(p, str, a))) ?? cands[0];
  const arrowLabels: { a: P; b: P; s: string }[] = []; // placed last: they have the most freedom
  const blockLabels: { c: P; w: number; h: number; s: string }[] = []; // too wide for their block

  let out = "";
  for (const s of shapes) {
    switch (s.t) {
      case "line":
        out +=
          s.pts.length === 2
            ? line(
                S(s.pts[0]),
                S(s.pts[1]),
                ` stroke-width="${s.w ?? 1.5}"${s.dash ? ` stroke-dasharray="4 4" stroke-opacity=".6"` : ""}`,
              )
            : poly(s.pts.map(S), false, ` fill="none" stroke-width="${s.w ?? 1.5}"`);
        break;
      case "poly":
        out += poly(
          s.pts.map(S),
          true,
          s.fill ? ` fill="${s.fill}" fill-opacity=".08"` : ` fill="var(--dg-bg,#fff)"`,
        );
        break;
      case "circle": {
        const c = S(s.c);
        out +=
          s.r === 0
            ? `<circle cx="${f1(c[0])}" cy="${f1(c[1])}" r="3.5" stroke="none"/>`
            : `<circle cx="${f1(c[0])}" cy="${f1(c[1])}" r="${f1(s.r * k)}" fill="${s.fill ?? "var(--dg-bg,#fff)"}"/>`;
        break;
      }
      case "pin": {
        const c = S(s.c);
        out += `<circle cx="${f1(c[0])}" cy="${f1(c[1])}" r="3.5" fill="var(--dg-bg,#fff)"/>`;
        break;
      }
      case "text": {
        const p = S(s.p);
        // a label wider than its block moves outside it; placed after fixed labels, so it can dodge them
        if (s.fit && textWidth(s.s) > s.fit[0] * k - 6) {
          blockLabels.push({ c: p, w: s.fit[0] * k, h: s.fit[1] * k, s: s.s });
          break;
        }
        out += text(
          [p[0] + (s.dx ?? 0), p[1] + (s.dy ?? 0)],
          s.s,
          s.anchor ?? "middle",
          ` stroke="none"`,
        );
        break;
      }
      case "arrow": {
        const a = S(s.a),
          b = S(s.b);
        out += arrow(a, b, ACCENT);
        if (s.s) arrowLabels.push({ a, b, s: s.s });
        break;
      }
      case "hatch": {
        const a = S(s.a),
          b = S(s.b);
        const d = [b[0] - a[0], b[1] - a[1]],
          m = Math.hypot(d[0], d[1]) || 1;
        const u = [d[0] / m, d[1] / m];
        const n: P = [-u[1], u[0]]; // right-hand side in screen space (y down)
        out += line(a, b, ` stroke-width="2"`);
        for (let t = 6; t < m; t += 9) {
          const p: P = [a[0] + u[0] * t, a[1] + u[1] * t];
          out += line(
            p,
            [p[0] + n[0] * 7 - u[0] * 5, p[1] + n[1] * 7 - u[1] * 5],
            ` stroke-width="1" stroke-opacity=".55"`,
          );
        }
        break;
      }
      case "arc": {
        const c = S(s.c),
          r = s.r ?? 28;
        out += arc(c, r, s.a0, s.a1).replace("/>", ` stroke-width="1"/>`);
        if (s.s) out += text(arcLabelPos(c, r, s.a0, s.a1, s.s), s.s, "middle", ` stroke="none"`);
        break;
      }
      case "spring": {
        const a = S(s.a),
          b = S(s.b);
        const d = [b[0] - a[0], b[1] - a[1]],
          m = Math.hypot(d[0], d[1]) || 1;
        const u = [d[0] / m, d[1] / m],
          n = [-u[1], u[0]];
        const lead = Math.min(10, m * 0.12),
          amp = 7,
          z = s.n * 2;
        const pts: P[] = [a, [a[0] + u[0] * lead, a[1] + u[1] * lead]];
        for (let i = 1; i < z; i++) {
          const t = lead + ((m - 2 * lead) * i) / z,
            sgn = i % 2 ? 1 : -1;
          pts.push([a[0] + u[0] * t + n[0] * amp * sgn, a[1] + u[1] * t + n[1] * amp * sgn]);
        }
        pts.push([b[0] - u[0] * lead, b[1] - u[1] * lead], b);
        out += poly(pts, false, ` fill="none"`);
        break;
      }
      case "dim": {
        const a = S(s.a),
          b = S(s.b);
        const d = [b[0] - a[0], b[1] - a[1]],
          m = Math.hypot(d[0], d[1]) || 1;
        const n = [(d[1] / m) * s.off, (-d[0] / m) * s.off];
        const a2: P = [a[0] + n[0], a[1] + n[1]],
          b2: P = [b[0] + n[0], b[1] + n[1]];
        out +=
          line(a2, b2, ` stroke-width="1"`) +
          line(a, a2, ` stroke-width=".75" stroke-opacity=".5"`) +
          line(b, b2, ` stroke-width=".75" stroke-opacity=".5"`);
        out += line(
          [a2[0] - n[0] * 0.3, a2[1] - n[1] * 0.3],
          [a2[0] + n[0] * 0.3, a2[1] + n[1] * 0.3],
          ` stroke-width="1"`,
        );
        out += line(
          [b2[0] - n[0] * 0.3, b2[1] - n[1] * 0.3],
          [b2[0] + n[0] * 0.3, b2[1] + n[1] * 0.3],
          ` stroke-width="1"`,
        );
        if (s.s) {
          const nm = Math.hypot(n[0], n[1]) || 1,
            ux = n[0] / nm,
            uy = n[1] / nm;
          const gap = 6 + (Math.abs(ux) * textWidth(s.s)) / 2 + Math.abs(uy) * 8;
          out += text(
            [(a2[0] + b2[0]) / 2 + ux * gap, (a2[1] + b2[1]) / 2 + uy * gap],
            s.s,
            "middle",
            ` stroke="none"`,
          );
        }
        break;
      }
    }
  }
  const alt = altOverride ?? `Diagram showing ${said.join(", ") || "a setup"}.`;
  // Block labels that don't fit inside: above, below, then beside the block.
  for (const { c, w, h, s: str } of blockLabels) {
    const tw = textWidth(str);
    const [p, anc] = best(
      [
        [[c[0], c[1] - h / 2 - 11], "middle"],
        [[c[0] + w / 2 + 6, c[1]], "start"],
        [[c[0] - w / 2 - 6, c[1]], "end"],
        [[c[0], c[1] - h / 2 - 27], "middle"],
        [[c[0] + w / 2 + 4 + tw / 2, c[1] - h / 2 - 11], "middle"],
        [[c[0], c[1] + h / 2 + 11], "middle"],
      ],
      str,
    );
    out += text(p, str, anc, ` stroke="none"`);
  }
  // Arrow labels go last, each in the first free spot: beside the shaft's middle
  // (above, then below), then past the tip, then behind the tail.
  for (const { a, b, s: str } of arrowLabels) {
    const m = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const ux = (b[0] - a[0]) / m,
      uy = (b[1] - a[1]) / m;
    let nx = uy,
      ny = -ux; // normal pointing up (or right for vertical arrows)
    if (ny > 0 || (Math.abs(ny) < 1e-6 && nx < 0)) {
      nx = -nx;
      ny = -ny;
    }
    const vertical = Math.abs(ux) < 0.3;
    const side: Anchor = vertical ? "start" : "middle";
    const other: Anchor = vertical ? "end" : "middle";
    const at = (t: number, d: number): P => [
      a[0] + (b[0] - a[0]) * t + nx * d,
      a[1] + (b[1] - a[1]) * t + ny * d,
    ];
    const w = textWidth(str);
    // clear the shaft: half the label's width matters when the normal is sideways, its height when it's vertical
    const d = 6 + (vertical ? 0 : (Math.abs(nx) * w) / 2) + Math.abs(ny) * 8;
    const cands: [P, Anchor][] = [
      [at(0.5, d), side],
      [at(0.5, -d), other],
      [at(0.3, d), side],
      [at(0.3, -d), other],
      [at(0.5, d + 16), side],
      [at(0.5, -d - 16), other],
      [[b[0] + ux * (10 + (vertical ? 0 : w / 2)), b[1] + uy * 12], "middle"],
      [[a[0] - ux * (10 + (vertical ? 0 : w / 2)), a[1] - uy * 12], "middle"],
    ];
    const [p, anc] = best(cands, str);
    out += text(p, str, anc, ` stroke="none" fill="${ACCENT}"`);
  }
  return { svg: wrap(box.x1 - box.x0, box.y1 - box.y0, out, alt, box.x0, box.y0), alt };
}
