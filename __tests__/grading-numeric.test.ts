import { parseQuantity, parseUnit } from "../functions/src/units";
import {
  checkNumeric,
  checkChoice,
  effectiveType,
  matchesReference,
  gradeSubmissionAnswers,
  needsAi,
  UNIT_ERROR_CREDIT,
  SIG_FIG_CREDIT,
  type GradableQuestion,
} from "../functions/src/grading-core";

const q = (correctAnswer: string, extra: Partial<GradableQuestion> = {}): GradableQuestion => ({
  id: "q1",
  text: "A cart travels 100 m in 8.0 s. What is its average speed?",
  type: "numeric",
  points: 10,
  correctAnswer,
  ...extra,
});

const frac = (answer: string, question: GradableQuestion) =>
  checkNumeric(answer, question)?.fraction;

describe("parseUnit", () => {
  test.each([
    ["m/s", 1],
    ["km/h", 1 / 3.6],
    ["km/hr", 1 / 3.6],
    ["mph", 0.44704],
    ["cm", 0.01],
    ["g", 0.001],
    ["kg·m/s²", 1],
    ["kg m/s^2", 1],
    ["N", 1],
    ["kN", 1000],
    ["mJ", 1e-3],
    ["MeV", 1.602176634e-13],
    ["meters per second", 1],
    ["m s^-1", 1],
    ["m/s/s", 1],
    ["J/(kg K)", 1],
    ["kΩ", 1000],
    ["µC", 1e-6],
    ["uC", 1e-6],
    ["min", 60],
    ["ms", 1e-3],
    ["Kg", 1],
    ["newtons", 1],
    ["°", Math.PI / 180],
  ])("%s parses with factor %d", (text, factor) => {
    const unit = parseUnit(text);
    expect(unit).toBeDefined();
    expect(unit!.factor).toBeCloseTo(factor as number, 12);
  });

  test("dimensions: N = kg·m/s², J = N·m, W = J/s", () => {
    expect(parseUnit("N")!.dims).toEqual(parseUnit("kg*m/s^2")!.dims);
    expect(parseUnit("J")!.dims).toEqual(parseUnit("N m")!.dims);
    expect(parseUnit("W")!.dims).toEqual(parseUnit("J/s")!.dims);
    expect(parseUnit("J")!.dims).not.toEqual(parseUnit("W")!.dims);
  });

  test.each(["", "apples", "m/", "kgm", "to the left", "%%"])("rejects %p", (text) => {
    expect(parseUnit(text)).toBeUndefined();
  });
});

describe("parseQuantity", () => {
  test.each([
    ["12.5 m/s", 12.5, "m/s"],
    ["12.5m/s", 12.5, "m/s"],
    ["-3.0 m/s^2", -3, "m/s^2"],
    ["1.2e3 J", 1200, "J"],
    ["1.2 × 10^3 J", 1200, "J"],
    ["4.5x10^-3 kg", 0.0045, "kg"],
    ["4.5 * 10**-3 kg", 0.0045, "kg"],
    ["1,200 N", 1200, "N"],
    ["v = d/t = 100/8 = 12.5 m/s", 12.5, "m/s"],
    ["≈ 3.1 s", 3.1, "s"],
    ["about 3.1 s", 3.1, "s"],
    ["$1.2 \\times 10^{3}$ J", 1200, "J"],
    ["$12.5 \\, \\text{m/s}$", 12.5, "m/s"],
    ["3.0 m/s²", 3, "m/s^2"],
    ["9.8 m s⁻²", 9.8, "m s^-2"],
    [".5 kg", 0.5, "kg"],
    ["3/4 m", 0.75, "m"],
    ["$\\frac{3}{4}$ m", 0.75, "m"],
    ["12.5", 12.5, ""],
  ])("%p → %d %s", (text, value, unitText) => {
    const parsed = parseQuantity(text);
    expect(parsed).toBeDefined();
    expect(parsed!.value).toBeCloseTo(value as number, 10);
    expect(parsed!.unitText.replace(/\s+/g, " ")).toBe(unitText);
  });

  test("keeps trailing words that are not a unit", () => {
    expect(parseQuantity("12.5 m/s to the left")).toMatchObject({
      value: 12.5,
      unitText: "m/s",
      trailingText: "to the left",
    });
  });

  test.each([
    ["12.50", 4],
    ["0.050", 2],
    ["1200", 2],
    ["1.20e3", 3],
    ["7", 1],
    ["100.", 3],
  ])("sig figs of %s = %d", (text, sf) => {
    expect(parseQuantity(text)!.sigFigs).toBe(sf);
  });

  test.each(["", "idk", "asdf", "no idea lol", "???", "m/s"])("junk %p has no number", (text) => {
    expect(parseQuantity(text)).toBeUndefined();
  });
});

