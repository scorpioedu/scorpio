"use client";

import {
  LayoutDashboard,
  FileText,
  GraduationCap,
  ChartColumnBig,
  NotebookPen,
  Leaf,
} from "lucide-react";
import { RaiseLogo } from "./ui/raise-logo";
import { AppSidebar, NavSection } from "./app-sidebar";

const SidebarRaiseIcon = ({ className }: { className?: string }) => (
  <RaiseLogo size={20} strokeWidth={2} className={className} />
);

// Five pages, one question each: what now (Home), what's due (Assignments), how did I do
// (Grades), my study tools (Study), help if I want it (Raise). `match` lists the routes each
// page groups; the Study tabs live in components/student/section-tabs.tsx.
const navSections: NavSection[] = [
  {
    items: [
      { href: "/student", label: "Home", icon: LayoutDashboard },
      {
        href: "/student/assignments",
        label: "Assignments",
        icon: FileText,
        match: ["/student/assignment-view"],
      },
      {
        href: "/student/grades",
        label: "Grades",
        icon: ChartColumnBig,
        match: ["/student/submissions"],
      },
      {
        href: "/student/notebook",
        label: "Study",
        icon: NotebookPen,
        match: ["/student/vault", "/student/resources"],
      },
    ],
  },
  {
    // Raise sits apart from the everyday tools: coursework never requires it.
    label: "Optional help",
    items: [{ href: "/student/tutor", label: "Raise", icon: SidebarRaiseIcon }],
  },
  {
    placement: "bottom",
    items: [{ href: "/student/sustainability", label: "Green Impact", icon: Leaf }],
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
