// Entry point. One pure function: source text in, SVG + alt text + errors out.
// No DOM, no dependencies, so it runs the same in the browser, in a Next
// server component, and in the content pipeline's checks.

import { renderBars } from "./bars";
import { renderCircuit } from "./circuit";
import { renderFbd } from "./fbd";
import { renderField } from "./field";
import { renderLevels, type LevelsModel } from "./levels";
import { renderMotion } from "./motion";
import { type DgError, parse } from "./parse";
import { renderPlot, type PlotModel } from "./plot";
import { renderPv, type PvModel } from "./pv";
import { renderRay, type RayModel } from "./ray";
import { renderRigid, type RigidModel } from "./rigid";
import { renderScene } from "./scene";
import { unsupportedLabelMarkup } from "./svg";
import { renderWave, type WaveModel } from "./wave";

export type { LevelsModel, PvModel, RayModel, RigidModel, WaveModel };

/** errors: the diagram can't be drawn. warnings: it draws, but a student may misread it. */
export type Result = {
  ok: boolean;
  svg: string;
  alt: string;
  errors: DgError[];
  warnings: DgError[];
  plot?: PlotModel;
  /** What the renderer computed, for checking an answer key against the picture. */
  ray?: RayModel; // the image, or the refracted ray
  wave?: WaveModel; // nodes and antinodes, the summed pulse, the fringe spacing
  pv?: PvModel; // every state, the work of each process, a cycle's net work
  levels?: LevelsModel; // each transition's photon energy, wavelength and frequency
  rigid?: RigidModel; // each force's torque, the net torque and the net force
  /**
   * Every piece of text a student can read on the picture, as drawn (subscripts as R_{1}), plus
   * values that are not printed but can be read off a numbered scale (a bar's height, a state's
   * pressure). The numbers of a regular scale itself (axis ticks, dot numbers, fringe orders) are
   * in `scale` instead: they are not claims about the physics. plot, fbd and scene do not report
   * a scale, so for those everything drawn is in `visible`.
   */
  visible: string[];
  scale: string[];
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
  const none = { visible: [], scale: [] };
  if (!doc) return { ok: false, svg: "", alt: "", errors, warnings, ...none };
  let r: {
    svg: string;
    alt: string;
    model?: PlotModel;
    ray?: RayModel;
    wave?: WaveModel;
    pv?: PvModel;
    levels?: LevelsModel;
    rigid?: RigidModel;
    scale?: string[];
    read?: string[];
  };
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
    case "bars":
      r = renderBars(doc, errors, warnings);
      break;
    case "motion":
      r = renderMotion(doc, errors, warnings);
      break;
    case "circuit":
      r = renderCircuit(doc, errors, warnings);
      break;
    case "field":
      r = renderField(doc, errors, warnings);
      break;
    case "ray":
      r = renderRay(doc, errors, warnings);
      break;
    case "wave":
      r = renderWave(doc, errors, warnings);
      break;
    case "pv":
      r = renderPv(doc, errors, warnings);
      break;
    case "levels":
      r = renderLevels(doc, errors, warnings);
      break;
    case "rigid":
      r = renderRigid(doc, errors, warnings, opts.equilibrium);
      break;
    default:
      return {
        ok: false,
        svg: "",
        alt: "",
        warnings,
        ...none,
        errors: [
          {
            line: doc.head.line,
            msg: `unknown diagram "${doc.kind}" (use plot, fbd, scene, bars, motion, circuit, field, ray, wave, pv, levels or rigid)`,
          },
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
  // What a student can read: every <text> drawn, less the scale numbers, plus values readable off a scale.
  const scale = r.scale ?? [];
  const left = [...scale];
  const visible = svgTexts(r.svg).filter((t) => {
    const i = left.indexOf(t);
    if (i < 0) return true;
    left.splice(i, 1);
    return false;
  });
  return {
    ok: errors.length === 0,
    svg: r.svg,
    alt: r.alt,
    errors,
    warnings,
    plot: r.model,
    ray: r.ray,
    wave: r.wave,
    pv: r.pv,
    levels: r.levels,
    rigid: r.rigid,
    visible: [...visible, ...(r.read ?? [])],
    scale,
  };
}

/** The text of every label in a rendered diagram, with subscripts as _{x} and superscripts as ^{x}. */
export function svgTexts(svg: string): string[] {
  return [...svg.matchAll(/<text\b[^>]*>(.*?)<\/text>/g)].map((m) =>
    m[1]
      .replace(/<tspan dy="(-?[\d.]+)em" font-size="75%">(.*?)<\/tspan>/g, (_m, dy, body) =>
        Number(dy) > 0 ? `_{${body}}` : `^{${body}}`,
      )
      .replace(/<[^>]+>/g, "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&"),
  );
}

/** Errors formatted for a retry prompt: the model fixes its own diagram. */
export function errorReport(src: string, errors: DgError[]): string {
  const lines = src.split(/\r?\n/);
  return errors
    .map((e) => `line ${e.line}: ${e.msg}\n  > ${lines[e.line - 1]?.trim() ?? ""}`)
    .join("\n");
}
