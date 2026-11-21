// src/lib/content/verify.ts: every check of the answer-key verifier, on small made-up problems.
import type { DraftProblem } from "../src/lib/content/problem-format";
import type { ProblemSpec } from "../src/lib/content/spec";
import {
  checkBlindSolves,
  checkGraderRoundTrip,
  checkMcQuantity,
  checkNearDuplicate,
  checkNotStale,
  checkRecompute,
  checkSolutionConsistent,
  checkSpecMatchesText,
  computeSpec,
  contentHash,
  deterministicChecks,
  optionQuantities,
  resolveSolverAnswer,
  shuffledOptions,
  solveSheetEntry,
  textNumbers,
  textSimilarity,
  verificationIsCurrent,
  verifyProblem,
} from "../src/lib/content/verify";

const cartSpec: ProblemSpec = {
  givens: {
    m1: { value: 2.0, unit: "kg" },
    v: { value: 3.0, unit: "m/s" },
    m2: { value: 1.0, unit: "kg" },
  },
  expr: "m1*v/(m1 + m2)",
  unit: "m/s",
};
const cart: DraftProblem = {
  text: "A 2.0 kg cart moving at 3.0 m/s collides with and sticks to a 1.0 kg cart at rest. Find their final speed.",
  type: "numeric",
  correctAnswer: "2.0 m/s",
  solution: "Momentum is conserved: (2.0)(3.0) = (3.0)v, so v = 2.0 m/s.",
  distractors: [{ answer: "3.0 m/s", misconception: "momentum-not-vector" }],
  difficulty: "easy",
  points: 10,
  apTopic: "4.3",
  spec: cartSpec,
};
const truck: DraftProblem = {
  text: "A truck collides head-on with a small car. Compare the forces each exerts on the other during the collision.",
  type: "multiple-choice",
  options: [
    "The truck's force is larger",
    "The car's force is larger",
    "They are equal in size",
    "It depends on speed",
  ],
  correctAnswer: "They are equal in size",
  solution: "Newton's third law: the forces form an interaction pair, so they are equal in size.",
  distractors: [
    { answer: "The truck's force is larger", misconception: "third-law-unequal-forces" },
  ],
  difficulty: "medium",
  points: 10,
  apTopic: "2.3",
};
const ramp: DraftProblem = {
  text: "A 4.0 kg block is pushed by a 12 N net force. What is its acceleration?",
  type: "multiple-choice",
  options: ["3.0 m/s^2", "48 m/s^2", "0.33 m/s^2", "8.0 m/s^2"],
  correctAnswer: "3.0 m/s^2",
  solution: "a = F/m = 12/4.0 = 3.0 m/s^2.",
  distractors: [],
  difficulty: "easy",
  points: 10,
  apTopic: "2.3",
  spec: {
    givens: { m: { value: 4.0, unit: "kg" }, F: { value: 12, unit: "N" } },
    expr: "F/m",
    unit: "m/s^2",
  },
};
const withKey = (key: string, extra: Partial<DraftProblem> = {}): DraftProblem => ({
  ...cart,
  correctAnswer: key,
  ...extra,
});
const withSpec = (spec: Partial<ProblemSpec>, extra: Partial<DraftProblem> = {}): DraftProblem => ({
  ...cart,
  ...extra,
  spec: { ...cartSpec, ...spec },
});

describe("contentHash", () => {
  test("depends on text, options, key and spec, and on nothing else", () => {
    const h = contentHash(cart);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    const reworded: DraftProblem = { ...cart, solution: "other", points: 5, distractors: [] };
    expect(contentHash(reworded)).toBe(h);
    expect(contentHash({ ...cart, text: cart.text + " " })).not.toBe(h);
    expect(contentHash({ ...cart, correctAnswer: "2.0 m/s " })).not.toBe(h);
    expect(contentHash({ ...cart, spec: undefined })).not.toBe(h);
    expect(contentHash(withSpec({ expr: "m1*v/(m2 + m1)" }))).not.toBe(h);
    expect(contentHash(withSpec({ extraneous: [] }))).not.toBe(h);
    expect(contentHash(truck)).not.toBe(
      contentHash({ ...truck, options: [...truck.options!].reverse() }),
    );
  });

  test("does not depend on the order of keys (a database may reorder them)", () => {
    const reordered: ProblemSpec = {
      unit: "m/s",
      expr: cartSpec.expr,
      givens: { m2: cartSpec.givens.m2, v: { unit: "m/s", value: 3.0 }, m1: cartSpec.givens.m1 },
    };
    expect(contentHash({ ...cart, spec: reordered })).toBe(contentHash(cart));
  });
});

describe("textNumbers", () => {
  const values = (text: string) => textNumbers(text).map((n) => n.value);

  test("reads plain numbers, thousands separators and every scientific notation as one number", () => {
    expect(values("3.0 x 10^8 m/s, 3.0e8, 3.0 × 10⁸, 6.42 * 10^23 kg and 1.6E-19 C")).toEqual([
      3e8, 3e8, 3e8, 6.42e23, 1.6e-19,
    ]);
    expect(values("160,000 Pa and 1,200 N, then .5 s")).toEqual([160000, 1200, 0.5]);
    expect(values("mu_0 = 4*pi x 10^-7 T*m/A")).toEqual([4, 1e-7]);
    expect(values("$1.2 \\times 10^{3}$ J")).toEqual([1200]);
  });

  test("leaves out exponents, digits in names, isotopes and ordinals", () => {
    expect(values("a = 9.8 m/s^2 and F = 5.0 N/m^2")).toEqual([9.8, 5.0]);
    expect(values("m1 = 2.0 kg, x_0 = 0.10 m, R2 and H2O")).toEqual([2.0, 0.1]);
    expect(values("a lithium-7 ion and carbon-14")).toEqual([]);
    expect(values("the 3rd trial took 12 s")).toEqual([12]);
    expect(values("x^2 + 2^3 = t**2")).toEqual([2]);
    expect(values("")).toEqual([]);
  });

  test("coefficients attached to letters are numbers", () => {
    expect(values("a(t) = 6.0t - 4.0 and F(x) = -2.0x^2 at height 2R")).toEqual([6.0, 4.0, 2.0, 2]);
  });

  test("reads the unit that follows", () => {
    const [cm, deg, pct, celsius, bare, hyphen, attached] = textNumbers(
      "15 cm, 35.0 degrees, 25%, 600 degrees Celsius, 16 times, a 2.0-cm-tall arrow and 20cm.",
    );
    expect(cm.unit).toMatchObject({ factor: 0.01 });
    expect(deg.unit!.factor).toBeCloseTo(Math.PI / 180, 12);
    expect(pct.unit).toMatchObject({ factor: 0.01 });
    expect(celsius.unit).toMatchObject({ offset: 273.15 });
    expect(bare.unit).toBeUndefined();
    expect(hyphen.unit).toMatchObject({ factor: 0.01 });
    expect(attached.unit).toMatchObject({ factor: 0.01 });
    // A single attached letter is algebra, and a unit does not reach across a sentence end.
    expect(textNumbers("mass 2m")[0].unit).toBeUndefined();
    expect(textNumbers("of Disk 2. A student")[0].unit).toBeUndefined();
    expect(textNumbers("is 450 N/m. When")[0].unit).toMatchObject({ factor: 1 });
    expect(textNumbers("(mass 1.5 kg) is")[0].unit).toMatchObject({ factor: 1 });
  });

  test("marks small whole numbers that name things as labels", () => {
    const labels = (text: string) => textNumbers(text).map((n) => n.label);
    expect(labels("Disk 2 has mass M")).toEqual([true]);
    expect(labels("Object 1 (mass 1.5 kg)")).toEqual([true, false]);
    expect(labels("n = 2 and a factor of 16")).toEqual([false, false]);
    expect(labels("after 3 s")).toEqual([false]);
    expect(labels("mass 2m")).toEqual([false]);
    expect(labels("level 12 only")).toEqual([false]);
  });

  test("records how far a rounded number may be from the exact one", () => {
    const slack = (text: string) => textNumbers(text)[0].roundingSlack;
    expect(slack("3.4")).toBeCloseTo(0.05, 12);
    expect(slack("3.4 x 10^-6")).toBeCloseTo(0.05e-6, 18);
    expect(slack("12")).toBeCloseTo(0.5, 12);
    expect(slack("5")).toBe(0);
    expect(slack("1200")).toBeCloseTo(0.5, 12);
    expect(slack("100")).toBe(0);
    expect(slack("0.0")).toBe(0);
  });

  test("joins space-grouped thousands only when asked", () => {
    expect(values("K = 76 800 J")).toEqual([76, 800]);
    expect(textNumbers("K = 76 800 J", { joinSpacedThousands: true }).map((n) => n.value)).toEqual([
      76800,
    ]);
    expect(
      textNumbers("t = 2.5 100 times", { joinSpacedThousands: true }).map((n) => n.value),
    ).toEqual([2.5, 100]);
  });
});

