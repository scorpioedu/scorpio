/** Soft contour lines used as a fixed docs background; static, server-safe. */
export function DocsLines({ className = "" }: { className?: string }) {
  const count = 40;
  const lines = Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    const y = 60 + t * 220;
    const d = `M -10 ${y + 60} C 260 ${y - 40 + t * 40}, 560 ${y + 120 - t * 50}, 1010 ${y - 30 - t * 30}`;
    return <path key={i} d={d} strokeOpacity={0.25 + (1 - Math.abs(t - 0.5) * 2) * 0.75} />;
  });
  return (
    <svg
      viewBox="0 0 1000 600"
      preserveAspectRatio="none"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="0.7"
      vectorEffect="non-scaling-stroke"
      aria-hidden="true"
    >
      {lines}
    </svg>
  );
}
