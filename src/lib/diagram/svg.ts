// SVG helpers shared by every renderer. Colours come from currentColor and
// two CSS variables, so the host page's light/dark theme just works:
//   --dg-accent  series lines and shading (default blue)
//   --dg-force   force and vector arrows (default currentColor)

export type P = [number, number];

export const ACCENT = "var(--dg-accent,#2563eb)";
export const FORCE = "var(--dg-force,currentColor)";
export const FONT = 13;

export const f1 = (n: number) => +n.toFixed(1);

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const GREEK: Record<string, string> = {
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  Delta: "Δ",
  theta: "θ",
  phi: "φ",
  omega: "ω",
  Omega: "Ω",
  mu: "μ",
  tau: "τ",
  lambda: "λ",
  rho: "ρ",
  sigma: "σ",
  pi: "π",
};

/** LaTeX symbols models put in labels, as the character to draw. */
const SYMBOLS: Record<string, string> = {
  epsilon: "ε",
  varepsilon: "ε",
  eta: "η",
  kappa: "κ",
  nu: "ν",
  xi: "ξ",
  chi: "χ",
  psi: "ψ",
  Gamma: "Γ",
  Theta: "Θ",
  Lambda: "Λ",
  Sigma: "Σ",
  Phi: "Φ",
  Psi: "Ψ",
  varphi: "φ",
  cdot: "·",
  times: "×",
  pm: "±",
  approx: "≈",
  le: "≤",
  leq: "≤",
  ge: "≥",
  geq: "≥",
  ne: "≠",
  infty: "∞",
  to: "→",
  rightarrow: "→",
  leftarrow: "←",
  perp: "⊥",
  parallel: "∥",
  propto: "∝",
  hbar: "ħ",
  ell: "ℓ",
  prime: "′",
};

/** Commands whose argument is kept as plain text: \text{ on }, \mathrm{net}. */
const PASS =
  /\\(?:text|mathrm|mathbf|mathit|textrm|textbf|operatorname|boldsymbol|bm)\{([^{}]*)\}/g;

/** The LaTeX commands a label may use; anything else is reported by unsupportedLabelMarkup(). */
export const LABEL_COMMANDS = new Set([
  ...Object.keys(GREEK),
  ...Object.keys(SYMBOLS),
  "vec",
  "hat",
  "overline",
  "bar",
  "text",
  "mathrm",
  "mathbf",
  "mathit",
  "textrm",
  "textbf",
  "operatorname",
  "boldsymbol",
  "bm",
  "circ",
  "degree",
  "Delta",
  "left",
  "right",
]);

/**
 * Turn the LaTeX models write in labels into drawable text before sub/superscripts are handled:
 * $…$ wrappers, 30^\circ -> 30°, \vec{F} -> F⃗, \hat{x} -> x̂, \text{ on } -> " on ", \, -> space.
 * Innermost commands first, so \vec{F}_{B \text{ on } A} works.
 */
export function normalizeLabel(s: string): string {
  s = s.replace(/^\$+|\$+$/g, "").replace(/\^?\{?\\(?:circ|degree)\}?/g, "°");
  s = s.replace(/\\[,;:! ]|\\q?quad/g, " ").replace(/\\left|\\right/g, "");
  for (let i = 0; i < 4; i++) {
    const before = s;
    s = s
      .replace(PASS, "$1")
      .replace(/\\vec\{([^{}]*)\}|\\vec\s*([A-Za-z])/g, (_m, a, b) => `${a ?? b}\u20d7`)
      .replace(/\\hat\{([^{}]*)\}|\\hat\s*([A-Za-z])/g, (_m, a, b) => `${a ?? b}\u0302`)
      .replace(/\\(?:overline|bar)\{([^{}]*)\}/g, (_m, a) => `${a}\u0305`);
    if (s === before) break;
  }
  return s.replace(/\\([A-Za-z]+)/g, (m, w) => GREEK[w] ?? SYMBOLS[w] ?? w);
}

/** LaTeX commands in a diagram's source that labels can't draw (shown as plain words instead). */
export function unsupportedLabelMarkup(src: string): string[] {
  return [
    ...new Set(
      [...src.matchAll(/\\([A-Za-z]+)/g)].map((m) => m[1]).filter((w) => !LABEL_COMMANDS.has(w)),
    ),
  ];
}

/**
 * E_th -> E_{th}. The newer kinds (bars, circuit, field) take one-word labels, where a model
 * writes a whole-word subscript without braces; plot, fbd and scene keep the stricter F_{net}.
 */
export function braceSubscripts(s: string): string {
  return s.replace(/_([A-Za-z0-9]{2,})(?![A-Za-z0-9{}])/g, "_{$1}");
}

/** The vector arrow \vec{} adds: U+20D7 COMBINING RIGHT ARROW ABOVE. */
/**
 * The arrow over a vector, as a small raised "→" pulled back over the letter before it. The
 * combining U+20D7 itself is missing from system-ui on most systems, and Chrome then draws it
 * apart from its letter, as a broken glyph. dx and dy are in the arrow's own em (70% of the
 * label's): -0.85em is about one letter back, and it sits VEC_LIFT of the label's em above the
 * baseline. svgTexts() reads it back as U+20D7.
 */
export const VEC_LIFT = 0.56; // label em
const vecTspan = (from: number) =>
  `<tspan class="vec" dx="-0.85em" dy="${f1((-VEC_LIFT - from) / 0.7)}em" font-size="70%">→</tspan>`;

