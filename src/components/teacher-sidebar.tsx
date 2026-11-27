"use client";

import { Presentation } from "lucide-react";
import { NAV_ANIMATED_ICONS } from "./nav-animated-icons";
import { AppSidebar, type AppSidebarProps, type NavSection } from "./app-sidebar";

// Five pages for the teaching loop, then Raise; department and sustainability sit at the bottom.
// `match` lists the routes each page groups, so the item stays active on them
// (the in-page tabs for those groups live in components/teacher/section-tabs.tsx).
const navSections: NavSection[] = [
  {
    items: [
      { href: "/teacher", label: "Home", icon: NAV_ANIMATED_ICONS.home },
      { href: "/teacher/courses", label: "Course", icon: NAV_ANIMATED_ICONS.course },
      {
        href: "/teacher/assignments",
        label: "Assignments",
        icon: NAV_ANIMATED_ICONS.assignments,
        match: ["/teacher/waypoints", "/teacher/create", "/teacher/assignment-view"],
      },
      {
        href: "/teacher/grades",
        label: "Grading",
        icon: NAV_ANIMATED_ICONS.grading,
        match: ["/teacher/insights", "/teacher/submission"],
      },
      {
        href: "/teacher/students",
        label: "Classes",
        icon: NAV_ANIMATED_ICONS.classes,
        match: ["/teacher/uploads", "/teacher/vault"],
      },
    ],
  },
  {
    // Teachers' Raise: full answers, practice sets and diagrams for lesson prep.
    label: "Assistant",
    items: [{ href: "/teacher/raise", label: "Raise", icon: NAV_ANIMATED_ICONS.raise }],
  },
  {
    placement: "bottom",
    items: [
      { href: "/teacher/network", label: "Department", icon: NAV_ANIMATED_ICONS.department },
      { dialog: "sustainability", label: "Sustainability" },
    ],
  },
];

export function TeacherSidebar({
  isCollapsed,
  onToggle,
  sample,
}: Pick<AppSidebarProps, "isCollapsed" | "onToggle" | "sample">) {
  return (
    <AppSidebar
      roleLabel="Teacher"
      roleIcon={Presentation}
      navSections={navSections}
      isCollapsed={isCollapsed}
      onToggle={onToggle}
      sample={sample}
    />
  );
}
