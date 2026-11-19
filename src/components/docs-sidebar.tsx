"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const groups = [
  {
    label: "Product",
    items: [
      { title: "About", href: "/about" },
      { title: "Research & Methodology", href: "/research" },
      { title: "Sustainability & Green AI", href: "/sustainability" },
    ],
  },
  {
    label: "Legal & support",
    items: [
      { title: "Privacy Policy", href: "/privacy" },
      { title: "Terms of Service", href: "/terms" },
      { title: "Contact Support", href: "/contact" },
    ],
  },
];

export function DocsSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Documentation" className="flex flex-col gap-7">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
            {group.label}
          </p>
          <div className="flex flex-col border-l border-border/60">
            {group.items.map((item) => {
              const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onNavigate={onNavigate}
                  aria-current={pathname === item.href ? "page" : undefined}
                  className={cn(
                    "-ml-px border-l py-1.5 pl-4 text-sm transition-colors",
                    isActive
                      ? "border-primary font-medium text-foreground"
                      : "border-transparent text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                  )}
                >
                  {item.title}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