describe("computeSpec", () => {
  test("evaluates, and rejects a malformed spec", () => {
    expect(computeSpec(cartSpec)).toEqual({ ok: true, value: 2, unit: "m/s" });
    expect(computeSpec({ ...cartSpec, expr: "" })).toMatchObject({ ok: false });
    expect(computeSpec({ ...cartSpec, expr: "m1 +" })).toMatchObject({ ok: false });
  });

  test("alternative routes must agree within 1%", () => {
    expect(computeSpec({ ...cartSpec, alt: ["v*m1/(m2 + m1)", "v*0.67"] })).toMatchObject({
      ok: true,
    });
    expect(computeSpec({ ...cartSpec, alt: ["v*0.65"] })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Two routes disagree.*contradict/),
    });
    expect(computeSpec({ ...cartSpec, alt: ["v*0.675"] })).toMatchObject({ ok: false });
    expect(computeSpec({ ...cartSpec, alt: ["m1"] })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Alternative route/),
    });
    // Both zero is agreement.
    expect(computeSpec({ ...cartSpec, expr: "v - v", alt: ["0*v"] })).toMatchObject({
      ok: true,
      value: 0,
    });
  });

  test("the answer may not depend on the value given to a symbol", () => {
    const ratio: ProblemSpec = {
      givens: {
        M: { value: 1, unit: "kg", symbol: "M" },
        R: { value: 1, unit: "m", symbol: "R" },
      },
      expr: "(2*M*R^2)/(M*R^2)",
      unit: "",
    };
    expect(computeSpec(ratio)).toMatchObject({ ok: true, value: 2 });
    expect(computeSpec({ ...ratio, expr: "(2*M*R^2)/(M*R)", unit: "m" })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/depends on the value chosen for M, R/),
    });
    // With symbols of value 1 a wrong power would go unnoticed; changing the values shows it.
    expect(computeSpec({ ...ratio, expr: "2*R/R^2*R^2/R" })).toMatchObject({ ok: true });
    expect(
      computeSpec({
        ...ratio,
        givens: { ...ratio.givens, R: { value: 1, unit: "", symbol: "R" } },
        expr: "2*R^2",
      }),
    ).toMatchObject({ ok: false });
  });
});

