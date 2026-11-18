// Handler-level tests for assignments, submissions and network invites. The auth wrapper is a pass-through
// (covered by auth-wrapper-rt13/19); the caller identity comes from a mocked authenticateRequest.
import { NextRequest } from "next/server";

type Doc = Record<string, unknown> | undefined;
const mockDocs = new Map<string, Doc>();
const mockWrites: Array<{ op: string; path: string; data?: unknown }> = [];
let mockCaller: { uid: string; email?: string } | null = null;
let mockBatchCommits = 0;
let mockNewId = "new-assignment-id";

type Ref = { path: string; id: string };
const mockRef = (name: string, id: string): Ref => ({ path: `${name}/${id}`, id });
const mockSnap = (path: string) => ({
  exists: mockDocs.get(path) !== undefined,
  data: () => mockDocs.get(path),
});

jest.mock("../src/lib/firebase-admin", () => ({
  adminFieldWithValue: { serverTimestamp: () => "SERVER_TS" },
  adminDb: {
    collection: (name: string) => ({
      doc: (id: string = mockNewId) => ({
        ...mockRef(name, id),
        get: async () => mockSnap(`${name}/${id}`),
      }),
    }),
    batch: () => ({
      set: (ref: Ref, data: unknown) => {
        mockWrites.push({ op: "batch.set", path: ref.path, data });
      },
      commit: async () => {
        mockBatchCommits++;
      },
    }),
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        get: async (ref: Ref) => mockSnap(ref.path),
        set: (ref: Ref, data: unknown) => {
          mockWrites.push({ op: "tx.set", path: ref.path, data });
        },
        create: (ref: Ref, data: unknown) => {
          mockWrites.push({ op: "tx.create", path: ref.path, data });
        },
      }),
  },
}));

jest.mock("../src/lib/auth-verify", () => ({
  authenticateRequest: async () => mockCaller,
  withAuthorizedRequest:
    (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) => (req: NextRequest) =>
      handler(req, {
        caller: mockCaller,
        profile: {},
        organizationId: "",
        body: {},
        requestId: "req-1",
      }),
}));

import { POST as assignmentsPost, GET as assignmentsGet } from "../src/app/api/assignments/route";
import { POST as submissionsPost } from "../src/app/api/submissions/route";
import { POST as invitesPost } from "../src/app/api/teacher/network/invites/route";

const post = (handler: (req: NextRequest) => Promise<Response>, body: unknown) =>
  handler(
    new NextRequest("https://scorpio.test/api/x", { method: "POST", body: JSON.stringify(body) }),
  );
const get = (query: string) =>
  assignmentsGet(new NextRequest(`https://scorpio.test/api/assignments${query}`));

