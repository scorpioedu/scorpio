import { Suspense } from "react";
import { Metadata } from "next";
import CoursesClient from "./page-client";

export const metadata: Metadata = {
  title: "Course",
};

export default function Page() {
  // The client reads ?course=, ?tab= and ?assign= (useSearchParams needs a Suspense boundary).
  return (
    <Suspense>
      <CoursesClient />
    </Suspense>
  );
}
