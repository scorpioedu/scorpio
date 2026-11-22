// bars: energy and momentum bar charts (AP Physics 1 "LOL" charts).
//
// bars [energy|momentum] [axis] [unit=J] ["title"]
// initial K 0 U_g 4            label value pairs; values are relative unit heights, may be negative
// work W_ext -1                what crosses the system boundary (also: impulse J 2, transfer Q 1)
// final K 3 U_g 0 E_th 0       a value of ? draws an unknown bar and switches the sum check off
//
// `energy` or `momentum` declares the chart as conserving: initial + transfers must equal final,
// or the picture is false (a "physics" warning). A plain `bars` chart is not checked.

import { type Cmd, type DgError, type Doc } from "./parse";
import { ACCENT, braceSubscripts, f1, line, plain, text, textWidth, wrap } from "./svg";

type Bar = { label: string; v: number | null; line: number };
type Group = {
  key: "initial" | "transfer" | "final";
  title: string;
  bars: Bar[];
  x0?: number; // drawn position, once laid out
  w?: number;
};

const OPS: Record<string, Group["key"]> = {
  initial: "initial",
  i: "initial",
  before: "initial",
  final: "final",
  f: "final",
  after: "final",
  work: "transfer",
  impulse: "transfer",
  transfer: "transfer",
  heat: "transfer",
  w: "transfer",
  j: "transfer",
};

const BAR_W = 26,
  BAR_GAP = 16,
  GROUP_GAP = 44,
  MAX_H = 112;

const fmt = (n: number) => String(+n.toFixed(3)).replace("-", "−");

