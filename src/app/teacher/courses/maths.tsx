"use client";

import { LazyMarkdownRenderer } from "@/components/lazy-markdown-renderer";

/**
 * Problem text as students see it: Markdown with $…$ math typeset by KaTeX (loaded when the dialog
 * first shows problems). `inline` keeps a choice or an answer on its line.
 */
export function Maths({ children, inline }: { children: string; inline?: boolean }) {
  return (
    <LazyMarkdownRenderer
      noProse
      className={
        inline
          ? "min-w-0 break-words [&_p]:m-0 [&_p]:inline"
          : "space-y-2 break-words leading-relaxed [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden"
      }
    >
      {children}
    </LazyMarkdownRenderer>
  );
}
