import { NextRequest } from "next/server";
import {
  answerAgrees,
  toAssignmentQuestion,
  validateDraftProblem,
} from "../src/lib/content/problem-format";
import {
  buildGeneratorPrompt,
  generateProblems,
  independentlySolve,
  type ModelCall,
} from "../src/lib/content/problem-generator";

const numeric = {
  text: "A 2.0 kg cart moving at 3.0 m/s collides with and sticks to a 1.0 kg cart at rest. Find their final speed.",
  type: "numeric",
  correctAnswer: "2.0 m/s",
  solution: "Momentum: (2.0)(3.0) = (3.0)v so v = 2.0 m/s.",
  distractors: [
    { answer: "3.0 m/s", misconception: "momentum-not-vector" },
    { answer: "2.45 m/s", misconception: "momentum-kinetic-energy-confusion" },
    { answer: "2.0 m/s", misconception: "momentum-not-vector" }, // equals the key
    { answer: "1 m/s", misconception: "made-up" },
  ],
  difficulty: "easy",
};
const mc = {
  text: "A truck collides head-on with a small car. Compare the forces each exerts on the other during the collision.",
  type: "multiple-choice",
  options: [
    "The truck's force is larger",
    "The car's force is larger",
    "They are equal in size",
    "It depends on speed",
  ],
  correctAnswer: "They are equal in size",
  solution: "Newton's third law: the forces form an interaction pair, so they are equal in size.",
  distractors: [
    { answer: "The truck's force is larger", misconception: "third-law-unequal-forces" },
    { answer: "Not an option", misconception: "third-law-unequal-forces" },
  ],
  difficulty: "medium",
};

describe("validateDraftProblem", () => {
  test("a good numeric draft passes; bad distractors are dropped with reasons", () => {
    const v = validateDraftProblem(numeric, "4.3");
    expect(v.errors).toEqual([]);
    expect(v.problem).toMatchObject({
      type: "numeric",
      correctAnswer: "2.0 m/s",
      apTopic: "4.3",
      points: 10,
    });
    expect(v.problem!.distractors.map((d) => d.answer)).toEqual(["3.0 m/s", "2.45 m/s"]);
    expect(v.warnings.join("\n")).toMatch(/2\.0 m\/s.*grader would give it credit/);
    expect(v.warnings.join("\n")).toMatch(/unknown misconception "made-up"/);
  });

  test("a good MC draft passes; distractors must be options", () => {
    const v = validateDraftProblem(mc, "2.3");
    expect(v.errors).toEqual([]);
    expect(v.problem!.distractors).toEqual([
      { answer: "The truck's force is larger", misconception: "third-law-unequal-forces" },
    ]);
    expect(v.warnings).toContain("Some wrong options have no misconception tag");
  });

  test("fatal errors", () => {
    const cases: [unknown, string, RegExp][] = [
      [null, "4.3", /Not an object/],
      [{ ...numeric, text: "short" }, "4.3", /too short/],
      [{ ...numeric, type: "essay" }, "4.3", /Type must be/],
      [{ ...numeric, correctAnswer: "about two" }, "4.3", /not a number/],
      [{ ...numeric, correctAnswer: "" }, "4.3", /missing/],
      [{ ...mc, correctAnswer: "equal" }, "2.3", /not one of the options/],
      [{ ...mc, options: ["a", "b"] }, "2.3", /3 to 6 options/],
      [{ ...mc, options: ["a", "A", "b", "They are equal in size"] }, "2.3", /repeat/],
      [numeric, "9.9", /Unknown AP topic/],
    ];
    for (const [raw, topic, re] of cases) {
      const v = validateDraftProblem(raw, topic);
      expect(v.problem).toBeUndefined();
      expect(v.errors.join("\n")).toMatch(re);
    }
  });

  test("warnings for a unit-less key, bad tolerance and an off-unit misconception", () => {
    const v = validateDraftProblem(
      {
        ...numeric,
        correctAnswer: "2",
        tolerance: 50,
        distractors: [{ answer: "5", misconception: "buoyancy-depends-on-object-weight" }],
      },
      "4.3",
    );
    expect(v.errors).toEqual([]);
    expect(v.warnings.join("\n")).toMatch(/no unit/);
    expect(v.warnings.join("\n")).toMatch(/Tolerance ignored/);
    expect(v.warnings.join("\n")).toMatch(/not usually a Unit 4/);
  });

  test("answerAgrees uses the grader (units, tolerance, MC letters are resolved elsewhere)", () => {
    const p = validateDraftProblem(numeric, "4.3").problem!;
    expect(answerAgrees(p, "2 m/s")).toBe(true);
    expect(answerAgrees(p, "7.2 km/h")).toBe(true);
    expect(answerAgrees(p, "2.4 m/s")).toBe(false);
    const m = validateDraftProblem(mc, "2.3").problem!;
    expect(answerAgrees(m, "They are equal in size")).toBe(true);
    expect(answerAgrees(m, "C")).toBe(true);
  });

  test("toAssignmentQuestion keeps key, distractors and topic for the server to split", () => {
    const q = toAssignmentQuestion(validateDraftProblem(numeric, "4.3").problem!, "id1");
    expect(q).toMatchObject({
      id: "id1",
      type: "numeric",
      correctAnswer: "2.0 m/s",
      apTopic: "4.3",
      points: 10,
    });
    expect(q).not.toHaveProperty("solution");
  });
});

