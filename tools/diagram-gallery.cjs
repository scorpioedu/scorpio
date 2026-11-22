/**
 * Renders a curated list of diagram sources into one self-contained HTML file for visual review:
 * each diagram on a light and a dark panel, with its source, its warnings, render time and size.
 *
 *   node tools/diagram-gallery.cjs                 # writes diagram-gallery.html in the repo root
 *   node tools/diagram-gallery.cjs --out /tmp/g.html
 *   node tools/diagram-gallery.cjs --only circuit  # one kind (add --slice 0,4 for its first four)
 *   node tools/diagram-gallery.cjs --svg-dir /tmp/svgs   # also write each SVG as a file
 *
 * The output is not committed (see .gitignore). No dependencies beyond the repo's TypeScript.
 */

const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

// Load the renderer straight from its TypeScript source.
Module._extensions[".ts"] = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  });
  module._compile(out.outputText, filename);
};
const root = path.join(__dirname, "..");
const { render } = require(path.join(root, "src/lib/diagram/index.ts"));
const { labelOverlaps } = require(path.join(root, "src/lib/diagram/check.ts"));
const { isSafeSvg } = require(path.join(root, "src/lib/diagram/safe.ts"));

/** [kind, title, source]. New kinds first; two of each older kind at the end as a reference. */
const EXAMPLES = [
  // ---- circuit ----
  [
    "circuit",
    "Single loop",
    `circuit
battery a d 12V
resistor a b 4Ω R_1
resistor b c 6Ω R_2
resistor c d 2Ω R_3`,
  ],
  [
    "circuit",
    "Series with a parallel pair, current arrows",
    `circuit
battery a c 9V "ε"
resistor a b 3Ω R_1 i=I
resistor b c 6Ω R_2 i=I_2
resistor b c 12Ω R_3 i=I_3`,
  ],
  [
    "circuit",
    "Series and parallel nested two deep",
    `circuit
battery a d 24V
resistor a b 2Ω R_1
resistor b d 12Ω R_2
resistor b c 4Ω R_3
parallel c d resistor 6Ω R_4 resistor 3Ω R_5`,
  ],
  [
    "circuit",
    "Two loops with a shared branch (Kirchhoff)",
    `circuit
battery a g 12V "ε_1"
resistor a b 2Ω R_1 i=I_1
resistor b g 6Ω R_3 i=I_3
resistor c b 4Ω R_2 i=I_2
battery c g 6V "ε_2"
node b "B"
node g "G"`,
  ],
  [
    "circuit",
    "RC charging circuit with a switch",
    `circuit
battery a d 9V "ε"
switch a b open S
resistor b c 2kΩ R
capacitor c d 100μF C`,
  ],
  [
    "circuit",
    "Ammeter in series, voltmeter across",
    `circuit
battery a e 6V r=0.5Ω
ammeter a b
resistor b c 4Ω R_1
resistor c e 8Ω R_2
voltmeter c e`,
  ],
  [
    "circuit",
    "LR circuit, bulbs, ground, closed switch",
    `circuit
battery a d 12V
switch a b closed S
series b d bulb B_1 inductor 50mH L
bulb b d B_2
ground d`,
  ],
  [
    "circuit",
    "LC circuit (no battery)",
    `circuit
capacitor a b 20μF C
switch a c open S
inductor c b 5mH L`,
  ],
  [
    "circuit",
    "Bridge, nodes placed by hand",
    `circuit
battery p q 10V
wire p s
wire q t
resistor s a R_1
resistor s b R_2
resistor a t R_3
resistor b t R_4
ammeter a b
at s 0,1 a 1,2 b 1,0 t 2,1 p 0,-0.7 q 2,-0.7`,
  ],
  [
    "circuit",
    "WARNING: open loop with no switch",
    `circuit
battery a d 12V
resistor a b 4Ω R_1
resistor b c 6Ω R_2`,
  ],
  [
    "circuit",
    "WARNINGS: voltmeter in series, ammeter across, shorted battery, loose end",
    `circuit
battery a d 12V
resistor a b 4Ω R_1
voltmeter b c
resistor c d 6Ω R_2
ammeter c d
wire a d
resistor b e 5Ω R_x`,
  ],
  // ---- bars ----
  [
    "bars",
    "Energy: ball dropped, no losses",
    `bars energy "Falling ball"
initial K 0 U_g 4
final K 4 U_g 0`,
  ],
  [
    "bars",
    "Energy with friction and external work",
    `bars energy
initial K 1 U_g 3 U_s 0
work W_ext 2
final K 3 U_g 0 U_s 1 E_th 2`,
  ],
  [
    "bars",
    "Negative work and negative potential energy",
    `bars energy
initial K 5 U_g -2
work W_f -2
final K 2 U_g -1`,
  ],
  [
    "bars",
    "Momentum, collision of two carts",
    `bars momentum "Collision"
initial p_1 4 p_2 -1
final p_1 1 p_2 2`,
  ],
  [
    "bars",
    "Momentum with an impulse",
    `bars momentum
initial p 3
impulse J -5
final p -2`,
  ],
  [
    "bars",
    "Numeric axis and an unknown bar",
    `bars energy unit=J "Spring launcher"
initial U_s 12 K 0
final K ? U_g 8`,
  ],
  [
    "bars",
    "Small values: the axis scales to the data",
    `bars energy unit=J
initial K 0.2 U_g 0
final K 0.05 E_th 0.15`,
  ],
  [
    "bars",
    "WARNING: energy not conserved",
    `bars energy
initial K 0 U_g 4
final K 5 U_g 0`,
  ],
  // ---- motion ----
  [
    "motion",
    "Constant velocity",
    `motion dt=1 v
obj "cart" x0=0 v0=2 n=5`,
  ],
  [
    "motion",
    "Speeding up from rest, with v and a arrows",
    `motion dt=1 v a
obj "car" x0=0 v0=0 a=2 n=4`,
  ],
  [
    "motion",
    "Slowing down, numbered dots",
    `motion dt=0.5 v a num
obj "puck" x0=0 v0=8 a=-4 n=4`,
  ],
  [
    "motion",
    "Two objects compared",
    `motion dt=1 v "Car catches truck"
obj "truck" x0=0 v0=6 n=6
obj "car" x0=0 v0=0 a=2 n=6`,
  ],
  [
    "motion",
    "Piecewise: cruise, then brake",
    `motion dt=1 v a axis unit=m
obj "bus" x0=0 v0=6 a=0 n=3
seg a=-2 n=3`,
  ],
  [
    "motion",
    "Vertical: ball thrown upward and back",
    `motion dt=0.5 vertical v a num
obj "ball" x0=0 v0=15 a=-10 n=6`,
  ],
  [
    "motion",
    "Turnaround on a horizontal track",
    `motion dt=1 v a
obj "cart" x0=0 v0=6 a=-2 n=6`,
  ],
  // ---- field ----
  [
    "field",
    "Single positive charge with equipotentials",
    `field
charge 0,0 +1 "+q"
equi`,
  ],
  [
    "field",
    "Dipole",
    `field
charge -1.5,0 +1 "+q"
charge 1.5,0 -1 "−q"`,
  ],
  [
    "field",
    "Two like charges, with a labelled point",
    `field
charge -1.5,0 +1
charge 1.5,0 +1
pt 0,0 "P"`,
  ],
  [
    "field",
    "Unequal charges: +2q and −q",
    `field
charge -1.5,0 +2 "+2q"
charge 1.5,0 -1 "−q"
equi`,
  ],
  [
    "field",
    "Four charges (quadrupole)",
    `field
charge -1,1 +1
charge 1,1 -1
charge -1,-1 -1
charge 1,-1 +1`,
  ],
  [
    "field",
    "Positive charge in a uniform field",
    `field
uniform E right "E"
charge 0,0 +1 "+q"`,
  ],
  [
    "field",
    "Parallel plates with a test charge",
    `field
plates 0,1.2 0,-1.2 w=5
test 0.5,0.2 - "−q"
equi`,
  ],
  [
    "field",
    "Gaussian surface and a test charge",
    `field
charge -1,0 +2 "+2q"
charge 2,0 -1 "−q"
gauss circle -1,0 1.2 "S"
test 0.6,1.6 + "q_0"`,
  ],
  [
    "field",
    "Uniform B into the page, moving charge",
    `field xr=0..6 yr=0..4
uniform B in "B"
test 2,2 + "q" v=right`,
  ],
  [
    "field",
    "Long straight wire, current out of the page",
    `field
wire 0,0 out "I"
pt 1.5,0 "P"`,
  ],
  [
    "field",
    "Two parallel wires, opposite currents",
    `field
wire -1.2,0 out "I_1"
wire 1.2,0 in "I_2"`,
  ],
  [
    "field",
    "Uniform E to the right, region of B out of the page",
    `field xr=0..8 yr=0..4
uniform E right "E" x=0..3.5
uniform B out "B" x=4.5..8
gauss rect 1,1 2.5,3 "S"`,
  ],
  [
    "field",
    "Amperian loop round two wires",
    `field
wire -0.8,0 out "I_1"
wire 0.8,0 in "I_2"
ampere circle -0.8,0 1.1 "C"`,
  ],
  // ---- second batch: ray, wave, pv, levels, rigid ----
  ["ray", "Converging lens, object beyond 2F (real, inverted, reduced)", `ray lens f=10 unit=cm
obj 30 h=4`],
  ["ray", "Converging lens as a magnifier (virtual, upright, enlarged), all numbers", `ray lens f=10 unit=cm num=all
obj 6 h=2`],
  ["ray", "Diverging lens", `ray lens f=-10 unit=cm
obj 15 h=4 "candle"`],
  ["ray", "Concave mirror, given numbers shown", `ray mirror f=10 unit=cm num
obj 25 h=4`],
  ["ray", "Convex mirror", `ray mirror convex f=12 unit=cm
obj 20 h=5`],
  ["ray", "Plane mirror", `ray mirror plane
obj 8 h=3`],
  ["ray", "Object at the focal point: rays leave parallel", `ray lens f=10 unit=cm
obj 10 h=3`],
  ["ray", "Setup only, for a problem stem", `ray lens f=12 unit=cm num setup
obj 18 h=3`],
  ["ray", "Refraction, air to glass", `ray refract n1=1 n2=1.5 in=40 m1="air" m2="glass"`],
  ["ray", "Refraction with the reflected ray, water to air, numbers", `ray refract n1=1.33 n2=1 in=30 up reflect num=all m1="water" m2="air"`],
  ["ray", "Total internal reflection", `ray refract n1=1.5 n2=1 in=50 up m1="glass" m2="air"`],
  ["wave", "String fixed at both ends, third harmonic", `wave string n=3`],
  ["wave", "String fixed at one end and free at the other, n = 5, numbers", `wave string free n=5 L=1.2 unit=m num=all`],
  ["wave", "Pipe open at both ends, second harmonic", `wave pipe n=2`],
  ["wave", "Pipe closed at one end, third harmonic", `wave pipe closed n=3 L=0.6 unit=m num`],
  ["wave", "Travelling wave with wavelength and amplitude", `wave travel lambda=2 A=0.5 unit=m num v=right`],
  ["wave", "Two pulses overlapping: constructive", `wave pulses
pulse 4 h=1 w=4 v=right
pulse 5 h=1 w=2 v=left`],
  ["wave", "A crest meeting a trough, numbered grid", `wave pulses num
pulse 4 h=2 w=4 tri v=right
pulse 5 h=-1 w=2 rect v=left`],
  ["wave", "Double slit, ideal", `wave double orders=3`],
  ["wave", "Double slit with the single-slit envelope and fringe positions", `wave double orders=4 da=4 lambda=600nm d=0.2mm L=1.5m num=all`],
  ["wave", "Single slit", `wave single lambda=500nm a=0.05mm L=2m num`],
  ["pv", "Isobaric expansion, work shaded", `pv
state A V=1 P=3
state B V=4 P=3
isobaric A B shade`],
  ["pv", "Isothermal expansion; the end pressure is computed", `pv num P=kPa V=L
state A V=1 P=4
state B V=4
isothermal A B shade`],
  ["pv", "Rectangular cycle, net work shaded", `pv num P=kPa V=L
state A V=1 P=3
state B V=3 P=3
state C V=3 P=1
state D V=1 P=1
isobaric A B
isochoric B C
isobaric C D
isochoric D A
shade cycle`],
  ["pv", "Carnot cycle: two isotherms and two adiabats, three states computed", `pv "Carnot cycle"
state A V=1 P=8
state B V=2
state C V=4
state D V=2
isothermal A B "T_H"
adiabatic B C
isothermal C D "T_C"
adiabatic D A
shade cycle`],
  ["pv", "Three-process cycle over a family of isotherms", `pv
state A V=1 P=3
state B V=3 P=3
state C V=3 P=1
isobaric A B
isochoric B C
isothermal C A
isotherms 4`],
  ["pv", "Isothermal against adiabatic from the same start", `pv
state A V=1 P=4
state B V=3
state C V=3
isothermal A B "isothermal"
adiabatic A C gamma=1.4 "adiabatic"`],
  ["pv", "Inconsistent end state: a physics warning", `pv
state A V=1 P=4
state B V=2 P=3
isothermal A B`],
  ["levels", "Hydrogen, to scale, with computed photon labels", `levels unit=eV "Hydrogen"
level -13.6 "n=1"
level -3.4 "n=2"
level -1.51 "n=3"
trans 3 2 show=E,lambda
trans 2 1 show=lambda`],
  ["levels", "Hydrogen Balmer lines, schematic spacing", `levels schematic
level -13.6 "n=1"
level -3.4 "n=2"
level -1.51 "n=3"
level -0.85 "n=4"
level -0.54 "n=5"
level 0 "n=∞" dashed
trans 3 2 show=lambda
trans 4 2 show=lambda
trans 5 2 show=lambda`],
  ["levels", "Absorption then two emissions", `levels
level 0 "ground"
level 2.1 "E_1"
level 3.4 "E_2"
trans ground E_2 show=E
trans E_2 E_1
trans E_1 ground show=lambda`],
  ["levels", "Names only, custom labels", `levels noE schematic
level 1 "A"
level 2 "B"
level 4 "C"
trans C A "γ_1"
trans C B "γ_2"
trans B A "γ_3"`],
  ["levels", "X-ray lines in keV", `levels unit=keV schematic "Copper"
level -8.98 "K"
level -0.93 "L"
level -0.07 "M"
trans L K show=E "K_α"
trans M K show=E "K_β"`],
  ["levels", "Frequency of an absorbed photon", `levels
level -5 "1"
level -2 "2"
level -1 "3"
trans 1 3 show=f`],
  ["levels", "Crowded at true scale: a readability warning", `levels
level -13.6 "n=1"
level -3.4 "n=2"
level -1.51 "n=3"
level -0.85 "n=4"`],
  ["rigid", "Balanced seesaw with distance marks", `rigid rod L=4 eq dims unit=m
pivot 2
f 0 down F_1 3
f 3.5 down F_2 4`],
  ["rigid", "Beam on two supports", `rigid beam L=6 eq unit=m
support 0 6
f 0 up N_1 2.5
f 6 up N_2 3.5
f 3 down F_g 4
f 4.5 down F_L 2
dim 0 3 "3 m"
dim 3 4.5 "1.5 m"`],
  ["rigid", "Hinged rod held by a cable", `rigid rod L=4 eq "boom"
pivot 0
f 2 down F_g 2
f 4 150 T 2
dim 0 2 "L/2"
dim 0 4 "L"`],
  ["rigid", "Leaning rod", `rigid rod L=4 tilt=60 eq
pivot 0
f 2 down F_g 2
f 4 left F_N 0.577`],
  ["rigid", "Pulley with unequal tensions", `rigid disc r=0.5 unit=m
f 180 down T_1 3
f 0 down T_2 2
dim 0 "R"`],
  ["rigid", "Wheel: a push on the rim and friction at the axle", `rigid disc r=1
f 90 ccw F 2
f 0.3,270 right f 1
dim 0.3,270 "r"
dim 30 "R"`],
  ["rigid", "Declared in equilibrium but unbalanced: a physics warning", `rigid rod L=4 eq
pivot 2
f 0 down F_1 3
f 4 down F_2 2`],
  // ---- older kinds, as a regression reference ----
  ["plot", "v-t graph", `plot x=t[s] y=v[m/s]\nseg 0,12 6,0 10,-8\nshade 0..6\npt 6,0 "A"`],
  ["plot", "Function", `plot x=t[s] y=x[m]\nfn 0.15*cos(8*t) 0..1.6`],
  [
    "plot",
    "Long y label, a note by the axis, a long hl label",
    `plot x=t[s] y=\\omega[rad/s]\nseg 0,2 4,10\nhl 10 "ω_max (rad/s)"\nnote 0.4,6 "starts from rest"\nxt 0 2 4\nyt 2 6 10`,
  ],
  ["fbd", "Block on an incline", `fbd box "m" tilt=30\nf down F_g 1.2\nf 120 F_N 1\nf 30 f_s 0.6`],
  ["fbd", "Hanging mass", `fbd dot "m"\nf up T 1\nf down F_g 1`],
  [
    "scene",
    "Atwood machine",
    `scene\nceil 3 2..4\npulley P 3,2.4 r=.35\nrope 3,3 P.t\nblock A 2.65,0.6 "m_1"\nblock B 3.35,1.2 "m_2"\nrope A.t P.l\nrope B.t P.r`,
  ],
  [
    "scene",
    "Block on an incline with a spring",
    `scene\nincline R 0,0 30 5 lab=\\theta\nblock A on=R t=.5 "m"\nspring R.top A.r\nf A.c down 1 "F_g"`,
  ],
  [
    "scene",
    "Vector labels",
    `scene\nblock A 0,0 "m"\nf A.c right 1 "\\vec{E}_1"\nf A.c up 1 "\\vec{p}"`,
  ],
];

