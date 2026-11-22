// GET /api/assignments/{id}/solutions: every allow and deny branch. The auth wrapper is a
// pass-through here (covered by auth-wrapper-rt13/19); caller and profile come from the test.
import { NextRequest } from "next/server";

type Doc = Record<string, unknown> | undefined;
const mockDocs = new Map<string, Doc>();
const mockReads: string[] = [];
let mockCaller = { uid: "stu1" };
let mockProfile: Record<string, unknown> = {};

jest.mock("../src/lib/firebase-admin", () => ({
  adminDb: {
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => {
          mockReads.push(`${name}/${id}`);
          return { data: () => mockDocs.get(`${name}/${id}`) };
        },
      }),
      where: (f1: string, _o1: string, v1: unknown) => ({
        where: (f2: string, _o2: string, v2: unknown) => ({
          limit: () => ({
            get: async () => ({
              docs: [...mockDocs.entries()]
                .filter(
                  ([path, d]) => path.startsWith(`${name}/`) && d?.[f1] === v1 && d?.[f2] === v2,
                )
                .map(([, d]) => ({ data: () => d })),
            }),
          }),
        }),
      }),
    }),
  },
}));

jest.mock("../src/lib/auth-verify", () => ({
  withAuthorizedRequest:
    (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) => (req: NextRequest) =>
      handler(req, { caller: mockCaller, profile: mockProfile, requestId: "req-1" }),
}));

import { GET } from "../src/app/api/assignments/[id]/solutions/route";

const NOW = new Date("2026-11-21T12:00:00Z");
const PAST = new Date("2026-11-20T12:00:00Z");
const FUTURE = new Date("2026-11-22T12:00:00Z");

const call = (id = "a1") =>
  GET(new NextRequest(`https://scorpio.test/api/assignments/${id}/solutions`));

const assignment = (extra: Record<string, unknown> = {}) => ({
  teacherId: "teach1",
  courseId: "class1",
  answerKeySeparated: true,
  dueDate: PAST,
  questions: [
    { id: "q1", text: "Pick", type: "multiple-choice", options: ["a", "b"] },
    { id: "q2", text: "Explain", type: "text" },
  ],
  ...extra,
});
const seed = (a: Record<string, unknown> = {}) => {
  mockDocs.set("assignments/a1", assignment(a));
  mockDocs.set("assignment_keys/a1", {
    answers: { q1: "KEY-b", q2: "KEY-guide" },
    teacherId: "teach1",
  });
  mockDocs.set("assignment_solutions/a1", { solutions: { q1: "WORKED-1" }, teacherId: "teach1" });
};
const submit = (extra: Record<string, unknown> = {}, id = "stu1_a1") =>
  mockDocs.set(`submissions/${id}`, {
    assignmentId: "a1",
    studentId: "stu1",
    status: "graded",
    graded: true,
    ...extra,
  });

