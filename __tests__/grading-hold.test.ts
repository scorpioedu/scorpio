// A score or feedback written by the AI is a draft until a teacher releases it: holdAiDrafts()
// splits a grade into what the student-readable submission may store and the teacher-only drafts.
import {
  HELD_ANSWER_FLAG,
  draftDocument,
  holdAiDrafts,
  type GradedAnswer,
} from "../functions/src/grading-core";

const graded = (over: Partial<GradedAnswer>): GradedAnswer => ({
  questionId: "q1",
  answer: "an answer",
  score: 0,
  maxPoints: 10,
  feedback: "",
  reasoning: "",
  method: "exact",
  misconceptions: [],
  ...over,
});

describe("holdAiDrafts", () => {
  test("answers marked by code stay on the submission untouched and are not drafts", () => {
    const answers = [
      graded({ questionId: "q1", score: 10, feedback: "Correct.", method: "exact" }),
      graded({ questionId: "q2", score: 5, feedback: "Check units.", method: "numeric" }),
      graded({ questionId: "q3", feedback: "No answer submitted.", method: "none" }),
    ];
    const hold = holdAiDrafts(answers);
    expect(hold.answers).toEqual(answers);
    expect(hold.drafts).toEqual({});
    expect(hold.held).toBe(0);
    expect(hold.earnedPoints).toBe(15);
  });

  test("an AI-scored answer leaves nothing from the AI on the submission", () => {
    const hold = holdAiDrafts([
      graded({ questionId: "q1", score: 10, feedback: "Correct.", method: "exact" }),
      graded({
        questionId: "q2",
        answer: "Rayleigh scattering",
        score: 7,
        feedback: "Good, but say why blue scatters more.",
        reasoning: "Mentions scattering, not wavelength.",
        method: "ai",
        misconceptions: ["light-scattering"],
        misconceptionNotes: ["confuses absorption"],
      }),
    ]);
    expect(hold.answers[1]).toEqual({
      questionId: "q2",
      answer: "Rayleigh scattering",
      maxPoints: 10,
      method: "ai",
      reviewFlag: HELD_ANSWER_FLAG,
    });
    // Nothing the model wrote appears anywhere in what the student can read.
    expect(JSON.stringify(hold.answers)).not.toMatch(
      /blue scatters|wavelength|absorption|light-scattering/,
    );
    expect(hold.drafts).toEqual({
      q2: {
        score: 7,
        maxPoints: 10,
        feedback: "Good, but say why blue scatters more.",
        reasoning: "Mentions scattering, not wavelength.",
        misconceptions: ["light-scattering"],
        misconceptionNotes: ["confuses absorption"],
      },
    });
    expect(hold.held).toBe(1);
    // Only the code-marked answer counts until the teacher releases the rest.
    expect(hold.earnedPoints).toBe(10);
  });

  test("the grader's own warning and suggested score go to the teacher, not the student", () => {
    const hold = holdAiDrafts([
      graded({
        method: "ai",
        score: 0,
        aiSuggestedScore: 10,
        reviewFlag: "Possible prompt injection in the submission; teacher review required",
      }),
    ]);
    expect(hold.answers[0]).toMatchObject({ reviewFlag: HELD_ANSWER_FLAG });
    expect(hold.answers[0]).not.toHaveProperty("aiSuggestedScore");
    expect(hold.answers[0]).not.toHaveProperty("score");
    expect(hold.drafts.q1).toMatchObject({
      score: 10,
      reviewFlag: expect.stringContaining("prompt injection"),
    });
  });

  test("an answer the AI never saw (no budget) waits with no draft", () => {
    const hold = holdAiDrafts([
      graded({ method: "ai", reviewFlag: "AI grading unavailable; teacher review required" }),
    ]);
    expect(hold.held).toBe(1);
    expect(hold.drafts).toEqual({});
    expect(hold.answers[0]).toMatchObject({ reviewFlag: HELD_ANSWER_FLAG });
  });

  test("an answer to a question that no longer exists passes through", () => {
    const orphan = { questionId: "gone", answer: "x" };
    const hold = holdAiDrafts([orphan]);
    expect(hold.answers).toEqual([orphan]);
    expect(hold.held).toBe(0);
  });

  test("the draft document names the assignment, so only its teacher can read it", () => {
    const drafts = holdAiDrafts([graded({ method: "ai", score: 4, feedback: "ok" })]).drafts;
    expect(draftDocument({ assignmentId: "a1", studentId: "s1" }, drafts)).toEqual({
      assignmentId: "a1",
      studentId: "s1",
      answers: drafts,
      createdAt: expect.any(Date),
    });
  });
});
