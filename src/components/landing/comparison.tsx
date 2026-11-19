import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CountUp } from "@/components/landing/count-up";
import { Eyebrow } from "@/components/landing/line-art";
import reveal from "./home-reveal.module.css";

const results = [
  // The second figure runs down from 100 after the first lands, so the drop reads as the result.
  {
    value: 100,
    from: 0,
    delay: 200,
    label: "gave the answer without tutoring rules",
    strong: false,
  },
  { value: 0, from: 100, delay: 1500, label: "gave the answer with all Raise rules", strong: true },
];

export function Comparison() {
  return (
    <div id="comparison" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20 sm:px-8 sm:py-28">
      <div data-scroll-reveal className={reveal.stagger}>
        <Eyebrow>What we tested</Eyebrow>
        <h2
          id="research-heading"
          className="mt-2 max-w-[22ch] text-3xl font-semibold tracking-[-0.035em] sm:text-4xl"
        >
          Raise doesn’t hand students the answer
        </h2>
        <p className="mt-3 max-w-xl leading-relaxed text-muted-foreground">
          Same AI model, 25 physics questions that asked for a worked solution. Only the tutoring
          rules changed.
        </p>
      </div>

      <div data-scroll-reveal aria-hidden="true" className="mt-10">
        <div className={`${reveal.draw} h-px bg-border`} />
      </div>
      <dl className="grid sm:grid-cols-2">
        {results.map(({ value, from, delay, label, strong }, i) => (
          <div
            key={value}
            data-scroll-reveal
            style={{ "--reveal-delay": `${150 + i * 180}ms` } as React.CSSProperties}
            className={`flex flex-col gap-2 py-7 ${i ? "border-t border-border sm:border-l sm:border-t-0 sm:pl-8" : ""}`}
          >
            <dt className="order-last text-sm text-muted-foreground">{label}</dt>
            <dd
              className={`text-5xl font-semibold leading-none tracking-[-0.05em] tabular-nums sm:text-6xl ${strong ? "text-primary" : ""}`}
            >
              <CountUp value={value} from={from} delay={delay} />
            </dd>
          </div>
        ))}
      </dl>
      <p data-scroll-reveal className="mt-1 text-sm text-muted-foreground">
        A result on 25 test questions, not a guarantee for every question.
      </p>

      <Link
        data-scroll-reveal
        href="/research"
        className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Read the study <ArrowRight aria-hidden="true" className="size-4" />
      </Link>
    </div>
  );
}
