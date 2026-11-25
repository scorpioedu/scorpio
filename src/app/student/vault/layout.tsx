import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Formula vault",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
