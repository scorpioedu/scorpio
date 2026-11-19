import { Metadata } from "next";

export const metadata: Metadata = {
  title: "New assignment",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
