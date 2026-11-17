// Numeric answers with units. Shared by the Next.js grade route and the Cloud Function (through
// grading-core.ts), so it stays dependency-free. Everything here is deterministic: no AI.

/** Exponents of the SI base dimensions, in this order: m, kg, s, A, K, mol, cd. */
export type Dims = [number, number, number, number, number, number, number];

export interface Unit {
  /** Multiply a value in this unit by `factor` to get SI. */
  factor: number;
  dims: Dims;
}

const D = (m = 0, kg = 0, s = 0, A = 0, K = 0, mol = 0, cd = 0): Dims => [m, kg, s, A, K, mol, cd];
const NONE = D();

const u = (factor: number, dims: Dims): Unit => ({ factor, dims });

// Derived SI units, written out so the table reads like a textbook.
const NEWTON = D(1, 1, -2);
const JOULE = D(2, 1, -2);
const WATT = D(2, 1, -3);
const PASCAL = D(-1, 1, -2);
const COULOMB = D(0, 0, 1, 1);
const VOLT = D(2, 1, -3, -1);
const OHM = D(2, 1, -3, -2);

/** Symbols that may take an SI prefix (case-sensitive). */
const PREFIXABLE: Record<string, Unit> = {
  m: u(1, D(1)),
  g: u(1e-3, D(0, 1)),
  s: u(1, D(0, 0, 1)),
  A: u(1, D(0, 0, 0, 1)),
  K: u(1, D(0, 0, 0, 0, 1)),
  mol: u(1, D(0, 0, 0, 0, 0, 1)),
  cd: u(1, D(0, 0, 0, 0, 0, 0, 1)),
  N: u(1, NEWTON),
  J: u(1, JOULE),
  W: u(1, WATT),
  Pa: u(1, PASCAL),
  Hz: u(1, D(0, 0, -1)),
  Bq: u(1, D(0, 0, -1)),
  C: u(1, COULOMB),
  V: u(1, VOLT),
  Ω: u(1, OHM),
  F: u(1, D(-2, -1, 4, 2)),
  T: u(1, D(0, 1, -2, -1)),
  Wb: u(1, D(2, 1, -2, -1)),
  H: u(1, D(2, 1, -2, -2)),
  eV: u(1.602176634e-19, JOULE),
  L: u(1e-3, D(3)),
  Wh: u(3600, JOULE),
  rad: u(1, NONE),
};

/** Symbols that never take a prefix (checked before prefix splitting, so "min" is minutes, not milli-inch). */
const PLAIN: Record<string, Unit> = {
  min: u(60, D(0, 0, 1)),
  h: u(3600, D(0, 0, 1)),
  hr: u(3600, D(0, 0, 1)),
  hrs: u(3600, D(0, 0, 1)),
  day: u(86400, D(0, 0, 1)),
  days: u(86400, D(0, 0, 1)),
  yr: u(3.15576e7, D(0, 0, 1)),
  sec: u(1, D(0, 0, 1)),
  ft: u(0.3048, D(1)),
  mi: u(1609.344, D(1)),
  mph: u(0.44704, D(1, 0, -1)),
  kph: u(1 / 3.6, D(1, 0, -1)),
  kmh: u(1 / 3.6, D(1, 0, -1)),
  lb: u(0.45359237, D(0, 1)),
  lbs: u(0.45359237, D(0, 1)),
  atm: u(101325, PASCAL),
  bar: u(1e5, PASCAL),
  cal: u(4.184, JOULE),
  kcal: u(4184, JOULE),
  Cal: u(4184, JOULE),
  "°": u(Math.PI / 180, NONE),
  "%": u(0.01, NONE),
  deg: u(Math.PI / 180, NONE),
  rev: u(2 * Math.PI, NONE),
  rpm: u((2 * Math.PI) / 60, D(0, 0, -1)),
  cc: u(1e-6, D(3)),
  ml: u(1e-6, D(3)),
};