describe("generator", () => {
  test("the prompt names the topic and only that unit's (or any-unit) conceptual tags", () => {
    const prompt = buildGeneratorPrompt("4.2", 3);
    expect(prompt).toContain("Topic 4.2: Change in momentum and impulse");
    expect(prompt).toContain("2 numeric and 1 multiple-choice");
    expect(prompt).toContain("impulse-force-confusion");
    expect(prompt).not.toContain("buoyancy-depends-on-object-weight");
    expect(prompt).not.toContain("sign-error");
    expect(() => buildGeneratorPrompt("9.1", 1)).toThrow();
  });

  test("drafts are validated and each usable one is independently solved", async () => {
    const calls: string[] = [];
    const call: ModelCall = async (req) => {
      calls.push(req.systemInstruction.slice(0, 20));
      if (req.systemInstruction.startsWith("You write"))
        return {
          text:
            "```json\n" + JSON.stringify({ problems: [numeric, mc, { text: "broken" }] }) + "\n```",
        };
      if (req.prompt.includes("sticks"))
        return { text: JSON.stringify({ reasoning: "p = mv", answer: "2.0 m/s" }) };
      return { text: JSON.stringify({ reasoning: "third law", answer: "B" }) };
    };
    const drafts = await generateProblems({ apTopic: "4.3", count: 3 }, call);
    expect(drafts).toHaveLength(3);
    expect(drafts[0].check).toMatchObject({ answer: "2.0 m/s", agrees: true });
    // "B" resolves to the second option, which is wrong: flagged for the reviewer.
    expect(drafts[1].check).toMatchObject({ answer: "The car's force is larger", agrees: false });
    expect(drafts[2].problem).toBeUndefined();
    expect(drafts[2].check).toBeUndefined();
    expect(calls).toHaveLength(3);
  });

  test("count is clamped and a reply without problems throws", async () => {
    let asked = "";
    const call: ModelCall = async (req) => {
      asked = req.prompt;
      return { text: "no json here" };
    };
    await expect(generateProblems({ apTopic: "1.1", count: 50 }, call)).rejects.toThrow(
      /problems list/,
    );
    expect(asked).toContain("Write 5 AP Physics 1 problems");
  });

  test("multiple-choice answers given as a letter, a lettered option or the text all resolve", async () => {
    const m = validateDraftProblem(mc, "2.3").problem!;
    for (const answer of [
      "C",
      "C.",
      "(C) They are equal in size",
      "C. They are equal in size",
      "They are equal in size",
    ]) {
      const check = await independentlySolve(m, async () => ({ text: JSON.stringify({ answer }) }));
      expect(check).toMatchObject({ answer: "They are equal in size", agrees: true });
    }
  });

  test("the independent solve never throws", async () => {
    const p = validateDraftProblem(numeric, "4.3").problem!;
    await expect(
      independentlySolve(p, async () => Promise.reject(new Error("down"))),
    ).resolves.toMatchObject({
      agrees: false,
      reasoning: expect.stringContaining("down"),
    });
    await expect(independentlySolve(p, async () => ({ text: "{}" }))).resolves.toMatchObject({
      agrees: false,
      answer: "",
    });
  });
});

