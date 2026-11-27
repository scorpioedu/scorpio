import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Request Access",
  description:
    "Apply for classroom or department access to Scorpio: AP Physics problem sets checked by a person and marked as students work.",
};

export default function RequestAccessLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