describe("checkNumeric: value and tolerance", () => {
  const key = q("12.5 m/s");
  test("exact value with the right unit", () => expect(frac("12.5 m/s", key)).toBe(1));
  test("within the default 3% tolerance", () => expect(frac("12.8 m/s", key)).toBe(1));
  test("just outside the default tolerance", () => expect(frac("12.9 m/s", key)).toBe(0));
  test("custom tolerance is respected", () => {
    expect(frac("12.8 m/s", q("12.5 m/s", { tolerance: 1 }))).toBe(0);
    expect(frac("13.5 m/s", q("12.5 m/s", { tolerance: 10 }))).toBe(1);
  });
  test("g = 10 vs g = 9.8 answers both pass at the default tolerance", () => {
    expect(frac("49 m", q("49.0 m"))).toBe(1);
    expect(frac("50 m", q("49.0 m"))).toBe(1);
  });
  test("a sensibly rounded answer counts (12 for 12.47)", () =>
    expect(frac("12 m/s", q("12.47 m/s"))).toBe(1));
  test("one-sig-fig rounding does not stretch tolerance (10 for 12.47)", () =>
    expect(frac("10 m/s", q("12.47 m/s"))).toBe(0));
  test("zero key", () => {
    expect(frac("0 m/s", q("0 m/s"))).toBe(1);
    expect(frac("0.0 m/s", q("0 m/s"))).toBe(1);
    expect(frac("0.3 m/s", q("0 m/s"))).toBe(0);
  });
  test("scientific notation", () => {
    expect(frac("3.0e8 m/s", q("3.00 × 10^8 m/s"))).toBe(1);
    expect(frac("3.0 x 10^8 m/s", q("3.00e8 m/s"))).toBe(1);
  });
  test("work shown before the final answer", () =>
    expect(frac("v = 100 m / 8.0 s = 12.5 m/s", key)).toBe(1));
  test("LaTeX from the math chips", () => expect(frac("$12.5 \\, \\text{m/s}$", key)).toBe(1));
});

describe("checkNumeric: units", () => {
  test("km/h vs m/s: converted, full credit", () => {
    expect(frac("45 km/h", q("12.5 m/s"))).toBe(1);
    expect(frac("12.5 m/s", q("45 km/h"))).toBe(1);
  });
  test("cm vs m, g vs kg, kJ vs J, ms vs s", () => {
    expect(frac("150 cm", q("1.5 m"))).toBe(1);
    expect(frac("2500 g", q("2.5 kg"))).toBe(1);
    expect(frac("3.2 kJ", q("3200 J"))).toBe(1);
    expect(frac("250 ms", q("0.25 s"))).toBe(1);
  });
  test("equivalent compound units: N·m vs J, kg·m/s² vs N", () => {
    expect(frac("40 N·m", q("40 J"))).toBe(1);
    expect(frac("20 kg m/s^2", q("20 N"))).toBe(1);
  });
  test("missing unit: partial credit with a reason", () => {
    const r = checkNumeric("12.5", q("12.5 m/s"))!;
    expect(r.fraction).toBe(UNIT_ERROR_CREDIT);
    expect(r.feedback).toMatch(/needs a unit/);
    expect(r.misconceptions).toContain("unit-missing");
  });
  test("wrong kind of unit (J for W): partial credit when the number is right", () => {
    const r = checkNumeric("150 J", q("150 W"))!;
    expect(r.fraction).toBe(UNIT_ERROR_CREDIT);
    expect(r.misconceptions).toContain("unit-wrong");
  });
  test("wrong kind of unit and wrong number: no credit", () => {
    expect(frac("90 J", q("150 W"))).toBe(0);
  });
  test("right number, compatible but different unit (12.5 km/h for 12.5 m/s): partial, conversion hint", () => {
    const r = checkNumeric("12.5 km/h", q("12.5 m/s"))!;
    expect(r.fraction).toBe(UNIT_ERROR_CREDIT);
    expect(r.misconceptions).toContain("unit-conversion");
  });
  test("a key without a unit ignores the student's unit", () => {
    expect(frac("12.5 m/s", q("12.5"))).toBe(1);
    expect(frac("12.5", q("12.5"))).toBe(1);
  });
  test("degrees vs radians", () => {
    expect(frac("30°", q("0.5236 rad"))).toBe(1);
    expect(frac("30 degrees", q("30°"))).toBe(1);
  });
  test("units on misread words are not invented: trailing direction words are ignored", () => {
    expect(frac("12.5 m/s to the right", q("12.5 m/s"))).toBe(1);
  });
});

