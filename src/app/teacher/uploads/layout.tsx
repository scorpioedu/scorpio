import { Metadata } from "next";
import { SectionTabs } from "@/components/teacher/section-tabs";

export const metadata: Metadata = {
  title: "Uploads",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionTabs section="classes" />
      {children}
    </>
  );
}
