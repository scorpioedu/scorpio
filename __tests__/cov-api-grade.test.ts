import { NextRequest } from "next/server";

type Doc = Record<string, unknown> | undefined;
const mockDocs = new Map<string, Doc>();
const mockUpdates: Array<{ path: string; data: Record<string, unknown> }> = [];
let mockStudentsQuery: Array<Record<string, unknown>> = [];
let mockStudentsQueryThrows = false;
let mockDbNull = false;

jest.mock("../src/lib/firebase-admin", () => ({
  get adminDb() {
    if (mockDbNull) return null;
    return {
      collection: (name: string) => ({
        doc: (id: string) => ({
          get: async () => {
            const data = mockDocs.get(`${name}/${id}`);
            return { exists: data !== undefined, data: () => data };
          },
          update: async (d: Record<string, unknown>) => {
            mockUpdates.push({ path: `${name}/${id}`, data: d });
          },
        }),
        where: () => ({
          where: () => ({
            get: async () => {
              if (mockStudentsQueryThrows) throw new Error("index missing");
              return { docs: mockStudentsQuery.map((d) => ({ data: () => d })) };
            },
          }),
        }),
      }),
    };
  },
}));

// The wrapper's auth/lock behaviour is covered elsewhere; here the handler runs with a fixed context.
jest.mock("../src/lib/auth-verify", () => ({
  withAuthorizedRequest:
    (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) => (req: NextRequest) =>
      handler(req, {
        caller: { uid: "teacher1" },
        profile: {},
        organizationId: "org1",
        body: {},
        requestId: "req-1",
      }),
}));
const mockGradeResponse = jest.fn();
jest.mock("../src/lib/ai/grading", () => ({
  gradeResponse: (...a: unknown[]) => mockGradeResponse(...a),
}));
const mockCheckBudget = jest.fn();
const mockRecordUsage = jest.fn();
jest.mock("../src/lib/usage-limit", () => ({
  checkBudget: (...a: unknown[]) => mockCheckBudget(...a),
  recordUsage: (...a: unknown[]) => mockRecordUsage(...a),
}));

import { POST } from "../src/app/api/grade/route";

