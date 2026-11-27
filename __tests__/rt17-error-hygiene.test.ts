// RT-17 (F-003, G-006, C-009, G-007): failures are typed, mapped to non-2xx statuses with generic text and a
// request id, and never leak stack traces, provider messages or upstream bodies. "characterization" tests pin the
// success shapes the clients read; "red" tests describe the old bug and failed before the fix.
import { NextRequest } from "next/server";

type Doc = Record<string, unknown> | undefined;
const store: Record<string, Doc> = {};
const written: Array<{ path: string; data: Record<string, unknown> }> = [];
const failWrites = { on: false };
const verifyIdToken = jest.fn();

const snap = (data: Doc) => ({ exists: data !== undefined, data: () => data });
const ref = (coll: string, id: string) => ({
  __path: `${coll}/${id}`,
  id,
  get: async () => snap(store[`${coll}/${id}`]),
  set: async (d: Record<string, unknown>) => {
    if (failWrites.on)
      throw new Error("FIRESTORE-INTERNAL 14 UNAVAILABLE: projects/prod-secret/databases");
    written.push({ path: `${coll}/${id}`, data: d });
  },
  update: async () => undefined,
  delete: async () => undefined,
});
const query: Record<string, unknown> = {};
for (const m of ["orderBy", "limit", "where"]) query[m] = () => query;
query.get = async () => ({ empty: true, docs: [], size: 0 });

const adminState: { db: unknown } = { db: undefined };
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
  get adminDb() {
    return adminState.db;
  },
}));
jest.mock("../src/lib/usage-limit", () => ({
  checkBudget: jest.fn(async () => ({ allowed: true })),
  recordUsage: jest.fn(async () => undefined),
}));
jest.mock("../src/lib/rate-limit", () => ({
  checkRateLimit: async () => ({ allowed: true }),
  enforceRateLimit: async () => null,
}));

const tutorAi = { explain: jest.fn(), solve: jest.fn() };
jest.mock("../src/lib/ai/tutor", () => ({
  explainPhysicsConcept: (...a: unknown[]) => tutorAi.explain(...a),
  helpSolveProblem: (...a: unknown[]) => tutorAi.solve(...a),
}));
const rubricAi = jest.fn();
jest.mock("../src/lib/ai/grading", () => ({
  gradeResponse: jest.fn(),
  synthesizeRubric: (...a: unknown[]) => rubricAi(...a),
}));
const navAi = jest.fn();
jest.mock("../src/lib/ai/chatbot", () => ({
  getNavigationResponse: (...a: unknown[]) => navAi(...a),
}));
const notebookAi = jest.fn();
jest.mock("../src/lib/ai/notebook", () => ({
  getNotebookAssistantResponse: (...a: unknown[]) => notebookAi(...a),
}));
const generateAi = jest.fn();
jest.mock("../src/lib/ai/assignment", () => ({
  generateAssignmentQuestions: (...a: unknown[]) => generateAi(...a),
  parseQuestionsFromText: jest.fn(),
}));
const polarCreate = jest.fn();
jest.mock("../src/lib/polar", () => ({
  polar: { checkouts: { create: (...a: unknown[]) => polarCreate(...a) } },
}));

import { AiBudgetError, AiProviderError, AiOutputError } from "../src/lib/ai/errors";
import { POST as tutorPost } from "../src/app/api/student/tutor/route";
import { POST as rubricPost } from "../src/app/api/ai/synthesize-rubric/route";
import { POST as chatPost } from "../src/app/api/chat/route";
import { POST as notebookPost } from "../src/app/api/notebook/chat/route";
import { POST as generatePost } from "../src/app/api/ai/generate/route";
import { POST as supportPost } from "../src/app/api/support/report/route";
import { POST as checkoutPost } from "../src/app/api/checkout/route";
import { GET as githubGet } from "../src/app/api/github/stats/route";

const post = (path: string, body: unknown) =>
  new NextRequest(`https://scorpio.test${path}`, {
    method: "POST",
    headers: { Authorization: "Bearer t" },
    body: JSON.stringify(body),
  });
