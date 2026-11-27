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
        <aside
          aria-label="AI in your class"
          className="mb-8 rounded-xl border bg-muted/40 px-4 py-3.5 text-sm"
        >
          <p className="font-medium text-foreground">
            Your teacher has turned on AI features for this class
          </p>
          <p className="mt-1 text-muted-foreground">
            It stays off for students unless a teacher turns it on, and using Raise is always your
            choice. Nothing in your coursework needs it. This page details what each hint costs in
            energy and water.
          </p>
        </aside>
        <SustainabilityContent />
      </div>
    </StudentAiGate>
  );
}
