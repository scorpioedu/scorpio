import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Demos",
  description: "Watch the Scorpio tour, open a sample teacher classroom, or test Raise.",
};

export default function DemosLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
