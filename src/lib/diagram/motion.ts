// motion: motion maps (dot diagrams). The author states the motion; the renderer computes where
// every dot goes and how long every arrow is, so the spacing can't be drawn wrong.
//
// motion dt=1 [vertical] [v] [a] [num] [axis] [unit=m] ["title"]
//                                   v / a draw velocity / acceleration arrows, num numbers the dots
// obj "car" x0=0 v0=2 a=1 n=5       n time steps of dt at constant a (n+1 dots)
// seg a=-2 n=3                      the object above continues with a new acceleration
// obj "truck" x0=0 v0=6 n=5         a second object gets its own parallel track, same scale and dt
//
// Positive is right (or up with `vertical`). When an object turns round, the way back is drawn on
// a second row so the dots don't land on top of each other.

import { type Cmd, type DgError, type Doc } from "./parse";
import { ACCENT, FORCE, arrow, f1, line, plain, text, textWidth, wrap, type P } from "./svg";

type Dot = { x: number; v: number; pass: number };
type Seg = { a: number; from: number; to: number; line: number }; // dot indices
type Obj = {
  name?: string;
  x0: number;
  v0: number;
  t0: number;
  dots: Dot[];
  segs: Seg[];
  line: number;
};

const MAX_DOTS = 40;
const OBJ_KEYS = new Set(["x0", "v0", "a", "n", "t0", "x", "v", "y0"]);
const fmt = (n: number) => String(+n.toFixed(2)).replace("-", "−");

