// The diagram language Raise and the markdown renderer use: it draws, it reports errors, and model
// text cannot inject markup.
import { render, errorReport } from "../src/lib/diagram";
import { auditDiagramBlocks, hideOpenDiagramBlock } from "../src/lib/diagram/blocks";
import { tutorDiagramSection, DIAGRAM_REFERENCE } from "../src/lib/diagram/prompt";
import { isSafeSvg } from "../src/lib/diagram/safe";

const PLOT = `plot x=t[s] y=v[m/s]\nseg 0,12 6,0 10,-8`;
const FBD = `fbd box "m"\nf down F_g 1\nf up F_N 1`;
const SCENE = `scene\nground 0..5\nblock A 2,0 "m"\nf A.r right 1 "F"`;

describe("render", () => {
  it.each([
    ["plot", PLOT],
    ["fbd", FBD],
    ["scene", SCENE],
  ])("draws a %s", (_kind, src) => {
    const r = render(src);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.svg.startsWith("<svg")).toBe(true);
    expect(r.alt.length).toBeGreaterThan(0);
  });

  it("rejects an unknown kind with a line number", () => {
    const r = render("circuit\nresistor 1");
    expect(r.ok).toBe(false);
    expect(r.errors[0].line).toBe(1);
    expect(errorReport("circuit\nresistor 1", r.errors)).toContain("line 1");
  });

  it("rejects an empty source", () => {
    expect(render("").ok).toBe(false);
  });

  it("does not evaluate code in fn expressions", () => {
    const r = render(`plot x=t[s] y=x[m]\nfn process.exit(1) 0..1`);
    expect(r.ok).toBe(false);
  });

  it.each([
    `plot x=t[s] y="<script>alert(1)</script>"\nseg 0,0 1,1`,
    `plot x=t[s] y=v[m/s]\nseg 0,0 1,1\npt 1,1 "<img src=x onerror=alert(1)>"\nnote 0,0 "<a href='javascript:alert(1)'>x</a>"`,
    `fbd box "</text><script>alert(1)</script>"\nf down "<svg onload=alert(1)>" 1`,
    `scene\nground 0..5\nblock A 2,0 "\\"><script>alert(1)</script>"\ntext 1,1 "<foreignObject>x</foreignObject>"\nalt "</title><script>alert(1)</script>"`,
    `plot x=t[s]"onload="alert(1) y=v\nseg 0,0 1,1`,
  ])("escapes markup in labels (%#)", (src) => {
    const r = render(src);
    expect(isSafeSvg(r.svg)).toBe(true);
    expect(r.svg).not.toMatch(/<script|<img|<a\b|<foreignObject/i);
  });
});

describe("isSafeSvg", () => {
  it("accepts the renderer's own output", () => {
    for (const src of [PLOT, FBD, SCENE]) expect(isSafeSvg(render(src).svg)).toBe(true);
  });
  it.each([
    "<svg><script>alert(1)</script></svg>",
    '<svg onload="alert(1)"></svg>',
    '<svg><a href="https://example.com"><text>x</text></a></svg>',
    "<svg><foreignObject><div>x</div></foreignObject></svg>",
    '<svg><image href="https://example.com/x.png"/></svg>',
    '<svg><rect fill="url(https://example.com/x)"/></svg>',
  ])("rejects %s", (svg) => expect(isSafeSvg(svg)).toBe(false));
});

describe("auditDiagramBlocks", () => {
  const block = (src: string) => "```dg\n" + src + "\n```\n";

  it("leaves text without diagrams alone", () => {
    const text = "Velocity is the slope of the $x$-$t$ graph.\n\n```python\nprint(1)\n```";
    expect(auditDiagramBlocks(text)).toEqual({ text, kept: 0, dropped: [], warnings: [] });
  });

  it("keeps a diagram that draws cleanly", () => {
    const text = `Look at this graph:\n\n${block(PLOT)}\nWhat is the slope?`;
    const audit = auditDiagramBlocks(text);
    expect(audit.kept).toBe(1);
    expect(audit.dropped).toEqual([]);
    expect(audit.text).toContain("```dg");
    expect(audit.text).toContain("What is the slope?");
    // This graph's values are off the labelled ticks: it is kept, and the warning is reported.
    expect(audit.warnings.length).toBeGreaterThan(0);
  });

  it("removes a diagram that cannot be drawn and keeps the words", () => {
    const text = `Here is the setup:\n\n${block("scene\nblock A on=Nowhere")}\nWhat forces act on it?`;
    const audit = auditDiagramBlocks(text);
    expect(audit.kept).toBe(0);
    expect(audit.dropped).toHaveLength(1);
    expect(audit.text).not.toContain("```dg");
    expect(audit.text).toContain("Here is the setup:");
    expect(audit.text).toContain("What forces act on it?");
  });

  it("removes a block the model never closed", () => {
    const audit = auditDiagramBlocks("Consider this:\n\n```dg\nplot x=t[s] y=v[m/s]\nseg 0,0 1");
    expect(audit.text).toBe("Consider this:");
    expect(audit.dropped).toEqual(["block was not closed"]);
  });

  it("judges each block on its own", () => {
    const audit = auditDiagramBlocks(`${block(PLOT)}\ntext\n\n${block("nonsense 1 2")}`);
    expect(audit.kept).toBe(1);
    expect(audit.dropped).toHaveLength(1);
  });
});

