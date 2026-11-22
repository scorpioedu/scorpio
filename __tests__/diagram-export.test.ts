import { render } from "@/lib/diagram";
import {
  DARK_THEME,
  EXPORT_FONT,
  LIGHT_THEME,
  embedDiagram,
  exportFilename,
  exportSvg,
  rasterSize,
  svgDataUrl,
  viewBoxOf,
} from "@/lib/diagram/export";
import { isSafeSvg } from "@/lib/diagram/safe";
import {
  SHARE_CARD_HEIGHT,
  SHARE_CARD_WIDTH,
  shareCardSvg,
  wrapTitle,
} from "@/lib/diagram/share-card";

const FBD = `fbd box "m"
f down F_g 2
f up F_N 2`;
const PLOT = `plot x=t[s] y=v[m/s]
seg 0,0 4,8
shade 0..4`;
const SWITCH = `circuit
battery a c 9V
switch a b open S
resistor b c 2Ω R`;

const drawn = (src: string) => {
  const r = render(src);
  expect(r.ok).toBe(true);
  return r.svg;
};
/** Everything inside tags: where a colour reference could hide. */
const tags = (svg: string) => (svg.match(/<[^>]*>/g) ?? []).join("");

describe("exportSvg", () => {
  it("writes the page's colours in, so nothing depends on a host page", () => {
    for (const src of [FBD, PLOT, SWITCH]) {
      const out = exportSvg(drawn(src), DARK_THEME)!;
      expect(tags(out.svg)).not.toMatch(/currentColor|var\(/);
      expect(isSafeSvg(out.svg)).toBe(true);
    }
    const plot = exportSvg(drawn(PLOT), DARK_THEME)!.svg;
    expect(plot).toContain(DARK_THEME.accent); // the series line and shading
    expect(plot).toContain(`fill="${DARK_THEME.fg}"`);
    // an open switch's terminals are filled with the background (--dg-bg)
    expect(exportSvg(drawn(SWITCH), DARK_THEME)!.svg).toContain(`fill="${DARK_THEME.bg}"`);
  });

  it("uses --dg-force for force arrows when the theme has one", () => {
    const out = exportSvg(drawn(FBD), { ...LIGHT_THEME, force: "#dc2626" })!.svg;
    expect(out).toContain('stroke="#dc2626"');
    expect(exportSvg(drawn(FBD), LIGHT_THEME)!.svg).not.toContain("#dc2626");
  });

  it("has a solid background, padding, a fallback font stack and the wordmark", () => {
    const svg = drawn(FBD);
    const [, , w, h] = viewBoxOf(svg)!;
    const out = exportSvg(svg, LIGHT_THEME)!;
    // 24 px each side, 16 px footer for the wordmark; never narrower than 200
    expect(out.width).toBe(Math.ceil(Math.max(w + 48, 200)));
    expect(out.height).toBe(Math.ceil(h + 48 + 16));
    expect(out.svg).toContain(
      `<rect width="${out.width}" height="${out.height}" fill="${LIGHT_THEME.bg}"/>`,
    );
    expect(out.svg).toContain(`font-family="${EXPORT_FONT}"`);
    expect(out.svg).not.toContain('font-family="system-ui,sans-serif"');
    expect(out.svg).toMatch(/>scorpio<\/text><\/svg>$/);
    // fixed size: a file has no container to shrink into
    expect(out.svg).toMatch(new RegExp(`^<svg [^>]*width="${out.width}" height="${out.height}"`));
    expect(out.svg).not.toContain("max-width");
  });

  it("can leave the wordmark out, and the on-page diagram never has one", () => {
    const svg = drawn(FBD);
    expect(svg).not.toContain("scorpio");
    const out = exportSvg(svg, LIGHT_THEME, { wordmark: false, padding: 10 })!;
    expect(out.svg).not.toContain("scorpio");
    expect(out.height).toBe(Math.ceil(viewBoxOf(svg)![3] + 20));
  });

  it("keeps label text and alt text as written", () => {
    const svg = drawn(`fbd box "currentColor"\nf up F_N 1`);
    const out = exportSvg(svg, DARK_THEME)!.svg;
    expect(out).toContain(">currentColor<");
    expect(tags(out)).not.toContain("currentColor");
  });

  it("refuses a theme value that is not a plain colour", () => {
    const out = exportSvg(drawn(PLOT), {
      fg: '#000"/><script>alert(1)</script>',
      bg: "url(https://example.com/x.png)",
      accent: "rgb(10 20 30 / 0.5)",
    })!.svg;
    expect(isSafeSvg(out)).toBe(true);
    expect(out).not.toContain("script");
    expect(out).toContain(`fill="${LIGHT_THEME.bg}"`);
    expect(out).toContain("rgb(10 20 30 / 0.5)");
  });

  it("returns nothing for text that is not a rendered diagram", () => {
    expect(exportSvg("", LIGHT_THEME)).toBeUndefined();
    expect(exportSvg("<p>hello</p>", LIGHT_THEME)).toBeUndefined();
    expect(exportSvg('<svg viewBox="0 0 0 10"></svg>', LIGHT_THEME)).toBeUndefined();
  });

  it("embedDiagram positions the drawing and keeps its viewBox", () => {
    const svg = drawn(FBD);
    const vb = svg.match(/viewBox="([^"]+)"/)![1];
    const inner = embedDiagram(svg, LIGHT_THEME, { x: 5, y: 6, width: 70, height: 80 });
    expect(inner).toMatch(/^<svg x="5" y="6" width="70" height="80" /);
    expect(inner).toContain(`viewBox="${vb}"`);
    expect(inner).not.toMatch(/class="dg"|role="img"|style=/);
  });
});

