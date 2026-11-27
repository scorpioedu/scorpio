"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Logo } from "@/components/ui/logo";
import intro from "./hero-intro.module.css";

type Status = "correct" | "hint" | "notyet";

type Answer = {
  id: number;
  who: string;
  problem: string;
  status: Status;
  /** The concept a wrong answer counts toward on the reteach list. */
  concept?: string;
};

const INCLINE = "Components of mg on a slope";
const PULLEY = "Tension in a pulley";

/** Already in the feed when the window opens, newest first. */
const SEED: readonly Answer[] = [
  { id: -1, who: "MR", problem: "incline.no_friction", status: "correct" },
  { id: -2, who: "JT", problem: "pulley.atwood", status: "hint" },
  { id: -3, who: "AS", problem: "incline.no_friction", status: "notyet", concept: INCLINE },
  { id: -4, who: "DK", problem: "elevator.scale", status: "correct" },
];

/** What arrives, one every few seconds, then the class period starts over. */
const QUEUE: readonly Answer[] = [
  { id: 1, who: "LP", problem: "elevator.scale", status: "correct" },
  { id: 2, who: "NB", problem: "incline.no_friction", status: "hint" },
  { id: 3, who: "OC", problem: "incline.no_friction", status: "notyet", concept: INCLINE },
  { id: 4, who: "RV", problem: "pulley.atwood", status: "correct" },
  { id: 5, who: "EH", problem: "ramp.friction", status: "correct" },
  { id: 6, who: "JT", problem: "pulley.atwood", status: "notyet", concept: PULLEY },
  { id: 7, who: "SM", problem: "elevator.scale", status: "correct" },
  { id: 8, who: "KW", problem: "incline.no_friction", status: "notyet", concept: INCLINE },
  { id: 9, who: "AS", problem: "incline.no_friction", status: "correct" },
  { id: 10, who: "GF", problem: "ramp.friction", status: "hint" },
];

const BASE = { answers: 142, correct: 87, hints: 31, reteach: { [INCLINE]: 2, [PULLEY]: 1 } };

/** The chart's history before the first queued answer: cumulative answers and hints so far. */
const HISTORY_ANSWERS = [8, 17, 24, 37, 45, 58, 66, 81, 90, 103, 112, 124, 133, 142];
const HISTORY_HINTS = [2, 4, 5, 8, 10, 12, 13, 17, 19, 22, 24, 27, 29, 31];

/** The whole period: history, then one point per queued answer. */
const SERIES = (() => {
  const answers = [...HISTORY_ANSWERS];
  const hints = [...HISTORY_HINTS];
  for (const a of QUEUE) {
    answers.push(answers.at(-1)! + 1 + (a.id % 3));
    hints.push(hints.at(-1)! + (a.status === "hint" ? 2 : a.id % 2));
  }
  return { answers, hints };
})();

const SLOTS = SERIES.answers.length - 1;
const W = 400;
const H = 150;

function toPath(values: number[], max: number) {
  const pts = values.map((v, i) => [(i / SLOTS) * W, H - 8 - (v / max) * (H - 16)] as const);
  // Catmull-Rom through every point, written as cubic Béziers, so the line reads as one stroke.
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [p0, p1, p2, p3] = [pts[i - 1] ?? pts[i], pts[i], pts[i + 1], pts[i + 2] ?? pts[i + 1]];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

const maxAnswers = SERIES.answers.at(-1)!;
const ANSWERS_PATH = toPath(SERIES.answers, maxAnswers);
const HINTS_PATH = toPath(SERIES.hints, maxAnswers);

function yAt(values: number[], i: number) {
  return H - 8 - (values[i] / maxAnswers) * (H - 16);
}

const STATUS: Record<Status, [string, string]> = {
  correct: ["Correct", "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"],
  // A wrong answer that matches a known mix-up is told which one, from a list written by people.
  hint: ["Mix-up named", "bg-primary/10 text-primary dark:text-primary"],
  notyet: ["Not yet", "bg-rose-500/10 text-rose-700 dark:text-rose-300"],
};

const TICK = 2800;
/** The intro splash holds the hero until it closes. */
const HOLD_SELECTOR = "#scorpio-intro[open]";
const HOLD = 5600;

/** A number that eases to its new value instead of jumping. */
function Tween({ value, suffix = "" }: { value: number; suffix?: string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 600);
      const v = Math.round(a + (value - a) * (1 - Math.pow(1 - t, 3)));
      setShown(v);
      if (t < 1) frame = requestAnimationFrame(step);
      else from.current = value;
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      from.current = value;
    };
  }, [value]);
  return (
    <>
      {shown}
      {suffix}
    </>
  );
}

