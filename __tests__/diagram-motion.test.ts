// motion: motion maps. The dots and arrows are computed from the stated motion.
import { render } from "../src/lib/diagram";
import { labelOverlaps } from "../src/lib/diagram/check";
import { isSafeSvg } from "../src/lib/diagram/safe";

/** Dot centres in drawing order. */
const dots = (svg: string) =>
  [...svg.matchAll(/<circle cx="([-\d.]+)" cy="([-\d.]+)" r="4.5"/g)].map((m) => [+m[1], +m[2]]);
/** Arrow shafts [x1, y1, x2, y2] of the velocity arrows (accent colour). */
const vArrows = (svg: string) =>
  [
    ...svg.matchAll(
      /<line x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)" stroke="var\(--dg-accent/g,
    ),
  ].map((m) => m.slice(1).map(Number));
/** Tips of the arrowheads of that colour. */
const tips = (svg: string, colour: string) =>
  [
    ...svg.matchAll(
      new RegExp(`<polygon points="([-\\d.]+),([-\\d.]+) [^"]*" fill="${colour}`, "g"),
    ),
  ].map((m) => [+m[1], +m[2]]);

const CONST = `motion dt=1 v\nobj "cart" x0=0 v0=2 n=5`;
const SPEEDING = `motion dt=1 v a\nobj "car" x0=0 v0=0 a=2 n=4`;
const SLOWING = `motion dt=0.5 v a num\nobj "puck" x0=0 v0=8 a=-4 n=4`;
const TWO = `motion dt=1 v "Car catches truck"\nobj "truck" x0=0 v0=6 n=6\nobj "car" x0=0 v0=0 a=2 n=6`;
const PIECEWISE = `motion dt=1 v a axis unit=m\nobj "bus" x0=0 v0=6 a=0 n=3\nseg a=-2 n=3`;
const THROWN = `motion dt=0.5 vertical v a num\nobj "ball" x0=0 v0=15 a=-10 n=6`;
const ALL = [CONST, SPEEDING, SLOWING, TWO, PIECEWISE, THROWN];

describe("motion", () => {
  it.each(ALL)("draws cleanly (%#)", (src) => {
    const r = render(src);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.ok).toBe(true);
    expect(isSafeSvg(r.svg)).toBe(true);
    expect(labelOverlaps(r.svg)).toEqual([]);
  });

  it("spaces the dots evenly at constant velocity", () => {
    const d = dots(render(CONST).svg);
    expect(d).toHaveLength(6);
    const gaps = d.slice(1).map((p, i) => p[0] - d[i][0]);
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0], 1);
    expect(gaps[0]).toBeGreaterThan(0);
  });

  it("spaces the dots as x = x0 + v0·t + a·t²/2", () => {
    // from rest with a = 2: x = t² -> 0, 1, 4, 9, 16
    const d = dots(render(SPEEDING).svg).map((p) => p[0]);
    const unit = d[1] - d[0];
    expect((d[2] - d[0]) / unit).toBeCloseTo(4, 1);
    expect((d[3] - d[0]) / unit).toBeCloseTo(9, 1);
    expect((d[4] - d[0]) / unit).toBeCloseTo(16, 1);
    expect(render(SPEEDING).alt).toContain("dots at 0, 1, 4, 9, 16");
    // v0 = 8, a = −4, dt = 0.5: x = 8t − 2t² -> 0, 3.5, 6, 7.5, 8
    expect(render(SLOWING).alt).toContain("dots at 0, 3.5, 6, 7.5, 8");
  });

  it("makes velocity arrows proportional to the velocity, and none at rest", () => {
    // v = 0, 2, 4, 6, 8: no arrow on the first dot, then lengths in the ratio 1 : 2 : 3 : 4
    const tip = tips(render(SPEEDING).svg, "var\\(--dg-accent");
    const d = dots(render(SPEEDING).svg);
    expect(tip).toHaveLength(4);
    const len = tip.map((t, i) => t[0] - d[i + 1][0] - 6.5); // arrows start 6.5 px from the dot
    expect(len[1] / len[0]).toBeCloseTo(2, 1);
    expect(len[2] / len[0]).toBeCloseTo(3, 1);
    expect(len[3] / len[0]).toBeCloseTo(4, 1);
    expect(vArrows(render(SPEEDING).svg)).toHaveLength(4);
  });

  it("points the acceleration arrow against the motion when slowing", () => {
    const a = tips(render(SLOWING).svg, "var\\(--dg-force");
    const v = tips(render(SLOWING).svg, "var\\(--dg-accent");
    const d = dots(render(SLOWING).svg);
    expect(a).toHaveLength(1);
    expect(v[0][0]).toBeGreaterThan(d[0][0]); // moving right
    const aTail = [
      ...render(SLOWING).svg.matchAll(
        /<line x1="([-\d.]+)" y1="[-\d.]+" x2="[-\d.]+" y2="[-\d.]+" stroke="var\(--dg-force/g,
      ),
    ].map((m) => +m[1]);
    expect(a[0][0]).toBeLessThan(aTail[0]); // the a arrow points left
    expect(render(SLOWING).alt).toContain("slowing down (a = −4, 4 steps)");
  });

  it("draws two objects to the same scale so they can be compared", () => {
    const d = dots(render(TWO).svg);
    expect(d).toHaveLength(14);
    const truck = d.slice(0, 7),
      car = d.slice(7);
    // both start together and meet again at t = 6 (x = 36)
    expect(car[0][0]).toBeCloseTo(truck[0][0], 1);
    expect(car[6][0]).toBeCloseTo(truck[6][0], 1);
    // at t = 3 the truck (18) is ahead of the car (9) by exactly half the truck's distance
    expect((car[3][0] - car[0][0]) / (truck[3][0] - truck[0][0])).toBeCloseTo(0.5, 1);
    // separate tracks
    expect(car[0][1]).toBeGreaterThan(truck[0][1]);
  });

  it("carries position and velocity from one segment into the next", () => {
    // 6 m/s for 3 s -> 0, 6, 12, 18; then a = −2: 18 + 6t − t² -> 23, 26, 27
    const r = render(PIECEWISE);
    expect(r.alt).toContain("dots at 0, 6, 12, 18, 23, 26, 27");
    expect(r.alt).toContain(
      "constant velocity (a = 0, 3 steps), then slowing down (a = −2, 3 steps)",
    );
    expect(r.svg).toContain("a = 0");
    expect(r.svg).toMatch(/>x \(m\)<\/text>/);
  });

  it("goes up the page with vertical, and puts the way back on a second row", () => {
    // v0 = 15, a = −10, dt = 0.5: y = 0, 6.25, 10, 11.25, 10, 6.25, 0
    const r = render(THROWN);
    expect(r.alt).toContain("dots at 0, 6.25, 10, 11.25, 10, 6.25, 0");
    expect(r.alt).toContain("slows, stops and turns round");
    const d = dots(r.svg);
    expect(d[1][1]).toBeLessThan(d[0][1]); // up the page
    expect(d[3][1]).toBeLessThan(d[2][1]); // the top
    expect(d[5][1]).toBeCloseTo(d[1][1], 1); // same height on the way down...
    expect(d[5][0]).toBeGreaterThan(d[1][0]); // ...on its own row
    expect(d[0][0]).toBeCloseTo(d[3][0], 1);
  });

  it("numbers the dots from t0", () => {
    const r = render(`motion dt=2 num\nobj "late" x0=0 v0=1 n=2 t0=4`);
    expect(r.errors).toEqual([]);
    expect(r.svg).toMatch(/>2<\/text>[\s\S]*>3<\/text>[\s\S]*>4<\/text>/);
  });

  it("is deterministic and within budget", () => {
    for (const src of ALL) {
      const t0 = performance.now();
      const r = render(src);
      expect(performance.now() - t0).toBeLessThan(50);
      expect(r.svg).toBe(render(src).svg);
      expect(r.svg.length).toBeLessThan(8000);
    }
  });
});

