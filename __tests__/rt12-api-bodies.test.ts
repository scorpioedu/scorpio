// RT-12 (G-001, G-005, G-009): request-body schemas for the six highest-value routes.
// "characterization" tests use payloads copied from the real client call sites and must keep passing;
// "red" tests describe malformed input that used to be accepted or to crash and must now get a 400.
import { NextRequest } from "next/server";

type Doc = Record<string, unknown> | undefined;
const store: Record<string, Doc> = {};
const written: Array<{ path: string; data: Record<string, unknown>; via: string }> = [];
const queryDocs: { docs: Array<{ id: string; data: () => Record<string, unknown> }> } = {
  docs: [],
};
const runTransactionSpy = jest.fn();
const verifyIdToken = jest.fn();
let autoId = 0;

const snap = (data: Doc) => ({ exists: data !== undefined, data: () => data });
const ref = (coll: string, id: string) => ({
  __path: `${coll}/${id}`,
  id,
  get: async () => snap(store[`${coll}/${id}`]),
  set: async (d: Record<string, unknown>) => {
    written.push({ path: `${coll}/${id}`, data: d, via: "set" });
  },
  update: async (d: Record<string, unknown>) => {
    written.push({ path: `${coll}/${id}`, data: d, via: "update" });
  },
  delete: async () => undefined,
});
const query: Record<string, unknown> = {};
for (const m of ["orderBy", "limit", "where"]) query[m] = () => query;
query.get = async () => ({ empty: queryDocs.docs.length === 0, docs: queryDocs.docs });
query.__query = true;

// The class switch has its own suite (student-ai.test.ts); in this one Raise is on for the class.
jest.mock("../src/lib/student-ai-server", () => ({
  studentAiAllowed: async () => true,
  studentAiOffResponse: () => {
    throw new Error("student AI should be on in this suite");
  },
}));
jest.mock("../src/lib/firebase-admin", () => ({
  adminAuth: {
    verifyIdToken: (...a: unknown[]) => verifyIdToken(...a),
    verifySessionCookie: jest.fn(),
  },
  adminFieldWithValue: { serverTimestamp: () => "TS", increment: (n: number) => ({ inc: n }) },
  adminDb: {
    collection: (coll: string) =>
      Object.assign(Object.create(query), {
        doc: (id?: string) => ref(coll, id ?? `new${++autoId}`),
        add: async (d: Record<string, unknown>) => {
          written.push({ path: `${coll}/auto`, data: d, via: "add" });
          return { id: "auto" };
        },
      }),
    batch: () => ({
      set: (r: { __path: string }, d: Record<string, unknown>) => {
        written.push({ path: r.__path, data: d, via: "batch" });
      },
      commit: async () => undefined,
    }),
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      runTransactionSpy();
      return fn({
        get: async (r: { __path?: string; __query?: boolean }) =>
          r.__query
            ? { empty: queryDocs.docs.length === 0, docs: queryDocs.docs }
            : snap(store[r.__path as string]),
        set: (r: { __path: string }, d: Record<string, unknown>) => {
          written.push({ path: r.__path, data: d, via: "tx.set" });
        },
        update: (r: { __path: string }, d: Record<string, unknown>) => {
          written.push({ path: r.__path, data: d, via: "tx.update" });
        },
      });
    },
  },
}));
const checkBudget = jest.fn(async () => ({ allowed: true }));
jest.mock("../src/lib/usage-limit", () => ({
  checkBudget: (...a: unknown[]) => (checkBudget as jest.Mock)(...a),
  recordUsage: jest.fn(async () => undefined),
}));
jest.mock("../src/lib/rate-limit", () => ({
  checkRateLimit: async () => ({ allowed: true }),
  enforceRateLimit: async () => null,
}));
const notebookAi = jest.fn(async () => ({ content: "copilot says hi", usage: null }));
jest.mock("../src/lib/ai/notebook", () => ({
  getNotebookAssistantResponse: (...a: unknown[]) => (notebookAi as jest.Mock)(...a),
}));
jest.mock("../src/lib/ai/grading", () => ({ gradeResponse: jest.fn() }));
jest.mock("../src/lib/polar", () => ({
  polar: { checkouts: { create: async () => ({ url: "https://polar.test/c/1" }) } },
}));