describe("rasterSize", () => {
  it("is twice the SVG size in whole pixels", () => {
    expect(rasterSize(300, 150.4)).toEqual({ width: 600, height: 301, scale: 2 });
    expect(rasterSize(1200, 630)).toEqual({ width: 2400, height: 1260, scale: 2 });
  });
  it("stays inside the largest side a canvas can be trusted with", () => {
    const s = rasterSize(3000, 1500);
    expect(s.width).toBe(4096);
    expect(s.height).toBe(2048);
    expect(s.scale).toBeCloseTo(4096 / 3000);
    expect(rasterSize(0, 0).width).toBe(1);
  });
});

describe("exportFilename and svgDataUrl", () => {
  it("makes a short, safe file name from the alt text", () => {
    expect(exportFilename("Free-body diagram of m: F_g down, F_N up.", "png")).toBe(
      "scorpio-free-body-diagram-of-m-f-g-down-f-n-up.png",
    );
    expect(exportFilename("../../etc/passwd", "svg")).toBe("scorpio-etc-passwd.svg");
    expect(exportFilename("Énergie cinétique", "png")).toBe("scorpio-energie-cinetique.png");
    expect(exportFilename("", "png")).toBe("scorpio-diagram.png");
    expect(exportFilename("x".repeat(200), "png").length).toBeLessThanOrEqual(8 + 48 + 4);
  });
  it("encodes the SVG so an <img> can load it", () => {
    const url = svgDataUrl('<svg xmlns="http://www.w3.org/2000/svg"><text>θ #1</text></svg>');
    expect(url.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    expect(url).not.toMatch(/[#<>"\s]/);
    expect(decodeURIComponent(url.split(",")[1])).toContain("θ #1");
  });
});

describe("shareCardSvg", () => {
  const input = {
    title: "Change in momentum and impulse",
    course: "AP Physics 1",
    topic: "4.2",
    picture: { diagram: PLOT },
  };

  it("is a 1200 x 630 card with the course, the title, the picture and the wordmark", () => {
    const card = shareCardSvg(input);
    expect([card.width, card.height]).toEqual([SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT]);
    expect([SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT]).toEqual([1200, 630]);
    expect(card.svg).toMatch(/^<svg [^>]*viewBox="0 0 1200 630" width="1200" height="630"/);
    expect(card.svg).toContain("4.2 · AP PHYSICS 1");
    const shown = card.svg.replace(/<[^>]+>/g, " ");
    for (const word of input.title.split(" ")) expect(shown).toContain(word);
    expect(card.svg).toContain(">scorpio</text>");
    expect(card.svg).toContain("<polyline"); // the plot's line
    expect(tags(card.svg)).not.toMatch(/currentColor|var\(/);
    expect(isSafeSvg(card.svg)).toBe(true);
  });

  it("fits the picture inside its panel without distorting it", () => {
    const card = shareCardSvg(input).svg;
    const m = card.match(/<svg x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/)!;
    const [x, y, w, h] = m.slice(1).map(Number);
    const vb = viewBoxOf(drawn(PLOT))!;
    expect(w / h).toBeCloseTo(vb[2] / vb[3], 1);
    expect(x).toBeGreaterThanOrEqual(556);
    expect(x + w).toBeLessThanOrEqual(1200 - 64);
    expect(y).toBeGreaterThanOrEqual(64);
    expect(y + h).toBeLessThanOrEqual(630 - 64);
  });

  it("follows the theme", () => {
    const card = shareCardSvg(input, DARK_THEME).svg;
    expect(card).toContain(`<rect width="1200" height="630" fill="${DARK_THEME.bg}"/>`);
    expect(card).toContain(DARK_THEME.accent);
  });

  it("still makes a card when there is no picture or it cannot be drawn", () => {
    for (const picture of [undefined, { diagram: "plot\nnonsense here" }]) {
      const card = shareCardSvg({ ...input, picture });
      expect(card.svg).not.toContain("<svg x=");
      expect(card.svg).toContain("AP PHYSICS 1");
      expect(isSafeSvg(card.svg)).toBe(true);
    }
  });

  it("escapes the title and wraps a long one", () => {
    const card = shareCardSvg({
      ...input,
      title: "Forces <b>&</b> the rotational form of Newton's second law for extended bodies",
    }).svg;
    expect(card).toContain("&lt;b&gt;&amp;&lt;/b&gt;");
    expect(isSafeSvg(card)).toBe(true);
    expect(card.match(/font-weight="700" fill=/g)!.length).toBeGreaterThan(2); // several title lines
  });

  it("wrapTitle breaks between words", () => {
    expect(wrapTitle("Change in momentum and impulse", 14)).toEqual([
      "Change in",
      "momentum and",
      "impulse",
    ]);
    expect(wrapTitle("  one  ", 3)).toEqual(["one"]);
    expect(wrapTitle("", 10)).toEqual([]);
  });
});
