"use client";

import { GraduationCap } from "lucide-react";
import { AppSidebar, NavSection } from "./app-sidebar";
import { NAV_ICONS } from "./nav-icons";

// Five pages, one question each: what now (Home), what's due (Assignments), how did I do
// (Grades), my study tools (Study), help if I want it (Raise). `match` lists the routes each
// page groups; Study lists its pages (the Study map first) as children that fold open in the
// sidebar.
export const studentNavSections: NavSection[] = [
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
        href: "/student/study",
        label: "Study",
        icon: NAV_ICONS.study,
        children: [
          // The one map of every course, with review run on it. The lesson reader
          // (/student/courses/…, where a topic's practice also lives), practice runs and progress
          // are all part of it, and old Lessons, Guides and Review links redirect here.
          {
            href: "/student/study",
            label: "Study",
            match: ["/student/courses", "/student/lessons", "/student/guides"],
          },
          { href: "/student/notebook", label: "Notebook" },
          { href: "/student/vault", label: "Formula vault" },
          { href: "/student/resources", label: "Resources" },
        ],
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
      navSections={studentNavSections}
      isCollapsed={isCollapsed}
      onToggle={onToggle}
    />
  );
}
