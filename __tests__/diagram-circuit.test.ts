// circuit diagrams: the wiring is laid out from what is connected to what, and a drawing that says
// something false about a circuit is flagged.
import { render } from "../src/lib/diagram";
import { auditDiagramBlocks } from "../src/lib/diagram/blocks";
import { labelOverlaps } from "../src/lib/diagram/check";
import { isSafeSvg } from "../src/lib/diagram/safe";

const LOOP = `circuit
battery a d 12V
resistor a b 4Ω R_1
resistor b c 6Ω R_2
resistor c d 2Ω R_3`;
const NESTED = `circuit
battery a d 24V
resistor a b 2Ω R_1
resistor b d 12Ω R_2
resistor b c 4Ω R_3
parallel c d resistor 6Ω R_4 resistor 3Ω R_5`;
const KIRCHHOFF = `circuit
battery a g 12V "ε_1"
resistor a b 2Ω R_1 i=I_1
resistor b g 6Ω R_3 i=I_3
resistor c b 4Ω R_2 i=I_2
battery c g 6V "ε_2"
node b "B"`;
const RC = `circuit
battery a d 9V "ε"
switch a b open S
resistor b c 2kΩ R
capacitor c d 100μF C`;
const METERS = `circuit
battery a e 6V r=0.5Ω
ammeter a b
resistor b c 4Ω R_1
resistor c e 8Ω R_2
voltmeter c e`;
const MIXED = `circuit
battery a d 12V
switch a b closed S
series b d bulb B_1 inductor 50mH L
bulb b d B_2
ground d`;
const BRIDGE = `circuit
battery p q 10V
wire p s
wire q t
resistor s a R_1
resistor s b R_2
resistor a t R_3
resistor b t R_4
ammeter a b
at s 0,1 a 1,2 b 1,0 t 2,1 p 0,-0.7 q 2,-0.7`;
const ALL: [string, string][] = [
  ["a single loop", LOOP],
  ["series and parallel nested two deep", NESTED],
  ["two loops with a shared branch", KIRCHHOFF],
  ["an RC circuit with a switch", RC],
  ["an ammeter and a voltmeter", METERS],
  ["bulbs, an inductor, a ground", MIXED],
  ["a bridge placed by hand", BRIDGE],
];

const physics = (src: string) =>
  render(src)
    .warnings.filter((w) => w.kind === "physics")
    .map((w) => w.msg);
/** Wire and lead segments as [x1, y1, x2, y2]. */
const lines = (svg: string) =>
  [...svg.matchAll(/<line x1="(-?[\d.]+)" y1="(-?[\d.]+)" x2="(-?[\d.]+)" y2="(-?[\d.]+)"/g)].map(
    (m) => m.slice(1).map(Number),
  );
const count = (svg: string, re: RegExp) => [...svg.matchAll(re)].length;

