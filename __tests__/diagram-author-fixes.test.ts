// Defects content authors ran into: clipped plot labels, invalid XML from refraction diagrams,
// \vec{} drawn as a broken glyph, Amperian loops, and bar charts of small values.
import { render, svgTexts } from "../src/lib/diagram";
import { viewBoxOf } from "../src/lib/diagram/export";
import { label, textWidth } from "../src/lib/diagram/svg";
import { isSafeSvg } from "../src/lib/diagram/safe";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { EXAMPLES } = require("../tools/diagram-gallery.cjs") as {
  EXAMPLES: [string, string, string][];
};

/** Problems that make a strict XML parser reject the SVG: bad nesting, bare & or <, repeated attributes. */
function xmlProblems(xml: string): string[] {
  const probs: string[] = [];
  const stack: string[] = [];
  const re =
    /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|<!--[\s\S]*?-->|<|&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g;
  for (const m of xml.matchAll(re)) {
    if (m[0] === "<") probs.push(`stray < at ${m.index}`);
    else if (m[0].startsWith("&")) probs.push(`bare & at ${m.index}`);
    else if (m[0].startsWith("<!--")) continue;
    else if (m[1]) {
      const top = stack.pop();
      if (top !== m[2]) probs.push(`</${m[2]}> closes <${top}>`);
    } else {
      const names = [...m[3].matchAll(/([^\s=]+)\s*=/g)].map((a) => a[1]);
      const dup = names.filter((n, i) => names.indexOf(n) !== i);
      if (dup.length) probs.push(`<${m[2]}> repeats ${[...new Set(dup)].join(", ")}`);
      if (!m[4]) stack.push(m[2]);
    }
  }
  if (stack.length) probs.push(`unclosed ${stack.join(" ")}`);
  return probs;
}

/** Each <text>'s estimated horizontal extent, by the renderer's own width estimate. */
function textExtents(svg: string): { s: string; left: number; right: number }[] {
  return [
    ...svg.matchAll(/<text x="(-?[\d.]+)" y="-?[\d.]+" text-anchor="(\w+)"[^>]*>(.*?)<\/text>/g),
  ].map((m) => {
    const s = m[3].replace(/<[^>]+>/g, "");
    const w = textWidth(s);
    const x = Number(m[1]);
    const left = m[2] === "start" ? x : m[2] === "end" ? x - w : x - w / 2;
    return { s, left, right: left + w };
  });
}

function insideViewBox(svg: string) {
  const [x, , w] = viewBoxOf(svg)!;
  return textExtents(svg).filter((t) => t.left < x || t.right > x + w);
}

describe("every gallery example is well-formed XML", () => {
  it.each(EXAMPLES.map(([kind, title, src]) => [`${kind}: ${title}`, src]))("%s", (_t, src) => {
    const r = render(src);
    if (!r.svg) return; // an example that is meant not to draw
    expect(xmlProblems(r.svg)).toEqual([]);
    expect(isSafeSvg(r.svg)).toBe(true);
  });

  it("the checker catches a repeated attribute", () => {
    expect(xmlProblems(`<svg><line x1="1" stroke-width="1" stroke-width="2"/></svg>`)).toEqual([
      "<line> repeats stroke-width",
    ]);
  });

  it("refraction rays carry one stroke-width, the wider one asked for", () => {
    const r = render(`ray refract n1=1 n2=1.5 in=40 reflect m1="air" m2="glass"`);
    expect(xmlProblems(r.svg)).toEqual([]);
    expect(r.svg).toMatch(/<line [^>]*stroke-width="2"[^>]*\/>/);
  });
});

