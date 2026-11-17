"use client";

import {
  LayoutDashboard,
  FileText,
  Upload,
  Users,
  PlusCircle,
  ChartColumnBig,
  Building2,
  Waypoints,
  Route,
  PackageCheck,
  Presentation,
  Lightbulb,
} from "lucide-react";
import { AppSidebar, type AppSidebarProps, type NavSection } from "./app-sidebar";

// Ordered by what a teacher does most: plan and hand out work, see how it went, then the
// occasional school-wide setup.
const navSections: NavSection[] = [
  {
    label: "Overview",
    items: [{ href: "/teacher", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Teach",
    items: [
      { href: "/teacher/courses", label: "Courses", icon: Route },
      { href: "/teacher/assignments", label: "My Assignments", icon: FileText },
      { href: "/teacher/create", label: "Create Assignment", icon: PlusCircle },
      { href: "/teacher/waypoints", label: "Waypoints", icon: Waypoints },
    ],
  },
  {
    label: "Results",
    items: [
      { href: "/teacher/grades", label: "Gradebook", icon: ChartColumnBig },
      { href: "/teacher/insights", label: "Misconceptions", icon: Lightbulb },
      { href: "/teacher/students", label: "Students", icon: Users },
    ],
  },
  {
    label: "School",
    items: [
      { href: "/teacher/network", label: "Network", icon: Building2 },
      { href: "/teacher/uploads", label: "Resource Uploads", icon: Upload },
      { href: "/teacher/vault", label: "Vault Controls", icon: PackageCheck },
    ],
  },
  {
    label: "Impact",
    items: [{ dialog: "sustainability", label: "Sustainability" }],
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
