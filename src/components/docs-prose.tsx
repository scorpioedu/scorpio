import type { ReactNode } from "react";

/** Plain document header: title, one-line summary, and a small metadata line. */
export function DocHeader({ title, summary, meta }: { title: string; summary?: string; meta?: string }) {
  return (
    <header className="mb-10 border-b border-border/60 pb-8">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      {summary && <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">{summary}</p>}
      {meta && <p className="mt-4 text-xs text-muted-foreground/80">{meta}</p>}
    </header>
  );
}

/** Numbered or plain document section with a hairline rule above it. */
export function DocSection({
  id,
  number,
  title,
  children,
}: {
  id?: string;
  number?: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="border-t border-border/40 py-8 first-of-type:border-t-0 first-of-type:pt-0">
      <h2 className="mb-3 text-xl font-semibold tracking-tight">
        {number !== undefined && <span className="mr-2 font-normal text-muted-foreground/60">{number}.</span>}
        {title}
      </h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

/** Term / description list, used instead of a grid of cards. */
export function DocList({ items }: { items: { term: string; description: ReactNode }[] }) {
  return (
    <dl className="divide-y divide-border/40 border-y border-border/40">
      {items.map((item) => (
        <div key={item.term} className="grid gap-1 py-3 sm:grid-cols-[11rem_1fr] sm:gap-6">
          <dt className="text-sm font-medium text-foreground">{item.term}</dt>
          <dd className="text-sm leading-relaxed text-muted-foreground">{item.description}</dd>
        </div>
      ))}
    </dl>
  );
}

export const docLink = "text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground";
