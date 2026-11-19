import { Metadata } from "next";
import { SectionTabs } from "@/components/teacher/section-tabs";

export const metadata: Metadata = {
  title: "Library",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionTabs section="assignments" />
      {children}
    </>
  );
}