// --- Routes -----------------------------------------------------------------------------------

type Data = Record<string, unknown>;
const mockDocs = new Map<string, Data>();
const mockWrites: { op: string; path: string; data?: unknown }[] = [];
let mockId = 0;

jest.mock("../src/lib/firebase-admin", () => {
  const ref = (name: string, id: string) => ({
    id,
    path: `${name}/${id}`,
    get: async () => ({
      exists: mockDocs.has(`${name}/${id}`),
      data: () => mockDocs.get(`${name}/${id}`),
    }),
    update: async (data: Data) => {
      mockWrites.push({ op: "update", path: `${name}/${id}`, data });
      mockDocs.set(`${name}/${id}`, { ...mockDocs.get(`${name}/${id}`), ...data });
    },
  });
  return {
    adminDb: {
      collection: (name: string) => ({
        doc: (id?: string) => ref(name, id ?? `new${++mockId}`),
        where: () => ({ where: () => ({}), limit: () => ({ get: async () => ({ docs: [] }) }) }),
        limit: () => ({ get: async () => ({ docs: [] }) }),
      }),
      getAll: async (...refs: { path: string; id: string }[]) =>
        refs.map((r) => ({ id: r.id, data: () => mockDocs.get(r.path) })),
      batch: () => ({
        set: (r: { path: string }, data: unknown) =>
          mockWrites.push({ op: "set", path: r.path, data }),
        update: (r: { path: string }, data: unknown) =>
          mockWrites.push({ op: "batch.update", path: r.path, data }),
        commit: async () => undefined,
      }),
    },
  };
});
jest.mock("../src/lib/auth-verify", () => ({
  withAuthorizedRequest:
    (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) => (req: NextRequest) =>
      handler(req, {
        caller: { uid: "admin1" },
        profile: {},
        organizationId: "",
        body: {},
        requestId: "r",
      }),
}));
jest.mock("../src/lib/ai/config", () => ({ model: { generateContent: jest.fn() } }));

import { PATCH } from "../src/app/api/admin/content/route";
import { POST as publish } from "../src/app/api/admin/content/publish/route";

const req = (body: unknown, method = "POST") =>
  new NextRequest("https://scorpio.test/api/admin/content", { method, body: JSON.stringify(body) });

beforeEach(() => {
  mockDocs.clear();
  mockWrites.length = 0;
  mockDocs.set("content_drafts/d1", {
    apUnit: 4,
    apTopic: "4.3",
    status: "draft",
    problem: validateDraftProblem(numeric, "4.3").problem,
    errors: [],
    warnings: [],
  });
  mockDocs.set("content_drafts/d2", {
    apUnit: 4,
    apTopic: "4.1",
    status: "approved",
    problem: { ...validateDraftProblem(mc, "2.3").problem, apTopic: "4.1" },
  });
  mockDocs.set("content_drafts/d3", {
    apUnit: 2,
    apTopic: "2.3",
    status: "approved",
    problem: validateDraftProblem(mc, "2.3").problem,
  });
});

