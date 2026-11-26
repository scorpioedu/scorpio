import type { Metadata } from "next";

export const metadata: Metadata = {
  // A string title here would stop the root "%s • Scorpio" template reaching the pages below.
  title: { default: "Study", template: "%s • Scorpio" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
