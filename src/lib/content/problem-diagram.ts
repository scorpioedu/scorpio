// Diagrams on AI-drafted problems. The generator may send one `diagram` (diagram-language source) per
// problem; this checks it and, if it is usable, appends it to the problem text as a ```dg block, which
// every markdown surface (the review screen, the student's assignment) draws. A person approves every
// draft, so most problems become warnings for that person; only a picture that cannot be drawn, or
// one that shows the answer, is left out.

import { errorReport, render, type Result } from "@/lib/diagram";
import { area, at, peak } from "@/lib/diagram/check";
import { MAX_TEXT, type DraftProblem } from "./problem-format";

export interface DiagramOutcome {
  /** The problem text, with the diagram appended when it is kept. */
  text: string;
  /** Whether the diagram was attached. */
  attached: boolean;
  /** Notes for the reviewer (shown with the draft's other warnings). */
  warnings: string[];
  /**
   * The diagram source and the renderer's own messages, when the model could fix them in one more
   * try: errors, or warnings about physics, readability or label markup. Not set when the
   * diagram showed the answer or was too long (a retry is not the remedy there).
   */
  repair?: { src: string; report: string };
}

const MAX_DIAGRAM = 1500;

/** Numbers as they are written, normalised so "2.0" and "2" compare equal. */
function numbers(s: string): Set<string> {
  return new Set((s.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/gi) ?? []).map((n) => String(Number(n))));
}

/**
 * Text a student reads off a plot, a free-body diagram or a scene, read from the source: quoted
 * labels, fbd force labels and lab= values, plus tick labels when `ticks` (a graph's scale numbers
 * are not claims, but a tick can still give away a key). Every other kind reports what it drew
 * (see shownNumbers).
 */