describe("recompute", () => {
  test("passes when the spec gives the key", () => {
    expect(checkRecompute(cart)).toEqual({ pass: true, detail: "spec gives 2 m/s" });
  });

  test("a numeric problem without a spec is missing evidence, not a failure", () => {
    expect(checkRecompute({ ...cart, spec: undefined })).toMatchObject({
      pass: false,
      missing: true,
    });
  });

  test("fails on a wrong key, with both values in the message", () => {
    const r = checkRecompute(withKey("3.0 m/s"));
    expect(r).toMatchObject({ pass: false });
    expect(r.missing).toBeUndefined();
    expect(r.detail).toMatch(/spec gives 2 m\/s; the key "3.0 m\/s" is 50% away/);
    expect(checkRecompute(withKey("-2.0 m/s")).pass).toBe(false);
    expect(checkRecompute(withKey("2.02 m/s")).detail).toMatch(/1.00% away/);
  });

  test("0.5% is the limit", () => {
    expect(checkRecompute(withKey("2.01 m/s")).pass).toBe(true);
    expect(checkRecompute(withKey("2.02 m/s")).pass).toBe(false);
    expect(checkRecompute(withKey("1.99 m/s")).pass).toBe(true);
    expect(checkRecompute(withKey("1.98 m/s")).pass).toBe(false);
  });

  test("the key may not claim digits it does not have", () => {
    // 2.0048 is within 0.5% of 2 but its last three digits are wrong.
    const r = checkRecompute(withKey("2.0048 m/s"));
    expect(r.pass).toBe(false);
    expect(r.detail).toMatch(/not to the digits the key gives/);
    expect(checkRecompute(withKey("2.0001 m/s")).pass).toBe(true);
    expect(checkRecompute(withKey("2.00 m/s")).pass).toBe(true);
  });

  test("a correctly rounded key may be up to two thirds of the grading tolerance away", () => {
    // 7/3.6 = 1.944...: "1.9" is 2.3% away (too far at 3%), fine at a 5% tolerance.
    const spec = { expr: "v*0.648148" };
    expect(checkRecompute(withSpec(spec, { correctAnswer: "1.94 m/s" })).pass).toBe(true);
    const loose = checkRecompute(withSpec(spec, { correctAnswer: "1.9 m/s" }));
    expect(loose.pass).toBe(false);
    expect(loose.detail).toMatch(/2.3% away: rounded too far for a 3% grading tolerance/);
    expect(checkRecompute(withSpec(spec, { correctAnswer: "1.9 m/s", tolerance: 5 })).pass).toBe(
      true,
    );
    // 2.03 -> "2.0" is 1.5% away and correctly rounded: passes. "2.1" is not the rounding: fails.
    expect(checkRecompute(withSpec({ expr: "v*0.67667" }, { correctAnswer: "2.0 m/s" })).pass).toBe(
      true,
    );
    expect(checkRecompute(withSpec({ expr: "v*0.67667" }, { correctAnswer: "2.1 m/s" })).pass).toBe(
      false,
    );
    // One significant figure can still be a correct rounding within the allowance.
    expect(checkRecompute(withSpec({ expr: "v*0.67667" }, { correctAnswer: "2 m/s" })).pass).toBe(
      true,
    );
    expect(checkRecompute(withSpec({ expr: "v*0.7" }, { correctAnswer: "2 m/s" })).pass).toBe(
      false,
    );
  });

  test("units: converted when they are the same kind, compared as numbers when the key has none", () => {
    expect(checkRecompute(withKey("7.2 km/h")).pass).toBe(true);
    expect(checkRecompute(withKey("200 cm/s")).pass).toBe(true);
    expect(checkRecompute(withKey("2.0")).pass).toBe(true);
    const wrongKind = checkRecompute(withKey("2.0 J"));
    expect(wrongKind.pass).toBe(false);
    expect(wrongKind.detail).toMatch(/different kinds of quantity/);
    expect(checkRecompute(withKey("2.0 m")).pass).toBe(false);
    // A dimensionless unit on the key (degrees) is converted too.
    const angle = withSpec({
      givens: { x: { value: 0.5, unit: "" } },
      expr: "asin(x)",
      unit: "rad",
    });
    expect(checkRecompute({ ...angle, correctAnswer: "30°" }).pass).toBe(true);
    expect(checkRecompute({ ...angle, correctAnswer: "0.524 rad" }).pass).toBe(true);
    expect(checkRecompute({ ...angle, correctAnswer: "30 rad" }).pass).toBe(false);
  });

  test("a key of zero, a key that is not a number, and a spec that cannot be evaluated", () => {
    const zero = withSpec({ expr: "v - v" });
    expect(checkRecompute({ ...zero, correctAnswer: "0 m/s" }).pass).toBe(true);
    expect(checkRecompute({ ...zero, correctAnswer: "0.2 m/s" }).pass).toBe(false);
    expect(checkRecompute(withKey("0 m/s")).detail).toMatch(/is not zero/);
    expect(checkRecompute(withKey("fast")).detail).toMatch(/not a number with a known unit/);
    expect(checkRecompute(withSpec({ expr: "sqrt(m2 - m1)", unit: "kg^0.5" })).pass).toBe(false);
    expect(checkRecompute(withSpec({ expr: "m1 + v" })).detail).toMatch(/A sum mixes/);
    expect(checkRecompute(withSpec({ unit: "furlong" })).detail).toMatch(/Unknown result unit/);
    expect(checkRecompute(withSpec({ alt: ["v"] })).detail).toMatch(/Two routes disagree/);
  });

  test("Celsius results compare with a key given as a bare number", () => {
    const mix: DraftProblem = {
      ...cart,
      text: "Equal masses of water at 20 °C and 80 °C are mixed. Give the final temperature in degrees Celsius.",
      correctAnswer: "50",
      spec: {
        givens: { a: { value: 20, unit: "°C" }, b: { value: 80, unit: "°C" } },
        expr: "(a + b)/2",
        unit: "°C",
      },
    };
    expect(checkRecompute(mix)).toEqual({ pass: true, detail: "spec gives 50" });
    expect(checkRecompute({ ...mix, correctAnswer: "323 K" }).pass).toBe(true);
    expect(checkSpecMatchesText(mix).pass).toBe(true);
  });
});

describe("spec-matches-text", () => {
  test("passes when the givens are the numbers of the text", () => {
    expect(checkSpecMatchesText(cart)).toEqual({ pass: true });
    expect(checkSpecMatchesText({ ...cart, spec: undefined })).toMatchObject({ missing: true });
    expect(checkSpecMatchesText(withSpec({ expr: "" })).pass).toBe(false);
  });

  test("a given that is not in the text fails", () => {
    const r = checkSpecMatchesText(
      withSpec({ givens: { ...cartSpec.givens, v: { value: 3.5, unit: "m/s" } } }),
    );
    expect(r.pass).toBe(false);
    expect(r.detail).toMatch(/given v = 3.5 m\/s is not in the text/);
    // ...and the 3.0 of the text is then a number nothing uses.
    expect(r.detail).toMatch(/numbers the spec does not use: 3.0/);
  });

  test("a number in the text that the spec does not use fails, unless it is listed as extraneous", () => {
    const text = cart.text + " The track is 5.0 m long.";
    const r = checkSpecMatchesText({ ...cart, text });
    expect(r.pass).toBe(false);
    expect(r.detail).toBe("the text has numbers the spec does not use: 5.0");
    expect(checkSpecMatchesText(withSpec({ extraneous: [5.0] }, { text })).pass).toBe(true);
    expect(checkSpecMatchesText(withSpec({ extraneous: [5.0] })).detail).toBe(
      "extraneous 5 is not in the text",
    );
  });

  test("a number written in the expression counts as used", () => {
    const text =
      "A 2.0 kg cart moving at 3.0 m/s hits a cart of half its mass, 1.0 kg, at height 7R.";
    expect(checkSpecMatchesText({ ...cart, text }).detail).toMatch(/does not use: 7$/);
    expect(checkSpecMatchesText(withSpec({ expr: "m1*v/(m1 + m2) * 7/7" }, { text })).pass).toBe(
      true,
    );
    expect(checkSpecMatchesText(withSpec({ steps: { seven: "7*m1" } }, { text })).pass).toBe(true);
  });

  test("formatting variants and unit prefixes match", () => {
    const light: DraftProblem = {
      ...cart,
      text: "Light of speed 3.0 x 10^8 m/s and wavelength 633 nm passes a slit 15 cm from a screen. 25% is absorbed over 2.50 km.",
      spec: {
        givens: {
          c: { value: 3.0e8, unit: "m/s" },
          lam: { value: 6.33e-7, unit: "m" },
          L: { value: 0.15, unit: "m" },
          lost: { value: 0.25, unit: "" },
          d: { value: 2500, unit: "m" },
        },
        expr: "c*lam*L*lost*d",
        unit: "m^4/s",
      },
    };
    expect(checkSpecMatchesText(light)).toEqual({ pass: true });
    expect(
      checkSpecMatchesText({ ...light, text: light.text.replace("3.0 x 10^8", "3.0e8") }).pass,
    ).toBe(true);
    expect(
      checkSpecMatchesText({ ...light, text: light.text.replace("3.0 x 10^8", "3.0 × 10⁸") }).pass,
    ).toBe(true);
    // The same digits in another unit are another amount.
    expect(
      checkSpecMatchesText({ ...light, text: light.text.replace("15 cm", "15 mm") }).pass,
    ).toBe(false);
    // A sign in the text or the given does not matter.
    expect(
      checkSpecMatchesText({ ...light, text: light.text.replace("15 cm", "-15 cm") }).pass,
    ).toBe(true);
  });

  test("zero and labels are never reported as unused", () => {
    const text = "At t = 0 s, Cart 1 (2.0 kg) moving at 3.0 m/s hits Cart 2 (1.0 kg) at x = 0.";
    expect(checkSpecMatchesText({ ...cart, text })).toEqual({ pass: true });
  });

  test("symbolic and assumed givens", () => {
    const disk: DraftProblem = {
      ...cart,
      text: "Disk 1 has mass M and radius R. Disk 2 has mass 2M and the same radius. Find the ratio I_2/I_1.",
      spec: {
        givens: {
          M: { value: 1, unit: "kg", symbol: "M" },
          R: { value: 1, unit: "m", symbol: "R" },
        },
        expr: "(2*M*R^2)/(M*R^2)",
        unit: "",
      },
    };
    expect(checkSpecMatchesText(disk)).toEqual({ pass: true });
    const missingSymbol = checkSpecMatchesText({
      ...disk,
      text: disk.text.replace("radius R", "radius r"),
    });
    expect(missingSymbol.detail).toMatch(/symbol "R" \(R\) is not in the text/);
    const odd = {
      ...disk.spec!,
      givens: { ...disk.spec!.givens, R: { value: 1, unit: "m", symbol: "" } },
    };
    expect(checkSpecMatchesText({ ...disk, spec: odd }).pass).toBe(false);
    const assumed = withSpec({
      givens: { ...cartSpec.givens, rho: { value: 1000, unit: "kg/m^3", assumed: true } },
    });
    expect(checkSpecMatchesText(assumed)).toEqual({ pass: true });
    assumed.spec!.givens.rho = { value: 1000, unit: "kg/m^3" };
    expect(checkSpecMatchesText(assumed).pass).toBe(false);
  });
});

