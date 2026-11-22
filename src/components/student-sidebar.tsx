"use client";

import { GraduationCap } from "lucide-react";
import { AppSidebar, NavSection } from "./app-sidebar";
import { NAV_ICONS } from "./nav-icons";

// Five pages, one question each: what now (Home), what's due (Assignments), how did I do
// (Grades), my study tools (Study), help if I want it (Raise). `match` lists the routes each
// page groups; the Study tabs (Lessons first) live in components/student/section-tabs.tsx.
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
        href: "/student/lessons",
        label: "Study",
        icon: NAV_ICONS.study,
        match: ["/student/guides", "/student/notebook", "/student/vault", "/student/resources", "/student/courses"],
      },
    ],
  },
  {
    // Raise sits at the bottom, apart from the everyday tools (coursework never requires it),
    // just above Green Impact, which shows what using it costs.
    placement: "bottom",
    items: [
      { href: "/student/tutor", label: "Raise", icon: NAV_ICONS.raise },
      { href: "/student/sustainability", label: "Green Impact", icon: NAV_ICONS.impact },
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
