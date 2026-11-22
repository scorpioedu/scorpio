// ray: lenses, mirrors and refraction. The image and the refracted ray are computed, never placed.
import { render } from "../src/lib/diagram";
import { labelOverlaps } from "../src/lib/diagram/check";
import { isSafeSvg } from "../src/lib/diagram/safe";

const lensOrMirror = (src: string) => {
  const m = render(src).ray;
  if (!m || m.kind === "refraction") throw new Error("not a lens or mirror");
  return m;
};
const refraction = (src: string) => {
  const m = render(src).ray;
  if (!m || m.kind !== "refraction") throw new Error("not a refraction");
  return m;
};
/** Ray segments (accent colour): [x1, y1, x2, y2, dashed]. */
const rays = (svg: string) =>
  [
    ...svg.matchAll(
      /<line x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)"( stroke-dasharray="5 4")? stroke="var\(--dg-accent/g,
    ),
  ].map((m) => ({ a: [+m[1], +m[2]], b: [+m[3], +m[4]], dashed: !!m[5] }));
/** Tips of the object and image arrows, in drawing order. */
const tips = (svg: string) =>
  [
    ...svg.matchAll(
      /<polygon points="([-\d.]+),([-\d.]+) [^"]*" fill(?:-opacity=".55" fill)?="currentColor"/g,
    ),
  ].map((m) => [+m[1], +m[2]]);
const distToLine = (p: number[], a: number[], b: number[]) =>
  Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) /
  Math.hypot(b[0] - a[0], b[1] - a[1]);

const CONVERGING = `ray lens f=10 unit=cm\nobj 30 h=4`;
const MAGNIFIER = `ray lens f=10 unit=cm num=all\nobj 6 h=2`;
const DIVERGING = `ray lens f=-10 unit=cm\nobj 15 h=4 "candle"`;
const CONCAVE = `ray mirror f=10 unit=cm num\nobj 25 h=4`;
const CONVEX = `ray mirror convex f=12 unit=cm\nobj 20 h=5`;
const PLANE = `ray mirror plane\nobj 8 h=3`;
const AT_F = `ray lens f=10 unit=cm\nobj 10 h=3`;
const SETUP = `ray lens f=12 unit=cm num setup\nobj 18 h=3`;
const AIR_GLASS = `ray refract n1=1 n2=1.5 in=40 m1="air" m2="glass"`;
const WATER_AIR = `ray refract n1=1.33 n2=1 in=30 up reflect num=all m1="water" m2="air"`;
const TIR = `ray refract n1=1.5 n2=1 in=50 up m1="glass" m2="air"`;
const ALL = [
  CONVERGING,
  MAGNIFIER,
  DIVERGING,
  CONCAVE,
  CONVEX,
  PLANE,
  AT_F,
  SETUP,
  AIR_GLASS,
  WATER_AIR,
  TIR,
];

