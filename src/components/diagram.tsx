"use client";

import * as React from "react";
import { render } from "@/lib/diagram";
import { isSafeSvg } from "@/lib/diagram/safe";

/** A diagram written in the diagram language (a ```dg block). Draws nothing it cannot draw correctly. */
export function Diagram({ source }: { source: string }) {
  const result = React.useMemo(() => render(source), [source]);
  if (!result.ok || !result.svg || !isSafeSvg(result.svg)) {
    return (
      <div className="not-prose my-3 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
        Diagram not available
      </div>
    );
  }
  return (
    <figure
      className="not-prose my-4 flex justify-center overflow-x-auto rounded-xl border border-border bg-card p-4 text-foreground shadow-xs animate-in fade-in zoom-in-95 duration-500 [--dg-accent:var(--primary)] [--dg-bg:var(--background)]"
      aria-label={result.alt}
      dangerouslySetInnerHTML={{ __html: result.svg }}
    />
  );
}
