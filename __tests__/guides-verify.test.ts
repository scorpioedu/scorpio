// The guide schema and verifier (src/lib/guides), on small made-up guides: a valid one passes and
// each kind of mistake is named.
import { topicGuideSchema, unitGuideSchema, workedExampleSchema } from "../src/lib/guides/schema";
import {
  answerNumbers,
  checkWorkedExample,
  countWords,
  diagramBlocks,
  guideCoverage,
  latexError,
  latexSymbols,
  mathSpans,
  unexplainedSymbols,
  verifyUnitGuide,
  WORD_BOUNDS,
} from "../src/lib/guides/verify";
import { requiresDerivation } from "../src/lib/guides";
import { apUnit } from "../src/data/ap";
import { referenceEvaluator, topicFixture, unitFixture } from "../tests/helpers/guide-fixture";

const errorsOf = (change: Parameters<typeof unitFixture>[0]) =>
  verifyUnitGuide(unitFixture(change)).errors;

describe("guide schema", () => {
  test("accepts the fixture", () => {
    expect(unitGuideSchema.safeParse(unitFixture()).success).toBe(true);
  });

  test("refuses unknown fields, so a typo in a field name is not silently dropped", () => {
    const g = { ...topicFixture("4.1"), bigidea: "typo" };
    expect(topicGuideSchema.safeParse(g).success).toBe(false);
  });

  test("needs exactly two worked examples and three check-yourself questions", () => {
    const g = topicFixture("4.1");
    expect(
      topicGuideSchema.safeParse({ ...g, workedExamples: g.workedExamples.slice(0, 1) }).success,
    ).toBe(false);
    expect(
      topicGuideSchema.safeParse({ ...g, checkYourself: g.checkYourself.slice(0, 2) }).success,
    ).toBe(false);
  });

  test("a numeric worked example must carry a spec; a conceptual one need not", () => {
    const [numeric, conceptual] = topicFixture("4.1").workedExamples;
    expect(workedExampleSchema.safeParse({ ...numeric, spec: undefined }).success).toBe(false);
    expect(workedExampleSchema.safeParse(conceptual).success).toBe(true);
  });

  test("a try-it parameter's default sits between its ends", () => {
    const tryIt = (def: number) => ({
      diagram: "scene\nground 0..{{w}}",
      params: [{ name: "w", label: "Width", min: 2, max: 8, step: 1, default: def, unit: "m" }],
    });
    expect(topicGuideSchema.safeParse({ ...topicFixture("4.1"), tryIt: tryIt(5) }).success).toBe(
      true,
    );
    expect(topicGuideSchema.safeParse({ ...topicFixture("4.1"), tryIt: tryIt(9) }).success).toBe(
      false,
    );
  });
});

describe("reading Markdown", () => {
  test("finds inline and display math, skips code and escaped dollars", () => {
    const md =
      "Cost \\$5. Then $a = b$ and\n\n$$c = d$$\n\n`$not math$`\n\n```dg\nplot x=t[s]\n```";
    expect(mathSpans(md)).toEqual({
      spans: [
        { latex: "c = d", display: true },
        { latex: "a = b", display: false },
      ],
      unbalanced: false,
    });
    expect(mathSpans("an open $a = b").unbalanced).toBe(true);
  });

  test("finds dg blocks and counts words without them", () => {
    const md = "Two words\n\n```dg\nscene\nground 0..5\n```\n\nand $x^2$ more.";
    expect(diagramBlocks(md)).toEqual(["scene\nground 0..5"]);
    expect(countWords(md)).toBe(5); // Two words and <math> more
  });

  test("latexError reports what KaTeX cannot typeset", () => {
    expect(latexError("\\frac{1}{2}mv^2")).toBeNull();
    expect(latexError("\\frac{1}{2")).toEqual(expect.any(String));
    expect(latexError("\\notacommand{x}")).toEqual(expect.any(String));
  });
});