describe("hideOpenDiagramBlock", () => {
  const full = "Look:\n\n```dg\n" + PLOT + "\n```\nDone.";
  it("hides a block until its closing fence has arrived", () => {
    for (let i = 0; i <= full.length; i++) {
      const shown = hideOpenDiagramBlock(full.slice(0, i));
      // Whatever is shown never contains a diagram block that cannot be drawn.
      for (const m of shown.matchAll(/```dg[^\n]*\n([\s\S]*?)```/g))
        expect(render(m[1]).ok).toBe(true);
      expect(
        /```dg(?![\s\S]*```dg[\s\S]*)[^`]*$/.test(shown) && !/```dg[^\n]*\n[\s\S]*?```/.test(shown),
      ).toBe(false);
    }
    expect(hideOpenDiagramBlock(full)).toBe(full);
    expect(hideOpenDiagramBlock("Look:\n\n```dg\nplot x=t")).toBe("Look:");
  });
  it("leaves other text and code blocks alone", () => {
    expect(hideOpenDiagramBlock("```python\nprint(1)")).toBe("```python\nprint(1)");
    expect(hideOpenDiagramBlock("plain")).toBe("plain");
  });
});

describe("tutor prompt", () => {
  it("carries the reference and the mode's rules", () => {
    expect(tutorDiagramSection("explain")).toContain(DIAGRAM_REFERENCE);
    expect(tutorDiagramSection("solve")).toContain("do not draw the free-body diagram");
    expect(DIAGRAM_REFERENCE).toContain("```dg");
  });
});

describe("label markup", () => {
  // Raise's notation rule asks for \vec{v}, so the model writes LaTeX in labels too.
  it("draws \\vec, \\text, Greek and degrees instead of raw backslashes", () => {
    const r = render(
      'fbd box\nf left "\\vec{F}_{B \\text{ on } A}" 1\nf down F_g\nf 30 T 1 ang=30^\\circ',
    );
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual([]);
    expect(r.svg).not.toContain("\\");
    expect(r.svg).toContain("F⃗");
    expect(r.svg).toMatch(/B\s+on\s+A/);
    expect(r.alt).toContain("F⃗");
    expect(r.alt).not.toContain("\\text");
  });

  it("takes a quoted force label and its length in the right order", () => {
    const r = render('fbd dot\nf left "F_{B on A}" 0.5\nf right F_g');
    expect(r.ok).toBe(true);
    expect(r.alt).toContain("F_B on A left (length 0.5)");
  });

  it("warns on LaTeX it cannot draw, and draws the bare word", () => {
    const r = render('scene\nground 0..3\ntext 1,1 "\\frac{1}{2} m v^2"');
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => w.line === 3 && w.msg.includes("\\frac"))).toBe(true);
    expect(r.svg).not.toContain("\\frac");
  });

  it("strips $ wrappers and LaTeX spacing", () => {
    const r = render('fbd dot\nf up "$F_{N}\\,$"');
    expect(r.svg).not.toMatch(/\$|\\,/);
  });
});

