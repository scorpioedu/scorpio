import type { Metadata } from "next";
import Link from "next/link";
import { ClickIcon } from "@/components/ui/click-icon";
import { ArrowLeftIcon as AnimatedArrowLeft } from "@animateicons/react/lucide/arrow-left-icon";
import { WorkspacePreview } from "@/components/landing/workspace-preview";
import { ModeToggle } from "@/components/mode-toggle";

export const metadata: Metadata = {
  title: "Teacher Dashboard Demo",
  description: "Explore a sample Scorpio physics classroom from the teacher dashboard.",
};

export default function TeacherDemoPage() {
  return (
    <main className="flex h-dvh flex-col overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border bg-background px-4 py-2 sm:px-6">
        <Link
          href="/#home"
          className="inline-flex min-h-9 items-center gap-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          <ClickIcon icon={AnimatedArrowLeft} aria-hidden="true" className="size-4" />
          Back to Scorpio
        </Link>
        <p className="order-last w-full text-xs text-muted-foreground sm:order-none sm:w-auto sm:text-sm">
          <span className="font-semibold text-foreground">Teacher demo</span>
          {" · "}Sample data resets when you reload.
        </p>
        <ModeToggle />
      </header>
      <WorkspacePreview />
    </main>
  );
}