describe("solution-consistent", () => {
  const withSolution = (solution: string, key = cart.correctAnswer) =>
    checkSolutionConsistent({ ...cart, solution, correctAnswer: key });

  test("the key's number must appear in the solution", () => {
    expect(checkSolutionConsistent(cart)).toEqual({ pass: true });
    const r = withSolution("Momentum: (2.5)(4.0) = 10, so v = 3.3 m/s.");
    expect(r.pass).toBe(false);
    expect(r.detail).toMatch(/does not appear in the worked solution/);
    expect(withSolution("It is conserved.").detail).toMatch(/no numbers/);
    expect(
      checkSolutionConsistent({ ...cart, solution: undefined as unknown as string }).pass,
    ).toBe(false);
    expect(withSolution("v = 2.0 m/s", "fast").detail).toMatch(/is not a number/);
  });

  test("any notation, another unit, a rounder or a longer number all count", () => {
    expect(withSolution("K = 7.68 x 10^4 J", "76800 J").pass).toBe(true);
    expect(withSolution("K = 76 800 J", "76800 J").pass).toBe(true);
    expect(withSolution("x = 30.4 cm", "0.304 m").pass).toBe(true);
    expect(withSolution("x = 30.4 mm", "0.304 m").pass).toBe(false);
    expect(withSolution("B = 0.159 T", "0.16 T").pass).toBe(true);
    expect(withSolution("Phi = 3.4 x 10^-6 Wb", "3.45 x 10^-6 Wb").pass).toBe(true);
    expect(withSolution("Phi = 3.3 x 10^-6 Wb", "3.45 x 10^-6 Wb").pass).toBe(false);
    expect(withSolution("d = -3.75 cm", "-3.75 cm").pass).toBe(true);
    expect(withSolution("about 3 m/s", "3.4 m/s").pass).toBe(false);
  });

  test("multiple choice: checked when the options are quantities, fractions included", () => {
    expect(checkSolutionConsistent(ramp)).toEqual({ pass: true });
    expect(checkSolutionConsistent({ ...ramp, solution: "a = 12/4.0 = 4.8." }).pass).toBe(false);
    const fraction: DraftProblem = {
      ...ramp,
      options: ["1/4", "1/2", "1/8", "3/4"],
      correctAnswer: "1/4",
      solution: "U = (1/2)k(A/2)^2 = E/4, so the fraction is 1/4.",
    };
    expect(checkSolutionConsistent(fraction)).toEqual({ pass: true });
    expect(checkSolutionConsistent({ ...fraction, correctAnswer: "1/8" }).pass).toBe(false);
    expect(checkSolutionConsistent(truck)).toEqual({
      pass: true,
      detail: "not applicable: the key is not a quantity",
    });
    expect(checkSolutionConsistent({ ...ramp, correctAnswer: "9 m/s^2" }).detail).toMatch(
      /not applicable/,
    );
  });
});

describe("grader-round-trip", () => {
  test("passes for a sound numeric and a sound multiple-choice problem", () => {
    expect(checkGraderRoundTrip(cart, "4.3")).toEqual({ pass: true });
    expect(checkGraderRoundTrip(truck, "2.3")).toEqual({ pass: true });
    expect(checkGraderRoundTrip(ramp, "2.3")).toEqual({ pass: true });
  });

  test("validation errors fail it", () => {
    expect(checkGraderRoundTrip(cart, "99.9").detail).toMatch(/Unknown AP topic/);
    expect(checkGraderRoundTrip(withKey("fast"), "4.3").detail).toMatch(
      /not a number with a known unit/,
    );
    expect(checkGraderRoundTrip({ ...cart, text: "short" }, "4.3").pass).toBe(false);
    // AP Physics 1 has no topic 9.1; AP Physics 2 does.
    expect(checkGraderRoundTrip(cart, "9.1").pass).toBe(false);
    expect(checkGraderRoundTrip(cart, "9.1", "physics-2").pass).toBe(true);
  });

  test("a distractor the grader gives credit fails it: equal to the key, or the key in another unit", () => {
    const same = {
      ...cart,
      distractors: [{ answer: "2.0 m/s", misconception: "momentum-not-vector" }],
    };
    expect(checkGraderRoundTrip(same, "4.3").detail).toMatch(
      /gives the distractor "2.0 m\/s" credit/,
    );
    const converted = {
      ...cart,
      distractors: [{ answer: "7.2 km/h", misconception: "momentum-not-vector" }],
    };
    expect(checkGraderRoundTrip(converted, "4.3").pass).toBe(false);
    // Half credit (right number, wrong unit) is credit.
    const halfCredit = {
      ...cart,
      distractors: [{ answer: "2.0 J", misconception: "momentum-not-vector" }],
    };
    expect(checkGraderRoundTrip(halfCredit, "4.3").pass).toBe(false);
    const within = {
      ...cart,
      distractors: [{ answer: "2.05 m/s", misconception: "momentum-not-vector" }],
    };
    expect(checkGraderRoundTrip(within, "4.3").pass).toBe(false);
    expect(checkGraderRoundTrip({ ...within, tolerance: 1 }, "4.3").pass).toBe(true);
    expect(checkGraderRoundTrip({ ...cart, distractors: undefined as never }, "4.3").pass).toBe(
      true,
    );
  });

  test("multiple choice needs exactly 4 different options with the key among them once", () => {
    const three = { ...truck, options: truck.options!.slice(1), distractors: [] };
    expect(checkGraderRoundTrip(three, "2.3").detail).toMatch(/has 3 options, not 4/);
    const five = { ...truck, options: [...truck.options!, "Neither"] };
    expect(checkGraderRoundTrip(five, "2.3").detail).toMatch(/has 5 options, not 4/);
    const repeated = {
      ...truck,
      options: ["A", "a ", "They are equal in size", "B"],
      distractors: [],
    };
    expect(checkGraderRoundTrip(repeated, "2.3").detail).toMatch(/Options repeat/);
    const notAnOption = { ...truck, correctAnswer: "They are equal" };
    expect(checkGraderRoundTrip(notAnOption, "2.3").detail).toMatch(/not one of the options/);
    const keyAsDistractor = {
      ...truck,
      distractors: [
        { answer: "They are equal in size", misconception: "third-law-unequal-forces" },
      ],
    };
    expect(checkGraderRoundTrip(keyAsDistractor, "2.3").detail).toMatch(/gives the distractor/);
    const stray = {
      ...truck,
      distractors: [{ answer: "Something else", misconception: "third-law-unequal-forces" }],
    };
    expect(checkGraderRoundTrip(stray, "2.3").detail).toMatch(/is not one of the options/);
    expect(checkGraderRoundTrip({ ...truck, options: undefined }, "2.3").pass).toBe(false);
  });
});

