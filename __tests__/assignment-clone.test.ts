// POST /api/assignments/clone: server-side fork with the answer key copied between assignment_keys docs.
import { NextRequest } from "next/server";

type Doc = Record<string, unknown> | undefined;
const mockDocs = new Map<string, Doc>();
const mockWrites: Array<{ op: string; path: string; data?: unknown }> = [];
let mockCaller: { uid: string } = { uid: "teacher1" };
let mockCommits = 0;
let mockAutoId = 0;

type Ref = { path: string; id: string };
const mockSnap = (path: string) => ({
  exists: mockDocs.get(path) !== undefined,
  data: () => mockDocs.get(path),
});

jest.mock("../src/lib/firebase-admin", () => ({
  adminFieldWithValue: { increment: (n: number) => ({ __increment: n }) },
  adminDb: {
    collection: (name: string) => {
      const filters: Array<[string, unknown]> = [];
      let max = Infinity;
      const query = {
        where: (field: string, _op: string, value: unknown) => {
          filters.push([field, value]);
          return query;
        },
        limit: (n: number) => {
          max = n;
          return query;
        },
        get: async () => ({
          docs: [...mockDocs.entries()]
            .filter(
              ([p, d]) => p.startsWith(`${name}/`) && d && filters.every(([f, v]) => d[f] === v),
            )
            .map(([p]) => p.slice(name.length + 1))
            .sort()
            .slice(0, max)
            .map((id) => ({ id, data: () => mockDocs.get(`${name}/${id}`) })),
        }),
        doc: (id: string = `copy${++mockAutoId}`) => ({
          path: `${name}/${id}`,
          id,
          get: async () => mockSnap(`${name}/${id}`),
        }),
      };
      return query;
    },
    batch: () => ({
      set: (ref: Ref, data: unknown) => {
        mockWrites.push({ op: "set", path: ref.path, data });
      },
      update: (ref: Ref, data: unknown) => {
        mockWrites.push({ op: "update", path: ref.path, data });
      },
      commit: async () => {
        mockCommits++;
      },
    }),
  },
}));

jest.mock("../src/lib/auth-verify", () => ({
  authenticateRequest: async () => mockCaller,
  withAuthorizedRequest:
    (
      handler: (req: NextRequest, ctx: unknown) => Promise<Response>,
      options: { teacher?: boolean },
    ) =>
    async (req: NextRequest) => {
      const profile = mockDocs.get(`users/${mockCaller.uid}`);
      if (!profile || (options.teacher && profile.role !== "teacher"))
        return Response.json({ error: "Access denied" }, { status: 403 });
      return handler(req, {
        caller: mockCaller,
        profile,
        organizationId: profile.organizationId || "",
        body: {},
        requestId: "r1",
      });
    },
}));

import { POST as clone } from "../src/app/api/assignments/clone/route";