/**
 * The hero's product window: a class period in progress. Answers arrive in the feed, the numbers
 * and the chart move with them, and wrong answers build the reteach list. Everything is derived from
 * how many queued answers have arrived (`k`), so feed, stats and chart always agree.
 */
const REDUCE = "(prefers-reduced-motion: reduce)";
const subscribeReduce = (cb: () => void) => {
  const mq = window.matchMedia(REDUCE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

export function HeroLiveClass({
  unitLabel,
  courseName,
}: {
  unitLabel: string;
  courseName: string;
}) {
  const [live, setK] = useState(0);
  const [paused, setPaused] = useState(false);
  // Reduced motion: a still frame of the finished period, no clock.
  const still = useSyncExternalStore(
    subscribeReduce,
    () => window.matchMedia(REDUCE).matches,
    () => false,
  );
  const k = still ? QUEUE.length : live;
  const [resetting, setResetting] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const visible = useRef(false);

  useEffect(() => {
    const el = root.current;
    const observer = new IntersectionObserver(([e]) => (visible.current = e.isIntersecting), {
      threshold: 0.25,
    });
    if (el) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // One clock. A tick is skipped while the window is off screen, the tab is hidden or the intro
  // splash or first-visit gate is open, so the period only plays while someone is watching it.
  const kRef = useRef(0);
  const held = useRef(0);
  useEffect(() => {
    if (still || paused) return;
    const id = window.setInterval(() => {
      if (!visible.current || document.hidden || document.querySelector(HOLD_SELECTOR)) {
        return;
      }
      if (kRef.current < QUEUE.length) {
        kRef.current += 1;
        setK(kRef.current);
        return;
      }
      held.current += 1;
      if (held.current * TICK < HOLD) return;
      held.current = 0;
      kRef.current = 0;
      setResetting(true);
      setK(0);
      window.setTimeout(() => setResetting(false), 80);
    }, TICK);
    return () => clearInterval(id);
  }, [still, paused]);

  const state = useMemo(() => {
    const arrived = QUEUE.slice(0, k);
    const feed = [...arrived].reverse().concat(SEED).slice(0, 5);
    let correct = BASE.correct;
    let hints = BASE.hints;
    const reteach: Record<string, number> = { ...BASE.reteach };
    for (const a of arrived) {
      if (a.status === "correct") correct++;
      if (a.status === "hint") hints++;
      if (a.concept) reteach[a.concept] = (reteach[a.concept] ?? 0) + 1;
    }
    const answers = BASE.answers + arrived.length;
    const [topic, count] = Object.entries(reteach).sort((x, y) => y[1] - x[1])[0];
    return {
      feed,
      answers,
      pct: Math.round((correct / answers) * 100),
      hints,
      topic,
      count,
      submitted: Math.min(25, 18 + Math.floor(k / 2)),
      at: HISTORY_ANSWERS.length - 1 + k,
    };
  }, [k]);

  const progress = state.at / SLOTS;
  const dot = {
    x: progress * W,
    y: yAt(SERIES.answers, state.at),
    hy: yAt(SERIES.hints, state.at),
  };

  return (
    <div
      ref={root}
      className={`${resetting ? intro.resetting : ""} overflow-hidden rounded-xl bg-card text-card-foreground shadow-[0_30px_60px_-28px_rgb(0_0_0/0.35),0_10px_20px_-12px_rgb(0_0_0/0.2)] ring-1 ring-black/5 dark:ring-white/10`}
    >
      <p className="sr-only">
        A live preview of a Scorpio class: student answers arrive and are marked, a wrong answer is
        told which mix-up is behind it, the class numbers update, and wrong answers build a list of
        concepts to reteach.
      </p>

      {/* Top bar, like an app window. */}
      <div className="flex items-center justify-between px-4 py-3 text-[13px] sm:px-5">
        <span aria-hidden="true" className="flex items-center gap-2">
          <Logo size={16} strokeWidth={2.6} className="text-primary" />
          <span className="font-medium">Scorpio</span>
        </span>
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          disabled={still}
          aria-pressed={paused}
          aria-label={paused ? "Play the live class preview" : "Pause the live class preview"}
          className="group -mr-2 flex min-h-8 items-center gap-2 rounded-md px-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none"
        >
          <span
            aria-hidden="true"
            className={`size-1.5 rounded-full ${paused || still ? "bg-muted-foreground/60" : `bg-emerald-500 ${intro.livePulse}`}`}
          />
          <span aria-hidden="true">{paused ? "Paused" : "Live · Period 3"}</span>
          {!still &&
            (paused ? (
              <Play aria-hidden="true" className="size-3" />
            ) : (
              <Pause
                aria-hidden="true"
                className="size-3 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
              />
            ))}
        </button>
      </div>

      <div aria-hidden="true" className="grid gap-1 p-1 pt-0 sm:grid-cols-2">
        {/* The class: who just answered what. */}
        <div className="flex flex-col rounded-lg bg-muted/60 px-4 py-4 ring-1 ring-border/50 sm:px-5 dark:bg-muted/30">
          <p className="truncate text-[15px] font-medium">{unitLabel}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{courseName} · 25 students</p>

          <div className="mt-3 flex items-baseline justify-between border-t border-border pt-3 text-xs text-muted-foreground">
            <span>Answers</span>
            <span className="tabular-nums">
              <Tween value={state.answers} /> today
            </span>
          </div>

          <div className="mt-1 h-[136px] overflow-hidden [mask-image:linear-gradient(to_bottom,black_72%,transparent)]">
            <ul key={k} className={intro.feed}>
              {state.feed.map((a, i) => {
                const [label, tone] = STATUS[a.status];
                return (
                  <li
                    key={a.id}
                    className={`${i === 0 && k > 0 ? intro.feedNew : ""} flex h-[34px] items-center gap-3 text-[12.5px]`}
                  >
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-[10px] font-semibold tracking-wide text-primary">
                      {a.who}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-foreground/85">
                      {a.problem}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}
                    >
                      {label}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="mt-auto flex items-end justify-between gap-4 border-t border-border pt-3">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Reteach next</p>
              <p
                key={state.topic}
                className={`${intro.swap} mt-1 truncate text-[14px] font-medium`}
              >
                {state.topic}
              </p>
            </div>
            <p className="shrink-0 text-right text-xs tabular-nums text-muted-foreground">
              <span className="block text-lg font-semibold text-primary">
                <Tween value={state.count} />
              </span>
              students
            </p>
          </div>
        </div>

        {/* The numbers: how the period is going. */}
        <div className="flex flex-col rounded-lg bg-muted/60 px-4 py-4 ring-1 ring-border/50 sm:px-5 dark:bg-muted/30">
          <div className="grid grid-cols-3 gap-3">
            {[
              ["First try", <Tween key="p" value={state.pct} suffix="%" />],
              ["Submitted", <Tween key="s" value={state.submitted} suffix="/25" />],
              ["Mix-ups named", <Tween key="h" value={state.hints} />],
            ].map(([label, value], i) => (
              <div key={i} className="min-w-0">
                <p className="truncate text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 text-[clamp(1.1rem,2vw,1.6rem)] font-semibold tabular-nums tracking-tight">
                  {value}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-end gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-3 rounded-full bg-primary" /> Answers
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 border-t border-dashed border-muted-foreground" /> Mix-ups
            </span>
          </div>

          <div className="relative mt-2 min-h-[110px] flex-1 text-primary">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              className="absolute inset-0 size-full overflow-visible"
            >
              <defs>
                <clipPath id="hero-live-reveal">
                  <rect
                    x="0"
                    y="-10"
                    width={W}
                    height={H + 20}
                    className={intro.reveal}
                    style={{ transform: `scaleX(${progress})` }}
                  />
                </clipPath>
                <linearGradient id="hero-live-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="currentColor" stopOpacity="0.32" />
                  <stop offset="1" stopColor="currentColor" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[0.25, 0.5, 0.75].map((f) => (
                <line
                  key={f}
                  x1="0"
                  x2={W}
                  y1={8 + f * (H - 16)}
                  y2={8 + f * (H - 16)}
                  className="stroke-border"
                  strokeDasharray="2 4"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              <line
                x1="0"
                x2={W}
                y1={H - 8}
                y2={H - 8}
                className="stroke-border"
                vectorEffect="non-scaling-stroke"
              />
              <g clipPath="url(#hero-live-reveal)">
                <path
                  d={`${ANSWERS_PATH} L${W} ${H - 8} L0 ${H - 8} Z`}
                  fill="url(#hero-live-fill)"
                />
                <path
                  d={HINTS_PATH}
                  fill="none"
                  className="stroke-muted-foreground"
                  strokeWidth="1.25"
                  strokeDasharray="3 4"
                  vectorEffect="non-scaling-stroke"
                />
                <path
                  d={ANSWERS_PATH}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            </svg>
            {/* End dots sit in HTML so they stay round when the chart stretches. */}
            <span
              className={`${intro.dot} ${intro.endDot} absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-primary`}
              style={{ left: `${(dot.x / W) * 100}%`, top: `${(dot.y / H) * 100}%` }}
            />
            <span
              className={`${intro.dot} absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted-foreground`}
              style={{ left: `${(dot.x / W) * 100}%`, top: `${(dot.hy / H) * 100}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