export function renderMotion(
  doc: Doc,
  errs: DgError[],
  warns: DgError[] = [],
): { svg: string; alt: string } {
  const h = doc.head;
  const flag = (...names: string[]) => names.some((n) => h.args.includes(n) || n in h.kv);
  const vertical = flag("vertical", "vert");
  const showV = flag("v", "vel", "velocity");
  const showA = flag("a", "acc", "acceleration");
  const showNum = flag("num", "numbers");
  const showAxis = flag("axis") || "unit" in h.kv;
  const unit = h.kv.unit;
  const known = [
    "vertical",
    "vert",
    "horizontal",
    "v",
    "vel",
    "velocity",
    "a",
    "acc",
    "acceleration",
    "num",
    "numbers",
    "axis",
  ];
  for (const a of h.args)
    if (!known.includes(a))
      errs.push({
        line: h.line,
        msg: `motion has no "${a}" (use dt=1 and any of: vertical v a num axis unit=m)`,
      });
  const number = (c: Cmd, key: string, dflt: number): number => {
    const s = c.kv[key];
    if (s === undefined) return dflt;
    const n = Number(s.replace("−", "-"));
    if (!Number.isFinite(n)) {
      errs.push({ line: c.line, msg: `${key} needs a number, got "${s}"` });
      return dflt;
    }
    return n;
  };
  const dt = number(h, "dt", 1);
  if (!(dt > 0)) errs.push({ line: h.line, msg: `dt must be positive, got ${h.kv.dt}` });

  // ---- the motion: constant acceleration within each segment ----
  const objs: Obj[] = [];
  const extend = (o: Obj, c: Cmd) => {
    const a = number(c, "a", 0);
    const n = number(c, "n", NaN);
    if (!Number.isInteger(n) || n < 1) {
      errs.push({
        line: c.line,
        msg: `${c.op} needs n= a whole number of time steps (n=5 draws 5 steps of dt), got ${c.kv.n ?? "nothing"}`,
      });
      return;
    }
    const last = o.dots[o.dots.length - 1];
    const from = o.dots.length - 1;
    for (let k = 1; k <= n; k++) {
      const t = k * dt;
      o.dots.push({ x: last.x + last.v * t + 0.5 * a * t * t, v: last.v + a * t, pass: 0 });
    }
    o.segs.push({ a, from, to: o.dots.length - 1, line: c.line });
  };
  for (const c of doc.cmds) {
    for (const k of Object.keys(c.kv))
      if (k === "dt")
        errs.push({
          line: c.line,
          msg: "dt goes on the first line (motion dt=0.5): every object shares one time step, or the maps can't be compared",
        });
      else if (!OBJ_KEYS.has(k) || (c.op === "seg" && !["a", "n"].includes(k)))
        errs.push({
          line: c.line,
          msg: `${c.op} has no "${k}=" (use ${c.op === "seg" ? "a= n=" : "x0= v0= a= n="})`,
        });
    if (c.op === "obj" || c.op === "object") {
      const x0 = number(c, "x0", number(c, "x", number(c, "y0", 0)));
      const v0 = number(c, "v0", number(c, "v", 0));
      const t0 = number(c, "t0", 0);
      if (Math.abs(t0 / dt - Math.round(t0 / dt)) > 1e-9)
        errs.push({ line: c.line, msg: `t0 must be a whole number of time steps (dt=${dt})` });
      const o: Obj = {
        name: c.text ?? c.args[0],
        x0,
        v0,
        t0,
        dots: [{ x: x0, v: v0, pass: 0 }],
        segs: [],
        line: c.line,
      };
      objs.push(o);
      if ("n" in c.kv || "a" in c.kv) extend(o, c);
    } else if (c.op === "seg") {
      const o = objs[objs.length - 1];
      if (!o) errs.push({ line: c.line, msg: "seg continues an object; put an obj line above it" });
      else extend(o, c);
    } else
      errs.push({
        line: c.line,
        msg: `motion has no "${c.op}" (use obj "name" x0= v0= a= n=, then seg a= n= to continue it)`,
      });
  }
  if (!objs.length)
    errs.push({ line: h.line, msg: 'motion needs an object, e.g. obj "car" x0=0 v0=2 a=1 n=5' });
  for (const o of objs) {
    if (o.dots.length < 2 && !errs.some((e) => e.line === o.line))
      errs.push({ line: o.line, msg: "obj needs n= time steps (or seg lines below it)" });
    if (o.dots.length > MAX_DOTS) {
      errs.push({
        line: o.line,
        msg: `${o.dots.length} dots is too many to read (limit ${MAX_DOTS}); use a larger dt or fewer steps`,
      });
      o.dots.length = MAX_DOTS;
      o.segs = o.segs.filter((s) => s.from < MAX_DOTS - 1);
      o.segs.forEach((s) => (s.to = Math.min(s.to, MAX_DOTS - 1)));
    }
    // a new row each time the object turns round
    let pass = 0,
      dir = 0;
    for (let i = 1; i < o.dots.length; i++) {
      const d = Math.sign(o.dots[i].x - o.dots[i - 1].x);
      if (d && dir && d !== dir) pass++;
      if (d) dir = d;
      o.dots[i].pass = pass;
    }
  }

  // ---- scale: one for every object, or the comparison would be false ----
  const xs = objs.flatMap((o) => o.dots.map((d) => d.x));
  const lo = xs.length ? Math.min(...xs) : 0,
    hi = xs.length ? Math.max(...xs) : 1;
  const span = hi - lo;
  const LEN = vertical ? 300 : 400;
  const k = span > 0 ? Math.min(LEN / span, 80) : 1;
  const along = (x: number) => (x - lo) * k;
  const vmax = Math.max(0, ...objs.flatMap((o) => o.dots.map((d) => Math.abs(d.v))));
  const amax = Math.max(0, ...objs.flatMap((o) => o.segs.map((s) => Math.abs(s.a))));
  // velocity arrows: as long as possible without reaching the next dot
  let c = 0.7 * dt;
  for (const o of objs)
    for (let i = 0; i + 1 < o.dots.length; i++) {
      const gap = Math.abs(o.dots[i + 1].x - o.dots[i].x) * k;
      const v = Math.abs(o.dots[i].v);
      // crowded dots (the last steps before a stop) don't get to shrink every arrow
      if (v > 0 && gap >= 20 && o.dots[i + 1].pass === o.dots[i].pass)
        c = Math.min(c, (gap - 11) / (v * k));
    }
  c = Math.max(c, 0.3 * dt);
  if (vmax > 0 && vmax * c * k < 16) c = 16 / (vmax * k);

  // readability: moving dots drawn on top of each other
  for (const o of objs)
    for (let i = 0; i + 1 < o.dots.length; i++) {
      const [p, q] = [o.dots[i], o.dots[i + 1]];
      const gap = Math.abs(q.x - p.x) * k;
      if (gap > 1e-9 && gap < 6 && p.pass === q.pass && Math.abs(p.v) + Math.abs(q.v) > 0) {
        warns.push({
          line: o.line,
          kind: "readability",
          msg: `some dots of ${o.name ? `"${plain(o.name)}"` : "this object"} are less than a dot apart; use a larger dt, fewer steps, or leave out the slow part`,
        });
        break;
      }
    }

  // ---- draw. T maps (distance along the track, distance across it) to the screen ----
  const T = (s: number, across: number): P => (vertical ? [across, -s] : [s, across]);
  const ext: P[] = [];
  const mark = (p: P, w = 0, hh = 0) => ext.push([p[0] - w, p[1] - hh], [p[0] + w, p[1] + hh]);
  let body = "";
  const label = (p: P, s: string, anchor: "start" | "middle" | "end", extra = "") => {
    const w = textWidth(s);
    const cx = anchor === "middle" ? p[0] : anchor === "start" ? p[0] + w / 2 : p[0] - w / 2;
    mark([cx, p[1]], w / 2 + 2, 9);
    body += text(p, s, anchor, ` stroke="none"${extra}`);
  };
  let across = 0;
  let labelledV = false;
  const descr: string[] = [];
  for (const o of objs) {
    const passes = Math.max(0, ...o.dots.map((d) => d.pass));
    across += showNum ? 22 : 12;
    const y = across;
    // the track, then the object's name at its start
    const a0 = T(-10, y),
      a1 = T(span * k + 10, y);
    body += line(a0, a1, ` stroke-width="1" stroke-opacity=".3"`);
    mark(a0);
    mark(a1);
    const firstExt = ext.length;
    let dotsSvg = "";
    const still = o.dots.every((d) => d.x === o.dots[0].x);
    o.dots.forEach((d, i) => {
      if (still && i > 0) return;
      const p = T(along(d.x), y + d.pass * 13);
      dotsSvg += `<circle cx="${f1(p[0])}" cy="${f1(p[1])}" r="4.5" stroke="none"/>`;
      mark(p, 5, 5);
      if (showNum) {
        const idx = Math.round(o.t0 / dt) + i;
        const s = still ? `${idx}–${idx + o.dots.length - 1}` : String(idx);
        // on the way back the numbers sit on the far side of the row
        const off = d.pass % 2 ? 12 : -12;
        const q = T(along(d.x), y + d.pass * 13 + off);
        label(
          q,
          s,
          vertical ? (off < 0 ? "end" : "start") : "middle",
          ` font-size="10" fill-opacity=".7"`,
        );
      }
      if (showV) {
        const len = Math.abs(d.v) * c * k;
        if (len >= 3) {
          const sgn = Math.sign(d.v);
          const s0 = T(along(d.x) + sgn * 6.5, y + d.pass * 13),
            s1 = T(along(d.x) + sgn * (6.5 + Math.max(len, 9)), y + d.pass * 13);
          body += arrow(s0, s1, ACCENT, 1.75, 7);
          mark(s1, 4, 4);
          if (!labelledV && len > 14) {
            labelledV = true;
            const m = T(along(d.x) + sgn * (6.5 + len / 2), y + d.pass * 13 - 11);
            label(m, "v", vertical ? "end" : "middle", ` fill="${ACCENT}"`);
          }
        }
      }
    });
    body += dotsSvg; // on top of the arrows
    if (o.name) {
      // beside everything this object drew, so an arrow never runs through the name
      const mine = ext.slice(firstExt);
      if (vertical) {
        const low = Math.max(...mine.map((p) => p[1]));
        label([y + (passes * 13) / 2, low + 14], o.name, "middle");
      } else {
        const left = Math.min(...mine.map((p) => p[0]));
        label([left - 8, y + (passes * 13) / 2], o.name, "end");
      }
    }
    across += passes * 13;
    if (showA) {
      across += 20 + (showNum && passes % 2 ? 12 : 0);
      for (const s of o.segs) {
        const reach = o.dots.slice(s.from, s.to + 1).map((d) => along(d.x));
        const mid = (Math.min(...reach) + Math.max(...reach)) / 2;
        if (Math.abs(s.a) < 1e-12) {
          label(T(mid, across), "a = 0", "middle", ` font-size="11"`);
          continue;
        }
        const len = Math.max(14, (Math.abs(s.a) / amax) * 40);
        const sgn = Math.sign(s.a);
        const s0 = T(mid - (sgn * len) / 2, across),
          s1 = T(mid + (sgn * len) / 2, across);
        body += arrow(s0, s1, FORCE, 2, 8);
        mark(s0, 4, 4);
        mark(s1, 4, 4);
        const lp = vertical ? T(mid, across + 10) : T(mid + sgn * (len / 2 + 9), across);
        label(lp, "a", vertical ? "start" : sgn > 0 ? "start" : "end", ` font-size="12"`);
      }
      across += 6;
    }
    across += 16;

    // ---- alt text ----
    const first = o.dots[0],
      end = o.dots[o.dots.length - 1];
    const parts = o.segs.map((s) => {
      const [p, q] = [o.dots[s.from], o.dots[s.to]];
      const how =
        p.v === 0 && s.a === 0
          ? "at rest"
          : s.a === 0
            ? "constant velocity"
            : p.v * q.v < 0
              ? "slows, stops and turns round"
              : Math.abs(q.v) > Math.abs(p.v)
                ? "speeding up"
                : "slowing down";
      return `${how} (a = ${fmt(s.a)}, ${s.to - s.from} step${s.to - s.from > 1 ? "s" : ""})`;
    });
    descr.push(
      `${o.name ? plain(o.name) : `object ${objs.indexOf(o) + 1}`} starts at ${fmt(first.x)} with velocity ${fmt(first.v)}: ${parts.join(", then ")}; dots at ${o.dots
        .slice(0, 14)
        .map((d) => fmt(d.x))
        .join(", ")}${o.dots.length > 14 ? ", …" : ""}; ends at ${fmt(end.x)}`,
    );
  }

  // ---- which way is positive, and an optional numbered axis ----
  const name = vertical ? "y" : "x";
  if (showAxis && span > 0) {
    const yA = across + 4;
    body += line(T(-10, yA), T(span * k + 10, yA), ` stroke-width="1"`);
    const step = niceStep(span);
    for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) {
      const s = along(v);
      body += line(T(s, yA), T(s, yA + 4), ` stroke-width="1"`);
      label(
        T(s, yA + (vertical ? 8 : 14)),
        fmt(v),
        vertical ? "start" : "middle",
        ` font-size="11"`,
      );
    }
    const s = `${name}${unit ? ` (${unit})` : ""}`;
    if (vertical) label(T(span * k + 26, yA), s, "middle", ` font-size="11"`);
    else label(T(span * k + 18, yA), s, "start", ` font-size="11"`);
  } else {
    const yA = across + 2;
    const s0 = T(0, yA),
      s1 = T(34, yA);
    body += arrow(s0, s1, "currentColor", 1, 6).replace(/<line /, '<line stroke-opacity=".7" ');
    mark(s0, 3, 3);
    if (vertical) label(T(17, yA + 8), `+${name}`, "start", ` font-size="11" fill-opacity=".7"`);
    else label(T(40, yA), `+${name}`, "start", ` font-size="11" fill-opacity=".7"`);
  }

  const alt =
    `Motion map${h.text ? ` (${plain(h.text)})` : ""}: one dot every ${fmt(dt)} ${dt === 1 ? "time unit" : "time units"}, positive ${vertical ? "up" : "to the right"}. ` +
    descr.join(". ") +
    ".";
  if (!ext.length) ext.push([0, 0], [10, 10]);
  const PAD = 10;
  let x0 = Math.min(...ext.map((p) => p[0])) - PAD,
    x1 = Math.max(...ext.map((p) => p[0])) + PAD;
  let y0 = Math.min(...ext.map((p) => p[1])) - PAD;
  const y1 = Math.max(...ext.map((p) => p[1])) + PAD;
  if (h.text) {
    const w = textWidth(h.text) + 8;
    const cx = (x0 + x1) / 2;
    x0 = Math.min(x0, cx - w / 2);
    x1 = Math.max(x1, cx + w / 2);
    body += text([(x0 + x1) / 2, y0 - 6], h.text, "middle", ` stroke="none"`);
    y0 -= 20;
  }
  return { svg: wrap(x1 - x0, y1 - y0, body, alt, x0, y0), alt };
}

function niceStep(span: number): number {
  const raw = span / 6;
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}
