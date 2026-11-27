import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign Up",
  description:
    "Create a free Scorpio account: AP Physics lessons and practice with every answer checked, and your class's assignments in one place.",
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
