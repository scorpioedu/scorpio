// eslint-disable-next-line @typescript-eslint/no-require-imports
const { needsMigration, splitInlineKeys } = require("../tools/answer-key-migration.cjs");
import { effectiveType, gradeSubmissionAnswers } from "../functions/src/grading-core";

// The shape scripts/seed-waypoints.ts wrote: no question ids, answers inline under `answer`.
const seeded = {
  teacherId: "system-seed",
  visibility: "global",
  title: "Kinematics",
  questions: [
    {
      type: "multiple-choice",
      text: "Area under v-t?",
      options: ["Acceleration", "Displacement"],
      answer: "Displacement",
    },
    { type: "true-false", text: "Zero velocity, non-zero acceleration?", answer: "true" },
    { type: "numerical", text: "Final velocity?", answer: "18 m/s", hint: "v = u + at" },
    { type: "free-response", text: "Explain." },
  ],
};

describe("needsMigration", () => {
  test("seeded and unseparated documents need it", () => {
    expect(needsMigration(seeded)).toBe(true);
    expect(needsMigration({ questions: [{ id: "a", text: "x", correctAnswer: "y" }] })).toBe(true);
  });
  test("separated documents that still carry inline fields, ids or legacy types need it", () => {
    expect(
      needsMigration({
        answerKeySeparated: true,
        questions: [{ id: "a", text: "x", answer: "y" }],
      }),
    ).toBe(true);
    expect(needsMigration({ answerKeySeparated: true, questions: [{ text: "x" }] })).toBe(true);
    expect(needsMigration({ answerKeySeparated: true, rubric: "secret", questions: [] })).toBe(
      true,
    );
    expect(
      needsMigration({
        answerKeySeparated: true,
        questions: [{ id: "a", text: "x", type: "numerical" }],
      }),
    ).toBe(true);
  });
  test("clean documents are left alone", () => {
    expect(
      needsMigration({
        answerKeySeparated: true,
        rubric: null,
        questions: [{ id: "a", text: "x", type: "numeric" }],
      }),
    ).toBe(false);
    expect(needsMigration(undefined)).toBe(false);
  });
});

describe("splitInlineKeys", () => {
  test("seeded waypoint: ids assigned, every answer moved, nothing left on the public questions", () => {
    const { publicQuestions, key } = splitInlineKeys(seeded);
    expect(publicQuestions.map((q: { id: string }) => q.id)).toEqual(["q1", "q2", "q3", "q4"]);
    expect(key).toEqual({
      answers: { q1: "Displacement", q2: "true", q3: "18 m/s", q4: "" },
      rubric: "",
      teacherId: "system-seed",
    });
    expect(JSON.stringify(publicQuestions)).not.toMatch(
      /18 m\/s|"(answer|correctAnswer|expectedAnswer)"/,
    );
    expect(publicQuestions[2]).toEqual({
      id: "q3",
      type: "numeric",
      text: "Final velocity?",
      hint: "v = u + at",
    });
    expect(publicQuestions[3].type).toBe("text");
    expect(publicQuestions[0].options).toEqual(["Acceleration", "Displacement"]);
  });

  test("an existing key wins over a stale inline copy; empty key entries fall back to inline", () => {
    const data = {
      teacherId: "t",
      rubric: "old rubric",
      questions: [
        { id: "a", text: "x", correctAnswer: "stale" },
        { id: "b", text: "y", answer: "inline" },
      ],
    };
    const { key } = splitInlineKeys(data, {
      answers: { a: "edited", b: "" },
      rubric: "new rubric",
    });
    expect(key).toEqual({
      answers: { a: "edited", b: "inline" },
      rubric: "new rubric",
      teacherId: "t",
    });
  });

  test("duplicate, reserved or malformed ids get fresh ones that do not collide", () => {
    const { publicQuestions } = splitInlineKeys({
      questions: [
        { id: "q2", text: "a" },
        { id: "q2", text: "b" },
        { id: "__proto__", text: "c" },
        { id: "bad id", text: "d" },
      ],
    });
    const ids = publicQuestions.map((q: { id: string }) => q.id);
    expect(ids[0]).toBe("q2");
    expect(new Set(ids).size).toBe(4);
  });

  test("migrated seeded questions grade correctly with the new core", async () => {
    const { publicQuestions, key } = splitInlineKeys(seeded);
    const questions = publicQuestions.map((q: { id: string }) => ({
      ...q,
      correctAnswer: key.answers[q.id],
    }));
    expect(questions.map(effectiveType)).toEqual([
      "multiple-choice",
      "true-false",
      "numeric",
      "text",
    ]);
    const r = await gradeSubmissionAnswers(questions, [
      { questionId: "q1", answer: "Displacement" },
      { questionId: "q2", answer: "True" },
      { questionId: "q3", answer: "64.8 km/h" },
    ]);
    expect(r.earnedPoints).toBe(30);
  });
});