describe("circuit: drawing", () => {
  it.each(ALL)("draws %s cleanly", (_name, src) => {
    const r = render(src);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.ok).toBe(true);
    expect(isSafeSvg(r.svg)).toBe(true);
    expect(labelOverlaps(r.svg)).toEqual([]);
    expect(r.alt.length).toBeGreaterThan(20);
  });

  it("is deterministic", () => {
    for (const [, src] of ALL) expect(render(src).svg).toBe(render(src).svg);
  });

  it.each(ALL)("stays within the size and time budget: %s", (_name, src) => {
    render(src);
    const t0 = performance.now();
    const r = render(src);
    expect(performance.now() - t0).toBeLessThan(50);
    expect(r.svg.length).toBeLessThan(8000);
  });

  it("uses only horizontal and vertical wires in the automatic layout", () => {
    for (const src of [LOOP, NESTED, KIRCHHOFF, RC, METERS, MIXED])
      for (const [x1, y1, x2, y2] of lines(render(src).svg)) {
        // the open switch's lever and a bulb's cross are short slanted strokes; wires are long
        if (Math.hypot(x2 - x1, y2 - y1) > 30) expect(x1 === x2 || y1 === y2).toBe(true);
      }
  });

  it("draws one symbol per element", () => {
    const zigzags = (svg: string) => count(svg, /<polyline points="[^"]*" fill="none"\/>/g);
    expect(zigzags(render(LOOP).svg)).toBe(3);
    expect(zigzags(render(NESTED).svg)).toBe(5);
    // the meters are circles with a letter
    expect(render(METERS).svg).toMatch(/>A<\/text>/);
    expect(render(METERS).svg).toMatch(/>V<\/text>/);
    // internal resistance adds a second, smaller zigzag beside the battery
    expect(zigzags(render(METERS).svg)).toBe(3);
  });

  it("puts a dot on every junction and none on a plain corner", () => {
    const dots = (svg: string) => count(svg, /<circle [^>]*r="3" stroke="none"\/>/g);
    expect(dots(render(LOOP).svg)).toBe(0); // one loop: corners only
    // R1 then R2 ∥ R3: the pair's two junctions
    expect(
      dots(
        render(`circuit\nbattery a c 9V\nresistor a b 3Ω\nresistor b c 6Ω\nresistor b c 12Ω`).svg,
      ),
    ).toBe(2);
  });

  it("draws the battery's + plate at its first node", () => {
    // The first battery's + terminal is always drawn at the top of the left side: the long plate
    // above the short one, with a + beside it.
    const plusY = (svg: string) =>
      Number(svg.match(/<text x="[-\d.]+" y="([-\d.]+)"[^>]*>\+<\/text>/)![1]);
    const longPlateY = (svg: string) =>
      Number(svg.match(/y1="([-\d.]+)" x2="[-\d.]+" y2="[-\d.]+" stroke-width="1.5"\/>/)![1]);
    const shortPlateY = (svg: string) =>
      Number(svg.match(/y1="([-\d.]+)" x2="[-\d.]+" y2="[-\d.]+" stroke-width="3.5"/)![1]);
    const fwd = render(LOOP),
      rev = render(LOOP.replace("battery a d", "battery d a"));
    for (const r of [fwd, rev]) {
      expect(longPlateY(r.svg)).toBeLessThan(shortPlateY(r.svg));
      expect(plusY(r.svg)).toBeLessThan(longPlateY(r.svg));
    }
    // What changes is what the + terminal leads to: R_1 (on node a) or R_3 (on node d).
    expect(fwd.alt).toContain("connected across R_1 (4 Ω), R_2 (6 Ω) and R_3 (2 Ω)");
    expect(rev.alt).toContain("connected across R_3 (2 Ω), R_2 (6 Ω) and R_1 (4 Ω)");
    const firstLabelX = (svg: string, name: string) =>
      Number(svg.match(new RegExp(`<text x="([-\\d.]+)"[^>]*>R<tspan[^>]*>${name}</tspan>`))![1]);
    expect(firstLabelX(fwd.svg, "1")).toBeLessThan(firstLabelX(fwd.svg, "2"));
    expect(firstLabelX(rev.svg, "3")).toBeLessThan(firstLabelX(rev.svg, "2"));
  });

  it("describes the circuit's structure in the alt text", () => {
    expect(render(LOOP).alt).toBe(
      "Circuit diagram: 12 V battery connected across R_1 (4 Ω), R_2 (6 Ω) and R_3 (2 Ω) in series.",
    );
    expect(render(NESTED).alt).toContain(
      "R_1 (2 Ω) and [R_2 (12 Ω) in parallel with [R_3 (4 Ω) and [R_4 (6 Ω) in parallel with R_5 (3 Ω)] in series]] in series",
    );
    expect(render(RC).alt).toContain("open switch S");
    expect(render(MIXED).alt).toContain("Node d is grounded");
    expect(render(KIRCHHOFF).alt).toContain("Current arrows: I_1 at R_1");
    expect(render(BRIDGE).alt).toContain("ammeter between a and b");
  });

  it("accepts values written with a space, in ohms, and whole-word subscripts", () => {
    const r = render(`circuit\nbattery a b 12 V V_bat\nresistor a b 100 ohm R_eq`);
    expect(r.errors).toEqual([]);
    expect(r.alt).toContain("battery V_bat (12 V)");
    expect(r.alt).toContain("R_eq (100 Ω)");
    expect(r.svg).toContain(">eq</tspan>"); // the whole word is the subscript
  });

  it("copes with the optional-marker parentheses of the reference", () => {
    expect(
      render(`circuit\nbattery a c 12V "ε" (r=1Ω)\nresistor a c 4Ω R_1 (i=I_1)`).errors,
    ).toEqual([]);
  });

  it("escapes markup in labels", () => {
    const r = render(
      `circuit\nbattery a b 12V "<script>alert(1)</script>"\nresistor a b 4Ω "<img src=x onerror=alert(1)>"\nnode a "</text><script>"`,
    );
    expect(isSafeSvg(r.svg)).toBe(true);
    expect(r.svg).not.toMatch(/<script|<img/i);
  });
});