describe("equation symbols", () => {
  const tokens = (latex: string) =>
    latexSymbols(latex).map((t) => (t.sub ? `${t.base}_${t.sub}` : t.base));

  test("reads letters, Greek and subscripts; looks through \\vec; skips \\text, \\Delta and functions", () => {
    expect(tokens("\\vec{p} = m\\vec{v}")).toEqual(["p", "m", "v"]);
    expect(tokens("\\vec{J} = \\vec{F}_{\\text{avg}}\\,\\Delta t")).toEqual(["J", "F_avg", "t"]);
    expect(tokens("m_1\\vec{v}_{1i} = (m_1 + m_2)\\,v_f")).toEqual([
      "m_1",
      "v_1i",
      "m_1",
      "m_2",
      "v_f",
    ]);
    expect(tokens("\\tau = rF\\sin\\theta")).toEqual(["\\tau", "r", "F", "\\theta"]);
    expect(tokens("K = \\tfrac{1}{2}mv_{f}^2")).toEqual(["K", "m", "v_f"]);
    expect(tokens("F = \\frac{dp}{dt}")).toEqual(["F", "p", "t"]);
    expect(tokens("x = 3\\ \\text{m}")).toEqual(["x"]);
  });

  test("a bare symbol covers its subscripted forms; one subscript does not cover another", () => {
    const eq = (symbols: string[]) => ({
      latex: "\\Delta p = m v_f - m v_i",
      meaning: "x",
      useWhen: "x",
      notWhen: "x",
      variables: symbols.map((symbol) => ({ symbol, name: "x", unit: "" })),
    });
    expect(unexplainedSymbols(eq(["\\Delta p", "m", "v"]))).toEqual([]);
    expect(unexplainedSymbols(eq(["\\Delta p", "m", "v_f,\\ v_i"]))).toEqual([]);
    expect(unexplainedSymbols(eq(["\\Delta p", "m", "v_i"]))).toEqual(["v_f"]);
    expect(unexplainedSymbols(eq(["p", "v"]))).toEqual(["m"]);
  });
});

describe("checkWorkedExample", () => {
  const [numeric, conceptual] = topicFixture("4.1").workedExamples;

  test("reads the numbers an answer states, with the precision they are written to", () => {
    expect(answerNumbers("$F = 8.7 \\times 10^3\\ \\text{N}$")).toEqual([
      { value: 8700, tolerance: expect.closeTo(50, 6) },
    ]);
    expect(answerNumbers("$v_{2f} = +0.80\\ \\text{m/s}$").map((n) => n.value)).toEqual([0.8]);
    expect(answerNumbers("$\\Delta p = −2.1$").map((n) => n.value)).toEqual([-2.1]);
    expect(answerNumbers("$\\tfrac{1}{2}mv^2$")).toEqual([]);
  });

  test("without an evaluator, checks the shape only", () => {
    expect(checkWorkedExample(numeric)).toEqual([]);
    expect(checkWorkedExample(conceptual)).toEqual([]);
    // A wrong number passes when nothing can recompute it.
    expect(checkWorkedExample({ ...numeric, answer: "$p = 7.0\\ \\text{kg·m/s}$" })).toEqual([]);
    expect(checkWorkedExample({ ...numeric, spec: { ...numeric.spec!, expr: "m*v*g" } })).toEqual([
      expect.stringContaining('"g"'),
    ]);
    expect(checkWorkedExample({ ...numeric, answer: "$p = 6.0\\ \\text{N}$" })).toEqual([
      expect.stringContaining("unit"),
    ]);
    expect(checkWorkedExample({ ...numeric, answer: "About six $\\text{kg·m/s}$" })).toEqual([
      expect.stringContaining("states no number"),
    ]);
  });

  test("with an evaluator, the answer must state what the spec computes", () => {
    expect(checkWorkedExample(numeric, referenceEvaluator)).toEqual([]);
    expect(
      checkWorkedExample({ ...numeric, answer: "$p = 7.0\\ \\text{kg·m/s}$" }, referenceEvaluator),
    ).toEqual([expect.stringContaining("spec computes 6")]);
    // 6.04 is "6.0" to the digits written, but not "6.00".
    const off = { ...numeric, spec: { ...numeric.spec!, expr: "m*v + 0.04" } };
    expect(checkWorkedExample(off, referenceEvaluator)).toEqual([]);
    expect(
      checkWorkedExample({ ...off, answer: "$p = 6.00\\ \\text{kg·m/s}$" }, referenceEvaluator),
    ).toHaveLength(1);
    expect(checkWorkedExample(numeric, () => ({ ok: false, error: "boom" }))).toEqual([
      expect.stringContaining("boom"),
    ]);
    expect(checkWorkedExample(numeric, () => ({ ok: true, value: 6, unit: "N" }))).toEqual([
      expect.stringContaining('"N"'),
    ]);
  });
});

