// wave: standing waves, a travelling wave, superposed pulses, slit patterns. All computed.
import { render } from "../src/lib/diagram";
import { labelOverlaps } from "../src/lib/diagram/check";
import { isSafeSvg } from "../src/lib/diagram/safe";

type Wave = NonNullable<ReturnType<typeof render>["wave"]>;
type OfKind<M, K> = M extends { kind: infer T } ? (K extends T ? M : never) : never;
const model = <K extends Wave["kind"]>(src: string, kind: K) => {
  const m = render(src).wave;
  if (!m || m.kind !== kind) throw new Error(`expected a ${kind} wave`);
  return m as OfKind<Wave, K>;
};
const errs = (src: string) =>
  render(src)
    .errors.map((e) => `${e.line}: ${e.msg}`)
    .join("\n");
const close = (a: number[], b: number[]) => {
  expect(a).toHaveLength(b.length);
  a.forEach((x, i) => expect(x).toBeCloseTo(b[i], 9));
};

const STRING3 = `wave string n=3`;
const FREE5 = `wave string free n=5 L=1.2 unit=m num=all`;
const OPEN2 = `wave pipe n=2`;
const CLOSED3 = `wave pipe closed n=3 L=0.6 unit=m num`;
const TRAVEL = `wave travel lambda=2 A=0.5 unit=m num v=right`;
const CONSTRUCTIVE = `wave pulses\npulse 4 h=1 w=4 v=right\npulse 5 h=1 w=2 v=left`;
const CREST_TROUGH = `wave pulses num\npulse 4 h=2 w=4 tri v=right\npulse 5 h=-1 w=2 rect v=left`;
const DOUBLE = `wave double orders=3`;
const DOUBLE_ENV = `wave double orders=4 da=4 lambda=600nm d=0.2mm L=1.5m num=all`;
const SINGLE = `wave single lambda=500nm a=0.05mm L=2m num`;
const ALL = [
  STRING3,
  FREE5,
  OPEN2,
  CLOSED3,
  TRAVEL,
  CONSTRUCTIVE,
  CREST_TROUGH,
  DOUBLE,
  DOUBLE_ENV,
  SINGLE,
];

