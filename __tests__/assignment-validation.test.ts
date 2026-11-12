import { validateQuestionAnswers, ValidatableQuestion } from "@/lib/assignment-validation";

describe("validateQuestionAnswers", () => {
  test("allows questions with all valid selected answers", () => {
    const questions: ValidatableQuestion[] = [
      {
        id: "q1",
        type: "multiple-choice",
        text: "What is gravity?",
        options: ["A force", "A fruit", "A color"],
        correctAnswer: "A force",
      },
      {
        id: "q2",
        type: "true-false",
        text: "F = ma",
        options: ["True", "False"],
        correctAnswer: "True",
      },
      {
        id: "q3",
        type: "short-answer",
        text: "Value of g on Earth?",
        correctAnswer: "9.8 m/s^2",
      },
      {
        id: "q4",
        type: "text",
        text: "Explain Newton's third law.",
      },
    ];

    const result = validateQuestionAnswers(questions);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  test("rejects multiple choice questions with no correct answer selected", () => {
    const questions: ValidatableQuestion[] = [
      {
        id: "q1",
        type: "multiple-choice",
        text: "Select the speed of light:",
        options: ["3e8 m/s", "100 m/s"],
        correctAnswer: "",
      },
    ];

    const result = validateQuestionAnswers(questions);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Question 1 (Multiple Choice)");
    expect(result.questionIndex).toBe(0);
  });

  test("rejects multiple choice questions where correctAnswer is not in options", () => {
    const questions: ValidatableQuestion[] = [
      {
        id: "q1",
        type: "multiple-choice",
        text: "Select one:",
        options: ["Option A", "Option B"],
        correctAnswer: "Option C",
      },
    ];

    const result = validateQuestionAnswers(questions);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Question 1 (Multiple Choice)");
  });

  test("rejects true-false questions without True or False selected", () => {
    const questions: ValidatableQuestion[] = [
      {
        id: "q1",
        type: "true-false",
        text: "Is energy conserved?",
        options: ["True", "False"],
        correctAnswer: "",
      },
    ];

    const result = validateQuestionAnswers(questions);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Question 1 (True/False)");
  });

  test("rejects short-answer questions with empty correctAnswer", () => {
    const questions: ValidatableQuestion[] = [
      {
        id: "q1",
        type: "short-answer",
        text: "Calculate power",
        correctAnswer: "   ",
      },
    ];

    const result = validateQuestionAnswers(questions);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Question 1 (Short Answer)");
  });

  test("allows text questions with or without grading rubric", () => {
    const questions: ValidatableQuestion[] = [
      {
        id: "q1",
        type: "text",
        text: "Free response essay",
        correctAnswer: "",
      },
    ];

    const result = validateQuestionAnswers(questions);
    expect(result.valid).toBe(true);
  });

  // RT-19 / E-017: branches that Stryker found unexercised.
  const tf = (correctAnswer?: string): ValidatableQuestion => ({ id: "q", type: "true-false", correctAnswer });
  const mc = (options: string[], correctAnswer?: string): ValidatableQuestion => ({ id: "q", type: "multiple-choice", options, correctAnswer });

  test.each(["True", "False"])("accepts true-false correctAnswer %s", answer => {
    expect(validateQuestionAnswers([tf(answer)])).toEqual({ valid: true });
  });

  test.each(["Maybe", "true", "false", " True", "True "])("rejects true-false correctAnswer %j (case and whitespace sensitive)", answer => {
    const result = validateQuestionAnswers([tf(answer)]);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Question 1 (True/False)");
  });

  test("rejects true-false with correctAnswer missing or empty", () => {
    expect(validateQuestionAnswers([tf(undefined)]).valid).toBe(false);
    expect(validateQuestionAnswers([tf("")]).valid).toBe(false);
  });

  test("rejects a whitespace-only option even when correctAnswer equals it", () => {
    const result = validateQuestionAnswers([mc(["   ", "B"], "   ")]);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Question 1 (Multiple Choice)");
  });

  test("rejects an empty-string option selected as correct", () => {
    expect(validateQuestionAnswers([mc(["", "B"], "")]).valid).toBe(false);
  });

  test("a blank option elsewhere does not invalidate a real selected option", () => {
    expect(validateQuestionAnswers([mc(["   ", "B"], "B")])).toEqual({ valid: true });
  });

  test("multiple choice without an options array is invalid", () => {
    expect(validateQuestionAnswers([{ id: "q", type: "multiple-choice", correctAnswer: "A" }]).valid).toBe(false);
  });

  test("option match is exact: correctAnswer with different surrounding whitespace does not match", () => {
    expect(validateQuestionAnswers([mc(["A"], " A")]).valid).toBe(false);
    expect(validateQuestionAnswers([mc([" A"], " A")])).toEqual({ valid: true });
  });

  test("short answer that is only whitespace is invalid; missing is invalid", () => {
    expect(validateQuestionAnswers([{ id: "q", type: "short-answer", correctAnswer: "  \t" }]).valid).toBe(false);
    expect(validateQuestionAnswers([{ id: "q", type: "short-answer" }]).valid).toBe(false);
  });

  test("reports the 1-based number and 0-based index of the first invalid question", () => {
    const result = validateQuestionAnswers([tf("True"), mc(["A"], "A"), tf("Maybe"), tf(undefined)]);
    expect(result).toEqual({
      valid: false,
      error: "Question 3 (True/False): please select whether True or False is the correct answer.",
      questionIndex: 2,
    });
  });

  test("an empty question list is valid", () => {
    expect(validateQuestionAnswers([])).toEqual({ valid: true });
  });
});