/** Spelled-out names, matched case-insensitively. */
const NAMES: Record<string, string> = {
  meter: "m",
  meters: "m",
  metre: "m",
  metres: "m",
  kilometer: "km",
  kilometers: "km",
  kilometre: "km",
  kilometres: "km",
  centimeter: "cm",
  centimeters: "cm",
  centimetre: "cm",
  centimetres: "cm",
  millimeter: "mm",
  millimeters: "mm",
  second: "s",
  seconds: "s",
  secs: "s",
  millisecond: "ms",
  milliseconds: "ms",
  minute: "min",
  minutes: "min",
  mins: "min",
  hour: "h",
  hours: "h",
  gram: "g",
  grams: "g",
  kilogram: "kg",
  kilograms: "kg",
  kilo: "kg",
  kilos: "kg",
  newton: "N",
  newtons: "N",
  joule: "J",
  joules: "J",
  kilojoule: "kJ",
  kilojoules: "kJ",
  watt: "W",
  watts: "W",
  kilowatt: "kW",
  kilowatts: "kW",
  pascal: "Pa",
  pascals: "Pa",
  hertz: "Hz",
  coulomb: "C",
  coulombs: "C",
  volt: "V",
  volts: "V",
  ohm: "Ω",
  ohms: "Ω",
  amp: "A",
  amps: "A",
  ampere: "A",
  amperes: "A",
  kelvin: "K",
  tesla: "T",
  farad: "F",
  farads: "F",
  radian: "rad",
  radians: "rad",
  degree: "°",
  degrees: "°",
  revolution: "rev",
  revolutions: "rev",
  foot: "ft",
  feet: "ft",
  mile: "mi",
  miles: "mi",
  liter: "L",
  liters: "L",
  litre: "L",
  litres: "L",
  calorie: "cal",
  calories: "cal",
};

const PREFIXES: Record<string, number> = {
  Y: 1e24,
  Z: 1e21,
  E: 1e18,
  P: 1e15,
  T: 1e12,
  G: 1e9,
  M: 1e6,
  k: 1e3,
  h: 1e2,
  da: 1e1,
  d: 1e-1,
  c: 1e-2,
  m: 1e-3,
  u: 1e-6,
  n: 1e-9,
  p: 1e-12,
  f: 1e-15,
  a: 1e-18,
};

/** Common miscapitalisations that are not ambiguous ("KG" can only mean kilograms; "MS" is left alone). */
const CASE_ALIASES: Record<string, string> = {
  Kg: "kg",
  KG: "kg",
  Km: "km",
  KM: "km",
  KJ: "kJ",
  Kj: "kJ",
  KN: "kN",
  Kn: "kN",
  KW: "kW",
  Kw: "kW",
  j: "J",
  n: "N",
  w: "W",
  hz: "Hz",
  HZ: "Hz",
  pa: "Pa",
  PA: "Pa",
  kpa: "kPa",
  KPa: "kPa",
  ev: "eV",
  EV: "eV",
  v: "V",
  S: "s",
  Sec: "s",
  KMH: "kmh",
  MPH: "mph",
};

function lookupSymbol(raw: string): Unit | undefined {
  const cleaned = raw.replace(/[µμ]/g, "u").replace(/^ohms?$/i, "Ω");
  const symbol = CASE_ALIASES[cleaned] ?? cleaned;
  if (PLAIN[symbol]) return PLAIN[symbol];
  if (PREFIXABLE[symbol]) return PREFIXABLE[symbol];
  const named = NAMES[symbol.toLowerCase()];
  if (named) return lookupSymbol(named);
  // Longest prefix first so "da" wins over "d".
  for (const prefix of Object.keys(PREFIXES).sort((a, b) => b.length - a.length)) {
    if (symbol.startsWith(prefix)) {
      const base = PREFIXABLE[symbol.slice(prefix.length)];
      if (base) return u(base.factor * PREFIXES[prefix], base.dims);
    }
  }
  return undefined;
}

const SUPERSCRIPTS: Record<string, string> = {
  "⁰": "0",
  "¹": "1",
  "²": "2",
  "³": "3",
  "⁴": "4",
  "⁵": "5",
  "⁶": "6",
  "⁷": "7",
  "⁸": "8",
  "⁹": "9",
  "⁻": "-",
};

