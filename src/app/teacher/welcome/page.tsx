import { Metadata } from "next";
import WelcomeClient from "./page-client";

export const metadata: Metadata = {
  title: "Get started",
};

export default function Page() {
  return <WelcomeClient />;
}
