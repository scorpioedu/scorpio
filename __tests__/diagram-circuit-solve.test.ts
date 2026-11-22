// The circuit solver against circuits worked by hand. Each test's comment is the hand working; the
// solver recomputes answer keys from a drawing, so these numbers are the contract.
import {
  parseCircuit,
  solveCircuit,
  type CircuitSolution,
  type SolveOptions,
} from "../src/lib/diagram/circuit-solve";

function solve(src: string, opts?: SolveOptions): CircuitSolution {
  const { circuit, errors } = parseCircuit(src);
  expect(errors).toEqual([]);
  return solveCircuit(circuit!, opts);
}
const near = (got: number, want: number) => expect(got).toBeCloseTo(want, 9);

describe("resistor networks", () => {
  it("single loop", () => {
    // 12 V across 4 + 6 + 2 = 12 Ω in series: I = 12/12 = 1 A.
    // Drops 4 V, 6 V, 2 V, so with d at 0: a = 12, b = 12 − 4 = 8, c = 8 − 6 = 2.
    const s = solve(`circuit
battery a d 12V
resistor a b 4Ω R_1
resistor b c 6Ω R_2
resistor c d 2Ω R_3`);
    expect(s.ok).toBe(true);
    expect(s.ground).toBe("d");
    near(s.potentials.a, 12);
    near(s.potentials.b, 8);
    near(s.potentials.c, 2);
    near(s.potentials.d, 0);
    for (const id of ["R_1", "R_2", "R_3"]) near(s.elements[id].current, 1);
    near(s.elements.R_2.voltage, 6);
    near(s.req!, 12);
    near(s.source!.current, 1);
    // through the battery the current runs from − (d) to +: negative in the a -> b sense
    near(s.elements.V1.current, -1);
    expect([s.elements.V1.from, s.elements.V1.to]).toEqual(["d", "a"]);
    near(s.elements.V1.power, -12); // delivers 12 W
    near(s.elements.R_1.power, 4);
  });

  it("series with a parallel pair", () => {
    // 6 Ω ∥ 12 Ω = 72/18 = 4 Ω; Req = 3 + 4 = 7 Ω; I = 9/7 A.
    // Drop on R1 = 27/7 V, so the pair has 9 − 27/7 = 36/7 V: I2 = (36/7)/6 = 6/7 A, I3 = (36/7)/12 = 3/7 A.
    const s = solve(`circuit
battery a c 9V
resistor a b 3Ω R_1
resistor b c 6Ω R_2
resistor b c 12Ω R_3`);
    near(s.req!, 7);
    near(s.elements.R_1.current, 9 / 7);
    near(s.elements.R_2.current, 6 / 7);
    near(s.elements.R_3.current, 3 / 7);
    near(s.potentials.b, 36 / 7);
  });

  it("series and parallel nested two deep", () => {
    // R4 ∥ R5 = 6·3/9 = 2 Ω; with R3: 4 + 2 = 6 Ω; that ∥ R2: 12·6/18 = 4 Ω; with R1: 2 + 4 = 6 Ω.
    // I = 24/6 = 4 A. V(b) = 24 − 4·2 = 16 V. I(R2) = 16/12 = 4/3 A, I(R3) = 16/6 = 8/3 A.
    // V(c) = 16 − (8/3)·4 = 16/3 V. I(R4) = (16/3)/6 = 8/9 A, I(R5) = (16/3)/3 = 16/9 A.
    const s = solve(`circuit
battery a d 24V
resistor a b 2Ω R_1
resistor b d 12Ω R_2
resistor b c 4Ω R_3
parallel c d resistor 6Ω R_4 resistor 3Ω R_5`);
    near(s.req!, 6);
    near(s.source!.current, 4);
    near(s.potentials.b, 16);
    near(s.potentials.c, 16 / 3);
    near(s.elements.R_2.current, 4 / 3);
    near(s.elements.R_3.current, 8 / 3);
    near(s.elements.R_4.current, 8 / 9);
    near(s.elements.R_5.current, 16 / 9);
  });

  it("two loops with a shared branch (Kirchhoff)", () => {
    // Node b, with g at 0 (ε1's − terminal), a = 12 V, c = 6 V:
    //   (12 − Vb)/2 + (6 − Vb)/4 = Vb/6     ×12:  72 − 6Vb + 18 − 3Vb = 2Vb   =>  Vb = 90/11 V.
    // I1 (a→b) = (12 − 90/11)/2 = 21/11 A. I3 (b→g) = (90/11)/6 = 15/11 A.
    // I2 (c→b) = (6 − 90/11)/4 = −6/11 A: 6/11 A flows b→c, charging ε2. Check: 21/11 − 6/11 = 15/11.
    const s = solve(`circuit
battery a g 12V "ε_1"
resistor a b 2Ω R_1
resistor b g 6Ω R_3
resistor c b 4Ω R_2
battery c g 6V "ε_2"`);
    near(s.potentials.b, 90 / 11);
    near(s.elements.R_1.current, 21 / 11);
    near(s.elements.R_3.current, 15 / 11);
    near(s.elements.R_2.current, -6 / 11);
    expect([s.elements.R_2.from, s.elements.R_2.to]).toEqual(["b", "c"]);
    // ε2 is being charged: current enters its + terminal, so it absorbs 6 V × 6/11 A
    near(s.elements["ε_2"].current, 6 / 11);
    near(s.elements["ε_2"].power, 36 / 11);
    // with two batteries there is no single source to quote an equivalent resistance for
    expect(s.req).toBeUndefined();
    expect(s.source).toBeUndefined();
  });

  it("bridge that is not series-parallel", () => {
    // R1 = 1 (s–a), R2 = 2 (s–b), R3 = 2 (a–t), R4 = 1 (b–t), R5 = 5 (a–b), 10 V from s to t.
    // Node a: (10 − Va)/1 = Va/2 + (Va − Vb)/5   =>  10 = 1.7Va − 0.2Vb
    // Node b: (10 − Vb)/2 = Vb/1 + (Vb − Va)/5   =>   5 = 1.7Vb − 0.2Va
    // Add: 15 = 1.5(Va + Vb) => Va + Vb = 10. Subtract: 5 = 1.9(Va − Vb) => Va − Vb = 50/19.
    // Va = 120/19, Vb = 70/19. I5 = (50/19)/5 = 10/19 A.
    // I = (10 − Va)/1 + (10 − Vb)/2 = 70/19 + 60/19 = 130/19 A, so Req = 10/(130/19) = 19/13 Ω.
    const s = solve(`circuit
battery s t 10V
resistor s a 1Ω R_1
resistor s b 2Ω R_2
resistor a t 2Ω R_3
resistor b t 1Ω R_4
resistor a b 5Ω R_5`);
    near(s.potentials.a, 120 / 19);
    near(s.potentials.b, 70 / 19);
    near(s.elements.R_5.current, 10 / 19);
    near(s.req!, 19 / 13);
  });

  it("a balanced bridge carries no current in its ammeter", () => {
    // R1/R3 = 1/2 = R2/R4 = 2/4: both mid nodes sit at 10·2/3 V, so the ammeter between them reads 0.
    const s = solve(`circuit
battery s t 10V
resistor s a 1Ω R_1
resistor s b 2Ω R_2
resistor a t 2Ω R_3
resistor b t 4Ω R_4
ammeter a b`);
    near(s.elements.A1.current, 0);
    near(s.potentials.a, 20 / 3);
    expect(s.elements.A1.from).toBe(s.elements.A1.to);
  });

  it("an unbalanced bridge: the ideal ammeter is a wire", () => {
    // The ammeter joins a and b, so R1 ∥ R2 = 2/3 Ω is in series with R3 ∥ R4 = 2/3 Ω: Req = 4/3 Ω,
    // I = 7.5 A, V(a) = V(b) = 5 V. I1 = 5/1 = 5 A, I3 = 5/2 = 2.5 A: the ammeter carries
    // 5 − 2.5 = 2.5 A from a to b.
    const s = solve(`circuit
battery s t 10V
resistor s a 1Ω R_1
resistor s b 2Ω R_2
resistor a t 2Ω R_3
resistor b t 1Ω R_4
ammeter a b`);
    near(s.req!, 4 / 3);
    near(s.potentials.a, 5);
    near(s.elements.A1.current, 2.5);
    expect([s.elements.A1.from, s.elements.A1.to]).toEqual(["a", "b"]);
  });

  it("internal resistance, an ammeter in series and a voltmeter across", () => {
    // Total 0.5 + 4 + 8 = 12.5 Ω: I = 6/12.5 = 0.48 A. Voltmeter across R2: 0.48·8 = 3.84 V.
    // Terminal voltage 6 − 0.48·0.5 = 5.76 V; outside the battery Req = 5.76/0.48 = 12 Ω.
    const s = solve(`circuit
battery a e 6V r=0.5Ω
ammeter a b
resistor b c 4Ω R_1
resistor c e 8Ω R_2
voltmeter c e`);
    near(s.elements.A1.current, 0.48);
    near(s.elements.VM1.voltage, 3.84);
    near(s.elements.VM1.current, 0);
    near(s.source!.terminalVoltage, 5.76);
    near(s.source!.emf, 6);
    near(s.req!, 12);
  });

  it("treats a bulb as its resistance and honours a chosen ground", () => {
    // 12 V across bulbs of 2 Ω and 4 Ω in series: I = 2 A; the middle node is 8 V above d.
    // Grounding the middle node instead puts a at +4 V and d at −8 V.
    const src = `circuit\nbattery a d 12V\nbulb a m 2Ω B_1\nbulb m d 4Ω B_2`;
    const s = solve(src);
    near(s.elements.B_1.current, 2);
    near(s.potentials.m, 8);
    const g = solve(src, { ground: "m" });
    near(g.potentials.a, 4);
    near(g.potentials.d, -8);
    // the diagram's own ground line is used when no option is given
    near(solve(`${src}\nground m`).potentials.d, -8);
  });
});