describe("PATCH /api/admin/content", () => {
  test("approve re-validates the reviewer's edit and refuses one with errors", async () => {
    const bad = await PATCH(
      req({ id: "d1", action: "approve", problem: { ...numeric, correctAnswer: "two" } }, "PATCH"),
    );
    expect(bad.status).toBe(422);
    expect((await bad.json()).errors[0]).toMatch(/not a number/);
    expect(mockDocs.get("content_drafts/d1")!.status).toBe("draft");

    const ok = await PATCH(
      req(
        {
          id: "d1",
          action: "approve",
          problem: { ...numeric, correctAnswer: "2.00 m/s" },
          note: "solved by hand",
        },
        "PATCH",
      ),
    );
    expect(ok.status).toBe(200);
    expect(mockDocs.get("content_drafts/d1")).toMatchObject({
      status: "approved",
      edited: true,
      reviewedBy: "admin1",
      reviewNote: "solved by hand",
      problem: { correctAnswer: "2.00 m/s" },
    });
  });

  test("reject and reopen; published drafts are frozen; unknown ids 404", async () => {
    await PATCH(req({ id: "d1", action: "reject" }, "PATCH"));
    expect(mockDocs.get("content_drafts/d1")!.status).toBe("rejected");
    await PATCH(req({ id: "d1", action: "reopen" }, "PATCH"));
    expect(mockDocs.get("content_drafts/d1")!.status).toBe("draft");
    mockDocs.set("content_drafts/d1", {
      ...mockDocs.get("content_drafts/d1"),
      status: "published",
    });
    expect((await PATCH(req({ id: "d1", action: "reject" }, "PATCH"))).status).toBe(409);
    expect((await PATCH(req({ id: "nope", action: "reject" }, "PATCH"))).status).toBe(404);
    expect((await PATCH(req({ id: "d1", action: "delete" }, "PATCH"))).status).toBe(400);
  });
});

describe("POST /api/admin/content/publish", () => {
  test("only approved drafts from one unit", async () => {
    expect((await publish(req({ draftIds: ["d1", "d2"], title: "T" }))).status).toBe(409);
    expect((await publish(req({ draftIds: ["d2", "d3"], title: "T" }))).status).toBe(400);
    expect((await publish(req({ draftIds: ["d2", "d2"], title: "T" }))).status).toBe(400);
    expect(mockWrites).toEqual([]);
  });

  test("creates a global auto-graded AP assignment with the key and distractors kept server-side", async () => {
    mockDocs.set("content_drafts/d1", { ...mockDocs.get("content_drafts/d1"), status: "approved" });
    const res = await publish(req({ draftIds: ["d1", "d2"], title: "Momentum practice" }));
    expect(res.status).toBe(200);
    const { id } = await res.json();
    const assignment = mockWrites.find((w) => w.path === `assignments/${id}`)!.data as Data;
    const key = mockWrites.find((w) => w.path === `assignment_keys/${id}`)!.data as Data;
    expect(assignment).toMatchObject({
      title: "Momentum practice",
      visibility: "global",
      gradingType: "ai",
      apCourse: "physics-1",
      apUnit: 4,
      apTopics: ["4.1", "4.3"],
      topic: "energy",
      answerKeySeparated: true,
      totalPoints: 20,
      contentSource: "scorpio-reviewed",
      teacherId: "admin1",
    });
    const text = JSON.stringify(assignment);
    expect(text).not.toContain("2.0 m/s");
    expect(text).not.toContain("misconception");
    expect(text).not.toContain("solution");
    const qs = assignment.questions as { id: string; apTopic: string }[];
    expect(qs.map((q) => q.apTopic)).toEqual(["4.3", "4.1"]);
    expect((key.answers as Data)[qs[0].id]).toBe("2.0 m/s");
    expect((key.distractors as Record<string, unknown[]>)[qs[0].id]).toHaveLength(2);
    expect(mockWrites.filter((w) => w.op === "batch.update").map((w) => w.data)).toEqual([
      { status: "published", assignmentId: id },
      { status: "published", assignmentId: id },
    ]);
  });
});
