import { redirect } from "next/navigation";

// Review runs on the Study home now (its Review card), so there is one place to study. Old links and
// bookmarks land there.
export default function Page() {
  redirect("/student/study");
}
