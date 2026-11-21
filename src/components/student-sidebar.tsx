"use client";

import { GraduationCap } from "lucide-react";
import { AppSidebar, NavSection } from "./app-sidebar";
import { NAV_ICONS } from "./nav-icons";

// Five pages, one question each: what now (Home), what's due (Assignments), how did I do
// (Grades), my study tools (Study), help if I want it (Raise). `match` lists the routes each
// page groups; the Study tabs live in components/student/section-tabs.tsx.
const navSections: NavSection[] = [
  {
    items: [
      { href: "/student", label: "Home", icon: NAV_ICONS.home },
      {
        href: "/student/assignments",
        label: "Assignments",
        icon: NAV_ICONS.assignments,
        match: ["/student/assignment-view"],
      },
      {
        href: "/student/grades",
        label: "Grades",
        icon: NAV_ICONS.grading,
        match: ["/student/submissions"],
      },
      {
        href: "/student/notebook",
        label: "Study",
        icon: NAV_ICONS.study,
        match: ["/student/vault", "/student/resources"],
      },
    ],
  },
  {
    // Raise sits apart from the everyday tools: coursework never requires it.
    label: "Optional help",
    items: [{ href: "/student/tutor", label: "Raise", icon: NAV_ICONS.raise }],
  },
  {
    placement: "bottom",
    items: [{ href: "/student/sustainability", label: "Green Impact", icon: NAV_ICONS.impact }],
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
