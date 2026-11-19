import { Metadata } from "next";
import { SectionTabs } from "@/components/teacher/section-tabs";
import React from "react";

export const metadata: Metadata = {
  title: "Formula vault",
};

export default function VaultLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionTabs section="classes" />
      {children}
    </>
  );
}