const call = (body: unknown) =>
  POST(
    new NextRequest("https://scorpio.test/api/grade", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

const seed = (
  opts: {
    answers?: unknown[];
    questions?: unknown[];
    graded?: boolean;
    student?: Doc;
    rubric?: string;
  } = {},
) => {
  mockDocs.set("submissions/s1", {
    assignmentId: "a1",
    studentId: "stu1",
    graded: opts.graded,
    answers: opts.answers ?? [],
  });
  mockDocs.set(
    "users/stu1",
    opts.student ?? {
      role: "student",
      organizationId: "org1",
      teacherId: "t1",
      displayName: "Ada",
    },
  );
  mockDocs.set("assignments/a1", {
    teacherId: "teacher1",
    questions: opts.questions ?? [],
    rubric: opts.rubric,
  });
};

beforeEach(() => {
  mockDocs.clear();
  mockUpdates.length = 0;
  mockStudentsQuery = [];
  mockStudentsQueryThrows = false;
  mockDbNull = false;
  mockGradeResponse.mockReset();
  mockCheckBudget.mockReset().mockResolvedValue({ allowed: true });
  mockRecordUsage.mockReset().mockResolvedValue(undefined);
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe("POST /api/grade request validation", () => {
  test("500 when Firebase Admin is not initialised", async () => {
    mockDbNull = true;
    const res = await call({ submissionId: "s1" });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Server configuration error" });
  });

  test("400 with the route message when submissionId is missing", async () => {
    const res = await call({});
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Missing submissionId");
  });

  test("404 when the submission does not exist", async () => {
    const res = await call({ submissionId: "s1" });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Submission not found");
  });

  test("400 when the submission lacks assignmentId or studentId", async () => {
    mockDocs.set("submissions/s1", { answers: [] });
    const res = await call({ submissionId: "s1" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid submission data");
  });

  test("404 when the assignment is missing", async () => {
    seed();
    mockDocs.delete("assignments/a1");
    const res = await call({ submissionId: "s1" });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Assignment not found");
    expect(mockUpdates).toHaveLength(0);
  });
});

describe("POST /api/grade budget and organisation", () => {
  // The budget and organisation only matter when an answer needs the AI grader.
  const aiWork = {
    answers: [{ questionId: "q1", answer: "Objects resist change" }],
    questions: [{ id: "q1", text: "Explain inertia", type: "text" }],
  };
  beforeEach(() => mockGradeResponse.mockResolvedValue({ score: 5, feedback: "ok" }));

  test("deterministic-only submissions are graded without an organisation or budget check", async () => {
    seed({
      student: { role: "student" },
      answers: [{ questionId: "q1", answer: "a" }],
      questions: [{ id: "q1", text: "x", type: "multiple-choice", options: ["a", "b"] }],
    });
    mockDocs.set("assignment_keys/a1", { answers: { q1: "a" } });
    const res = await call({ submissionId: "s1" });
    expect(await res.json()).toEqual({ success: true, score: 100 });
    expect(mockCheckBudget).not.toHaveBeenCalled();
  });

  test("403 when neither the student nor the teacher has an organisation", async () => {
    seed({ ...aiWork, student: { role: "student", teacherId: "t1" } });
    mockDocs.set("users/t1", { role: "teacher" });
    const res = await call({ submissionId: "s1" });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/No organization/);
    expect(mockCheckBudget).not.toHaveBeenCalled();
  });

  test("403 when the student is missing and has no organisation", async () => {
    seed(aiWork);
    mockDocs.delete("users/stu1");
    expect((await call({ submissionId: "s1" })).status).toBe(403);
  });

  test("inherits the teacher organisation for the budget check", async () => {
    seed({ ...aiWork, student: { role: "student", teacherId: "t1" } });
    mockDocs.set("users/t1", { role: "teacher", organizationId: "teacherOrg" });
    const res = await call({ submissionId: "s1" });
    expect(res.status).toBe(200);
    expect(mockCheckBudget).toHaveBeenCalledWith("teacherOrg", "grading");
  });

  test("403 carrying the budget error when the budget is exhausted", async () => {
    seed(aiWork);
    mockCheckBudget.mockResolvedValue({ allowed: false, error: "Budget exceeded" });
    const res = await call({ submissionId: "s1" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Budget exceeded" });
    expect(mockUpdates).toHaveLength(0);
  });
});

describe("POST /api/grade scoring", () => {
  const questions = [
    { id: "q1", text: "Pick", type: "multiple-choice", points: 10 },
    { id: "q2", text: "True?", type: "true-false", points: 10 },
    { id: "q3", text: "Numeric", type: "numeric", points: 20 },
    { id: "q4", text: "Unkeyed", type: "numeric", points: 10 },
  ];
  const keys = { answers: { q1: "B", q2: "True", q3: "42", q4: undefined } };

  const seedWithKeys = (answers: unknown[], extra: Parameters<typeof seed>[0] = {}) => {
    seed({ answers, questions, ...extra });
    mockDocs.set("assignment_keys/a1", keys);
  };

  test("grades objective questions case-insensitively and persists the result", async () => {
    seedWithKeys([
      { questionId: "q1", answer: " b " },
      { questionId: "q2", answer: "false" },
      { questionId: "q3", answer: "42" },
      { questionId: "q4", answer: "whatever" },
    ]);
    const res = await call({ submissionId: "s1" });
    expect(res.status).toBe(200);
    // q4 is a numeric question with no answer key: a teacher must look, nobody gets a silent 0.
    expect(await res.json()).toEqual({
      success: false,
      pendingReview: true,
      reason: expect.stringMatching(/answer key/),
    });
    expect(mockUpdates).toHaveLength(1);
    const update = mockUpdates[0];
    expect(update.path).toBe("submissions/s1");
    expect(update.data).toMatchObject({ graded: false, status: "pending_review" });
    const answers = update.data.answers as Array<Record<string, unknown>>;
    // The legacy letter key "B" resolves to option text when options exist; here there are none, so it matches "b".
    expect(answers[0]).toMatchObject({
      score: 10,
      feedback: "Correct.",
      maxPoints: 10,
      method: "exact",
    });
    // Feedback no longer reveals the key to students.
    expect(answers[1]).toMatchObject({ score: 0, feedback: "Incorrect." });
    expect(answers[2]).toMatchObject({ score: 20, feedback: "Correct.", method: "numeric" });
    expect(answers[3]).toMatchObject({ score: 0, reviewFlag: expect.stringMatching(/answer key/) });
    expect(mockRecordUsage).not.toHaveBeenCalled();
  });

  test("numeric answers use a tolerance: 41 is within 3% of 42, 40 is not", async () => {
    seedWithKeys([{ questionId: "q3", answer: "41" }]);
    await call({ submissionId: "s1" });
    expect((mockUpdates[0].data.answers as Array<Record<string, unknown>>)[0]).toMatchObject({
      score: 20,
      feedback: "Correct.",
    });
    mockUpdates.length = 0;
    seedWithKeys([{ questionId: "q3", answer: "40" }]);
    await call({ submissionId: "s1" });
    expect((mockUpdates[0].data.answers as Array<Record<string, unknown>>)[0]).toMatchObject({
      score: 0,
    });
    expect(
      (mockUpdates[0].data.answers as Array<Record<string, unknown>>)[0].feedback,
    ).not.toContain("42");
  });

  test("answers to unknown questions are kept unchanged and ungraded", async () => {
    seedWithKeys([{ questionId: "ghost", answer: "x" }]);
    const res = await call({ submissionId: "s1" });
    expect(await res.json()).toEqual({ success: true, score: 0 });
    expect(mockUpdates[0].data.answers).toEqual([{ questionId: "ghost", answer: "x" }]);
  });

  test("a submission for an assignment with no questions scores 0", async () => {
    seed({ answers: [] });
    const res = await call({ submissionId: "s1" });
    expect(await res.json()).toEqual({ success: true, score: 0 });
    expect(mockUpdates[0].data).toMatchObject({ totalPoints: 0, earnedPoints: 0 });
  });

  test("default question points are 10 when unspecified", async () => {
    seed({
      answers: [{ questionId: "q1", answer: "a" }],
      questions: [{ id: "q1", text: "x", type: "multiple-choice" }],
    });
    mockDocs.set("assignment_keys/a1", { answers: { q1: "a" } });
    await call({ submissionId: "s1" });
    expect(mockUpdates[0].data).toMatchObject({ totalPoints: 10, earnedPoints: 10, score: 100 });
  });
});

describe("POST /api/grade AI grading", () => {
  const aiQuestions = [{ id: "q1", text: "Explain inertia", type: "text", points: 20 }];
  const seedAi = (extra: Parameters<typeof seed>[0] = {}) => {
    seed({
      answers: [{ questionId: "q1", answer: "Objects resist change" }],
      questions: aiQuestions,
      ...extra,
    });
    mockDocs.set("assignment_keys/a1", {
      answers: { q1: "Newton first law" },
      rubric: "Be precise",
    });
  };

  test("scales the AI score by points, records usage, and scrubs known student names", async () => {
    seedAi();
    mockStudentsQuery = [{ displayName: "Bob" }, { name: "Cy" }, {}];
    mockGradeResponse.mockResolvedValue({
      score: 5,
      feedback: "ok",
      reasoning: "why",
      usage: { inputTokens: 100, outputTokens: 40 },
    });
    const res = await call({ submissionId: "s1" });
    expect(await res.json()).toEqual({ success: true, score: 50 });
    const [q, a, rubric, names, reference] = mockGradeResponse.mock.calls[0];
    expect(q).toBe("Explain inertia");
    expect(a).toBe("Objects resist change");
    // The expected answer and the assignment rubric reach the grader as separate inputs.
    expect(reference).toBe("Newton first law");
    expect(rubric).toBe("Be precise");
    expect(names).toEqual(["Bob", "Cy", "Ada"]);
    expect(mockRecordUsage).toHaveBeenCalledWith("org1", "grading", 100, 40);
    const answers = mockUpdates[0].data.answers as Array<Record<string, unknown>>;
    expect(answers[0]).toMatchObject({ score: 10, feedback: "ok", reasoning: "why" });
  });

  test("does not duplicate the current student name and tolerates a result without usage or reasoning", async () => {
    seedAi();
    mockStudentsQuery = [{ displayName: "Ada" }];
    mockGradeResponse.mockResolvedValue({ score: 10, feedback: "great" });
    await call({ submissionId: "s1" });
    expect(mockGradeResponse.mock.calls[0][3]).toEqual(["Ada"]);
    expect(mockRecordUsage).not.toHaveBeenCalled();
    expect((mockUpdates[0].data.answers as Array<Record<string, unknown>>)[0].reasoning).toBe("");
  });

  test("still grades when student-name lookup fails", async () => {
    seedAi();
    mockStudentsQueryThrows = true;
    mockGradeResponse.mockResolvedValue({ score: 10, feedback: "great" });
    const res = await call({ submissionId: "s1" });
    expect(res.status).toBe(200);
    expect(mockGradeResponse.mock.calls[0][3]).toEqual([]);
  });

  test("skips the roster lookup for a student without a teacher", async () => {
    seedAi({ student: { role: "student", organizationId: "org1", name: "Zed" } });
    mockGradeResponse.mockResolvedValue({ score: 10, feedback: "great" });
    await call({ submissionId: "s1" });
    expect(mockGradeResponse.mock.calls[0][3]).toEqual(["Zed"]);
  });

  test("needsReview parks the submission, bills the tokens and returns 200 pendingReview", async () => {
    seedAi();
    mockGradeResponse.mockResolvedValue({
      score: 10,
      feedback: "",
      needsReview: true,
      reviewReason: "suspected injection",
      usage: { inputTokens: 7, outputTokens: 3 },
    });
    const res = await call({ submissionId: "s1" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: false,
      pendingReview: true,
      reason: "suspected injection",
    });
    expect(mockRecordUsage).toHaveBeenCalledWith("org1", "grading", 7, 3);
    expect(mockUpdates).toEqual([
      {
        path: "submissions/s1",
        data: {
          status: "pending_review",
          gradingError: "suspected injection",
          graded: false,
          answers: [
            expect.objectContaining({
              questionId: "q1",
              score: 0,
              aiSuggestedScore: 20,
              reviewFlag: "suspected injection",
            }),
          ],
        },
      },
    ]);
  });

  test("needsReview without reason or usage uses the default message and records nothing", async () => {
    seedAi();
    mockGradeResponse.mockResolvedValue({ score: 10, feedback: "", needsReview: true });
    await call({ submissionId: "s1" });
    expect(mockRecordUsage).not.toHaveBeenCalled();
    expect(mockUpdates[0].data.gradingError).toBe("Teacher review required");
  });

  test("needsReview leaves an already-graded submission untouched", async () => {
    seedAi({ graded: true });
    mockGradeResponse.mockResolvedValue({ score: 10, feedback: "", needsReview: true });
    const res = await call({ submissionId: "s1" });
    expect(res.status).toBe(200);
    expect(mockUpdates).toHaveLength(0);
  });

  test("AI failure returns 502 and flags the submission for review", async () => {
    seedAi();
    mockGradeResponse.mockRejectedValue(new Error("model down"));
    const res = await call({ submissionId: "s1" });
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("model down");
    expect(mockUpdates).toEqual([
      {
        path: "submissions/s1",
        data: { status: "pending_review", gradingError: "AI grading unavailable", graded: false },
      },
    ]);
  });

  test("AI failure does not overwrite an already-graded submission", async () => {
    seedAi({ graded: true });
    mockGradeResponse.mockRejectedValue(new Error("model down"));
    const res = await call({ submissionId: "s1" });
    expect(res.status).toBe(502);
    expect(mockUpdates).toHaveLength(0);
  });

  test("an unexpected failure outside the AI call yields a generic 500 body", async () => {
    seedAi();
    mockCheckBudget.mockRejectedValue(new Error("firestore exploded"));
    const res = await call({ submissionId: "s1" });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("firestore exploded");
  });
});