const post = (body: unknown) =>
  clone(
    new NextRequest("https://scorpio.test/api/assignments/clone", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
const write = (path: string) => mockWrites.find((w) => w.path === path);
const newAssignment = () =>
  mockWrites.find((w) => w.op === "set" && w.path.startsWith("assignments/"));

const source = {
  teacherId: "author",
  organizationId: "orgA",
  visibility: "global",
  title: "Kinematics",
  description: "d",
  topic: "kinematics",
  gradingType: "manual",
  allowCalculator: true,
  answerKeySeparated: true,
  rubric: null,
  forkCount: 4,
  questions: [
    { id: "q1", text: "Pick", type: "multiple-choice", options: ["a", "b"], points: 2 },
    { id: "q2", text: "Speed?", type: "numeric", tolerance: 1, sigFigs: 3, points: 3 },
    { id: "q3", text: "Explain", type: "text" },
  ],
};

beforeEach(() => {
  mockDocs.clear();
  mockWrites.length = 0;
  mockCommits = 0;
  mockAutoId = 0;
  mockCaller = { uid: "teacher1" };
  mockDocs.set("users/teacher1", { role: "teacher", organizationId: "orgB" });
  mockDocs.set("organizations/orgB", {
    planId: "department-monthly",
    subscriptionStatus: "active",
  });
  mockDocs.set("assignments/src1", source);
  mockDocs.set("assignment_keys/src1", {
    answers: { q1: "b", q2: "12.5", q3: "mention v = d/t" },
    rubric: "be precise",
    teacherId: "author",
  });
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe("POST /api/assignments/clone", () => {
  test("sets the optional due date on the copy, and defaults to none", async () => {
    mockDocs.set("courses/c1", { teacherId: "teacher1" });
    await post({ sourceId: "src1", courseId: "c1", dueDate: "2027-01-12T20:00:00.000Z" });
    expect((newAssignment()?.data as { dueDate: Date }).dueDate).toEqual(new Date("2027-01-12T20:00:00.000Z"));
    mockWrites.length = 0;
    await post({ sourceId: "src1" });
    expect((newAssignment()?.data as { dueDate: unknown }).dueDate).toBeNull();
    expect((await post({ sourceId: "src1", dueDate: "not a date" })).status).toBe(400);
  });

  test("creates a private copy owned by the caller with the key copied server-side, never in the response", async () => {
    const res = await post({ sourceId: "src1" });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ id: "copy1" });
    for (const secret of ["12.5", "be precise", "mention", '"b"'])
      expect(text).not.toContain(secret);
    expect(mockCommits).toBe(1);

    const copy = newAssignment()!;
    expect(copy.path).toBe("assignments/copy1");
    const data = copy.data as Record<string, unknown> & {
      questions: Array<Record<string, unknown>>;
    };
    expect(data).toMatchObject({
      teacherId: "teacher1",
      organizationId: "orgB",
      visibility: "private",
      answerKeySeparated: true,
      forkedFrom: "src1",
      gradingType: "manual",
      title: "Kinematics",
      description: "d",
      allowCalculator: true,
      rubric: null,
      courseId: null,
      forkCount: 0,
    });
    expect(JSON.stringify(data)).not.toMatch(/correctAnswer|12\.5|be precise/);
    // Non-key fields survive, including per-type ones.
    expect(
      data.questions.map((q) => {
        const rest = { ...q };
        delete rest.id;
        return rest;
      }),
    ).toEqual([
      { text: "Pick", type: "multiple-choice", options: ["a", "b"], points: 2 },
      { text: "Speed?", type: "numeric", tolerance: 1, sigFigs: 3, points: 3 },
      { text: "Explain", type: "text", points: 10 },
    ]);
    const ids = data.questions.map((q) => q.id as string);
    expect(new Set(ids).size).toBe(3);
    expect(ids).not.toContain("q1");

    const key = write("assignment_keys/copy1")!;
    expect(key.data).toEqual({
      answers: { [ids[0]]: "b", [ids[1]]: "12.5", [ids[2]]: "mention v = d/t" },
      rubric: "be precise",
      teacherId: "teacher1",
    });
    expect(write("assignments/src1")).toEqual({
      op: "update",
      path: "assignments/src1",
      data: { forkCount: { __increment: 1 } },
    });
  });

  test("gradingType defaults to ai; title and an owned class may be set", async () => {
    mockDocs.set("assignments/src1", { ...source, gradingType: undefined });
    mockDocs.set("courses/c1", { teacherId: "teacher1" });
    expect((await post({ sourceId: "src1", title: "Mine", courseId: "c1" })).status).toBe(200);
    expect(newAssignment()!.data).toMatchObject({
      gradingType: "ai",
      title: "Mine",
      courseId: "c1",
    });
  });

  test("duplicating one's own assignment does not bump forkCount", async () => {
    mockDocs.set("assignments/src1", { ...source, teacherId: "teacher1", visibility: "private" });
    expect((await post({ sourceId: "src1" })).status).toBe(200);
    expect(write("assignments/src1")).toBeUndefined();
    expect(write("assignment_keys/copy1")).toBeDefined();
  });

  test("legacy waypoints with inline answers are normalized into a valid key", async () => {
    mockDocs.set("assignments/legacy", {
      teacherId: "system-seed",
      visibility: "global",
      title: "Seeded",
      questions: [
        { type: "multiple-choice", text: "Angle?", options: ["30°", "45°"], answer: "B" },
        { type: "true-false", text: "Constant?", answer: "true" },
        { type: "numerical", text: "Height?", answer: "5 m" },
        { type: "free-response", text: "Derive", hint: "kinematics" },
      ],
    });
    expect((await post({ sourceId: "legacy" })).status).toBe(200);
    const data = newAssignment()!.data as { questions: Array<Record<string, unknown>> };
    // "numerical" with a readable key ("5 m") becomes Numeric.
    expect(data.questions.map((q) => q.type)).toEqual([
      "multiple-choice",
      "true-false",
      "numeric",
      "text",
    ]);
    expect(JSON.stringify(data)).not.toMatch(/"answer"|5 m/);
    expect(data.questions[3].hint).toBe("kinematics");
    expect(
      Object.values(
        (write("assignment_keys/copy1")!.data as { answers: Record<string, string> }).answers,
      ),
    ).toEqual(["45°", "True", "5 m", ""]);
  });

  test("a source with an invalid answer key is rejected with 400 and nothing is written", async () => {
    mockDocs.set("assignment_keys/src1", { answers: { q1: "zzz", q2: "1", q3: "" } });
    const res = await post({ sourceId: "src1" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/^Question 1/);
    expect(mockCommits).toBe(0);
  });

  test("403 for private or other-network assignments, students, and classes the caller does not own", async () => {
    mockDocs.set("assignments/src1", { ...source, visibility: "private" });
    expect((await post({ sourceId: "src1" })).status).toBe(403);
    mockDocs.set("assignments/src1", { ...source, visibility: "network" });
    expect((await post({ sourceId: "src1" })).status).toBe(403);
    expect((await post({ sourceId: "missing" })).status).toBe(403);
    mockDocs.set("assignments/src1", source);
    mockDocs.set("courses/c1", { teacherId: "other" });
    expect(await (await post({ sourceId: "src1", courseId: "c1" })).json()).toEqual({
      error: "Invalid class",
    });
    mockDocs.set("users/teacher1", { role: "student", organizationId: "orgB" });
    expect((await post({ sourceId: "src1" })).status).toBe(403);
    expect(mockCommits).toBe(0);
  });

  test("400 for an invalid body", async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ sourceId: "a/b" })).status).toBe(400);
  });

  describe("free plan", () => {
    beforeEach(() => {
      mockDocs.set("organizations/orgB", { planId: "free", subscriptionStatus: "active" });
      // Global waypoints are uncapped on the free plan.
      for (const id of ["g1", "g2", "g3", "g4"]) {
        mockDocs.set(`assignments/${id}`, { ...source, title: id });
        mockDocs.set(`assignment_keys/${id}`, { answers: { q1: "a", q2: "1", q3: "" } });
      }
    });

    test("a global waypoint can be cloned", async () => {
      expect((await post({ sourceId: "g1" })).status).toBe(200);
    });

    test("every global waypoint can be cloned on the free plan", async () => {
      for (const id of ["g1", "g2", "g3", "g4"]) {
        expect((await post({ sourceId: id })).status).toBe(200);
      }
    });

    test("a same-network waypoint is locked (network-share)", async () => {
      mockDocs.set("assignments/net", {
        ...source,
        visibility: "network",
        organizationId: "orgB",
        teacherId: "colleague",
      });
      const res = await post({ sourceId: "net" });
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({
        code: "plan_upgrade_required",
        feature: "network-share",
      });
    });

    test("teachers without an organization are on the free plan and can copy global waypoints", async () => {
      mockDocs.set("users/teacher1", { role: "teacher" });
      expect((await post({ sourceId: "g4" })).status).toBe(200);
    });

    test("own assignments can always be duplicated", async () => {
      mockDocs.set("assignments/mine", { ...source, teacherId: "teacher1", visibility: "private" });
      mockDocs.set("assignment_keys/mine", { answers: { q1: "a", q2: "1", q3: "" } });
      expect((await post({ sourceId: "mine" })).status).toBe(200);
    });

    test("a lapsed paid subscription counts as free", async () => {
      mockDocs.set("organizations/orgB", {
        planId: "department-monthly",
        subscriptionStatus: "canceled",
      });
      mockDocs.set("assignments/net", { ...source, visibility: "network", organizationId: "orgB", teacherId: "colleague" });
      expect((await post({ sourceId: "net" })).status).toBe(403);
    });
  });
});