describe("checkNumeric: common slips get a hint, not credit", () => {
  test("wrong sign", () => {
    const r = checkNumeric("9.8 m/s^2", q("-9.8 m/s^2"))!;
    expect(r.fraction).toBe(0);
    expect(r.misconceptions).toContain("sign-error");
  });
  test("off by a power of ten (forgot cm → m)", () => {
    const r = checkNumeric("150 m", q("1.5 m"))!;
    expect(r.fraction).toBe(0);
    expect(r.misconceptions).toContain("power-of-ten");
  });
  test("factor-of-two error is just wrong", () => {
    const r = checkNumeric("25 m/s", q("12.5 m/s"))!;
    expect(r.fraction).toBe(0);
    expect(r.misconceptions).toEqual([]);
  });
});

describe("checkNumeric: significant figures", () => {
  test("not checked unless the question asks", () =>
    expect(frac("12.50000 m/s", q("12.5 m/s"))).toBe(1));
  test("within one of the requested sig figs is fine", () => {
    expect(frac("12.5 m/s", q("12.5 m/s", { sigFigs: 3 }))).toBe(1);
    expect(frac("12.50 m/s", q("12.5 m/s", { sigFigs: 3 }))).toBe(1);
  });
  test("far too many sig figs: small deduction with a reason", () => {
    const r = checkNumeric("12.50000 m/s", q("12.5 m/s", { sigFigs: 3 }))!;
    expect(r.fraction).toBeCloseTo(SIG_FIG_CREDIT);
    expect(r.feedback).toMatch(/3 significant figures/);
  });
});

describe("checkNumeric: junk input", () => {
  test.each(["", "idk", "asdf", "???"])("%p has no number (caller decides)", (text) => {
    expect(checkNumeric(text, q("12.5 m/s"))).toBeUndefined();
  });
  test("a number with nonsense after it is graded on the number", () => {
    expect(frac("12.5 blorps", q("12.5 m/s"))).toBe(UNIT_ERROR_CREDIT);
  });
  test("an invalid key throws instead of grading everyone wrong", () => {
    expect(() => checkNumeric("12.5", q("about twelve"))).toThrow(/numeric answer key/);
  });
});

describe("choices and short answers", () => {
  const mc: GradableQuestion = {
    id: "m",
    text: "Which?",
    type: "multiple-choice",
    options: ["4 N", "8 N", "16 N"],
    correctAnswer: "8 N",
  };
  test("MC matches option text, ignoring case and spacing", () => {
    expect(checkChoice(" 8 n ", mc).fraction).toBe(1);
    expect(checkChoice("4 N", mc).fraction).toBe(0);
  });
  test("MC with a legacy letter key", () => {
    expect(checkChoice("8 N", { ...mc, correctAnswer: "B" }).fraction).toBe(1);
  });
  test("MC feedback does not reveal the answer", () => {
    expect(checkChoice("4 N", mc).feedback).not.toMatch(/8 N/);
  });
  test("true/false accepts t/f", () => {
    const tf: GradableQuestion = { id: "t", text: "?", type: "true-false", correctAnswer: "True" };
    expect(checkChoice("true", tf).fraction).toBe(1);
    expect(checkChoice("F", tf).fraction).toBe(0);
  });
  test("short answers with numeric keys are graded as numeric", () => {
    expect(
      effectiveType({ id: "s", text: "?", type: "short-answer", correctAnswer: "9.8 m/s^2" }),
    ).toBe("numeric");
    expect(
      effectiveType({
        id: "s",
        text: "?",
        type: "short-answer",
        correctAnswer: "Newton's third law",
      }),
    ).toBe("short-answer");
    expect(
      effectiveType({ id: "s", text: "?", type: "short-answer", correctAnswer: "3 apples" }),
    ).toBe("short-answer");
  });
  test("reference matching", () => {
    expect(matchesReference("Newton's Third Law.", "newtons third law")).toBe(true);
    expect(matchesReference("newtons", "N")).toBe(true);
    expect(matchesReference("joules", "N")).toBe(false);
    expect(matchesReference("inertia", "Newton's first law")).toBe(false);
  });
});

