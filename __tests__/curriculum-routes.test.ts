// Publish by course set, the sets status route, class follow/unfollow, and clone keeping the set fields.
import { NextRequest } from "next/server";
import units46 from "../content/ap-physics-1/units-4-6.json";
import { getCurriculum, displayTitle, setSequence } from "../src/data/curricula";

type Data = Record<string, unknown>;
const mockDocs = new Map<string, Data>();
const mockWrites: { op: string; path: string; data?: unknown }[] = [];
let mockId = 0;
let mockUid = "admin1";
let mockAdmin = true;

jest.mock("../src/lib/firebase-admin", () => {
  const snap = (path: string, id: string) => ({
    id,
    exists: mockDocs.has(path),
    data: () => mockDocs.get(path),
  });
  const ref = (name: string, id: string) => ({
    id,
    path: `${name}/${id}`,
    get: async () => snap(`${name}/${id}`, id),
    update: async (data: Data) => {
      mockWrites.push({ op: "update", path: `${name}/${id}`, data });
      mockDocs.set(`${name}/${id}`, { ...mockDocs.get(`${name}/${id}`), ...data });
    },
  });
  return {
    adminFieldWithValue: { increment: (n: number) => ({ __increment: n }) },
    adminDb: {
      collection: (name: string) => {
        const filters: [string, unknown][] = [];
        let max = Infinity;
        const q = {
          where: (f: string, _op: string, v: unknown) => (filters.push([f, v]), q),
          limit: (n: number) => ((max = n), q),
          get: async () => {
            const docs = [...mockDocs.entries()]
              .filter(([p, d]) => p.startsWith(`${name}/`) && filters.every(([f, v]) => d[f] === v))
              .slice(0, max)
              .map(([p]) => snap(p, p.slice(name.length + 1)));
            return { docs, empty: docs.length === 0, size: docs.length };
          },
          doc: (id?: string) => ref(name, id ?? `new${++mockId}`),
        };
        return q;
      },
      getAll: async (...refs: { path: string; id: string }[]) =>
        refs.map((r) => snap(r.path, r.id)),
      batch: () => ({
        set: (r: { path: string }, data: unknown) =>
          mockWrites.push({ op: "set", path: r.path, data }),
        update: (r: { path: string }, data: unknown) =>
          mockWrites.push({ op: "batch.update", path: r.path, data }),
        commit: async () => undefined,
      }),
      runTransaction: async (fn: (tx: unknown) => Promise<void>) =>
        fn({
          get: async (target: { get: () => Promise<unknown> }) => target.get(),
          create: (r: { path: string }, data: unknown) =>
            mockWrites.push({ op: "create", path: r.path, data }),
        }),
    },
  };
});
jest.mock("../src/lib/auth-verify", () => ({
  authenticateRequest: async () => ({ uid: mockUid }),
  withAuthorizedRequest:
    (
      handler: (req: NextRequest, ctx: unknown) => Promise<Response>,
      options: { teacher?: boolean; admin?: boolean },
    ) =>
    async (req: NextRequest) => {
      if (options.admin && !mockAdmin)
        return Response.json({ error: "Admin access required" }, { status: 403 });
      const profile = mockDocs.get(`users/${mockUid}`) ?? {};
      if (options.teacher && profile.role !== "teacher")
        return Response.json({ error: "Access denied" }, { status: 403 });
      return handler(req, {
        caller: { uid: mockUid },
        profile,
        organizationId: "",
        body: {},
        requestId: "r",
      });
    },
}));
jest.mock("../src/lib/ai/config", () => ({ model: { generateContent: jest.fn() } }));

import { POST as publish } from "../src/app/api/admin/content/publish/route";
import { GET as setsStatus } from "../src/app/api/admin/content/sets/route";
import { PATCH as follow } from "../src/app/api/courses/[id]/curriculum/route";
import { POST as createClass } from "../src/app/api/courses/route";
import { POST as clone } from "../src/app/api/assignments/clone/route";

const url = "https://scorpio.test";
const post = (path: string, body: unknown, method = "POST") =>
  new NextRequest(`${url}${path}`, { method, body: JSON.stringify(body) });

const set4A = getCurriculum("ap-physics-1")!.sets.find((s) => s.key === "4A")!;
const draftRecord = (id: string) => units46.drafts.find((d) => d.id === id)!;
function seedDrafts(set = set4A, status = "approved", reviewKind: string | null = "human") {
  for (const id of set.draftIds) {
    const r = draftRecord(id);
    mockDocs.set(`content_drafts/${id}`, {
      apUnit: r.apUnit,
      apTopic: r.apTopic,
      problem: r.problem,
      status,
      reviewKind,
    });
  }
}
const assignmentWrite = () =>
  mockWrites.find((w) => w.op === "set" && w.path.startsWith("assignments/"))!.data as Data;

