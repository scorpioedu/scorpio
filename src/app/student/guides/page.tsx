import { redirect } from "next/navigation";

// Study > Guides was renamed Lessons; old links and bookmarks land there.
export default function Page() {
  redirect("/student/lessons");
}
