import { Metadata } from "next";
import TeacherDashboard from "./page-client";

export const metadata: Metadata = {
  title: "Home",
};

export default function Page() {
  return <TeacherDashboard />;
}