describe("plot labels stay inside the picture", () => {
  for (const y of ["v[m/s]", "ω[rad/s]", "\\omega[rad/s]", "τ[N·m]", "dI/dx[kg·m]", "L[kg·m^2/s]"])
    it(`y = ${y}`, () => {
      const r = render(`plot x=t[s] y=${y}\nseg 0,2 4,10\nxt 0 2 4\nyt 2 6 10`);
      expect(r.errors).toEqual([]);
      expect(insideViewBox(r.svg)).toEqual([]);
      // the plot itself does not move: only the view box grows to the left
      expect(r.svg).toContain(`<line x1="46" y1="196" x2="46"`);
      expect(viewBoxOf(r.svg)![0]).toBeLessThan(0);
    });

  it("long tick labels are inside too", () => {
    const r = render(`plot x=t[s] y=v[m/s]\nseg 0,-0.025 4,0.025\nxt 0 2 4\nyt -0.025 0.025`);
    expect(insideViewBox(r.svg)).toEqual([]);
  });

  it("a short label keeps the old view box", () => {
    const r = render(`plot x=t[s] y=x[m]\nfn 0.15*cos(8*t) 0..1.6`);
    expect(viewBoxOf(r.svg)).toEqual([0, 0, 360, 220]);
  });

  it("the old workaround, xr below zero, still draws the same way", () => {
    const r = render(`plot x=t[s] y=ω[rad/s] xr=-1,6\nseg 0,0 5,20\nxt 0 5\nyt 20`);
    expect(viewBoxOf(r.svg)).toEqual([0, 0, 360, 220]);
    expect(insideViewBox(r.svg)).toEqual([]);
  });

  it("an hl label past the right edge widens the view box", () => {
    const r = render(
      `plot x=t[s] y=v[m/s]\nseg 0,2 4,10\nhl 10 "v_max = 10 m/s here"\nxt 0 2 4\nyt 2 10`,
    );
    expect(insideViewBox(r.svg)).toEqual([]);
    const [x, , w] = viewBoxOf(r.svg)!;
    expect(x + w).toBeGreaterThan(360);
  });

  it("a note by the y-axis slides right, off the axis and its tick labels", () => {
    const r = render(
      `plot x=t[s] y=v[m/s]\nseg 0,2 4,10\nnote 0.1,6 "starts from rest"\nxt 0 2 4\nyt 2 6 10`,
    );
    const note = textExtents(r.svg).find((t) => t.s === "starts from rest")!;
    const axis = Number(r.svg.match(/<line x1="(-?[\d.]+)" y1="[\d.]+" x2="\1" y2="13.6"/)![1]);
    expect(note.left).toBeGreaterThan(axis);
    expect(insideViewBox(r.svg)).toEqual([]);
  });

  it("a note near the right edge slides left inside the frame", () => {
    const r = render(
      `plot x=t[s] y=v[m/s]\nseg 0,2 4,10\nnote 4,6 "the end of the motion"\nxt 0 2 4\nyt 2 6 10`,
    );
    const note = textExtents(r.svg).find((t) => t.s === "the end of the motion")!;
    expect(note.right).toBeLessThanOrEqual(360);
  });
});

