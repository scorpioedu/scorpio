import { Metadata } from "next";
import SustainabilityContent from "@/components/sustainability-content";
import { StudentAiGate } from "@/components/student/student-ai-gate";

export const metadata: Metadata = {
  title: "Sustainability",
  description:
    "How Scorpio estimates the energy, water, and paper impact of AI hints and digital assignments.",
};

export default function SustainabilityPage() {
  return (
    // The page accounts for what Raise hints cost, so it shows only where Raise is on.
    <StudentAiGate>
      <div className="mx-auto w-full max-w-3xl">
        <SustainabilityContent />
      </div>
    </StudentAiGate>
  );
}
