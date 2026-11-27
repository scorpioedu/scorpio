import Link from "next/link";
import { ClickIcon } from "@/components/ui/click-icon";
import { ChevronLeftIcon as AnimatedChevronLeft } from "@animateicons/react/lucide/chevron-left-icon";
import { Logo } from "@/components/ui/logo";

/** Flowing field lines that bend toward a focal point, drawn once on the server. */
export function FieldLines({ flip }: { flip: boolean }) {
  const count = 44;
  const lines = Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    const y0 = 420 + t * 150;
    const bend = 60 + t * 170;
    const d = `M -20 ${y0 - 190 + t * 40} C 180 ${y0 - 150 - bend * 0.2}, 360 ${y0 - 70}, 560 ${y0 + bend}`;
    // Lines thicken in opacity toward the focal edge, fading out the far ones.
    const opacity = 0.14 + (1 - Math.abs(t - 0.35)) * 0.5;
    return <path key={i} d={d} strokeOpacity={opacity} />;
  });
  return (
    <svg
      viewBox="0 0 540 800"
      preserveAspectRatio="xMidYMid slice"
      className={`absolute inset-0 h-full w-full ${flip ? "-scale-x-100" : ""} text-primary [mask-image:linear-gradient(to_bottom,transparent,black_35%)]`}
      fill="none"
      stroke="currentColor"
      strokeWidth="0.8"
      aria-hidden="true"
    >
      {lines}
    </svg>
  );
}

/** `side` is where the brand panel sits; login and sign up use opposite sides so they read as different pages. */
export function AuthSplit({
  children,
  wide = false,
  side = "right",
}: {
  children: React.ReactNode;
  wide?: boolean;
  side?: "left" | "right";
}) {
  const right = side === "right";
  return (
    <div className="min-h-dvh grid lg:grid-cols-2 bg-background">
      {/* Brand panel */}
      <aside
        className={`relative hidden lg:flex flex-col overflow-hidden border-border/60 bg-muted/20 p-10 ${right ? "border-l lg:order-2" : "border-r"}`}
      >
        <Link href="/" className="relative z-10 flex items-center gap-2.5 w-fit">
          <Logo size={32} className="text-primary" />
          <span className="text-lg font-semibold tracking-tight">Scorpio</span>
        </Link>
        <FieldLines flip={right} />
      </aside>

      {/* Form panel */}
      <main className="relative flex flex-col">
        <div className="flex items-center justify-between p-6 lg:p-8">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground/80 hover:text-foreground transition-colors"
          >
            <ClickIcon icon={AnimatedChevronLeft} className="h-4 w-4" />
            Home
          </Link>
          <Link href="/" className="lg:hidden" aria-label="Scorpio home">
            <Logo size={28} className="text-primary" />
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center px-6 pb-16 lg:px-16">
          <div className={wide ? "w-full max-w-lg" : "w-full max-w-sm"}>{children}</div>
        </div>
      </main>
    </div>
  );
}
