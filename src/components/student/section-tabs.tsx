"use client";

import { RouteTabs } from "@/components/teacher/section-tabs";

// Pages the student sidebar groups under one item. Each tab keeps its own route, so old links
// keep working. Keep in sync with `match` in student-sidebar.tsx.
export const STUDENT_SECTIONS = {
  study: {
    label: "Study",
    tabs: [
      { href: "/student/lessons", label: "Lessons" },
      { href: "/student/notebook", label: "Notebook" },
      { href: "/student/vault", label: "Formula vault" },
      { href: "/student/resources", label: "Resources" },
    ],
  },
} as const;

export type StudentSection = keyof typeof STUDENT_SECTIONS;

export function StudentSectionTabs({ section }: { section: StudentSection }) {
  const { label, tabs } = STUDENT_SECTIONS[section];
  return <RouteTabs label={label} tabs={tabs} />;
}