beforeEach(() => {
  mockDocs.clear();
  mockWrites.length = 0;
  mockBatchCommits = 0;
  mockNewId = "new-assignment-id";
  mockCaller = { uid: "teacher1", email: "t@example.test" };
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe("POST /api/assignments", () => {
  const valid = {
    title: "HW1",
    rubric: "be precise",
    dueDate: "2030-01-01T00:00:00Z",
    questions: [{ id: "q1", text: "Compute", correctAnswer: "42", points: 5 }],
  };
  beforeEach(() => mockDocs.set("users/teacher1", { role: "teacher", organizationId: "org1" }));

  test("400 for an invalid assignment body", async () => {
    const res = await post(assignmentsPost, { questions: [] });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid assignment");
    expect(mockBatchCommits).toBe(0);
  });

  test("stores the public assignment and the answer key separately in one batch", async () => {
    const res = await post(assignmentsPost, valid);
    expect(await res.json()).toEqual({ id: "new-assignment-id" });
    expect(mockBatchCommits).toBe(1);
    const [assignment, key] = mockWrites;
    expect(assignment.path).toBe("assignments/new-assignment-id");
    expect(assignment.data).toMatchObject({
      title: "HW1",
      teacherId: "teacher1",
      organizationId: "org1",
      rubric: null,
      answerKeySeparated: true,
      questions: [{ id: "q1", text: "Compute", points: 5 }],
    });
    expect(JSON.stringify(assignment.data)).not.toContain("42");
    expect((assignment.data as { dueDate: Date }).dueDate).toEqual(
      new Date("2030-01-01T00:00:00Z"),
    );
    expect(key.path).toBe("assignment_keys/new-assignment-id");
    expect(key.data).toEqual({
      answers: { q1: "42" },
      rubric: "be precise",
      teacherId: "teacher1",
    });
  });

  test("null due date, missing organisation and missing rubric use safe defaults", async () => {
    mockDocs.set("users/teacher1", { role: "teacher" });
    await post(assignmentsPost, { title: "HW", questions: [{ id: "q1", text: "x" }] });
    expect(mockWrites[0].data).toMatchObject({ dueDate: null, organizationId: null });
    expect(mockWrites[1].data).toMatchObject({ rubric: "", answers: { q1: "" } });
  });

  test("AP tags are checked: unknown and other-unit topics dropped, distractors kept in the key", async () => {
    const res = await post(assignmentsPost, {
      ...valid,
      apUnit: 4,
      apTopics: ["4.3", "9.9", "2.1", "4.1", "4.3"],
      questions: [
        {
          id: "q1",
          text: "Final speed?",
          type: "numeric",
          correctAnswer: "2 m/s",
          apTopic: "4.3",
          distractors: [{ answer: "4 m/s", misconception: "momentum-kinetic-energy-confusion" }],
        },
        { id: "q2", text: "Explain", correctAnswer: "x", apTopic: "made up" },
      ],
    });
    expect(res.status).toBe(200);
    const [assignment, key] = mockWrites;
    expect(assignment.data).toMatchObject({
      apCourse: "physics-1",
      apUnit: 4,
      apTopics: ["4.1", "4.3"],
      questions: [
        { id: "q1", apTopic: "4.3" },
        expect.not.objectContaining({ apTopic: expect.anything() }),
      ],
    });
    expect(JSON.stringify(assignment.data)).not.toContain("momentum-kinetic-energy-confusion");
    expect(key.data).toMatchObject({
      distractors: {
        q1: [{ answer: "4 m/s", misconception: "momentum-kinetic-energy-confusion" }],
      },
    });
  });

  test("no AP unit stores null AP tags; topics alone imply their unit", async () => {
    await post(assignmentsPost, valid);
    expect(mockWrites[0].data).toMatchObject({ apCourse: null, apUnit: null, apTopics: [] });
    mockWrites.length = 0;
    await post(assignmentsPost, { ...valid, apTopics: ["7.2"] });
    expect(mockWrites[0].data).toMatchObject({
      apCourse: "physics-1",
      apUnit: 7,
      apTopics: ["7.2"],
    });
    expect((await post(assignmentsPost, { ...valid, apUnit: 9 })).status).toBe(400);
  });

  test("403 when the class belongs to another teacher or does not exist", async () => {
    mockDocs.set("courses/c1", { teacherId: "other" });
    const res = await post(assignmentsPost, { ...valid, courseId: "c1" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Invalid class" });
    expect((await post(assignmentsPost, { ...valid, courseId: "missing" })).status).toBe(403);
    expect(mockBatchCommits).toBe(0);
  });

  test("accepts a class owned by the teacher", async () => {
    mockDocs.set("courses/c1", { teacherId: "teacher1" });
    const res = await post(assignmentsPost, { ...valid, courseId: "c1" });
    expect(res.status).toBe(200);
    expect(mockWrites[0].data).toMatchObject({ courseId: "c1" });
  });

  test("invalid answer keys are re-validated on the server: 400 and nothing is written", async () => {
    for (const question of [
      { id: "q1", text: "Pick", type: "multiple-choice", options: ["a", "b"], correctAnswer: "c" },
      { id: "q1", text: "T/F", type: "true-false", correctAnswer: "yes" },
      { id: "q1", text: "Short", type: "short-answer", correctAnswer: "  " },
    ]) {
      const res = await post(assignmentsPost, { ...valid, questions: [question] });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/^Question 1/);
    }
    expect(mockBatchCommits).toBe(0);
  });

  test("sharing with a network requires belonging to one (403)", async () => {
    mockDocs.set("users/teacher1", { role: "teacher" });
    const res = await post(assignmentsPost, { ...valid, visibility: "network" });
    expect(res.status).toBe(403);
    expect(mockBatchCommits).toBe(0);
  });

  test("duplicate question ids are rejected with a 400 and nothing is written", async () => {
    const res = await post(assignmentsPost, {
      ...valid,
      questions: [
        { id: "q", text: "a" },
        { id: "q", text: "b" },
      ],
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Question IDs must be unique and valid");
    expect(mockBatchCommits).toBe(0);
  });
});

describe("GET /api/assignments", () => {
  const stored = {
    teacherId: "owner",
    visibility: "private",
    organizationId: "org1",
    title: "HW",
    questions: [{ id: "q1", text: "x" }],
    rubric: null,
  };
  beforeEach(() => {
    mockDocs.set("assignments/a1", stored);
    mockDocs.set("assignment_keys/a1", { answers: { q1: "secret" }, rubric: "R" });
    mockDocs.set("users/teacher1", { role: "teacher", organizationId: "org1" });
  });

  test("401 without authentication", async () => {
    mockCaller = null;
    expect((await get("?id=a1")).status).toBe(401);
  });

  test.each(["", "?id=", "?id=a/b"])("400 for a missing or invalid id (%j)", async (q) => {
    const res = await get(q);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid assignment");
  });

  test("403 for a student, an unknown assignment, or a private assignment of another teacher", async () => {
    mockDocs.set("users/teacher1", { role: "student" });
    expect((await get("?id=a1")).status).toBe(403);
    mockDocs.set("users/teacher1", { role: "teacher", organizationId: "org1" });
    expect((await get("?id=missing")).status).toBe(403);
    expect((await get("?id=a1")).status).toBe(403);
  });

  test("the owner receives the assignment merged with its answer key and rubric", async () => {
    mockDocs.set("assignments/a1", { ...stored, teacherId: "teacher1" });
    const json = await (await get("?id=a1")).json();
    expect(json.questions[0].correctAnswer).toBe("secret");
    expect(json.rubric).toBe("R");
  });

  test("a global assignment is readable by any teacher", async () => {
    mockDocs.set("assignments/a1", { ...stored, visibility: "global" });
    expect((await get("?id=a1")).status).toBe(200);
  });

  // Answer-key leak (Sprint 1): only the owner may see correctAnswer or the rubric.
  const legacyQuestions = [
    {
      id: "q1",
      text: "x",
      correctAnswer: "legacy",
      answer: "a",
      expectedAnswer: "e",
      options: ["a", "b"],
      points: 3,
    },
  ];
  test("a teacher from another organisation gets a global assignment without answers or rubric", async () => {
    mockDocs.set("assignments/a1", {
      ...stored,
      visibility: "global",
      rubric: "inline rubric",
      questions: legacyQuestions,
    });
    mockDocs.set("users/teacher1", { role: "teacher", organizationId: "org2" });
    const res = await get("?id=a1");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).not.toHaveProperty("rubric");
    expect(json.questions).toEqual([{ id: "q1", text: "x", options: ["a", "b"], points: 3 }]);
    const body = JSON.stringify(json);
    for (const secret of [
      "secret",
      "legacy",
      '"R"',
      "inline rubric",
      "correctAnswer",
      "expectedAnswer",
    ])
      expect(body).not.toContain(secret);
  });

  test("a same-organisation teacher who is not the owner gets a network assignment without answers or rubric", async () => {
    mockDocs.set("assignments/a1", {
      ...stored,
      visibility: "network",
      questions: legacyQuestions,
    });
    const json = await (await get("?id=a1")).json();
    expect(json.questions[0]).not.toHaveProperty("correctAnswer");
    expect(json.questions[0]).not.toHaveProperty("answer");
    expect(json).not.toHaveProperty("rubric");
    expect(JSON.stringify(json)).not.toContain("secret");
  });

  test("the owner of a shared assignment still receives the full key", async () => {
    mockDocs.set("assignments/a1", { ...stored, visibility: "global", teacherId: "teacher1" });
    const json = await (await get("?id=a1")).json();
    expect(json.questions[0].correctAnswer).toBe("secret");
    expect(json.rubric).toBe("R");
  });

  test("a network assignment is readable only inside the same organisation", async () => {
    mockDocs.set("assignments/a1", { ...stored, visibility: "network" });
    expect((await get("?id=a1")).status).toBe(200);
    mockDocs.set("users/teacher1", { role: "teacher", organizationId: "org2" });
    expect((await get("?id=a1")).status).toBe(403);
    mockDocs.set("users/teacher1", { role: "teacher" });
    expect((await get("?id=a1")).status).toBe(403);
  });

  test("works when no answer key exists", async () => {
    mockDocs.set("assignments/a1", { ...stored, teacherId: "teacher1" });
    mockDocs.delete("assignment_keys/a1");
    const json = await (await get("?id=a1")).json();
    expect(json.questions[0].correctAnswer).toBe("");
    expect(json.rubric).toBe("");
  });
});

describe("POST /api/submissions", () => {
  const futureFile = (path: string, host = "firebasestorage.googleapis.com", bucket = "bkt") => ({
    url: `https://${host}/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media`,
    name: "f.png",
  });
  const assignment = {
    answerKeySeparated: true,
    teacherId: "teacher1",
    courseId: "c1",
    visibility: "private",
    questions: [
      { id: "q1", text: "One", points: 4 },
      { id: "q2", text: "Two" },
    ],
    dueDate: { toDate: () => new Date("2000-01-01") },
  };
  const saved = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  beforeEach(() => {
    mockCaller = { uid: "stu1", email: "s@example.test" };
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = "bkt";
    mockDocs.set("users/stu1", {
      role: "student",
      teacherId: "teacher1",
      courseId: "c1",
      displayName: "Ada",
      organizationId: "org1",
    });
    mockDocs.set("assignments/a1", assignment);
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
    else process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = saved;
  });

  test.each([
    [{ assignmentId: "a1", status: "submitted", submissionId: "a/b" }, "Invalid submission ID"],
    [{ assignmentId: "a1", status: "submitted", answers: "x" }, "Invalid answers"],
    [
      {
        assignmentId: "a1",
        status: "submitted",
        workFiles: Array.from({ length: 21 }, () => ({ url: "https://x.test" })),
      },
      "Too many attachments",
    ],
    [{ assignmentId: "a1", status: "submitted", workFiles: [{}] }, "Invalid attachment"],
    [{ assignmentId: "a1", status: "bogus" }, "Invalid submission"],
  ])("400 %j", async (body, message) => {
    const res = await post(submissionsPost, body);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(message);
  });

  test("403 for a non-student", async () => {
    mockDocs.set("users/stu1", { role: "teacher" });
    const res = await post(submissionsPost, { assignmentId: "a1", status: "submitted" });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("Student account required");
  });

  test("rejects an unavailable assignment (missing or without separated keys)", async () => {
    mockDocs.delete("assignments/a1");
    expect((await post(submissionsPost, { assignmentId: "a1", status: "submitted" })).status).toBe(
      400,
    );
    mockDocs.set("assignments/a1", { ...assignment, answerKeySeparated: false });
    const res = await post(submissionsPost, { assignmentId: "a1", status: "submitted" });
    expect((await res.json()).error).toBe("Assignment unavailable");
    expect(mockWrites).toHaveLength(0);
  });

  test("rejects a student who is not enrolled in the class", async () => {
    mockDocs.set("users/stu1", { role: "student", courseId: "other" });
    const res = await post(submissionsPost, { assignmentId: "a1", status: "submitted" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("You are not enrolled in this assignment");
  });

  test("without a class, enrolment follows the teacher", async () => {
    mockDocs.set("assignments/a1", { ...assignment, courseId: undefined });
    expect(
      (await post(submissionsPost, { assignmentId: "a1", status: "draft", answers: [] })).status,
    ).toBe(200);
    mockDocs.set("users/stu1", { role: "student", teacherId: "someone-else" });
    expect(
      (await post(submissionsPost, { assignmentId: "a1", status: "draft", answers: [] })).status,
    ).toBe(400);
  });

  test("global and same-network assignments are open to the student", async () => {
    mockDocs.set("users/stu1", { role: "student", organizationId: "org1" });
    mockDocs.set("assignments/a1", { ...assignment, visibility: "global" });
    expect(
      (await post(submissionsPost, { assignmentId: "a1", status: "draft", answers: [] })).status,
    ).toBe(200);
    mockDocs.set("assignments/a1", {
      ...assignment,
      visibility: "network",
      organizationId: "org1",
      courseId: "zzz",
    });
    expect(
      (await post(submissionsPost, { assignmentId: "a1", status: "draft", answers: [] })).status,
    ).toBe(200);
  });

  test("stores a submitted attempt under a stable id with answers aligned to questions", async () => {
    const res = await post(submissionsPost, {
      assignmentId: "a1",
      status: "submitted",
      unfocusCount: 3,
      answers: [
        { questionId: "q1", answer: "forty" },
        { questionId: "ignored", answer: "x" },
      ],
    });
    expect(await res.json()).toEqual({ id: "stu1_a1" });
    expect(mockWrites).toHaveLength(1);
    expect(mockWrites[0].path).toBe("submissions/stu1_a1");
    expect(mockWrites[0].data).toMatchObject({
      assignmentId: "a1",
      studentId: "stu1",
      studentName: "Ada",
      studentEmail: "s@example.test",
      teacherId: "teacher1",
      courseId: "c1",
      status: "submitted",
      isLate: true,
      graded: false,
      totalPoints: 14,
      earnedPoints: null,
      unfocusCount: 3,
      workFiles: [],
      answers: [
        { questionId: "q1", questionText: "One", answer: "forty" },
        { questionId: "q2", questionText: "Two", answer: "" },
      ],
    });
    expect(mockWrites[0].data).toHaveProperty("submittedAt");
  });

  test("a draft has no submittedAt, uses an explicit submission id and clamps a negative focus count", async () => {
    const res = await post(submissionsPost, {
      assignmentId: "a1",
      status: "draft",
      submissionId: "mine",
      answers: [],
      unfocusCount: -5,
    });
    expect(await res.json()).toEqual({ id: "mine" });
    expect(mockWrites[0].data).not.toHaveProperty("submittedAt");
    expect(mockWrites[0].data).toMatchObject({ unfocusCount: 0 });
  });

  test("non-numeric focus count defaults to 0 and an assignment without a due date is not late", async () => {
    mockDocs.set("assignments/a1", { ...assignment, dueDate: undefined, questions: undefined });
    await post(submissionsPost, {
      assignmentId: "a1",
      status: "submitted",
      answers: [],
      unfocusCount: "many",
    });
    expect(mockWrites[0].data).toMatchObject({
      unfocusCount: 0,
      isLate: false,
      totalPoints: 0,
      answers: [],
    });
  });

  test("missing answers array is rejected for a new attempt", async () => {
    const res = await post(submissionsPost, { assignmentId: "a1", status: "submitted" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid answers");
  });

  test("over-long answer text is rejected", async () => {
    const res = await post(submissionsPost, {
      assignmentId: "a1",
      status: "submitted",
      answers: [{ questionId: "q1", answer: "x".repeat(50001) }],
    });
    expect((await res.json()).error).toBe("Answer is too long");
    const nonString = await post(submissionsPost, {
      assignmentId: "a1",
      status: "submitted",
      answers: [{ questionId: "q1", answer: 123 }],
    });
    expect((await nonString.json()).error).toBe("Answer is too long");
    expect(mockWrites).toHaveLength(0);
  });

  test("an existing attempt owned by someone else is refused", async () => {
    mockDocs.set("submissions/stu1_a1", {
      studentId: "other",
      assignmentId: "a1",
      status: "draft",
    });
    const res = await post(submissionsPost, {
      assignmentId: "a1",
      status: "submitted",
      answers: [],
    });
    expect((await res.json()).error).toBe("Access denied");
    mockDocs.set("submissions/stu1_a1", {
      studentId: "stu1",
      assignmentId: "different",
      status: "draft",
    });
    expect(
      (await post(submissionsPost, { assignmentId: "a1", status: "submitted", answers: [] }))
        .status,
    ).toBe(400);
  });

  test("re-submitting a final attempt is idempotent and never overwrites; saving a draft over it is refused", async () => {
    mockDocs.set("submissions/stu1_a1", {
      studentId: "stu1",
      assignmentId: "a1",
      status: "graded",
      score: 90,
    });
    const again = await post(submissionsPost, {
      assignmentId: "a1",
      status: "submitted",
      answers: [],
    });
    expect(await again.json()).toEqual({ id: "stu1_a1" });
    expect(mockWrites).toHaveLength(0);
    const draft = await post(submissionsPost, { assignmentId: "a1", status: "draft", answers: [] });
    expect(draft.status).toBe(400);
    expect((await draft.json()).error).toBe("This submission is already final");
  });

  test("an existing draft can be updated", async () => {
    mockDocs.set("submissions/stu1_a1", { studentId: "stu1", assignmentId: "a1", status: "draft" });
    expect(
      (await post(submissionsPost, { assignmentId: "a1", status: "submitted", answers: [] }))
        .status,
    ).toBe(200);
    expect(mockWrites).toHaveLength(1);
  });

  test("accepts attachments inside the student own submissions folder", async () => {
    const file = futureFile("submissions/stu1/work.png");
    await post(submissionsPost, {
      assignmentId: "a1",
      status: "submitted",
      answers: [],
      workFiles: [file],
    });
    expect(mockWrites[0].data).toMatchObject({ workFiles: [file] });
  });

  test.each([
    ["another user folder", futureFile("submissions/other/work.png")],
    ["wrong host", futureFile("submissions/stu1/work.png", "evil.test")],
    [
      "wrong bucket",
      futureFile("submissions/stu1/work.png", "firebasestorage.googleapis.com", "other-bucket"),
    ],
    ["not a URL", { url: "not a url" }],
    [
      "http scheme",
      { url: "http://firebasestorage.googleapis.com/v0/b/bkt/o/submissions%2Fstu1%2Fa.png" },
    ],
  ])("rejects an attachment with %s", async (_name, file) => {
    const res = await post(submissionsPost, {
      assignmentId: "a1",
      status: "submitted",
      answers: [],
      workFiles: [file],
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid attachment");
    expect(mockWrites).toHaveLength(0);
  });

  test("rejects every attachment when the storage bucket is not configured", async () => {
    delete process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
    const res = await post(submissionsPost, {
      assignmentId: "a1",
      status: "submitted",
      answers: [],
      workFiles: [futureFile("submissions/stu1/work.png")],
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/teacher/network/invites", () => {
  beforeEach(() => {
    mockDocs.set("users/teacher1", { role: "teacher", organizationId: "org1" });
    mockDocs.set("organizations/org1", { ownerId: "teacher1", name: "Physics Dept" });
  });

  test("the network owner creates a 7-day invite code", async () => {
    const before = Date.now();
    const res = await post(invitesPost, {});
    expect(res.status).toBe(201);
    const { code } = await res.json();
    expect(code).toMatch(/^SCORP-[0-9A-F]{32}$/);
    expect(mockWrites).toHaveLength(1);
    expect(mockWrites[0]).toMatchObject({ op: "tx.create", path: `teacherInviteCodes/${code}` });
    expect(mockWrites[0].data).toMatchObject({
      code,
      label: "Physics Dept",
      organizationId: "org1",
      createdBy: "teacher1",
      createdAt: "SERVER_TS",
      isUsed: false,
      usedAt: null,
      usedBy: null,
      usedByEmail: null,
    });
    const expires = (mockWrites[0].data as { expiresAt: Date }).expiresAt.getTime();
    expect(expires - before).toBeGreaterThan(7 * 24 * 3600 * 1000 - 5000);
    expect(expires - before).toBeLessThan(7 * 24 * 3600 * 1000 + 5000);
  });

  test("uses a default label when the network has no name", async () => {
    mockDocs.set("organizations/org1", { ownerId: "teacher1" });
    await post(invitesPost, {});
    expect(mockWrites[0].data).toMatchObject({ label: "Network invitation" });
  });

  test.each([
    ["non-owner teacher", () => mockDocs.set("organizations/org1", { ownerId: "someone" })],
    ["missing network", () => mockDocs.delete("organizations/org1")],
    ["teacher without organisation", () => mockDocs.set("users/teacher1", { role: "teacher" })],
    [
      "student account",
      () => mockDocs.set("users/teacher1", { role: "student", organizationId: "org1" }),
    ],
    ["missing profile", () => mockDocs.delete("users/teacher1")],
  ])("403 and no invite for a %s", async (_name, arrange) => {
    arrange();
    const res = await post(invitesPost, {});
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/Only the Network owner/);
    expect(mockWrites).toHaveLength(0);
  });
});
