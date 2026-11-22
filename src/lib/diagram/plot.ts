// plot: graphs of one quantity against another (x-t, v-t, F-t, U-x, ...).
//
// plot x=t[s] y=v[m/s] [xr=0,10] [yr=-10,14] [w=360] [h=220] [grid]
// seg 0,12 6,0 10,-8 ["label"] [dash]   piecewise-linear series
// fn 0.15*cos(8*t) 0..1.6 ["label"]     sampled function series
// pt 6,0 ["A"] [open]                   marked point
// shade 0..6 [of=1]                     shade between series and axis
// hl 4 ["label"]  /  vl 6 ["label"]     dashed reference line
// xt 0 3:T 6:2T  /  xt none             ticks (value or value:label)
// note 3,8 "text"                       free text at data coords

import { compile } from "./expr";
import { type Cmd, type DgError, type Doc, num, pair, range } from "./parse";
import { ACCENT, arrow, f1, line, plain, poly, text, textWidth, wrap, type P } from "./svg";

export type Series = {
  pts: P[];
  f?: (x: number) => number;
  label?: string;
  dash: boolean;
  line?: number;
};
export type PlotModel = { series: Series[]; xLabel: string; yLabel: string };

type Tick = { v: number; s: string };

export function renderPlot(
  doc: Doc,
  errs: DgError[],
  warns: DgError[] = [],
): { svg: string; alt: string; model: PlotModel } {
  const h = doc.head;
  const W = +(h.kv.w ?? 360),
    H = +(h.kv.h ?? 220);
  const xAx = axisLabel(h.kv.x ?? "x"),
    yAx = axisLabel(h.kv.y ?? "y");

  const series: Series[] = [];
  const pts: { p: P; s?: string; open: boolean; line: number }[] = [];
  const shades: { a: number; b: number; of: number; line: number }[] = [];
  const refs: { axis: "h" | "v"; v: number; s?: string }[] = [];
  const notes: { p: P; s: string }[] = [];
  let xt: Tick[] | null | undefined, yt: Tick[] | null | undefined; // undefined=auto, null=none

  for (const c of doc.cmds) {
    switch (c.op) {
      case "seg": {
        if (c.args.length < 2) errs.push({ line: c.line, msg: "seg needs at least two points" });
        const p = c.args.map((a) => pair(a, c.line, errs));
        for (let i = 1; i < p.length; i++)
          if (p[i][0] < p[i - 1][0])
            errs.push({
              line: c.line,
              msg: `seg x must not go backwards (${p[i - 1][0]} then ${p[i][0]})`,
            });
        series.push({
          pts: p,
          label: c.text,
          dash: "dash" in c.kv || c.args.includes("dash"),
          line: c.line,
        });
        break;
      }
      case "fn": {
        const [src, rng] = c.args;
        const { f, err } = compile(src ?? "");
        if (err || !f) {
          errs.push({ line: c.line, msg: err ?? "fn needs an expression" });
          break;
        }
        const [a, b] = range(rng, c.line, errs);
        const n = 120;
        const p: P[] = [];
        for (let i = 0; i <= n; i++) {
          const x = a + ((b - a) * i) / n;
          p.push([x, f(x)]);
        }
        if (p.some((q) => !Number.isFinite(q[1])))
          errs.push({ line: c.line, msg: `fn is undefined somewhere in ${rng}` });
        series.push({ pts: p, f, label: c.text, dash: c.args.includes("dash") });
        break;
      }
      case "pt":
        pts.push({
          p: pair(c.args[0], c.line, errs),
          s: c.text,
          open: c.args.includes("open"),
          line: c.line,
        });
        break;
      case "shade": {
        const [a, b] = range(c.args[0], c.line, errs);
        shades.push({ a, b, of: c.kv.of ? +c.kv.of - 1 : series.length - 1, line: c.line });
        break;
      }
      case "hl":
      case "vl":
        refs.push({ axis: c.op[0] as "h" | "v", v: num(c.args[0], c.line, errs), s: c.text });
        break;
      case "xt":
        xt = ticks(c, errs);
        break;
      case "yt":
        yt = ticks(c, errs);
        break;
      case "note":
        notes.push({ p: pair(c.args[0], c.line, errs), s: c.text ?? "" });
        break;
      default:
        errs.push({
          line: c.line,
          msg: `plot has no "${c.op}" (use seg fn pt shade hl vl xt yt note)`,
        });
    }
  }
  if (!series.length && !pts.length) errs.push({ line: h.line, msg: "plot has nothing to draw" });

  // ---- ranges: explicit, else data + ticks + reference lines, always including 0 ----
  const xs = [
    0,
    ...series.flatMap((s) => s.pts.map((p) => p[0])),
    ...pts.map((p) => p.p[0]),
    ...refs.filter((r) => r.axis === "v").map((r) => r.v),
    ...(xt ?? []).map((t) => t.v),
  ];
  const ys = [
    0,
    ...series.flatMap((s) => s.pts.map((p) => p[1])),
    ...pts.map((p) => p.p[1]),
    ...refs.filter((r) => r.axis === "h").map((r) => r.v),
    ...(yt ?? []).map((t) => t.v),
  ];
  const [x0, xHi] = h.kv.xr
    ? pair(h.kv.xr, h.line, errs)
    : pad(Math.min(...xs), Math.max(...xs), 0.04);
  const [y0, yHi] = h.kv.yr
    ? pair(h.kv.yr, h.line, errs)
    : pad(Math.min(...ys), Math.max(...ys), 0.1);
  const x1 = xHi === x0 ? x0 + 1 : xHi;
  const y1 = yHi === y0 ? y0 + 1 : yHi;

  const L = 46,
    R = 26 + 7 * xAx.text.length,
    T = 22,
    B = 30;
  const sx = (x: number) => L + ((x - x0) / (x1 - x0)) * (W - L - R);
  const sy = (y: number) => H - B - ((y - y0) / (y1 - y0)) * (H - T - B);
  const S = (p: P): P => [sx(p[0]), sy(p[1])];
  const axY = sy(Math.min(Math.max(0, y0), y1)); // x-axis sits at y=0 when visible
  const axX = sx(Math.min(Math.max(0, x0), x1));

  let out = "";
  // Every label goes through put(), which remembers how far text reaches left and right, so the
  // view box can grow to show it: a y-axis label such as "ω (rad/s)" is wider than the left margin.
  let minX = Infinity,
    maxX = -Infinity;
  const put = (p: P, s: string, anchor: "start" | "middle" | "end") => {
    const w = textWidth(s);
    const left = anchor === "start" ? p[0] : anchor === "end" ? p[0] - w : p[0] - w / 2;
    minX = Math.min(minX, left);
    maxX = Math.max(maxX, left + w);
    return text(p, s, anchor, ` stroke="none"`);
  };
  if ("grid" in h.kv || h.args.includes("grid")) {
    for (const t of xt ?? autoTicks(x0, x1))
      out += line([sx(t.v), T], [sx(t.v), H - B], ` stroke-opacity=".15" stroke-width="1"`);
    for (const t of yt ?? autoTicks(y0, y1))
      out += line([L, sy(t.v)], [W - R, sy(t.v)], ` stroke-opacity=".15" stroke-width="1"`);
  }
  // shading under a series
  for (const s of shades) {
    const ser = series[s.of];
    if (!ser) {
      errs.push({ line: s.line, msg: "shade has no series to shade (put it after seg/fn)" });
      continue;
    }
    const inside = clip(ser.pts, s.a, s.b);
    if (inside.length)
      out += poly(
        ([[inside[0][0], 0], ...inside, [inside[inside.length - 1][0], 0]] as P[]).map(S),
        true,
        ` fill="${ACCENT}" fill-opacity=".18" stroke="none"`,
      );
  }
  // reference lines
  for (const r of refs) {
    const a: P = r.axis === "h" ? [L, sy(r.v)] : [sx(r.v), T];
    const b: P = r.axis === "h" ? [W - R, sy(r.v)] : [sx(r.v), H - B];
    out += line(a, b, ` stroke-dasharray="4 4" stroke-width="1" stroke-opacity=".6"`);
    if (r.s)
      out +=
        r.axis === "h"
          ? put([W - R + 4, sy(r.v)], r.s, "start")
          : put([sx(r.v), T - 10], r.s, "middle");
  }
  // axes with arrowheads
  out += arrow([L - 6, axY], [W - R + 14, axY], "currentColor", 1.5, 7);
  out += arrow([axX, H - B + 6], [axX, T - 14], "currentColor", 1.5, 7);
  out += put([W - R + 20, axY], xAx.text, "start");
  out += put([axX - 8, T - 12], yAx.text, "end");
  // ticks
  for (const t of xt === null ? [] : (xt ?? autoTicks(x0, x1))) {
    if (t.v === 0 && axX === sx(0) && axY === sy(0)) continue;
    out += line([sx(t.v), axY - 3], [sx(t.v), axY + 3]) + put([sx(t.v), axY + 13], t.s, "middle");
  }
  for (const t of yt === null ? [] : (yt ?? autoTicks(y0, y1))) {
    if (t.v === 0 && axY === sy(0)) continue;
    out += line([axX - 3, sy(t.v)], [axX + 3, sy(t.v)]) + put([axX - 6, sy(t.v)], t.s, "end");
  }
  if ((xt !== null || yt !== null) && axX === sx(0) && axY === sy(0))
    out += put([axX - 6, axY + 12], "0", "end");
  // series
  for (const s of series) {
    out += poly(
      s.pts.map(S),
      false,
      ` fill="none" stroke="${ACCENT}" stroke-width="2.2"${s.dash ? ` stroke-dasharray="6 4"` : ""}`,
    );
    if (s.label) {
      const e = S(s.pts[s.pts.length - 1]);
      out += put([e[0] + 4, e[1] - 10], s.label, "start");
    }
  }
  for (const p of pts) {
    const q = S(p.p);
    out += `<circle cx="${f1(q[0])}" cy="${f1(q[1])}" r="3.5" fill="${p.open ? "var(--dg-bg,#fff)" : "currentColor"}"/>`;
    if (p.s) out += put([q[0] + 7, q[1] - 10], p.s, "start");
  }
  // A note is centred on its point; near the y-axis or an edge, slide it sideways so it stays on
  // the data side of the axis and inside the frame instead of running over the tick labels.
  for (const n of notes) {
    const [cx, cy] = S(n.p);
    const half = textWidth(n.s) / 2;
    let x = cx;
    if (cx >= axX && x - half < axX + 4) x = axX + 4 + half;
    if (x + half > W - 2) x = Math.max(W - 2 - half, cx >= axX ? axX + 4 + half : half + 2);
    if (x - half < 2) x = half + 2;
    out += put([x, cy], n.s, "middle");
  }

  readable(
    "x",
    xt === null
      ? null
      : [
          ...(xt ?? autoTicks(x0, x1)),
          ...refs.filter((r) => r.axis === "v").map((r) => ({ v: r.v, s: "" })),
        ],
    0,
  );
  readable(
    "y",
    yt === null
      ? null
      : [
          ...(yt ?? autoTicks(y0, y1)),
          ...refs.filter((r) => r.axis === "h").map((r) => ({ v: r.v, s: "" })),
        ],
    1,
  );

  // Every corner of a straight-line graph is a value the student has to read off it.
  // If it falls between labelled ticks they can only guess (3.0 between 2 and 4).
  function readable(axis: "x" | "y", ticks: Tick[] | null, k: 0 | 1) {
    if (ticks === null) return; // shape-only graph: no values to read
    const has = (v: number) =>
      v === 0 || ticks.some((t) => Math.abs(t.v - v) <= 1e-9 * Math.max(1, Math.abs(v)));
    const where = [
      ...series.filter((s) => !s.f).flatMap((s) => s.pts.map((p) => ({ v: p[k], line: s.line! }))),
      ...pts.map((p) => ({ v: p.p[k], line: p.line })),
    ];
    const missing = where.filter((w) => !has(w.v));
    if (!missing.length) return;
    const need = [
      ...new Set([...((axis === "x" ? xt : yt)?.map((t) => t.v) ?? []), ...where.map((w) => w.v)]),
    ]
      .filter((v) => v !== 0)
      .sort((a, b) => a - b);
    const vals = [...new Set(missing.map((m) => m.v))].join(", ");
    warns.push({
      line: missing[0].line,
      kind: "readability",
      msg: `${axis} = ${vals} is not on a labelled tick, so a student can only guess it; use ${axis}t ${need.join(" ")} (or ${axis}t none for a shape-only graph)`,
    });
  }

  const alt = altText(xAx, yAx, series, pts, xt);
  const ox = minX < 0 ? Math.floor(minX - 4) : 0;
  const right = maxX > W ? Math.ceil(maxX + 4) : W;
  return {
    svg: wrap(right - ox, H, out, alt, ox),
    alt,
    model: { series, xLabel: xAx.text, yLabel: yAx.text },
  };
}