function visibleText(src: string, ticks = true): string {
  const parts: string[] = [];
  for (const line of src.split(/\r?\n/)) {
    const t = line.trim();
    for (const m of t.matchAll(/"([^"]*)"/g)) parts.push(m[1]);
    for (const m of t.matchAll(/\blab=(\S+)/g)) parts.push(m[1]);
    if (ticks && /^[xy]t\s/.test(t))
      for (const tick of t.split(/\s+/).slice(1)) parts.push(tick.split(":").pop()!);
    const f = t.match(/^f\s+\S+\s+([^\s"]+)/); // fbd: f <dir> <label>
    if (f && !/^-?[\d.]+$/.test(f[1]) && !/,/.test(f[1])) parts.push(f[1]);
  }
  return parts.join(" ");
}

/** The kinds whose visible text is still read from the source by visibleText(). */
const READ_FROM_SOURCE = new Set(["plot", "fbd", "scene"]);

/**
 * Numbers in the text a renderer reports it drew. Labels come as drawn: a real minus sign,
 * subscripts as R_{1} (names, not numbers), powers of ten as 9.67×10^{14}, focal marks as 2F.
 */
function drawnNumbers(texts: string[]): Set<string> {
  const out = new Set<string>();
  for (const raw of texts) {
    let t = raw.replace(/−/g, "-");
    // scientific notation: both the full value and the mantissa a text might state
    t = t.replace(/(-?\d+(?:\.\d+)?)×10\^\{(-?\d+)\}/g, (_m, a: string, b: string) => {
      out.add(String(Number(`${a}e${b}`)));
      return a;
    });
    t = t.replace(/[_^]\{[^}]*\}/g, " ").replace(/\b2F\b/g, " ");
    for (const n of numbers(t)) out.add(n);
  }
  return out;
}

/**
 * The numbers a student can read on the picture. `claims` are the ones the picture asserts (a
 * resistor's value, a printed wavelength, a bar's height against a numbered axis); `all` adds
 * tick labels the author chose on a plot, which are not claims but can give a key away. The
 * numbers a renderer puts on a regular scale itself (axis numbers, dot numbers, fringe orders:
 * Result.scale) are in neither: every small whole number would look like a leak.
 */
function shownNumbers(r: Result, src: string): { all: Set<string>; claims: Set<string> } {
  const kind = src.trim().split(/\s/)[0];
  if (READ_FROM_SOURCE.has(kind))
    return { all: numbers(visibleText(src)), claims: numbers(visibleText(src, false)) };
  const claims = drawnNumbers(r.visible);
  return { all: claims, claims };
}

/** Facts a reviewer can check against the key: areas, end values and peaks of each line on a plot. */
export function plotFacts(r: Result): { label: string; value: number }[] {
  const facts: { label: string; value: number }[] = [];
  const x = r.plot?.xLabel ?? "x";
  (r.plot?.series ?? []).forEach((s, i) => {
    const a = s.pts[0][0],
      b = s.pts[s.pts.length - 1][0];
    const tag = r.plot!.series.length > 1 ? ` (line ${i + 1})` : "";
    facts.push({
      label: `area under the graph from ${x} = ${a} to ${b}${tag}`,
      value: area(r, a, b, i),
    });
    // Distance rather than displacement: area below the axis counted as positive.
    if (!s.f) {
      let total = 0;
      for (let k = 1; k < s.pts.length; k++) {
        const [p, q] = [s.pts[k - 1], s.pts[k]];
        const w = q[0] - p[0];
        if (w <= 0) continue;
        if (p[1] * q[1] >= 0) total += (Math.abs(p[1] + q[1]) / 2) * w;
        else {
          const z = (Math.abs(p[1]) / (Math.abs(p[1]) + Math.abs(q[1]))) * w; // where it crosses zero
          total += (Math.abs(p[1]) * z) / 2 + (Math.abs(q[1]) * (w - z)) / 2;
        }
      }
      facts.push({
        label: `total area from ${x} = ${a} to ${b}, counting area below the axis as positive${tag}`,
        value: total,
      });
    }
    facts.push({ label: `value at ${x} = ${b}${tag}`, value: at(r, b, i) });
    facts.push({ label: `largest size${tag}`, value: peak(r, i) });
    for (let k = 1; k < s.pts.length && !s.f; k++) {
      const [p, q] = [s.pts[k - 1], s.pts[k]];
      if (q[0] !== p[0])
        facts.push({
          label: `slope from ${x} = ${p[0]} to ${q[0]}${tag}`,
          value: (q[1] - p[1]) / (q[0] - p[0]),
        });
    }
  });
  return facts;
}

const round = (n: number) => +n.toPrecision(3);

/**
 * Check a generated diagram against its problem and decide whether to attach it.
 * Left out: no diagram, can't be drawn, or it shows the answer. Attached with a note: anything that
 * looks physically wrong, hard to read, or uses numbers the problem never states.
 */
export function attachDiagram(problem: DraftProblem, raw: unknown): DiagramOutcome {
  const text = problem.text;
  if (typeof raw !== "string" || !raw.trim()) return { text, attached: false, warnings: [] };
  const src = raw
    .replace(/^\s*```(?:dg)?[^\n]*\n?/, "")
    .replace(/\n?```\s*$/, "")
    .trim();
  if (src.length > MAX_DIAGRAM)
    return { text, attached: false, warnings: ["The AI's diagram was too long and was left out."] };

  const r = render(src);
  const issues = [...r.errors, ...r.warnings];
  const repair = issues.length ? { src, report: errorReport(src, issues) } : undefined;
  if (!r.ok)
    return {
      text,
      attached: false,
      warnings: [
        `The AI's diagram could not be drawn and was left out (${r.errors.map((e) => `line ${e.line}: ${e.msg}`).join("; ")}).`,
      ],
      repair,
    };

  // The picture must not give the answer away: a number from the key that the stem never states.
  const shown = shownNumbers(r, src),
    stem = numbers(text);
  const flip = (n: string) => String(-Number(n));
  const keyNumbers = [...numbers(problem.correctAnswer)].filter(
    (n) => !["0", "1", "2"].includes(n),
  );
  // a key of 15 is given away by a label reading −15 too (an image distance, a work done on the gas)
  const leaked = keyNumbers.filter(
    (n) => (shown.all.has(n) || shown.all.has(flip(n))) && !stem.has(n) && !stem.has(flip(n)),
  );
  if (leaked.length)
    return {
      text,
      attached: false,
      warnings: [`The AI's diagram showed the answer (${leaked.join(", ")}) and was left out.`],
    };

  const warnings: string[] = [];
  for (const w of r.warnings)
    warnings.push(
      w.kind === "physics"
        ? `Diagram may be wrong (line ${w.line}): ${w.msg}`
        : `Diagram (line ${w.line}): ${w.msg}`,
    );
  const invented = [...shown.claims].filter(
    (n) => !stem.has(n) && !stem.has(flip(n)) && !["0", "1"].includes(n),
  );
  if (invented.length)
    warnings.push(
      `The diagram shows numbers the problem never states: ${invented.join(", ")}. Check they belong.`,
    );

  // The text must state every value, so the problem works without the picture (and for a student
  // who can't see it). A corner of a graph the text never mentions breaks that.
  if (r.plot) {
    const corners = new Set(
      r.plot.series
        .filter((s) => !s.f)
        .flatMap((s) => s.pts.flatMap((p) => p.map((n) => String(Number(n))))),
    );
    const onlyInGraph = [...corners].filter(
      (n) => !stem.has(n) && !stem.has(String(-Number(n))) && n !== "0",
    );
    if (onlyInGraph.length)
      warnings.push(
        `Only the graph gives ${onlyInGraph.join(", ")}; the text should state these too, so the problem works for a student who cannot see the picture.`,
      );
  }

  // Graphs: say what can be read off the picture, and whether any of it is the key.
  if (r.plot && problem.type === "numeric") {
    const key = Number((problem.correctAnswer.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/i) ?? [])[0]);
    const facts = plotFacts(r);
    if (Number.isFinite(key) && facts.length) {
      const match = facts.find(
        (f) => Math.abs(f.value - key) <= 0.03 * Math.max(Math.abs(key), 1e-9),
      );
      warnings.push(
        match
          ? `Graph check: the ${match.label} is ${round(match.value)}, which matches the key.`
          : `Graph check: nothing read off the graph equals the key ${key} (${facts
              .slice(0, 4)
              .map((f) => `${f.label} = ${round(f.value)}`)
              .join("; ")}). The key may need another quantity, or the graph may be wrong.`,
      );
    }
  }

  const withDiagram = `${text.trimEnd()}\n\n\`\`\`dg\n${src}\n\`\`\``;
  // Publishing trims text to MAX_TEXT; a trimmed block would be a broken diagram.
  if (withDiagram.length > MAX_TEXT)
    return {
      text,
      attached: false,
      warnings: ["The problem text plus its diagram is too long, so the diagram was left out."],
    };
  return { text: withDiagram, attached: true, warnings, repair };
}