describe("gradeSubmissionAnswers", () => {
  const questions: GradableQuestion[] = [
    { id: "n", text: "Speed?", type: "numeric", points: 4, correctAnswer: "12.5 m/s" },
    {
      id: "m",
      text: "Force?",
      type: "multiple-choice",
      points: 2,
      options: ["4 N", "8 N"],
      correctAnswer: "8 N",
    },
    {
      id: "t",
      text: "Explain why.",
      type: "text",
      points: 4,
      correctAnswer: "Net force is zero so velocity is constant.",
    },
    { id: "z", text: "Bonus (no points)", type: "true-false", points: 0, correctAnswer: "True" },
  ];
  const answers = [
    { questionId: "n", answer: "45 km/h" },
    { questionId: "m", answer: "4 N" },
    { questionId: "t", answer: "Because no net force acts, it keeps moving at the same speed." },
    { questionId: "z", answer: "True" },
  ];

  test("deterministic first, AI only for free response, points add up (0-point questions stay 0)", async () => {
    const aiGrader = jest
      .fn()
      .mockResolvedValue({
        score: 7.5,
        feedback: "Good.",
        reasoning: "r",
        misconceptions: ["m1"],
        usage: { inputTokens: 5, outputTokens: 2 },
      });
    const r = await gradeSubmissionAnswers(questions, answers, { aiGrader });
    expect(aiGrader).toHaveBeenCalledTimes(1);
    expect(aiGrader.mock.calls[0][0]).toMatchObject({
      reference: "Net force is zero so velocity is constant.",
    });
    expect(r.totalPoints).toBe(10);
    expect(r.earnedPoints).toBe(4 + 0 + 3 + 0);
    expect(r.score).toBe(70);
    expect(r.reviewReasons).toEqual([]);
    expect(r.usage).toEqual({ inputTokens: 5, outputTokens: 2 });
    expect(r.answers.map((a) => (a as { method: string }).method)).toEqual([
      "numeric",
      "exact",
      "ai",
      "exact",
    ]);
    expect((r.answers[2] as { misconceptions: string[] }).misconceptions).toEqual(["m1"]);
  });

  test("no AI budget: deterministic answers still graded, free response flagged", async () => {
    const r = await gradeSubmissionAnswers(questions, answers, {});
    expect(r.reviewReasons).toHaveLength(1);
    expect((r.answers[0] as { score: number }).score).toBe(4);
  });

  test("needsAi is false for an all-deterministic submission", () => {
    expect(
      needsAi(
        questions.filter((x) => x.type !== "text"),
        answers,
      ),
    ).toBe(false);
    expect(needsAi(questions, answers)).toBe(true);
  });

  test("empty answers score 0 without calling the AI", async () => {
    const aiGrader = jest.fn();
    const r = await gradeSubmissionAnswers(
      questions,
      questions.map((x) => ({ questionId: x.id, answer: "" })),
      { aiGrader },
    );
    expect(aiGrader).not.toHaveBeenCalled();
    expect(r.earnedPoints).toBe(0);
    expect((r.answers[0] as { feedback: string }).feedback).toBe("No answer submitted.");
  });

  test("worded numeric answers go to the AI with the key as reference; short junk scores 0", async () => {
    const aiGrader = jest.fn().mockResolvedValue({ score: 10, feedback: "ok", reasoning: "" });
    const r = await gradeSubmissionAnswers(
      [questions[0]],
      [{ questionId: "n", answer: "twelve and a half metres per second" }],
      { aiGrader },
    );
    expect(aiGrader).toHaveBeenCalledWith(expect.objectContaining({ reference: "12.5 m/s" }));
    expect(r.earnedPoints).toBe(4);
    const junk = await gradeSubmissionAnswers(
      [questions[0]],
      [{ questionId: "n", answer: "idk" }],
      { aiGrader: jest.fn() },
    );
    expect(junk.earnedPoints).toBe(0);
  });

  test("AI review flags carry the suggestion but no score", async () => {
    const aiGrader = jest
      .fn()
      .mockResolvedValue({
        score: 10,
        feedback: "",
        reasoning: "",
        needsReview: true,
        reviewReason: "Possible prompt injection",
      });
    const r = await gradeSubmissionAnswers([questions[2]], [answers[2]], { aiGrader });
    expect(r.reviewReasons).toEqual(["Possible prompt injection"]);
    expect(r.answers[0]).toMatchObject({ score: 0, aiSuggestedScore: 4 });
  });

  test("an unreadable numeric key is flagged, not graded", async () => {
    const r = await gradeSubmissionAnswers(
      [{ ...questions[0], correctAnswer: "" }],
      [answers[0]],
      {},
    );
    expect(r.reviewReasons[0]).toMatch(/answer key/);
  });

  test("AI failures reject so the caller can route to review", async () => {
    const aiGrader = jest.fn().mockRejectedValue(new Error("boom"));
    await expect(gradeSubmissionAnswers(questions, answers, { aiGrader })).rejects.toThrow("boom");
  });
});