// "v[m/s]" -> text "v (m/s)"
function axisLabel(s: string) {
  const m = s.match(/^(.*?)[[(](.*)[\])]$/); // v[m/s] or v(m/s)
  return m ? { name: m[1], unit: m[2], text: `${m[1]} (${m[2]})` } : { name: s, unit: "", text: s };
}

function ticks(c: Cmd, errs: DgError[]): Tick[] | null {
  if (c.args[0] === "none") return null;
  return c.args.map((a) => {
    // models sometimes quote a tick label (xt 4:"4"); the quotes are not part of it
    const [v, s] = a.replace(/"/g, "").split(":");
    return { v: num(v, c.line, errs, "tick value"), s: s ?? v };
  });
}

function pad(a: number, b: number, k: number): [number, number] {
  const d = (b - a) * k;
  return [a < 0 ? a - d : a, b > 0 ? b + d : b];
}

function autoTicks(a: number, b: number): Tick[] {
  const raw = (b - a) / 5;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw) ?? raw;
  const out: Tick[] = [];
  for (let v = Math.ceil(a / step) * step; v <= b + 1e-9; v += step) {
    const r = +v.toPrecision(10);
    out.push({ v: r, s: String(r) });
  }
  return out;
}

/** Points of a polyline restricted to [a,b], with interpolated ends. */
/** Vertical jumps (two points with the same x) are kept, so a pulse stays a pulse. */
export function clip(p: P[], a: number, b: number): P[] {
  const out: P[] = [];
  const push = (q: P) => {
    const l = out[out.length - 1];
    if (!l || l[0] !== q[0] || l[1] !== q[1]) out.push(q);
  };
  for (let i = 1; i < p.length; i++) {
    const [s, e] = [p[i - 1], p[i]];
    if (e[0] < a || s[0] > b) continue;
    if (e[0] === s[0]) {
      push(s);
      push(e);
      continue;
    }
    const lerp = (x: number): P => [x, s[1] + ((x - s[0]) / (e[0] - s[0])) * (e[1] - s[1])];
    push(lerp(Math.max(a, s[0])));
    push(lerp(Math.min(b, e[0])));
  }
  return out;
}

