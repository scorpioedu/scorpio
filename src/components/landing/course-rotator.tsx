"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { CURRICULA } from "@/data/curricula";
import intro from "./hero-intro.module.css";

/** Names too long for the headline. Anything not listed loses only its "AP Physics " prefix. */
const SHORT: Record<string, string> = {
  "AP Physics C: Electricity and Magnetism": "C: E&M",
};

/** The course part of each name, in course order: "1", "2", "C: Mechanics", "C: E&M". */
export const COURSE_NAMES = CURRICULA.map(
  (c) => SHORT[c.name] ?? c.name.replace(/^AP Physics /, ""),
);

/** "1, 2, C: Mechanics and C: E&M", for screen readers and the reduced-motion headline. */
export const COURSE_LIST = `${COURSE_NAMES.slice(0, -1).join(", ")} and ${COURSE_NAMES.at(-1)}`;

const TICK = 1750;
/** Ticks after the splash closes before the first switch, so the intro finishes first. */
const FIRST_AFTER = 1;
const OUT_MS = 480;
const HOLD_SELECTOR = "#scorpio-intro[open]";
const REDUCE = "(prefers-reduced-motion: reduce)";
const subscribeReduce = (cb: () => void) => {
  const mq = window.matchMedia(REDUCE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

export function useReducedMotion() {
  return useSyncExternalStore(
    subscribeReduce,
    () => window.matchMedia(REDUCE).matches,
    () => false,
  );
}

/**
 * The course in the headline. Every few seconds the name blurs out and the next one comes up out
 * of the same blur, in the same spot. The slot's width eases between names so the words after it
 * glide instead of jumping. Waits for the splash, pauses on hover and in a hidden tab, and is
 * hidden from screen readers (the headline carries the full list for them).
 */
export function CourseRotator({
  start,
  index,
}: {
  /** When the first name enters with the headline's words (ms), and its place among them. */
  start: number;
  index: number;
}) {
  const [i, setI] = useState(0);
  const [prev, setPrev] = useState<number | null>(null);
  const [switched, setSwitched] = useState(false);
  const [width, setWidth] = useState<number | null>(null);
  const slot = useRef<HTMLSpanElement>(null);
  const current = useRef<HTMLSpanElement>(null);
  const still = useReducedMotion();

  useEffect(() => {
    if (still) return;
    let ready = 0;
    let n = 0;
    const id = window.setInterval(() => {
      if (document.hidden || document.querySelector(HOLD_SELECTOR)) return;
      // Hold the name still while the pointer is on the headline.
      if (slot.current?.closest("h1")?.matches(":hover")) return;
      ready += 1;
      if (ready < FIRST_AFTER) return;
      setPrev(n);
      n = (n + 1) % COURSE_NAMES.length;
      setI(n);
      setSwitched(true);
    }, TICK);
    return () => clearInterval(id);
  }, [still]);

  useEffect(() => {
    if (prev === null) return;
    const id = window.setTimeout(() => setPrev(null), OUT_MS);
    return () => clearTimeout(id);
  }, [prev]);

  // Size the slot to the name showing, and again when fonts load or the viewport changes.
  useLayoutEffect(() => {
    const el = current.current;
    if (!el) return;
    const measure = () => setWidth(el.getBoundingClientRect().width);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [i]);

  const first = !switched;

  return (
    <span
      ref={slot}
      aria-hidden="true"
      className={intro.slot}
      style={width === null ? undefined : { width }}
    >
      {prev !== null && (
        <span key={`out-${prev}`} className={intro.nameOut}>
          {COURSE_NAMES[prev]}
        </span>
      )}
      <span
        key={`in-${i}`}
        ref={current}
        className={first ? intro.word : intro.nameIn}
        style={first ? ({ "--d": start, "--i": index } as React.CSSProperties) : undefined}
      >
        {COURSE_NAMES[i]}
      </span>
    </span>
  );
}
