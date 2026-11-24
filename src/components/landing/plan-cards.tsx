import { Check } from "lucide-react";
import { estimateHints, FREE_MONTHLY_CENTS } from "../../../functions/src/budget-policy";
import { card } from "./split-kit";

/*
 * Scorpio's pricing, shown on the home page and on /pricing from this one file so the two never
 * disagree: free for every teacher, AI paid from a prepaid balance at Google's exact cost.
 * Hint counts come from the same estimate the app uses (functions/src/budget-policy.ts).
 */

/** Gemini 3.8 Flash text rates, dollars per 1M tokens. The introductory rate ends 31 Dec 2026. */
export const aiRates = [
  { period: "Through 31 Dec 2026", input: "$0.75", output: "$3.75", at: Date.UTC(2026, 10, 1) },
  { period: "From 1 Jan 2027", input: "$1.50", output: "$7.50", at: Date.UTC(2027, 0, 2) },
].map((r) => ({ ...r, hintsPerDollar: Math.round(estimateHints(100, r.at) / 50) * 50 }));

export const freeMonthly = `$${(FREE_MONTHLY_CENTS / 100).toFixed(0)}`;

const free = [
  "Every published problem set",
  "Auto-grading and the class misconception report",
  "Department sharing and shared Waypoints",
  "Raise hints, AI grading, rubric drafting and student portfolios",
];

const atCost = [
  `${freeMonthly} of AI free every month for every network`,
  "Top up from $5; paid credit never expires",
  "No markup: you pay Google's exact cost",
  "Schools can pay by invoice",
];

const cards = [
  { name: "Free", audience: "For every teacher", price: "$0", detail: "No card, no seat fees", includes: free },
  { name: "AI at cost", audience: "Prepaid balance", price: freeMonthly, detail: "of AI free each month", includes: atCost },
];

export function PlanCards() {
  return (
    <ul role="list" className="grid list-none gap-2 md:grid-cols-2">
      {cards.map((p) => (
        <li key={p.name} className={`${card} flex flex-col`}>
          <div className="flex items-baseline justify-between gap-4">
            <h3 className="text-lg font-medium">{p.name}</h3>
            <p className="text-right text-sm text-muted-foreground">{p.audience}</p>
          </div>
          <p className="mt-6 flex items-baseline gap-2">
            <span className="text-[2.1rem] font-medium tracking-tight">{p.price}</span>
            <span className="text-muted-foreground">{p.detail}</span>
          </p>
          <span aria-hidden="true" className="min-h-8 flex-1" />
          <ul role="list" className="grid list-none gap-3 border-t border-border pt-5 text-[15px]">
            {p.includes.map((f) => (
              <li key={f} className="flex items-start gap-3">
                <Check aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary" />
                {f}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
