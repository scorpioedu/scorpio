"use client";

import { useEffect } from "react";
import type { RouteErrorProps } from "@/components/route-error";

/**
 * Replaces the root layout when it throws, so it must render its own
 * <html>/<body>. Global CSS and providers are not loaded here, hence inline styles.
 */
export default function GlobalError({ error, reset }: RouteErrorProps) {
  useEffect(() => {
    console.error("[route-error] global", { digest: error.digest });
  }, [error.digest]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: 16,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <main role="alert" style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: 24, fontWeight: 600 }}>Something went wrong</h1>
          <p style={{ color: "#666" }}>
            Scorpio hit an unexpected problem. Try again, and if it keeps happening, reload the page.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #888", cursor: "pointer" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
