import { LessonsFrame } from "@/components/lessons/lessons-ui";

// The site header and footer stay mounted while moving between lessons; only the page body changes.
export default function LessonsLayout({ children }: { children: React.ReactNode }) {
  return <LessonsFrame>{children}</LessonsFrame>;
}
