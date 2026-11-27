"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { PlaneLanding } from "lucide-react";
import { useIconHover } from "@animateicons/react";
import { LeafIcon } from "@animateicons/react/lucide/leaf-icon";
import { MenuIcon } from "@animateicons/react/lucide/menu-icon";
import { PanelLeftCloseIcon } from "@animateicons/react/lucide/panel-left-close-icon";
import { PanelLeftOpenIcon } from "@animateicons/react/lucide/panel-left-open-icon";
import { XIcon } from "@animateicons/react/lucide/x-icon";
import type { AnimatedIcon } from "@/components/nav-animated-icons";
import { CompassLogo } from "@/components/ui/compass-logo";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/contexts/auth-context";
import {
  AnimatedSidebar,
  AnimatedSidebarClose,
  AnimatedSidebarContent,
  AnimatedSidebarFooter,
  AnimatedSidebarGroup,
  AnimatedSidebarGroupContent,
  AnimatedSidebarGroupLabel,
  AnimatedSidebarHeader,
  AnimatedSidebarMenu,
  AnimatedSidebarMenuButton,
  type AnimatedSidebarMenuButtonProps,
  AnimatedSidebarMenuItem,
  AnimatedSidebarMenuSub,
  AnimatedSidebarMenuSubButton,
  AnimatedSidebarMenuSubItem,
  AnimatedSidebarProvider,
  AnimatedSidebarRail,
  AnimatedSidebarTrigger,
  useAnimatedSidebar,
} from "@/components/motion/animated-sidebar";

const SustainabilityContent = dynamic(() => import("@/components/sustainability-content"), {
  loading: () => (
    <p role="status" className="text-muted-foreground">
      Loading sustainability…
    </p>
  ),
});

const SettingsDialog = dynamic(() =>
  import("@/components/settings-dialog").then((module) => module.SettingsDialog),
);

interface NavLink {
  href: string;
  label: string;
  icon: AnimatedIcon;
  badge?: string;
  /** Other route prefixes that also mark this item active (pages grouped under it). */
  match?: string[];
  /** Pages listed under this item. The item then folds open instead of linking. */
  children?: NavChild[];
}

interface NavChild {
  href: string;
  label: string;
  /** Other route prefixes that also mark this child active. */
  match?: string[];
}

type NavItem = NavLink | { dialog: "sustainability"; label: string };

export interface NavSection {
  /** Omit for an unlabeled group. */
  label?: string;
  items: NavItem[];
  /** "bottom" pins the group to the bottom of the nav, above the profile footer. */
  placement?: "bottom";
}

const ROOT_ROUTES = new Set(["/teacher", "/student", "/admin"]);

function routeMatches(path: string, href: string): boolean {
  if (ROOT_ROUTES.has(href)) return path === href;
  return path === href || path.startsWith(href + "/");
}

function isNavLinkActive(item: NavLink | NavChild, path: string | null): boolean {
  if (!path) return false;
  const own = [item.href, ...(item.match ?? [])].some((href) => routeMatches(path, href));
  if (own) return true;
  return "children" in item && !!item.children?.some((child) => isNavLinkActive(child, path));
}

export interface AppSidebarProps {
  roleLabel: string;
  roleIcon?: React.ComponentType<{ className?: string }>;
  navSections: NavSection[];
  isCollapsed: boolean;
  onToggle: () => void;
  sample?: {
    activeHref: string;
    onSelect: (href: string) => void;
  };
}

/**
 * A sidebar row whose icon plays its animation when the row is clicked. The row, not
 * the icon, is the trigger, so the whole button reacts.
 */
function NavMenuButton({
  icon: Icon,
  onClick,
  onMouseEnter,
  onMouseLeave,
  ...props
}: Omit<AnimatedSidebarMenuButtonProps, "icon"> & {
  icon: AnimatedIcon;
  ref?: React.Ref<HTMLButtonElement | HTMLAnchorElement>;
}) {
  const { ref, triggerProps } = useIconHover({ trigger: "click" });
  return (
    <AnimatedSidebarMenuButton
      {...props}
      icon={<Icon ref={ref} size={20} />}
      onClick={(event) => {
        onClick?.(event);
        triggerProps.onClick?.(event);
      }}
      onMouseEnter={(event) => {
        onMouseEnter?.(event);
        triggerProps.onMouseEnter?.(event);
      }}
      onMouseLeave={(event) => {
        onMouseLeave?.(event);
        triggerProps.onMouseLeave?.(event);
      }}
    />
  );
}

/** The collapse/expand button in the sidebar footer. */
function CollapseTrigger({ isCollapsed }: { isCollapsed: boolean }) {
  const { ref, triggerProps } = useIconHover({ trigger: "click" });
  const Icon = isCollapsed ? PanelLeftOpenIcon : PanelLeftCloseIcon;
  return (
    <AnimatedSidebarTrigger
      {...triggerProps}
      className="size-9 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
      aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
    >
      <Icon ref={ref} size={18} />
    </AnimatedSidebarTrigger>
  );
}

