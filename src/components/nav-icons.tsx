import {
  BookOpen,
  Building2,
  ClipboardCheck,
  ClipboardList,
  House,
  Leaf,
  Route,
  Users,
} from "lucide-react";
import { RaiseLogo } from "./ui/raise-logo";

function RaiseIcon({ className }: { className?: string }) {
  return <RaiseLogo size={20} strokeWidth={2} className={className} />;
}

/**
 * One icon per page, used wherever the page is named: the teacher and student sidebars, the
 * Guide on each Home page, and the help chat's quick links. Assignments (a list to do)
 * and Grading/Grades (the same clipboard, checked) are meant to read as a pair.
 */
export const NAV_ICONS = {
  home: House,
  course: Route,
  assignments: ClipboardList,
  grading: ClipboardCheck,
  classes: Users,
  study: BookOpen,
  raise: RaiseIcon,
  department: Building2,
  impact: Leaf,
} satisfies Record<string, React.ComponentType<{ className?: string }>>;
