// ray: geometric optics. The author gives the element, the focal length and where the object is;
// the renderer computes the image and draws the principal rays, so the image cannot be misplaced.
//
// ray lens f=10 [unit=cm] [num] [setup] ["title"]   f>0 converging, f<0 diverging (or the word)
// ray mirror f=10        f>0 concave, f<0 convex (or R=20, or the word); ray mirror plane
// obj 30 [h=4] ["candle"]                          distance in front of the element, height
//                                                   num prints the given numbers, num=all the
//                                                   image's too; setup draws no rays and no image
// ray refract n1=1 n2=1.5 in=40 [reflect] [up] [num] [m1="air" m2="glass"]
//                                                   one ray at a flat boundary; the angle is from
//                                                   the normal; `up` puts the incident medium below
//
// Thin-lens / paraxial-mirror model: 1/d_o + 1/d_i = 1/f, m = −d_i/d_o. Real images are in front
// of a mirror and behind a lens. The two axes have separate scales (a ray diagram is tall and
// short otherwise); straight rays stay straight, so the construction is still exact.

import { type DgError, type Doc } from "./parse";
import { ACCENT, arc, arcLabelPos, f1, plain, wrap, type P } from "./svg";
import {
  type Anchor,
  Canvas,
  argNum,
  chevron,
  dimMark,
  finish,
  fmt,
  kvNum,
  unknownWords,
} from "./kit";

export type RayModel =
  | {
      kind: "lens" | "mirror";
      /** Focal length; null for a plane mirror. */
      f: number | null;
      do: number;
      ho: number;
      /** Image distance: positive = real. Null when the image is at infinity. */
      di: number | null;
      hi: number | null;
      m: number | null;
      real: boolean | null;
      upright: boolean | null;
      atInfinity: boolean;
    }
  | {
      kind: "refraction";
      n1: number;
      n2: number;
      /** Degrees from the normal. */
      theta1: number;
      /** Null when the ray is totally internally reflected. */
      theta2: number | null;
      /** Critical angle in degrees, when n1 > n2. */
      critical: number | null;
      tir: boolean;
    };

type Out = { svg: string; alt: string; ray?: RayModel };

const HEAD_WORDS = [
  "lens",
  "mirror",
  "refract",
  "refraction",
  "boundary",
  "converging",
  "diverging",
  "convex",
  "concave",
  "plane",
  "num",
  "setup",
  "reflect",
  "up",
];
const RAY = ` stroke="${ACCENT}" stroke-width="1.4"`;
const deg = (r: number) => (r * 180) / Math.PI;
const rad = (d: number) => (d * Math.PI) / 180;