describe("mc-quantity", () => {
  test("the spec must pick the keyed option", () => {
    expect(checkMcQuantity(ramp)).toEqual({ pass: true, detail: "spec gives 3 m/s^2" });
    const wrong = checkMcQuantity({ ...ramp, correctAnswer: "48 m/s^2" });
    expect(wrong.pass).toBe(false);
    expect(wrong.detail).toMatch(/option "3.0 m\/s\^2", not the key "48 m\/s\^2"/);
    expect(checkMcQuantity({ ...ramp, spec: undefined })).toMatchObject({ missing: true });
  });

  test("no option, or more than one, fails", () => {
    const none = {
      ...ramp,
      options: ["3.5 m/s^2", "48 m/s^2", "0.33 m/s^2", "8.0 m/s^2"],
      correctAnswer: "3.5 m/s^2",
    };
    expect(checkMcQuantity(none).detail).toMatch(/which is none of the options/);
    const two = { ...ramp, options: ["3.0 m/s^2", "3.01 m/s^2", "0.33 m/s^2", "8.0 m/s^2"] };
    expect(checkMcQuantity(two).detail).toMatch(
      /fits more than one option: 3.0 m\/s\^2 \| 3.01 m\/s\^2/,
    );
  });

  test("options are compared in their own units, with words after them ignored", () => {
    const mixed = {
      ...ramp,
      options: [
        "300 cm/s^2 to the right",
        "48 m/s^2 to the right",
        "0.33 m/s^2 to the left",
        "8.0 m/s^2 up",
      ],
      correctAnswer: "300 cm/s^2 to the right",
    };
    expect(checkMcQuantity(mixed).pass).toBe(true);
    const wrongKind = {
      ...ramp,
      options: ["3.0 N", "48 N", "0.33 N", "8.0 N"],
      correctAnswer: "3.0 N",
    };
    expect(checkMcQuantity(wrongKind).detail).toMatch(
      /Option "3.0 N".*different kinds of quantity/,
    );
    const bare = { ...ramp, options: ["3.0", "48", "0.33", "8.0"], correctAnswer: "3.0" };
    expect(checkMcQuantity(bare).pass).toBe(true);
  });

  test("ratios: fractions and multiples of an algebraic quantity", () => {
    const ratio: DraftProblem = {
      ...ramp,
      text: "Disk 1 has mass M. Disk 2 has mass 2M. Both have radius R. What is I_1/I_2?",
      options: ["1/2", "1", "2", "4"],
      correctAnswer: "1/2",
      spec: {
        givens: {
          M: { value: 1, unit: "kg", symbol: "M" },
          R: { value: 1, unit: "m", symbol: "R" },
        },
        expr: "(M*R^2)/(2*M*R^2)",
        unit: "",
      },
    };
    expect(checkMcQuantity(ratio).pass).toBe(true);
    expect(checkMcQuantity({ ...ratio, correctAnswer: "2" }).pass).toBe(false);
    const energy: DraftProblem = {
      ...ratio,
      options: ["1.25 m*v^2", "1.5 m*v^2", "2.0 m*v^2", "2.5 m*v^2"],
      correctAnswer: "1.5 m*v^2",
      spec: { givens: { m: { value: 1, unit: "kg", symbol: "m" } }, expr: "3*m/(2*m)", unit: "" },
    };
    expect(checkMcQuantity(energy)).toEqual({ pass: true, detail: "spec gives 1.5" });
    expect(checkMcQuantity({ ...energy, correctAnswer: "1.25 m*v^2" }).pass).toBe(false);
  });

  test("a spec on options that are not quantities, or one that cannot be evaluated, fails", () => {
    expect(checkMcQuantity({ ...truck, spec: ramp.spec }).detail).toMatch(
      /options are not quantities/,
    );
    expect(checkMcQuantity({ ...ramp, spec: { ...ramp.spec!, expr: "F/0" } }).pass).toBe(false);
    expect(optionQuantities(truck)).toBeUndefined();
    expect(optionQuantities(cart)).toBeUndefined();
    expect(optionQuantities(ramp)).toHaveLength(4);
    expect(
      optionQuantities({ ...ramp, options: ["-2 m", "(1/2) m", ".5 m", "≈ 3 m"] }),
    ).toHaveLength(4);
  });

  test("Celsius options", () => {
    const hot: DraftProblem = {
      ...ramp,
      text: "A body at 25 °C radiates 16 times faster. Find its new temperature.",
      options: ["400 °C", "323 °C", "100 °C", "50 °C"],
      correctAnswer: "323 °C",
      spec: {
        givens: { T: { value: 25, unit: "°C" }, n: { value: 16, unit: "" } },
        expr: "T*n^(1/4)",
        unit: "°C",
      },
    };
    expect(checkMcQuantity(hot).pass).toBe(true);
    expect(checkMcQuantity({ ...hot, correctAnswer: "50 °C" }).pass).toBe(false);
    expect(checkSpecMatchesText(hot).pass).toBe(true);
  });
});