describe("ray: lenses and mirrors", () => {
  it.each(ALL)("draws cleanly (%#)", (src) => {
    const r = render(src);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.ok).toBe(true);
    expect(isSafeSvg(r.svg)).toBe(true);
    expect(labelOverlaps(r.svg)).toEqual([]);
  });

  it("converging lens, object beyond 2F", () => {
    // 1/di = 1/10 − 1/30 = 2/30 -> di = 15; m = −15/30 = −0.5; hi = −0.5 × 4 = −2
    const m = lensOrMirror(CONVERGING);
    expect(m.di).toBeCloseTo(15, 9);
    expect(m.m).toBeCloseTo(-0.5, 9);
    expect(m.hi).toBeCloseTo(-2, 9);
    expect(m).toMatchObject({ kind: "lens", f: 10, do: 30, ho: 4, real: true, upright: false });
    const alt = render(CONVERGING).alt;
    expect(alt).toContain("converging lens, focal length 10 cm");
    expect(alt).toContain("Image: real, inverted, reduced, 15 cm from the lens on the far side");
    expect(alt).toContain("height 2 cm (magnification −0.5)");
  });

  it("draws every outgoing ray through the image point", () => {
    for (const src of [CONVERGING, CONCAVE]) {
      const { svg } = render(src);
      const [, image] = tips(svg);
      const out = rays(svg).filter((r) => Math.abs(r.a[0]) < 0.01 && !r.dashed);
      expect(out).toHaveLength(3);
      for (const r of out) expect(distToLine(image, r.a, r.b)).toBeLessThan(0.6);
    }
    // a virtual image: the dashed back-extensions meet at it
    for (const src of [MAGNIFIER, DIVERGING, CONVEX, PLANE]) {
      const { svg } = render(src);
      const [, image] = tips(svg);
      const back = rays(svg).filter((r) => r.dashed && Math.abs(r.a[0]) < 0.01);
      const through = back.filter((r) => distToLine(image, r.a, r.b) < 0.6);
      expect(through.length).toBeGreaterThanOrEqual(2);
      // any other dashed line is a ray's aim at a focal point, which is on the axis
      for (const r of back.filter((x) => !through.includes(x))) expect(r.b[1]).toBeCloseTo(0, 5);
    }
  });

  it("converging lens, object inside the focal length: a virtual, upright, enlarged image", () => {
    // 1/di = 1/10 − 1/6 = −1/15 -> di = −15; m = 15/6 = 2.5; hi = 5
    const m = lensOrMirror(MAGNIFIER);
    expect(m.di).toBeCloseTo(-15, 9);
    expect(m.m).toBeCloseTo(2.5, 9);
    expect(m.hi).toBeCloseTo(5, 9);
    expect(m).toMatchObject({ real: false, upright: true });
    const r = render(MAGNIFIER);
    expect(r.alt).toContain(
      "Image: virtual, upright, enlarged, 15 cm from the lens on the same side",
    );
    // the virtual image's arrow is dashed, and num=all prints the computed distance and height
    expect(r.svg).toMatch(/<line stroke-dasharray="5 4" [^>]*stroke="currentColor"/);
    expect(r.visible).toEqual(
      expect.arrayContaining(["d_{o} = 6 cm", "f = 10 cm", "d_{i} = −15 cm"]),
    );
    expect(r.visible.join(" ")).toContain("h_{i} = 5 cm");
  });

  it("diverging lens", () => {
    // 1/di = −1/10 − 1/15 = −1/6 -> di = −6; m = 6/15 = 0.4; hi = 1.6
    const m = lensOrMirror(DIVERGING);
    expect(m.f).toBe(-10);
    expect(m.di).toBeCloseTo(-6, 9);
    expect(m.m).toBeCloseTo(0.4, 9);
    expect(render(DIVERGING).alt).toContain("Candle 15 cm in front");
    // the word decides the sign
    expect(lensOrMirror(`ray lens diverging f=10\nobj 15`).f).toBe(-10);
    expect(lensOrMirror(`ray converging f=-10\nobj 15`).f).toBe(10);
  });

  it("concave mirror", () => {
    // 1/di = 1/10 − 1/25 = 3/50 -> di = 16.67 (in front: real); m = −16.67/25 = −0.667
    const m = lensOrMirror(CONCAVE);
    expect(m.di).toBeCloseTo(50 / 3, 9);
    expect(m.m).toBeCloseTo(-2 / 3, 9);
    expect(m).toMatchObject({ kind: "mirror", real: true, upright: false });
    expect(render(CONCAVE).alt).toContain("16.7 cm from the mirror in front of the mirror");
    // num prints what was given, not what is computed
    const v = render(CONCAVE).visible.join(" | ");
    expect(v).toContain("d_{o} = 25 cm");
    expect(v).toContain("h_{o} = 4 cm");
    expect(v).not.toContain("d_{i}");
    expect(v).not.toContain("16.7");
    // R = 2f
    expect(lensOrMirror(`ray mirror R=20\nobj 25 h=4`).di).toBeCloseTo(50 / 3, 9);
  });

  it("convex mirror", () => {
    // 1/di = −1/12 − 1/20 = −8/60 -> di = −7.5 (behind: virtual); m = 7.5/20 = 0.375
    const m = lensOrMirror(CONVEX);
    expect(m.f).toBe(-12);
    expect(m.di).toBeCloseTo(-7.5, 9);
    expect(m.m).toBeCloseTo(0.375, 9);
    expect(render(CONVEX).alt).toContain(
      "virtual, upright, reduced, 7.5 cm from the mirror behind the mirror",
    );
  });

  it("plane mirror: the image is as far behind as the object is in front, the same size", () => {
    const m = lensOrMirror(PLANE);
    expect(m).toMatchObject({ f: null, di: -8, m: 1, hi: 3, real: false, upright: true });
    expect(render(PLANE).alt).toContain(
      "virtual, upright, the same size, 8 from the mirror behind",
    );
  });

  it("an object at the focal point: parallel rays, no image, no crash", () => {
    const r = render(AT_F);
    expect(r.ok).toBe(true);
    expect(lensOrMirror(AT_F)).toMatchObject({ di: null, hi: null, m: null, atInfinity: true });
    expect(r.alt).toContain(
      "the rays leave parallel and no image forms (the image is at infinity)",
    );
    // the two refracted rays have the same slope (−h/f on screen terms)
    const out = rays(r.svg).filter((x) => Math.abs(x.a[0]) < 0.01 && !x.dashed);
    expect(out).toHaveLength(2);
    const slope = (x: (typeof out)[0]) => (x.b[1] - x.a[1]) / (x.b[0] - x.a[0]);
    expect(slope(out[0])).toBeCloseTo(slope(out[1]), 2);
    expect(tips(r.svg)).toHaveLength(1); // only the object
    expect(render(`ray mirror f=10\nobj 10 h=3`).ray).toMatchObject({ atInfinity: true });
  });

  it("warns when the image is far off the picture", () => {
    // 1/di = 1/10 − 1/10.2 -> di = 510
    const r = render(`ray lens f=10\nobj 10.2 h=3`);
    expect(r.ok).toBe(true);
    expect(lensOrMirror(`ray lens f=10\nobj 10.2 h=3`).di).toBeCloseTo(510, 6);
    expect(r.warnings.map((w) => w.kind)).toEqual(["readability"]);
    expect(r.alt).toContain("it is off the picture");
  });

  it("setup draws the object and the element only", () => {
    const r = render(SETUP);
    expect(rays(r.svg)).toHaveLength(0);
    expect(tips(r.svg)).toHaveLength(1);
    expect(r.alt).not.toContain("Image:");
    expect(r.visible).not.toContain("image");
    // the model is still there for the answer key: 1/di = 1/12 − 1/18 = 1/36
    expect(lensOrMirror(SETUP).di).toBeCloseTo(36, 9);
  });

  it("shows no numbers unless asked", () => {
    expect(render(CONVERGING).visible.join(" ").replace(/2F/g, "")).not.toMatch(/\d/);
    expect(render(CONVERGING).visible).toEqual(
      expect.arrayContaining(["object", "image", "F", "2F"]),
    );
    expect(render(CONCAVE).visible).toEqual(expect.arrayContaining(["F", "C"]));
  });

  it("reports mistakes with the line they are on", () => {
    const err = (src: string) =>
      render(src)
        .errors.map((e) => `${e.line}: ${e.msg}`)
        .join("\n");
    expect(err(`ray lens\nobj 30`)).toContain("1: ray lens needs a focal length: f=10");
    expect(err(`ray lens f=0\nobj 30`)).toContain("focal length cannot be 0");
    expect(err(`ray lens f=10`)).toContain("1: ray needs an object: obj 30 h=4");
    expect(err(`ray lens f=10\nobj -5`)).toContain("2: the object distance must be positive");
    expect(err(`ray lens f=10\nobj 30\nobj 40`)).toContain("3: ray draws one object");
    expect(err(`ray f=10\nobj 30`)).toContain("ray needs an element");
    expect(err(`ray lens plane\nobj 30`)).toContain("only a mirror can be plane");
    expect(err(`ray lens f=10 big\nobj 30`)).toContain('ray has no "big"');
    expect(err(`ray lens f=10\nimage 15`)).toContain('2: ray has no "image"');
    expect(render(`ray lens f=10\nobj -5`).svg).toBe("");
  });
});