beforeEach(() => {
  mockDocs.clear();
  mockReads.length = 0;
  mockCaller = { uid: "stu1" };
  mockProfile = { role: "student", courseId: "class1", teacherId: "teach1" };
  jest.useFakeTimers({ now: NOW, doNotFake: ["nextTick", "setImmediate"] });
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("a student", () => {
  test("graded and past the due date: answers with worked solutions, only for questions that have one", async () => {
    seed();
    submit();
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      solutions: { q1: { answer: "KEY-b", solution: "WORKED-1" } },
    });
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  test("before the due date: nothing, and when they appear", async () => {
    seed({ dueDate: FUTURE });
    submit();
    const res = await call();
    expect(await res.json()).toEqual({
      solutions: {},
      pending: "due",
      availableAt: FUTURE.toISOString(),
    });
    expect(mockReads).not.toContain("assignment_keys/a1");
  });

  test("exactly at the due date is not yet after it", async () => {
    seed({ dueDate: NOW });
    submit();
    expect((await (await call()).json()).pending).toBe("due");
  });

  test("a Firestore timestamp due date is read with the server's clock", async () => {
    seed({ dueDate: { toDate: () => FUTURE } });
    submit();
    expect((await (await call()).json()).pending).toBe("due");
  });

  test.each([
    ["no submission", null],
    ["a draft", { status: "draft", graded: false }],
    ["handed in, not graded yet", { status: "submitted", graded: false }],
    ["waiting for the teacher's review", { status: "pending_review", graded: false }],
    ["a draft that claims to be graded", { status: "draft", graded: true }],
  ])("past due but %s: nothing", async (_name, submission) => {
    seed();
    if (submission) submit(submission);
    const res = await call();
    expect(await res.json()).toEqual({ solutions: {}, pending: "graded" });
    expect(mockReads).not.toContain("assignment_keys/a1");
  });

  test("graded by the teacher by hand (status stays submitted) counts as graded", async () => {
    seed();
    submit({ status: "submitted", graded: true });
    expect((await (await call()).json()).solutions.q1.solution).toBe("WORKED-1");
  });

  test("a late submission sees solutions once it is graded", async () => {
    seed();
    submit({ isLate: true });
    expect((await (await call()).json()).solutions.q1.answer).toBe("KEY-b");
  });

  test("no due date: allowed once graded", async () => {
    seed({ dueDate: null });
    submit();
    expect((await (await call()).json()).solutions.q1.solution).toBe("WORKED-1");
    mockDocs.delete("submissions/stu1_a1");
    expect(await (await call()).json()).toEqual({ solutions: {}, pending: "graded" });
  });

  test("a submission stored under an older id is found by its student and assignment", async () => {
    seed();
    submit({}, "legacy-id");
    expect((await (await call()).json()).solutions.q1.solution).toBe("WORKED-1");
  });

  test("someone else's submission under the stable id does not count", async () => {
    seed();
    submit({ studentId: "other" });
    expect(await (await call()).json()).toEqual({ solutions: {}, pending: "graded" });
  });

  test("no solutions doc: the key is never read, so nothing new is exposed", async () => {
    seed();
    mockDocs.delete("assignment_solutions/a1");
    submit();
    expect(await (await call()).json()).toEqual({ solutions: {} });
    expect(mockReads).not.toContain("assignment_keys/a1");
  });

  test("an empty or malformed solutions doc is treated as none", async () => {
    seed();
    submit();
    for (const doc of [
      { solutions: {} },
      { solutions: { q1: "  " } },
      { solutions: "x" },
      { solutions: { other: "W" } },
    ]) {
      mockDocs.set("assignment_solutions/a1", doc);
      expect(await (await call()).json()).toEqual({ solutions: {} });
    }
    expect(mockReads).not.toContain("assignment_keys/a1");
  });

  test("no solutions doc: an answer already in the public question is returned once graded, as the page showed before", async () => {
    seed({
      dueDate: FUTURE,
      questions: [
        { id: "q1", text: "Old", correctAnswer: "PUBLIC" },
        { id: "q2", text: "New" },
      ],
    });
    mockDocs.delete("assignment_solutions/a1");
    expect(await (await call()).json()).toEqual({ solutions: {} });
    submit();
    expect(await (await call()).json()).toEqual({ solutions: { q1: { answer: "PUBLIC" } } });
  });

  test.each([
    ["in another class", { role: "student", courseId: "class2", teacherId: "teach1" }],
    ["with no class", { role: "student" }],
  ])("%s is refused, with the same reply as a missing assignment", async (_name, profile) => {
    seed();
    submit();
    mockProfile = profile;
    const res = await call();
    const missing = await call("nope");
    expect(res.status).toBe(403);
    expect(missing.status).toBe(403);
    expect(await res.json()).toEqual(await missing.json());
    expect(mockReads).not.toContain("assignment_solutions/a1");
    expect(mockReads).not.toContain("assignment_keys/a1");
  });

  test("an assignment without a class goes by the student's teacher", async () => {
    seed({ courseId: null });
    submit();
    mockProfile = { role: "student", teacherId: "teach1" };
    expect((await call()).status).toBe(200);
    mockProfile = { role: "student", teacherId: "teach2" };
    expect((await call()).status).toBe(403);
  });

  test("an assignment whose key is still inside it (not migrated) is refused", async () => {
    seed({ answerKeySeparated: false });
    submit();
    expect((await call()).status).toBe(403);
  });
});

describe("teachers", () => {
  test("the owner always gets every answer and solution, before the due date and with no submission", async () => {
    seed({ dueDate: FUTURE });
    mockCaller = { uid: "teach1" };
    mockProfile = { role: "teacher" };
    expect(await (await call()).json()).toEqual({
      solutions: { q1: { answer: "KEY-b", solution: "WORKED-1" }, q2: { answer: "KEY-guide" } },
    });
  });

  test("another teacher is refused, even for a shared assignment", async () => {
    seed({ visibility: "global" });
    mockCaller = { uid: "teach2" };
    mockProfile = { role: "teacher", organizationId: "o1" };
    expect((await call()).status).toBe(403);
    expect(mockReads).not.toContain("assignment_keys/a1");
  });

  test("a student account with the owner's uid in teacherId is not the owner", async () => {
    seed({ dueDate: FUTURE, teacherId: "stu1", courseId: "class1" });
    expect(await (await call()).json()).toMatchObject({ solutions: {}, pending: "due" });
  });
});

test("an unexpected failure is a generic 500", async () => {
  seed();
  const broken = {};
  Object.defineProperty(broken, "answerKeySeparated", {
    get() {
      throw new Error("secret detail");
    },
  });
  mockDocs.set("assignments/a1", broken);
  const res = await call();
  expect(res.status).toBe(500);
  expect(JSON.stringify(await res.json())).not.toContain("secret detail");
});
