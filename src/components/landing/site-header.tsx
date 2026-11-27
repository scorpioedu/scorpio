"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ClickIcon } from "@/components/ui/click-icon";
import { ChevronDownIcon as AnimatedChevronDown } from "@animateicons/react/lucide/chevron-down-icon";
import { MenuIcon as AnimatedMenu } from "@animateicons/react/lucide/menu-icon";
import { XIcon as AnimatedX } from "@animateicons/react/lucide/x-icon";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import reveal from "./home-reveal.module.css";

/*
 * The marketing header, after Polar: logo and nav on the left, account actions on the right,
 * and small dropdowns that open under their own trigger. One style on every page.
 */

type MenuItem = {
  label: string;
  desc: string;
  /** A page to open. */
  href?: string;
  /** A section id on the home page. */
  target?: string;
};

type NavItem =
  | { id: string; label: string; href: string; menu?: undefined }
  | { id: string; label: string; href?: undefined; menu: MenuItem[] };

const platformItems: MenuItem[] = [
  { href: "/demos", label: "Demos", desc: "The tour video and a sample classroom" },
  { href: "/demos/teacher", label: "Teacher demo", desc: "Click around a class with sample data" },
  { target: "features", label: "Classroom workflow", desc: "Assign, mark and review in one place" },
  { target: "efficacy", label: "AI in Scorpio", desc: "Off for students unless you turn it on" },
];

const resourcesItems: MenuItem[] = [
  { href: "/research", label: "Research", desc: "How we tested Raise, the optional assistant" },
  { href: "/ai", label: "Try Raise", desc: "Ask the optional assistant a physics question" },
  { href: "/sustainability", label: "Sustainability", desc: "Energy, water and paper, measured" },
  { href: "/about", label: "About", desc: "Why we built Scorpio" },
  { target: "faq", label: "FAQ", desc: "Pricing, data and getting started" },
  { href: "/request-access", label: "Request access", desc: "Classroom and department access" },
  { href: "/contact", label: "Contact", desc: "Talk to us about your department" },
];

const navItems: NavItem[] = [
  { id: "platform", label: "Platform", menu: platformItems },
  // Study on the public site: the lessons, each with its practice (the hub is /lessons).
  { id: "study", label: "Study", href: "/lessons" },
  { id: "pricing", label: "Pricing", href: "/pricing" },
  { id: "resources", label: "Resources", menu: resourcesItems },
];

const linkClass =
  "flex h-9 items-center gap-1 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring";

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

interface SiteHeaderProps {
  activeSection?: string;
  /** Slide the header away while scrolling down and back on any scroll up. On by default. */
  autoHide?: boolean;
}