describe("verifyUnitGuide", () => {
  test("the fixture passes, with word and diagram counts per topic", () => {
    const report = verifyUnitGuide(unitFixture(), { evaluate: referenceEvaluator });
    expect(report.errors).toEqual([]);
    expect(report.topics.map((t) => t.topic)).toEqual(["4.1", "4.2", "4.3", "4.4"]);
    expect(report.topics[0].diagrams).toBe(1);
    expect(report.topics[0].words).toBeGreaterThanOrEqual(WORD_BOUNDS.min);
  });

  test("a file that does not fit the schema is reported by field", () => {
    const report = verifyUnitGuide({ curriculumId: "ap-physics-1", unit: 4, guides: [{}] });
    expect(report.errors.some((e) => e.startsWith("schema: guides.0.topic"))).toBe(true);
  });

  test("unknown course or unit", () => {
    expect(verifyUnitGuide({ ...unitFixture(), curriculumId: "nope" }).errors).toEqual([
      'unknown course "nope"',
    ]);
    expect(verifyUnitGuide({ ...unitFixture(), unit: 12 }).errors).toEqual([
      "AP Physics 1 has no unit 12",
    ]);
  });

  test("every topic of the unit needs a guide, once, and no other topic may have one", () => {
    const missing = unitFixture();
    missing.guides.pop();
    expect(verifyUnitGuide(missing).errors).toEqual([expect.stringContaining("4.4: no guide")]);
    const twice = unitFixture();
    twice.guides[3] = topicFixture("4.1");
    expect(verifyUnitGuide(twice).errors).toEqual(
      expect.arrayContaining([
        "4.1: more than one guide",
        expect.stringContaining("4.4: no guide"),
      ]),
    );
    const stray = unitFixture();
    stray.guides.push(topicFixture("5.1"));
    expect(verifyUnitGuide(stray).errors).toEqual(["5.1: not a topic of unit 4"]);
  });

  test("LaTeX that does not compile, in a card or in Markdown", () => {
    expect(errorsOf((g) => (g.equations[0].latex = "\\frac{p}{"))).toEqual(
      expect.arrayContaining([expect.stringContaining("4.1 equations[0]: LaTeX")]),
    );
    expect(errorsOf((g) => (g.checkYourself[1].a = "It is $\\badmacro{x}$."))).toEqual([
      expect.stringContaining("4.1 checkYourself[1].a: LaTeX"),
    ]);
    expect(errorsOf((g) => (g.misconceptions[0].right = "It costs $5."))).toEqual([
      expect.stringContaining("a $ is not closed"),
    ]);
    expect(errorsOf((g) => (g.teacherNotes = "Use $\\frac{1}{$."))).toEqual([
      expect.stringContaining("4.1 teacherNotes: LaTeX"),
    ]);
  });

  test("a diagram that cannot be drawn, or that says something false", () => {
    expect(errorsOf((g) => (g.picture!.diagram = "circuit\nresistor 1"))).toEqual([
      expect.stringContaining("4.1 picture: diagram line 1"),
    ]);
    // An arrow drawn through the block it acts on is a "physics" warning: an error here.
    expect(
      errorsOf(
        (g) => (g.picture!.diagram = 'scene\nground 0..8\nblock A 4,0 "m"\nf A.r left 1 "F"'),
      ),
    ).toEqual([expect.stringContaining("runs through the inside")]);
    expect(
      errorsOf((g) => (g.workedExamples[1].prompt += "\n\n```dg\nplot x=t[s] y=v[m/s]\n```")),
    ).toEqual([expect.stringContaining("4.1 workedExamples[1].prompt: diagram")]);
    expect(errorsOf((g) => (g.explanation += "\n\n```dg\nscene\nground 0..5"))).toEqual(
      expect.arrayContaining([expect.stringContaining("``` block is not closed")]),
    );
  });

  test("try it: placeholders and parameters match, and it draws at both ends", () => {
    const param = { name: "w", label: "Width", min: 1, max: 6, step: 1, default: 3, unit: "m" };
    const withTryIt = (diagram: string, params = [param]) =>
      errorsOf((g) => (g.tryIt = { diagram, params }));
    expect(withTryIt('scene\nground 0..8\nblock A 4,0 w={{w}} "{{w}} m"')).toEqual([]);
    expect(withTryIt("scene\nground 0..{{width}}")).toEqual(
      expect.arrayContaining([
        "4.1 tryIt: {{width}} has no parameter",
        '4.1 tryIt: parameter "w" is not in the diagram',
      ]),
    );
    // Fine at the default, but the plot's range runs backwards once w passes 4.
    expect(withTryIt("plot x=t[s] y=v[m/s]\nseg 0,0 {{4-w}},2")).toEqual(
      expect.arrayContaining([expect.stringContaining("4.1 tryIt: at w=6")]),
    );
    expect(withTryIt("scene\nground 0..{{1/(w-3)}}")).toEqual(
      expect.arrayContaining([expect.stringContaining("not a finite number")]),
    );
  });

  test("an equation symbol nobody explains", () => {
    expect(errorsOf((g) => g.equations[0].variables.pop())).toEqual([
      "4.1 equations[0]: variables do not explain v",
    ]);
  });

  test("misconception tags must belong to the course", () => {
    expect(errorsOf((g) => (g.misconceptions[0].tag = "not-a-tag"))).toEqual([
      expect.stringContaining('"not-a-tag" is not a misconception tag of AP Physics 1'),
    ]);
    // A calculus-only tag exists, but not for AP Physics 1.
    expect(errorsOf((g) => (g.misconceptions[0].tag = "derivative-integral-confusion"))).toEqual([
      expect.stringContaining("is not a misconception tag of AP Physics 1"),
    ]);
  });

  test("prerequisites exist and come earlier", () => {
    expect(errorsOf((g) => (g.prerequisites = ["2.5", "3.1"]))).toEqual([]);
    expect(errorsOf((g) => (g.prerequisites = ["4.2"]))).toEqual([
      "4.1 prerequisites: 4.2 does not come before 4.1",
    ]);
    expect(errorsOf((g) => (g.prerequisites = ["9.9"]))).toEqual([
      "4.1 prerequisites: 9.9 is not a topic of AP Physics 1",
    ]);
  });

  test("word count, one-sentence big idea, 2 to 4 paragraphs", () => {
    expect(errorsOf((g) => (g.explanation = "Too short.\n\nReally."))).toEqual([
      expect.stringMatching(/4\.1 length: \d+ words; a topic needs 400 to 900/),
    ]);
    expect(errorsOf((g) => (g.checkYourself[0].a = "word ".repeat(600)))).toEqual([
      expect.stringMatching(/4\.1 length: \d+ words; a topic needs 400 to 900/),
    ]);
    // Teacher notes are not part of the count.
    expect(errorsOf((g) => (g.teacherNotes = "word ".repeat(600)))).toEqual([]);
    expect(errorsOf((g) => (g.explanation = g.explanation.replace(/\n\n/g, " ")))).toEqual([
      "4.1 explanation: has 1 paragraphs; write 2 to 4",
    ]);
    expect(errorsOf((g) => (g.bigIdea = "Momentum is a vector. It adds."))).toEqual([
      "4.1 bigIdea: must be one sentence",
    ]);
  });

  test("worked-example numbers are checked when an evaluator is passed", () => {
    const wrong = unitFixture((g) => (g.workedExamples[0].answer = "$p = 5.0\\ \\text{kg·m/s}$"));
    expect(verifyUnitGuide(wrong).errors).toEqual([]);
    expect(verifyUnitGuide(wrong, { evaluate: referenceEvaluator }).errors).toEqual([
      expect.stringContaining("4.1 workedExamples[0]: the answer states 5 but the spec computes 6"),
    ]);
  });

  test("a prompt that does not state a given is a warning, not an error", () => {
    const report = verifyUnitGuide(
      unitFixture((g) => (g.workedExamples[0].spec!.givens.v = { value: 4, unit: "m/s" })),
    );
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([expect.stringContaining("does not state v = 4 m/s")]);
  });

  test("the calculus-based courses must have derivations; the others need not", () => {
    expect(requiresDerivation("physics-c-mech")).toBe(true);
    expect(requiresDerivation("physics-1")).toBe(false);
    expect(requiresDerivation("physics-2")).toBe(false);
    const topics = apUnit(4, "physics-c-mech")!.topics.map((t) => t.id);
    const file = (derivation?: string) => ({
      curriculumId: "ap-physics-c-mech",
      unit: 4,
      guides: topics.map((t) => topicFixture(t, derivation ? { derivation } : {})),
    });
    expect(verifyUnitGuide(file()).errors).toEqual(
      topics.map(
        (t) => `${t} derivation: AP Physics C: Mechanics guides must derive their results`,
      ),
    );
    expect(verifyUnitGuide(file("Start from $F = dp/dt$ and integrate.")).errors).toEqual([]);
  });
});

describe("guideCoverage", () => {
  test("lists the units of every course with and without a guide file", () => {
    const coverage = guideCoverage([["ap-physics-1", 4]]);
    expect(coverage.map((c) => c.curriculumId)).toEqual([
      "ap-physics-1",
      "ap-physics-2",
      "ap-physics-c-mech",
      "ap-physics-c-em",
    ]);
    expect(coverage[0].withGuide).toEqual([4]);
    expect(coverage[0].missing).toEqual([1, 2, 3, 5, 6, 7, 8]);
    expect(coverage[1].withGuide).toEqual([]);
  });
});
