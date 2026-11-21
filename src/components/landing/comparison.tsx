import { CountUp } from "@/components/landing/count-up";
import reveal from "./home-reveal.module.css";
import { card, CircleLink, Split, statement } from "./split-kit";

const results = [
  // The second figure runs down from 100 after the first lands, so the drop reads as the result.
  {
    value: 100,
    from: 0,
    delay: 200,
    name: "Without tutoring rules",
    label: "gave the answer",
    strong: false,
  },
  {
    value: 0,
    from: 100,
    delay: 1500,
    name: "With all Raise rules",
    label: "gave the answer",
    strong: true,
  },
];

export function Comparison() {
  return (
    <div id="comparison" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20 sm:px-8 sm:py-28">
      <div data-scroll-reveal className={reveal.stagger}>
        <Split id="research-heading" heading="What we tested">
          <p className={statement}>
            Raise doesn’t hand students the answer
            <span className="block text-muted-foreground">
              Same AI model, 25 physics questions, only the tutoring rules changed
            </span>
          </p>
        </Split>
      </div>

      <dl className="mt-16 grid gap-2 sm:mt-20 sm:grid-cols-2">
        {results.map(({ value, from, delay, name, label, strong }, i) => (
          <div
            key={value}
            data-scroll-reveal
            style={{ "--reveal-delay": `${150 + i * 180}ms` } as React.CSSProperties}
            className={`${card} flex flex-col ${strong ? "ring-1 ring-primary/15" : ""}`}
          >
            <dt className="flex items-baseline justify-between gap-4">
              <span className="text-lg font-medium tracking-tight">{name}</span>
              <span className="text-sm text-muted-foreground">{label}</span>
            </dt>
            <dd
              className={`mt-10 text-[clamp(3.5rem,7vw,5.5rem)] font-medium leading-none tracking-[-0.05em] tabular-nums ${strong ? "text-primary" : ""}`}
            >
              <CountUp value={value} from={from} delay={delay} />
            </dd>
          </div>
        ))}
      </dl>

      <div
        data-scroll-reveal
        className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between"
      >
        <p className="text-sm text-muted-foreground">
          A result on 25 test questions, not a guarantee for every question.
        </p>
        <CircleLink href="/research">Read the study</CircleLink>
      </div>
    </div>
  );
}
