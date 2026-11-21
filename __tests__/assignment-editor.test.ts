import {
  AI_COUNT,
  clampAiCount,
  fromGenerated,
  moveItem,
  removeChoice,
  settingsFrom,
  summarisePoints,
  toEditorQuestion,
  type Question,
} from "../src/components/teacher/assignment-editor/types";
import {
  activeAnswerFlag,
  clearAnswerChecks,
  dismissAnswerCheck,
  flagAnswerChecks,
  settleAnswerChecks,
} from "../src/components/teacher/assignment-editor/answer-checks";
import { AI_GENERATE_MAX, aiGenerateBody } from "../src/lib/schemas/api-bodies";

const q = (id: string, points = 10): Question => ({ id, text: id, type: "text", points });

describe("assignment editor helpers", () => {
  test("editing keeps question ids (grades stay attached); copies get new ones", () => {
    const stored = {
      id: "q1",
      text: "Pick",
      type: "multiple-choice",
      options: ["x", "y"],
      correctAnswer: "B",
    };
    expect(toEditorQuestion(stored, true)).toMatchObject({
      id: "q1",
      correctAnswer: "y",
      points: 10,
    });
    expect(toEditorQuestion(stored).id).not.toBe("q1");
    expect(
      toEditorQuestion({ text: "t", type: "true-false", correctAnswer: "f" }).correctAnswer,
    ).toBe("False");
  });

  test("points split evenly or stay custom, with the same errors as before", () => {
    expect(
      summarisePoints([q("a"), q("b")], 100, false).scoredQuestions.map((x) => x.points),
    ).toEqual([50, 50]);
    expect(summarisePoints([q("a", 30), q("b", 30)], 100, true).pointsError).toBe(
      "40 points left to assign.",
    );
    expect(summarisePoints([q("a")], 0, false).pointsError).toMatch(/positive whole number/);
  });

  test("move and remove", () => {
    expect(moveItem(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    expect(moveItem(["a", "b"], 0, -1)).toEqual(["a", "b"]);
    const mc = {
      ...q("m"),
      type: "multiple-choice" as const,
      options: ["x", "y", "z"],
      correctAnswer: "y",
    };
    expect(removeChoice(mc, 1)).toEqual({ options: ["x", "z"], correctAnswer: "" });
    expect(removeChoice(mc, 0)).toEqual({ options: ["y", "z"], correctAnswer: "y" });
  });

  test("settings read from a stored assignment, over the defaults", () => {
    expect(settingsFrom({ timeLimit: 30, lockdownMode: true, visibility: "global" })).toMatchObject(
      {
        timeLimit: 30,
        lockdownMode: true,
        enableTabDetection: true,
        visibility: "global",
        gradingType: "ai",
      },
    );
  });
});

describe("Generate with AI: number of questions", () => {
  test("the field allows 1 to 20, the same as the API, and defaults to 3", () => {
    expect(AI_COUNT).toEqual({ min: 1, max: 20, fallback: 3 });
    expect(AI_COUNT.max).toBe(AI_GENERATE_MAX);
    expect(aiGenerateBody.parse({ topic: "t", userId: "u" }).count).toBe(AI_COUNT.fallback);
  });

  test("an empty or unreadable box means the default, never NaN", () => {
    for (const raw of ["", "   ", "abc", Number.NaN, "-"]) expect(clampAiCount(raw)).toBe(3);
  });

  test("anything else is clamped to a whole number in range", () => {
    expect(clampAiCount("12")).toBe(12);
    expect(clampAiCount("20")).toBe(20);
    expect(clampAiCount("21")).toBe(20);
    expect(clampAiCount("500")).toBe(20);
    expect(clampAiCount("0")).toBe(1);
    expect(clampAiCount("-4")).toBe(1);
    expect(clampAiCount("7.9")).toBe(7);
    expect(clampAiCount(Number.POSITIVE_INFINITY)).toBe(3);
    // Whatever is typed, the request body is valid.
    for (const raw of ["", "abc", "0", "99", "7.5"])
      expect(
        aiGenerateBody.safeParse({ topic: "t", userId: "u", count: clampAiCount(raw) }).success,
      ).toBe(true);
  });
});

describe("answer-check flags on generated questions", () => {
  const generated = [
    {
      text: "Q1",
      type: "multiple-choice",
      options: ["x", "y"],
      correctAnswer: "x",
      answerCheck: "disagrees",
      checkedAnswer: "y",
    },
    { text: "Q2", type: "short-answer", correctAnswer: "5 N", answerCheck: "agrees" },
    { text: "Q3", type: "short-answer", correctAnswer: "7 N", answerCheck: "unchecked" },
    { text: "Q4", type: "true-false", correctAnswer: "True", answerCheck: "disagrees" },
  ];
  beforeEach(() => clearAnswerChecks());

  test("the verdict never reaches the question that is saved", () => {
    const questions = generated.map(fromGenerated);
    flagAnswerChecks(generated, questions);
    for (const question of questions) {
      expect(Object.keys(question).sort()).toEqual(
        ["correctAnswer", "id", "options", "points", "text", "type"].sort(),
      );
      expect(JSON.stringify(question)).not.toMatch(/answerCheck|checkedAnswer|disagrees/);
    }
  });

  test("only a disagreement is flagged, with the second solve's answer", () => {
    const questions = generated.map(fromGenerated);
    expect(flagAnswerChecks(generated, questions)).toBe(2);
    expect(questions.map((question) => activeAnswerFlag(question))).toEqual([
      { key: "x", checkedAnswer: "y" },
      undefined,
      undefined,
      { key: "True", checkedAnswer: "" },
    ]);
  });

  test("the flag goes when the teacher changes the answer, and does not come back", () => {
    const questions = generated.map(fromGenerated);
    flagAnswerChecks(generated, questions);
    // Editing something else keeps it.
    const reworded = { ...questions[0], text: "Q1, reworded" };
    settleAnswerChecks([reworded]);
    expect(activeAnswerFlag(reworded)).toBeDefined();
    const edited = { ...questions[0], correctAnswer: "y" };
    expect(activeAnswerFlag(edited)).toBeUndefined();
    settleAnswerChecks([edited]);
    expect(activeAnswerFlag(questions[0])).toBeUndefined();
    // The other flagged question is untouched.
    expect(activeAnswerFlag(questions[3])).toBeDefined();
  });

  test("dismissing removes one flag", () => {
    const questions = generated.map(fromGenerated);
    flagAnswerChecks(generated, questions);
    dismissAnswerCheck(questions[3].id);
    expect(activeAnswerFlag(questions[3])).toBeUndefined();
    expect(activeAnswerFlag(questions[0])).toBeDefined();
  });

  test("imported questions (no verdict) are never flagged", () => {
    const imported = [{ text: "Q", type: "short-answer", correctAnswer: "a" }];
    const questions = imported.map(fromGenerated);
    expect(flagAnswerChecks(imported, questions)).toBe(0);
    expect(activeAnswerFlag(questions[0])).toBeUndefined();
  });
});
