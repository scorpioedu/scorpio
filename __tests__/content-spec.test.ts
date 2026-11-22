// src/lib/content/spec.ts: the expression evaluator behind the answer-key verifier.
import {
  SPEC_CONSTANTS,
  evaluateSpec,
  evaluateSpecExpr,
  formatDims,
  parseSpecUnit,
  specLiterals,
  specShape,
  specShapeErrors,
  type ProblemSpec,
} from "../src/lib/content/spec";
import { parseUnit } from "../functions/src/units";

const spec = (expr: string, unit = "", givens: ProblemSpec["givens"] = {}): ProblemSpec => ({
  givens,
  expr,
  unit,
});
const value = (expr: string, unit = "", givens: ProblemSpec["givens"] = {}) => {
  const r = evaluateSpec(spec(expr, unit, givens));
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const error = (expr: string, unit = "", givens: ProblemSpec["givens"] = {}) => {
  const r = evaluateSpec(spec(expr, unit, givens));
  return r.ok ? `no error (${r.value})` : r.error;
};

describe("arithmetic", () => {
  test("precedence, parentheses and unary minus", () => {
    expect(value("1 + 2 * 3")).toBe(7);
    expect(value("(1 + 2) * 3")).toBe(9);
    expect(value("10 - 4 - 3")).toBe(3);
    expect(value("24 / 4 / 2")).toBe(3);
    expect(value("-3 + 5")).toBe(2);
    expect(value("2 * -3")).toBe(-6);
    expect(value("+4 - -1")).toBe(5);
    expect(value("  7  ")).toBe(7);
  });

  test("^ binds tightest and to the right; exponents may be signed or fractional", () => {
    expect(value("-2^2")).toBe(-4);
    expect(value("(-2)^2")).toBe(4);
    expect(value("2^3^2")).toBe(512);
    expect(value("2 * 3^2")).toBe(18);
    expect(value("10^-3")).toBeCloseTo(0.001, 15);
    expect(value("16^(1/4)")).toBeCloseTo(2, 12);
  });

  test("numbers: decimals and scientific notation", () => {
    expect(value(".5 + 1.")).toBe(1.5);
    expect(value("3e8")).toBe(3e8);
    expect(value("1.6E-19 * 2")).toBeCloseTo(3.2e-19, 30);
    expect(value("2.5e+3")).toBe(2500);
  });

  test("functions", () => {
    expect(value("sqrt(16)")).toBe(4);
    expect(value("abs(-3.5)")).toBe(3.5);
    expect(value("exp(0) + ln(exp(2)) + log(1000)")).toBeCloseTo(6, 12);
    expect(value("min(3, 1, 2)")).toBe(1);
    expect(value("max(3, 1, 2)")).toBe(3);
    expect(value("round(4.4)")).toBe(4);
    expect(value("round(4.5)")).toBe(5);
    expect(value("atan2(1, 1)")).toBeCloseTo(Math.PI / 4, 12);
    expect(value("tan(atan(0.5))")).toBeCloseTo(0.5, 12);
    expect(value("cos(acos(0.25)) + sin(asin(0.25))")).toBeCloseTo(0.5, 12);
  });

  test("syntax errors are reported, never thrown", () => {
    expect(error("")).toMatch(/empty/);
    expect(error("2 +")).toMatch(/ends too soon/);
    expect(error("(2 + 3")).toMatch(/Expected "\)"/);
    expect(error("2 3")).toMatch(/Unexpected "3"/);
    expect(error("2 $ 3")).toMatch(/Unexpected "\$"/);
    expect(error("2R", "", { R: { value: 1, unit: "" } })).toMatch(/Unexpected "R"/);
    expect(error("foo(2)")).toMatch(/Unknown function foo/);
    expect(error("x + 1")).toMatch(/Unknown name "x"/);
    expect(error("sqrt(1, 2)")).toMatch(/wrong number of arguments/);
    expect(error("min(1)")).toMatch(/wrong number of arguments/);
    expect(error("atan2(1)")).toMatch(/wrong number of arguments/);
    expect(error(")")).toMatch(/Unexpected "\)"/);
  });

  test("no finite value is an error: division by zero, sqrt of a negative, asin out of range", () => {
    expect(error("1/0")).toMatch(/no finite value/);
    expect(error("sqrt(-4)")).toMatch(/no finite value/);
    expect(error("asin(1.02)")).toMatch(/no finite value/);
    expect(error("(-8)^(1/3)")).toMatch(/no finite value/);
  });

  test("it is not eval", () => {
    expect(error("process.exit(1)")).toMatch(/Unexpected/);
    expect(error("constructor")).toMatch(/Unknown name/);
    expect(error("toString()")).toMatch(/Unknown function/);
    expect(error("__proto__")).toMatch(/Unknown name/);
  });
});

describe("givens and units", () => {
  const cart = {
    m: { value: 500, unit: "g" },
    vf: { value: 36, unit: "km/h" },
    vi: { value: 4, unit: "m/s" },
  };

  test("givens are converted to SI and the result to the stated unit", () => {
    expect(value("m * (vf - vi)", "kg*m/s", cart)).toBeCloseTo(3, 12);
    expect(value("m * (vf - vi)", "N*s", cart)).toBeCloseTo(3, 12);
    expect(value("m * (vf - vi)", "g*cm/s", cart)).toBeCloseTo(3e5, 6);
    expect(evaluateSpec(spec("m", "kg", cart))).toEqual({ ok: true, value: 0.5, unit: "kg" });
  });

  test("a result of the wrong dimensions is an error that names both", () => {
    expect(error("m * vf", "J", cart)).toMatch(/gives m·kg\/s, but the unit "J" is m\^2·kg\/s\^2/);
    expect(error("m * vf", "", cart)).toMatch(/but the unit "" is a pure number/);
    expect(error("vf / vi", "m", cart)).toMatch(/gives a pure number/);
  });

  test("unlike quantities cannot be added, compared or put in a function", () => {
    expect(error("m + vf", "kg", cart)).toMatch(/A sum mixes kg and m\/s/);
    expect(error("vf - m", "kg", cart)).toMatch(/A difference mixes m\/s and kg/);
    expect(error("min(m, vf)", "kg", cart)).toMatch(/min\(\) mixes/);
    expect(error("atan2(m, vf)", "", cart)).toMatch(/atan2\(\) mixes/);
    expect(error("sin(vf)", "", cart)).toMatch(/sin\(\) needs a pure number, not m\/s/);
    expect(error("exp(m)", "", cart)).toMatch(/exp\(\) needs a pure number/);
    expect(error("ln(m)", "", cart)).toMatch(/ln\(\)/);
    expect(error("log(m)", "", cart)).toMatch(/log\(\)/);
    expect(error("round(m)", "", cart)).toMatch(/round\(\)/);
    expect(error("2^m", "", cart)).toMatch(/An exponent needs a pure number/);
    for (const f of ["cos", "tan", "asin", "acos", "atan"])
      expect(error(`${f}(m)`, "", cart)).toMatch(new RegExp(`${f}\\(\\) needs a pure number`));
  });

  test("dimensions follow powers and roots", () => {
    const g = { A: { value: 4, unit: "m^2" }, t: { value: 2, unit: "s" } };
    expect(value("sqrt(A)", "m", g)).toBe(2);
    expect(value("A^(3/2)", "m^3", g)).toBeCloseTo(8, 12);
    expect(value("abs(-A) / t^2", "m^2/s^2", g)).toBe(1);
    expect(value("max(A, 2*A)", "m^2", g)).toBe(8);
    expect(error("sqrt(A)", "m^2", g)).toMatch(/gives m/);
  });

  test("bad givens and units", () => {
    expect(error("x", "", { x: { value: 1, unit: "furlongs" } })).toMatch(
      /unknown unit "furlongs"/,
    );
    expect(error("1", "furlongs")).toMatch(/Unknown result unit/);
    expect(error("x", "", { x: { value: NaN, unit: "" } })).toMatch(/no numeric value/);
    expect(error("1", "", { "2x": { value: 1, unit: "" } })).toMatch(
      /cannot be the name of a given/,
    );
    expect(error("1", "", { sqrt: { value: 1, unit: "" } })).toMatch(
      /cannot be the name of a given/,
    );
    expect(evaluateSpec(null as unknown as ProblemSpec)).toEqual({
      ok: false,
      error: "Not a spec",
    });
    expect(evaluateSpec({ expr: "1", unit: "" } as unknown as ProblemSpec)).toMatchObject({
      ok: false,
      error: "The spec has no givens",
    });
    expect(evaluateSpec({ givens: {}, unit: "" } as unknown as ProblemSpec)).toMatchObject({
      ok: false,
      error: "The spec has no expression",
    });
  });
});

describe("angles", () => {
  test("trigonometry is in radians; a given in degrees is converted like any unit", () => {
    expect(value("sin(theta)", "", { theta: { value: 30, unit: "deg" } })).toBeCloseTo(0.5, 12);
    expect(value("sin(theta)", "", { theta: { value: 30, unit: "°" } })).toBeCloseTo(0.5, 12);
    expect(value("sin(theta)", "", { theta: { value: Math.PI / 6, unit: "rad" } })).toBeCloseTo(
      0.5,
      12,
    );
    // A bare number is radians, so sin(30) is not one half.
    expect(value("sin(30)")).toBeCloseTo(-0.988, 3);
    expect(value("sin(30*deg)")).toBeCloseTo(0.5, 12);
    expect(value("cos(pi)")).toBe(-1);
  });

  test("inverse functions give radians, or degrees when the unit asks", () => {
    expect(value("asin(0.5)", "rad")).toBeCloseTo(Math.PI / 6, 12);
    expect(value("asin(0.5)", "deg")).toBeCloseTo(30, 10);
    expect(value("asin(0.5)", "")).toBeCloseTo(Math.PI / 6, 12);
    expect(value("atan2(1, 1)", "°")).toBeCloseTo(45, 10);
  });
});

describe("temperatures", () => {
  const T = { hot: { value: 80, unit: "°C" }, cold: { value: 20, unit: "°C" } };
  test("°C givens are absolute, differences come out right, and the result may be in °C", () => {
    expect(value("cold", "K", T)).toBeCloseTo(293.15, 10);
    expect(value("hot - cold", "K", T)).toBeCloseTo(60, 10);
    expect(value("hot - cold", "C°", T)).toBeCloseTo(60, 10);
    expect(value("(hot + cold)/2", "°C", T)).toBeCloseTo(50, 10);
    // Carnot: the ratio must be of absolute temperatures.
    expect(value("1 - cold/hot", "", T)).toBeCloseTo(1 - 293.15 / 353.15, 12);
    const heat = { ...T, m: { value: 2, unit: "kg" }, c: { value: 4186, unit: "J/(kg·°C)" } };
    expect(value("m*c*(hot - cold)", "kJ", heat)).toBeCloseTo(502.32, 8);
    expect(parseSpecUnit("°C")!.offset).toBe(273.15);
    expect(parseSpecUnit("")).toEqual({ factor: 1, dims: [0, 0, 0, 0, 0, 0, 0] });
    expect(parseSpecUnit("   ")).toEqual({ factor: 1, dims: [0, 0, 0, 0, 0, 0, 0] });
    expect(parseSpecUnit(5 as unknown as string)).toBeUndefined();
  });
});

describe("reciprocal units", () => {
  const per = (dims: number[]) => ({ factor: 1, dims });
  test('"1/s", "1/m" and "1/mm" read like s^-1, m^-1 and mm^-1', () => {
    expect(parseSpecUnit("1/s")).toEqual(per([0, 0, -1, 0, 0, 0, 0]));
    expect(parseSpecUnit("1/s")).toEqual(parseSpecUnit("s^-1"));
    expect(parseSpecUnit("1 / m")).toEqual(parseSpecUnit("m^-1"));
    expect(parseSpecUnit("1/mm")!.factor).toBeCloseTo(1000, 9);
    expect(parseSpecUnit("1/mm")!.dims).toEqual(parseSpecUnit("mm^-1")!.dims);
    expect(parseSpecUnit("1/(m s)")!.dims).toEqual([-1, 0, -1, 0, 0, 0, 0]);
    // an expansion coefficient: per degree is a difference, with no offset
    expect(parseSpecUnit("1/°C")).toEqual(per([0, 0, 0, 0, -1, 0, 0]));
    for (const bad of ["1/", "1/x", "1/1/s", "2/s"]) expect(parseSpecUnit(bad)).toBeUndefined();
    expect(value("n/t", "1/s", { n: { value: 30, unit: "" }, t: { value: 2, unit: "min" } })).toBe(
      0.25,
    );
    expect(value("k", "1/mm", { k: { value: 2000, unit: "1/m" } })).toBeCloseTo(2, 12);
  });

  test("units that already parsed read the same", () => {
    for (const u of [
      "s^-1",
      "Hz",
      "m/s^2",
      "N m^2/C^2",
      "J/(kg·°C)",
      "kg·m/s",
      "mol^-1",
      "Ω",
      "°C",
    ])
      expect(parseSpecUnit(u)).toEqual(parseUnit(u, { temperature: true }));
  });
});

describe("constants", () => {
  test("documented values with the right dimensions", () => {
    expect(value("g", "m/s^2")).toBe(9.8);
    expect(value("G", "N m^2/kg^2")).toBeCloseTo(6.6743e-11, 20);
    expect(value("k", "N m^2/C^2")).toBeCloseTo(8.9875517923e9, 0);
    expect(value("c", "m/s")).toBe(299792458);
    expect(value("e", "C")).toBeCloseTo(1.602176634e-19, 30);
    expect(value("eps0", "F/m")).toBeCloseTo(8.8541878128e-12, 22);
    expect(value("mu0", "T m/A")).toBeCloseTo(1.25663706212e-6, 16);
    expect(value("h", "J s")).toBeCloseTo(6.62607015e-34, 44);
    expect(value("R", "J/(mol K)")).toBeCloseTo(8.314462618, 9);
    expect(value("kB", "J/K")).toBeCloseTo(1.380649e-23, 33);
    expect(value("NA", "mol^-1")).toBeCloseTo(6.02214076e23, -10);
    expect(value("sigma", "W/(m^2 K^4)")).toBeCloseTo(5.670374419e-8, 18);
    expect(value("me", "kg")).toBeCloseTo(9.1093837015e-31, 40);
    expect(value("mp", "kg")).toBeCloseTo(1.67262192369e-27, 37);
    expect(value("atm", "Pa")).toBe(101325);
    expect(value("pi")).toBe(Math.PI);
    expect(value("deg")).toBeCloseTo(Math.PI / 180, 15);
    // They agree with each other: k = 1/(4 pi eps0), c = 1/sqrt(eps0 mu0), R = NA kB.
    expect(value("1/(4*pi*eps0)/k")).toBeCloseTo(1, 8);
    expect(value("1/sqrt(eps0*mu0)/c")).toBeCloseTo(1, 8);
    expect(value("NA*kB/R")).toBeCloseTo(1, 8);
    expect(Object.keys(SPEC_CONSTANTS)).toEqual(
      expect.arrayContaining(["g", "k", "c", "e", "G", "eps0", "mu0", "h", "R", "kB"]),
    );
  });

  test("a given replaces a constant of the same name", () => {
    expect(value("m*g", "N", { m: { value: 2, unit: "kg" } })).toBeCloseTo(19.6, 12);
    expect(
      value("m*g", "N", { m: { value: 2, unit: "kg" }, g: { value: 10, unit: "m/s^2" } }),
    ).toBe(20);
  });
});

describe("steps", () => {
  const base: ProblemSpec = {
    givens: { m: { value: 2, unit: "kg" }, v: { value: 3, unit: "m/s" } },
    steps: { K: "p*v/2", p: "m*v" },
    expr: "K",
    unit: "J",
  };

  test("are named intermediate results, in any order", () => {
    expect(evaluateSpec(base)).toEqual({ ok: true, value: 9, unit: "J" });
    expect(evaluateSpec({ ...base, steps: { p: "m*v", K: "p*v/2" } })).toMatchObject({ value: 9 });
    expect(evaluateSpecExpr(base, "p")).toMatchObject({ ok: false });
    expect(evaluateSpecExpr({ ...base, unit: "kg*m/s" }, "p")).toMatchObject({ value: 6 });
  });

  test("a step may replace a constant, but not a given, and may not refer to itself", () => {
    expect(evaluateSpec({ ...base, steps: { g: "v/v*10" }, expr: "g", unit: "" })).toMatchObject({
      value: 10,
    });
    expect(evaluateSpec({ ...base, steps: { m: "v" } })).toMatchObject({
      error: "Step m has the name of a given",
    });
    expect(evaluateSpec({ ...base, steps: { K: "L + m*v*v", L: "K" } })).toMatchObject({
      error: expect.stringMatching(/defined in terms of itself/),
    });
    expect(evaluateSpec({ ...base, steps: { "1a": "v" } })).toMatchObject({
      error: expect.stringMatching(/cannot be the name of a step/),
    });
    expect(evaluateSpec({ ...base, steps: { K: 5 as unknown as string } })).toMatchObject({
      error: "Step K is not an expression",
    });
  });

  test("a broken step is reported even when the answer does not use it", () => {
    expect(evaluateSpec({ ...base, expr: "m*v*v/2", steps: { junk: "m + v" } })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/A sum mixes/),
    });
  });
});

