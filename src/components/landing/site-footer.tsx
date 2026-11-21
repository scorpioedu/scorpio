import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";

const footerLinks = [
  { label: "About", href: "/about" },
  { label: "Research", href: "/research" },
  { label: "Sustainability", href: "/sustainability" },
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
  { label: "Request access", href: "/request-access" },
  { label: "Contact", href: "/contact" },
];

/** The marketing footer, shared by the home page, Demos, Pricing and Features. */
export function SiteFooter({ reveal = false }: { reveal?: boolean }) {
  return (
    <footer className="border-t border-border">
      <div
        {...(reveal ? { "data-scroll-reveal": "" } : {})}
        className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-7 sm:px-8 lg:flex-row lg:items-center lg:justify-between"
      >
        <span className="flex items-center gap-2">
          <Logo size={18} aria-hidden="true" />
          <span className="font-inter font-black tracking-tight">Scorpio</span>
        </span>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
          {footerLinks.map(({ label, href }) => (
            <Link key={href} href={href} className="transition-colors hover:text-foreground">
              {label}
            </Link>
          ))}
          <Link
            href="https://github.com/RushilMahadevu/scorpio"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
          >
            GitHub <ArrowUpRight aria-hidden="true" className="size-3" />
          </Link>
        </nav>
        <p className="text-xs leading-relaxed text-muted-foreground">
          © {new Date().getFullYear()} Scorpio
          <br />
          Built by Rushil Mahadevu
        </p>
      </div>
    </footer>
  );
}
