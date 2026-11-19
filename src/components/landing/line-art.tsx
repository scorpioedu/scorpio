/*
 * Quiet decoration for the home page, drawn once on the server:
 * a starfield, the Scorpius constellation, and dashed column guides on the content edges.
 */

/** Deterministic so server and client agree and the sky never jumps between renders. */
function seeded(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function stars(count: number, seed: number, w: number, h: number) {
  const rnd = seeded(seed);
  return Array.from({ length: count }, (_, i) => {
    const bright = rnd() < 0.1;
    return (
      <circle
        key={i}
        cx={(rnd() * w).toFixed(1)}
        cy={(rnd() * h).toFixed(1)}
        r={bright ? 1.4 : 0.7}
        opacity={(0.15 + rnd() * 0.45).toFixed(2)}
      />
    );
  });
}

// Scorpius, from the claws (left) through Antares to the stinger (right).
const SCORPIUS: [number, number][] = [
  [650, 28],
  [678, 18],
  [710, 14],
  [686, 41],
  [722, 46],
  [770, 57],
  [800, 74],
  [816, 94],
  [832, 114],
  [866, 128],
  [906, 132],
  [938, 125],
  [948, 112],
  [932, 101],
];
const SCORPIUS_EDGES: [number, number][] = [
  [0, 3],
  [1, 3],
  [2, 3],
  [3, 4],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [8, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [12, 13],
];
const ANTARES = 5;
/** Drops the constellation below the fixed site header. */
const SKY_TOP = 70;

/** A faint starfield; `constellation` adds Scorpius with Antares in the brand color. */
/** Class names for drawing the constellation in: each edge and star gets `--i`, its order from claw to stinger. */
export type SkyMotion = { edge: string; star: string; antares: string };

export function StarField({
  className = "",
  count = 90,
  seed = 7,
  constellation = false,
  motion,
}: {
  className?: string;
  count?: number;
  seed?: number;
  constellation?: boolean;
  motion?: SkyMotion;
}) {
  return (
    <svg
      viewBox="0 0 1000 520"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      className={className}
      fill="currentColor"
    >
      {stars(count, seed, 1000, 520)}
      {constellation && (
        <g>
          <g stroke="currentColor" strokeOpacity={0.28} strokeWidth={0.8} fill="none">
            {SCORPIUS_EDGES.map(([a, b], i) => (
              <path
                key={`${a}-${b}`}
                d={`M ${SCORPIUS[a][0]} ${SCORPIUS[a][1] + SKY_TOP} L ${SCORPIUS[b][0]} ${SCORPIUS[b][1] + SKY_TOP}`}
                pathLength={1}
                className={motion?.edge}
                style={motion ? ({ "--i": i } as React.CSSProperties) : undefined}
              />
            ))}
          </g>
          {SCORPIUS.map(([x, y], i) =>
            i === ANTARES ? (
              <circle
                key={i}
                cx={x}
                cy={y + SKY_TOP}
                r={3}
                className={`fill-primary ${motion?.antares ?? ""}`}
                opacity={0.9}
              />
            ) : (
              <circle
                key={i}
                cx={x}
                cy={y + SKY_TOP}
                r={1.8}
                opacity={0.6}
                className={motion?.star}
                style={motion ? ({ "--i": i } as React.CSSProperties) : undefined}
              />
            ),
          )}
        </g>
      )}
    </svg>
  );
}

/** Two faint dashed guides about 3rem outside the text edges, Stripe style. Wide screens only. */
export function ColumnGuides() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 hidden xl:block">
      <div className="mx-auto h-full w-[calc(72rem+2rem)] border-x border-dashed border-border/70" />
    </div>
  );
}

/** Small brand-colored label that sits above a section title. */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-semibold text-primary">{children}</p>;
}