import { POST as assignmentsPost } from "../src/app/api/assignments/route";
import { POST as notebookPost } from "../src/app/api/notebook/chat/route";
import { POST as accessPost } from "../src/app/api/auth/request-access/route";
import { POST as submissionsPost } from "../src/app/api/submissions/route";
import { POST as gradePost } from "../src/app/api/grade/route";
import { POST as checkoutPost } from "../src/app/api/checkout/route";

const post = (path: string, body: unknown, auth = true) =>
  new NextRequest(`https://scorpio.test${path}`, {
    method: "POST",
    headers: auth ? { Authorization: "Bearer t" } : {},
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
type Json = {
  error?: string;
  fields?: Array<{ path: string; message: string }>;
  [key: string]: unknown;
};
const json = async (res: Response) => res.json() as Promise<Json>;
const writesTo = (prefix: string) => written.filter((w) => w.path.startsWith(prefix));

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(store)) delete store[k];
  written.length = 0;
  queryDocs.docs = [];
  autoId = 0;
  verifyIdToken.mockResolvedValue({ uid: "u1", email: "u1@school.test" });
  process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = "bkt";
  process.env.POLAR_MONTHLY_ID = "price_monthly";
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

const teacher = { role: "teacher", organizationId: "org1", displayName: "T" };
const student = { role: "student", teacherId: "t1", displayName: "Stu", organizationId: "org1" };

// ─── POST /api/assignments ────────────────────────────────────────────────
describe("POST /api/assignments", () => {
  // Shape copied from src/app/teacher/create/page.tsx (JSON-serialised dates).
  const clientBody = () => ({
    title: "Kinematics",
    description: "d",
    topic: "physics",
    teacherId: "u1",
    organizationId: "org1",
    visibility: "private",
    courseId: null,
    dueDate: "2026-12-01T10:00:00.000Z",
    timeLimit: null,
    gradingType: "manual",
    requireWorkSubmission: false,
    enableTabDetection: true,
    lockdownMode: false,
    allowAIHelp: true,
    allowCalculator: true,
    totalPoints: 10,
    createdAt: "2026-11-11T00:00:00.000Z",
    type: "standard",
    googleFormLink: null,
    rubric: null,
    questions: [
      {
        id: "q1",
        text: "Pick",
        type: "multiple-choice",
        options: ["a", "b"],
        correctAnswer: "a",
        points: 5,
      },
      { id: "q2", text: "Say", type: "text", correctAnswer: "rubric words", points: 5 },
    ],
  });
  beforeEach(() => {
    store["users/u1"] = teacher;
  });

  it("characterization: the create-page payload is accepted and stored with server-owned fields", async () => {
    const res = await assignmentsPost(post("/api/assignments", clientBody()));
    expect(res.status).toBe(200);
    const doc = writesTo("assignments/")[0].data;
    expect(doc).toMatchObject({
      title: "Kinematics",
      visibility: "private",
      teacherId: "u1",
      organizationId: "org1",
      gradingType: "manual",
      enableTabDetection: true,
      totalPoints: 10,
      type: "standard",
      rubric: null,
      answerKeySeparated: true,
    });
    expect(doc.dueDate).toEqual(new Date("2026-12-01T10:00:00.000Z"));
    expect((doc.questions as Array<Record<string, unknown>>)[0]).toMatchObject({
      id: "q1",
      options: ["a", "b"],
      points: 5,
    });
    expect((doc.questions as Array<Record<string, unknown>>)[0]).not.toHaveProperty(
      "correctAnswer",
    );
    expect(writesTo("assignment_keys/")[0].data).toMatchObject({
      answers: { q1: "a", q2: "rubric words" },
      teacherId: "u1",
    });
  });

  it("red: unknown top-level fields are dropped instead of spread into Firestore", async () => {
    const res = await assignmentsPost(
      post("/api/assignments", {
        ...clientBody(),
        isAdmin: true,
        answerKeySeparated: false,
        evil: { $set: 1 },
      }),
    );
    expect(res.status).toBe(200);
    const doc = writesTo("assignments/")[0].data;
    expect(doc).not.toHaveProperty("isAdmin");
    expect(doc).not.toHaveProperty("evil");
    expect(doc.answerKeySeparated).toBe(true);
  });

  it("red: an unparsable dueDate is a 400 naming the field", async () => {
    const res = await assignmentsPost(
      post("/api/assignments", { ...clientBody(), dueDate: "not-a-date" }),
    );
    expect(res.status).toBe(400);
    expect((await json(res)).fields).toEqual([expect.objectContaining({ path: "dueDate" })]);
  });

  it("red: a non-string title is rejected", async () => {
    expect(
      (await assignmentsPost(post("/api/assignments", { ...clientBody(), title: 42 }))).status,
    ).toBe(400);
  });

  it("red: a question without text is a field error, not the generic authorization failure", async () => {
    const res = await assignmentsPost(
      post("/api/assignments", { ...clientBody(), questions: [{ id: "q1" }] }),
    );
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Invalid assignment");
    expect(body.fields?.[0].path).toBe("questions.0.text");
  });

  it("red: a courseId containing a slash is rejected", async () => {
    expect(
      (await assignmentsPost(post("/api/assignments", { ...clientBody(), courseId: "a/b" })))
        .status,
    ).toBe(400);
  });

  it('keeps the existing "Invalid assignment" 400 for missing title and >100 questions', async () => {
    const noTitle = { ...clientBody(), title: "" };
    expect(await json(await assignmentsPost(post("/api/assignments", noTitle)))).toMatchObject({
      error: "Invalid assignment",
    });
    const many = {
      ...clientBody(),
      questions: Array.from({ length: 101 }, (_, i) => ({ id: `q${i}`, text: "t" })),
    };
    const res = await assignmentsPost(post("/api/assignments", many));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe("Invalid assignment");
  });
});

// ─── POST /api/notebook/chat ──────────────────────────────────────────────
describe("POST /api/notebook/chat", () => {
  beforeEach(() => {
    store["users/u1"] = student;
    store["organizations/org1"] = { notebookLimit: 50, notebookUsageCurrent: 0 };
  });
  // Shape from src/app/student/notebook/page.tsx.
  const clientBody = () => ({
    messages: [{ role: "user", content: "What is torque?" }],
    notebookContent: "notes",
    studentId: "u1",
  });

  it("characterization: the notebook payload gets a Copilot answer", async () => {
    const res = await notebookPost(post("/api/notebook/chat", clientBody()));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ content: "copilot says hi" });
    expect(notebookAi).toHaveBeenCalledTimes(1);
  });

  it("characterization: a conversation ending in an assistant turn is still accepted", async () => {
    const body = {
      ...clientBody(),
      messages: [
        { role: "user", content: "a" },
        { role: "assistant", content: "b" },
        { role: "user", content: "c" },
      ],
    };
    expect((await notebookPost(post("/api/notebook/chat", body))).status).toBe(200);
  });

  it('characterization: missing messages keeps "Missing required parameters"', async () => {
    const res = await notebookPost(
      post("/api/notebook/chat", { notebookContent: "x", studentId: "u1" }),
    );
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe("Missing required parameters");
  });

  it("red: an empty messages array is a 400 and never reaches the model", async () => {
    const res = await notebookPost(post("/api/notebook/chat", { ...clientBody(), messages: [] }));
    expect(res.status).toBe(400);
    expect(notebookAi).not.toHaveBeenCalled();
  });

  it.each([
    ["unknown role", [{ role: "system", content: "x" }]],
    ["numeric content", [{ role: "user", content: 5 }]],
    ["non-object entry", ["hello"]],
    ["oversized content", [{ role: "user", content: "x".repeat(50001) }]],
  ])("red: %s is a 400 with field paths only", async (_n, messages) => {
    const res = await notebookPost(post("/api/notebook/chat", { ...clientBody(), messages }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.fields?.[0].path).toMatch(/^messages\.0/);
    expect(JSON.stringify(body)).not.toMatch(/TypeError|Cannot read/);
    expect(notebookAi).not.toHaveBeenCalled();
  });

  it("red: messages that is not an array no longer crashes with a 500", async () => {
    const res = await notebookPost(post("/api/notebook/chat", { ...clientBody(), messages: "hi" }));
    expect(res.status).toBe(400);
  });

  it("red: unknown message keys are stripped before the model call", async () => {
    const body = { ...clientBody(), messages: [{ role: "user", content: "q", secret: "x" }] };
    await notebookPost(post("/api/notebook/chat", body));
    expect((notebookAi.mock.calls[0] as unknown[][])[0]).toEqual([{ role: "user", content: "q" }]);
  });
});