describe("\\vec{} in labels", () => {
  it("draws the arrow as its own small glyph, not the combining U+20D7", () => {
    for (const s of ["\\vec{E}_1", "\\vec{p}", "\\vec F"]) {
      const out = label(s);
      expect(out).not.toContain("\u20d7");
      expect(out).toContain(`<tspan class="vec"`);
      expect(out).toContain("→");
    }
  });

  it("keeps subscripts below and superscripts above the baseline after an arrow", () => {
    expect(label("\\vec{E}_1")).toMatch(/→<\/tspan><tspan dy="1em" font-size="75%">1<\/tspan>$/);
    expect(label("\\vec{v}^2")).toMatch(/→<\/tspan><tspan dy="0.3em" font-size="75%">2<\/tspan>$/);
    expect(label("\\vec{F} on A")).toMatch(/→<\/tspan><tspan dy="0.56em"> on A<\/tspan>$/);
  });

  it("leaves labels without \\vec as they were", () => {
    expect(label("F_{net}")).toBe(`F<tspan dy="0.3em" font-size="75%">net</tspan>`);
    expect(label("v_1 x")).toBe(
      `v<tspan dy="0.3em" font-size="75%">1</tspan><tspan dy="-0.3em"> x</tspan>`,
    );
  });

  it.each([
    ["scene", `scene\nblock A 0,0 "m"\nf A.c right 1 "\\vec{E}_1"\nf A.c up 1 "\\vec{p}"`],
    ["fbd", `fbd dot "m"\nf up \\vec{F}_N 1\nf down \\vec{F}_g 1`],
    ["plot", `plot x=t[s] y=p[kg·m/s]\nseg 0,0 2,2 "\\vec{p}"\nxt none\nyt none`],
    ["field", `field\ncharge 0,0 +1\npt 1.5,0 "\\vec{E}_1"`],
    ["bars", `bars momentum\ninitial \\vec{p}_1 2\nfinal \\vec{p}_1 2`],
  ])("in %s", (_k, src) => {
    const r = render(src);
    expect(r.errors).toEqual([]);
    expect(r.warnings.filter((w) => w.kind === "markup")).toEqual([]);
    // drawn text has no combining arrow (the <title> alt text keeps it, for screen readers)
    expect(r.svg.replace(/<title>.*<\/title>/, "")).not.toContain("\u20d7");
    expect(r.svg).toContain(`class="vec"`);
    expect(xmlProblems(r.svg)).toEqual([]);
    expect(isSafeSvg(r.svg)).toBe(true);
    // what a student can read still names the vector
    expect(svgTexts(r.svg).some((t) => t.includes("\u20d7"))).toBe(true);
  });

  it("reads back as the same text as before", () => {
    expect(svgTexts(`<text>${label("\\vec{E}_1")}</text>`)).toEqual(["E\u20d7_{1}"]);
    expect(svgTexts(`<text>${label("\\vec{v}^2")}</text>`)).toEqual(["v\u20d7^{2}"]);
  });
});

describe("field: Amperian loop", () => {
  it("draws like the Gaussian surface and says Amperian loop", () => {
    const amp = render(
      `field\nwire -0.8,0 out "I_1"\nwire 0.8,0 in "I_2"\nampere circle -0.8,0 1.1 "C"`,
    );
    const gauss = render(
      `field\nwire -0.8,0 out "I_1"\nwire 0.8,0 in "I_2"\ngauss circle -0.8,0 1.1 "C"`,
    );
    expect(amp.errors).toEqual([]);
    expect(amp.warnings).toEqual([]);
    expect(amp.svg.replace(/<title>.*<\/title>/, "")).toBe(
      gauss.svg.replace(/<title>.*<\/title>/, ""),
    );
    expect(amp.alt).toContain("a dashed Amperian loop C enclosing net current 1 out of the page");
    expect(amp.alt).not.toContain("Gaussian");
  });

  it("rect form, and no current without wires", () => {
    const r = render(`field xr=0..6 yr=0..4\nuniform B in "B"\nampere rect 1,1 3,3 "C"`);
    expect(r.errors).toEqual([]);
    expect(r.svg).toMatch(/<rect [^>]*stroke-dasharray="7 3 2 3"/);
    expect(r.alt).toContain("a dashed Amperian loop C");
  });

  it("warns when the loop runs through a wire, and reports a bad shape", () => {
    const r = render(`field\nwire 1,0 out\nampere circle 0,0 1`);
    expect(r.warnings.map((w) => w.msg).join()).toContain("passes through a wire");
    expect(render(`field\nwire 0,0 out\nampere square 0,0 1`).errors[0].msg).toContain(
      "ampere needs circle or rect",
    );
  });
});

describe("bars: values well below 1", () => {
  it("scales the axis to the data", () => {
    const r = render(`bars energy unit=J\ninitial K 0.2 U_g 0\nfinal K 0.05 E_th 0.15`);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.scale).toEqual(["0", "0.05", "0.1", "0.15", "0.2"]);
    const heights = [...r.svg.matchAll(/<rect [^>]*height="([\d.]+)" fill=/g)].map((m) => +m[1]);
    expect(Math.max(...heights)).toBe(112); // the tallest bar fills the chart, as with whole numbers
  });

  it("leaves charts of whole numbers as they were", () => {
    const r = render(`bars energy unit=J\ninitial K 0 U_g 4\nfinal K 4 U_g 0`);
    expect(r.scale).toEqual(["0", "1", "2", "3", "4"]);
  });
});
