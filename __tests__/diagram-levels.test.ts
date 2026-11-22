// levels: energy-level diagrams. Spacing and photon values are computed from the energies.
import { render } from "../src/lib/diagram";
import { labelOverlaps } from "../src/lib/diagram/check";
import { isSafeSvg } from "../src/lib/diagram/safe";

const levels = (src: string) => render(src).levels!;
const errs = (src: string) =>
  render(src)
    .errors.map((e) => `${e.line}: ${e.msg}`)
    .join("\n");
/** y of each level line, in drawing order (lowest level first). */
const lineYs = (svg: string) =>
  [...svg.matchAll(/<line x1="0" y1="([-\d.]+)" x2="[\d.]+" y2="\1" stroke-width="2"/g)].map(
    (m) => +m[1],
  );

const HYDROGEN = `levels unit=eV "Hydrogen"\nlevel -13.6 "n=1"\nlevel -3.4 "n=2"\nlevel -1.51 "n=3"\ntrans 3 2 show=E,lambda\ntrans 2 1 show=lambda`;
const BALMER = `levels schematic\nlevel -13.6 "n=1"\nlevel -3.4 "n=2"\nlevel -1.51 "n=3"\nlevel -0.85 "n=4"\nlevel -0.54 "n=5"\nlevel 0 "n=∞" dashed\ntrans 3 2 show=lambda\ntrans 4 2 show=lambda\ntrans 5 2 show=lambda`;
const ABSORB = `levels\nlevel 0 "ground"\nlevel 2.1 "E_1"\nlevel 3.4 "E_2"\ntrans ground E_2 show=E\ntrans E_2 E_1\ntrans E_1 ground show=lambda`;
const NAMES = `levels noE schematic\nlevel 1 "A"\nlevel 2 "B"\nlevel 4 "C"\ntrans C A "γ_1"\ntrans C B "γ_2"\ntrans B A "γ_3"`;
const XRAY = `levels unit=keV schematic "Copper"\nlevel -8.98 "K"\nlevel -0.93 "L"\nlevel -0.07 "M"\ntrans L K show=E "K_α"\ntrans M K show=E "K_β"`;
const FREQ = `levels\nlevel -5 "1"\nlevel -2 "2"\nlevel -1 "3"\ntrans 1 3 show=f`;
const ALL = [HYDROGEN, BALMER, ABSORB, NAMES, XRAY, FREQ];

