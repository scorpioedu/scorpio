// pv: pressure–volume diagrams. Curves, missing coordinates and work are computed from the process type.
import { render } from "../src/lib/diagram";
import { labelOverlaps } from "../src/lib/diagram/check";
import { isSafeSvg } from "../src/lib/diagram/safe";

const pv = (src: string) => render(src).pv!;
const errs = (src: string) =>
  render(src)
    .errors.map((e) => `${e.line}: ${e.msg}`)
    .join("\n");

const ISOBARIC = `pv\nstate A V=1 P=3\nstate B V=4 P=3\nisobaric A B shade`;
const ISOTHERMAL = `pv num P=kPa V=L\nstate A V=1 P=4\nstate B V=4\nisothermal A B shade`;
const RECTANGLE = `pv num P=kPa V=L\nstate A V=1 P=3\nstate B V=3 P=3\nstate C V=3 P=1\nstate D V=1 P=1\nisobaric A B\nisochoric B C\nisobaric C D\nisochoric D A\nshade cycle`;
const CARNOT = `pv "Carnot cycle"\nstate A V=1 P=8\nstate B V=2\nstate C V=4\nstate D V=2\nisothermal A B "T_H"\nadiabatic B C\nisothermal C D "T_C"\nadiabatic D A\nshade cycle`;
const FAMILY = `pv\nstate A V=1 P=3\nstate B V=3 P=3\nstate C V=3 P=1\nisobaric A B\nisochoric B C\nisothermal C A\nisotherms 4`;
const COMPARE = `pv\nstate A V=1 P=4\nstate B V=3\nstate C V=3\nisothermal A B "isothermal"\nadiabatic A C gamma=1.4 "adiabatic"`;
const ALL = [ISOBARIC, ISOTHERMAL, RECTANGLE, CARNOT, FAMILY, COMPARE];

