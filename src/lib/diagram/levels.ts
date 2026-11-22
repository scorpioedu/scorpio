// levels: energy-level diagrams. The author lists the levels and which transitions happen; the
// spacing, the arrow directions and each photon's energy / wavelength / frequency are computed.
//
// levels [unit=eV] [schematic] [noE] ["title"]   to scale unless `schematic` (equal spacing);
//                                                noE hides the energies and shows only the names
// level -13.6 "n=1" [dashed]                     energy, then the level's name
// trans 3 1 [show=E|lambda|f] ["label"]          from one level to another, named by its label
//                                                ("n=3" or just 3) or counted from the bottom;
//                                                downward = emission, upward = absorption.
//                                                show= prints the computed photon energy,
//                                                wavelength or frequency (show=E,lambda for two)

import { type DgError, type Doc } from "./parse";
import { ACCENT, plain, wrap, type P } from "./svg";
import { Canvas, type Anchor, argNum, finish, fmt, unknownWords } from "./kit";

export interface LevelsModel {
  unit: string;
  scale: "true" | "schematic";
  /** Lowest first. */
  levels: { label: string; E: number }[];
  transitions: {
    from: string;
    to: string;
    type: "emission" | "absorption";
    /** Photon energy (positive), in the diagram's unit. */
    dE: number;
    /** Set when the unit is eV, keV, MeV or J. */
    wavelengthNm?: number;
    frequencyHz?: number;
  }[];
}

type Out = { svg: string; alt: string; levels?: LevelsModel };
type Level = { E: number; label: string; dashed: boolean; line: number; y: number };

const TO_EV: Record<string, number> = { eV: 1, keV: 1e3, MeV: 1e6, J: 1 / 1.602176634e-19 };
const HC = 1239.841984; // eV·nm
const H_PLANCK = 4.135667696e-15; // eV·s

function wavelength(nm: number): string {
  if (nm < 0.1) return `${fmt(nm * 1000)} pm`;
  if (nm >= 1e4) return `${fmt(nm / 1000)} μm`;
  return `${fmt(nm)} nm`;
}