describe("blind-solves", () => {
  const solve = (id: string, answer: string, textHash?: string) => ({ id, answer, textHash });

  test("needs two solvers who agree with the key, judged by the grader", () => {
    const two = checkBlindSolves(cart, [solve("a", "2.0 m/s"), solve("b", "7.2 km/h")]);
    expect(two.outcome).toEqual({ pass: true, detail: "2 of 2 solvers agree" });
    expect(two.solvers).toEqual([
      { id: "a", answer: "2.0 m/s", agrees: true },
      { id: "b", answer: "7.2 km/h", agrees: true },
    ]);
    expect(checkBlindSolves(cart, []).outcome).toMatchObject({ pass: false, missing: true });
    expect(checkBlindSolves(cart, [solve("a", "2.0 m/s")]).outcome).toMatchObject({
      missing: true,
      detail: "1 of 1 solvers agree; 2 are needed",
    });
    expect(checkBlindSolves(cart, undefined as never).outcome.missing).toBe(true);
  });

  test("disagreement fails unless those who agree are two or more and the majority", () => {
    const one = checkBlindSolves(cart, [solve("a", "3.0 m/s")]);
    expect(one.outcome.pass).toBe(false);
    expect(one.outcome.missing).toBeUndefined();
    expect(one.outcome.detail).toMatch(/0 of 1 solvers agree: a answered "3.0 m\/s"/);
    expect(
      checkBlindSolves(cart, [solve("a", "2.0 m/s"), solve("b", "3.0 m/s")]).outcome.missing,
    ).toBeUndefined();
    expect(
      checkBlindSolves(cart, [solve("a", "2.0 m/s"), solve("b", "3.0 m/s")]).outcome.pass,
    ).toBe(false);
    const split = [
      solve("a", "2.0 m/s"),
      solve("b", "2.0 m/s"),
      solve("c", "3 m/s"),
      solve("d", "9 m/s"),
    ];
    expect(checkBlindSolves(cart, split).outcome.pass).toBe(false);
    expect(checkBlindSolves(cart, split.slice(0, 3)).outcome).toEqual({
      pass: true,
      detail: "2 of 3 solvers agree",
    });
    // Half credit (number right, unit missing) is not agreement.
    expect(checkBlindSolves(cart, [solve("a", "2.0"), solve("b", "2.0 m/s")]).outcome.pass).toBe(
      false,
    );
  });

  test("one answer per solver, the last one", () => {
    const again = checkBlindSolves(cart, [
      solve("a", "3.0 m/s"),
      solve("a", "2.0 m/s"),
      solve("b", "2.0 m/s"),
    ]);
    expect(again.outcome.pass).toBe(true);
    expect(again.solvers).toHaveLength(2);
    expect(
      checkBlindSolves(cart, [solve("a", "2.0 m/s"), solve("a", "2.0 m/s")]).outcome.missing,
    ).toBe(true);
  });

  test("answers for another version of the text do not count", () => {
    const hash = contentHash(cart);
    const r = checkBlindSolves(cart, [solve("a", "2.0 m/s", hash), solve("b", "2.0 m/s", "old")]);
    expect(r.outcome).toMatchObject({ missing: true });
    expect(r.outcome.detail).toMatch(/1 answered an earlier version of the text/);
    expect(r.solvers).toHaveLength(1);
    expect(
      checkBlindSolves(cart, [solve("a", "2.0 m/s", hash), solve("b", "2.0 m/s", hash)]).outcome
        .pass,
    ).toBe(true);
  });

  test("multiple choice compares option text; malformed entries are ignored", () => {
    const ok = checkBlindSolves(truck, [
      solve("a", "They are equal in size"),
      solve("b", "they are equal in size"),
    ]);
    expect(ok.outcome.pass).toBe(true);
    expect(
      checkBlindSolves(truck, [
        solve("a", "The truck's force is larger"),
        solve("b", "They are equal in size"),
      ]).outcome.pass,
    ).toBe(false);
    const junk = [null, { id: 1, answer: "x" }, { id: "a" }] as never;
    expect(checkBlindSolves(truck, junk).solvers).toEqual([]);
    // No valid key to grade against: nobody agrees, and nothing throws.
    expect(checkBlindSolves(withKey("fast"), [solve("a", "2.0 m/s")]).solvers[0].agrees).toBe(
      false,
    );
  });
});

describe("near-duplicate", () => {
  const draft = (id: string, problem: DraftProblem) => ({ id, apTopic: problem.apTopic, problem });
  const twinText =
    "A 4.0 kg cart moving at 5.0 m/s collides with and sticks to a 6.0 kg cart at rest. Find their final speed.";
  const twinSpec: ProblemSpec = {
    givens: {
      a: { value: 4.0, unit: "kg" },
      u: { value: 5.0, unit: "m/s" },
      b: { value: 6.0, unit: "kg" },
    },
    expr: "a*u/(a + b)",
    unit: "m/s",
  };

  test("the same calculation in the same words with other numbers is a duplicate", () => {
    const twin = draft("twin", { ...cart, text: twinText, spec: twinSpec });
    expect(textSimilarity(cart.text, twinText)).toBe(1);
    const r = checkNearDuplicate(draft("me", cart), [twin, draft("other", truck)]);
    expect(r.pass).toBe(false);
    expect(r.detail).toBe("Near-duplicate of twin (100% the same words, same calculation)");
  });

  test("the same calculation in other words, or other words and another calculation, is not", () => {
    const reworded = draft("r", {
      ...cart,
      text: "Two railway wagons couple together. The first, of mass 4.0 kg, rolls at 5.0 m/s toward the second, of mass 6.0 kg, which is parked. How fast do they roll afterwards?",
      spec: twinSpec,
    });
    expect(checkNearDuplicate(draft("me", cart), [reworded])).toEqual({ pass: true });
    // Mostly the same words but asking for something else (another spec shape): below the text-only bar.
    const energy = draft("e", {
      ...cart,
      text: "A 4.0 kg cart moving at 5.0 m/s collides with and sticks to a 6.0 kg cart at rest. Find the energy lost.",
      spec: { ...twinSpec, expr: "a*u^2/2 - (a*u)^2/(2*(a + b))", unit: "J" },
    });
    const similarity = textSimilarity(cart.text, energy.problem.text);
    expect(similarity).toBeGreaterThan(0.6);
    expect(similarity).toBeLessThan(0.85);
    expect(checkNearDuplicate(draft("me", cart), [energy])).toEqual({ pass: true });
    // With the same shape that similarity is enough.
    expect(
      checkNearDuplicate(draft("me", cart), [
        { ...energy, problem: { ...energy.problem, spec: twinSpec } },
      ]).pass,
    ).toBe(false);
  });

  test("word for word the same is a duplicate with or without specs", () => {
    const copy = draft("copy", { ...truck });
    expect(checkNearDuplicate(draft("me", truck), [copy]).detail).toBe(
      "Near-duplicate of copy (100% the same words)",
    );
    expect(
      checkNearDuplicate(draft("me", { ...cart, spec: undefined }), [
        draft("t", { ...cart, text: twinText }),
      ]).pass,
    ).toBe(false);
  });

  test("a draft is not its own duplicate; empty texts and missing problems are skipped", () => {
    const me = draft("me", cart);
    expect(checkNearDuplicate(me, [me, draft("me", cart)])).toEqual({ pass: true });
    expect(checkNearDuplicate(me, [{ id: "x", problem: null }])).toEqual({ pass: true });
    expect(checkNearDuplicate({ id: "x", problem: null }, [me])).toEqual({ pass: true });
    expect(checkNearDuplicate({ problem: cart }, [{ problem: { ...cart } }]).detail).toMatch(
      /another problem/,
    );
    expect(textSimilarity("", cart.text)).toBe(0);
    expect(textSimilarity("one two", "one two")).toBe(0);
    expect(textSimilarity("a b c d", "a b c e")).toBeCloseTo(1 / 3, 12);
  });
});