/** Turns the LaTeX and Unicode students type (through the math chips) into plain text. */
export function normaliseMathText(input: string): string {
  let s = input;
  s = s.replace(/\$/g, " ");
  s = s.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "($1)/($2)");
  s = s.replace(/\\(?:text|mathrm|mathit|operatorname|mbox)\s*\{([^{}]*)\}/g, " $1 ");
  s = s.replace(/\^\s*\{([^{}]*)\}/g, "^$1");
  s = s.replace(/\\(?:times|cdot)/g, "×");
  s = s
    .replace(/\\(?:Omega)/g, "Ω")
    .replace(/\\(?:mu)/g, "µ")
    .replace(/\^\s*\\circ|\\circ|\\degree/g, "°");
  s = s
    .replace(/\\approx/g, "≈")
    .replace(/\\(?:,|;|:|!|quad|qquad)|~/g, " ")
    .replace(/\\left|\\right/g, "");
  s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, (m) => "^" + [...m].map((c) => SUPERSCRIPTS[c]).join(""));
  s = s.replace(/[−–—]/g, "-");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

const IDENTITY: Unit = u(1, NONE);

function multiply(a: Unit, b: Unit, power: number): Unit {
  return u(
    a.factor * Math.pow(b.factor, power),
    a.dims.map((d, i) => d + b.dims[i] * power) as Dims,
  );
}

/**
 * Parses a unit expression such as "m/s^2", "kg·m/s²", "km/h", "J/(kg K)", "N m", "m s^-1",
 * "meters per second". "/" applies to the next factor or parenthesised group only.
 * Returns undefined when any part is not a known unit.
 */
