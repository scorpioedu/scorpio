import { readFileSync } from "fs";
import { join } from "path";

// RT-32 / M-005: contrast ratios computed from the oklch tokens in globals.css.

type Rgb = [number, number, number];

function oklchToLinearSrgb(L: number, C: number, hDeg: number): Rgb {
  const a = C * Math.cos((hDeg * Math.PI) / 180);
  const b = C * Math.sin((hDeg * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return [
    clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

const luminance = ([r, g, b]: Rgb) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function contrast(x: Rgb, y: Rgb): number {
  const lx = luminance(x);
  const ly = luminance(y);
  return (Math.max(lx, ly) + 0.05) / (Math.min(lx, ly) + 0.05);
}

const css = readFileSync(join(__dirname, "globals.css"), "utf8");

function token(block: ":root" | ".dark", name: string): Rgb {
  const start = css.indexOf(`\n${block} {`);
  const end = css.indexOf("\n}", start);
  const body = css.slice(start, end);
  const match = body.match(new RegExp(`--${name}:\\s*oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\)`));
  if (!match) throw new Error(`token --${name} not found in ${block}`);
  return oklchToLinearSrgb(Number(match[1]), Number(match[2]), Number(match[3]));
}

/** Resolves a token for a theme; the dark theme inherits unspecified tokens from :root. */
function themed(theme: "light" | "dark", name: string): Rgb {
  if (theme === "light") return token(":root", name);
  try {
    return token(".dark", name);
  } catch {
    return token(":root", name);
  }
}

describe.each(["light", "dark"] as const)("destructive tokens (%s)", (theme) => {
  const white: Rgb = [1, 1, 1];

  it("white text on the destructive button fill is at least 4.5:1", () => {
    expect(contrast(white, themed(theme, "destructive-solid"))).toBeGreaterThanOrEqual(4.5);
  });

  it("white text on the destructive button hover fill is at least 4.5:1", () => {
    expect(contrast(white, themed(theme, "destructive-solid-hover"))).toBeGreaterThanOrEqual(4.5);
  });
});

describe("destructive as text", () => {
  it("light: text-destructive on the page background is at least 4.5:1", () => {
    expect(contrast(themed("light", "destructive"), themed("light", "background"))).toBeGreaterThanOrEqual(4.5);
  });

  it("dark: text-destructive on the page background is at least 4.5:1", () => {
    expect(contrast(themed("dark", "destructive"), themed("dark", "background"))).toBeGreaterThanOrEqual(4.5);
  });
});
