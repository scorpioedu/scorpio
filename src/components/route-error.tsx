"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";

export type RouteErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

/**
 * Shared body for segment error boundaries. Shows a friendly message only:
 * the error message/stack can contain PII or internals, so only the opaque
 * digest (which correlates with the server log) is reported, via console.
 */
export function RouteError({
  error,
  reset,
  scope,
  fullScreen = false,
}: RouteErrorProps & { scope: string; fullScreen?: boolean }) {
  useEffect(() => {
    console.error(`[route-error] ${scope}`, { digest: error.digest });
  }, [error.digest, scope]);

  return (
    <div
      className={
        fullScreen
          ? "grid min-h-dvh place-items-center bg-background p-4"
          : "grid place-items-center py-12"
      }
    >
      <Card className="w-full max-w-md" role="alert">
        <CardHeader>
          <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden="true" />
          <h1 className="break-words text-2xl font-semibold">Something went wrong</h1>
          <CardDescription>
            This page hit an unexpected problem. Your other work is safe. Try again, and if it keeps
            happening, reload the page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={reset}>Try again</Button>
        </CardContent>
      </Card>
    </div>
  );
}
