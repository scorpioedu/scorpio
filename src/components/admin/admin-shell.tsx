"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookCheck,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  ShieldCheck,
} from "lucide-react";
import { useAdminAccess } from "@/lib/use-admin-access";
import { logout } from "@/lib/firebase";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/mode-toggle";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const NAV = [
  { title: "Overview", href: "/admin", icon: LayoutDashboard },
  { title: "Access requests", href: "/admin/access", icon: Inbox },
  { title: "Tickets", href: "/admin/feedback", icon: MessageSquare },
  { title: "Analytics", href: "/admin/analytics", icon: BarChart3 },
  { title: "Content review", href: "/admin/content", icon: BookCheck },
];

function AdminNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="flex flex-col gap-0.5">
      {NAV.map((item) => {
        const active =
          item.href === "/admin" ? pathname === "/admin" : pathname?.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onNavigate={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
          >
            <item.icon className="size-4 shrink-0" />
            {item.title}
          </Link>
        );
      })}
    </nav>
  );
}

/** Shared frame for every /admin page: one access check, a docs-style top bar and a left nav. */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const access = useAdminAccess();
  const [menuOpen, setMenuOpen] = useState(false);

  if (access !== "admin") {
    const message =
      access === "loading"
        ? "Checking your account…"
        : access === "signed-out"
          ? "Sign in with an administrator account to continue."
          : "This account does not have administrator access.";
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm space-y-4 rounded-lg border border-border/60 p-6 text-center">
          <ShieldCheck className="mx-auto size-6 text-primary" />
          <div className="space-y-1">
            <h1 className="font-semibold">Scorpio admin</h1>
            <p className="text-sm text-muted-foreground">{message}</p>
          </div>
          {access === "signed-out" && (
            <Button className="w-full" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex h-dvh flex-col bg-background">
        <header className="z-40 flex h-14 shrink-0 items-center justify-between border-b border-border/60 bg-background/90 px-4 backdrop-blur md:px-6">
          <div className="flex items-center gap-3">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  aria-label="Open admin menu"
                >
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0" aria-describedby={undefined}>
                <div className="flex items-center gap-2.5 border-b border-border/60 p-4">
                  <Logo size={22} className="text-primary" />
                  <SheetTitle className="font-semibold">Scorpio Admin</SheetTitle>
                </div>
                <div className="p-3">
                  <AdminNav onNavigate={() => setMenuOpen(false)} />
                </div>
              </SheetContent>
            </Sheet>
            <Link href="/" className="flex items-center gap-2.5">
              <Logo size={22} className="text-primary" />
              <span className="font-semibold tracking-tight">Scorpio</span>
            </Link>
            <span className="text-muted-foreground/40">/</span>
            <span className="text-sm text-muted-foreground">Admin</span>
          </div>
          <div className="flex items-center gap-1">
            <ModeToggle />
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => void logout()}
            >
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Log out</span>
            </Button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <aside className="hidden w-56 shrink-0 overflow-y-auto border-r border-border/60 p-3 md:block">
            <AdminNav />
          </aside>
          <main className="min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 md:py-10">{children}</div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}

/** Page heading used by every admin page so titles and spacing match. */
export function AdminHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 border-b border-border/60 pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Small number tile. */
export function StatTile({
  label,
  value,
  hint,
  tone,
  href,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "warn" | "danger";
  href?: string;
}) {
  const body = (
    <>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          tone === "warn" && "text-amber-600 dark:text-amber-400",
          tone === "danger" && "text-destructive",
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </>
  );
  const cls = "block rounded-lg border border-border/60 p-4";
  return href ? (
    <Link href={href} className={cn(cls, "transition-colors hover:bg-muted/40")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