describe("switches, capacitors and inductors", () => {
  const RC = `circuit
battery a d 9V
switch a b open S
resistor b c 2kΩ R
capacitor c d 100μF C`;

  it("an open switch stops the current", () => {
    // As drawn the switch is open: no current, and the far side of the switch floats with R and C.
    const s = solve(RC);
    near(s.elements.R.current, 0);
    near(s.elements.R.voltage, 0);
    expect(s.floating.sort()).toEqual(["b", "c"]);
    expect(s.potentials.b).toBeNaN();
    expect(s.elements.S.voltage).toBeNaN();
    expect(s.tau).toBe(Infinity);
  });

  it("RC charging: t = 0, steady state and time constant", () => {
    // Switch closed. At t = 0 the uncharged capacitor is a wire: I = 9/2000 = 4.5 mA, Vc = 0.
    // Long after: no current, the capacitor holds the full 9 V.
    // τ = RC = 2000 Ω × 100×10⁻⁶ F = 0.2 s.
    const t0 = solve(RC, { at: "t0", switches: "closed" });
    near(t0.elements.R.current, 0.0045);
    near(t0.elements.C.voltage, 0);
    near(t0.elements.C.current, 0.0045);
    const steady = solve(RC, { switches: { S: "closed" } });
    near(steady.elements.R.current, 0);
    near(steady.elements.C.voltage, 9);
    near(steady.rth!, 2000);
    near(steady.tau!, 0.2);
    expect(steady.floating).toEqual([]);
  });

  it("RC with a resistor across the capacitor", () => {
    // 12 V, R1 = 4 kΩ in series with (R2 = 12 kΩ ∥ C = 2 μF).
    // Steady: C open, divider: Vc = 12·12/16 = 9 V, I = 12/16k = 0.75 mA.
    // t = 0: C shorts R2: I = 12/4k = 3 mA, all of it through C.
    // Thevenin resistance at C (battery shorted): 4k ∥ 12k = 3 kΩ; τ = 3000 × 2×10⁻⁶ = 6 ms.
    const src = `circuit
battery a g 12V
resistor a b 4kΩ R_1
resistor b g 12kΩ R_2
capacitor b g 2uF C`;
    const steady = solve(src);
    near(steady.elements.C.voltage, 9);
    near(steady.elements.R_1.current, 0.00075);
    const t0 = solve(src, { at: "t0" });
    near(t0.elements.R_1.current, 0.003);
    near(t0.elements.R_2.current, 0);
    near(t0.elements.C.current, 0.003);
    near(steady.rth!, 3000);
    near(steady.tau!, 0.006);
    expect(t0.tau).toBeCloseTo(0.006, 12);
  });

  it("LR series circuit", () => {
    // t = 0: the inductor allows no current, so all 12 V is across it.
    // Steady: the inductor is a wire, I = 12/6 = 2 A. τ = L/R = 3/6 = 0.5 s.
    const src = `circuit\nbattery a c 12V\nresistor a b 6Ω R\ninductor b c 3H L`;
    const t0 = solve(src, { at: "t0" });
    near(t0.elements.R.current, 0);
    near(t0.elements.L.voltage, 12);
    const steady = solve(src);
    near(steady.elements.L.current, 2);
    near(steady.elements.L.voltage, 0);
    near(steady.tau!, 0.5);
  });

  it("LR with a resistor across the inductor", () => {
    // 10 V, R1 = 2 Ω in series with (L = 4 H ∥ R2 = 8 Ω).
    // t = 0: L open: I = 10/(2 + 8) = 1 A through R2. Steady: L shorts R2: I = 10/2 = 5 A, none in R2.
    // Thevenin resistance at L (battery shorted): 2 ∥ 8 = 1.6 Ω; τ = 4/1.6 = 2.5 s.
    const src = `circuit
battery a g 10V
resistor a b 2Ω R_1
inductor b g 4H L
resistor b g 8Ω R_2`;
    near(solve(src, { at: "t0" }).elements.R_2.current, 1);
    const steady = solve(src);
    near(steady.elements.L.current, 5);
    near(steady.elements.R_2.current, 0);
    near(steady.rth!, 1.6);
    near(steady.tau!, 2.5);
  });

  it("gives no time constant with two capacitors, and none without a value", () => {
    const two = solve(
      `circuit\nbattery a c 6V\nresistor a b 1kΩ\ncapacitor b c 1μF C_1\ncapacitor b c 2μF C_2`,
    );
    expect(two.tau).toBeUndefined();
    const noValue = solve(`circuit\nbattery a c 6V\nresistor a b 1kΩ\ncapacitor b c C`);
    expect(noValue.rth).toBeCloseTo(1000, 9);
    expect(noValue.tau).toBeUndefined();
  });

  it("a closed switch across a resistor shorts it out", () => {
    // 12 V, R1 = 4 Ω then R2 = 8 Ω with a switch across R2.
    // Open: I = 12/12 = 1 A. Closed: R2 is bypassed, I = 12/4 = 3 A, all of it through the switch.
    const src = `circuit\nbattery a c 12V\nresistor a b 4Ω R_1\nresistor b c 8Ω R_2\nswitch b c open S`;
    near(solve(src).elements.R_1.current, 1);
    const closed = solve(src, { switches: "closed" });
    near(closed.elements.R_1.current, 3);
    near(closed.elements.R_2.current, 0);
    near(closed.elements.S.current, 3);
  });
});

