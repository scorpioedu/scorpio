import { Check } from "lucide-react";
import { card } from "./split-kit";

/*
 * The three plans, shown on the home page and on /pricing from this one list so the two never
 * disagree. Prices are the published ones: Starter free, Department $10/mo or $100/yr plus
 * at-cost AI, District arranged.
 */

type Plan = {
  name: string;
  audience: string;
  price: string;
  per?: string;
  annualPrice?: string;
  annualPer?: string;
  ai: string;
  includes: string[];
};

export const plans: Plan[] = [
  {
    name: "Starter",
    audience: "For one teacher",
    price: "Free",
    ai: "Starter budget",
    includes: ["Every published problem set", "Auto-grading", "Class misconception report"],
  },
  {
    name: "Department",
    audience: "For a physics department",
    price: "$10",
    per: "/month",
    annualPrice: "$100",
    annualPer: "/year",
    ai: "At cost",
    includes: ["Everything in Starter", "Department sharing", "Higher AI limits", "Monthly spend caps"],
  },
  {
    name: "District",
    audience: "For several schools",
    price: "Custom",
    ai: "Arranged",
    includes: ["Everything in Department", "Data-protection review with your school"],
  },
];

export function PlanCards({ annual = false }: { annual?: boolean }) {
  return (
    <ul role="list" className="grid list-none gap-2 md:grid-cols-3">
      {plans.map((p) => {
        const price = annual && p.annualPrice ? p.annualPrice : p.price;
        const per = annual && p.annualPer ? p.annualPer : p.per;
        return (
          <li key={p.name} className={`${card} flex flex-col`}>
            <div className="flex items-baseline justify-between gap-4">
              <h3 className="text-lg font-medium">{p.name}</h3>
              <p className="text-right text-sm text-muted-foreground">{p.audience}</p>
            </div>
            <p className="mt-6 flex items-baseline gap-2">
              <span className="text-[2.1rem] font-medium tracking-tight">{price}</span>
              {per && <span className="text-muted-foreground">{per}</span>}
            </p>
            <p className="mt-5 flex items-baseline justify-between gap-4 text-[15px]">
              <span className="text-muted-foreground">AI usage</span>
              <span>{p.ai}</span>
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
        );
      })}
    </ul>
  );
}
