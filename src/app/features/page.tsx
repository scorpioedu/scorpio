import { redirect } from "next/navigation";

// The old Features page led with the AI assistant and was linked from nowhere. What Scorpio does is
// on the home page now ("How it works"), so this address sends visitors there. The earlier page is
// in git history if it is wanted back.
export default function FeaturesPage() {
  redirect("/#features");
}
