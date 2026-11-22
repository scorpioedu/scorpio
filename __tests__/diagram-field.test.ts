// field: electric and magnetic field pictures. Lines, equipotentials and forces are computed from
// the sources, so the tests check the physics of what is drawn, not only that something is.
import { render } from "../src/lib/diagram";
import { auditDiagramBlocks } from "../src/lib/diagram/blocks";
import { renderField, type FieldStats } from "../src/lib/diagram/field";
import { parse } from "../src/lib/diagram/parse";
import { isSafeSvg } from "../src/lib/diagram/safe";

const SINGLE = `field\ncharge 0,0 +1 "+q"`;
const DIPOLE = `field\ncharge -1.5,0 +1 "+q"\ncharge 1.5,0 -1 "−q"`;
const LIKE = `field\ncharge -1.5,0 +1\ncharge 1.5,0 +1\npt 0,0 "P"`;
const UNEQUAL = `field\ncharge -1.5,0 +2 "+2q"\ncharge 1.5,0 -1 "−q"\nequi`;
const PLATES = `field\nplates 0,1.2 0,-1.2 w=5\ntest 0.5,0.2 - "−q"\nequi`;
const GAUSS = `field\ncharge -1,0 +2 "+2q"\ncharge 2,0 -1 "−q"\ngauss circle -1,0 1.2 "S"\ntest 0.6,1.6 + "q_0"`;
const B_IN = `field xr=0..6 yr=0..4\nuniform B in "B"\ntest 2,2 + "q" v=right`;
const WIRE = `field\nwire 0,0 out "I"\npt 1.5,0 "P"`;
const WIRES = `field\nwire -1.2,0 out "I_1"\nwire 1.2,0 in "I_2"`;
const REGIONS = `field xr=0..8 yr=0..4\nuniform E right "E" x=0..3.5\nuniform B out "B" x=4.5..8\ngauss rect 1,1 2.5,3 "S"`;
const IN_FIELD = `field\nuniform E right "E"\ncharge 0,0 +1 "+q"`;
const ALL: [string, string][] = [
  ["a single charge", SINGLE],
  ["a dipole", DIPOLE],
  ["two like charges", LIKE],
  ["unequal charges with equipotentials", UNEQUAL],
  ["parallel plates", PLATES],
  ["a Gaussian surface and a test charge", GAUSS],
  ["a uniform B into the page", B_IN],
  ["a wire", WIRE],
  ["two wires", WIRES],
  ["field regions", REGIONS],
  ["a charge in a uniform field", IN_FIELD],
];

function stats(src: string): FieldStats {
  const errs: never[] = [];
  const r = renderField(parse(src).doc!, errs, []);
  expect(errs).toEqual([]);
  return r.stats!;
}
type Pt = [number, number];
/** Every polyline's points. */
const polylines = (svg: string): Pt[][] =>
  [...svg.matchAll(/<polyline points="([^"]*)"/g)].map((m) =>
    m[1].split(" ").map((p) => p.split(",").map(Number) as Pt),
  );
/** The polylines inside the solid accent-coloured groups: the field lines. */
const fieldLines = (svg: string): Pt[][] =>
  [
    ...svg.matchAll(
      /<g fill="none" stroke="var\(--dg-accent,#2563eb\)" stroke-width="1.2">(.*?)<\/g>/g,
    ),
  ].flatMap((g) => polylines(g[1]));
const dashed = (svg: string): Pt[][] =>
  [
    ...svg.matchAll(/<g fill="none" stroke-width="1" stroke-dasharray="4 3"[^>]*>(.*?)<\/g>/g),
  ].flatMap((g) => polylines(g[1]));
const circle = (svg: string, r: number): Pt[] =>
  [
    ...svg.matchAll(
      new RegExp(`<circle cx="([-\\d.]+)" cy="([-\\d.]+)" r="${r}" fill="var\\(--dg-bg`, "g"),
    ),
  ].map((m) => [+m[1], +m[2]]);
const physics = (src: string) =>
  render(src)
    .warnings.filter((w) => w.kind === "physics")
    .map((w) => w.msg);