describe("physics checks (wrong but drawable)", () => {
  it("flags unbalanced arrows on a body at rest, but only when lengths make a claim", () => {
    const unbalanced = "fbd box eq\nf down F_g 1\nf up F_N 1.4";
    expect(render(unbalanced).warnings.some((w) => w.kind === "physics")).toBe(true);
    const balanced = "fbd box eq\nf down F_g 1\nf up F_N 1";
    expect(render(balanced).warnings).toEqual([]);
    // all arrows the same length: no claim about sizes, so a ramp diagram is not flagged
    const ramp = "fbd box tilt=30\nf down F_g\nf 120 F_N\nf 30 f_s";
    expect(render(ramp, { equilibrium: true }).warnings).toEqual([]);
    // a slope falling to the right (the prompt documents tilt=-30 for it) draws the same way
    const fallingRamp = "fbd box tilt=-30\nf down F_g\nf 60 F_N\nf 150 f_k";
    expect(render(fallingRamp).ok).toBe(true);
    expect(render(fallingRamp, { equilibrium: true }).warnings).toEqual([]);
    // the same unbalanced diagram is fine when nothing says the body is at rest
    expect(render("fbd box\nf down F_g 1\nf up F_N 1.4").warnings).toEqual([]);
  });

  it("flags the crate held by an upward pull whose normal force is drawn larger than its weight", () => {
    // Haiku drew this for a crate at rest pulled at 35° above horizontal
    const src = 'fbd box "14 kg"\nf down F_g 1\nf up F_N 1.2\nf left F_s 0.8\nf 35 F_T 1.4';
    expect(render(src, { equilibrium: true }).warnings.some((w) => w.kind === "physics")).toBe(
      true,
    );
  });

  it("rejects an offset written with a space instead of drawing the mass on the pulley", () => {
    // Gemini wrote this for a block on a ramp tied over a pulley to a hanging mass
    const src =
      'scene\nincline R 0,0 30 5\nblock A on=R t=0.5 "m_1"\npulley P R.top+0.3,0.2 r=0.25\nball B P.r -0.8 "m_2" r=0.25\nrope A.r P.t\nrope P.r B.t';
    const r = render(src);
    expect(r.ok).toBe(false);
    expect(r.errors[0].line).toBe(5);
    expect(r.errors[0].msg).toContain("P.r+0,-0.8");
    // the correct spelling draws, with nothing overlapping
    const fixed = render(src.replace("P.r -0.8", "P.r+0,-0.8"));
    expect(fixed.errors).toEqual([]);
    expect(fixed.warnings.filter((w) => w.kind === "physics")).toEqual([]);
  });

  it("flags a ball drawn on top of a pulley", () => {
    const src = "scene\npulley P 2,3 r=0.3\nball B 2.3,3 r=0.3\nrope P.r B.t";
    const w = render(src).warnings.filter((x) => x.kind === "physics");
    expect(w).toHaveLength(1);
    expect(w[0].msg).toContain("on top of each other");
  });

  it("flags a force 'X on Y' that is not on Y", () => {
    const src =
      'scene\nground 0..6\nblock A 1.5,0 "A"\nblock B 4,0 "B"\nf B.r right 1 "F_{A on B}"\nf B.l left 1 "F_{B on A}"';
    const w = render(src).warnings.filter((x) => x.kind === "physics");
    expect(w).toHaveLength(1);
    expect(w[0].line).toBe(6);
  });

  it("flags a contact force between touching blocks that pulls instead of pushes", () => {
    const wrong =
      'scene\nground 0..5\nblock A 1.5,0 "A"\nblock B 2.5,0 "B"\nf A.l right 1 "F_{B on A}"';
    expect(
      render(wrong).warnings.some((w) => w.kind === "physics" && w.msg.includes("touch")),
    ).toBe(true);
    const right =
      'scene\nground 0..5\nblock A 1.5,0 "A"\nblock B 2.5,0 "B"\nf A.l left 1 "F_{B on A}"';
    expect(render(right).warnings).toEqual([]);
  });

  it("does not judge forces between objects that don't touch (attraction is possible)", () => {
    // Gemini's Newton's-third-law diagram (Nov 2026): separated blocks, each force on the right body
    const src =
      'scene\nblock A 1.5,0 w=1 h=1 "A"\nblock B 3.5,0 w=1 h=1 "B"\nf A.r right 1 "\\vec{F}_{B \\text{ on } A}"\nf B.l left 1 "\\vec{F}_{A \\text{ on } B}"';
    expect(render(src).warnings).toEqual([]);
  });

  it("marks an arrow through a block as a physics warning", () => {
    // Gemini's spring diagram (Nov 2026): the spring force drawn from the block's centre
    const src =
      'scene\nground 0..5\nwall 0 0..2\nblock A 3.5,0 w=1 h=1 "m"\nspring 0,0.5 A.l\nf A.c left 1 "F_s"';
    expect(render(src).warnings.some((w) => w.kind === "physics" && w.line === 6)).toBe(true);
  });
});

describe("auditDiagramBlocks policy", () => {
  const fence = (src: string) => "```dg\n" + src + "\n```\n";

  it("drops a diagram that says something false, and keeps the text", () => {
    const text =
      "A crate sits at rest on the floor.\n\n" +
      fence("fbd box\nf down F_g 1\nf up F_N 1.5") +
      "\nWhat balances gravity?";
    const a = auditDiagramBlocks(text);
    expect(a.kept).toBe(0);
    expect(a.dropped[0]).toContain("don't balance");
    expect(a.text).toContain("What balances gravity?");
    expect(a.text).not.toContain("```dg");
  });

  it("keeps a diagram with only a readability warning, and reports it", () => {
    const a = auditDiagramBlocks(fence("plot x=t[s] y=v[m/s]\nseg 0,3 4,3 4,-2 8,-2\nyt -2 2 4"));
    expect(a.kept).toBe(1);
    expect(a.warnings[0]).toContain("labelled tick");
  });

  it("reads 'at rest' only from text before the diagram", () => {
    const after = fence("fbd box\nf down F_g 1\nf up F_N 1.5") + "\nNow imagine it at rest.";
    expect(auditDiagramBlocks(after).kept).toBe(1);
  });
});

describe("shapes and tolerance added after the content test", () => {
  it("draws a loop track with anchors", () => {
    const r = render(
      'scene\nground 0..8\nloop L 6,1 1\nball C L.t+0,-0.2 r=.2\ntext L.t+0,0.4 "top"',
    );
    expect(r.ok).toBe(true);
    expect(r.alt).toContain("circular loop of radius 1");
  });

  it("ignores quotes a model puts around tick labels", () => {
    const r = render('plot x=t[s] y=v[m/s]\nseg 0,8 4,0 8,-8\nxt 4:"4" 8:"8"\nyt -8:"-8" 8:"8"');
    expect(r.ok).toBe(true);
    expect(r.svg).not.toContain("&quot;");
    expect(r.svg).not.toMatch(/>"\d/);
  });
});