describe("levels", () => {
  it.each(ALL)("draws cleanly (%#)", (src) => {
    const r = render(src);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.ok).toBe(true);
    expect(isSafeSvg(r.svg)).toBe(true);
    expect(labelOverlaps(r.svg)).toEqual([]);
  });

  it("computes each photon from the level difference (hydrogen)", () => {
    // n=3→2: ΔE = −1.51 − (−3.4) = 1.89 eV; λ = hc/ΔE = 1239.84 eV·nm / 1.89 eV = 656.0 nm (H-alpha)
    // n=2→1: ΔE = 10.2 eV; λ = 1239.84 / 10.2 = 121.6 nm (Lyman-alpha)
    const m = levels(HYDROGEN);
    expect(m.transitions[0]).toMatchObject({ from: "n=3", to: "n=2", type: "emission" });
    expect(m.transitions[0].dE).toBeCloseTo(1.89, 9);
    expect(m.transitions[0].wavelengthNm).toBeCloseTo(656.0, 1);
    expect(m.transitions[1].dE).toBeCloseTo(10.2, 9);
    expect(m.transitions[1].wavelengthNm).toBeCloseTo(121.55, 1);
    const r = render(HYDROGEN);
    expect(r.visible).toEqual(
      expect.arrayContaining(["1.89 eV, 656 nm", "122 nm", "n = 1", "−13.6 eV", "Hydrogen"]),
    );
    expect(r.alt).toContain("drawn to scale");
    expect(r.alt).toContain("n=3 to n=2, down (a photon is emitted), labelled 1.89 eV, 656 nm");
  });

  it("draws the levels to scale by default", () => {
    // gaps 10.2 eV and 1.89 eV: the lower gap is 10.2/12.09 of the whole height
    const y = lineYs(render(HYDROGEN).svg);
    expect(y).toHaveLength(3);
    expect((y[0] - y[1]) / (y[0] - y[2])).toBeCloseTo(10.2 / 12.09, 2);
    expect(levels(HYDROGEN).scale).toBe("true");
    expect(render(HYDROGEN).visible).not.toContain("not to scale");
  });

  it("spaces the levels equally with schematic, and says so", () => {
    const r = render(BALMER);
    const y = lineYs(r.svg); // five solid levels (the dashed n=∞ line is not matched)
    const gaps = y.slice(1).map((v, i) => y[i] - v);
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0], 6);
    expect(levels(BALMER).scale).toBe("schematic");
    expect(r.alt).toContain("levels equally spaced (not to scale)");
    expect(r.visible).toContain("not to scale");
    // Balmer lines: 1239.84/1.89 = 656, /2.55 = 486, /2.86 = 434 nm
    expect(r.visible).toEqual(expect.arrayContaining(["656 nm", "486 nm", "434 nm"]));
    expect(r.svg).toContain('stroke-dasharray="6 4"');
  });

  it("warns when true-scale levels crowd", () => {
    const r = render(
      `levels\nlevel -13.6 "n=1"\nlevel -3.4 "n=2"\nlevel -1.51 "n=3"\nlevel -0.85 "n=4"`,
    );
    expect(r.ok).toBe(true);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatchObject({ kind: "readability", line: 5 });
    expect(r.warnings[0].msg).toContain("add schematic");
    // the crowded labels are spread so they can still be read
    expect(labelOverlaps(r.svg)).toEqual([]);
  });

  it("knows absorption from emission, and names levels three ways", () => {
    // ground→E_2 is upward: absorption of 3.4 eV. E_1→ground: 2.1 eV, λ = 1239.84/2.1 = 590.4 nm
    const m = levels(ABSORB);
    expect(m.transitions.map((t) => t.type)).toEqual(["absorption", "emission", "emission"]);
    expect(m.transitions[0].dE).toBeCloseTo(3.4, 9);
    expect(m.transitions[2].wavelengthNm).toBeCloseTo(590.4, 1);
    expect(render(ABSORB).alt).toContain(
      "ground to E_2, up (a photon is absorbed), labelled 3.4 eV",
    );
    // by the part of the label after "=" (or its place from the bottom), under any of the verbs
    const base = `levels\nlevel -13.6 "n=1"\nlevel -3.4 "n=2"\nlevel -1.51 "n=3"\n`;
    for (const t of [`trans 3 2`, `jump 3 2`, `emit 3 2`])
      expect(levels(base + t).transitions[0]).toMatchObject({ from: "n=3", to: "n=2" });
    expect(errs(base + `trans n=3 n=2`)).toContain('5: name the two levels without "="');
    expect(
      levels(`levels\nlevel 0 "ground"\nlevel 2 "excited"\ntrans excited ground`).transitions[0]
        .from,
    ).toBe("excited");
    // a name written without quotes still works
    expect(levels(`levels\nlevel -13.6 n=1\nlevel -3.4 n=2\ntrans 2 1`).levels[1].label).toBe(
      "n=2",
    );
  });

  it("works in keV and joules, and prints a frequency", () => {
    // K-alpha: −0.93 − (−8.98) = 8.05 keV; λ = 1239.84 / 8050 = 0.1540 nm
    const x = levels(XRAY);
    expect(x.transitions[0].dE).toBeCloseTo(8.05, 9);
    expect(x.transitions[0].wavelengthNm).toBeCloseTo(0.154, 3);
    expect(render(XRAY).visible).toEqual(
      expect.arrayContaining(["K_{α}, 8.05 keV", "K_{β}, 8.91 keV"]),
    );
    // 4 eV absorbed: f = E/h = 4 / 4.1357e-15 eV·s = 9.672e14 Hz
    expect(levels(FREQ).transitions[0].frequencyHz! / 1e14).toBeCloseTo(9.672, 3);
    expect(render(FREQ).visible).toContain("9.67×10^{14} Hz");
    // 3.2e-19 J = 1.997 eV; λ = hc/E = 6.626e-34 × 2.998e8 / 3.2e-19 = 620.8 nm
    const j = levels(`levels unit=J\nlevel 0 "a"\nlevel 3.2e-19 "b"\ntrans b a show=lambda`);
    expect(j.transitions[0].wavelengthNm).toBeCloseTo(620.8, 0);
  });

  it("hides energies with noE", () => {
    const v = render(NAMES).visible;
    expect(v.join(" ")).not.toMatch(/eV|\d\.\d/);
    expect(v).toEqual(expect.arrayContaining(["A", "B", "C", "γ_{1}", "γ_{2}", "γ_{3}", "E"]));
  });

  it("reports mistakes with the line they are on", () => {
    const base = `levels\nlevel -13.6 "n=1"\nlevel -3.4 "n=2"\n`;
    expect(errs(`levels\nlevel -13.6 "n=1"`)).toContain("1: levels needs at least two level lines");
    expect(errs(base + `trans 5 1`)).toContain(
      '4: no level "5": name a level by its label (n=1, n=2) or by its place from the bottom (1 to 2)',
    );
    expect(errs(base + `trans 2 2`)).toContain(
      "4: a transition needs two levels with different energies",
    );
    expect(errs(base + `trans 2`)).toContain(
      "needs the level it starts on and the level it ends on",
    );
    expect(errs(base + `trans 2 1 show=color`)).toContain(
      'show= takes E, lambda or f, got "color"',
    );
    expect(errs(`levels\nlevel ground\nlevel 2 "b"`)).toContain("2: level needs its energy first");
    expect(errs(`levels unit=kJ\nlevel 0 "a"\nlevel 2 "b"\ntrans b a show=lambda`)).toContain(
      "needs the energies in eV, keV, MeV or J",
    );
    expect(errs(base + `photon 2 1`)).toContain('levels has no "photon"');
    // a photon energy in any unit is fine
    expect(render(`levels unit=kJ\nlevel 0 "a"\nlevel 2 "b"\ntrans b a show=E`).visible).toContain(
      "2 kJ",
    );
  });
});