describe("not-stale and verificationIsCurrent", () => {
  const solvers = [
    { id: "a", answer: "2.0 m/s", agrees: true },
    { id: "b", answer: "2.0 m/s", agrees: true },
  ];
  const record = (problem: DraftProblem) => ({
    textHash: contentHash(problem),
    checks: { recompute: { pass: true }, basis: { pass: true, detail: "spec" } },
    solvers,
    verifiedAt: "2026-11-21T00:00:00.000Z",
  });

  test("a stored verification must be for the problem as it is now", () => {
    expect(checkNotStale({ problem: cart })).toEqual({ pass: true });
    expect(checkNotStale({ problem: null, verification: record(cart) })).toEqual({ pass: true });
    expect(checkNotStale({ problem: cart, verification: record(cart) })).toEqual({ pass: true });
    const edited = { ...cart, text: cart.text.replace("3.0 m/s", "4.0 m/s") };
    const r = checkNotStale({ problem: edited, verification: record(cart) });
    expect(r.pass).toBe(false);
    expect(r.missing).toBeUndefined();
    expect(r.detail).toMatch(/changed after it was verified/);
  });

  test("verificationIsCurrent: hash, every check passed, and two agreeing solvers", () => {
    const good = { problem: cart, verification: record(cart) };
    expect(verificationIsCurrent(good)).toBe(true);
    expect(verificationIsCurrent({ problem: cart })).toBe(false);
    expect(verificationIsCurrent({ problem: cart, verification: null })).toBe(false);
    expect(verificationIsCurrent({ problem: null, verification: record(cart) })).toBe(false);
    expect(verificationIsCurrent({ problem: cart, verification: "yes" as never })).toBe(false);
    expect(verificationIsCurrent({ problem: withKey("3.0 m/s"), verification: record(cart) })).toBe(
      false,
    );
    expect(
      verificationIsCurrent({ problem: { ...cart, spec: undefined }, verification: record(cart) }),
    ).toBe(false);
    // Edits to what the hash leaves out do not unverify.
    expect(
      verificationIsCurrent({
        problem: { ...cart, solution: "Reworded." },
        verification: record(cart),
      }),
    ).toBe(true);
    const with_ = (patch: object) => ({
      problem: cart,
      verification: { ...record(cart), ...patch } as never,
    });
    expect(verificationIsCurrent(with_({ textHash: 5 }))).toBe(false);
    expect(verificationIsCurrent(with_({ checks: {} }))).toBe(false);
    expect(verificationIsCurrent(with_({ checks: undefined }))).toBe(false);
    expect(verificationIsCurrent(with_({ checks: { recompute: { pass: false } } }))).toBe(false);
    expect(verificationIsCurrent(with_({ checks: { recompute: { pass: "true" } } }))).toBe(false);
    expect(verificationIsCurrent(with_({ checks: { recompute: null } }))).toBe(false);
    expect(verificationIsCurrent(with_({ solvers: solvers.slice(0, 1) }))).toBe(false);
    expect(verificationIsCurrent(with_({ solvers: undefined }))).toBe(false);
    expect(
      verificationIsCurrent(with_({ solvers: [solvers[0], { ...solvers[1], agrees: false }] })),
    ).toBe(false);
    expect(verificationIsCurrent(with_({ solvers: [solvers[0], null, solvers[1]] }))).toBe(true);
  });
});

