// The four course blocks: the quickest way into the lessons, so they sit in the hero of /lessons
// (first thing on a phone too). Each block carries a small diagram of its course's physics that
// moves when the block is hovered or focused, and one segment per unit along its foot that fills
// with the accent colour, left to right. The blocks rise into place once on load.
import type { CSSProperties } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { PublicCourse } from "@/lib/guides/public";
import { cn } from "@/lib/utils";
import styles from "./course-blocks.module.css";

export { styles as courseBlockStyles };

/** "AP Physics C: Electricity and Magnetism" -> "C: E&M": the block's big name. */
export function shortCourseName(name: string): string {
  return name.replace(/^AP Physics\s*/, "").replace("Electricity and Magnetism", "E&M");
}

/** The unit bar: one segment per unit, filling left to right when its block is hovered or focused. */
export function UnitBar({ units, className }: { units: { unit: number }[]; className?: string }) {
  return (
    <span aria-hidden className={cn("flex gap-1", className)}>
      {units.map((u, i) => (
        <span
          key={u.unit}
          style={{ transitionDelay: `${i * 35}ms` }}
          className="h-1 flex-1 rounded-full bg-foreground/10 transition-colors duration-300 group-hover:bg-primary/70 group-focus-visible:bg-primary/70 motion-reduce:transition-none"
        />
      ))}
    </span>
  );
}

/** A sine wave from x = -24 to 120 (one wavelength is 24), so a 24px shift loops seamlessly. */
const WAVE = (() => {
  const pts: string[] = [];
  for (let x = -24; x <= 120; x += 2)
    pts.push(`${x},${(28 - 11 * Math.sin((2 * Math.PI * x) / 24)).toFixed(2)}`);
  return `M${pts.join(" L")}`;
})();

/** Eight field lines out from a charge at (48, 28), each with a small arrowhead. */
const FIELD = Array.from({ length: 8 }, (_, i) => {
  const a = (i * Math.PI) / 4 + Math.PI / 8;
  const p = (r: number, da = 0) =>
    `${(48 + r * Math.cos(a + da)).toFixed(1)},${(28 + r * Math.sin(a + da)).toFixed(1)}`;
  return { line: `M${p(11)} L${p(25)}`, head: `M${p(21, -0.13)} L${p(25)} L${p(21, 0.13)}` };
});

function CourseDiagram({ courseId }: { courseId: string }) {
  const stroke = { fill: "none", strokeWidth: 2, strokeLinecap: "round" as const };
  return (
    <span aria-hidden className={styles.diagram}>
      {courseId === "ap-physics-1" ? (
        // A ball rolling down a ramp, with its velocity along the slope.
        <svg viewBox="0 0 96 56">
          <path d="M8 14 L88 48 L8 48 Z" className={styles.faint} {...stroke} strokeWidth={1.5} />
          <g className={cn(styles.move, styles.ball)}>
            <circle cx="24" cy="17" r="5" fill="currentColor" />
            <path
              d="M32 21.6 L46 27.6 M41.5 23.2 L46 27.6 L40 28.6"
              stroke="currentColor"
              {...stroke}
            />
          </g>
        </svg>
      ) : courseId === "ap-physics-2" ? (
        // A travelling wave.
        <svg viewBox="0 0 96 56">
          <defs>
            <clipPath id="wave-clip">
              <rect x="0" y="0" width="96" height="56" />
            </clipPath>
          </defs>
          <path d="M0 28 H96" className={styles.faint} strokeWidth={1} />
          <g clipPath="url(#wave-clip)">
            <path
              d={WAVE}
              stroke="currentColor"
              className={cn(styles.move, styles.wave)}
              {...stroke}
            />
          </g>
        </svg>
      ) : courseId === "ap-physics-c-mech" ? (
        // Position against time, and its tangent (the velocity) sliding along it.
        <>
          <svg viewBox="0 0 96 56">
            <path d="M10 4 V50 H92" className={styles.faint} {...stroke} strokeWidth={1.5} />
            <path d="M10 46 Q 52 46 86 10" stroke="currentColor" {...stroke} opacity={0.55} />
          </svg>
          <span className={styles.tangent} />
        </>
      ) : (
        // A positive charge and its field lines.
        <svg viewBox="0 0 96 56">
          <g className={styles.field}>
            {FIELD.map((f) => (
              <g key={f.line} stroke="currentColor" {...stroke} strokeWidth={1.5}>
                <path d={f.line} />
                <path d={f.head} />
              </g>
            ))}
          </g>
          <circle cx="48" cy="28" r="7" fill="currentColor" opacity={0.18} />
          <circle cx="48" cy="28" r="7" stroke="currentColor" {...stroke} strokeWidth={1.5} />
          <path
            d="M44.5 28 H51.5 M48 24.5 V31.5"
            stroke="currentColor"
            {...stroke}
            strokeWidth={1.5}
          />
        </svg>
      )}
    </span>
  );
}

export function CourseBlocks({
  courses,
  labelledBy,
  className,
}: {
  courses: PublicCourse[];
  labelledBy: string;
  className?: string;
}) {
  return (
    <ul
      role="list"
      aria-labelledby={labelledBy}
      className={cn("grid list-none grid-cols-2 gap-3", className)}
    >
      {courses.map((c, i) => (
        <li key={c.id} className={styles.enter} style={{ "--i": i } as CSSProperties}>
          <Link
            href={c.href}
            aria-label={`${c.name}: ${c.units.length} units, ${c.topicCount} topics`}
            className={cn(
              styles.block,
              "group flex h-full min-h-44 flex-col justify-between gap-4 rounded-2xl border border-border bg-card/70 p-4 backdrop-blur-sm transition-[background-color,border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card hover:shadow-lg hover:shadow-primary/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:hover:translate-y-0 sm:p-5",
            )}
          >
            <span className="flex items-start justify-between gap-2">
              <CourseDiagram courseId={c.id} />
              <ArrowRight
                aria-hidden
                className="size-4 text-muted-foreground transition-[transform,color] group-hover:translate-x-0.5 group-hover:text-primary"
              />
            </span>
            <span>
              <span className="block text-xs text-muted-foreground">AP Physics</span>
              <span className="mt-0.5 block whitespace-nowrap text-[1.2rem] font-medium leading-tight tracking-[-0.03em] sm:text-[clamp(1.35rem,2.4vw,1.75rem)]">
                {shortCourseName(c.name)}
              </span>
              <span className="mt-1.5 block text-xs tabular-nums text-muted-foreground">
                {c.units.length} units · {c.topicCount} topics
              </span>
              <UnitBar units={c.units} className="mt-3" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
