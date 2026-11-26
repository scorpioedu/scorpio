import { redirect } from "next/navigation";

// Study > Lessons merged into Study: every topic's lesson and practice are reached from the one
// map on /student/study. Old links and bookmarks land there.
export default function Page() {
  redirect("/student/study");
}
