// Turning a rendered diagram into a picture someone can save or paste elsewhere. The on-page SVG
// takes its colours from the page (currentColor and the --dg-* variables) and has no background;
// a file has no page around it, so this writes the colours in, puts a solid background behind the
// drawing and adds a small wordmark.
//
// Pure: strings in, strings out. The browser half (canvas, clipboard, download) is in
// src/components/diagram.tsx.

/** Concrete CSS colours (hex or rgb()) for an exported picture. */
export type ExportTheme = {
  /** Text and lines: what currentColor was on the page. */
  fg: string;
  /** The solid background. */
  bg: string;
  /** --dg-accent: series lines and shading. */
  accent: string;
  /** --dg-force: force arrows. Defaults to fg. */
  force?: string;
};

export const LIGHT_THEME: ExportTheme = { fg: "#18181b", bg: "#ffffff", accent: "#2563eb" };
export const DARK_THEME: ExportTheme = { fg: "#e4e4e7", bg: "#18181b", accent: "#7aa2ff" };

/**
 * A file is drawn with whatever fonts the viewer's machine has, so name the common system faces
 * in order. Their widths are close enough that labels stay where the renderer put them.
 */
export const EXPORT_FONT =
  "system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

export const WORDMARK = "scorpio";
/** Exported PNGs are drawn at twice the SVG's size. */
export const EXPORT_SCALE = 2;

export type ExportedSvg = { svg: string; width: number; height: number };

const r1 = (n: number) => +n.toFixed(1);
const escText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** Colours come from computed styles; keep only what a colour can be made of. */
const safeColor = (s: string, dflt: string) =>
  /^[#\w(),.%\s/-]+$/.test(s) && !/url|expression/i.test(s) ? s.trim() : dflt;

/** The theme with anything that is not a plain colour replaced by a default. */
export function cleanTheme(t: ExportTheme): Required<ExportTheme> {
  const fg = safeColor(t.fg, LIGHT_THEME.fg);
  return {
    fg,
    bg: safeColor(t.bg, LIGHT_THEME.bg),
    accent: safeColor(t.accent, LIGHT_THEME.accent),
    force: t.force ? safeColor(t.force, fg) : fg,
  };
}

/** The renderer's viewBox: [x, y, width, height]. */
export function viewBoxOf(svg: string): [number, number, number, number] | undefined {
  const m = svg.match(/<svg\b[^>]*\sviewBox="([^"]+)"/);
  const v = m?.[1]
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (!v || v.length !== 4 || v.some((n) => !Number.isFinite(n)) || v[2] <= 0 || v[3] <= 0)
    return undefined;
  return v as [number, number, number, number];
}

/**
 * The diagram with page colours written in, ready to nest in another SVG at (x, y) with the given
 * size. Colours are replaced inside tags only, so a label that happens to say "currentColor" is
 * left alone.
 */
export function embedDiagram(
  svg: string,
  theme: ExportTheme,
  box: { x: number; y: number; width: number; height: number },
): string {
  const t = cleanTheme(theme);
  const vars: Record<string, string> = { accent: t.accent, force: t.force, bg: t.bg };
  let out = svg.replace(/<[^>]*>/g, (tag) =>
    tag
      .replace(/var\(--dg-(\w+),[^()]*\)/g, (_m, name: string) => vars[name] ?? t.fg)
      .replace(/currentColor/g, t.fg),
  );
  out = out.replace(/<svg\b[^>]*>/, (root) =>
    root
      .replace(/\s(?:width|height|x|y|style|class|role)="[^"]*"/g, "")
      .replace(/\sfont-family="[^"]*"/, "")
      .replace(
        /^<svg/,
        `<svg x="${r1(box.x)}" y="${r1(box.y)}" width="${r1(box.width)}" height="${r1(box.height)}" font-family="${EXPORT_FONT}"`,
      ),
  );
  return out;
}

function wordmark(x: number, y: number, size: number, color: string, opacity: number): string {
  return `<text x="${r1(x)}" y="${r1(y)}" text-anchor="end" font-family="${EXPORT_FONT}" font-size="${size}" font-weight="700" letter-spacing="${r1(size * 0.04)}" fill="${color}" fill-opacity="${opacity}" stroke="none">${WORDMARK}</text>`;
}

/**
 * A standalone SVG of a rendered diagram: solid background, padding, the page's colours written
 * in, and the wordmark in the bottom right corner. Undefined if `svg` is not renderer output.
 */
export function exportSvg(
  svg: string,
  theme: ExportTheme,
  opts: { padding?: number; wordmark?: boolean } = {},
): ExportedSvg | undefined {
  const vb = viewBoxOf(svg);
  if (!vb) return undefined;
  const t = cleanTheme(theme);
  const pad = opts.padding ?? 24;
  const mark = opts.wordmark ?? true;
  const footer = mark ? 16 : 0;
  // never so narrow that the wordmark crowds the drawing
  const width = Math.ceil(Math.max(vb[2] + 2 * pad, 200));
  const height = Math.ceil(vb[3] + 2 * pad + footer);
  const inner = embedDiagram(svg, t, {
    x: (width - vb[2]) / 2,
    y: pad,
    width: vb[2],
    height: vb[3],
  });
  const out =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">` +
    `<rect width="${width}" height="${height}" fill="${t.bg}"/>` +
    inner +
    (mark ? wordmark(width - 12, height - 10, 11, t.fg, 0.45) : "") +
    `</svg>`;
  return { svg: out, width, height };
}

/** Pixel size of the PNG: the SVG's size times `scale`, kept inside what a canvas can hold. */
export function rasterSize(
  width: number,
  height: number,
  scale = EXPORT_SCALE,
  maxSide = 4096,
): { width: number; height: number; scale: number } {
  const k = Math.min(scale, maxSide / Math.max(width, height, 1));
  return {
    width: Math.max(1, Math.round(width * k)),
    height: Math.max(1, Math.round(height * k)),
    scale: k,
  };
}

/** "Free-body diagram of m…" -> "scorpio-free-body-diagram-of-m.png" */
export function exportFilename(name: string, ext: "png" | "svg"): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ⃗]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/, "");
  return `scorpio-${slug || "diagram"}.${ext}`;
}

/** The SVG as a data: URL an <img> can load (no blob, so the canvas it is drawn on stays readable). */
export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export { escText as escapeSvgText, wordmark as wordmarkText };