beforeEach(() => {
  mockDocs.clear();
  mockWrites.length = 0;
  mockUid = "admin1";
  mockAdmin = true;
  delete process.env.FIRESTORE_EMULATOR_HOST;
});

describe("publish by course set", () => {
  test("title, description, order and set fields come from the definition", async () => {
    seedDrafts();
    const res = await publish(
      post("/api/admin/content/publish", { curriculumId: "ap-physics-1", setKey: "4A" }),
    );
    expect(res.status).toBe(200);
    const a = assignmentWrite();
    expect(a).toMatchObject({
      title: displayTitle(set4A),
      description: set4A.description,
      visibility: "global",
      apUnit: 4,
      curriculumId: "ap-physics-1",
      curriculumSetKey: "4A",
      curriculumSequence: setSequence("ap-physics-1", "4A"),
      contentDraftIds: set4A.draftIds,
      contentSource: "scorpio-reviewed",
    });
    // Question order = definition order (each question carries its draft's topic).
    const topics = (a.questions as { apTopic: string }[]).map((q) => q.apTopic);
    expect(topics).toEqual(set4A.draftIds.map((id) => draftRecord(id).apTopic));
    expect(mockWrites.filter((w) => w.op === "batch.update")).toHaveLength(set4A.draftIds.length);
  });

  test("unknown set 400; an already published set 409; bodies mixing both modes 400", async () => {
    seedDrafts();
    const p = (b: unknown) => publish(post("/api/admin/content/publish", b));
    expect((await p({ curriculumId: "ap-physics-1", setKey: "9Z" })).status).toBe(400);
    expect((await p({ curriculumId: "nope", setKey: "4A" })).status).toBe(400);
    expect((await p({ curriculumId: "ap-physics-1", setKey: "4A", title: "x" })).status).toBe(400);
    mockDocs.set("assignments/existing", {
      visibility: "global",
      curriculumId: "ap-physics-1",
      curriculumSetKey: "4A",
    });
    const dup = await p({ curriculumId: "ap-physics-1", setKey: "4A" });
    expect(dup.status).toBe(409);
    expect((await dup.json()).error).toMatch(/already published/);
    expect(mockWrites).toEqual([]);
  });

  test("every existing check still applies: unapproved, missing and AI-only drafts are refused", async () => {
    const p = () =>
      publish(post("/api/admin/content/publish", { curriculumId: "ap-physics-1", setKey: "4A" }));
    expect((await p()).status).toBe(409); // drafts missing
    seedDrafts(set4A, "draft");
    expect((await p()).status).toBe(409);
    seedDrafts(set4A, "approved", "ai");
    const ai = await p();
    expect(ai.status).toBe(409);
    expect((await ai.json()).error).toMatch(/checked by AI/);
    process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
    expect((await p()).status).toBe(200);
    expect(mockWrites.filter((w) => w.path.startsWith("assignments/"))).toHaveLength(1);
  });

  test("the assignment's AP course is the course definition's; drafts of another course are refused", async () => {
    seedDrafts();
    const p = () =>
      publish(post("/api/admin/content/publish", { curriculumId: "ap-physics-1", setKey: "4A" }));
    expect((await p()).status).toBe(200);
    expect(assignmentWrite().apCourse).toBe("physics-1");
    // Unit 4 also exists in C: Mechanics: its drafts must not fill an AP Physics 1 set.
    mockWrites.length = 0;
    for (const id of set4A.draftIds)
      mockDocs.set(`content_drafts/${id}`, {
        ...mockDocs.get(`content_drafts/${id}`),
        course: "physics-c-mech",
      });
    const res = await p();
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/another AP course/);
    expect(mockWrites).toEqual([]);
  });

  test("the old draftIds + title body still works", async () => {
    seedDrafts();
    const res = await publish(
      post("/api/admin/content/publish", { draftIds: set4A.draftIds.slice(0, 2), title: "Mine" }),
    );
    expect(res.status).toBe(200);
    expect(assignmentWrite().curriculumId).toBeUndefined();
  });
});

