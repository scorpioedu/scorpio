import { Metadata } from "next";
import { SectionTabs } from "@/components/teacher/section-tabs";

export const metadata: Metadata = {
  title: "Assignments",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionTabs section="assignments" />
      {children}
    </>
  );
}