/** Label markup: F_N, F_{net}, v^2, \theta, \Delta x. Returns tspans. */
export function label(s: string): string {
  s = normalizeLabel(s);
  let out = "";
  let shift = 0; // em, current baseline offset to undo
  let lifted = false; // the last thing drawn was a vector arrow, VEC_LIFT above the baseline
  const re = /([_^])(\{([^}]*)\}|(.))|(\u20d7)|([^_^\u20d7]+)/g;
  for (const m of s.matchAll(re)) {
    if (m[5] !== undefined) {
      if (lifted) continue;
      out += vecTspan(shift * 0.75); // from the baseline, or from a sub/superscript (75% em)
      shift = 0;
      lifted = true;
    } else if (m[6] !== undefined) {
      if (lifted) out += `<tspan dy="${VEC_LIFT}em">${esc(m[6])}</tspan>`;
      else out += shift ? `<tspan dy="${-shift}em">${esc(m[6])}</tspan>` : esc(m[6]);
      shift = 0;
      lifted = false;
    } else {
      const body = (m[3] ?? m[4]).replace(/\u20d7/g, ""); // an arrow inside a subscript is dropped
      const dy = m[1] === "_" ? 0.3 : -0.45;
      // after an arrow, drop by its lift too, in this tspan's own (75%) em
      const from = lifted ? f1(dy + VEC_LIFT / 0.75) : f1(dy - shift);
      out += `<tspan dy="${from}em" font-size="75%">${esc(body)}</tspan>`;
      shift = lifted ? +(from * 0.75 - VEC_LIFT).toFixed(2) : dy;
      lifted = false;
    }
  }
  return out;
}

export function text(
  p: P,
  s: string,
  anchor: "start" | "middle" | "end" = "middle",
  extra = "",
): string {
  return `<text x="${f1(p[0])}" y="${f1(p[1])}" text-anchor="${anchor}" dominant-baseline="middle"${extra}>${label(s)}</text>`;
}

export function line(a: P, b: P, extra = ""): string {
  return `<line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}"${extra}/>`;
}

export function poly(pts: P[], closed: boolean, extra = ""): string {
  const d = pts.map((p) => `${f1(p[0])},${f1(p[1])}`).join(" ");
  return `<${closed ? "polygon" : "polyline"} points="${d}"${extra}/>`;
}

/** Arrow from a to b in screen space, with a filled head. */
export function arrow(a: P, b: P, color = FORCE, width = 2, head = 9): string {
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const back = (k: number, side: number): P => [
    b[0] - head * Math.cos(ang) + side * k * Math.sin(ang),
    b[1] - head * Math.sin(ang) - side * k * Math.cos(ang),
  ];
  const shaftEnd: P = [b[0] - head * 0.8 * Math.cos(ang), b[1] - head * 0.8 * Math.sin(ang)];
  return (
    line(a, shaftEnd, ` stroke="${color}" stroke-width="${width}"`) +
    poly([b, back(head * 0.42, 1), back(head * 0.42, -1)], true, ` fill="${color}" stroke="none"`)
  );
}

/** Angle arc around c (screen space) from a0 to a1 degrees, maths convention (CCW, y up). */
export function arc(c: P, r: number, a0: number, a1: number): string {
  const pt = (a: number): P => [
    c[0] + r * Math.cos((a * Math.PI) / 180),
    c[1] - r * Math.sin((a * Math.PI) / 180),
  ];
  const [s, e] = [pt(a0), pt(a1)];
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const sweep = a1 > a0 ? 0 : 1;
  return `<path d="M${f1(s[0])},${f1(s[1])} A${r},${r} 0 ${large} ${sweep} ${f1(e[0])},${f1(e[1])}" fill="none"/>`;
}

/** Where to put an angle's label so it clears both rays: along the bisector, far enough out. */
export function arcLabelPos(c: P, r: number, a0: number, a1: number, s: string): P {
  const mid = (((a0 + a1) / 2) * Math.PI) / 180;
  const half = (Math.max(Math.abs(a1 - a0) / 2, 1) * Math.PI) / 180;
  const w = 7 * s.length;
  if (half < (10 * Math.PI) / 180) {
    // too narrow to fit inside: sit just outside the far ray, reading away from it
    const far = ((Math.abs(a1) < Math.abs(a0) ? a1 : a0) * Math.PI) / 180;
    const side = far + (Math.sign(Math.cos(far + Math.PI / 2) || 1) * Math.PI) / 2;
    const off = 6 + w / 2;
    return [
      c[0] + Math.cos(far) * r + Math.cos(side) * off,
      c[1] - Math.sin(far) * r - Math.sin(side) * off,
    ];
  }
  const d = Math.max(r + 12, 11 / Math.sin(half) + (w / 2) * Math.abs(Math.cos(mid)));
  return [c[0] + Math.cos(mid) * d, c[1] - Math.sin(mid) * d];
}

/** Rough rendered width in px at FONT size; sub/superscripts count as narrower. */
export function textWidth(s: string): number {
  const base = s
    .replace(/\\[A-Za-z]+/g, "x")
    .replace(/[_^]\{([^}]*)\}|[_^](.)/g, (_m, a, b) =>
      "·".repeat(Math.ceil(((a ?? b) as string).length * 0.75)),
    );
  return base.length * 7;
}

export function wrap(w: number, h: number, body: string, alt: string, ox = 0, oy = 0): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f1(ox)} ${f1(oy)} ${f1(w)} ${f1(h)}" width="${f1(w)}" role="img" class="dg"` +
    ` style="max-width:100%;height:auto" font-family="system-ui,sans-serif" font-size="${FONT}"` +
    ` fill="currentColor" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">` +
    `<title>${esc(alt)}</title><g stroke-width="1.5">${body}</g></svg>`
  );
}

/** Unicode-ish plain text for alt text: F_N -> F_N stays readable, \theta -> θ. */
export function plain(s: string): string {
  return normalizeLabel(s).replace(/[{}]/g, "");
}
