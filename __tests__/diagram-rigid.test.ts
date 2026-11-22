// rigid: extended-body force diagrams. Torques and the net force are computed from where forces act.
import { render } from "../src/lib/diagram";
import { labelOverlaps } from "../src/lib/diagram/check";
import { isSafeSvg } from "../src/lib/diagram/safe";

const rigid = (src: string) => render(src).rigid!;
const errs = (src: string) =>
  render(src)
    .errors.map((e) => `${e.line}: ${e.msg}`)
    .join("\n");

const SEESAW = `rigid rod L=4 eq dims unit=m\npivot 2\nf 0 down F_1 3\nf 3.5 down F_2 4`;
const BEAM = `rigid beam L=6 eq unit=m\nsupport 0 6\nf 0 up N_1 2.5\nf 6 up N_2 3.5\nf 3 down F_g 4\nf 4.5 down F_L 2\ndim 0 3 "3 m"\ndim 3 4.5 "1.5 m"`;
const BOOM = `rigid rod L=4 eq "boom"\npivot 0\nf 2 down F_g 2\nf 4 150 T 2\ndim 0 2 "L/2"\ndim 0 4 "L"`;
const LEANING = `rigid rod L=4 tilt=60 eq\npivot 0\nf 2 down F_g 2\nf 4 left F_N 0.577`;
const PULLEY = `rigid disc r=0.5 unit=m\nf 180 down T_1 3\nf 0 down T_2 2\ndim 0 "R"`;
const WHEEL = `rigid disc r=1\nf 90 ccw F 2\nf 0.3,270 right f 1\ndim 0.3,270 "r"\ndim 30 "R"`;
const UNBALANCED = `rigid rod L=4 eq\npivot 2\nf 0 down F_1 3\nf 4 down F_2 2`;
const ALL = [SEESAW, BEAM, BOOM, LEANING, PULLEY, WHEEL];