describe("helpers for the verifier", () => {
  const s: ProblemSpec = {
    givens: { a: { value: 1, unit: "" }, b: { value: 2, unit: "" } },
    steps: { half: "a/2" },
    expr: "half * (b - 3.5e2) + sqrt(a)",
    alt: ["a*7"],
    unit: "",
  };

  test("specLiterals lists the numbers written in every expression", () => {
    expect(specLiterals(s).sort((x, y) => x - y)).toEqual([2, 7, 350]);
    expect(specLiterals({ ...s, expr: "a $ 4" })).toEqual([2, 7]);
  });

  test("specShape blanks names and numbers and expands steps", () => {
    expect(specShape(s)).toBe("( v / n ) * ( v - n ) + sqrt ( v )");
    expect(specShape({ ...s, steps: undefined, expr: "(a/2) * (b - 9) + sqrt(b)" })).toBe(
      specShape(s),
    );
    expect(specShape({ ...s, expr: "a * b" })).not.toBe(specShape({ ...s, expr: "a / b" }));
    expect(specShape({ ...s, expr: "a $ b" })).toBe("?");
    // A name that happens to be a function is a value unless it is called.
    expect(specShape({ ...s, expr: "min + 1" })).toBe("v + n");
  });

  test("specShapeErrors", () => {
    expect(specShapeErrors(s)).toEqual([]);
    expect(specShapeErrors(null)).toEqual(["The spec is not an object"]);
    expect(specShapeErrors([])).toEqual(["The spec is not an object"]);
    expect(specShapeErrors({})).toHaveLength(3);
    expect(specShapeErrors({ ...s, expr: " " })).toEqual(["The spec has no expression"]);
    expect(specShapeErrors({ ...s, givens: [] })).toEqual(["The spec has no givens"]);
    expect(specShapeErrors({ ...s, givens: { a: { value: "1", unit: "" } } })).toEqual([
      "Given a needs a numeric value and a unit",
    ]);
    expect(specShapeErrors({ ...s, givens: { a: null } })).toHaveLength(1);
    expect(specShapeErrors({ ...s, givens: { a: { value: 1 } } })).toHaveLength(1);
    expect(specShapeErrors({ ...s, steps: [] })).toEqual([
      "steps must be an object of name: expression",
    ]);
    expect(specShapeErrors({ ...s, alt: "a" })).toEqual(["alt must be a list of expressions"]);
    expect(specShapeErrors({ ...s, alt: [1] })).toHaveLength(1);
    expect(specShapeErrors({ ...s, extraneous: ["1"] })).toEqual([
      "extraneous must be a list of numbers",
    ]);
    expect(specShapeErrors({ ...s, extraneous: [1, 2] })).toEqual([]);
  });

  test("formatDims", () => {
    expect(formatDims([0, 0, 0, 0, 0, 0, 0])).toBe("a pure number");
    expect(formatDims([1, 1, -2, 0, 0, 0, 0])).toBe("m·kg/s^2");
    expect(formatDims([0, 0, -1, 0, 0, 0, 0])).toBe("1/s");
    expect(formatDims([0.5, 0, 0, 1, -1, 0, 0])).toBe("m^0.5·A/K");
  });
});
