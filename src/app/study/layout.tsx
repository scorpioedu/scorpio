import { LessonsFrame } from "@/components/lessons/lessons-ui";

// /study and shared progress links use the public site's header and footer, like the lessons.
export default function StudyLayout({ children }: { children: React.ReactNode }) {
  return <LessonsFrame>{children}</LessonsFrame>;
}
