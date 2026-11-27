import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Demos",
  description:
    "Watch the Scorpio tour, open a sample teacher classroom, or try Raise, the optional assistant.",
};

export default function DemosLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
