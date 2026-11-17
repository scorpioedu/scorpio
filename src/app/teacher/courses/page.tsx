import { Metadata } from "next";
import CoursesClient from "./page-client";

export const metadata: Metadata = {
  title: "Courses",
};

export default function Page() {
  return <CoursesClient />;
}