describe("motion: errors and warnings", () => {
  const errs = (src: string) => render(src).errors;
  it("needs an object with a number of steps", () => {
    expect(errs(`motion dt=1`)[0]).toMatchObject({ line: 1 });
    expect(errs(`motion dt=1\nobj "a" v0=2`)[0]).toMatchObject({ line: 2 });
    expect(errs(`motion dt=1\nobj "a" v0=2 n=2.5`)[0].msg).toMatch(/whole number of time steps/);
  });
  it("keeps one time step for every object", () => {
    const e = errs(`motion dt=1\nobj "a" v0=2 n=3\nobj "b" v0=1 n=3 dt=2`);
    expect(e[0]).toMatchObject({ line: 3 });
    expect(e[0].msg).toMatch(/dt goes on the first line/);
  });
  it("rejects a seg with nothing to continue, unknown options and unknown commands", () => {
    expect(errs(`motion dt=1\nseg a=1 n=2`)[0].msg).toMatch(/put an obj line above/);
    expect(errs(`motion dt=1\nobj "a" speed=3 n=2`)[0].msg).toMatch(/no "speed="/);
    expect(errs(`motion dt=1\ndot 1 2 3`)[0]).toMatchObject({ line: 2 });
    expect(errs(`motion dt=0\nobj "a" v0=1 n=2`)[0].msg).toMatch(/dt must be positive/);
    expect(errs(`motion dt=1 sideways\nobj "a" v0=1 n=2`)[0].msg).toMatch(/no "sideways"/);
  });
  it("limits the number of dots", () => {
    expect(errs(`motion dt=1\nobj "a" v0=1 n=60`)[0].msg).toMatch(/too many to read/);
  });
  it("warns when moving dots would be drawn on top of each other", () => {
    const r = render(`motion dt=1\nobj "a" v0=0.01 n=3\nobj "b" v0=10 n=3`);
    expect(r.warnings[0]).toMatchObject({ kind: "readability", line: 2 });
  });
  it("escapes markup", () => {
    const r = render(`motion dt=1 "<script>x</script>"\nobj "<img onerror=x>" v0=1 n=2`);
    expect(isSafeSvg(r.svg)).toBe(true);
    expect(r.svg).not.toMatch(/<script|<img/);
  });
});
