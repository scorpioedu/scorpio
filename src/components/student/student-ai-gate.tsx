"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useStudentAi } from "@/contexts/student-ai-context";

/**
 * Shows a Raise page only when Raise is on for the student's class. A student who opens an old
 * link while it is off is told so and pointed at Study, which needs no AI.
 */
export function StudentAiGate({ children }: { children: ReactNode }) {
  const aiOn = useStudentAi();
  if (aiOn === null) return null;
  if (aiOn) return <>{children}</>;
  return (
    <div className="flex min-h-[60dvh] flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="space-y-1.5">
        <h1 className="text-lg font-semibold tracking-tight">Raise is off for your class</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Your teacher can turn it on. Study has a lesson and practice for every topic, with each
          answer checked and no AI.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link href="/student/study">Go to Study</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/student">Home</Link>
        </Button>
      </div>
    </div>
  );
}
