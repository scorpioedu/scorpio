// The hero's picture on /lessons: a real Study practice problem (topic 3.4) just after a wrong
// answer, drawn with the same look as the practice component, so the page shows the product
// itself. Static: nothing here is interactive or fetched. The mix-up comes from the misconception
// list the checker uses, so its wording never drifts from what students see.
import { ChevronDown, X } from "lucide-react";
import { misconceptionTag } from "../../../functions/src/misconceptions";
import { cn } from "@/lib/utils";

const STEM =
  "A snowboarder starts from rest at a height of 2.0 m on the gently sloped left wall of a frictionless half-pipe. The right wall is much steeper. How high on the right wall does the snowboarder rise before coming to rest?";

const OPTIONS: { text: string; state?: "picked" | "key" }[] = [
  {
    text: "Less than 2.0 m, because the steeper wall slows the snowboarder down more quickly.",
    state: "picked",
  },
  {
    text: "2.0 m, because the mechanical energy of the snowboarder-Earth system stays constant.",
    state: "key",
  },
  { text: "More than 2.0 m, because the steeper wall is a shorter path to climb." },
];

export function PracticePreview({ className }: { className?: string }) {
  const mixUp = misconceptionTag("energy-not-conserved");
  return (
    <div
      role="img"
      aria-label="A Study practice problem on conservation of energy, answered wrong, with the right answer shown and the common mix-up behind the wrong one named."
      className={cn(
        // Below the desktop split it stacks under the words: held to the problem and its first
        // answers, faded at the foot, so the first screen ends on a clear bleed, not a sliced card.
        "relative rounded-2xl border border-border bg-card p-4 shadow-xl shadow-foreground/[0.04] max-lg:max-h-[24rem] max-lg:overflow-hidden sm:p-6",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-card to-transparent lg:hidden"
      />
      <div aria-hidden className="space-y-4">
        <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
          <span>3.4 Conservation of energy</span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-destructive/80" />
            <span className="size-2 rounded-full bg-primary ring-2 ring-primary/25" />
            <span className="size-2 rounded-full bg-muted-foreground/25" />
          </span>
        </div>
        <p className="text-pretty text-sm leading-relaxed sm:text-[15px]">{STEM}</p>
        <ul className="space-y-2">
          {OPTIONS.map((o, i) => (
            <li
              key={o.text}
              className={cn(
                "flex items-start gap-3 rounded-xl border px-3 py-2.5 text-[13px] leading-snug",
                o.state === "key"
                  ? "border-emerald-600/50 bg-emerald-600/5"
                  : o.state === "picked"
                    ? "border-destructive/50 bg-destructive/5"
                    : "border-border",
              )}
            >
              <span className="mt-px grid size-5 shrink-0 place-items-center rounded-full border border-border text-[11px] font-medium">
                {String.fromCharCode(65 + i)}
              </span>
              <span>{o.text}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-start gap-3 rounded-xl bg-destructive/10 px-3 py-2.5 text-[13px]">
          <X className="mt-0.5 size-4 shrink-0 text-destructive" />
          <p>
            <span className="font-medium">Not quite.</span>{" "}
            <span className="text-muted-foreground">The answer is B.</span>
          </p>
        </div>
        {mixUp && (
          <div className="space-y-1 rounded-xl border border-border px-3 py-2.5 text-[13px]">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Common mix-up
            </p>
            <p className="font-medium">{mixUp.label}</p>
            <p className="text-muted-foreground">{mixUp.description}</p>
          </div>
        )}
        <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5 text-[13px] font-medium">
          Worked solution
          <ChevronDown className="size-4 text-muted-foreground" />
        </div>
      </div>
    </div>
  );
}
