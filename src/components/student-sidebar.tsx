"use client";

import {
  LayoutDashboard,
  FileText,
  FileCheck,
  Library,
  GraduationCap,
  PackageOpen,
  ChartColumnBig,
  NotebookPen,
  Leaf,
} from "lucide-react";
import { RaiseLogo } from "./ui/raise-logo";
import { AppSidebar, NavSection } from "./app-sidebar";

const SidebarRaiseIcon = ({ className }: { className?: string }) => (
  <RaiseLogo size={20} strokeWidth={2} className={className} />
);

const navSections: NavSection[] = [
  {
    label: "Overview",
    items: [{ href: "/student", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Coursework",
    items: [
      { href: "/student/assignments", label: "Assignments", icon: FileText },
      { href: "/student/submissions", label: "My Submissions", icon: FileCheck },
      { href: "/student/grades", label: "Grades", icon: ChartColumnBig },
    ],
  },
  {
    label: "Study",
    items: [
      { href: "/student/notebook", label: "Notebook", icon: NotebookPen },
      { href: "/student/vault", label: "Equation Vault", icon: PackageOpen },
      { href: "/student/resources", label: "Resources", icon: Library },
    ],
  },
  {
    // Raise sits apart from the everyday tools: coursework never requires it.
    label: "Optional help",
    items: [{ href: "/student/tutor", label: "Raise", icon: SidebarRaiseIcon }],
  },
  {
    label: "Impact",
    items: [
      { href: "/student/sustainability", label: "Green Impact", icon: Leaf },
    ],
  },
];

export function StudentSidebar({
  isCollapsed,
  onToggle,
}: {
  isCollapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <AppSidebar
      roleLabel="Student"
      roleIcon={GraduationCap}
      navSections={navSections}
      isCollapsed={isCollapsed}
      onToggle={onToggle}
    />
  );
}