// ─── POST /api/auth/request-access ────────────────────────────────────────
describe("POST /api/auth/request-access", () => {
  // Shape from src/app/request-access/page.tsx.
  const submit = () => ({
    name: " Ada Lovelace ",
    email: "Ada@School.test ",
    institution: "Analytical HS",
    role: "Teacher",
    message: "",
  });

  it("characterization: the public form submission is stored normalised", async () => {
    const res = await accessPost(post("/api/auth/request-access", submit(), false));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ success: true });
    const created = writesTo("accessRequests/")[0].data;
    expect(created).toMatchObject({
      name: "Ada Lovelace",
      email: "ada@school.test",
      institution: "Analytical HS",
      role: "Teacher",
      message: null,
      status: "pending",
    });
  });

  it("characterization: existing validation messages and statuses are unchanged", async () => {
    let res = await accessPost(
      post("/api/auth/request-access", { ...submit(), name: "  " }, false),
    );
    expect([res.status, (await json(res)).error]).toEqual([400, "Missing required fields."]);
    res = await accessPost(post("/api/auth/request-access", { institution: "x" }, false));
    expect([res.status, (await json(res)).error]).toEqual([400, "Missing required fields."]);
    res = await accessPost(post("/api/auth/request-access", { ...submit(), email: "nope" }, false));
    expect([res.status, (await json(res)).error]).toEqual([400, "Invalid email address."]);
    queryDocs.docs = [{ id: "x", data: () => ({}) }];
    res = await accessPost(post("/api/auth/request-access", submit(), false));
    expect(res.status).toBe(409);
  });

  it("characterization: admin list/approve/reject keep their responses", async () => {
    verifyIdToken.mockResolvedValue({ uid: "root", admin: true });
    const list = await accessPost(post("/api/auth/request-access", { action: "list" }));
    expect(await json(list)).toEqual({ requests: [] });
    store["accessRequests/r1"] = { status: "pending", name: "N", institution: "I" };
    const approve = await accessPost(
      post("/api/auth/request-access", { action: "approve", id: "r1" }),
    );
    expect(approve.status).toBe(200);
    expect((await json(approve)).code).toMatch(/^SCORP-[0-9A-F]{4}-[0-9A-F]{4}$/);
    expect(writesTo("accessRequests/r1").some((w) => w.data.status === "approved")).toBe(true);
    store["accessRequests/r2"] = { status: "approved" };
    expect(
      (await accessPost(post("/api/auth/request-access", { action: "approve", id: "r2" }))).status,
    ).toBe(409);
    expect(
      (await accessPost(post("/api/auth/request-access", { action: "approve", id: "missing" })))
        .status,
    ).toBe(404);
    const noId = await accessPost(post("/api/auth/request-access", { action: "reject" }));
    expect([noId.status, (await json(noId)).error]).toEqual([400, "Missing request id"]);
    store["accessRequests/r3"] = { status: "pending" };
    expect(
      (await accessPost(post("/api/auth/request-access", { action: "reject", id: "r3" }))).status,
    ).toBe(200);
  });

  it("red: an unknown action no longer falls through to a public submission", async () => {
    const res = await accessPost(
      post("/api/auth/request-access", { ...submit(), action: "delete" }, false),
    );
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe("Invalid action");
    expect(writesTo("accessRequests/")).toHaveLength(0);
  });

  it("red: wrong-typed submit fields are a 400, not a 500", async () => {
    const res = await accessPost(
      post("/api/auth/request-access", { ...submit(), name: 12345 }, false),
    );
    expect(res.status).toBe(400);
    expect((await json(res)).fields?.[0].path).toBe("name");
  });

  it("red: an oversized message is rejected", async () => {
    const res = await accessPost(
      post("/api/auth/request-access", { ...submit(), message: "x".repeat(10001) }, false),
    );
    expect(res.status).toBe(400);
  });

  it.each([
    ["numeric id", 7],
    ["slash id", "a/b"],
  ])("red: approve with a %s is a 400", async (_n, id) => {
    verifyIdToken.mockResolvedValue({ uid: "root", admin: true });
    const res = await accessPost(post("/api/auth/request-access", { action: "approve", id }));
    expect(res.status).toBe(400);
  });

  it("red (G-009): approve and submit run inside a transaction", async () => {
    verifyIdToken.mockResolvedValue({ uid: "root", admin: true });
    store["accessRequests/r1"] = { status: "pending", name: "N", institution: "I" };
    await accessPost(post("/api/auth/request-access", { action: "approve", id: "r1" }));
    expect(runTransactionSpy).toHaveBeenCalledTimes(1);
    await accessPost(post("/api/auth/request-access", submit(), false));
    expect(runTransactionSpy).toHaveBeenCalledTimes(2);
  });
});

