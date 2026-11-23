import { submissionOutcome } from "../src/components/student/submitted-dialog";

jest.mock("../src/lib/firebase", () => ({ db: {} }));

describe("submissionOutcome", () => {
  it("is grading until the grader writes something, then slow after the wait", () => {
    expect(submissionOutcome(undefined, false)).toEqual({ state: "grading" });
    expect(submissionOutcome({ status: "submitted", graded: false }, false)).toEqual({
      state: "grading",
    });
    expect(submissionOutcome({ status: "submitted", graded: false }, true)).toEqual({
      state: "slow",
    });
  });
  it("shows the score as soon as it is graded, even after the wait ran out", () => {
    expect(submissionOutcome({ status: "graded", graded: true, score: 87.4 }, true)).toEqual({
      state: "graded",
      score: 87.4,
    });
    expect(submissionOutcome({ status: "graded", graded: true, score: 0 }, false)).toEqual({
      state: "graded",
      score: 0,
    });
    expect(submissionOutcome({ status: "graded", graded: true }, false)).toEqual({
      state: "graded",
      score: null,
    });
  });
  it("says the teacher will review when the grader set answers aside", () => {
    expect(submissionOutcome({ status: "pending_review", graded: false }, false)).toEqual({
      state: "review",
    });
  });
});