// The examples are also checked by __tests__/diagram-author-fixes.test.ts (well-formed XML).
module.exports = { EXAMPLES };
if (require.main === module) main();

function main() {

  function arg(name) {
    const i = process.argv.indexOf(name);
    return i === -1 ? undefined : process.argv[i + 1];
  }
  const out = path.resolve(arg("--out") ?? path.join(root, "diagram-gallery.html"));
  const only = arg("--only");
  const svgDir = arg("--svg-dir");
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const rows = [];
  let cards = "";
  const [from, to] = (arg("--slice") ?? "0,999").split(",").map(Number);
  EXAMPLES.filter(([kind]) => !only || kind === only)
    .slice(from, to)
    .forEach(([kind, title, src], i) => {
      render(src); // warm up, so the timing below is not the first-call cost
      const t0 = process.hrtime.bigint();
      const r = render(src);
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      const overlaps = r.svg ? labelOverlaps(r.svg) : [];
      const safe = r.svg ? isSafeSvg(r.svg) : true;
      rows.push({
        kind,
        title,
        ok: r.ok,
        ms: +ms.toFixed(2),
        bytes: r.svg.length,
        warnings: r.warnings.length,
        overlaps: overlaps.length,
        safe,
      });
      if (svgDir && r.svg) {
        fs.mkdirSync(svgDir, { recursive: true });
        for (const [theme, fg, bg] of [
          ["light", "#18181b", "#ffffff"],
          ["dark", "#e4e4e7", "#18181b"],
        ])
          fs.writeFileSync(
            path.join(svgDir, `${String(i + 1).padStart(2, "0")}-${kind}-${theme}.svg`),
            r.svg
              .replace("<svg ", `<svg color="${fg}" style="background:${bg};--dg-bg:${bg}" `)
              .replace(` style="max-width:100%;height:auto"`, ""),
          );
      }
      const notes = [
        ...r.errors.map((e) => `<li class="err">error, line ${e.line}: ${esc(e.msg)}</li>`),
        ...r.warnings.map(
          (w) => `<li class="warn"><b>${w.kind ?? "warning"}</b>, line ${w.line}: ${esc(w.msg)}</li>`,
        ),
        ...overlaps.map(
          ([a, b]) => `<li class="warn">labels may overlap: “${esc(a)}” and “${esc(b)}”</li>`,
        ),
        ...(safe ? [] : [`<li class="err">isSafeSvg rejected this output</li>`]),
      ].join("");
      const panel = r.svg || `<div class="none">not drawn</div>`;
      cards += `<section>
  <h2><span class="kind">${kind}</span> ${esc(title)}</h2>
  <div class="panels"><div class="panel light">${panel}</div><div class="panel dark">${panel}</div></div>
  <div class="meta"><pre>${esc(src)}</pre><div>
  <p class="alt"><b>alt:</b> ${esc(r.alt)}</p>
  <ul>${notes}</ul>
  <p class="stats">${ms.toFixed(2)} ms · ${r.svg.length.toLocaleString()} bytes</p></div></div>
  </section>\n`;
    });

  const html = `<!doctype html>
  <html lang="en"><head><meta charset="utf-8"><title>Diagram gallery</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
  body{font:14px/1.45 system-ui,sans-serif;margin:24px;background:#f4f4f5;color:#18181b}
  h1{font-size:20px} h2{font-size:15px;margin:0 0 8px} .kind{font:12px ui-monospace,monospace;background:#18181b;color:#fff;border-radius:4px;padding:2px 6px;margin-right:6px}
  section{background:#fff;border:1px solid #e4e4e7;border-radius:10px;padding:14px;margin:0 0 18px}
  .panels{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .panel{display:flex;justify-content:center;align-items:center;border-radius:8px;padding:16px;min-height:80px;overflow-x:auto;border:1px solid #e4e4e7}
  .light{background:#fff;color:#18181b;--dg-bg:#fff;--dg-accent:#2563eb}
  .dark{background:#18181b;color:#e4e4e7;--dg-bg:#18181b;--dg-accent:#7aa2ff;border-color:#18181b}
  .meta{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}
  pre{margin:0;background:#f4f4f5;border-radius:6px;padding:10px;font:12px/1.5 ui-monospace,monospace;overflow-x:auto}
  ul{margin:6px 0;padding-left:18px} .err{color:#b91c1c} .warn{color:#92400e} .alt{margin:0;color:#3f3f46} .stats{margin:4px 0 0;color:#71717a;font-size:12px}
  .none{color:#a1a1aa;font-style:italic}
  </style></head><body>
  <h1>Diagram gallery</h1>
  <p>${rows.length} examples. Left panel light theme, right panel dark. Generated by tools/diagram-gallery.cjs; not committed.</p>
  ${cards}</body></html>`;
  fs.writeFileSync(out, html);

  const byKind = {};
  for (const r of rows) (byKind[r.kind] ??= []).push(r);
  console.log("kind      n   ms(max)  ms(median)  bytes(max)  bytes(median)");
  for (const [kind, rs] of Object.entries(byKind)) {
    const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    console.log(
      `${kind.padEnd(8)} ${String(rs.length).padStart(2)} ${String(Math.max(...rs.map((r) => r.ms))).padStart(9)} ${String(med(rs.map((r) => r.ms))).padStart(11)} ${String(Math.max(...rs.map((r) => r.bytes))).padStart(11)} ${String(med(rs.map((r) => r.bytes))).padStart(14)}`,
    );
  }
  for (const r of rows)
    if (!r.ok || !r.safe || r.overlaps)
      console.log(
        `  note: ${r.kind} "${r.title}": ${!r.ok ? "NOT DRAWN " : ""}${!r.safe ? "UNSAFE " : ""}${r.overlaps ? `${r.overlaps} possible label overlap(s)` : ""}`,
      );
  if (process.argv.includes("--verbose")) console.table(rows);
  console.log(`wrote ${out}`);
}
