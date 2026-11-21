"use client";

import { Presentation } from "lucide-react";
import { NAV_ICONS } from "./nav-icons";
import { AppSidebar, type AppSidebarProps, type NavSection } from "./app-sidebar";

// Five pages for the teaching loop; department and sustainability sit at the bottom.
// `match` lists the routes each page groups, so the item stays active on them
// (the in-page tabs for those groups live in components/teacher/section-tabs.tsx).
const navSections: NavSection[] = [
  {
    items: [
      { href: "/teacher", label: "Home", icon: NAV_ICONS.home },
      { href: "/teacher/courses", label: "Course", icon: NAV_ICONS.course },
      {
        href: "/teacher/assignments",
        label: "Assignments",
        icon: NAV_ICONS.assignments,
        match: ["/teacher/waypoints", "/teacher/create", "/teacher/assignment-view"],
      },
      {
        href: "/teacher/grades",
        label: "Grading",
        icon: NAV_ICONS.grading,
        match: ["/teacher/insights", "/teacher/submission"],
      },
      {
        href: "/teacher/students",
        label: "Classes",
        icon: NAV_ICONS.classes,
        match: ["/teacher/uploads", "/teacher/vault"],
      },
    ],
  },
  {
    placement: "bottom",
    items: [
      { href: "/teacher/network", label: "Department", icon: NAV_ICONS.department },
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