describe("rigid", () => {
  it.each(ALL)("draws cleanly (%#)", (src) => {
    const r = render(src);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.ok).toBe(true);
    expect(isSafeSvg(r.svg)).toBe(true);
    expect(labelOverlaps(r.svg)).toEqual([]);
  });

  it("a balanced seesaw: torque is force × distance from the pivot", () => {
    // pivot at 2. F_1 = 3 down at 0: 2 to the left, so it turns the rod counter-clockwise: +3 × 2 = +6.
    // F_2 = 4 down at 3.5: 1.5 to the right, clockwise: −4 × 1.5 = −6. Net 0.
    const m = rigid(SEESAW);
    expect(m.forces.map((f) => +f.torque.toFixed(9))).toEqual([6, -6]);
    expect(m.netTorque).toBeCloseTo(0, 9);
    expect(m.netForce[0]).toBeCloseTo(0, 9);
    expect(m.netForce[1]).toBeCloseTo(-7, 9); // the pivot supplies the other 7
    expect(m).toMatchObject({ body: "rod", about: 2, declaredEquilibrium: true, balanced: true });
    // dims marks each force's distance from the pivot
    expect(render(SEESAW).visible).toEqual(
      expect.arrayContaining(["2 m", "1.5 m", "F_{1}", "F_{2}"]),
    );
  });

  it("a beam on two supports, no pivot: forces and torques both balance", () => {
    // up: 2.5 + 3.5 = 6; down: 4 + 2 = 6. About the centre (3 m):
    // N_1 at −3: −3 × 2.5 = −7.5; N_2 at +3: +10.5; F_g at 0: 0; F_L at +1.5 down: −3. Net 0.
    const m = rigid(BEAM);
    expect(m.about).toBe(3);
    expect(m.forces.map((f) => +f.torque.toFixed(9))).toEqual([-7.5, 10.5, 0, -3]);
    expect(m.netTorque).toBeCloseTo(0, 9);
    expect(m.netForce).toEqual([0, 0]);
    expect(m.balanced).toBe(true);
    expect(render(BEAM).alt).toContain("resting on 2 supports");
  });

  it("a force at an angle: only the perpendicular part turns the rod", () => {
    // weight 2 at 2 m: −2 × 2 = −4. Cable 2 at 4 m, 150° from the rod: 4 × 2 × sin 150° = +4. Net 0.
    const m = rigid(BOOM);
    expect(m.forces[0].torque).toBeCloseTo(-4, 9);
    expect(m.forces[1].torque).toBeCloseTo(4, 9);
    expect(m.balanced).toBe(true);
    expect(render(BOOM).visible).toEqual(expect.arrayContaining(["L/2", "L", "T", "boom"]));
  });

  it("a tilted rod: the lever arm follows the tilt", () => {
    // rod at 60°. Weight 2 at the middle (r = 2): horizontal arm 2 cos 60° = 1 -> −2.
    // Wall force 0.577 to the left at the top (r = 4): vertical arm 4 sin 60° = 3.464 -> +2.0.
    const m = rigid(LEANING);
    expect(m.forces[0].torque).toBeCloseTo(-2, 9);
    expect(m.forces[1].torque).toBeCloseTo(3.4641 * 0.577, 3);
    expect(Math.abs(m.netTorque)).toBeLessThan(0.01);
    expect(m.balanced).toBe(true);
  });

  it("a pulley with unequal tensions has a net torque", () => {
    // r = 0.5. T_1 = 3 down on the left rim: +0.5 × 3 = +1.5 (counter-clockwise). T_2 = 2 down on the right: −1.
    const m = rigid(PULLEY);
    expect(m.forces.map((f) => +f.torque.toFixed(9))).toEqual([1.5, -1]);
    expect(m.netTorque).toBeCloseTo(0.5, 9);
    expect(m).toMatchObject({
      body: "disc",
      about: "centre",
      declaredEquilibrium: false,
      balanced: false,
    });
    expect(render(PULLEY).warnings).toEqual([]); // not declared in equilibrium: no claim
  });

  it("cw and ccw point along the rim; a point inside the disc has a shorter arm", () => {
    // F = 2 counter-clockwise at the top of a unit wheel: +2 × 1 = +2 (it points left there).
    // f = 1 to the right at 0.3 below the centre: +0.3. Net 2.3.
    const m = rigid(WHEEL);
    expect(m.forces[0].deg).toBeCloseTo(180, 9);
    expect(m.forces[0].torque).toBeCloseTo(2, 9);
    expect(m.forces[1].torque).toBeCloseTo(0.3, 9);
    expect(m.netTorque).toBeCloseTo(2.3, 9);
    expect(rigid(`rigid disc\nf 0 cw F`).forces[0].deg).toBeCloseTo(270, 9);
  });

  it("warns when a body declared in equilibrium does not balance", () => {
    // pivot at 2: 3 × 2 = 6 counter-clockwise against 2 × 2 = 4 clockwise
    const r = render(UNBALANCED);
    expect(r.ok).toBe(true);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0].kind).toBe("physics");
    expect(r.warnings[0].msg).toContain(
      "the torques about the pivot do not balance: 6 counter-clockwise against 4 clockwise",
    );
    expect(rigid(UNBALANCED)).toMatchObject({ netTorque: 2, balanced: false });
    // the same picture without `eq` makes no such claim
    expect(render(UNBALANCED.replace(" eq", "")).warnings).toEqual([]);
    // the surrounding text can declare it instead, as for fbd
    expect(
      render(UNBALANCED.replace(" eq", ""), { equilibrium: true }).warnings.map((w) => w.kind),
    ).toEqual(["physics"]);
    // sizes of 1 throughout make no claim about magnitudes
    expect(render(`rigid rod L=4 eq\npivot 2\nf 0 down F_1\nf 3 down F_2`).warnings).toEqual([]);
  });

  it("with no pivot the forces must balance too", () => {
    // torques about the centre cancel (2 × 2 each way) but 4 down is left over
    const r = render(`rigid rod L=4 eq\nf 0 down F_1 2\nf 4 down F_2 2`);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0].msg).toContain("the forces do not balance (they leave 4 at 270°)");
    // add the support force and it is in equilibrium
    expect(render(`rigid rod L=4 eq\nf 0 down F_1 2\nf 4 down F_2 2\nf 2 up N 4`).warnings).toEqual(
      [],
    );
  });

  it("reports mistakes with the line they are on", () => {
    expect(errs(`rigid rod L=4`)).toContain("1: rigid needs forces");
    expect(errs(`rigid rod L=4\nf 5 down F`)).toContain(
      "2: position 5 is off the rod, which runs from 0 to 4",
    );
    expect(errs(`rigid rod L=4\nf 2 sideways F`)).toContain("2: f needs a position, a direction");
    expect(errs(`rigid rod L=4\nf 2 down`)).toContain("a force needs a label");
    expect(errs(`rigid rod L=4\nf 2 down F -3`)).toContain("must be a positive number");
    expect(errs(`rigid disc r=1\npivot 0.5\nf 0 up F`)).toContain(
      "2: a disc turns about its centre",
    );
    expect(errs(`rigid disc r=1\nf 2,90 up F`)).toContain("r = 2 is outside the disc");
    expect(errs(`rigid rod L=4\nrope 2`)).toContain('rigid has no "rope"');
    expect(errs(`rigid rod L=4 heavy\nf 2 down F`)).toContain('rigid has no "heavy"');
    // named positions
    expect(rigid(`rigid rod L=4\npivot left\nf right down F 2`).forces[0].torque).toBeCloseTo(
      -8,
      9,
    );
    expect(rigid(`rigid rod L=4\npivot center\nf right down F 2`).about).toBe(2);
  });
});