describe("pv", () => {
  it.each(ALL)("draws cleanly (%#)", (src) => {
    const r = render(src);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.ok).toBe(true);
    expect(isSafeSvg(r.svg)).toBe(true);
    expect(labelOverlaps(r.svg)).toEqual([]);
  });

  it("isobaric: W = PΔV", () => {
    // 3 × (4 − 1) = 9
    const m = pv(ISOBARIC);
    expect(m.processes).toHaveLength(1);
    expect(m.processes[0]).toMatchObject({
      from: "A",
      to: "B",
      type: "isobaric",
      consistent: true,
    });
    expect(m.processes[0].work).toBeCloseTo(9, 12);
    expect(m.processes[0].workJ).toBeUndefined(); // no units given
    expect(m.cycle).toBe(false);
    expect(render(ISOBARIC).alt).toContain(
      "A to B isobaric expansion (area under it shaded: the work done by the gas)",
    );
  });

  it("isothermal: the missing pressure and W = P1·V1·ln(V2/V1)", () => {
    // P_B = 4 × 1 / 4 = 1 kPa. W = 4 × ln 4 = 5.545 kPa·L = 5.545 J
    const m = pv(ISOTHERMAL);
    expect(m.states.B.P).toBeCloseTo(1, 12);
    expect(m.processes[0].work).toBeCloseTo(4 * Math.log(4), 9);
    expect(m.processes[0].workJ).toBeCloseTo(5.545, 3);
    // the drawn curve is P = 4/V: its point at V = 2 is at P = 2
    const pts = [
      ...render(ISOTHERMAL).svg.matchAll(
        /<polyline points="([^"]+)" fill="none" stroke-width="2.25"/g,
      ),
    ][0][1]
      .split(" ")
      .map((p) => p.split(",").map(Number));
    // axes run 0..4.8 on both: x = V/4.8 × 300, y = −P/4.8 × 220
    const at2 = pts.find((p) => Math.abs(p[0] - (2 / 4.8) * 300) < 0.06)!;
    expect(at2[1]).toBeCloseTo((-2 / 4.8) * 220, 0);
    // compression is negative work by the gas
    expect(pv(`pv\nstate A V=4 P=1\nstate B V=1\nisothermal A B`).processes[0].work).toBeCloseTo(
      -4 * Math.log(4),
      9,
    );
    // a state may give P instead: V = 4 × 1 / 2 = 2
    expect(pv(`pv\nstate A V=1 P=4\nstate B P=2\nisothermal A B`).states.B.V).toBeCloseTo(2, 12);
  });

  it("a rectangular cycle: net work is the enclosed area, positive clockwise", () => {
    // A→B: 3 × 2 = 6; B→C: 0; C→D: 1 × (−2) = −2; D→A: 0. Net 4 kPa·L = 4 J = (3 − 1) × (3 − 1)
    const m = pv(RECTANGLE);
    expect(m.processes.map((p) => +p.work.toFixed(9))).toEqual([6, 0, -2, 0]);
    expect(m.cycle).toBe(true);
    expect(m.netWork).toBeCloseTo(4, 12);
    expect(m.netWorkJ).toBeCloseTo(4, 12);
    expect(render(RECTANGLE).alt).toContain(
      "closed cycle, drawn clockwise (net work done by the gas); the enclosed area, the net work, is shaded",
    );
    // the same loop the other way round does negative net work
    const back = pv(
      `pv\nstate A V=1 P=3\nstate B V=3 P=3\nstate C V=3 P=1\nstate D V=1 P=1\nisochoric A D\nisobaric D C\nisochoric C B\nisobaric B A`,
    );
    expect(back.netWork).toBeCloseTo(-4, 12);
    expect(
      render(
        `pv\nstate A V=1 P=3\nstate B V=3 P=3\nstate C V=3 P=1\nstate D V=1 P=1\nisochoric A D\nisobaric D C\nisochoric C B\nisobaric B A`,
      ).alt,
    ).toContain("counter-clockwise (net work done on the gas)");
  });

  it("a Carnot cycle from one full state and three volumes", () => {
    // γ = 5/3. A (1, 8). B: isothermal, P = 8/2 = 4. C: adiabatic, P = 4 × (2/4)^(5/3) = 4 × 0.31498 = 1.2599.
    // D: isothermal from C, P = 1.2599 × 4/2 = 2.5198; and D→A is adiabatic: 2.5198 × 2^(5/3) = 8.000 ✓
    // W_AB = 8 ln 2 = 5.5452; W_BC = (8 − 5.0397)/(2/3) = 4.4405; W_CD = 5.0397 ln(1/2) = −3.4932; W_DA = −4.4405
    // net = 2.0520 = Q_H × (1 − T_C/T_H) = 5.5452 × (1 − 5.0397/8)
    const m = pv(CARNOT);
    expect(m.states.B.P).toBeCloseTo(4, 9);
    expect(m.states.C.P).toBeCloseTo(1.2599, 4);
    expect(m.states.D.P).toBeCloseTo(2.5198, 4);
    expect(m.processes.every((p) => p.consistent)).toBe(true);
    expect(m.processes.map((p) => +p.work.toFixed(3))).toEqual([5.545, 4.44, -3.493, -4.44]);
    expect(m.netWork).toBeCloseTo(8 * Math.log(2) * (1 - 5.0397 / 8), 3);
    expect(m.processes[1].gamma).toBeCloseTo(5 / 3, 12);
    expect(render(CARNOT).visible).toEqual(
      expect.arrayContaining(["T_{H}", "T_{C}", "A", "B", "C", "D", "Carnot cycle"]),
    );
  });

  it("an adiabat falls faster than the isotherm from the same state", () => {
    // isothermal: P = 4/3 = 1.3333. adiabatic, γ = 1.4: P = 4 × 3^(−1.4) = 4 × 0.21479 = 0.8592
    const m = pv(COMPARE);
    expect(m.states.B.P).toBeCloseTo(4 / 3, 9);
    expect(m.states.C.P).toBeCloseTo(0.8592, 4);
    // W_adiabatic = (P1V1 − P2V2)/(γ − 1) = (4 − 2.5775)/0.4 = 3.556 < W_isothermal = 4 ln 3 = 4.394
    expect(m.processes[1].work).toBeCloseTo(3.556, 3);
    expect(m.processes[0].work).toBeCloseTo(4.394, 3);
    expect(m.cycle).toBe(false);
  });

  it("a straight-line process: the area of the trapezium", () => {
    // (1 + 3)/2 × (3 − 1) = 4
    expect(pv(`pv\nstate A V=1 P=1\nstate B V=3 P=3\nline A B`).processes[0].work).toBeCloseTo(
      4,
      12,
    );
  });

  it("converts work to joules when both units are known", () => {
    // 2 atm × 3 L = 2 × 101325 Pa × 3e-3 m³ = 607.95 J
    const m = pv(`pv P=atm V=L\nstate A V=1 P=2\nstate B V=4 P=2\nisobaric A B`);
    expect(m.processes[0].work).toBeCloseTo(6, 12);
    expect(m.processes[0].workJ).toBeCloseTo(607.95, 6);
    expect(
      pv(`pv P=psi V=L\nstate A V=1 P=2\nstate B V=4 P=2\nisobaric A B`).processes[0].workJ,
    ).toBeUndefined();
  });

  it("warns when a stated end state does not follow from the process", () => {
    const warn = (src: string) => render(src).warnings;
    const iso = warn(`pv\nstate A V=1 P=4\nstate B V=2 P=3\nisothermal A B`);
    expect(iso).toHaveLength(1);
    expect(iso[0]).toMatchObject({ kind: "physics", line: 4 });
    // P·V: 4 at A, 6 at B; on the isotherm P at V = 2 is 2
    expect(iso[0].msg).toContain(
      "P·V must stay the same, but it is 4 at A and 6 at B; for V = 2 the pressure is 2",
    );
    expect(pv(`pv\nstate A V=1 P=4\nstate B V=2 P=3\nisothermal A B`).processes[0].consistent).toBe(
      false,
    );
    expect(warn(`pv\nstate A V=1 P=4\nstate B V=2 P=3\nisobaric A B`)[0].msg).toContain(
      "the pressure must stay the same",
    );
    expect(warn(`pv\nstate A V=1 P=4\nstate B V=2 P=3\nisochoric A B`)[0].msg).toContain(
      "the volume must stay the same",
    );
    // adiabatic, γ = 5/3: at V = 2, P = 4 × 2^(−5/3) = 1.26, not 2 (which would be the isotherm)
    expect(warn(`pv\nstate A V=1 P=4\nstate B V=2 P=2\nadiabatic A B`)[0].msg).toContain(
      "for V = 2 the pressure is 1.26, not 2",
    );
    // rounding to three figures is not an inconsistency
    expect(warn(`pv\nstate A V=1 P=4\nstate B V=2 P=1.26\nadiabatic A B`)).toEqual([]);
    expect(warn(`pv\nstate A V=1 P=4\nstate B V=3 P=1.33\nisothermal A B`)).toEqual([]);
  });

  it("shows numbers only with num, and reports them as scale and readable values", () => {
    const bare = render(RECTANGLE.replace(" num", ""));
    expect(bare.visible.join(" ")).not.toMatch(/\d/);
    expect(bare.scale).toEqual([]);
    const r = render(RECTANGLE);
    expect(r.scale).toEqual(expect.arrayContaining(["1", "2", "3"]));
    expect(r.visible).toEqual(expect.arrayContaining(["P (kPa)", "V (L)", "A", "D"]));
    // with a numbered axis a state's coordinates can be read off: they count as visible
    expect(r.visible.filter((t) => /^\d+$/.test(t)).sort()).toEqual([
      "1",
      "1",
      "1",
      "1",
      "3",
      "3",
      "3",
      "3",
    ]);
    expect(render(ISOTHERMAL).alt).toContain("The axes are numbered.");
  });

  it("reports mistakes with the line they are on", () => {
    expect(errs(`pv`)).toContain("1: pv needs states");
    expect(errs(`pv\nstate A V=1 P=4\nisobaric A B`)).toContain('3: no state "B"; define it first');
    expect(errs(`pv\nstate A V=1 P=4\nstate A V=2 P=2`)).toContain("3: state A is defined twice");
    expect(errs(`pv\nstate A V=1 P=4\nstate B V=2\nline A B`)).toContain("3: state B needs P= too");
    expect(errs(`pv\nstate A V=1 P=4\nstate B`)).toContain("3: state B needs V= or P=");
    expect(errs(`pv\nstate A V=-1 P=4`)).toContain("V and P must be positive");
    expect(errs(`pv\nstate A V=1 P=4\nstate B V=2 P=4\nisobaric A B\nshade cycle`)).toContain(
      "5: shade cycle needs a closed cycle",
    );
    expect(errs(`pv\nstate A V=1 P=4\nstate B V=2\nisothermal A B gamma=1.4`)).toContain(
      "gamma belongs to an adiabatic process",
    );
    expect(errs(`pv\nstate A V=1 P=4\nstate B V=2\nadiabatic A B gamma=0.9`)).toContain(
      "gamma must be greater than 1",
    );
    expect(errs(`pv\nstate A V=1 P=4\nheat A`)).toContain('3: pv has no "heat"');
    expect(errs(`pv\nstate A V=1 P=4\nisotherms 40`)).toContain("1 to 8");
  });
});
