// A second check on the renderer's output before it goes into a page. The renderer builds SVG from
// numbers and escaped labels; this confirms the result holds only drawing elements, with nothing
// that can run script or load a resource.

const ALLOWED = new Set([
  "svg",
  "title",
  "g",
  "line",
  "polygon",
  "polyline",
  "text",
  "tspan",
  "circle",
  "path",
  "rect",
  "ellipse",
]);

export function isSafeSvg(svg: string): boolean {
  for (const tag of svg.match(/<[^>]*>/g) ?? []) {
    const name = /^<\/?\s*([A-Za-z][\w:-]*)/.exec(tag)?.[1];
    if (!name || !ALLOWED.has(name)) return false;
    if (/\son[a-z]+\s*=|href\s*=|javascript:|url\s*\(/i.test(tag)) return false;
  }
  return true;
}
