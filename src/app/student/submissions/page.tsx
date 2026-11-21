import { redirect } from "next/navigation";

// Submitted work lives on Grades now (it lists "Awaiting grade" rows too). Old links land there.
export default function SubmissionsPage() {
  redirect("/student/grades");
}