export function renderRay(doc: Doc, errs: DgError[], warns: DgError[] = []): Out {
  const h = doc.head;
  const has = (...w: string[]) => w.some((x) => h.args.includes(x));
  if (has("refract", "refraction", "boundary") || "n1" in h.kv || "n2" in h.kv)
    return refraction(doc, errs);
  unknownWords(
    h,
    HEAD_WORDS,
    ["f", "R", "unit", "num"],
    errs,
    "use lens or mirror, f=, and any of: unit=cm num setup",
  );
  const mirror = has("mirror") || (has("plane") && !has("lens"));
  const plane = has("plane");
  const unit = h.kv.unit ? ` ${h.kv.unit}` : "";
  const numbers = has("num") || "num" in h.kv;
  const all = h.kv.num === "all";
  const setup = has("setup");
  if (!has("lens", "mirror", "converging", "diverging", "plane"))
    errs.push({
      line: h.line,
      msg: "ray needs an element: ray lens f=10, ray mirror f=10, ray mirror plane, or ray refract n1=1 n2=1.5 in=40",
    });

  // ---- the element ----
  let f = kvNum(h, "f", errs);
  const R = kvNum(h, "R", errs);
  if (f === undefined && R !== undefined) f = R / 2;
  if (plane && !mirror)
    errs.push({ line: h.line, msg: "only a mirror can be plane: ray mirror plane" });
  if (!plane && f === undefined)
    errs.push({
      line: h.line,
      msg: `ray ${mirror ? "mirror" : "lens"} needs a focal length: f=10`,
    });
  if (!plane && f === 0) errs.push({ line: h.line, msg: "the focal length cannot be 0" });
  f = f || 1;
  // the word wins over the sign: "diverging f=10" is a diverging lens
  if (mirror ? has("convex") : has("diverging") || (has("concave") && has("lens")))
    f = -Math.abs(f);
  if (mirror ? has("concave") : has("converging") || (has("convex") && has("lens")))
    f = Math.abs(f);
  const pw = plane ? 0 : 1 / f; // 1/f
  const elementName = mirror
    ? plane
      ? "plane mirror"
      : f > 0
        ? "concave mirror"
        : "convex mirror"
    : f > 0
      ? "converging lens"
      : "diverging lens";

  // ---- the object ----
  let dO = 0,
    hO = 0,
    hGiven = false,
    name = "object";
  let seen = false;
  for (const c of doc.cmds) {
    if (!["obj", "object"].includes(c.op)) {
      errs.push({ line: c.line, msg: `ray has no "${c.op}" (use obj 30 h=4)` });
      continue;
    }
    if (seen) {
      errs.push({ line: c.line, msg: "ray draws one object; remove the extra obj line" });
      continue;
    }
    seen = true;
    unknownWords(c, [], ["d", "h"], errs, "use obj 30 h=4", 1);
    const d = argNum(c.args[0]) ?? kvNum(c, "d", errs);
    if (d === undefined)
      errs.push({ line: c.line, msg: "obj needs its distance from the element: obj 30 h=4" });
    else if (!(d > 0))
      errs.push({
        line: c.line,
        msg: `the object distance must be positive (the object stands in front of the ${mirror ? "mirror" : "lens"}), got ${d}`,
      });
    else dO = d;
    const hh = kvNum(c, "h", errs);
    if (hh !== undefined) {
      if (hh === 0) errs.push({ line: c.line, msg: "the object height cannot be 0" });
      else {
        hO = hh;
        hGiven = true;
      }
    }
    if (c.text) name = c.text;
  }
  if (!seen) errs.push({ line: h.line, msg: "ray needs an object: obj 30 h=4" });
  if (errs.length) return { svg: "", alt: "" };
  if (!hGiven) hO = 1;

  // ---- the image: 1/di = 1/f − 1/do ----
  const invDi = pw - 1 / dO;
  const atInfinity = Math.abs(invDi) < 1e-9 / dO;
  const di = atInfinity ? null : 1 / invDi;
  const m = di === null ? null : -di / dO;
  const hI = m === null ? null : m * hO;
  const model: RayModel = {
    kind: mirror ? "mirror" : "lens",
    f: plane ? null : f,
    do: dO,
    ho: hO,
    di,
    hi: hI,
    m,
    real: di === null ? null : di > 0,
    upright: m === null ? null : m > 0,
    atInfinity,
  };

  // ---- view: separate x and y scales ----
  const fold = mirror ? -1 : 1; // which way light leaves the element
  const base = Math.max(dO, plane ? 0 : 2 * Math.abs(f));
  const shown = di !== null && Math.abs(di) <= 3.2 * base;
  const drawImage = shown && !setup;
  if (di !== null && !shown && !setup)
    warns.push({
      line: h.line,
      kind: "readability",
      msg: `the image is ${fmt(Math.abs(di))}${unit} away, far off the picture, because the object is close to the focal point; move the object or accept rays that leave the frame`,
    });
  const xImg = di === null ? 0 : fold * di;
  const two = plane ? 0 : 2 * Math.abs(f);
  let xL: number, xR: number;
  if (mirror) {
    xL = -Math.max(dO, f > 0 ? two : 0, drawImage && xImg < 0 ? -xImg : 0, 0.6 * base);
    xR = Math.max(f < 0 ? two : 0, drawImage && xImg > 0 ? xImg : 0, 0.16 * -xL);
  } else {
    xL = -Math.max(dO, two, drawImage && xImg < 0 ? -xImg : 0);
    xR = Math.max(two, drawImage && xImg > 0 ? xImg : 0, 0.6 * base);
  }
  xL *= 1.1;
  xR *= 1.1;
  const sx = 470 / (xR - xL);
  const y3 = plane || Math.abs(dO - f) < 1e-9 * dO ? null : (-hO * f) / (dO - f);
  const tall = Math.max(Math.abs(hO), drawImage ? Math.abs(hI!) : 0);
  const focalRay = y3 !== null && Math.abs(y3) <= 2.4 * tall;
  // a diverging element sends the parallel ray away from the axis: leave it room
  const sy =
    74 /
    (Math.max(tall, focalRay && !setup ? Math.abs(y3!) : 0) *
      (!plane && f < 0 && !setup ? 1.35 : 1));
  const HALF = 92; // half-height of the element, px
  const S = (x: number, y: number): P => [x * sx, -y * sy];
  if (Math.abs(hO) * sy < 9)
    warns.push({
      line: h.line,
      kind: "readability",
      msg: "the image is so much larger than the object that the object is hard to see; move the object away from the focal point",
    });

  const cv = new Canvas();
  // optical axis
  cv.line(S(xL, 0), S(xR, 0), ` stroke-width="1" stroke-opacity=".55"`);
  // the element
  if (mirror) {
    const k = plane ? 0 : f > 0 ? -9 : 9;
    cv.add(
      `<path d="M${k},${-HALF} Q0,${-HALF} 0,${-HALF + 14} L0,${HALF - 14} Q0,${HALF} ${k},${HALF}" fill="none" stroke-width="2.5"/>`,
      [0, -HALF],
      [0, HALF],
    );
    for (let y = -HALF + 16; y <= HALF - 12; y += 12)
      cv.line([0, y], [7, y - 7], ` stroke-width="1" stroke-opacity=".5"`);
  } else {
    const d =
      f > 0
        ? `M0,${-HALF} Q15,0 0,${HALF} Q-15,0 0,${-HALF}Z`
        : `M-9,${-HALF} L9,${-HALF} Q1.5,0 9,${HALF} L-9,${HALF} Q-1.5,0 -9,${-HALF}Z`;
    cv.add(
      `<path d="${d}" fill="${ACCENT}" fill-opacity=".12" stroke-width="1.25"/>`,
      [-9, -HALF],
      [9, HALF],
    );
    cv.line([0, -HALF], [0, HALF], ` stroke-width="1" stroke-opacity=".35" stroke-dasharray="2 4"`);
  }

  // ---- rays ----
  const tip = S(-dO, hO);
  const rays: string[] = [];
  if (!setup) {
    const tx = fold > 0 ? xR : -xL; // travel to the edge of the view
    const dash = (a: P, b: P) => {
      cv.dashed(a, b, RAY);
      cv.reserveLine(a, b);
    };
    const out = (y0: number, slope: number, back: number | null) => {
      // solid outgoing part, clipped to the view
      let t = tx;
      if (slope !== 0) {
        const tY = ((slope > 0 ? HALF + 4 : -HALF - 4) / sy - y0) / slope;
        if (tY > 0) t = Math.min(t, tY);
      }
      if (drawImage && di! > 0) t = Math.min(t, di! + 0.3 * base);
      const a = S(0, y0),
        b = S(fold * t, y0 + slope * t);
      cv.line(a, b, RAY);
      cv.reserveLine(a, b);
      const at = drawImage && di! > 0 ? 0.5 * di! : 0.5 * t;
      cv.add(chevron(S(fold * at, y0 + slope * at), b[0] - a[0], b[1] - a[1], ACCENT));
      if (back !== null) dash(a, S(fold * back, y0 + slope * back));
    };
    const incident = (y0: number) => {
      const b = S(0, y0);
      cv.line(tip, b, RAY);
      cv.reserveLine(tip, b);
      cv.add(
        chevron([(tip[0] + b[0]) / 2, (tip[1] + b[1]) / 2], b[0] - tip[0], b[1] - tip[1], ACCENT),
      );
    };
    const virtual = drawImage && di! < 0 ? di! : null;
    // 1. parallel to the axis, then through (or away from) the focal point. Off a plane mirror
    // that ray would come straight back on itself, so a second slanted ray is drawn instead.
    if (plane) {
      incident(hO * 0.5);
      out(hO * 0.5, (-0.5 * hO) / dO, virtual);
      rays.push("one reflecting half-way up the mirror");
    } else {
      incident(hO);
      out(hO, -hO * pw, f < 0 ? Math.min(f, virtual ?? 0) : virtual);
      rays.push("one parallel to the axis");
    }
    // 2. through the centre of a lens undeviated; off the vertex of a mirror at an equal angle
    incident(0);
    out(0, -hO / dO, virtual);
    rays.push(mirror ? "one reflecting at the centre of the mirror" : "one through the centre");
    // 3. through (or towards) the focal point, leaving parallel to the axis
    if (focalRay) {
      incident(y3!);
      out(y3!, 0, virtual);
      if (f > 0 && dO < f) dash(S(-f, 0), tip);
      if (f < 0) dash(S(0, y3!), S(-f, 0));
      rays.push(f < 0 ? "one aimed at the far focal point" : "one through the near focal point");
    }
  }

  // ---- object and image arrows ----
  const headFor = (p: P) => Math.max(5, Math.min(9, Math.abs(p[1]) * 0.45));
  cv.arrow(S(-dO, 0), tip, "currentColor", 2.5, headFor(tip));
  cv.reserve(tip[0] - 5, 0, tip[0] + 5, tip[1]);
  let imgTip: P | undefined;
  if (drawImage) {
    imgTip = S(xImg, hI!);
    const svg = new Canvas();
    svg.arrow(S(xImg, 0), imgTip, "currentColor", 2.5, headFor(imgTip));
    cv.add(
      di! < 0
        ? svg.body
            .replace(/<line /, '<line stroke-dasharray="5 4" ')
            .replace(/fill="/, 'fill-opacity=".55" fill="')
        : svg.body,
      S(xImg, 0),
      imgTip,
    );
    cv.reserve(imgTip[0] - 5, 0, imgTip[0] + 5, imgTip[1]);
  }

  // ---- focal marks ----
  const marks: [number, string][] = plane
    ? []
    : mirror
      ? [
          [-f, "F"],
          [-2 * f, "C"],
        ]
      : [
          [-f, "F"],
          [f, "F"],
          [-2 * f, "2F"],
          [2 * f, "2F"],
        ];
  for (const [x, s] of marks) {
    const p = S(x, 0);
    cv.add(`<circle cx="${f1(p[0])}" cy="0" r="2.6" stroke="none"/>`);
    cv.place(
      [
        [[p[0], 14], "middle"],
        [[p[0], -13], "middle"],
        [[p[0] - 7, 14], "end"],
        [[p[0] + 7, 14], "start"],
      ],
      s,
      "",
      12,
    );
  }

  // ---- labels ----
  // beyond the tip if nothing is there, else beside the arrow or under its foot
  const spots = (p: P, up: boolean): [P, Anchor][] => {
    const v = up ? -1 : 1;
    return [
      [[p[0], p[1] + v * 13], "middle"],
      [[p[0] - 8, p[1] / 2], "end"],
      [[p[0] + 8, p[1] / 2], "start"],
      [[p[0], -v * 14], "middle"],
      [[p[0], -v * 29], "middle"],
      [[p[0] - 8, p[1] + v * 4], "end"],
      [[p[0] + 8, p[1] + v * 4], "start"],
      [[p[0], p[1] + v * 27], "middle"],
    ];
  };
  cv.place(spots(tip, hO > 0), name);
  if (imgTip) cv.place(spots(imgTip, hI! > 0), "image");
  if (numbers) {
    let row = HALF + 14;
    dimMark(cv, [S(-dO, 0)[0], row], [0, row], `d_o = ${fmt(dO)}${unit}`);
    if (!plane) {
      row += 30;
      dimMark(cv, [0, row], [S(mirror ? -f : f, 0)[0], row], `f = ${fmt(f)}${unit}`);
    }
    if (all && drawImage) {
      row += 30;
      dimMark(cv, [0, row], [S(xImg, 0)[0], row], `d_i = ${fmt(di!)}${unit}`);
    }
    if (hGiven) {
      const heights = [`h_o = ${fmt(hO)}${unit}`];
      if (all && drawImage) heights.push(`h_i = ${fmt(hI!)}${unit}`);
      cv.text([S((xL + xR) / 2, 0)[0], row + 34], heights.join(",   "), "middle", "", 11);
    }
  }

  // ---- alt text ----
  const side = (real: boolean) =>
    mirror
      ? real
        ? "in front of the mirror"
        : "behind the mirror"
      : real
        ? "on the far side of the lens"
        : "on the same side as the object";
  let alt =
    `Ray diagram${h.text ? ` (${plain(h.text)})` : ""}: ${elementName}${plane ? "" : `, focal length ${fmt(f)}${unit}`}. ` +
    `${plain(name)[0].toUpperCase() + plain(name).slice(1)} ${fmt(dO)}${unit} in front${hGiven ? `, height ${fmt(hO)}${unit}` : ""}.`;
  if (!setup) {
    alt += ` Rays from its top: ${rays.join(", ")}.`;
    if (di === null)
      alt += ` The object is at the focal point, so the rays leave parallel and no image forms (the image is at infinity).`;
    else
      alt +=
        ` Image: ${di > 0 ? "real" : "virtual"}, ${m! > 0 ? "upright" : "inverted"}, ` +
        `${Math.abs(m!) > 1 + 1e-9 ? "enlarged" : Math.abs(m!) < 1 - 1e-9 ? "reduced" : "the same size"}, ` +
        `${fmt(Math.abs(di))}${unit} from the ${mirror ? "mirror" : "lens"} ${side(di > 0)}` +
        `${hGiven ? `, height ${fmt(Math.abs(hI!))}${unit}` : ""} (magnification ${fmt(m!)})` +
        `${shown ? "" : "; it is off the picture"}.`;
  }

  const b = finish(cv, h.text);
  return { svg: wrap(b.w, b.h, cv.body, alt, b.x0, b.y0), alt, ray: model };
}

// ---------------------------------------------------------------------------------------------

function refraction(doc: Doc, errs: DgError[]): Out {
  const h = doc.head;
  unknownWords(
    h,
    HEAD_WORDS,
    ["n1", "n2", "in", "angle", "theta", "num", "m1", "m2"],
    errs,
    "use n1= n2= in= and any of: reflect up num m1= m2=",
  );
  for (const c of doc.cmds)
    errs.push({
      line: c.line,
      msg: `ray refract takes everything on its first line (n1= n2= in=); it has no "${c.op}"`,
    });
  const n1 = kvNum(h, "n1", errs),
    n2 = kvNum(h, "n2", errs);
  const th = kvNum(h, "in", errs) ?? kvNum(h, "angle", errs) ?? kvNum(h, "theta", errs);
  if (n1 === undefined || n2 === undefined)
    errs.push({ line: h.line, msg: "ray refract needs both indices: n1=1 n2=1.5" });
  else if (n1 < 1 || n2 < 1)
    errs.push({ line: h.line, msg: "an index of refraction cannot be less than 1" });
  if (th === undefined)
    errs.push({
      line: h.line,
      msg: "ray refract needs the angle of incidence from the normal: in=40",
    });
  else if (th < 0 || th >= 90)
    errs.push({
      line: h.line,
      msg: `the angle of incidence is measured from the normal and must be from 0 to below 90, got ${th}`,
    });
  if (errs.length || n1 === undefined || n2 === undefined || th === undefined)
    return { svg: "", alt: "" };

  const s2 = (n1 * Math.sin(rad(th))) / n2;
  const tir = s2 > 1 + 1e-12;
  const th2 = tir ? null : deg(Math.asin(Math.min(1, s2)));
  const critical = n1 > n2 ? deg(Math.asin(n2 / n1)) : null;
  const model: RayModel = { kind: "refraction", n1, n2, theta1: th, theta2: th2, critical, tir };

  const up = h.args.includes("up");
  const reflect = h.args.includes("reflect") || tir;
  const numbers = h.args.includes("num") || "num" in h.kv;
  const all = h.kv.num === "all";
  const v = up ? -1 : 1; // +1: incident medium on top
  const cv = new Canvas();
  const HW = 150,
    HH = 112,
    LEN = 108;
  // the optically denser medium, shaded
  cv.add(
    `<rect x="${-HW}" y="${(n2 >= n1 ? v : -v) > 0 ? 0 : -HH}" width="${2 * HW}" height="${HH}" fill="${ACCENT}" fill-opacity=".1" stroke="none"/>`,
    [-HW, -HH],
    [HW, HH],
  );
  cv.line([-HW, 0], [HW, 0], ` stroke-width="2"`);
  cv.dashed([0, -HH + 8], [0, HH - 8], ` stroke-width="1" stroke-opacity=".6"`);
  // a ray at angle a (degrees from the normal) in the incident (side=1) or the second medium
  const end = (a: number, side: 1 | -1, right: boolean): P => [
    (right ? 1 : -1) * LEN * Math.sin(rad(a)),
    -v * side * LEN * Math.cos(rad(a)),
  ];
  const ray = (from: P, to: P, extra = "") => {
    // a width in `extra` replaces RAY's own: a repeated attribute is invalid XML
    cv.line(
      from,
      to,
      (/stroke-width=/.test(extra) ? RAY.replace(/ stroke-width="[^"]*"/, "") : RAY) + extra,
    );
    cv.reserveLine(from, to, 5);
    cv.add(
      chevron(
        [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2],
        to[0] - from[0],
        to[1] - from[1],
        ACCENT,
        8,
      ),
    );
  };
  ray(end(th, 1, false), [0, 0], ` stroke-width="2"`);
  if (reflect) ray([0, 0], end(th, 1, true), tir ? ` stroke-width="2"` : ` stroke-opacity=".5"`);
  if (th2 !== null) ray([0, 0], end(th2, -1, true), ` stroke-width="2"`);

  // angle arcs, measured from the normal. Maths angles: the incident medium's normal is at 90·v.
  const mark = (a: number, side: 1 | -1, right: boolean, s: string, r: number) => {
    if (a < 0.5) return;
    const n = 90 * v * side;
    const to = n + (right ? -1 : 1) * a * v * side;
    cv.add(arc([0, 0], r, n, to).replace("/>", ` stroke-width="1"/>`));
    const p = arcLabelPos([0, 0], r, Math.min(n, to), Math.max(n, to), s);
    cv.text(p, s, "middle", "", 12);
  };
  const t1 = numbers ? `${fmt(th)}°` : "θ_1";
  mark(th, 1, false, t1, 30);
  if (tir) mark(th, 1, true, t1, 46);
  else if (reflect) mark(th, 1, true, numbers ? `${fmt(th)}°` : "θ_r", 46);
  if (th2 !== null) mark(th2, -1, true, all ? `${fmt(th2)}°` : "θ_2", 36);

  const medium = (i: 1 | 2, n: number, s: string | undefined) => {
    const y = (i === 1 ? -1 : 1) * v * (HH - 16);
    const sym = `n_${i}${numbers ? ` = ${fmt(n)}` : ""}`;
    const t = s ? `${s} (${sym})` : sym;
    cv.place(
      [
        [[-HW + 10, y], "start"],
        [[HW - 10, y], "end"],
        [[-HW + 10, y / 3], "start"],
      ],
      t,
    );
  };
  medium(1, n1, h.kv.m1);
  medium(2, n2, h.kv.m2);
  cv.text([6, -v * (HH - 14)], "normal", "start", ` fill-opacity=".65"`, 11);

  let alt =
    `Ray at a flat boundary${h.text ? ` (${plain(h.text)})` : ""}: light in ${h.kv.m1 ? `${plain(h.kv.m1)} (n = ${fmt(n1)})` : `a medium of index ${fmt(n1)}`} ` +
    `meets ${h.kv.m2 ? `${plain(h.kv.m2)} (n = ${fmt(n2)})` : `a medium of index ${fmt(n2)}`} at ${fmt(th)}° from the normal. `;
  if (tir)
    alt += `This is beyond the critical angle of ${fmt(critical!)}°, so the ray is totally internally reflected at ${fmt(th)}° and no light is refracted.`;
  else
    alt +=
      `It refracts at ${fmt(th2!)}° from the normal, bending ${th2! < th ? "towards" : th2! > th ? "away from" : "neither towards nor away from"} the normal` +
      `${reflect ? `; the reflected ray leaves at ${fmt(th)}°` : ""}.` +
      `${critical !== null ? ` The critical angle is ${fmt(critical)}°.` : ""}`;
  const b = finish(cv, h.text);
  return { svg: wrap(b.w, b.h, cv.body, alt, b.x0, b.y0), alt, ray: model };
}
