import { redirect } from "next/navigation";

// Study > Guides was renamed Lessons, which then merged into Study; old links and bookmarks land there.
export default function Page() {
  redirect("/student/study");
}
