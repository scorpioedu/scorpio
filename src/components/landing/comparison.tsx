import reveal from "./home-reveal.module.css";
import { card, CircleLink, Split, statement } from "./split-kit";

/**
 * Where AI is and is not in Scorpio, said plainly. Nothing a student does needs AI; what a teacher
 * can use is listed with who sees its output. The Raise study is linked for teachers who turn it on.
 */
const places = [
  {
    who: "Students",
    state: "Off by default",
    text: "Study, lessons, practice and marking use no AI. Raise, a hint assistant, stays off for a class until its teacher turns it on.",
    strong: true,
  },
  {
    who: "Written answers",
    state: "Draft, then you",
    text: "AI can draft a score and feedback for a written answer. The student sees it only after you have checked it and saved.",
    strong: false,
  },
  {
    who: "Your own tools",
    state: "When you ask",
    text: "Draft problems and rubrics, or ask Raise yourself. AI is billed at cost, and Scorpio works without it.",
    strong: false,
  },
];

export function AiOnYourTerms() {
  return (
    <div id="comparison" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20 sm:px-8 sm:py-28">
      <div data-scroll-reveal className={reveal.stagger}>
        <Split id="research-heading" heading="AI in Scorpio">
          <p className={statement}>
            Off for students unless you turn it on
            <span className="block text-muted-foreground">
              Every course problem is checked by a person, and answers are marked by plain code
            </span>
          </p>
        </Split>
      </div>

      <dl className="mt-16 grid gap-2 sm:mt-20 md:grid-cols-3">
        {places.map(({ who, state, text, strong }, i) => (
          <div
            key={who}
            data-scroll-reveal
            style={{ "--reveal-delay": `${150 + i * 140}ms` } as React.CSSProperties}
            className={`${card} flex flex-col ${strong ? "ring-1 ring-primary/15" : ""}`}
          >
            <dt className="flex items-baseline justify-between gap-4">
              <span className="text-lg font-medium tracking-tight">{who}</span>
              <span className={`text-sm ${strong ? "text-primary" : "text-muted-foreground"}`}>
                {state}
              </span>
            </dt>
            <dd className="mt-8 text-pretty text-[15px] leading-relaxed text-muted-foreground">
              {text}
            </dd>
          </div>
        ))}
      </dl>

      <div
        data-scroll-reveal
        className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between"
      >
        <p className="max-w-xl text-sm text-muted-foreground">
          If you turn Raise on: on 25 test questions it gave hints and never the answer. That is a
          result on those questions, not a guarantee for every question.
        </p>
        <CircleLink href="/research">Read the study</CircleLink>
      </div>
    </div>
  );
}