/** The menu button in the mobile top bar. */
function MobileMenuTrigger() {
  const { ref, triggerProps } = useIconHover({ trigger: "click" });
  return (
    <AnimatedSidebarTrigger
      {...triggerProps}
      className="size-9 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
      aria-label="Open sidebar"
    >
      <MenuIcon ref={ref} size={20} />
    </AnimatedSidebarTrigger>
  );
}

/** The close button at the top of the mobile drawer. */
function MobileCloseButton() {
  const { ref, triggerProps } = useIconHover({ trigger: "click" });
  return (
    <AnimatedSidebarClose
      {...triggerProps}
      className="ml-auto text-muted-foreground hover:text-foreground hover:bg-muted md:hidden"
    >
      <XIcon ref={ref} size={18} aria-hidden="true" />
    </AnimatedSidebarClose>
  );
}

function SustainabilityDialogItem({ label }: { label: string }) {
  const [open, setOpen] = useState(false);
  const context = useAnimatedSidebar();

  const handleOpen = () => {
    if (context.isMobile) {
      context.setOpenMobile(false);
    }
    setOpen(true);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <AnimatedSidebarMenuItem>
        <DialogTrigger asChild>
          <NavMenuButton icon={LeafIcon} onSelect={handleOpen} closeOnSelect={false}>
            {label}
          </NavMenuButton>
        </DialogTrigger>
      </AnimatedSidebarMenuItem>
      <DialogContent
        aria-describedby={undefined}
        className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl"
      >
        <DialogTitle className="border-b px-5 py-4 pr-12 text-lg font-bold">{label}</DialogTitle>
        <div
          role="region"
          aria-label="Sustainability information"
          tabIndex={0}
          className="min-h-0 space-y-12 overflow-y-auto overscroll-contain px-4 py-6 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-8"
        >
          <SustainabilityContent />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SidebarFooterSection({
  roleLabel,
  isCollapsed,
}: {
  roleLabel: string;
  isCollapsed: boolean;
}) {
  const { profile, role, user } = useAuth();
  const autoRedirect = profile?.preferences?.autoRedirectPortal ?? true;

  const displayName = profile?.displayName || user?.displayName || "";
  const email = user?.email || profile?.email || "";

  const initials = (() => {
    if (displayName && typeof displayName === "string" && displayName.trim()) {
      return displayName
        .split(" ")
        .filter(Boolean)
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    if (email && typeof email === "string" && email.trim()) {
      return email.slice(0, 2).toUpperCase();
    }
    return roleLabel.slice(0, 2).toUpperCase();
  })();

  return (
    <AnimatedSidebarFooter className="gap-2.5 border-t border-border/30 p-3">
      {/* Landing page link for non-student roles. Hidden while Auto-Portal Redirect is on (the
          default): the landing page would send them straight back, and Settings is where to change it. */}
      {role !== "student" && !autoRedirect && (
        <TooltipProvider>
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <Link
                href="/"
                className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors group-data-[state=collapsed]/sidebar:justify-center"
              >
                <PlaneLanding className="size-4.5 shrink-0" />
                <span className="truncate group-data-[state=collapsed]/sidebar:hidden">
                  Landing Page
                </span>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs font-medium">
              Visit Landing Page
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* User profile card */}
      <div className="flex items-center gap-3 rounded-xl p-1.5 transition-colors hover:bg-muted/40 group-data-[state=collapsed]/sidebar:justify-center">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary text-xs font-bold border border-primary/20">
          {initials}
        </span>
        <div className="min-w-0 flex-1 group-data-[state=collapsed]/sidebar:hidden">
          <p className="truncate text-sm font-semibold text-foreground leading-tight">
            {displayName || roleLabel}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {email || `${roleLabel.toLowerCase()}@scorpio.edu`}
          </p>
        </div>
      </div>

      {/* Control row: Settings & Collapse Toggle */}
      <div className="flex items-center justify-between pt-1 border-t border-border/20 group-data-[state=collapsed]/sidebar:flex-col group-data-[state=collapsed]/sidebar:gap-2">
        <div className="flex items-center gap-1 group-data-[state=collapsed]/sidebar:flex-col">
          <SettingsDialog />
        </div>
        <CollapseTrigger isCollapsed={isCollapsed} />
      </div>
    </AnimatedSidebarFooter>
  );
}

export function AppSidebar({
  roleLabel,
  navSections,
  isCollapsed,
  onToggle,
  sample,
}: AppSidebarProps) {
  const pathname = usePathname();
  const currentPath = sample ? sample.activeHref : pathname;
  // Groups the user folded open or shut. Until they do, a group is open while one of its pages
  // is showing, so it unfolds by itself when you land on it.
  const [toggledGroups, setToggledGroups] = useState<Record<string, boolean>>({});

  return (
    <AnimatedSidebarProvider
      open={!isCollapsed}
      keyboardShortcut={!sample}
      onOpenChange={(nextOpen) => {
        if (nextOpen === isCollapsed) {
          onToggle();
        }
      }}
      className="flex-col md:flex-row min-h-0 shrink-0 w-full md:w-auto"
    >
      {/* Mobile top navigation header */}
      <div className="md:hidden flex h-14 w-full items-center justify-between px-4 border-b border-border/40 bg-background/80 backdrop-blur-md sticky top-0 z-30 shrink-0">
        <div className="flex items-center gap-2.5">
          <CompassLogo className="size-6 text-foreground" />
          <span className="font-inter font-black text-lg tracking-tight">Scorpio</span>
        </div>
        <MobileMenuTrigger />
      </div>

      {/* Main Animated Sidebar */}
      <AnimatedSidebar
        ariaLabel={`${roleLabel} workspace`}
        collapsible="icon"
        className="min-h-0"
        panelClassName={
          sample
            ? "static h-full border-border/40 bg-card"
            : "h-dvh border-border/40 bg-card/60 backdrop-blur-xl"
        }
      >
        {/* Minimal, clean top header without slop */}
        <AnimatedSidebarHeader className="p-4 pb-3">
          <div className="flex items-center gap-3 overflow-hidden px-1">
            <div className="flex size-8 shrink-0 items-center justify-center text-foreground">
              <CompassLogo className="size-6 text-foreground" />
            </div>
            <span className="truncate text-lg font-black tracking-tight font-inter text-foreground group-data-[state=collapsed]/sidebar:hidden">
              Scorpio
            </span>
            <MobileCloseButton />
          </div>
        </AnimatedSidebarHeader>

        <AnimatedSidebarContent className="px-2.5 py-2">
          {navSections.map((section, sectionIndex) => (
            <AnimatedSidebarGroup
              key={section.label ?? `section-${sectionIndex}`}
              className={section.placement === "bottom" ? "mt-auto py-1" : "py-1"}
            >
              {section.label && (
                <AnimatedSidebarGroupLabel>{section.label}</AnimatedSidebarGroupLabel>
              )}
              <AnimatedSidebarGroupContent>
                <AnimatedSidebarMenu>
                  {section.items.map((item) => {
                    if ("dialog" in item) {
                      return <SustainabilityDialogItem key={item.dialog} label={item.label} />;
                    }

                    const isActive = isNavLinkActive(item, currentPath);

                    if (item.children?.length) {
                      const isOpen = toggledGroups[item.href] ?? isActive;
                      return (
                        <AnimatedSidebarMenuItem key={item.href}>
                          <NavMenuButton
                            isActive={isActive}
                            ariaExpanded={isOpen}
                            icon={item.icon}
                            onSelect={() =>
                              setToggledGroups((current) => ({ ...current, [item.href]: !isOpen }))
                            }
                          >
                            {item.label}
                          </NavMenuButton>
                          <AnimatedSidebarMenuSub open={isOpen}>
                            {item.children.map((child) => (
                              <AnimatedSidebarMenuSubItem key={child.href}>
                                <AnimatedSidebarMenuSubButton
                                  href={sample ? undefined : child.href}
                                  isActive={isNavLinkActive(child, currentPath)}
                                  onSelect={sample ? () => sample.onSelect(child.href) : undefined}
                                  className="text-sm"
                                >
                                  {child.label}
                                </AnimatedSidebarMenuSubButton>
                              </AnimatedSidebarMenuSubItem>
                            ))}
                          </AnimatedSidebarMenuSub>
                        </AnimatedSidebarMenuItem>
                      );
                    }

                    return (
                      <AnimatedSidebarMenuItem key={item.href}>
                        <NavMenuButton
                          href={sample ? undefined : item.href}
                          isActive={isActive}
                          onSelect={sample ? () => sample.onSelect(item.href) : undefined}
                          icon={item.icon}
                          badge={
                            item.badge ? (
                              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                                {item.badge}
                              </span>
                            ) : undefined
                          }
                        >
                          {item.label}
                        </NavMenuButton>
                      </AnimatedSidebarMenuItem>
                    );
                  })}
                </AnimatedSidebarMenu>
              </AnimatedSidebarGroupContent>
            </AnimatedSidebarGroup>
          ))}
        </AnimatedSidebarContent>

        {sample ? (
          <AnimatedSidebarFooter className="gap-2.5 border-t border-border/30 p-3">
            <div className="flex items-center gap-3 rounded-xl p-1.5 transition-colors hover:bg-muted/40 group-data-[state=collapsed]/sidebar:justify-center">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-xs font-bold text-primary">
                MC
              </span>
              <div className="min-w-0 flex-1 group-data-[state=collapsed]/sidebar:hidden">
                <p className="truncate text-sm font-semibold text-foreground leading-tight">
                  Dr. Maya Chen
                </p>
                <p className="truncate text-xs text-muted-foreground">Sample teacher</p>
              </div>
            </div>

            <div className="hidden items-center justify-end border-t border-border/20 pt-1 md:flex group-data-[state=collapsed]/sidebar:justify-center">
              <CollapseTrigger isCollapsed={isCollapsed} />
            </div>
          </AnimatedSidebarFooter>
        ) : (
          <SidebarFooterSection roleLabel={roleLabel} isCollapsed={isCollapsed} />
        )}

        <AnimatedSidebarRail />
      </AnimatedSidebar>
    </AnimatedSidebarProvider>
  );
}
