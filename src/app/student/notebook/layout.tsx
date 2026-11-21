import { Metadata } from "next";
import { StudentSectionTabs } from "@/components/student/section-tabs";

export const metadata: Metadata = {
  title: "Notebook",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <StudentSectionTabs section="study" />
      {children}
    </>
  );
}
