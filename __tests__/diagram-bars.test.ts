// bars: energy and momentum bar charts. A chart declared as conserving must balance.
import { render } from "../src/lib/diagram";
import { auditDiagramBlocks } from "../src/lib/diagram/blocks";
import { labelOverlaps } from "../src/lib/diagram/check";
import { isSafeSvg } from "../src/lib/diagram/safe";

const FALL = `bars energy "Falling ball"\ninitial K 0 U_g 4\nfinal K 4 U_g 0`;
const FRICTION = `bars energy\ninitial K 1 U_g 3 U_s 0\nwork W_ext 2\nfinal K 3 U_g 0 U_s 1 E_th 2`;
const COLLISION = `bars momentum\ninitial p_1 4 p_2 -1\nfinal p_1 1 p_2 2`;
const IMPULSE = `bars momentum\ninitial p 3\nimpulse J -5\nfinal p -2`;
const UNKNOWN = `bars energy unit=J\ninitial U_s 12 K 0\nfinal K ? U_g 8`;
const ALL = [FALL, FRICTION, COLLISION, IMPULSE, UNKNOWN];

/** Each bar as { height, up } in drawing order. */
const bars = (svg: string) =>
  [...svg.matchAll(/<rect x="[-\d.]+" y="([-\d.]+)" width="26" height="([-\d.]+)" fill="var/g)].map(
    (m) => ({ y: Number(m[1]), h: Number(m[2]) }),
  );
const physics = (src: string) =>
  render(src)
    .warnings.filter((w) => w.kind === "physics")
    .map((w) => w.msg);

describe("bars", () => {
  it.each(ALL)("draws cleanly (%#)", (src) => {
    const r = render(src);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.ok).toBe(true);
    expect(isSafeSvg(r.svg)).toBe(true);
    expect(labelOverlaps(r.svg)).toEqual([]);
  });

  it("makes bar heights proportional to the values, down for negative", () => {
    // p_1 4, p_2 -1 | p_1 1, p_2 2
    const b = bars(render(COLLISION).svg);
    expect(b).toHaveLength(4);
    const unit = b[0].h / 4;
    expect(b[1].h).toBeCloseTo(unit, 5);
    expect(b[2].h).toBeCloseTo(unit, 5);
    expect(b[3].h).toBeCloseTo(2 * unit, 5);
    const zero = b[0].y + b[0].h; // the positive bar stands on the zero line
    expect(b[1].y).toBeCloseTo(zero, 5); // the negative one hangs from it
    expect(b[3].y + b[3].h).toBeCloseTo(zero, 5);
  });

  it("draws a zero bar as a 0 and an unknown bar as a ?", () => {
    expect(bars(render(FALL).svg)).toHaveLength(2);
    expect(render(FALL).svg).toMatch(/>0<\/text>/);
    expect(render(UNKNOWN).svg).toMatch(/>\?<\/text>/);
    expect(render(UNKNOWN).svg).toMatch(/stroke-dasharray="4 3"/);
  });

  it("shows numbers only when an axis is asked for", () => {
    expect(render(FRICTION).svg).not.toMatch(/>3<\/text>/);
    const withAxis = render(UNKNOWN).svg;
    expect(withAxis).toMatch(/>12<\/text>/);
    expect(withAxis).toMatch(/>J<\/text>/);
    expect(render(`bars energy axis\ninitial K 2\nfinal K 2`).svg).toMatch(/>2<\/text>/);
  });

  it("separates the groups with + and =", () => {
    expect(render(FRICTION).svg).toMatch(/>\+<\/text>[\s\S]*>=<\/text>/);
    expect(render(FALL).svg).not.toMatch(/>\+<\/text>/);
  });

  it("treats a whole-word subscript as one subscript", () => {
    expect(render(FRICTION).svg).toContain(">ext</tspan>");
    expect(render(FRICTION).svg).toContain(">th</tspan>");
  });

  it("says what the chart shows in its alt text", () => {
    expect(render(FALL).alt).toBe(
      "Energy chart (Falling ball). Initial: K 0, U_g 4. Final: K 4, U_g 0. Initial equals final.",
    );
    expect(render(IMPULSE).alt).toBe(
      "Momentum chart. Initial: p 3. Impulse: J −5. Final: p −2. Initial plus impulse equals final.",
    );
    expect(render(UNKNOWN).alt).toContain("K unknown");
  });

  it("is deterministic and small", () => {
    for (const src of ALL) {
      const t0 = performance.now();
      const r = render(src);
      expect(performance.now() - t0).toBeLessThan(50);
      expect(r.svg).toBe(render(src).svg);
      expect(r.svg.length).toBeLessThan(8000);
    }
  });

  it("accepts key=value pairs and the short command names", () => {
    const r = render(`bars energy\ni K=0 U_g=4\nw W=-1\nf K=3 U_g=0`);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });
});