export function parseUnit(input: string): Unit | undefined {
  const text = normaliseMathText(input)
    .replace(/\bper\b/gi, "/")
    .replace(/\bsquared\b/gi, "^2")
    .replace(/\bcubed\b/gi, "^3")
    .replace(/\*\*/g, "^");
  if (!text) return undefined;
  const tokens = text.match(/[A-Za-zΩµμ°%]+|\^\s*-?\d+|-?\d+|[/()·×*.]/g);
  if (!tokens || tokens.join("").replace(/\s+/g, "") !== text.replace(/\s+/g, "")) return undefined;
  let pos = 0;

  // group := factor ( [*·× .] factor | "/" factor )*
  const parseGroup = (): Unit | undefined => {
    let acc = IDENTITY;
    let expectFactor = true;
    while (pos < tokens.length && tokens[pos] !== ")") {
      let power = 1;
      const tok = tokens[pos];
      if (tok === "/") {
        power = -1;
        pos++;
      } else if (["·", "×", "*", "."].includes(tok)) {
        pos++;
        continue;
      } else if (!expectFactor && !/^[A-Za-zΩµμ°%(]/.test(tok)) return undefined;
      const factor = parseFactor();
      if (!factor) return undefined;
      acc = multiply(acc, factor, power);
      expectFactor = false;
    }
    return acc;
  };

  // factor := (symbol | "(" group ")") exponent?
  const parseFactor = (): Unit | undefined => {
    const tok = tokens[pos];
    let base: Unit | undefined;
    if (tok === "(") {
      pos++;
      base = parseGroup();
      if (!base || tokens[pos] !== ")") return undefined;
      pos++;
    } else if (tok && /^[A-Za-zΩµμ°%]+$/.test(tok)) {
      base = lookupSymbol(tok);
      if (!base) return undefined;
      pos++;
    } else {
      return undefined;
    }
    const next = tokens[pos];
    if (next && /^\^?\s*-?\d+$/.test(next)) {
      pos++;
      return multiply(IDENTITY, base, Number(next.replace(/[\^\s]/g, "")));
    }
    return base;
  };

  const result = parseGroup();
  if (!result || pos !== tokens.length) return undefined;
  return result;
}

export const sameDims = (a: Dims, b: Dims) => a.every((d, i) => Math.abs(d - b[i]) < 1e-9);
export const isDimensionless = (unit: Unit) => sameDims(unit.dims, NONE);

export interface ParsedQuantity {
  value: number;
  /** Undefined when the answer has no unit. */
  unit?: Unit;
  unitText: string;
  /** Significant figures as written. For "1200" (ambiguous trailing zeros) only the certain digits count. */
  sigFigs?: number;
  /** Half of one unit in the last written digit, in the answer's own unit: the rounding the student implied. */
  halfLastPlace: number;
  /** Words after the quantity that are not part of the unit ("to the left"). */
  trailingText: string;
}

const NUMBER = String.raw`[+-]?(?:\d{1,3}(?:,\d{3})+(?!\d)|\d+)?(?:\.\d*)?`;

function countSigFigs(mantissa: string): { sigFigs?: number; decimals: number } {
  const digits = mantissa.replace(/^[+-]/, "").replace(/,/g, "");
  const [intPart, fracPart = ""] = digits.split(".");
  const decimals = digits.includes(".") ? fracPart.length : 0;
  const all = (intPart + fracPart).replace(/^0+/, "");
  if (!all) return { sigFigs: 1, decimals }; // "0" or "0.0"
  if (!digits.includes(".") && /0$/.test(intPart)) {
    // "1200": trailing zeros are ambiguous. Count the certain digits only.
    return { sigFigs: intPart.replace(/^0+/, "").replace(/0+$/, "").length, decimals };
  }
  return { sigFigs: all.length, decimals };
}

/** Reads "a/b" where a and b are plain numbers (what \frac becomes). */
function readFraction(text: string): { value: number; rest: string } | undefined {
  const m = text.match(
    /^\(?\s*([+-]?\d+(?:\.\d+)?)\s*\)?\s*\/\s*\(?\s*(\d+(?:\.\d+)?)\s*\)?(?=\s|$|[A-Za-zΩµ°])/,
  );
  if (!m || Number(m[2]) === 0) return undefined;
  return { value: Number(m[1]) / Number(m[2]), rest: text.slice(m[0].length) };
}

/**
 * Parses a single number with an optional unit: "12.5 m/s", "-3.0 m/s^2", "1.2e3 J", "1.2 × 10^3 J",
 * "4.5x10^-3 kg", "1,200 N", "v = 12.5 m/s", "≈ 3.1 s", "$1.2 \times 10^{3}$ J".
 * Only the final "=" segment is read, so shown work ("v = d/t = 100/8 = 12.5 m/s") still parses.
 * Returns undefined when no number can be read.
 */
export function parseQuantity(input: string): ParsedQuantity | undefined {
  let text = normaliseMathText(input);
  if (text.includes("=")) text = text.slice(text.lastIndexOf("=") + 1);
  text = text.replace(/^\s*(?:≈|~|about|approximately|approx\.?|roughly|around)\s*/i, "").trim();
  if (!text) return undefined;

  let value: number;
  let sigFigs: number | undefined;
  let halfLastPlace: number;
  let rest: string;

  const fraction = readFraction(text);
  const sci = text.match(
    new RegExp(
      String.raw`^(${NUMBER})\s*(?:[eE]\s*([+-]?\d+)|(?:×|x|X|\*|·)\s*10\s*(?:\^|\*\*)\s*\(?\s*([+-]?\d+)\s*\)?)`,
    ),
  );
  const plain = text.match(new RegExp(String.raw`^(${NUMBER})`));
  if (fraction) {
    value = fraction.value;
    halfLastPlace = 0;
    rest = fraction.rest;
  } else if (sci && /\d/.test(sci[1])) {
    const exponent = Number(sci[2] ?? sci[3]);
    const { sigFigs: sf, decimals } = countSigFigs(sci[1]);
    value = Number(sci[1].replace(/,/g, "")) * Math.pow(10, exponent);
    sigFigs = sf;
    halfLastPlace = 0.5 * Math.pow(10, exponent - decimals);
    rest = text.slice(sci[0].length);
  } else if (plain && /\d/.test(plain[1])) {
    const { sigFigs: sf, decimals } = countSigFigs(plain[1]);
    value = Number(plain[1].replace(/,/g, ""));
    sigFigs = sf;
    halfLastPlace = 0.5 * Math.pow(10, -decimals);
    rest = text.slice(plain[0].length);
  } else {
    return undefined;
  }
  if (!Number.isFinite(value)) return undefined;

  // The unit is the longest run of leading words that parses as a unit; anything after is trailing text.
  const words = rest.trim().split(/\s+/).filter(Boolean);
  let unit: Unit | undefined;
  let unitText = "";
  let used = 0;
  for (let n = words.length; n > 0; n--) {
    const candidate = words
      .slice(0, n)
      .join(" ")
      .replace(/[.,;]$/, "");
    const parsed = parseUnit(candidate);
    if (parsed) {
      unit = parsed;
      unitText = candidate;
      used = n;
      break;
    }
  }
  const trailingText = words.slice(used).join(" ");
  return { value, unit, unitText, sigFigs, halfLastPlace, trailingText };
}

/** Converts `value` in unit `from` to unit `to`. Only valid when the dimensions match. */
export function convert(value: number, from: Unit, to: Unit): number {
  return (value * from.factor) / to.factor;
}
