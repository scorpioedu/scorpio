import { redirect } from "next/navigation";

// Teachers often say "go to scorpioedu.org/join". Class links live at /join/class/{code}; the bare
// address sends students to sign-up, where they can type the class code.
export default function JoinPage() {
  redirect("/signup?role=student");
}