export function renderLevels(doc: Doc, errs: DgError[], warns: DgError[] = []): Out {
  const h = doc.head;
  unknownWords(h, ["schematic", "noE"], ["unit"], errs, "use any of: unit=eV schematic noE");
  const unit = h.kv.unit ?? "eV";
  const schematic = h.args.includes("schematic");
  const showE = !h.args.includes("noE");

  const levels: Level[] = [];
  const trans: { from: string; to: string; show: string[]; label?: string; line: number }[] = [];
  for (const c of doc.cmds) {
    if (c.op === "level") {
      unknownWords(c, ["dashed"], Object.keys(c.kv).slice(0, 1), errs, 'use level -3.4 "n=2"', 1);
      const E = argNum(c.args[0]);
      if (E === undefined) {
        errs.push({
          line: c.line,
          msg: `level needs its energy first, then its name in quotes: level -3.4 "n=2"${c.args[0] ? `, got "${c.args[0]}"` : ""}`,
        });
        continue;
      }
      // level -3.4 n=2 without the quotes still reads as the name "n=2"
      const kv = Object.entries(c.kv)[0];
      levels.push({
        E,
        label: c.text ?? (kv ? kv.join("=") : ""),
        dashed: c.args.includes("dashed"),
        line: c.line,
        y: 0,
      });
    } else if (["trans", "transition", "jump", "emit", "absorb"].includes(c.op)) {
      const show = (c.kv.show ?? "").split(",").filter(Boolean);
      for (const s of show)
        if (!["E", "lambda", "f"].includes(s))
          errs.push({ line: c.line, msg: `show= takes E, lambda or f, got "${s}"` });
      const stray = Object.keys(c.kv).filter((k) => k !== "show");
      if (stray.length) {
        errs.push({
          line: c.line,
          msg: `name the two levels without "=": for the levels "${stray[0]}=3" and "${stray[0]}=2" write ${c.op} 3 2`,
        });
        continue;
      }
      if (c.args.length !== 2)
        errs.push({
          line: c.line,
          msg: `${c.op} needs the level it starts on and the level it ends on: ${c.op} 3 1`,
        });
      else trans.push({ from: c.args[0], to: c.args[1], show, label: c.text, line: c.line });
    } else errs.push({ line: c.line, msg: `levels has no "${c.op}" (use level and trans)` });
  }
  if (levels.length < 2)
    errs.push({
      line: h.line,
      msg: 'levels needs at least two level lines, e.g. level -13.6 "n=1"',
    });
  levels.sort((a, b) => a.E - b.E);
  const find = (s: string): Level | undefined => {
    const exact =
      levels.find((l) => l.label === s) ??
      levels.find((l) => new RegExp(`=\\s*${s.replace(/[^\w.+-]/g, "")}$`).test(l.label));
    if (exact) return exact;
    const k = Number(s);
    return Number.isInteger(k) && k >= 1 ? levels[k - 1] : undefined;
  };
  const toEV = TO_EV[unit];
  const model: LevelsModel = {
    unit,
    scale: schematic ? "schematic" : "true",
    levels: levels.map((l) => ({ label: l.label, E: l.E })),
    transitions: [],
  };
  const arrows: { a: Level; b: Level; text: string }[] = [];
  for (const t of trans) {
    const [a, b] = [find(t.from), find(t.to)];
    for (const [s, l] of [
      [t.from, a],
      [t.to, b],
    ] as const)
      if (!l)
        errs.push({
          line: t.line,
          msg: `no level "${s}": name a level by its label (${levels.map((x) => x.label || "?").join(", ")}) or by its place from the bottom (1 to ${levels.length})`,
        });
    if (!a || !b) continue;
    if (a === b || a.E === b.E) {
      errs.push({ line: t.line, msg: "a transition needs two levels with different energies" });
      continue;
    }
    const dE = Math.abs(a.E - b.E);
    const nm = toEV ? HC / (dE * toEV) : undefined;
    const hz = toEV ? (dE * toEV) / H_PLANCK : undefined;
    if (!toEV && t.show.some((s) => s !== "E"))
      errs.push({
        line: t.line,
        msg: `a wavelength or frequency needs the energies in eV, keV, MeV or J (unit=${unit} is not one of them)`,
      });
    const parts = t.show.map((s) =>
      s === "E"
        ? `${fmt(dE)} ${unit}`
        : s === "lambda"
          ? wavelength(nm ?? 0)
          : `${fmt(hz ?? 0)} Hz`,
    );
    model.transitions.push({
      from: a.label,
      to: b.label,
      type: a.E > b.E ? "emission" : "absorption",
      dE,
      wavelengthNm: nm,
      frequencyHz: hz,
    });
    arrows.push({ a, b, text: [t.label, ...parts].filter(Boolean).join(", ") });
  }
  if (errs.length) return { svg: "", alt: "" };

  // ---- vertical positions ----
  const [lo, hi] = [levels[0].E, levels[levels.length - 1].E];
  const GAP = 46;
  if (schematic || hi === lo) levels.forEach((l, i) => (l.y = -i * GAP));
  else {
    const H = Math.min(300, Math.max(170, (levels.length - 1) * 62));
    for (const l of levels) l.y = (-(l.E - lo) / (hi - lo)) * H;
    const close = levels.slice(1).find((l, i) => levels[i].y - l.y < 15);
    if (close)
      warns.push({
        line: close.line,
        kind: "readability",
        msg: `drawn to scale, the levels near ${fmt(close.E)} ${unit} are too close together to tell apart; add schematic to the first line for equal spacing`,
      });
  }

  const labelW = Math.max(0, ...arrows.map((a) => a.text.length * 6.2));
  const slot = Math.max(54, labelW + 26);
  const W = Math.max(190, arrows.length * slot + 40);
  const cv = new Canvas();
  // labels of levels that crowd are spread apart; the lines themselves stay where they belong
  let lastY = Infinity;
  for (const l of levels) {
    const ly = Math.min(l.y, lastY - 14);
    lastY = ly;
    cv.line([0, l.y], [W, l.y], ` stroke-width="2"${l.dashed ? ` stroke-dasharray="6 4"` : ""}`);
    cv.reserve(0, l.y - 2, W, l.y + 2);
    if (l.label) cv.text([-9, ly], l.label.replace(/\s*=\s*/, " = "), "end");
    if (showE) cv.text([W + 9, ly], `${fmt(l.E)} ${unit}`, "start");
  }
  arrows.forEach((t, i) => {
    const x = 20 + slot * i + 12;
    const [a, b]: [P, P] = [
      [x, t.a.y],
      [x, t.b.y],
    ];
    cv.arrow(a, b, ACCENT, 2, 9);
    cv.reserve(x - 5, a[1], x + 5, b[1]);
    if (t.text) {
      // beside the arrow, in the widest gap between the levels it passes
      const ys = levels
        .map((l) => l.y)
        .filter((y) => y <= Math.max(a[1], b[1]) && y >= Math.min(a[1], b[1]))
        .sort((p, q) => p - q);
      const gaps = ys
        .slice(1)
        .map((y, j) => ({ mid: (y + ys[j]) / 2, size: y - ys[j] }))
        .sort((p, q) => q.size - p.size);
      const cands: [P, Anchor][] = [
        ...gaps.map((g): [P, Anchor] => [[x + 8, g.mid], "start"]),
        ...gaps.map((g): [P, Anchor] => [[x - 8, g.mid], "end"]),
        ...gaps.map((g): [P, Anchor] => [[x + 8, g.mid - g.size / 4], "start"]),
        ...gaps.map((g): [P, Anchor] => [[x + 8, g.mid + g.size / 4], "start"]),
      ];
      cv.place(cands, t.text, ` fill="${ACCENT}"`, 11);
    }
  });
  // which way energy increases
  const top = levels[levels.length - 1].y,
    left = -Math.max(30, ...levels.map((l) => l.label.length * 7 + 24)) - 14;
  cv.arrow([left, 0], [left, top - 4], "currentColor", 1.25, 7);
  cv.text([left, top - 16], "E", "middle", "", 12);
  if (schematic) cv.text([W / 2, 20], "not to scale", "middle", ` fill-opacity=".6"`, 10);

  const alt =
    `Energy-level diagram${h.text ? ` (${plain(h.text)})` : ""}, ${schematic ? "levels equally spaced (not to scale)" : "drawn to scale"}. ` +
    `Levels from the lowest: ${levels.map((l) => `${l.label ? `${plain(l.label)} ` : ""}${showE ? `at ${fmt(l.E)} ${unit}` : ""}`.trim()).join(", ")}. ` +
    (model.transitions.length
      ? `Transitions: ${model.transitions.map((t, i) => `${plain(t.from) || "upper"} to ${plain(t.to) || "lower"}, ${t.type === "emission" ? "down (a photon is emitted)" : "up (a photon is absorbed)"}${arrows[i].text ? `, labelled ${plain(arrows[i].text)}` : ""}`).join("; ")}.`
      : "");
  const b = finish(cv, h.text);
  return { svg: wrap(b.w, b.h, cv.body, alt.trim(), b.x0, b.y0), alt: alt.trim(), levels: model };
}
