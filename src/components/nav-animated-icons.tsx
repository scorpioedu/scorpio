"use client";

import type { ForwardRefExoticComponent, RefAttributes } from "react";
import type { IconHandle } from "@animateicons/react";
import { BookOpenIcon } from "@animateicons/react/lucide/book-open-icon";
import { Building2Icon } from "@animateicons/react/lucide/building-2-icon";
import { ClipboardCheckIcon } from "@animateicons/react/lucide/clipboard-check-icon";
import { ClipboardListIcon } from "@animateicons/react/lucide/clipboard-list-icon";
import { HandIcon } from "@animateicons/react/lucide/hand-icon";
import { HouseIcon } from "@animateicons/react/lucide/house-icon";
import { LeafIcon } from "@animateicons/react/lucide/leaf-icon";
import { RouteIcon } from "@animateicons/react/lucide/route-icon";
import { UsersIcon } from "@animateicons/react/lucide/users-icon";
import type { NAV_ICONS } from "./nav-icons";

/**
 * An icon that plays a short animation. Given a ref it stops reacting to its own hover and waits
 * for `startAnimation()`, so the button around it decides when it plays (see `useIconHover`).
 */
export type AnimatedIcon = ForwardRefExoticComponent<
  { size?: number; className?: string } & RefAttributes<IconHandle>
>;

/**
 * The animated twin of each icon in NAV_ICONS (same Lucide shape), for the sidebars. Places that
 * only name a page (the Home guide, the help chat's quick links) keep the still ones.
 */
export const NAV_ANIMATED_ICONS = {
  home: HouseIcon,
  course: RouteIcon,
  assignments: ClipboardListIcon,
  grading: ClipboardCheckIcon,
  classes: UsersIcon,
  study: BookOpenIcon,
  raise: HandIcon,
  department: Building2Icon,
  impact: LeafIcon,
} satisfies Record<keyof typeof NAV_ICONS, AnimatedIcon>;
