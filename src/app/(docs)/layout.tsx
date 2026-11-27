"use client";

import { useState } from "react";
import { PageTransition } from "@/components/page-transition";
import { DocsSidebar } from "@/components/docs-sidebar";
import { DocsLines } from "@/components/docs-lines";
import { Logo } from "@/components/ui/logo";
import Link from "next/link";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ClickIcon } from "@/components/ui/click-icon";
import { ChevronLeftIcon as AnimatedChevronLeft } from "@animateicons/react/lucide/chevron-left-icon";
import { MenuIcon as AnimatedMenu } from "@animateicons/react/lucide/menu-icon";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-background">
      {/* Quiet line background */}
      <DocsLines className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[70vh] w-full text-primary opacity-[0.3] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
      {/* Top bar */}
      <header className="relative z-40 shrink-0 flex h-14 items-center justify-between border-b border-border/60 bg-background/90 px-4 backdrop-blur md:px-8">
        <div className="flex items-center gap-3">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Open documentation menu"
              >
                <ClickIcon icon={AnimatedMenu} className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-72 overflow-y-auto p-0"
              aria-describedby={undefined}
            >
              <div className="flex items-center gap-2.5 border-b border-border/60 p-5">
                <Logo size={24} className="text-primary" />
                <SheetTitle className="font-semibold">Scorpio Docs</SheetTitle>
              </div>
              <div className="p-5">
                <DocsSidebar onNavigate={() => setMenuOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>
          <Link href="/" className="flex items-center gap-2.5">
            <Logo size={24} className="text-primary" />
            <span className="font-semibold tracking-tight">Scorpio</span>
          </Link>
          <span className="text-muted-foreground/40">/</span>
          <span className="text-sm text-muted-foreground">Docs</span>
        </div>
        <div className="flex items-center gap-1">
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
            <Link href="/">
              <ClickIcon icon={AnimatedChevronLeft} className="h-4 w-4" /> Home
            </Link>
          </Button>
          <ModeToggle />
        </div>
      </header>

      <div className="relative z-10 min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-6xl">
          {/* Desktop nav */}
          <aside className="z-10 self-start sticky top-0 hidden h-[calc(100dvh-3.5rem)] w-64 shrink-0 overflow-y-auto py-10 pl-8 pr-4 md:block">
            <DocsSidebar />
          </aside>

          <div className="relative z-10 min-w-0 flex-1 md:border-l md:border-border/60">
            <main
              className={[
                "mx-auto max-w-4xl px-6 py-10 md:px-12 md:py-14",
                // Doc-style type scale: overrides the marketing-sized headings inside each page.
                "[&_h1]:!text-3xl [&_h1]:!font-semibold [&_h1]:!tracking-tight [&_h1]:!leading-tight [&_h1_*]:!bg-none [&_h1_*]:!text-foreground [&_h1_*]:![-webkit-text-fill-color:currentColor]",
                "[&_h2]:!text-xl [&_h2]:!font-semibold [&_h2]:!tracking-tight",
                "[&_h3]:!text-base [&_h3]:!font-semibold",
                "[&_p]:!text-sm [&_p]:!leading-relaxed [&_li]:!text-sm",
                "[&_[data-slot=badge]]:hidden",
                "[&_[class*=rounded-3xl]]:!rounded-lg [&_[class*=rounded-2xl]]:!rounded-lg",
              ].join(" ")}
            >
              <PageTransition>{children}</PageTransition>
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
