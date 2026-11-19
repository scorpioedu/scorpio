import { Metadata } from "next";
import { SectionTabs } from "@/components/teacher/section-tabs";

export const metadata: Metadata = {
  title: "Misconceptions",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionTabs section="grading" />
      {children}
    </>
  );
}
