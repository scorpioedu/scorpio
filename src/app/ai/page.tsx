import type { Metadata } from "next";
import { TryAiClient } from "./try-ai-client";

export const metadata: Metadata = {
  title: "Try Raise",
  description:
    "Ask Raise, Scorpio's physics tutor, a question. It guides you with hints and questions instead of handing over the answer.",
};

// RAISE_DIAGRAMS is the same switch Raise uses (src/lib/ai/tutor.ts). Read it per request, so switching RAISE_DIAGRAMS needs no rebuild.
export const dynamic = "force-dynamic";

export default function AIPage() {
  return <TryAiClient diagrams={process.env.RAISE_DIAGRAMS === "on"} />;
}
