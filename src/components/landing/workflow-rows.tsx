import { apUnits } from "@/data/ap";
import { CURRICULA, hasContent } from "@/data/curricula";
import rail from "./workflow-rail.module.css";
import reveal from "./home-reveal.module.css";
import { card, Section, Split, statement } from "./split-kit";

/** A block on a 30° ramp with gravity split into its two parts, drawn in theme colors. */
function InclineDiagram() {
  return (
    <svg
      viewBox="0 0 120 76"
      className="mx-auto h-24 w-auto text-foreground"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 70 H114 V8 Z" strokeOpacity="0.5" />
      <path d="M24 70 A18 18 0 0 0 21.6 61" strokeOpacity="0.5" />
      <text x="27" y="67" fontSize="8" fill="currentColor" stroke="none" opacity="0.7">
        30°
      </text>
      <g transform="translate(62 37.8) rotate(-29.9)">
        <rect
          x="-10"
          y="-12"
          width="20"
          height="12"
          rx="1.5"
          className="fill-card"
          strokeWidth="1.2"
        />
      </g>
      {/* mg straight down, then its components along and into the ramp */}
      <g className="text-primary" stroke="currentColor" strokeWidth="1.4">
        <path d="M65 33 V55" />
        <path d="M62 52 L65 56 L68 52" />
        <path d="M65 33 L55.5 38.5" strokeDasharray="2 2" strokeOpacity="0.8" />
        <path d="M65 33 L74.5 49.5" strokeDasharray="2 2" strokeOpacity="0.8" />
      </g>
      <text x="54" y="62" fontSize="8" className="fill-primary" stroke="none" fontWeight="600">
        mg
      </text>
    </svg>
  );
}

type Step = { title: string; text: string; preview: React.ReactNode };

