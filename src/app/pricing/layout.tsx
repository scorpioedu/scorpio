import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Scorpio is free for every teacher. AI runs on a prepaid balance charged at Google's exact cost, with $1 free every month.",
};

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
