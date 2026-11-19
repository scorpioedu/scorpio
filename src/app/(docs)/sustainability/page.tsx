import { Metadata } from "next";
import SustainabilityContent from "@/components/sustainability-content";

export const metadata: Metadata = {
  title: "Sustainability",
  description: "How Scorpio estimates the energy, water, and paper impact of AI hints and digital assignments, and what we do to keep it low.",
};

export default function SustainabilityPage() {
  return <SustainabilityContent />;
}