describe("wave", () => {
  it.each(ALL)("draws cleanly (%#)", (src) => {
    const r = render(src);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.ok).toBe(true);
    expect(isSafeSvg(r.svg)).toBe(true);
    expect(labelOverlaps(r.svg)).toEqual([]);
  });

  describe("standing waves", () => {
    it("string fixed at both ends: n half-wavelengths fit", () => {
      // n = 3: L = 3λ/2 -> λ = 2L/3. Nodes every L/3 (4 of them), antinodes half-way between (3).
      const m = model(STRING3, "standing");
      close(m.nodes, [0, 1 / 3, 2 / 3, 1]);
      close(m.antinodes, [1 / 6, 1 / 2, 5 / 6]);
      expect(m.wavelengthOverL).toBeCloseTo(2 / 3, 12);
      expect(m.ends).toEqual(["fixed", "fixed"]);
      const r = render(STRING3);
      expect(r.alt).toContain("4 nodes at 0, L/3, 2L/3, L; 3 antinodes at L/6, L/2, 5L/6");
      expect(r.alt).toContain("Wavelength 2L/3");
      expect(r.visible.filter((t) => t === "N")).toHaveLength(4);
      expect(r.visible.filter((t) => t === "A")).toHaveLength(3);
      // node dots sit at 0, 120, 240, 360 px of a 360 px string
      const dots = [...r.svg.matchAll(/<circle cx="([-\d.]+)" cy="0" r="3"/g)].map((x) => +x[1]);
      close(dots, [0, 120, 240, 360]);
    });

    it("string with one free end: an odd number of quarter-wavelengths fit", () => {
      // n = 5: L = 5λ/4 -> λ = 4L/5 = 0.96 m for L = 1.2 m. Node at the fixed end, antinode at the free end.
      const m = model(FREE5, "standing");
      close(m.nodes, [0, 0.4, 0.8]);
      close(m.antinodes, [0.2, 0.6, 1]);
      expect(m.wavelength).toBeCloseTo(0.96, 12);
      expect(m.ends).toEqual(["fixed", "free"]);
      const r = render(FREE5);
      expect(r.visible).toEqual(expect.arrayContaining(["L = 1.2 m", "λ = 0.96 m"]));
      expect(r.alt).toContain("the third mode; even harmonics do not exist here");
      // n = 3: λ = 4L/3 is longer than the string, so no λ mark is drawn
      expect(render(`wave string free n=3`).visible).not.toContain("λ");
      expect(model(`wave string free n=3`, "standing").wavelengthOverL).toBeCloseTo(4 / 3, 12);
    });

    it("pipe open at both ends: displacement antinodes at the ends", () => {
      // n = 2: λ = L. Antinodes at 0, L/2, L; nodes at L/4, 3L/4.
      const m = model(OPEN2, "standing");
      close(m.antinodes, [0, 0.5, 1]);
      close(m.nodes, [0.25, 0.75]);
      expect(m.wavelengthOverL).toBe(1);
      expect(render(OPEN2).alt).toContain("the curve shows the displacement of the air");
    });

    it("pipe closed at one end: node at the closed end, antinode at the open end", () => {
      // n = 3: L = 3λ/4 -> λ = 4L/3 = 0.8 m for L = 0.6 m. Nodes at 0, 2L/3; antinodes at L/3, L.
      const m = model(CLOSED3, "standing");
      close(m.nodes, [0, 2 / 3]);
      close(m.antinodes, [1 / 3, 1]);
      expect(m.wavelength).toBeCloseTo(0.8, 12);
      expect(m.ends).toEqual(["closed", "open"]);
      // num prints the given length; the computed wavelength needs num=all
      const v = render(CLOSED3).visible.join(" | ");
      expect(v).toContain("L = 0.6 m");
      expect(v).not.toContain("0.8");
    });

    it("rejects harmonics that cannot exist", () => {
      expect(errs(`wave pipe closed n=2`)).toContain(
        "1: a pipe closed at one end and open at the other has only odd harmonics (n = 1, 3, 5, …)",
      );
      expect(errs(`wave pipe closed n=2`)).toContain("n=2 is impossible. Use n=1 or n=3");
      expect(errs(`wave string free n=4`)).toContain("has only odd harmonics");
      expect(render(`wave pipe closed n=2`).svg).toBe("");
      // the fundamental and the open pipe's even harmonics are fine
      expect(render(`wave pipe closed n=1`).ok).toBe(true);
      expect(render(`wave pipe n=4`).ok).toBe(true);
      expect(errs(`wave string n=0`)).toContain("whole number from 1");
      expect(errs(`wave string n=2.5`)).toContain("whole number from 1");
      expect(errs(`wave string n=13`)).toContain("too crowded");
      expect(errs(`wave string`)).toContain("needs the harmonic");
      expect(errs(`wave string n=2 loud`)).toContain('wave has no "loud"');
    });
  });

  it("travelling wave: λ and A are marked, with values only when asked", () => {
    expect(model(TRAVEL, "travelling")).toMatchObject({ wavelength: 2, amplitude: 0.5 });
    expect(render(TRAVEL).visible).toEqual(expect.arrayContaining(["λ = 2 m", "A = 0.5 m", "v"]));
    expect(render(`wave travel lambda=2 A=0.5`).visible).toEqual(["λ", "A"]);
    expect(render(`wave travel`).ok).toBe(true);
    // the λ mark spans exactly one wavelength: crest (λ/4) to crest (5λ/4), 152 px apart at 2.5 cycles
    const svg = render(`wave travel`).svg;
    const mark = svg.match(/<line x1="([\d.]+)" y1="-54" x2="([\d.]+)" y2="-54"/)!;
    expect(+mark[2] - +mark[1]).toBeCloseTo(380 / 2.5, 1);
    expect(errs(`wave travel v=up`)).toContain("v must be right or left");
    expect(errs(`wave travel lambda=-1`)).toContain("lambda must be positive");
  });

  describe("superposition", () => {
    it("adds overlapping pulses point by point", () => {
      // triangle A: height 1, from x = 2 to 6, peak at 4. Triangle B: height 1, from 4 to 6, peak at 5.
      // at x = 4: A = 1, B = 0 -> 1.   at 4.5: A = 0.75, B = 0.5 -> 1.25.   at 5: A = 0.5, B = 1 -> 1.5 (max)
      const m = model(CONSTRUCTIVE, "superposition");
      expect(m.at(4)).toBeCloseTo(1, 9);
      expect(m.at(4.5)).toBeCloseTo(1.25, 9);
      expect(m.at(5)).toBeCloseTo(1.5, 9);
      expect(m.at(1)).toBe(0);
      expect(m.max).toBeCloseTo(1.5, 6);
      expect(m.min).toBeCloseTo(0, 6);
      expect(render(CONSTRUCTIVE).alt).toContain("greatest displacement 1.5 at x = 5");
    });

    it("a trough cuts into a crest, steps and all", () => {
      // triangle: height 2, 2..6, peak at 4. Rectangle: −1 from 4 to 6.
      // just left of 4: 2; just right: 2 − 1 = 1; at 5: 1 − 1 = 0; just left of 6: 0 − 1 = −1
      const m = model(CREST_TROUGH, "superposition");
      expect(m.max).toBeCloseTo(2, 5);
      expect(m.min).toBeCloseTo(-1, 5);
      expect(m.at(5)).toBeCloseTo(0, 9);
      expect(m.sum.filter((p) => p[0] === 4)).toHaveLength(2); // the step at x = 4
      const r = render(CREST_TROUGH);
      // num numbers the grid: those are scale numbers, not claims
      expect(r.scale).toEqual(expect.arrayContaining(["1", "4", "7", "−1", "2"]));
      expect(r.visible).toEqual(["pulses", "sum"]);
    });

    it("equal and opposite pulses in the same place cancel completely", () => {
      const src = `wave pulses xr=0..8\npulse 4 h=1 w=2 rect\npulse 4 h=-1 w=2 rect`;
      const m = model(src, "superposition");
      expect(m.max).toBeCloseTo(0, 9);
      expect(m.min).toBeCloseTo(0, 9);
      expect(render(src).alt).toContain("their sum: nowhere above the rest position");
    });

    it("says so when the pulses do not overlap, and rejects bad pulses", () => {
      const r = render(`wave pulses\npulse 2 h=1 w=2\npulse 7 h=1 w=2`);
      expect(r.warnings.map((w) => w.kind)).toEqual(["readability"]);
      expect(errs(`wave pulses\npulse 3 h=1 w=2`)).toContain("needs two pulse lines");
      expect(errs(`wave pulses\npulse 3 h=1 w=0\npulse 4`)).toContain(
        "2: the pulse width w must be positive",
      );
      expect(errs(`wave pulses\npulse 3 h=1 w=2 wavy\npulse 4`)).toContain('pulse has no "wavy"');
      expect(errs(`wave pulses\npulse h=1\npulse 4`)).toContain(
        "2: pulse needs the position of its centre",
      );
    });
  });

  describe("slit patterns", () => {
    it("double slit: bright at whole orders, dark half-way", () => {
      const m = model(DOUBLE, "double-slit");
      for (const u of [0, 1, -2, 3]) expect(m.intensity(u)).toBeCloseTo(1, 9);
      for (const u of [0.5, -1.5, 2.5]) expect(m.intensity(u)).toBeCloseTo(0, 9);
      expect(m.spacing).toBeUndefined();
      // the order numbers are tick labels (scale), not claims
      expect(render(DOUBLE).visible).toEqual(expect.arrayContaining(["central maximum", "m ="]));
      expect(render(DOUBLE).scale).toEqual(["−3", "−2", "−1", "0", "1", "2", "3"]);
    });

    it("double slit with finite slits: the envelope dims and removes orders; fringe spacing λL/d", () => {
      // spacing = λL/d = 600e-9 × 1.5 / 0.2e-3 = 4.5e-3 m = 4.5 mm
      // order 1 under the envelope: (sin(π/4) / (π/4))² = (0.70711 / 0.78540)² = 0.8106
      // d/a = 4: order 4 falls on the envelope's first zero and is missing
      const m = model(DOUBLE_ENV, "double-slit");
      expect(m.spacing).toBeCloseTo(4.5e-3, 12);
      expect(m.intensity(1)).toBeCloseTo(0.8106, 4);
      expect(m.intensity(4)).toBeCloseTo(0, 9);
      expect(m.missing).toEqual([4]);
      const r = render(DOUBLE_ENV);
      expect(r.alt).toContain("order ±4 missing");
      expect(r.alt).toContain("Fringe spacing λL/d = 4.5 mm");
      expect(r.visible).toEqual(
        expect.arrayContaining([
          "4.5 mm",
          "−9 mm",
          "13.5 mm",
          "λ = 600 nm,  d = 0.2 mm,  L = 1.5 m",
        ]),
      );
      expect(r.scale).not.toContain("4"); // the missing order is not labelled
    });

    it("single slit: dark fringes at whole m, a central maximum twice as wide", () => {
      // dark-fringe spacing λL/a = 500e-9 × 2 / 0.05e-3 = 0.02 m; central maximum 4 cm wide
      // first side maximum near u = 1.5: (sin(1.5π) / 1.5π)² = 1 / 22.2 = 0.0450
      const m = model(SINGLE, "single-slit");
      expect(m.spacing).toBeCloseTo(0.02, 12);
      expect(m.intensity(0)).toBe(1);
      for (const u of [1, -1, 2, 3]) expect(m.intensity(u)).toBeCloseTo(0, 9);
      expect(m.intensity(1.5)).toBeCloseTo(0.045, 3);
      const r = render(SINGLE);
      expect(r.alt).toContain(
        "Dark fringes are λL/a = 2 cm apart; the central maximum is 4 cm wide",
      );
      expect(r.scale).not.toContain("0"); // m = 0 is not a dark fringe
      expect(r.visible.join(" ")).not.toContain("cm"); // num prints the givens only
    });

    it("rejects impossible slits", () => {
      expect(errs(`wave double da=1`)).toContain("must be more than 1");
      expect(errs(`wave double orders=9`)).toContain("whole number from 1 to 5");
      expect(errs(`wave single lambda=green`)).toContain(
        "lambda needs a positive length such as 500nm",
      );
      expect(errs(`wave single d=1mm`)).toContain('wave has no "d="');
    });
  });

  it("asks for a situation when none is named", () => {
    expect(errs(`wave`)).toContain("wave needs a situation");
    expect(errs(`wave string n=2\npulse 3`)).toContain(
      '2: wave string takes everything on its first line; it has no "pulse"',
    );
  });
});