// ─── POST /api/submissions ────────────────────────────────────────────────
describe("POST /api/submissions", () => {
  const goodUrl =
    "https://firebasestorage.googleapis.com/v0/b/bkt/o/submissions%2Fu1%2Fwork.png?alt=media&token=t";
  beforeEach(() => {
    store["users/u1"] = student;
    store["assignments/a1"] = {
      answerKeySeparated: true,
      teacherId: "t1",
      visibility: "private",
      questions: [{ id: "q1", text: "Q one", points: 4 }],
    };
  });
  // Shape from src/app/student/assignment-view/page.tsx (draft and final).
  const draft = () => ({
    assignmentId: "a1",
    studentId: "u1",
    studentName: "Stu",
    studentEmail: "u1@school.test",
    answers: [{ questionId: "q1", questionText: "Q one", answer: "my answer" }],
    status: "draft",
    teacherId: "t1",
    updatedAt: "2026-11-11T00:00:00.000Z",
  });
  const final = () => ({
    ...draft(),
    status: "submitted",
    submittedAt: "2026-11-11T00:00:00.000Z",
    isLate: false,
    graded: false,
    totalPoints: 4,
    earnedPoints: null,
    workFiles: [
      {
        name: "work.png",
        type: "image/png",
        size: 10,
        url: goodUrl,
        uploadedAt: "2026-11-11T00:00:00.000Z",
      },
    ],
    unfocusCount: 2,
  });

  it("characterization: the draft payload is stored under the stable id", async () => {
    const res = await submissionsPost(post("/api/submissions", draft()));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ id: "u1_a1" });
    expect(writesTo("submissions/u1_a1")[0].data).toMatchObject({
      studentId: "u1",
      status: "draft",
      answers: [{ questionId: "q1", questionText: "Q one", answer: "my answer" }],
      unfocusCount: 0,
    });
  });

  it("characterization: the final payload keeps the attachment fields and unfocus count", async () => {
    const res = await submissionsPost(
      post("/api/submissions", { ...final(), submissionId: "u1_a1" }),
    );
    expect(res.status).toBe(200);
    expect(writesTo("submissions/u1_a1")[0].data).toMatchObject({
      status: "submitted",
      unfocusCount: 2,
      workFiles: final().workFiles,
    });
  });

  it("characterization: existing messages are unchanged", async () => {
    let res = await submissionsPost(post("/api/submissions", { ...draft(), status: "graded" }));
    expect([res.status, (await json(res)).error]).toEqual([400, "Invalid submission"]);
    res = await submissionsPost(post("/api/submissions", { ...draft(), submissionId: 5 }));
    expect([res.status, (await json(res)).error]).toEqual([400, "Invalid submission ID"]);
    res = await submissionsPost(
      post("/api/submissions", { ...final(), workFiles: Array(21).fill(final().workFiles[0]) }),
    );
    expect([res.status, (await json(res)).error]).toEqual([400, "Too many attachments"]);
    res = await submissionsPost(
      post("/api/submissions", {
        ...draft(),
        answers: [{ questionId: "q1", answer: "x".repeat(50001) }],
      }),
    );
    expect([res.status, (await json(res)).error]).toEqual([400, "Answer is too long"]);
  });

  it("red: unknown keys inside workFiles are not persisted", async () => {
    const body = { ...final(), workFiles: [{ ...final().workFiles[0], injected: { $x: 1 } }] };
    await submissionsPost(post("/api/submissions", body));
    expect(
      (writesTo("submissions/")[0].data.workFiles as Array<Record<string, unknown>>)[0],
    ).not.toHaveProperty("injected");
  });

  it('red: a null answer entry is a 400 "Invalid answers" and leaks no TypeError text', async () => {
    const res = await submissionsPost(post("/api/submissions", { ...draft(), answers: [null] }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Invalid answers");
    expect(JSON.stringify(body)).not.toMatch(/Cannot read|TypeError/);
  });

  it('red: a workFiles entry without a url is "Invalid attachment" rather than a URL parser message', async () => {
    const res = await submissionsPost(
      post("/api/submissions", { ...final(), workFiles: [{ name: "x" }] }),
    );
    expect([res.status, (await json(res)).error]).toEqual([400, "Invalid attachment"]);
  });

  it("red: an assignmentId containing a slash is rejected before any read", async () => {
    const res = await submissionsPost(
      post("/api/submissions", { ...draft(), assignmentId: "a/b" }),
    );
    expect(res.status).toBe(400);
  });
});

