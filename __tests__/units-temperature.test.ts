// Celsius in functions/src/units.ts: read only on request, so the grader behaves exactly as before.
import {
  CELSIUS_OFFSET,
  convert,
  fromSI,
  parseQuantity,
  parseUnit,
  toSI,
} from "../functions/src/units";
import { checkNumeric, parseNumericKey } from "../functions/src/grading-core";

const T = { temperature: true };

describe("Celsius is opt-in", () => {
  test("without the option °C is still not a unit, in every spelling", () => {
    for (const text of ["°C", "degC", "celsius", "C°", "Cdeg", "degrees Celsius", "J/(kg·°C)"])
      expect([text, parseUnit(text)]).toEqual([text, undefined]);
    expect(parseQuantity("25 °C")).toMatchObject({
      value: 25,
      unit: undefined,
      trailingText: "°C",
    });
  });

  test("the grader's handling of a Celsius answer is unchanged", () => {
    // A key cannot be written in °C (the pipeline keys such problems as a bare number).
    expect(parseNumericKey("25 °C")).toBeUndefined();
    const bare = { id: "q", text: "", type: "numeric", correctAnswer: "25" };
    expect(checkNumeric("25 °C", bare)).toMatchObject({ fraction: 1 });
    expect(checkNumeric("298 °C", bare)).toMatchObject({ fraction: 0 });
    // Against a key in kelvin the °C is unread, so the number counts as having no unit: half credit.
    const kelvin = { id: "q", text: "", type: "numeric", correctAnswer: "298 K" };
    expect(checkNumeric("298 °C", kelvin)).toMatchObject({
      fraction: 0.5,
      misconceptions: ["unit-missing"],
    });
    expect(checkNumeric("25 °C", kelvin)).toMatchObject({ fraction: 0 });
    expect(checkNumeric("298 K", kelvin)).toMatchObject({ fraction: 1 });
  });
});

describe("Celsius with the option", () => {
  test("a temperature on the Celsius scale has a zero point", () => {
    for (const text of [
      "°C",
      "degC",
      "celsius",
      "Celsius",
      "degrees Celsius",
      "degree celsius",
      "deg C",
      "° C",
    ]) {
      const unit = parseUnit(text, T);
      expect([text, unit?.offset, unit?.factor]).toEqual([text, CELSIUS_OFFSET, 1]);
      expect(unit!.dims).toEqual([0, 0, 0, 0, 1, 0, 0]);
    }
    const celsius = parseUnit("°C", T)!;
    expect(toSI(20, celsius)).toBeCloseTo(293.15, 10);
    expect(toSI(-273.15, celsius)).toBeCloseTo(0, 10);
    expect(fromSI(373.15, celsius)).toBeCloseTo(100, 10);
  });

  test("a temperature difference has none", () => {
    for (const text of ["C°", "Cdeg", "celsius degrees"]) {
      const unit = parseUnit(text, T)!;
      expect([text, unit.offset, unit.factor]).toEqual([text, undefined, 1]);
      expect(toSI(20, unit)).toBe(20);
    }
    // convert never applies a zero point: it is for differences and for the grader.
    expect(convert(20, parseUnit("°C", T)!, parseUnit("K", T)!)).toBe(20);
  });

  test("kelvin is the same with or without the option, and takes prefixes", () => {
    expect(parseUnit("K", T)).toEqual(parseUnit("K"));
    expect(parseUnit("K", T)!.offset).toBeUndefined();
    expect(toSI(300, parseUnit("K", T)!)).toBe(300);
    expect(fromSI(0.5, parseUnit("mK", T)!)).toBeCloseTo(500, 10);
  });

  test("inside a larger unit °C is a difference", () => {
    const perCelsius = parseUnit("J/(kg·°C)", T)!;
    expect(perCelsius.offset).toBeUndefined();
    expect(perCelsius).toEqual(parseUnit("J/(kg·K)"));
    expect(parseUnit("°C/s", T)!.offset).toBeUndefined();
    expect(parseUnit("°C^2", T)!.offset).toBeUndefined();
    expect(parseUnit("J/(kg degrees Celsius)", T)).toEqual(parseUnit("J/(kg K)"));
  });

  test("quantities read with the option; other units are untouched by it", () => {
    const q = parseQuantity("600 degrees Celsius", T)!;
    expect(q).toMatchObject({ value: 600, unitText: "degrees Celsius", trailingText: "" });
    expect(toSI(q.value, q.unit!)).toBeCloseTo(873.15, 10);
    expect(parseQuantity("-10.0 °C", T)).toMatchObject({ value: -10, sigFigs: 3 });
    expect(parseQuantity("12.5 m/s", T)).toEqual(parseQuantity("12.5 m/s"));
    expect(parseUnit("degrees", T)).toEqual(parseUnit("degrees"));
    expect(parseUnit("C", T)).toEqual(parseUnit("C")); // coulombs
    expect(toSI(5, parseUnit("km")!)).toBe(5000);
    expect(fromSI(5000, parseUnit("km")!)).toBe(5);
  });
});