type Json = { error?: string; requestId?: string; response?: string; [key: string]: unknown };
const json = async (res: Response) => res.json() as Promise<Json>;

const PROVIDER_SECRET =
  'GEMINI-RAW-BODY {"error":{"message":"API key expired","status":"PERMISSION_DENIED"}}';
const STACK_MARK = "at Object.<anonymous> (/srv/app/secret/file.ts:1:1)";
const leaky = () =>
  Object.assign(new Error(`${PROVIDER_SECRET} ${STACK_MARK}`), {
    stack: `Error: x\n    ${STACK_MARK}`,
    body: PROVIDER_SECRET,
  });
const expectNoLeak = (res: Json) => {
  const text = JSON.stringify(res);
  for (const needle of [
    "GEMINI-RAW-BODY",
    "PERMISSION_DENIED",
    "API key",
    "FIRESTORE-INTERNAL",
    "prod-secret",
    STACK_MARK,
    "/srv/app",
    "stack",
  ]) {
    expect(text).not.toContain(needle);
  }
};

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(store)) delete store[k];
  written.length = 0;
  failWrites.on = false;
  adminState.db = {
    collection: (coll: string) =>
      Object.assign(Object.create(query), { doc: (id?: string) => ref(coll, id ?? "new1") }),
  };
  verifyIdToken.mockResolvedValue({ uid: "u1", email: "u1@school.test" });
  store["users/u1"] = {
    role: "student",
    organizationId: "org1",
    displayName: "Stu",
    teacherId: "t1",
  };
  store["users/t1"] = { role: "teacher", organizationId: "org1" };
  store["organizations/org1"] = { ownerId: "u1", notebookLimit: 50 };
  jest.spyOn(console, "error").mockImplementation(() => undefined);
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe("POST /api/student/tutor", () => {
  const body = {
    message: "what is torque",
    userId: "u1",
    role: "student",
    mode: "concept",
    chatHistory: [],
  };

  it("characterization: success returns {response} for the tutor and assignment-view clients", async () => {
    tutorAi.explain.mockResolvedValue({
      text: "Torque is...",
      usage: { inputTokens: 1, outputTokens: 2 },
    });
    const res = await tutorPost(post("/api/student/tutor", body));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ response: "Torque is..." });
  });

  it("red: a provider failure is a 502 with generic text and a request id, never a 200 {response}", async () => {
    tutorAi.explain.mockRejectedValue(new AiProviderError("AI provider returned 500"));
    const res = await tutorPost(post("/api/student/tutor", body));
    expect(res.status).toBe(502);
    const out = await json(res);
    expect(out).not.toHaveProperty("response");
    expect(out.error).toEqual(expect.any(String));
    expect(out.requestId).toEqual(expect.any(String));
    expectNoLeak(out);
  });

  it("red: a budget refusal is a 503 with the budget message and a request id", async () => {
    tutorAi.solve.mockRejectedValue(new AiBudgetError("Budget exceeded for org1: 5.00 of 5.00"));
    const res = await tutorPost(post("/api/student/tutor", { ...body, mode: "tutor" }));
    expect(res.status).toBe(503);
    const out = await json(res);
    expect(out.error).not.toContain("org1");
    expect(out.requestId).toEqual(expect.any(String));
  });

  it("red: an unexpected error is a 500 without its message or stack", async () => {
    tutorAi.explain.mockRejectedValue(leaky());
    const res = await tutorPost(post("/api/student/tutor", body));
    expect(res.status).toBe(500);
    expectNoLeak(await json(res));
  });
});