// ─── POST /api/grade ──────────────────────────────────────────────────────
describe("POST /api/grade", () => {
  beforeEach(() => {
    store["users/u1"] = teacher;
    store["submissions/s1"] = {
      assignmentId: "a1",
      studentId: "stu1",
      answers: [{ questionId: "q1", answer: "A" }],
    };
    store["assignments/a1"] = {
      teacherId: "u1",
      questions: [{ id: "q1", text: "Q", type: "multiple-choice", points: 10 }],
    };
    store["assignment_keys/a1"] = { answers: { q1: "A" } };
    store["users/stu1"] = { role: "student", organizationId: "org1", teacherId: "u1" };
  });

  it("characterization: the grade-page payload grades an objective submission", async () => {
    const res = await gradePost(post("/api/grade", { submissionId: "s1" }));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ success: true, score: 100 });
  });

  it("characterization: a missing submissionId keeps the 400", async () => {
    const res = await gradePost(post("/api/grade", {}));
    expect(res.status).toBe(400);
  });

  // withAuthorizedRequest already rejects bad ids and non-owned submissions before the handler runs,
  // so the schema is defence in depth; its rules are covered in api-schema.test.ts.
});

// ─── POST /api/checkout ───────────────────────────────────────────────────
describe("POST /api/checkout", () => {
  beforeEach(() => {
    process.env.POLAR_CREDIT_PRODUCT_ID = "prod_credit";
    store["users/u1"] = teacher;
    store["organizations/org1"] = { ownerId: "u1", ownerEmail: "o@school.test" };
  });
  afterEach(() => {
    delete process.env.POLAR_CREDIT_PRODUCT_ID;
  });
  const clientBody = () => ({ userId: "u1", organizationId: "org1", amountCents: 1000 });

  it("characterization: the billing-page payload returns the checkout url", async () => {
    const res = await checkoutPost(post("/api/checkout", clientBody()));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ url: "https://polar.test/c/1" });
  });

  it("characterization: a missing amount keeps the 400 response", async () => {
    const res = await checkoutPost(post("/api/checkout", { userId: "u1", organizationId: "org1" }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toEqual(expect.any(String));
  });

  it.each([[500], [50_000]])("amountCents %i (the bounds) is accepted", async (amountCents) => {
    const res = await checkoutPost(post("/api/checkout", { ...clientBody(), amountCents }));
    expect(res.status).toBe(200);
  });

  it.each([[499], [50_001], [0], [-500], [1000.5], ["1000"], [null]])(
    "red: amountCents %p is rejected",
    async (amountCents) => {
      const res = await checkoutPost(post("/api/checkout", { ...clientBody(), amountCents }));
      expect(res.status).toBe(400);
    },
  );

  it("red: an organizationId with a slash is a 400", async () => {
    const res = await checkoutPost(
      post("/api/checkout", { ...clientBody(), organizationId: "a/b" }),
    );
    expect(res.status).toBe(400);
  });

  it("a member who is not the owner may top up", async () => {
    store["organizations/org1"] = { ownerId: "someone-else" };
    store["users/u1"] = { ...teacher, organizationId: "org1" };
    const res = await checkoutPost(post("/api/checkout", clientBody()));
    expect(res.status).toBe(200);
  });

  it("red: a teacher outside the network gets 403", async () => {
    store["organizations/org1"] = { ownerId: "someone-else" };
    store["users/u1"] = { ...teacher, organizationId: "other-org" };
    const res = await checkoutPost(post("/api/checkout", clientBody()));
    expect(res.status).toBe(403);
  });

  it("a missing POLAR_CREDIT_PRODUCT_ID is a generic 400", async () => {
    delete process.env.POLAR_CREDIT_PRODUCT_ID;
    const res = await checkoutPost(post("/api/checkout", clientBody()));
    expect(res.status).toBe(400);
    const out = await json(res);
    expect(out.error).toBe("Configuration Error");
    expect(out.message).toBe("Top-ups are not available right now.");
  });
});