describe("circuits that cannot be solved", () => {
  const errorsOf = (src: string, opts?: SolveOptions) => {
    const s = solve(src, opts);
    expect(s.ok).toBe(false);
    return s.errors.join(" | ");
  };

  it("a battery shorted by a wire", () => {
    expect(errorsOf(`circuit\nbattery a b 12V\nwire a b\nresistor a b 4Ω`)).toMatch(
      /short circuit/,
    );
  });
  it("a battery shorted through an ammeter", () => {
    expect(errorsOf(`circuit\nbattery a b 12V\nammeter a b`)).toMatch(/short circuit: battery/);
  });
  it("two different ideal batteries in parallel", () => {
    expect(errorsOf(`circuit\nbattery a b 12V\nbattery a b 6V\nresistor a b 4Ω`)).toMatch(
      /short circuit/,
    );
  });
  it("two wires in parallel leave the current split undetermined", () => {
    expect(errorsOf(`circuit\nbattery a b 12V\nresistor a c 4Ω\nwire c b\nwire c b`)).toMatch(
      /not determined/,
    );
  });
  it("a resistor or battery without a value", () => {
    expect(errorsOf(`circuit\nbattery a b 12V\nresistor a b R`)).toMatch(
      /R has no resistance value/,
    );
    expect(errorsOf(`circuit\nbattery a b "ε"\nresistor a b 4Ω`)).toMatch(/has no EMF value/);
  });
  it("an unknown ground", () => {
    expect(errorsOf(`circuit\nbattery a b 12V\nresistor a b 4Ω`, { ground: "z" })).toMatch(
      /ground node "z"/,
    );
  });
  it("internal resistance makes a shorted battery solvable", () => {
    // 12 V with r = 0.5 Ω shorted by a wire: I = 12/0.5 = 24 A, terminal voltage 0.
    const s = solve(`circuit\nbattery a b 12V r=0.5Ω\nwire a b`);
    expect(s.ok).toBe(true);
    near(s.source!.current, 24);
    near(s.source!.terminalVoltage, 0);
    near(s.req!, 0);
  });
});