describe("field: drawing", () => {
  it.each(ALL)("draws %s cleanly", (_name, src) => {
    const r = render(src);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.ok).toBe(true);
    expect(isSafeSvg(r.svg)).toBe(true);
    expect(r.alt.length).toBeGreaterThan(30);
  });

  it("is deterministic", () => {
    for (const [, src] of ALL) expect(render(src).svg).toBe(render(src).svg);
  });

  it.each(ALL)("stays within the size and time budget: %s", (_name, src) => {
    render(src);
    const t0 = performance.now();
    const r = render(src);
    // typical renders take 1–10 ms; the bound leaves room for a slow CI machine
    expect(performance.now() - t0).toBeLessThan(250);
    expect(r.svg.length).toBeLessThan(20000);
  });
});

describe("field: electric field lines", () => {
  it("draws straight, evenly spaced lines out of a single positive charge", () => {
    const svg = render(SINGLE).svg;
    const [c] = circle(svg, 10);
    const ls = fieldLines(svg);
    expect(ls).toHaveLength(12);
    const angles: number[] = [];
    for (const l of ls) {
      expect(l).toHaveLength(2); // a straight line survives simplification as its two ends
      const [near, far] =
        Math.hypot(l[0][0] - c[0], l[0][1] - c[1]) < Math.hypot(l[1][0] - c[0], l[1][1] - c[1])
          ? l
          : [l[1], l[0]];
      expect(Math.hypot(near[0] - c[0], near[1] - c[1])).toBeCloseTo(10, 0); // starts on the charge
      expect(l[0]).toEqual(near); // drawn from the charge outward
      angles.push(Math.atan2(far[1] - c[1], far[0] - c[0]));
      // the far end lies on the same ray
      expect(Math.atan2(near[1] - c[1], near[0] - c[0])).toBeCloseTo(angles[angles.length - 1], 1);
    }
    angles.sort((a, b) => a - b);
    for (let i = 1; i < angles.length; i++)
      expect(angles[i] - angles[i - 1]).toBeCloseTo(Math.PI / 6, 2);
  });

  it("draws the lines of a negative charge pointing inward", () => {
    const svg = render(`field\ncharge 0,0 -1`).svg;
    const [c] = circle(svg, 10);
    for (const l of fieldLines(svg)) {
      const dFirst = Math.hypot(l[0][0] - c[0], l[0][1] - c[1]),
        dLast = Math.hypot(l[l.length - 1][0] - c[0], l[l.length - 1][1] - c[1]);
      expect(dLast).toBeLessThan(dFirst); // each path runs toward the charge
    }
  });

  it("gives every charge a number of lines proportional to its size", () => {
    expect(stats(SINGLE)).toMatchObject({ left: [12], arrived: [0] });
    expect(stats(DIPOLE)).toMatchObject({ left: [12, 0], arrived: [0, 12] });
    expect(stats(UNEQUAL)).toMatchObject({ left: [24, 0], arrived: [0, 12] });
    expect(stats(`field\ncharge -1.5,0 +4\ncharge 1.5,0 -1`)).toMatchObject({
      left: [32, 0],
      arrived: [0, 8],
    });
    expect(stats(`field\ncharge -1.5,0 +1\ncharge 1.5,0 -4`)).toMatchObject({
      left: [8, 0],
      arrived: [0, 32],
    });
    expect(stats(`field\ncharge -1,0 +3\ncharge 1,0 -1\ncharge 0,1.5 -2`)).toMatchObject({
      left: [24, 0, 0],
      arrived: [0, 8, 16],
    });
    expect(stats(`field lines=6\ncharge 0,0 +1\ncharge 2,0 -1`)).toMatchObject({
      left: [6, 0],
      arrived: [0, 6],
    });
  });

  it("is mirror-symmetric for a dipole", () => {
    const svg = render(DIPOLE).svg;
    const [plus, minus] = circle(svg, 10);
    const axisY = plus[1];
    expect(minus[1]).toBeCloseTo(axisY, 5);
    // every point of every line has a partner reflected in the axis through the charges
    const pts = fieldLines(svg).flat();
    for (const p of pts.filter((_, i) => i % 7 === 0)) {
      const mirror = pts.some(
        (q) => Math.abs(q[0] - p[0]) < 2.5 && Math.abs(q[1] - (2 * axisY - p[1])) < 2.5,
      );
      expect(mirror).toBe(true);
    }
    // one line runs straight from + to −
    expect(
      fieldLines(svg).some(
        (l) =>
          l.length === 2 &&
          Math.abs(l[0][1] - axisY) < 0.5 &&
          l[0][0] > plus[0] &&
          l[1][0] < minus[0],
      ),
    ).toBe(true);
  });

  it("sends no line from one like charge to the other", () => {
    const svg = render(LIKE).svg;
    const [a, b] = circle(svg, 10);
    const mid = (a[0] + b[0]) / 2;
    // lines of the left charge stay left of the midline, and the other way round
    for (const l of fieldLines(svg)) {
      const side = Math.sign(l[0][0] - mid);
      for (const p of l)
        expect(Math.sign(p[0] - mid) === side || Math.abs(p[0] - mid) < 1).toBe(true);
    }
  });

  it("draws plate lines from + to −, straight in the middle and bulging at the edges", () => {
    const svg = render(PLATES.replace("\nequi", "")).svg;
    const ls = fieldLines(svg);
    expect(ls.length).toBe(13);
    for (const l of ls) expect(l[l.length - 1][1]).toBeGreaterThan(l[0][1]); // + plate is on top
    const bow = ls.map((l) => Math.max(...l.map((p) => Math.abs(p[0] - l[0][0]))));
    const sorted = [...ls.keys()].sort((i, j) => ls[i][0][0] - ls[j][0][0]);
    expect(bow[sorted[6]]).toBeLessThan(0.5); // the centre line is straight
    expect(bow[sorted[0]]).toBeGreaterThan(5); // the outermost lines bow outward
    expect(bow[sorted[12]]).toBeGreaterThan(5);
    // evenly spaced where they leave the plate
    const xs = sorted.map((i) => ls[i][0][0]);
    for (let i = 2; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeCloseTo(xs[1] - xs[0], 0);
  });

  it("bends a uniform field round a charge without running a line into the neutral point", () => {
    const s = stats(IN_FIELD);
    expect(s.left).toEqual([12]);
    expect(s.lines).toBe(18); // 12 from the charge, 6 of the uniform field
    // upstream of the charge (x = −1 in world units) the field is zero; no line may end there
    const svg = render(IN_FIELD).svg;
    const [c] = circle(svg, 10);
    for (const l of fieldLines(svg)) {
      const end = l[l.length - 1];
      expect(Math.abs(end[1] - c[1]) < 3 && end[0] < c[0] - 12 && end[0] > 20).toBe(false);
    }
  });

  it("warns instead of drawing hundreds of lines", () => {
    const r = render(`field\ncharge -1,0 +20\ncharge 1,0 -1`);
    expect(r.ok).toBe(true);
    expect(r.warnings[0]).toMatchObject({ kind: "readability" });
    expect(fieldLines(r.svg).length).toBeLessThan(120);
  });
});

describe("field: equipotentials", () => {
  it("are circles round a single charge, closer together near it", () => {
    const svg = render(`${SINGLE}\nequi`).svg;
    const [c] = circle(svg, 10);
    const rings = dashed(svg).filter(
      (l) => Math.hypot(l[0][0] - l[l.length - 1][0], l[0][1] - l[l.length - 1][1]) < 2,
    );
    // seven equal steps are asked for; the ones that would crowd round the charge are left out
    expect(rings.length).toBeGreaterThanOrEqual(4);
    const radii = rings.map((ring) => {
      const rs = ring.map((p) => Math.hypot(p[0] - c[0], p[1] - c[1]));
      expect(Math.max(...rs) - Math.min(...rs)).toBeLessThan(1.5); // round to within the sampling grid
      return rs[0];
    });
    radii.sort((a, b) => a - b);
    // equal steps of V = kq/r: 1/r goes down in equal steps, so the gaps between circles grow
    const inv = radii.map((r) => 1 / r);
    const steps = inv.slice(1).map((v, i) => inv[i] - v);
    for (const s of steps) expect(s / steps[0]).toBeCloseTo(1, 0);
    for (let i = 2; i < radii.length; i++)
      expect(radii[i] - radii[i - 1]).toBeGreaterThan(radii[i - 1] - radii[i - 2]);
  });

  it("never crowd closer than a readable gap near a point charge", () => {
    for (const src of [`${SINGLE}\nequi`, `${SINGLE}\nequi n=14`, `${DIPOLE}\nequi n=12`]) {
      const r = render(src);
      const lines = dashed(r.svg);
      expect(lines.length).toBeGreaterThanOrEqual(3);
      // the least distance between any two different equipotentials
      let least = Infinity;
      for (let i = 0; i < lines.length; i++)
        for (let j = i + 1; j < lines.length; j++)
          for (const p of lines[i])
            for (const q of lines[j]) least = Math.min(least, Math.hypot(p[0] - q[0], p[1] - q[1]));
      expect(least).toBeGreaterThanOrEqual(10.5);
    }
    // the picture says that the range was capped
    expect(render(`${SINGLE}\nequi n=14`).alt).toContain(
      "those closest to the charges, where they would crowd together, are left out",
    );
    // between plates nothing crowds, so nothing is left out
    expect(render(`field\nplates 0,1 0,-1 w=4\nequi`).alt).not.toContain("left out");
  });

  it("draws arrowheads large enough to read", () => {
    // each head is a filled triangle 10 px long (it was 7)
    const heads = [
      ...render(DIPOLE).svg.matchAll(
        /<polygon points="([-\d.]+),([-\d.]+) ([-\d.]+),([-\d.]+) ([-\d.]+),([-\d.]+)" fill="var\(--dg-accent/g,
      ),
    ];
    expect(heads.length).toBeGreaterThan(10);
    for (const m of heads) {
      const [tx, ty, ax, ay, bx, by] = m.slice(1).map(Number);
      expect(Math.hypot(tx - (ax + bx) / 2, ty - (ay + by) / 2)).toBeCloseTo(10, 0);
    }
  });

  it("names a regional uniform field at the top of its region", () => {
    const svg = render(
      `field xr=0..8 yr=0..4\nuniform E right "E" x=0..3.5\nuniform B out "B" x=4.5..8`,
    ).svg;
    const label = svg.match(/<text x="([-\d.]+)" y="([-\d.]+)"[^>]*>E<\/text>/)!;
    const lineYs = [...svg.matchAll(/<polyline points="[-\d.]+,([-\d.]+) [-\d.]+,\1"\/>/g)].map(
      (m) => +m[1],
    );
    expect(lineYs.length).toBe(6);
    // above every field line, and inside the frame
    expect(+label[2]).toBeLessThan(Math.min(...lineYs));
    expect(+label[2]).toBeGreaterThanOrEqual(9);
  });

  it("include the straight zero line between a + and a − of equal size", () => {
    const svg = render(`${DIPOLE}\nequi`).svg;
    const [a, b] = circle(svg, 10);
    const mid = (a[0] + b[0]) / 2;
    expect(dashed(svg).some((l) => l.every((p) => Math.abs(p[0] - mid) < 1))).toBe(true);
  });

  it("run across the gap between plates, parallel to them and evenly spaced", () => {
    const svg = render(PLATES).svg;
    const cx = 215; // the middle of the plates: read each contour's height where it crosses it
    const heights = dashed(svg)
      .flatMap((l) =>
        l.slice(1).flatMap((q, i) => {
          const p = l[i];
          if ((p[0] - cx) * (q[0] - cx) > 0 || p[0] === q[0]) return [];
          return [p[1] + ((q[1] - p[1]) * (cx - p[0])) / (q[0] - p[0])];
        }),
      )
      .sort((x, y) => x - y)
      .filter((h, i, all) => i === 0 || h - all[i - 1] > 0.5); // a vertex exactly on the middle counts once
    expect(heights.length).toBeGreaterThanOrEqual(5);
    const gaps = heights.slice(1).map((h, i) => h - heights[i]);
    for (const g of gaps) expect(g / gaps[0]).toBeCloseTo(1, 0);
  });

  it("need an electric field", () => {
    expect(render(`field\nwire 0,0 out\nequi`).errors[0]).toMatchObject({ line: 3 });
  });
});

describe("field: magnetic fields", () => {
  it("draws circles round a wire, spreading out with distance, counterclockwise for current out", () => {
    const svg = render(WIRE).svg;
    const [c] = circle(svg, 8);
    const loops = fieldLines(svg).filter(
      (l) => Math.hypot(l[0][0] - l[l.length - 1][0], l[0][1] - l[l.length - 1][1]) < 2,
    );
    expect(loops.length).toBeGreaterThanOrEqual(4);
    const radii = loops.map((loop) => {
      const rs = loop.map((p) => Math.hypot(p[0] - c[0], p[1] - c[1]));
      expect(Math.max(...rs) - Math.min(...rs)).toBeLessThan(1.5);
      // direction: the signed area of the path, in screen coordinates (y down), is negative for
      // a path that runs counterclockwise as seen on the page
      let area = 0;
      for (let i = 1; i < loop.length; i++)
        area += loop[i - 1][0] * loop[i][1] - loop[i][0] * loop[i - 1][1];
      expect(area).toBeLessThan(0);
      return rs[0];
    });
    radii.sort((a, b) => a - b);
    // B ∝ 1/r: equal steps of flux put the circles at radii in a constant ratio
    const ratios = radii.slice(1).map((r, i) => r / radii[i]);
    for (const q of ratios) expect(q / ratios[0]).toBeCloseTo(1, 1);
    expect(ratios[0]).toBeGreaterThan(1.1);
  });

  it("reverses the circulation for current into the page", () => {
    const svg = render(WIRE.replace("out", "in")).svg;
    for (const loop of fieldLines(svg).filter(
      (l) => Math.hypot(l[0][0] - l[l.length - 1][0], l[0][1] - l[l.length - 1][1]) < 2,
    )) {
      let area = 0;
      for (let i = 1; i < loop.length; i++)
        area += loop[i - 1][0] * loop[i][1] - loop[i][0] * loop[i - 1][1];
      expect(area).toBeGreaterThan(0);
    }
    expect(render(WIRE.replace("out", "in")).alt).toContain("field clockwise");
    expect(render(WIRE).alt).toContain("field counterclockwise");
  });

  it("marks a wire with a dot for current out and a cross for current in", () => {
    const svg = render(WIRES).svg;
    expect(circle(svg, 8)).toHaveLength(2);
    expect([...svg.matchAll(/r="2.6" stroke="none"/g)]).toHaveLength(1);
  });

  it("fills a field into the page with crosses and one out of the page with dots", () => {
    const crosses = [...render(B_IN).svg.matchAll(/<path d="M[-\d.]+,[-\d.]+l8,8m0,-8l-8,8"/g)]
      .length;
    expect(crosses).toBeGreaterThan(40);
    const regions = render(REGIONS).svg;
    expect([...regions.matchAll(/r="2.3" stroke="none"/g)].length).toBeGreaterThan(20);
    // the dots stay inside their region (x from 4.5 to 8 of an 8-wide window)
    const xs = [...regions.matchAll(/<circle cx="([-\d.]+)" cy="[-\d.]+" r="2.3"/g)].map(
      (m) => +m[1],
    );
    const width = Number(regions.match(/<rect x="0" y="0" width="([\d.]+)"/)![1]);
    for (const x of xs) expect(x).toBeGreaterThan((4.5 / 8) * width);
  });
});

describe("field: test charges", () => {
  it("pushes a positive charge along E and a negative one against it", () => {
    expect(render(`field\nuniform E right\ntest 0,0 +`).alt).toContain(
      "electric force on a positive test charge at (0, 0) points right",
    );
    expect(render(`field\nuniform E right\ntest 0,0 -`).alt).toContain("points left");
    // between plates E runs from the + plate (top) to the − plate: a negative charge is pushed up
    expect(render(PLATES).alt).toContain("the electric force on −q at (0.5, 0.2) points up");
    // away from a positive charge, toward a negative one
    expect(render(`field\ncharge 0,0 +1\ntest 2,0 +`).alt).toContain("points right");
    expect(render(`field\ncharge 0,0 -1\ntest 0,2 +`).alt).toContain("points down");
  });

  it("finds the magnetic force from q v × B", () => {
    // + charge moving right in B into the page: up
    expect(render(B_IN).alt).toContain("q moves right; the magnetic force on it points up");
    // − charge: down. B out of the page: down for +
    expect(render(B_IN.replace("+", "-")).alt).toContain("points down");
    expect(render(B_IN.replace("B in", "B out")).alt).toContain("points down");
    // beside a wire with current out of the page, B at (1.5, 0) points up (counterclockwise);
    // a + charge moving right there feels a force out of the page (x̂ × ŷ = ẑ)
    expect(render(`field\nwire 0,0 out\ntest 1.5,0 + v=right`).alt).toContain(
      "points out of the page",
    );
    expect(render(`field\nwire 0,0 out\ntest 1.5,0 + v=left`).alt).toContain(
      "points into the page",
    );
    // moving along the field: no force
    const along = render(`field\nwire 0,0 out\ntest 1.5,0 + v=up`);
    expect(along.alt).toContain("so the magnetic force is zero");
    expect(along.svg).toContain("F = 0");
  });

  it("shows both forces in crossed fields", () => {
    // velocity selector: E down, B into the page, + charge moving right: F_E down, F_B up
    const r = render(`field xr=0..6 yr=0..4\nuniform E down\nuniform B in\ntest 3,2 + v=right`);
    expect(r.errors).toEqual([]);
    expect(r.alt).toContain("electric force on a positive test charge at (3, 2) points down");
    expect(r.alt).toContain("magnetic force on it points up");
    expect(r.svg).toContain("F<tspan");
  });

  it("says the force is zero at a neutral point", () => {
    const r = render(`field\ncharge -1,0 +1\ncharge 1,0 +1\ntest 0,0 +`);
    expect(r.alt).toContain("the electric force on a positive test charge is zero");
  });

  it("counts the charge inside a Gaussian surface", () => {
    expect(render(GAUSS).alt).toContain("a dashed Gaussian surface S enclosing net charge +2");
    expect(render(`field\ncharge -1,0 +2\ncharge 1,0 -1\ngauss rect -2,-1 2,1 "S"`).alt).toContain(
      "enclosing net charge +1",
    );
    expect(render(`field\ncharge -1,0 +1\ncharge 1,0 -1\ngauss circle 0,0 2`).alt).toContain(
      "enclosing net charge 0",
    );
  });
});

describe("field: errors and physics warnings", () => {
  const errs = (src: string) => render(src).errors;
  it("a test charge with no sources", () => {
    const e = errs(`field\ntest 0,0 +`);
    expect(e[0]).toMatchObject({ line: 2 });
    expect(e[0].msg).toMatch(/no field to feel/);
  });
  it("nothing at all", () => {
    expect(errs(`field`)[0].msg).toMatch(/no sources/);
  });
  it("a test charge on top of a source", () => {
    const e = errs(`field\ncharge 0,0 +1\ntest 0,0 +`);
    expect(e[0]).toMatchObject({ line: 3 });
    expect(e[0].msg).toMatch(/on top of a source/);
  });
  it("a stationary charge in a magnetic field", () => {
    expect(errs(`field\nuniform B in\ntest 1,1 +`)[0].msg).toMatch(/only on a moving charge/);
  });
  it("two charges at one point, a charge of zero, a charge outside the window", () => {
    expect(errs(`field\ncharge 0,0 +1\ncharge 0,0 -1`)[0]).toMatchObject({ line: 3 });
    expect(errs(`field\ncharge 0,0 0`)[0].msg).toMatch(/signed size/);
    expect(errs(`field xr=0..4 yr=0..4\ncharge 9,9 +1`)[0].msg).toMatch(/outside the window/);
  });
  it("plates with point charges", () => {
    expect(errs(`field\nplates 0,1 0,-1\ncharge 0,0 +1`)[0].msg).toMatch(/cannot share a picture/);
  });
  it("malformed lines, with their line numbers", () => {
    expect(errs(`field\ncharge 0,0 +1\nwire 1,1 sideways`)[0]).toMatchObject({ line: 3 });
    expect(errs(`field\ncharge 0,0 +1\nuniform X right`)[0].msg).toMatch(/needs E or B/);
    expect(errs(`field\ncharge 0,0 +1\ngauss blob 0,0 1`)[0].msg).toMatch(/circle or rect/);
    expect(errs(`field\ncharge zero +1`)[0].msg).toMatch(/expected point/);
    expect(errs(`field\ncharge 0,0 +1\nmagnet 0,0`)[0].msg).toMatch(/field has no "magnet"/);
    expect(errs(`field xr=4..-4\ncharge 0,0 +1`)[0].msg).toMatch(/window is empty/);
    expect(errs(`field\nuniform E in`)[0].msg).toMatch(/into or out of the page is not drawn/);
  });
  it("a Gaussian surface through a charge is a physics warning", () => {
    const w = physics(`field\ncharge 0,0 +1\ngauss circle 1,0 1 "S"`);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/passes through a charge/);
    expect(auditDiagramBlocks("```dg\nfield\ncharge 0,0 +1\ngauss circle 1,0 1\n```\n").kept).toBe(
      0,
    );
  });
  it("escapes markup", () => {
    const r = render(
      `field "<script>x</script>"\ncharge 0,0 +1 "<img onerror=x>"\npt 1,1 "</text><script>"`,
    );
    expect(isSafeSvg(r.svg)).toBe(true);
    expect(r.svg).not.toMatch(/<script|<img/);
  });
});