describe("verifyProblem", () => {
  const agree = [
    { id: "a", answer: "2.0 m/s" },
    { id: "b", answer: "2.0 m/s" },
  ];
  const now = "2026-11-21T12:00:00.000Z";

  test("verified: every check passed; the record holds hash, checks, solvers and time", () => {
    const r = verifyProblem({ id: "d1", apTopic: "4.3", problem: cart }, agree, { now });
    expect(r.verdict).toBe("verified");
    expect(r.failed).toEqual([]);
    expect(r.missing).toEqual([]);
    expect(r.verification).toEqual({
      textHash: contentHash(cart),
      checks: {
        recompute: { pass: true, detail: "spec gives 2 m/s" },
        "spec-matches-text": { pass: true },
        "solution-consistent": { pass: true },
        "grader-round-trip": { pass: true },
        "near-duplicate": { pass: true },
        "blind-solves": { pass: true, detail: "2 of 2 solvers agree" },
        "not-stale": { pass: true },
        basis: { pass: true, detail: "spec" },
      },
      solvers: [
        { id: "a", answer: "2.0 m/s", agrees: true },
        { id: "b", answer: "2.0 m/s", agrees: true },
      ],
      verifiedAt: now,
    });
    expect(verificationIsCurrent({ problem: cart, verification: r.verification })).toBe(true);
    expect(
      Date.parse(verifyProblem({ apTopic: "4.3", problem: cart }).verification.verifiedAt),
    ).not.toBeNaN();
  });

  test("incomplete: nothing wrong, but no spec or too few solvers", () => {
    const noSolvers = verifyProblem({ apTopic: "4.3", problem: cart });
    expect(noSolvers).toMatchObject({
      verdict: "incomplete",
      failed: [],
      missing: ["blind-solves"],
    });
    expect(noSolvers.verification.checks["blind-solves"]).toEqual({
      pass: false,
      detail: "0 of 0 solvers agree; 2 are needed",
    });
    const noSpec = verifyProblem({ apTopic: "4.3", problem: { ...cart, spec: undefined } }, agree);
    expect(noSpec).toMatchObject({ verdict: "incomplete", missing: ["recompute"] });
    expect(noSpec.verification.checks["spec-matches-text"]).toBeUndefined();
    expect(verificationIsCurrent({ problem: cart, verification: noSolvers.verification })).toBe(
      false,
    );
  });

  test("failed: a wrong key fails even with solvers missing, and a failure outranks missing evidence", () => {
    const wrong = verifyProblem({
      apTopic: "4.3",
      problem: withKey("3.0 m/s", { distractors: [] }),
    });
    expect(wrong.verdict).toBe("failed");
    // The wrong key's number happens to be in the solution (the 3.0 m/s of the text), so only recompute sees it.
    expect(wrong.failed).toEqual(["recompute"]);
    expect(wrong.missing).toEqual(["blind-solves"]);
    const solversDisagree = verifyProblem({ apTopic: "4.3", problem: cart }, [
      { id: "a", answer: "9 m/s" },
    ]);
    expect(solversDisagree).toMatchObject({ verdict: "failed", failed: ["blind-solves"] });
  });

  test("multiple choice without a spec rests on the solvers alone and says so", () => {
    const solvers = [
      { id: "a", answer: "They are equal in size" },
      { id: "b", answer: "They are equal in size" },
    ];
    const r = verifyProblem({ apTopic: "2.3", problem: truck }, solvers, { now });
    expect(r.verdict).toBe("verified");
    expect(r.verification.checks.basis).toEqual({ pass: true, detail: "solver-agreement-only" });
    expect(Object.keys(r.verification.checks)).toEqual([
      "solution-consistent",
      "grader-round-trip",
      "near-duplicate",
      "blind-solves",
      "not-stale",
      "basis",
    ]);
    expect(verifyProblem({ apTopic: "2.3", problem: truck }).verdict).toBe("incomplete");
  });

  test("multiple choice with a spec is checked by it", () => {
    const solvers = [
      { id: "a", answer: "3.0 m/s^2" },
      { id: "b", answer: "3.0 m/s^2" },
    ];
    const r = verifyProblem({ apTopic: "2.3", problem: ramp }, solvers);
    expect(r.verdict).toBe("verified");
    expect(r.verification.checks.basis.detail).toBe("spec");
    expect(r.verification.checks["mc-quantity"].pass).toBe(true);
    expect(r.verification.checks.recompute).toBeUndefined();
    // Two solvers agreeing with a wrong key do not outvote the spec.
    const wrong = { ...ramp, correctAnswer: "48 m/s^2" };
    const fooled = [
      { id: "a", answer: "48 m/s^2" },
      { id: "b", answer: "48 m/s^2" },
    ];
    expect(verifyProblem({ apTopic: "2.3", problem: wrong }, fooled)).toMatchObject({
      verdict: "failed",
      failed: ["mc-quantity", "solution-consistent"],
    });
  });

  test("stale stamps, duplicates in the set, the draft's course, and a draft with no problem", () => {
    const stamped = verifyProblem({ apTopic: "4.3", problem: cart }, agree).verification;
    const edited = { ...cart, solution: cart.solution + " Checked." };
    expect(
      verifyProblem({ apTopic: "4.3", problem: edited, verification: stamped }, agree).verdict,
    ).toBe("verified");
    const changed = withKey("2.00 m/s");
    expect(
      verifyProblem({ apTopic: "4.3", problem: changed, verification: stamped }, agree),
    ).toMatchObject({
      verdict: "failed",
      failed: ["not-stale"],
    });
    const twin = { id: "twin", apTopic: "4.3", problem: { ...cart } };
    expect(
      verifyProblem({ id: "me", apTopic: "4.3", problem: cart }, agree, { siblings: [twin] }),
    ).toMatchObject({ verdict: "failed", failed: ["near-duplicate"] });
    expect(verifyProblem({ apTopic: "9.1", problem: cart }, agree).failed).toEqual([
      "grader-round-trip",
    ]);
    expect(
      verifyProblem({ apTopic: "9.1", course: "physics-2", problem: cart }, agree).verdict,
    ).toBe("verified");
    // The draft's own topic is used when the wrapper has none.
    expect(verifyProblem({ problem: cart }, agree).verdict).toBe("verified");
    const empty = verifyProblem({ apTopic: "4.3", problem: null }, agree);
    expect(empty).toMatchObject({ verdict: "failed", failed: ["grader-round-trip"] });
    expect(empty.verification).toMatchObject({ textHash: "", solvers: [] });
    expect(deterministicChecks({ problem: undefined })).toEqual({
      "grader-round-trip": { pass: false, detail: "The draft has no problem" },
    });
  });
});

describe("blind solve sheets", () => {
  const draft = { id: "d2", apTopic: "2.3", problem: truck };

  test("options are shuffled per solver and problem, the same way every time", () => {
    const a = shuffledOptions(truck.options!, "solver-a", "d2");
    expect(a).toEqual(shuffledOptions(truck.options!, "solver-a", "d2"));
    expect([...a].sort()).toEqual([...truck.options!].sort());
    const orders = new Set(
      ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"].map((s) =>
        shuffledOptions(truck.options!, s, "d2").join("|"),
      ),
    );
    expect(orders.size).toBeGreaterThan(2);
    expect(shuffledOptions(truck.options!, "solver-a", "d9")).not.toEqual(
      shuffledOptions(truck.options!, "solver-a", "d1"),
    );
  });

  test("a sheet entry has the question and nothing that gives the answer away", () => {
    const entry = solveSheetEntry(draft, "solver-a");
    expect(entry).toEqual({
      id: "d2",
      type: "multiple-choice",
      text: truck.text,
      options: shuffledOptions(truck.options!, "solver-a", "d2"),
      textHash: contentHash(truck),
    });
    const numeric = solveSheetEntry({ id: "d1", apTopic: "4.3", problem: cart }, "solver-a");
    expect(Object.keys(numeric)).toEqual(["id", "type", "text", "textHash"]);
    expect(JSON.stringify(numeric)).not.toMatch(/2\.0 m\/s"|Momentum|spec/);
  });

  test("a letter is read against that solver's order; option text is kept", () => {
    const shown = shuffledOptions(truck.options!, "solver-a", "d2");
    expect(resolveSolverAnswer(draft, "solver-a", "A")).toBe(shown[0]);
    expect(resolveSolverAnswer(draft, "solver-a", "d")).toBe(shown[3]);
    expect(resolveSolverAnswer(draft, "solver-a", "(B)")).toBe(shown[1]);
    expect(resolveSolverAnswer(draft, "solver-a", `C. ${shown[2]}`)).toBe(shown[2]);
    expect(resolveSolverAnswer(draft, "solver-a", `C) ${shown[2].toUpperCase()}`)).toBe(shown[2]);
    // "C. <the text of another option>": the solver was not reading this sheet.
    expect(resolveSolverAnswer(draft, "solver-a", `C. ${shown[0]}`)).toBeUndefined();
    expect(resolveSolverAnswer(draft, "solver-a", " they are EQUAL in size ")).toBe(
      "They are equal in size",
    );
    expect(resolveSolverAnswer(draft, "solver-a", "E")).toBeUndefined();
    expect(resolveSolverAnswer(draft, "solver-a", "Neither")).toBeUndefined();
    expect(resolveSolverAnswer(draft, "solver-a", "")).toBeUndefined();
    expect(resolveSolverAnswer({ id: "d1", apTopic: "4.3", problem: cart }, "s", " 2.0 m/s ")).toBe(
      "2.0 m/s",
    );
    expect(
      resolveSolverAnswer({ id: "d1", apTopic: "4.3", problem: cart }, "s", ""),
    ).toBeUndefined();
    expect(
      resolveSolverAnswer({ id: "d1", apTopic: "4.3", problem: cart }, "s", null as never),
    ).toBeUndefined();
  });
});