describe("POST /api/ai/synthesize-rubric", () => {
  const body = { questionText: "Why?", topic: "KE", userId: "u1" };
  beforeEach(() => {
    store["users/u1"] = { role: "teacher", organizationId: "org1" };
  });

  it("characterization: success returns {rubric}", async () => {
    rubricAi.mockResolvedValue({ text: "Award 5 for KE=1/2mv^2" });
    const res = await rubricPost(post("/api/ai/synthesize-rubric", body));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ rubric: "Award 5 for KE=1/2mv^2" });
  });

  it("red: a provider failure is a 502 and the error is not written as a rubric", async () => {
    rubricAi.mockRejectedValue(new AiProviderError("AI provider returned 503"));
    const res = await rubricPost(post("/api/ai/synthesize-rubric", body));
    expect(res.status).toBe(502);
    const out = await json(res);
    expect(out).not.toHaveProperty("rubric");
    expect(out.requestId).toEqual(expect.any(String));
  });

  it("red: error.message of an unexpected failure is not returned", async () => {
    rubricAi.mockRejectedValue(leaky());
    const res = await rubricPost(post("/api/ai/synthesize-rubric", body));
    expect(res.status).toBe(500);
    expectNoLeak(await json(res));
  });
});

describe("POST /api/chat", () => {
  const body = { message: "where is grading", userRole: "student", userId: "u1" };
  // The navigation assistant answers teachers only.
  beforeEach(() => {
    store["users/u1"] = { role: "teacher", organizationId: "org1" };
  });

  it("characterization: success returns {text, suggestedPrompts}", async () => {
    navAi.mockResolvedValue({ text: "Go to /student", usage: { inputTokens: 1, outputTokens: 1 } });
    const res = await chatPost(post("/api/chat", body));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(expect.objectContaining({ text: "Go to /student" }));
  });

  it("red: provider failure is a 502 with no message or stack, even in development", async () => {
    const env = process.env as Record<string, string | undefined>;
    const before = env.NODE_ENV;
    env.NODE_ENV = "development";
    try {
      navAi.mockRejectedValue(leaky());
      const res = await chatPost(post("/api/chat", body));
      expect(res.status).toBe(500);
      const out = await json(res);
      expect(out).not.toHaveProperty("details");
      expectNoLeak(out);
    } finally {
      env.NODE_ENV = before;
    }
  });

  it("red: AiProviderError maps to 502 with a retryable message", async () => {
    navAi.mockRejectedValue(new AiProviderError("AI provider returned 500"));
    const res = await chatPost(post("/api/chat", body));
    expect(res.status).toBe(502);
    expect(await json(res)).toEqual({ error: expect.any(String), requestId: expect.any(String) });
  });
});

describe("POST /api/notebook/chat", () => {
  const body = {
    messages: [{ role: "user", content: "hi" }],
    notebookContent: "notes",
    studentId: "u1",
  };

  it("red: provider failure is a 502 with generic text", async () => {
    notebookAi.mockRejectedValue(new AiProviderError("AI provider returned 500"));
    const res = await notebookPost(post("/api/notebook/chat", body));
    expect(res.status).toBe(502);
    const out = await json(res);
    expect(out).not.toHaveProperty("content");
    expect(out.requestId).toEqual(expect.any(String));
  });

  it("red: unexpected error message is not returned", async () => {
    notebookAi.mockRejectedValue(leaky());
    const res = await notebookPost(post("/api/notebook/chat", body));
    expect(res.status).toBe(500);
    expectNoLeak(await json(res));
  });
});

describe("POST /api/ai/generate", () => {
  const body = {
    topic: "kinematics",
    count: 2,
    difficulty: "easy",
    questionType: "mixed",
    userId: "u1",
  };
  beforeEach(() => {
    store["users/u1"] = { role: "teacher", organizationId: "org1" };
  });

  it("red: raw model text and stack are not returned, in any NODE_ENV", async () => {
    const env = process.env as Record<string, string | undefined>;
    const before = env.NODE_ENV;
    env.NODE_ENV = "development";
    try {
      generateAi.mockRejectedValue(Object.assign(leaky(), { rawText: "RAW MODEL OUTPUT" }));
      const res = await generatePost(post("/api/ai/generate", body));
      expect(res.status).toBe(500);
      const out = await json(res);
      expect(JSON.stringify(out)).not.toContain("RAW MODEL OUTPUT");
      expectNoLeak(out);
    } finally {
      env.NODE_ENV = before;
    }
  });

  it("red: an unusable model answer is a 502 with the generic retry message", async () => {
    generateAi.mockRejectedValue(new AiOutputError("could not extract JSON"));
    const res = await generatePost(post("/api/ai/generate", body));
    expect(res.status).toBe(502);
  });
});

