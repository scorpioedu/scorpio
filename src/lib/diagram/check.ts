// Numbers read straight off a plot, for the content pipeline to compare with
// the answer key. If the picture and the key disagree, the item is wrong.

import { clip, interp } from "./plot";
import type { Result } from "./index";

function series(r: Result, i = 0) {
  const s = r.plot?.series[i];
  if (!s) throw new Error(`no series ${i + 1}`);
  return s;
}

/** Signed area under series i between a and b (displacement from v-t, impulse from F-t). */
export function area(r: Result, a: number, b: number, i = 0): number {
  const s = series(r, i);
  if (s.f) {
    // Simpson's rule on the exact function
    const n = 400,
      h = (b - a) / n;
    let sum = s.f(a) + s.f(b);
    for (let k = 1; k < n; k++) sum += s.f(a + k * h) * (k % 2 ? 4 : 2);
    return (sum * h) / 3;
  }
  let sum = 0;
  const p = clip(s.pts, a, b); // keeps vertical jumps, which add no area
  for (let k = 1; k < p.length; k++) sum += ((p[k - 1][1] + p[k][1]) / 2) * (p[k][0] - p[k - 1][0]);
  return sum;
}

/** Value of series i at x. */
export function at(r: Result, x: number, i = 0): number {
  const s = series(r, i);
  return s.f ? s.f(x) : interp(s.pts, x);
}

/** Slope of series i at x (central difference). */
export function slope(r: Result, x: number, i = 0, h = 1e-4): number {
  return (at(r, x + h, i) - at(r, x - h, i)) / (2 * h);
}

/** Largest |value| of series i. */
export function peak(r: Result, i = 0): number {
  return Math.max(...series(r, i).pts.map((p) => Math.abs(p[1])));
}

/**
 * Pairs of labels whose estimated boxes overlap in a rendered SVG. Text width is
 * estimated (7px a character), so treat this as a reviewer's flag, not proof.
 */
export function labelOverlaps(svg: string): [string, string][] {
  const boxes = [
    ...svg.matchAll(/<text x="(-?[\d.]+)" y="(-?[\d.]+)" text-anchor="(\w+)"[^>]*>(.*?)<\/text>/g),
  ].map((m) => {
    const s = m[4].replace(/<[^>]+>/g, "");
    const w = s.length * 7,
      x = +m[1],
      y = +m[2];
    const left = m[3] === "start" ? x : m[3] === "end" ? x - w : x - w / 2;
    return { s, r: [left, y - 6, left + w, y + 6] };
  });
  const out: [string, string][] = [];
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const [a, b] = [boxes[i].r, boxes[j].r];
      if (a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1])
        out.push([boxes[i].s, boxes[j].s]);
    }
  return out;
}