function Row({
  id,
  who,
  when,
  steps,
  start,
  accent = false,
  pulseDelay = "0s",
}: {
  id: string;
  who: string;
  when: string;
  steps: Step[];
  start: number;
  accent?: boolean;
  pulseDelay?: string;
}) {
  return (
    <div id={id} className="scroll-mt-24">
      {/* Who does these three, then a hairline with a pulse running toward the step count. */}
      <div data-scroll-reveal className="flex items-center gap-4">
        <h3 className="flex shrink-0 items-baseline gap-2">
          <span className="text-lg font-medium tracking-tight">{who}</span>
          <span className="text-sm text-muted-foreground">{when}</span>
        </h3>
        <span aria-hidden="true" className="relative h-px flex-1 overflow-hidden bg-border">
          <span
            className={rail.pulse}
            style={{ "--pulse-delay": pulseDelay } as React.CSSProperties}
          />
        </span>
        <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
          Steps {start}–{start + steps.length - 1}
        </span>
      </div>

      <ol role="list" className="mt-5 grid list-none gap-2 md:grid-cols-3">
        {steps.map(({ title, text, preview }, i) => (
          <li
            key={title}
            data-scroll-reveal
            className={`${card} flex flex-col ${accent ? "ring-1 ring-primary/15" : ""}`}
            style={{ "--reveal-delay": `${i * 120}ms` } as React.CSSProperties}
          >
            <p
              aria-hidden="true"
              className={`font-mono text-xs tabular-nums ${accent ? "text-primary" : "text-muted-foreground"}`}
            >
              {String(start + i).padStart(2, "0")}
            </p>
            <h4 className="mt-3 text-lg font-medium tracking-tight">
              <span className="sr-only">Step {start + i}: </span>
              {title}
            </h4>
            <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">{text}</p>
            <span aria-hidden="true" className="min-h-6 flex-1" />
            <div
              aria-hidden="true"
              className="rounded-lg border border-border bg-background/80 p-3.5 text-left text-[13px] dark:bg-muted/30"
            >
              {preview}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Line({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

const physics1 = CURRICULA[0];
const plannedUnits = apUnits(physics1.apCourse).slice(0, 3);
const planDates = ["Sep 2", "Sep 22", "Oct 13"];

const setupSteps: Step[] = [
  {
    title: "Pick your course",
    text: "Every AP unit, with problem sets already written.",
    preview: (
      <div className="grid gap-1.5">
        {CURRICULA.filter(hasContent).map((c, i) => (
          <div
            key={c.id}
            className={`flex items-center justify-between gap-3 rounded-lg border px-2.5 py-2 ${i === 0 ? "border-primary/50 bg-primary/5 font-semibold text-primary" : "border-border"}`}
          >
            <span className="truncate">{c.name}</span>
            <span className="shrink-0 text-xs font-normal text-muted-foreground">
              {apUnits(c.apCourse).length} units
            </span>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: "Plan the year",
    text: "Put units on your calendar. Move them if you fall behind.",
    preview: (
      <div className="grid grid-cols-[3.25rem_1fr] items-center gap-x-2 gap-y-1.5">
        {plannedUnits.map((u, i) => (
          <div key={u.unit} className="contents">
            <span className="text-xs text-muted-foreground">{planDates[i]}</span>
            <span
              className={`w-fit max-w-full truncate rounded-md px-2 py-0.5 text-xs font-semibold ${i === 1 ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}
            >
              Unit {u.unit} · {u.title}
            </span>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: "Assign a set",
    text: "Choose a class and a due date. Students join with a class code.",
    preview: (
      <>
        <p className="font-semibold">Newton’s second law</p>
        <Line label="Class" value="Period 3" />
        <Line label="Due" value="Fri, Sep 26" />
        <Line
          label="Class code"
          value={
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono tracking-wider">K7Q29P</span>
          }
        />
      </>
    ),
  },
];

const scores = [
  ["Student A", 9],
  ["Student B", 7],
  ["Student C", 5],
] as const;

const autoSteps: Step[] = [
  {
    title: "Names the mix-up",
    text: "A wrong answer is told which idea went wrong, from a list written by people. No AI.",
    preview: (
      <div className="space-y-2.5">
        <div className="rounded-lg bg-muted/60 p-2.5">
          <InclineDiagram />
          <p className="mt-1.5 text-xs leading-snug text-muted-foreground">
            A 2 kg block slides down a 30° ramp with μ = 0.2. Find its acceleration.
          </p>
        </div>
        <p className="ml-auto w-fit max-w-[88%] rounded-lg rounded-br-sm bg-muted px-2.5 py-2">
          2.94 m/s² <span className="text-muted-foreground">· not yet</span>
        </p>
        <p className="w-fit max-w-[94%] rounded-lg rounded-bl-sm border border-primary/20 bg-primary/5 px-2.5 py-2">
          <span className="font-semibold text-primary">Mix-up</span> · Normal force taken as mg. On
          a ramp the surface pushes back with mg cos θ.
        </p>
      </div>
    ),
  },
  {
    title: "Marks the answers",
    text: "Numeric and multiple-choice answers are marked on submit. Written ones wait for you.",
    preview: (
      <div className="space-y-2">
        {scores.map(([name, score]) => (
          <div key={name} className="flex items-center gap-2.5">
            <span className="w-[4.5rem] shrink-0 text-muted-foreground">{name}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-primary"
                style={{ width: `${score * 10}%` }}
              />
            </span>
            <span className="font-semibold tabular-nums">{score}/10</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: "Shows what to reteach",
    text: "The class’s most common mistakes, by how many students made them.",
    preview: (
      <>
        <Line label="Friction drawn the wrong way" value="8 of 24" />
        <Line label="Mass mixed up with weight" value="5 of 24" />
        <Line label="Net force skipped" value="3 of 24" />
      </>
    ),
  },
];

export function WorkflowRows() {
  return (
    <Section id="features" labelledBy="features-heading">
      <div data-scroll-reveal className={reveal.stagger}>
        <Split id="features-heading" heading="How it works">
          <p className={statement}>
            Six steps.
            <span className="block text-muted-foreground">You do three, Scorpio does three.</span>
          </p>
        </Split>
      </div>
      <div className="mt-16 space-y-14 sm:mt-20 sm:space-y-16">
        <Row id="setup" who="You" when="before class" steps={setupSteps} start={1} />
        <Row
          id="solution"
          who="Scorpio"
          when="while students work"
          steps={autoSteps}
          start={4}
          accent
          pulseDelay="1.2s"
        />
      </div>
    </Section>
  );
}
