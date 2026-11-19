"use client";

import {
  LayoutDashboard,
  FileText,
  Users,
  ChartColumnBig,
  Building2,
  Route,
  Presentation,
} from "lucide-react";
import { AppSidebar, type AppSidebarProps, type NavSection } from "./app-sidebar";

// Five pages for the teaching loop; department and sustainability sit at the bottom.
// `match` lists the routes each page groups, so the item stays active on them
// (the in-page tabs for those groups live in components/teacher/section-tabs.tsx).
const navSections: NavSection[] = [
  {
    items: [
      { href: "/teacher", label: "Home", icon: LayoutDashboard },
      { href: "/teacher/courses", label: "Course", icon: Route },
      {
        href: "/teacher/assignments",
        label: "Assignments",
        icon: FileText,
        match: ["/teacher/waypoints", "/teacher/create", "/teacher/assignment-view"],
      },
      {
        href: "/teacher/grades",
        label: "Grading",
        icon: ChartColumnBig,
        match: ["/teacher/insights", "/teacher/submission"],
      },
      {
        href: "/teacher/students",
        label: "Classes",
        icon: Users,
        match: ["/teacher/uploads", "/teacher/vault"],
      },
    ],
  },
  {
    placement: "bottom",
    items: [
      { href: "/teacher/network", label: "Department", icon: Building2 },
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
