import { permanentRedirect } from "next/navigation";

// Study's public page is the lessons hub now: every topic's lesson with its practice problems.
// /study stays as an address (links and bookmarks) and sends visitors there for good.
export default function StudyPage() {
  permanentRedirect("/lessons");
}
