"use client";

import { useEffect, useRef } from "react";

/**
 * A percentage that runs from `from` to its real value the first time it scrolls into view.
 * The server renders the real value, so without JavaScript or with reduced motion nothing moves.
 */
export function CountUp({
  value,
  from = 0,
  delay = 0,
  duration = 1400,
}: {
  value: number;
  from?: number;
  delay?: number;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || from === value || !("IntersectionObserver" in window)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Already on screen at load: leave it as rendered.
    if (el.getBoundingClientRect().top < window.innerHeight) return;

    let frame = 0;
    let timer = 0;
    el.textContent = `${from}%`;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        timer = window.setTimeout(() => {
          const start = performance.now();
          const step = (now: number) => {
            const t = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - t, 3);
            el.textContent = `${Math.round(from + (value - from) * eased)}%`;
            if (t < 1) frame = requestAnimationFrame(step);
          };
          frame = requestAnimationFrame(step);
        }, delay);
      },
      { threshold: 0.6 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      el.textContent = `${value}%`;
    };
  }, [value, from, delay, duration]);

  return (
    <span ref={ref} suppressHydrationWarning>
      {value}%
    </span>
  );
}