export function renderBars(
  doc: Doc,
  errs: DgError[],
  warns: DgError[] = [],
): { svg: string; alt: string; scale?: string[]; read?: string[] } {
  const h = doc.head;
  const quantity = h.args.includes("energy")
    ? "energy"
    : h.args.includes("momentum")
      ? "momentum"
      : undefined;
  const axis = h.args.includes("axis") || "axis" in h.kv || "unit" in h.kv;
  const unit = h.kv.unit;
  for (const a of h.args)
    if (!["energy", "momentum", "axis"].includes(a))
      errs.push({ line: h.line, msg: `bars has no "${a}" (use energy, momentum, axis, unit=J)` });

  const groups: Record<Group["key"], Group> = {
    initial: { key: "initial", title: "initial", bars: [] },
    transfer: { key: "transfer", title: "", bars: [] },
    final: { key: "final", title: "final", bars: [] },
  };
  const readBars = (c: Cmd, into: Bar[]) => {
    const pairs: [string, string | undefined][] = [];
    for (let i = 0; i < c.args.length; i += 2) pairs.push([c.args[i], c.args[i + 1]]);
    for (const [k, v] of Object.entries(c.kv)) pairs.push([k, v]);
    if (!pairs.length)
      errs.push({ line: c.line, msg: `${c.op} needs label value pairs, e.g. ${c.op} K 2 U_g 1` });
    for (const [word, raw] of pairs) {
      const label = braceSubscripts(word);
      if (raw === undefined) {
        errs.push({
          line: c.line,
          msg: `bar "${label}" has no value; write label value pairs, e.g. K 2 U_g 1`,
        });
        continue;
      }
      if (raw === "?") {
        into.push({ label, v: null, line: c.line });
        continue;
      }
      const n = Number(raw.replace("−", "-"));
      if (!Number.isFinite(n)) {
        errs.push({
          line: c.line,
          msg: `bar "${label}" needs a number (or ?), got "${raw}"; write label value pairs, e.g. K 2 U_g 1`,
        });
        continue;
      }
      into.push({ label, v: n, line: c.line });
    }
  };
  for (const c of doc.cmds) {
    const key = OPS[c.op.toLowerCase()];
    if (!key) {
      errs.push({
        line: c.line,
        msg: `bars has no "${c.op}" (use initial, final, and work or impulse for what crosses the system boundary)`,
      });
      continue;
    }
    if (key === "transfer" && !groups.transfer.title)
      groups.transfer.title = ["w", "j"].includes(c.op) ? "transfer" : c.op.toLowerCase();
    readBars(c, groups[key].bars);
  }
  if (!groups.initial.bars.length)
    errs.push({ line: h.line, msg: "bars needs an initial line, e.g. initial K 0 U_g 4" });
  if (!groups.final.bars.length)
    errs.push({ line: h.line, msg: "bars needs a final line, e.g. final K 4 U_g 0" });

  const shown = [groups.initial, groups.transfer, groups.final].filter((g) => g.bars.length);
  const all = shown.flatMap((g) => g.bars);
  const sum = (g: Group) => g.bars.reduce((s, b) => s + (b.v ?? 0), 0);
  const unknown = all.some((b) => b.v === null);

  // ---- physics: a conserving chart must balance ----
  let balanced: boolean | undefined;
  if (quantity && !unknown && groups.initial.bars.length && groups.final.bars.length) {
    const [si, st, sf] = [sum(groups.initial), sum(groups.transfer), sum(groups.final)];
    const scale = Math.max(1, ...all.map((b) => Math.abs(b.v ?? 0)));
    balanced = Math.abs(si + st - sf) <= 1e-6 * scale;
    if (!balanced) {
      const what = groups.transfer.bars.length
        ? `initial (${fmt(si)}) + ${groups.transfer.title} (${fmt(st)}) = ${fmt(si + st)}`
        : `the initial bars add to ${fmt(si)}`;
      warns.push({
        line: groups.final.bars[0].line,
        kind: "physics",
        msg: `${quantity} is not conserved: ${what}, but the final bars add to ${fmt(sf)}; fix a bar, or add a ${quantity === "energy" ? "work" : "impulse"} line for what enters or leaves the system`,
      });
    }
  }
  if (quantity === "energy")
    for (const b of all) {
      const name = plain(b.label);
      if (b.v !== null && b.v < 0 && /^(K|KE)($|[_\s])/.test(name))
        warns.push({
          line: b.line,
          kind: "physics",
          msg: `kinetic energy ${name} cannot be negative`,
        });
      if (b.v !== null && b.v < 0 && /^U_?\{?(s|sp|spring|el|elastic)\}?$/.test(name))
        warns.push({
          line: b.line,
          kind: "physics",
          msg: `spring potential energy ${name} cannot be negative`,
        });
    }
  for (const g of shown)
    if (g.bars.length > 7)
      warns.push({
        line: g.bars[7].line,
        kind: "readability",
        msg: `${g.bars.length} bars in the ${g.title} group is hard to read; keep it to 7 or fewer`,
      });

  // ---- layout ----
  const vals = all.map((b) => b.v ?? 0);
  // Values well below 1 (0.2 J, 0.05 kg·m/s) would be slivers on a 0..1 axis: scale to the data,
  // with a grid step that gives the largest bar at least four steps (so it fills MAX_H).
  const most = Math.max(0, ...vals.map(Math.abs));
  const small = most > 0 && most < 1 ? smallStep(most) : undefined;
  const hi = Math.max(small ?? 1, ...vals),
    lo = Math.min(0, ...vals);
  const u = Math.min(28 / (small ?? 1), MAX_H / Math.max(hi, -lo)); // px per unit
  const step = small ?? niceStep(Math.max(hi, -lo));
  const top = Math.ceil(hi / step - 1e-9) * step,
    bot = Math.floor(lo / step + 1e-9) * step;
  const y = (v: number) => (top - v) * u;
  const axisW = axis ? 30 : 0;
  let body = "";
  const scale: string[] = []; // the axis numbers
  let x = axisW;
  let alt = `${quantity ? quantity[0].toUpperCase() + quantity.slice(1) : "Bar"} chart${h.text ? ` (${plain(h.text)})` : ""}. `;
  const signs: { x: number; s: string }[] = [];
  const labelY = y(bot) + 16;
  let maxLabelY = labelY;
  shown.forEach((g, gi) => {
    const w = g.bars.length * BAR_W + (g.bars.length - 1) * BAR_GAP + 16;
    // unit grid, then the zero line on top of it
    for (let v = bot; v <= top + 1e-9; v += step)
      if (Math.abs(v) > 1e-9)
        body += line([x, y(v)], [x + w, y(v)], ` stroke-width="1" stroke-opacity=".18"`);
    g.bars.forEach((b, i) => {
      const bx = x + 8 + i * (BAR_W + BAR_GAP);
      const cx = bx + BAR_W / 2;
      if (b.v === null) {
        // The whole height of the chart, so the outline does not suggest a value on a numbered axis.
        body += `<rect x="${f1(bx)}" y="${f1(y(top))}" width="${BAR_W}" height="${f1(top * u)}" fill="none" stroke="${ACCENT}" stroke-opacity=".6" stroke-dasharray="4 3"/>`;
        body += text(
          [cx, y(top) / 2 + y(0) / 2],
          "?",
          "middle",
          ` stroke="none"`,
        );
      } else if (b.v === 0) {
        body += text([cx, y(0) - 10], "0", "middle", ` stroke="none" fill-opacity=".7"`);
      } else {
        const y0 = Math.min(y(0), y(b.v)),
          hh = Math.abs(b.v) * u;
        body += `<rect x="${f1(bx)}" y="${f1(y0)}" width="${BAR_W}" height="${f1(hh)}" fill="${ACCENT}" fill-opacity=".3" stroke="${ACCENT}"/>`;
      }
      // long labels alternate between two rows so neighbours don't collide
      const wide = g.bars.some((q) => textWidth(q.label) > BAR_W + BAR_GAP - 4);
      const ly = labelY + (wide && i % 2 ? 15 : 0);
      maxLabelY = Math.max(maxLabelY, ly);
      body += text([cx, ly], b.label, "middle", ` stroke="none"`);
    });
    body += line([x, y(0)], [x + w, y(0)], ` stroke-width="2"`);
    g.x0 = x;
    g.w = w;
    if (gi < shown.length - 1)
      signs.push({ x: x + w + GROUP_GAP / 2, s: gi === shown.length - 2 ? "=" : "+" });
    alt += `${g.title[0].toUpperCase() + g.title.slice(1)}: ${g.bars.map((b) => `${plain(b.label)} ${b.v === null ? "unknown" : fmt(b.v)}`).join(", ")}. `;
    x += w + GROUP_GAP;
  });
  const W = x - GROUP_GAP;
  for (const s of signs)
    body += text([s.x, y(0)], s.s, "middle", ` stroke="none" font-size="17" fill-opacity=".75"`);
  for (const g of shown)
    body += text(
      [(g.x0 ?? 0) + (g.w ?? 0) / 2, maxLabelY + 20],
      g.title,
      "middle",
      ` stroke="none" font-size="11" fill-opacity=".65"`,
    );
  if (axis) {
    body += line([axisW - 6, y(top)], [axisW - 6, y(bot)], ` stroke-width="1"`);
    for (let v = bot; v <= top + 1e-9; v += step) {
      body += line([axisW - 9, y(v)], [axisW - 6, y(v)], ` stroke-width="1"`);
      body += text([axisW - 12, y(v)], fmt(v), "end", ` stroke="none" font-size="11"`);
      scale.push(fmt(v));
    }
    if (unit)
      body += text([axisW - 6, y(top) - 14], unit, "middle", ` stroke="none" font-size="11"`);
  }
  let titleH = 0;
  if (h.text) {
    titleH = 22;
    body += text(
      [W / 2, y(top) - 18 - (axis && unit ? 12 : 0)],
      h.text,
      "middle",
      ` stroke="none"`,
    );
    if (axis && unit) titleH += 12;
  } else if (axis && unit) titleH = 14;
  if (balanced === true)
    alt += `Initial${groups.transfer.bars.length ? ` plus ${groups.transfer.title}` : ""} equals final.`;
  alt = alt.trim();

  const PAD = 12;
  const titleW = h.text ? textWidth(h.text) + 8 : 0;
  const x0 = Math.min(-PAD, W / 2 - titleW / 2 - 4),
    x1 = Math.max(W + PAD, W / 2 + titleW / 2 + 4);
  const y0 = y(top) - PAD - titleH,
    y1 = maxLabelY + 30 + PAD - 4;
  // with a numbered axis every bar's height can be read off, so the values count as shown
  const read = axis ? all.flatMap((b) => (b.v === null ? [] : [fmt(b.v)])) : [];
  return { svg: wrap(x1 - x0, y1 - y0, body, alt, x0, y0), alt, scale, read };
}

function niceStep(max: number): number {
  if (max <= 8) return 1;
  const raw = max / 6;
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

/** For a chart whose largest value is below 1: the largest 1, 2 or 5 × 10^n that fits four times. */
function smallStep(max: number): number {
  let p = 10 ** Math.floor(Math.log10(max));
  for (;;) {
    for (const m of [5, 2, 1]) if (max / (m * p) >= 4 - 1e-9) return +(m * p).toPrecision(6);
    p /= 10;
  }
}
