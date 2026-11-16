"use client";

import katex from "katex";
import "katex/dist/katex.min.css";

/**
 * Renders a LaTeX string with the same `katex` build the Markdown renderer uses, so KaTeX is
 * bundled once (react-katex pulled in a second, CommonJS copy). `throwOnError: false` shows
 * the source in red for invalid input instead of throwing. (I-018)
 */
export function Latex({ math, display = false }: { math: string; display?: boolean }) {
  const html = katex.renderToString(math, { throwOnError: false, displayMode: display });
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}