export function interp(p: P[], x: number): number {
  for (let i = 1; i < p.length; i++) {
    const [a, b] = [p[i - 1], p[i]];
    if (x >= a[0] && x <= b[0])
      return b[0] === a[0] ? b[1] : a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
  }
  return x < p[0][0] ? p[0][1] : p[p.length - 1][1];
}

function altText(
  x: ReturnType<typeof axisLabel>,
  y: ReturnType<typeof axisLabel>,
  series: Series[],
  pts: { p: P; s?: string }[],
  xt: Tick[] | null | undefined,
): string {
  const qualitative = xt === null;
  const parts = series.map((s) => {
    if (s.f)
      return `a smooth curve from ${x.name} = ${f1(s.pts[0][0])} to ${f1(s.pts[s.pts.length - 1][0])}`;
    if (qualitative)
      return `straight segments that ${s.pts
        .slice(1)
        .map((p, i) => trend(s.pts[i], p))
        .join(", then ")}`;
    return `straight segments through ${s.pts.map((p) => `(${p[0]}, ${p[1]})`).join(", ")}`;
  });
  const marks = pts.filter((p) => p.s).map((p) => `point ${plain(p.s!)} at (${p.p[0]}, ${p.p[1]})`);
  return `Graph of ${plain(y.text)} against ${plain(x.text)}: ${[...parts, ...marks].join("; ")}.`;
}

function trend(a: P, b: P): string {
  if (b[0] === a[0]) return b[1] > a[1] ? "jump up" : "drop";
  if (b[1] === a[1]) return "stay level";
  return b[1] > a[1] ? "rise" : "fall";
}
