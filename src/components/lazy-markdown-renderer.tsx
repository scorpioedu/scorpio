"use client";

import dynamic from "next/dynamic";

/**
 * Loads react-markdown, remark/rehype and KaTeX (~120 KB gz) on first render instead of
 * with the host component. Chat widgets render messages only once opened, so the launcher
 * stays light. (I-018)
 */
export const LazyMarkdownRenderer = dynamic(
  () => import("./markdown-renderer").then((m) => m.MarkdownRenderer),
  { ssr: false }
);