export function SiteHeader({ activeSection, autoHide = true }: SiteHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const router = useRouter();
  const pathname = usePathname();
  const isHomePage = pathname === "/";

  const currentNav = (() => {
    if (pathname.startsWith("/demos")) return "platform";
    if (pathname.startsWith("/lessons") || pathname.startsWith("/study")) return "study";
    if (pathname === "/ai") return "raise";
    if (pathname === "/pricing") return "pricing";
    if (
      [
        "/sustainability",
        "/about",
        "/research",
        "/contact",
        "/privacy",
        "/terms",
        "/request-access",
      ].some((p) => pathname.startsWith(p))
    )
      return "resources";
    if (isHomePage) {
      if (["features", "solution", "efficacy"].includes(activeSection ?? "")) return "platform";
      if (activeSection === "faq") return "resources";
      if (activeSection === "pricing") return "pricing";
    }
    return "";
  })();

  // A plain scroll listener: it reads the position on every event, so a quick reversal is never missed.
  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const prev = lastY;
      lastY = y;
      setIsScrolled(y > 8);
      if (!autoHide) return;
      // Hide after scrolling down past the top; show again on any real scroll up.
      let next: boolean | null = null;
      if (y <= 120) next = false;
      else if (y > prev + 2) next = true;
      else if (y < prev - 2) next = false;
      if (next === null) return;
      setHidden(next);
      // Sticky bars under the header (the lesson contents) move up with it.
      document.documentElement.toggleAttribute("data-header-hidden", next);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [autoHide]);

  // Leaving the page must not leave the "header hidden" flag behind for the next one.
  useEffect(() => () => document.documentElement.removeAttribute("data-header-hidden"), []);

  const scheduleClose = useCallback(() => {
    closeTimeoutRef.current = setTimeout(() => setOpenMenu(null), 160);
  }, []);
  const cancelClose = useCallback(() => {
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
  }, []);

  const goToSection = (id: string) => {
    if (!isHomePage) {
      router.push("/#" + id);
      return;
    }
    const el = document.getElementById(id);
    if (el) {
      const y = el.getBoundingClientRect().top + window.scrollY - 64;
      window.scrollTo({ top: y, behavior: reducedMotion() ? "instant" : "smooth" });
    }
  };

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-transform duration-300 ease-out motion-reduce:transition-none",
        hidden && !openMenu && !menuOpen && "-translate-y-full",
      )}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpenMenu(null);
      }}
    >
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 border-b bg-background/80 backdrop-blur-lg transition-[opacity,border-color] duration-200 motion-reduce:transition-none",
          isScrolled || openMenu ? "border-border/60 opacity-100" : "border-transparent opacity-0",
        )}
      />

      <div
        className={cn(
          "relative mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-5 sm:px-8",
          isHomePage && reveal.enter,
        )}
      >
        <Link
          href="/"
          onClick={(e) => {
            if (isHomePage) {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: reducedMotion() ? "instant" : "smooth" });
            }
          }}
          className="flex shrink-0 items-center gap-2 rounded-md text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          <Logo size={20} aria-hidden="true" />
          <span className="font-inter text-[17px] font-black tracking-tight">Scorpio</span>
        </Link>

        <nav
          aria-label="Main"
          className="hidden items-center lg:flex"
          onMouseLeave={scheduleClose}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setOpenMenu(null);
          }}
        >
          {navItems.map((item) => {
            const active = openMenu === item.id || (!openMenu && currentNav === item.id);
            const tone = active ? "text-foreground" : "text-muted-foreground hover:text-foreground";

            if (!item.menu) {
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  onMouseEnter={() => setOpenMenu(null)}
                  aria-current={currentNav === item.id ? "page" : undefined}
                  className={cn(linkClass, tone)}
                >
                  {item.label}
                </Link>
              );
            }

            const isOpen = openMenu === item.id;
            return (
              <div
                key={item.id}
                className="relative"
                onMouseEnter={() => {
                  cancelClose();
                  setOpenMenu(item.id);
                }}
              >
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={`${item.id}-menu`}
                  onClick={() => setOpenMenu(isOpen ? null : item.id)}
                  className={cn(linkClass, tone)}
                >
                  {item.label}
                  <ClickIcon
                    icon={AnimatedChevronDown}
                    aria-hidden="true"
                    className={cn(
                      "size-3.5 opacity-60 transition-transform duration-200",
                      isOpen && "rotate-180",
                    )}
                  />
                </button>

                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      id={`${item.id}-menu`}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
                      className="absolute left-0 top-full pt-2"
                    >
                      <ul
                        role="list"
                        className="w-72 list-none rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lg shadow-black/5"
                      >
                        {item.menu.map((entry) => {
                          const body = (
                            <>
                              <span className="block text-sm font-medium text-foreground">
                                {entry.label}
                              </span>
                              <span className="block text-[13px] text-muted-foreground">
                                {entry.desc}
                              </span>
                            </>
                          );
                          const cls =
                            "block w-full rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none";
                          return (
                            <li key={entry.label}>
                              {entry.href ? (
                                <Link
                                  href={entry.href}
                                  onClick={() => setOpenMenu(null)}
                                  className={cls}
                                >
                                  {body}
                                </Link>
                              ) : (
                                <button
                                  type="button"
                                  className={cls}
                                  onClick={() => {
                                    setOpenMenu(null);
                                    goToSection(entry.target!);
                                  }}
                                >
                                  {body}
                                </button>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <ModeToggle />
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="hidden h-9 px-3 text-muted-foreground hover:bg-transparent hover:text-foreground min-[380px]:inline-flex"
          >
            <Link href="/login" prefetch={false}>
              Log in
            </Link>
          </Button>
          <Button asChild size="sm" className="h-9 rounded-full px-4">
            <Link href="/signup" prefetch={false}>
              Sign up
            </Link>
          </Button>

          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
                <ClickIcon icon={AnimatedMenu} className="size-4" />
              </Button>
            </SheetTrigger>

            <SheetContent
              side="right"
              hideClose
              aria-describedby={undefined}
              className="flex h-full w-full max-w-[320px] flex-col gap-0 border-l border-border bg-background p-0 lg:hidden"
            >
              <div className="flex h-14 items-center justify-between border-b border-border px-5">
                <SheetTitle className="flex items-center gap-2">
                  <Logo size={18} aria-hidden="true" />
                  <span className="font-inter text-base font-black tracking-tight">Scorpio</span>
                </SheetTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setMenuOpen(false)}
                  aria-label="Close menu"
                >
                  <ClickIcon icon={AnimatedX} className="size-4" />
                </Button>
              </div>

              <nav
                aria-label="Main"
                className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-5"
              >
                <ul role="list" className="list-none">
                  {[
                    { label: "Study", href: "/lessons" },
                    { label: "Test Raise", href: "/ai" },
                    { label: "Pricing", href: "/pricing" },
                  ].map((l) => (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        onClick={() => setMenuOpen(false)}
                        aria-current={pathname.startsWith(l.href) ? "page" : undefined}
                        className={cn(
                          "block rounded-lg px-3 py-2.5 text-[15px] font-medium transition-colors hover:bg-muted",
                          pathname.startsWith(l.href) ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>

                {[
                  { title: "Platform", items: platformItems },
                  { title: "Resources", items: resourcesItems },
                ].map((group) => (
                  <div key={group.title}>
                    <p className="px-3 pb-1.5 text-xs font-medium text-muted-foreground/70">
                      {group.title}
                    </p>
                    <ul role="list" className="list-none">
                      {group.items.map((entry) => {
                        const cls =
                          "block w-full rounded-lg px-3 py-2 text-left text-[15px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";
                        return (
                          <li key={entry.label}>
                            {entry.href ? (
                              <Link
                                href={entry.href}
                                onClick={() => setMenuOpen(false)}
                                className={cls}
                              >
                                {entry.label}
                              </Link>
                            ) : (
                              <button
                                type="button"
                                className={cls}
                                onClick={() => {
                                  setMenuOpen(false);
                                  goToSection(entry.target!);
                                }}
                              >
                                {entry.label}
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </nav>

              <div className="grid grid-cols-2 gap-2 border-t border-border p-4">
                <Button asChild variant="secondary" className="rounded-full">
                  <Link href="/login" prefetch={false} onClick={() => setMenuOpen(false)}>
                    Log in
                  </Link>
                </Button>
                <Button asChild className="rounded-full">
                  <Link href="/signup" prefetch={false} onClick={() => setMenuOpen(false)}>
                    Sign up
                  </Link>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
