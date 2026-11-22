// A 1200 x 630 share card for one topic guide: course name, topic title, the guide's picture and
// the wordmark. 1200 x 630 is the size link previews (Open Graph) expect, so the same function can
// feed a preview image if guides ever get public pages. Pure: no DOM, no data imports.

import {
  cleanTheme,
  embedDiagram,
  escapeSvgText,
  EXPORT_FONT,
  type ExportedSvg,
  type ExportTheme,
  LIGHT_THEME,
  viewBoxOf,
  wordmarkText,
} from "./export";
import { render } from "./index";
import { isSafeSvg } from "./safe";

export const SHARE_CARD_WIDTH = 1200;
export const SHARE_CARD_HEIGHT = 630;

export type ShareCardInput = {
  /** The topic's title: "Change in momentum and impulse". */
  title: string;
  /** "AP Physics 1" */
  course: string;
  /** The topic id, shown before the course name when given: "4.2". */
  topic?: string;
  /** The guide's `picture` (only its diagram source is used). */
  picture?: { diagram: string };
};

/** Greedy word wrap by estimated width (0.55 em a character); long words get a line to themselves. */
export function wrapTitle(title: string, maxChars: number): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const word of title.trim().split(/\s+/).filter(Boolean)) {
    if (cur && cur.length + 1 + word.length > maxChars) {
      lines.push(cur);
      cur = word;
    } else cur = cur ? `${cur} ${word}` : word;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** The largest title size (px) at which the title fits `width` in at most `maxLines` lines. */
function fitTitle(title: string, width: number, maxLines: number) {
  for (const size of [64, 56, 48, 42, 36, 30]) {
    const lines = wrapTitle(title, Math.floor(width / (size * 0.55)));
    if (lines.length <= maxLines && lines.every((l) => l.length * size * 0.55 <= width + size))
      return { size, lines };
  }
  const lines = wrapTitle(title, Math.floor(width / (30 * 0.55)));
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].replace(/.{0,2}$/, "…");
  }
  return { size: 30, lines };
}

/**
 * The share card as a standalone SVG. A guide without a picture, or whose picture cannot be drawn,
 * gets the title across the full width instead.
 */
export function shareCardSvg(
  input: ShareCardInput,
  rawTheme: ExportTheme = LIGHT_THEME,
): ExportedSvg {
  const theme = cleanTheme(rawTheme);
  const [W, H, M] = [SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT, 64];
  const fg = theme.fg,
    accent = theme.accent;

  let drawing = "";
  const r = input.picture ? render(input.picture.diagram) : undefined;
  const vb = r?.ok && r.svg && isSafeSvg(r.svg) ? viewBoxOf(r.svg) : undefined;
  if (r && vb) {
    // a panel on the right; the drawing fills it without being blown up past 2.4x
    const [px, py, pw, ph] = [556, M, W - 556 - M, H - 2 * M];
    const inset = 28;
    const k = Math.min((pw - 2 * inset) / vb[2], (ph - 2 * inset) / vb[3], 2.4);
    const [dw, dh] = [vb[2] * k, vb[3] * k];
    drawing =
      `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="24" fill="${fg}" fill-opacity="0.04" stroke="${fg}" stroke-opacity="0.14"/>` +
      embedDiagram(r.svg, theme, {
        x: px + (pw - dw) / 2,
        y: py + (ph - dh) / 2,
        width: dw,
        height: dh,
      });
  }

  const textW = drawing ? 556 - M - 40 : W - 2 * M;
  const { size, lines } = fitTitle(input.title, textW, drawing ? 5 : 3);
  const lineH = Math.round(size * 1.14);
  const eyebrow = [input.topic, input.course].filter(Boolean).join(" · ");
  const blockH = 34 + lines.length * lineH;
  let y = Math.max(M + 20, (H - blockH) / 2 - 10);
  let body = `<text x="${M}" y="${y}" font-size="24" font-weight="600" letter-spacing="1.5" fill="${accent}">${escapeSvgText(eyebrow.toUpperCase())}</text>`;
  y += 34 + size * 0.8;
  for (const l of lines) {
    body += `<text x="${M}" y="${Math.round(y)}" font-size="${size}" font-weight="700" fill="${fg}">${escapeSvgText(l)}</text>`;
    y += lineH;
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${EXPORT_FONT}">` +
    `<title>${escapeSvgText(`${input.title} (${input.course})`)}</title>` +
    `<rect width="${W}" height="${H}" fill="${theme.bg}"/>` +
    `<rect width="12" height="${H}" fill="${accent}"/>` +
    body +
    drawing +
    // bottom left, under the title; the picture panel owns the right side
    wordmarkText(M, H - M + 14, 30, fg, 0.7).replace('text-anchor="end"', 'text-anchor="start"') +
    `</svg>`;
  return { svg, width: W, height: H };
}
