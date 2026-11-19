// Entry point. One pure function: source text in, SVG + alt text + errors out.
// No DOM, no dependencies, so it runs the same in the browser, in a Next
// server component, and in the content pipeline's checks.

import { renderFbd } from "./fbd";
import { type DgError, parse } from "./parse";
import { renderPlot, type PlotModel } from "./plot";
import { renderScene } from "./scene";
import { unsupportedLabelMarkup } from "./svg";

/** errors: the diagram can't be drawn. warnings: it draws, but a student may misread it. */
export type Result = {
  ok: boolean;
  svg: string;
  alt: string;
  errors: DgError[];
  warnings: DgError[];
  plot?: PlotModel;
};

export type RenderOptions = {
  /**
   * The text around the diagram says the body is at rest or moving at constant velocity, so a
   * free-body diagram's arrows must balance. (A diagram can also say so itself: `fbd box eq`.)
   */
  equilibrium?: boolean;
};

export function render(src: string, opts: RenderOptions = {}): Result {
  const { doc, errors } = parse(src);
  const warnings: DgError[] = [];
  if (!doc) return { ok: false, svg: "", alt: "", errors, warnings };
  let r: { svg: string; alt: string; model?: PlotModel };
  switch (doc.kind) {
    case "plot":
      r = renderPlot(doc, errors, warnings);
      break;
    case "fbd":
      r = renderFbd(doc, errors, warnings, opts.equilibrium);
      break;
    case "scene":
      r = renderScene(doc, errors, warnings);
      break;
    default:
      return {
        ok: false,
        svg: "",
        alt: "",
        warnings,
        errors: [
          { line: doc.head.line, msg: `unknown diagram "${doc.kind}" (use plot, fbd or scene)` },
          ...errors,
        ],
      };
  }
  // Labels draw the LaTeX models commonly write (\vec, \text, Greek, \cdot...). Anything else is
  // drawn as the bare word, which may read wrong, so say so.
  src.split(/\r?\n/).forEach((l, i) => {
    const bad = unsupportedLabelMarkup(l);
    if (bad.length)
      warnings.push({
        line: i + 1,
        kind: "markup",
        msg: `label markup ${bad.map((b) => "\\" + b).join(" ")} is not supported and is drawn as plain text; use F_N, F_{net}, v^2, \\theta, \\vec{F} or plain words`,
      });
  });
  return { ok: errors.length === 0, svg: r.svg, alt: r.alt, errors, warnings, plot: r.model };
}

/** Errors formatted for a retry prompt: the model fixes its own diagram. */
export function errorReport(src: string, errors: DgError[]): string {
  const lines = src.split(/\r?\n/);
  return errors
    .map((e) => `line ${e.line}: ${e.msg}\n  > ${lines[e.line - 1]?.trim() ?? ""}`)
    .join("\n");
}
