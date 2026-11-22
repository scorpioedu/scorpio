// The reference text a model is given: split by kind so a course pays only for the kinds it uses,
// and every example line in it must be something the renderer accepts.
import { render } from "../src/lib/diagram";
import {
  DIAGRAM_KINDS,
  DIAGRAM_REFERENCE,
  diagramKindsForCourse,
  diagramReference,
  landingDiagramSection,
  tutorDiagramSection,
} from "../src/lib/diagram/prompt";

describe("diagram reference", () => {
  it("lists every kind in the full reference", () => {
    for (const kind of DIAGRAM_KINDS)
      expect(DIAGRAM_REFERENCE).toMatch(new RegExp(`^${kind}\\b`, "m"));
    expect(diagramReference()).toBe(DIAGRAM_REFERENCE);
    expect(diagramReference("a-course-nobody-has-heard-of")).toBe(DIAGRAM_REFERENCE);
  });

  it("gives mechanics courses the mechanics kinds and E&M courses circuits and fields", () => {
    for (const course of ["physics-1", "physics-c-mech"]) {
      expect(diagramKindsForCourse(course)).toEqual([
        "plot",
        "fbd",
        "scene",
        "bars",
        "motion",
        "rigid",
      ]);
      const ref = diagramReference(course);
      expect(ref).toMatch(/^bars energy/m);
      expect(ref).toMatch(/^motion dt=1/m);
      expect(ref).toMatch(/^rigid rod/m);
      expect(ref).not.toMatch(/^circuit\b/m);
      expect(ref).not.toMatch(/^field\b/m);
      for (const kind of ["ray", "wave", "pv", "levels"])
        expect(ref).not.toMatch(new RegExp(`^${kind}\\b`, "m"));
    }
    for (const course of ["physics-2", "physics-c-em"]) {
      const ref = diagramReference(course);
      expect(ref).toMatch(/^circuit\b/m);
      expect(ref).toMatch(/^field\b/m);
      expect(ref).not.toMatch(/^bars\b/m);
      expect(ref).not.toMatch(/^motion\b/m);
      expect(ref).not.toMatch(/^rigid\b/m);
    }
    // optics, waves, thermodynamics and atomic levels are AP Physics 2 only
    for (const kind of ["ray", "wave", "pv", "levels"]) {
      expect(diagramReference("physics-2")).toMatch(new RegExp(`^${kind}\\b`, "m"));
      expect(diagramReference("physics-c-em")).not.toMatch(new RegExp(`^${kind}\\b`, "m"));
    }
    // every course keeps the header, graphs, free-body diagrams and scenes
    for (const course of ["physics-1", "physics-2"])
      for (const part of ["```dg", "plot x=t[s]", "fbd box", "scene "])
        expect(diagramReference(course)).toContain(part);
  });

  it("is shorter for a course than in full", () => {
    expect(diagramReference("physics-1").length).toBeLessThan(DIAGRAM_REFERENCE.length - 1000);
    expect(diagramReference("physics-2").length).toBeLessThan(DIAGRAM_REFERENCE.length - 500);
    expect(diagramReference("physics-c-em").length).toBeLessThan(DIAGRAM_REFERENCE.length - 2500);
    // sent on every call that knows its course: keep each one small
    expect(diagramReference("physics-1").length).toBeLessThan(2900);
    expect(diagramReference("physics-c-em").length).toBeLessThan(3100);
    expect(diagramReference("physics-2").length).toBeLessThan(5300);
    expect(DIAGRAM_REFERENCE.length).toBeLessThan(6500);
  });

  it("accepts a list of kinds", () => {
    const ref = diagramReference(["field"]);
    expect(ref).toMatch(/^field\b/m);
    expect(ref).not.toMatch(/^plot\b/m);
  });

  it("keeps the tutor and landing sections on the full reference unless a course is given", () => {
    expect(tutorDiagramSection("explain")).toContain(DIAGRAM_REFERENCE);
    expect(landingDiagramSection()).toContain(DIAGRAM_REFERENCE);
    expect(tutorDiagramSection("solve", "physics-1")).toContain(diagramReference("physics-1"));
    expect(tutorDiagramSection("solve", "physics-1")).not.toMatch(/^circuit\b/m);
    expect(landingDiagramSection("physics-2")).toMatch(/^field\b/m);
  });
});