describe("circuit: errors", () => {
  const errs = (src: string) => render(src).errors;
  it("names the line of a malformed element", () => {
    const e = errs(`circuit\nbattery a b 12V\nresistor 4Ω R_1`);
    expect(e[0].line).toBe(3);
    expect(e[0].msg).toMatch(/needs its two nodes first/);
  });
  it("rejects an unknown element with the list of real ones", () => {
    const e = errs(`circuit\nbattery a b 12V\ndiode a b`);
    expect(e[0]).toMatchObject({ line: 3 });
    expect(e[0].msg).toMatch(/battery resistor capacitor/);
  });
  it("rejects a value in the wrong unit", () => {
    expect(errs(`circuit\nbattery a b 12Ω\nresistor a b 4Ω`)[0]).toMatchObject({ line: 2 });
  });
  it("rejects an option an element does not have", () => {
    expect(errs(`circuit\nbattery a b 12V\nresistor a b 4Ω r=1Ω`)[0].msg).toMatch(/no "r="/);
  });
  it("says a circuit is empty on its first line", () => {
    expect(errs(`circuit`)[0]).toMatchObject({ line: 1 });
  });
  it("reports two separate pieces", () => {
    const e = errs(`circuit\nbattery a b 12V\nresistor a b 4Ω\nresistor x y 2Ω R_9`);
    expect(e[0].line).toBe(4);
    expect(e[0].msg).toMatch(/separate pieces/);
  });
  it("asks for placement when the circuit is not series-parallel", () => {
    const e = errs(BRIDGE.replace(/\nat .*/, ""));
    expect(e).toHaveLength(1);
    expect(e[0].msg).toMatch(/place the nodes yourself with an at line/);
  });
  it("needs every node placed once any is", () => {
    expect(errs(`${LOOP}\nat a 0,1 b 1,1`)[0].msg).toMatch(/but not d, c;/);
  });
  it("will not draw two placed elements on top of each other", () => {
    const e = errs(`circuit\nbattery a b 9V\nresistor a b 3Ω R_1\nat a 0,0 b 0,1`);
    expect(e[0]).toMatchObject({ line: 3 });
  });
  it("draws nothing when there are errors", () => {
    const r = render(`circuit\nbattery a b 12V\nresistor a b 4Ω\nfoo`);
    expect(r.ok).toBe(false);
    expect(auditDiagramBlocks("```dg\ncircuit\nbattery a b 12V\nfoo\n```\n").kept).toBe(0);
  });
});

describe("circuit: physics warnings", () => {
  it("an open loop that no switch explains", () => {
    const w = physics(`circuit\nbattery a d 12V\nresistor a b 4Ω R_1\nresistor b c 6Ω R_2`);
    expect(w.some((m) => /not part of a closed loop/.test(m))).toBe(true);
    expect(w.some((m) => /R_2 has a loose end.*node c/.test(m))).toBe(true);
    // it is still drawn, with the break showing, so a reviewer sees what was written
    expect(render(`circuit\nbattery a d 12V\nresistor a b 4Ω R_1\nresistor b c 6Ω R_2`).ok).toBe(
      true,
    );
  });
  it("an open switch does explain an open loop", () => {
    expect(physics(RC)).toEqual([]);
  });
  it("a battery shorted by a bare wire", () => {
    const w = physics(`${LOOP}\nwire a d`);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/short-circuited/);
    // through a closed switch too, but not through an open one
    expect(physics(`${LOOP}\nswitch a d closed`)[0]).toMatch(/short-circuited/);
    expect(physics(`${LOOP}\nswitch a d open`)).toEqual([]);
    // a battery with internal resistance survives it
    expect(physics(`${LOOP.replace("12V", "12V r=1Ω")}\nwire a d`)).toEqual([]);
  });
  it("a voltmeter in series", () => {
    const w = physics(`circuit\nbattery a c 12V\nresistor a b 4Ω R_1\nvoltmeter b c`);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/voltmeter is in series with/);
  });
  it("a voltmeter across a component, a group or the battery is fine", () => {
    expect(physics(METERS)).toEqual([]);
    expect(physics(`${LOOP}\nvoltmeter a c`)).toEqual([]); // across R1 and R2 together
    expect(physics(`${LOOP}\nvoltmeter a d`)).toEqual([]); // across the battery
    expect(physics(`circuit\nbattery a b 9V\nvoltmeter a b`)).toEqual([]); // reading an EMF
  });
  it("an ammeter in parallel across a component", () => {
    const w = physics(`${LOOP}\nammeter b c`);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/ammeter is connected in parallel across R_2/);
  });
  it("an element with a loose end", () => {
    const w = physics(`${LOOP}\nresistor b e 5Ω R_x`);
    expect(w).toEqual(["R_x has a loose end: nothing else is connected to node e"]);
  });
  it("a current arrow against the current of a single battery", () => {
    // a is +, so current runs a -> b through R_1; ir= draws it b -> a
    const w = physics(LOOP.replace("R_1", "R_1 ir=I"));
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/points against the current/);
    expect(physics(LOOP.replace("R_1", "R_1 i=I"))).toEqual([]);
    // with two batteries the directions depend on the numbers: assumed directions are not judged
    expect(physics(KIRCHHOFF.replace("i=I_2", "ir=I_2"))).toEqual([]);
  });
  it("a live tutor would drop a circuit with a physics warning", () => {
    const text = "Here:\n\n```dg\n" + `${LOOP}\nwire a d` + "\n```\n";
    expect(auditDiagramBlocks(text).kept).toBe(0);
    expect(auditDiagramBlocks("```dg\n" + LOOP + "\n```\n").kept).toBe(1);
  });
  it("warns when placed nodes leave no room for a symbol", () => {
    const r = render(`circuit\nbattery a b 9V\nresistor b c 3Ω\nwire c a\nat a 0,0 b 0,1 c 0.3,1`);
    expect(r.warnings.some((w) => w.kind === "readability" && /too close/.test(w.msg))).toBe(true);
  });
});