describe("parseCircuit", () => {
  it("reads values with prefixes, spaced units and plain numbers", () => {
    const { circuit, errors } = parseCircuit(`circuit
battery a b 1.5 V
resistor a c 4.7kΩ R_1
resistor c d 220 ohm
capacitor d b 10uF
inductor d b 2mH
resistor d b 3`);
    expect(errors).toEqual([]);
    const v = circuit!.elements.map((e) => e.value);
    expect(v[0]).toBe(1.5);
    expect(v[1]).toBeCloseTo(4700, 9);
    expect(v[2]).toBe(220);
    expect(v[3]).toBeCloseTo(1e-5, 15);
    expect(v[4]).toBeCloseTo(0.002, 12);
    expect(v[5]).toBe(3);
    expect(circuit!.elements.map((e) => e.valueText)).toEqual([
      "1.5 V",
      "4.7 kΩ",
      "220 Ω",
      "10 μF",
      "2 mH",
      "3 Ω",
    ]);
    expect(circuit!.elements.map((e) => e.id)).toEqual(["V1", "R_1", "R2", "C1", "L1", "R3"]);
  });

  it("expands series and parallel lines", () => {
    const { circuit, errors } = parseCircuit(`circuit
battery a d 12V
series a d resistor 4Ω R_1 switch closed S capacitor 10μF C
parallel a d resistor 6Ω R_2 bulb`);
    expect(errors).toEqual([]);
    const els = circuit!.elements.map((e) => `${e.type} ${e.a}-${e.b}`);
    expect(els).toEqual([
      "battery a-d",
      "resistor a-_1",
      "switch _1-_2",
      "capacitor _2-d",
      "resistor a-d",
      "bulb a-d",
    ]);
    expect(circuit!.elements[2].open).toBe(false);
  });

  it("reports mistakes with their line", () => {
    const bad = (src: string) => parseCircuit(src).errors;
    expect(bad("circuit\nbattery a b 12V\nresistor 4Ω R_1")[0]).toMatchObject({ line: 3 });
    expect(bad("circuit\nbattery a b 12V\nresistor a b 12V")[0].msg).toMatch(/value is in Ω/);
    expect(bad("circuit\nbattery a b 12V\ndiode a b")[0]).toMatchObject({ line: 3 });
    expect(bad("circuit\nbattery a a 12V")[0].msg).toMatch(/both ends/);
    expect(bad("circuit\nbattery a b 12V\nresistor a b 4Ω\nground z")[0]).toMatchObject({
      line: 4,
    });
    expect(bad("plot x=t y=v\nseg 0,0 1,1")[0].msg).toMatch(/not a circuit/);
  });
});
