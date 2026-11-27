import { Metadata } from "next";
import AboutClient from "./about-client";

export const metadata: Metadata = {
  title: "About",
  description:
    "Learn about the mission behind Scorpio: AP Physics lessons and problem sets checked by a person, marked as students work, with AI kept optional and in the teacher's hands.",
};

export default function AboutPage() {
  return <AboutClient />;
}