describe("ray: refraction at a flat boundary", () => {
  it("bends towards the normal entering glass (Snell's law)", () => {
    // sin θ2 = sin 40° / 1.5 = 0.64279 / 1.5 = 0.42853 -> θ2 = 25.37°
    const m = refraction(AIR_GLASS);
    expect(m.theta2).toBeCloseTo(25.374, 2);
    expect(m).toMatchObject({ tir: false, critical: null, theta1: 40 });
    const r = render(AIR_GLASS);
    expect(r.alt).toContain("refracts at 25.4° from the normal, bending towards the normal");
    // no numbers without num: the angles are named
    expect(r.visible).toEqual(expect.arrayContaining(["θ_{1}", "θ_{2}", "normal"]));
    expect(r.visible.join(" ")).not.toMatch(/\d\d/);
  });

  it("bends away from the normal leaving water, and knows the critical angle", () => {
    // sin θ2 = 1.33 × sin 30° = 0.665 -> θ2 = 41.68°; critical = asin(1/1.33) = 48.75°
    const m = refraction(WATER_AIR);
    expect(m.theta2).toBeCloseTo(41.68, 2);
    expect(m.critical).toBeCloseTo(48.75, 2);
    const r = render(WATER_AIR);
    expect(r.alt).toContain("bending away from the normal; the reflected ray leaves at 30°");
    expect(r.visible).toEqual(expect.arrayContaining(["30°", "41.7°"]));
    // num alone keeps the computed angle back
    const given = render(WATER_AIR.replace("num=all", "num")).visible;
    expect(given).toContain("30°");
    expect(given).toContain("θ_{2}");
    expect(given.join(" ")).not.toContain("41.7");
  });

  it("draws total internal reflection beyond the critical angle", () => {
    // 1.5 × sin 50° = 1.149 > 1: no refracted ray. critical = asin(1/1.5) = 41.81°
    const m = refraction(TIR);
    expect(m).toMatchObject({ tir: true, theta2: null });
    expect(m.critical).toBeCloseTo(41.81, 2);
    const r = render(TIR);
    expect(r.ok).toBe(true);
    expect(r.alt).toContain(
      "beyond the critical angle of 41.8°, so the ray is totally internally reflected at 50°",
    );
    // two full-strength rays (in and reflected), both on the incident side of the boundary
    const drawn = rays(r.svg);
    expect(drawn).toHaveLength(2);
    for (const x of drawn) expect(Math.max(x.a[1], x.b[1])).toBeGreaterThan(0); // below: `up`
    for (const x of drawn) expect(Math.min(x.a[1], x.b[1])).toBeGreaterThanOrEqual(0);
    expect(r.visible).not.toContain("θ_{2}");
    // just inside the critical angle it still refracts
    expect(refraction(`ray refract n1=1.5 n2=1 in=41`).tir).toBe(false);
  });

  it("goes straight through at normal incidence", () => {
    const m = refraction(`ray refract n1=1 n2=1.5 in=0`);
    expect(m.theta2).toBeCloseTo(0, 9);
    expect(render(`ray refract n1=1 n2=1.5 in=0`).ok).toBe(true);
  });

  it("rejects impossible input", () => {
    const err = (src: string) =>
      render(src)
        .errors.map((e) => e.msg)
        .join("\n");
    expect(err(`ray refract n1=1 in=40`)).toContain("needs both indices");
    expect(err(`ray refract n1=1 n2=0.8 in=40`)).toContain("cannot be less than 1");
    expect(err(`ray refract n1=1 n2=1.5`)).toContain("needs the angle of incidence");
    expect(err(`ray refract n1=1 n2=1.5 in=95`)).toContain("must be from 0 to below 90");
    expect(err(`ray refract n1=1 n2=1.5 in=40\nobj 3`)).toContain('it has no "obj"');
  });
});