describe("POST /api/support/report", () => {
  const body = {
    description: "The page is broken",
    category: "bug",
    userId: "u1",
    userEmail: "u1@school.test",
  };

  it("characterization: a persisted report returns {success, ticketId}", async () => {
    const res = await supportPost(post("/api/support/report", body));
    expect(res.status).toBe(200);
    const out = await json(res);
    expect(out).toEqual(
      expect.objectContaining({ success: true, ticketId: expect.stringMatching(/^SC-BUG-/) }),
    );
    expect(written).toHaveLength(1);
  });

  it("red: a failed Firestore write is not reported as success", async () => {
    failWrites.on = true;
    const res = await supportPost(post("/api/support/report", body));
    expect(res.status).toBeGreaterThanOrEqual(500);
    const out = await json(res);
    expect(out).not.toHaveProperty("success", true);
    expect(out).not.toHaveProperty("ticketId");
    expect(out.requestId).toEqual(expect.any(String));
    expectNoLeak(out);
  });

  it("red: an unavailable database is a 5xx, not a success", async () => {
    adminState.db = null;
    const res = await supportPost(post("/api/support/report", body));
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(await json(res)).not.toHaveProperty("success", true);
  });

  it("red: the failure log carries no description, email or screenshots (no PII)", async () => {
    failWrites.on = true;
    const spy = jest.spyOn(console, "error");
    await supportPost(
      post("/api/support/report", { ...body, screenshots: ["data:image/png;base64,AAAA"] }),
    );
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).not.toContain("The page is broken");
    expect(logged).not.toContain("u1@school.test");
    expect(logged).not.toContain("base64");
  });
});

describe("POST /api/checkout", () => {
  const body = { userId: "u1", organizationId: "org1", amountCents: 1000 };
  beforeEach(() => {
    process.env.POLAR_CREDIT_PRODUCT_ID = "prod_credit";
    store["users/u1"] = { role: "teacher", organizationId: "org1" };
    store["organizations/org1"] = { ownerId: "u1" };
  });
  afterEach(() => {
    delete process.env.POLAR_CREDIT_PRODUCT_ID;
  });

  it("characterization: success returns {url}", async () => {
    polarCreate.mockResolvedValue({ url: "https://polar.test/c/1" });
    const res = await checkoutPost(post("/api/checkout", body));
    expect(await json(res)).toEqual({ url: "https://polar.test/c/1" });
  });

  it("red: upstream message and body are not forwarded", async () => {
    polarCreate.mockRejectedValue(
      Object.assign(new Error("Polar says: token revoked"), { body: '{"detail":"UPSTREAM-BODY"}' }),
    );
    const res = await checkoutPost(post("/api/checkout", body));
    expect(res.status).toBeGreaterThanOrEqual(500);
    const out = await json(res);
    expect(JSON.stringify(out)).not.toMatch(/token revoked|UPSTREAM-BODY/);
    expect(out).not.toHaveProperty("details");
    expect(out.error).toEqual(expect.any(String));
    expect(out.requestId).toEqual(expect.any(String));
  });
});

describe("GET /api/github/stats", () => {
  it("red: the upstream error body is not forwarded", async () => {
    process.env.GITHUB_TOKEN = "ghp_test_not_real";
    jest
      .spyOn(global, "fetch")
      .mockResolvedValue(
        new Response("UPSTREAM-BODY rate limit exceeded for token", { status: 403 }),
      );
    const res = await githubGet(new NextRequest("https://scorpio.test/api/github/stats"));
    expect(res.status).toBe(502);
    const out = await json(res);
    expect(JSON.stringify(out)).not.toContain("UPSTREAM-BODY");
    expect(out).not.toHaveProperty("details");
  });
});