describe("bars: physics warnings", () => {
  it("energy that appears from nowhere", () => {
    const w = physics(`bars energy\ninitial K 0 U_g 4\nfinal K 5 U_g 0`);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(
      /energy is not conserved: the initial bars add to 4, but the final bars add to 5/,
    );
    expect(render(`bars energy\ninitial K 0 U_g 4\nfinal K 5 U_g 0`).warnings[0].line).toBe(3);
  });
  it("a work bar that does not account for the change", () => {
    const w = physics(`bars energy\ninitial K 2\nwork W -1\nfinal K 2`);
    expect(w[0]).toMatch(/initial \(2\) \+ work \(−1\) = 1, but the final bars add to 2/);
  });
  it("momentum that is not conserved, and an impulse that fixes it", () => {
    expect(physics(`bars momentum\ninitial p_1 4 p_2 -1\nfinal p_1 1 p_2 1`)[0]).toMatch(
      /momentum is not conserved/,
    );
    expect(physics(IMPULSE)).toEqual([]);
  });
  it("negative kinetic or spring energy", () => {
    expect(physics(`bars energy\ninitial K -1 U_g 3\nfinal K 2 U_g 0`)[0]).toMatch(
      /kinetic energy K cannot be negative/,
    );
    expect(physics(`bars energy\ninitial U_s -2 K 4\nfinal K 2`)[0]).toMatch(
      /spring potential energy/,
    );
    // gravitational potential energy may be negative
    expect(physics(`bars energy\ninitial K 5 U_g -2\nfinal K 3 U_g 0`)).toEqual([]);
  });
  it("does not check a chart with an unknown bar, or one that declares nothing", () => {
    expect(physics(UNKNOWN)).toEqual([]);
    expect(physics(`bars\ninitial A 1\nfinal A 5`)).toEqual([]);
  });
  it("a live tutor would drop an unbalanced chart", () => {
    const block = (src: string) => "```dg\n" + src + "\n```\n";
    expect(auditDiagramBlocks(block(`bars energy\ninitial K 0 U_g 4\nfinal K 5 U_g 0`)).kept).toBe(
      0,
    );
    expect(auditDiagramBlocks(block(FALL)).kept).toBe(1);
  });
});

describe("bars: errors", () => {
  const errs = (src: string) => render(src).errors;
  it("needs both states", () => {
    expect(errs(`bars energy\ninitial K 1`)[0]).toMatchObject({ line: 1 });
    expect(errs(`bars energy\nfinal K 1`)[0].msg).toMatch(/needs an initial line/);
  });
  it("names the line of a bar without a number", () => {
    expect(errs(`bars energy\ninitial K 1\nfinal K U_g 2`)[0]).toMatchObject({ line: 3 });
    expect(errs(`bars energy\ninitial K 1 U_g\nfinal K 1`)[0].msg).toMatch(/"U_g" has no value/);
  });
  it("rejects unknown commands and options", () => {
    expect(errs(`bars energy\ninitial K 1\nmiddle K 1\nfinal K 1`)[0]).toMatchObject({ line: 3 });
    expect(errs(`bars heat\ninitial K 1\nfinal K 1`)[0].msg).toMatch(/energy, momentum, axis/);
  });
  it("warns about a crowded group", () => {
    const r = render(`bars\ninitial a 1 b 1 c 1 d 1 e 1 f 1 g 1 h 1\nfinal a 8`);
    expect(r.warnings[0].kind).toBe("readability");
  });
  it("escapes markup", () => {
    const r = render(`bars energy "<script>x</script>"\ninitial <b> 1\nfinal <i> 1`);
    expect(isSafeSvg(r.svg)).toBe(true);
    expect(r.svg).not.toMatch(/<script|<b>|<i>/);
  });
});