describe("GET /api/admin/content/sets", () => {
  const get = (q: string) => setsStatus(new NextRequest(`${url}/api/admin/content/sets${q}`));

  test("per-set draft states and whether a set is published", async () => {
    seedDrafts(set4A, "approved", "ai");
    mockDocs.set(`content_drafts/${set4A.draftIds[1]}`, {
      status: "approved",
      reviewKind: "human",
    });
    mockDocs.set(`content_drafts/${set4A.draftIds[2]}`, { status: "draft" });
    mockDocs.delete(`content_drafts/${set4A.draftIds[3]}`);
    mockDocs.set("assignments/w4B", {
      visibility: "global",
      curriculumId: "ap-physics-1",
      curriculumSetKey: "4B",
    });
    const body = await (await get("?curriculumId=ap-physics-1")).json();
    expect(body.sets).toHaveLength(32);
    expect(
      body.sets
        .find((x: { key: string }) => x.key === "4A")
        .drafts.map((d: { state: string }) => d.state),
    ).toEqual(["ai-reviewed", "human-approved", "draft", "missing", "ai-reviewed"]);
    expect(body.sets.find((x: { key: string }) => x.key === "4A").assignmentId).toBeNull();
    expect(body.sets.find((x: { key: string }) => x.key === "4B").assignmentId).toBe("w4B");
    expect(
      body.sets
        .find((x: { key: string }) => x.key === "4B")
        .drafts.every((d: { state: string }) => d.state === "missing"),
    ).toBe(true);
  });

  test("unknown course 400; admin only", async () => {
    expect((await get("?curriculumId=zzz")).status).toBe(400);
    expect((await get("")).status).toBe(400);
    mockAdmin = false;
    expect((await get("?curriculumId=ap-physics-1")).status).toBe(403);
  });
});

describe("class follows a course", () => {
  const patch = (id: string, body: unknown) =>
    follow(post(`/api/courses/${id}/curriculum`, body, "PATCH"));
  beforeEach(() => {
    mockUid = "t1";
    mockDocs.set("users/t1", { role: "teacher", organizationId: "org" });
    mockDocs.set("users/t2", { role: "teacher", organizationId: "org" });
    mockDocs.set("users/s1", { role: "student" });
    mockDocs.set("courses/c1", { teacherId: "t1", name: "P3" });
  });

  test("owner follows and unfollows", async () => {
    const res = await patch("c1", { curriculumId: "ap-physics-1" });
    expect(res.status).toBe(200);
    expect(mockDocs.get("courses/c1")).toMatchObject({ curriculumId: "ap-physics-1" });
    expect((await patch("c1", { curriculumId: null })).status).toBe(200);
    expect(mockDocs.get("courses/c1")!.curriculumId).toBeNull();
  });

  test("unknown course 400, bad body 400, nothing written", async () => {
    expect((await patch("c1", { curriculumId: "nope" })).status).toBe(400);
    expect((await patch("c1", {})).status).toBe(400);
    expect(mockWrites).toEqual([]);
    expect(mockDocs.get("courses/c1")!.curriculumId).toBeUndefined();
  });

  test("only the owning teacher: other teachers, students and missing classes get 403", async () => {
    mockUid = "t2";
    expect((await patch("c1", { curriculumId: "ap-physics-1" })).status).toBe(403);
    mockUid = "s1";
    expect((await patch("c1", { curriculumId: "ap-physics-1" })).status).toBe(403);
    mockUid = "t1";
    expect((await patch("missing", { curriculumId: "ap-physics-1" })).status).toBe(403);
    expect(mockDocs.get("courses/c1")!.curriculumId).toBeUndefined();
  });

  test("creating a class can follow a known course; unknown is 400 and creates nothing", async () => {
    const make = (body: Data) =>
      createClass(post("/api/courses", { name: "AP", code: "ABCDEF12", ...body }));
    expect((await make({ curriculumId: "nope" })).status).toBe(400);
    expect(mockWrites).toEqual([]);
    expect((await make({ curriculumId: "ap-physics-1" })).status).toBe(200);
    const created = mockWrites.find((w) => w.path.startsWith("courses/"))!.data as Data;
    expect(created).toMatchObject({ teacherId: "t1", curriculumId: "ap-physics-1" });
    mockWrites.length = 0;
    expect((await make({})).status).toBe(200);
    expect(
      "curriculumId" in (mockWrites.find((w) => w.path.startsWith("courses/"))!.data as Data),
    ).toBe(false);
  });
});

describe("clone keeps the course set", () => {
  test("curriculumId, curriculumSetKey and curriculumSequence are copied", async () => {
    mockUid = "t1";
    mockDocs.set("users/t1", { role: "teacher", organizationId: "org" });
    mockDocs.set("courses/c1", { teacherId: "t1" });
    mockDocs.set("assignments/w4A", {
      teacherId: "admin1",
      visibility: "global",
      title: "T",
      answerKeySeparated: true,
      curriculumId: "ap-physics-1",
      curriculumSetKey: "4A",
      curriculumSequence: 0,
      questions: [
        { id: "q1", text: "Pick", type: "multiple-choice", options: ["a", "b"], points: 2 },
      ],
    });
    mockDocs.set("assignment_keys/w4A", { answers: { q1: "a" }, rubric: "" });
    const res = await clone(
      post("/api/assignments/clone", { sourceId: "w4A", courseId: "c1", title: "T" }),
    );
    expect(res.status).toBe(200);
    expect(assignmentWrite()).toMatchObject({
      curriculumId: "ap-physics-1",
      curriculumSetKey: "4A",
      curriculumSequence: 0,
      courseId: "c1",
      visibility: "private",
    });
  });
});