describe("the reference's own examples draw", () => {
  /** The command part of each reference line for a kind (before the explanation column). */
  const example = (kind: string, pick: (line: string) => boolean = () => true) =>
    diagramReference([kind as "bars"])
      .split("\n\n")
      .pop()!
      .split("\n")
      .filter((l) => /^\S/.test(l) && pick(l))
      .map((l) => l.replace(/\s{2,}.*$/, ""));

  it("bars", () => {
    const src = example("bars").join("\n");
    expect(src).toBe(
      `bars energy (unit=J) "title"\ninitial K 0 U_g 4\nwork W_f -1\nfinal K 3 U_g 0`,
    );
    const r = render(src);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]); // 0 + 4 − 1 = 3: the example balances
  });

  it("motion", () => {
    const r = render(example("motion").join("\n"));
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it("circuit", () => {
    // the reference's lines, with the ammeter's branch closed back to the battery
    const lines = [
      `circuit`,
      `battery a c 12V "ε" (r=1Ω)`,
      `resistor a b 4Ω R_1 (i=I_1)`,
      `capacitor b c 10μF C`,
      `inductor b c 2mH L`,
      `bulb b c`,
      `switch b c open S`,
      `voltmeter b c`,
      `ammeter c d`,
      `wire d e`,
      `resistor e a 2Ω`,
      `series a c resistor 4Ω R_1 switch closed S capacitor 10μF C`,
      `parallel b c resistor 6Ω R_2 resistor 3Ω R_3`,
      `ground c`,
      `node b "B"`,
    ];
    for (const l of lines)
      if (l !== "circuit" && l !== "resistor e a 2Ω") expect(DIAGRAM_REFERENCE).toContain(l);
    const r = render(lines.join("\n"));
    expect(r.errors).toEqual([]);
    expect(r.warnings.filter((w) => w.kind === "physics")).toEqual([]);
    // the placement example for a bridge
    expect(DIAGRAM_REFERENCE).toContain("at a 0,1 b 1,2 c 2,1");
    expect(
      render(`circuit\nbattery a c 9V\nresistor a b 2Ω\nresistor b c 4Ω\nat a 0,1 b 1,2 c 2,1`)
        .errors,
    ).toEqual([]);
  });

  it("field", () => {
    for (const src of [
      `field (xr=-4..4 yr=-3..3)\ncharge 0,0 +2 "+2q"\nequi\ngauss circle 0,0 1.5 "S"\ngauss rect -1,-1 1,1 "S"\npt 1,1 "P"\ntest 1,1 + "q"`,
      `field\nplates 0,1 0,-1 w=4\ntest 0,0 + "q"`,
      `field\nuniform E right\nuniform B in (x=0..3 y=0..2)\ntest 1,1 + "q" (v=right)`,
      `field\nwire 0,0 out "I"`,
    ]) {
      const r = render(src);
      expect(r.errors).toEqual([]);
      expect(r.warnings.filter((w) => w.kind === "physics")).toEqual([]);
    }
    for (const part of [
      'charge 0,0 +2 "+2q"',
      "plates 0,1 0,-1 w=4",
      "uniform E right",
      "uniform B in (x=0..3 y=0..2)",
      'wire 0,0 out "I"',
      'test 1,1 + "q" (v=right)',
    ])
      expect(DIAGRAM_REFERENCE).toContain(part);
  });

  it("ray", () => {
    for (const src of [
      `ray lens f=10 (unit=cm)\nobj 30 h=4`,
      `ray mirror f=10\nobj 30 h=4`,
      `ray mirror plane\nobj 30 h=4`,
      `ray refract n1=1 n2=1.5 in=40 (reflect up m1="air" m2="glass")`,
    ]) {
      const r = render(src);
      expect(r.errors).toEqual([]);
      expect(r.warnings).toEqual([]);
    }
    for (const part of ["ray lens f=10 (unit=cm)", "obj 30 h=4", "ray mirror plane"])
      expect(DIAGRAM_REFERENCE).toContain(part);
  });

  it("wave", () => {
    for (const src of [
      `wave string n=3`,
      `wave string free n=3`,
      `wave pipe n=2`,
      `wave pipe closed n=3`,
      `wave travel lambda=2 A=0.5 unit=m (v=right num)`,
      `wave pulses\npulse 3 h=1 w=2 (rect v=right)\npulse 4 h=1 w=2`,
      `wave double (orders=2 da=4)`,
      `wave single`,
    ]) {
      const r = render(src);
      expect(r.errors).toEqual([]);
      expect(r.warnings).toEqual([]);
      expect(DIAGRAM_REFERENCE).toContain(src.split("\n")[0]);
    }
    expect(DIAGRAM_REFERENCE).toContain("pulse 3 h=1 w=2 (rect v=right)");
  });

  it("pv", () => {
    const src = [
      `pv (num P=kPa V=L)`,
      `state A V=1 P=4`,
      `state B V=4`,
      `isothermal A B (shade)`,
      `state C V=1`,
      `isobaric B C`,
      `isochoric C A`,
      `shade cycle`,
      `isotherms 3`,
    ];
    for (const l of [src[0], src[1], src[3], "state B V=4", "shade cycle  isotherms 3"])
      expect(DIAGRAM_REFERENCE).toContain(l);
    const r = render(src.join("\n"));
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(
      render(`pv\nstate A V=1 P=4\nstate B V=2\nadiabatic A B gamma=1.4\nline B A`).errors,
    ).toEqual([]);
  });

  it("levels", () => {
    const src = `levels (unit=eV schematic)\nlevel -13.6 "n=1"\nlevel -3.4 "n=2"\nlevel -1.51 "n=3"\ntrans 3 2 (show=lambda)`;
    for (const l of [`levels (unit=eV schematic)`, `level -13.6 "n=1"`, `trans 3 2 (show=lambda)`])
      expect(DIAGRAM_REFERENCE).toContain(l);
    const r = render(src);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it("rigid", () => {
    const src = `rigid rod L=4 (tilt=30 eq unit=m)\npivot 0\nsupport 1 3\nf 2 down F_g 2\ndim 0 2 "L/2"`;
    for (const l of src.split("\n").filter((x) => !/^(pivot|support)/.test(x)))
      expect(DIAGRAM_REFERENCE).toContain(l);
    expect(DIAGRAM_REFERENCE).toContain("pivot 0  support 1 3");
    const r = render(src);
    expect(r.errors).toEqual([]);
    // one force about a pivot cannot balance: the example's `eq` is caught, as it should be
    expect(r.warnings.map((w) => w.kind)).toEqual(["physics"]);
    expect(render(`rigid disc r=1\nf 90 ccw F 2\nf 0 down T`).errors).toEqual([]);
  });
});
