import {
  moveItem,
  removeChoice,
  settingsFrom,
  summarisePoints,
  toEditorQuestion,
  type Question,
} from "../src/components/teacher/assignment-editor/types";

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
