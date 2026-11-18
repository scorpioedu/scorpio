// PATCH /api/courses/{id}/plan, POST /api/courses/{id}/due-dates and GET /api/teacher/courses/progress.
import { NextRequest } from "next/server";
import { defaultOrder, moveUnit } from "../src/lib/curriculum-plan";

type Data = Record<string, unknown>;
const mockDocs = new Map<string, Data>();
const mockWrites: { op: string; path: string; data?: Data }[] = [];
let mockUid = "t1";
const DELETE = { __delete: true };

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
    },
  });
  return {
    adminFieldWithValue: { delete: () => ({ __delete: true }) },
    adminDb: {
      collection: (name: string) => {
        const filters: [string, string, unknown][] = [];
        const q = {
          where: (f: string, op: string, v: unknown) => (filters.push([f, op, v]), q),
          limit: () => q,
          select: () => q,
          get: async () => {
            const docs = [...mockDocs.entries()]
              .filter(
                ([p, d]) =>
                  p.startsWith(`${name}/`) &&
                  filters.every(([f, op, v]) =>
                    op === "in" ? (v as unknown[]).includes(d[f]) : d[f] === v,
                  ),
              )
              .map(([p]) => snap(p, p.slice(name.length + 1)));
            return { docs, empty: docs.length === 0, size: docs.length };
          },
          doc: (id: string) => ref(name, id),
        };
        return q;
      },
      getAll: async (...refs: { path: string; id: string }[]) =>
        refs.map((r) => snap(r.path, r.id)),
      batch: () => ({
        update: (r: { path: string }, data: Data) =>
          mockWrites.push({ op: "batch.update", path: r.path, data }),
        commit: async () => undefined,
      }),
    },
  };
});
jest.mock("../src/lib/auth-verify", () => ({
  withAuthorizedRequest:
    (
      handler: (req: NextRequest, ctx: unknown) => Promise<Response>,
      options: { teacher?: boolean },
    ) =>
    async (req: NextRequest) => {
      const profile = mockDocs.get(`users/${mockUid}`) ?? {};
      if (options.teacher && profile.role !== "teacher")
        return Response.json({ error: "Access denied" }, { status: 403 });
      return handler(req, { caller: { uid: mockUid }, profile, requestId: "r" });
    },
}));

import { PATCH as savePlan } from "../src/app/api/courses/[id]/plan/route";
import { POST as moveDates } from "../src/app/api/courses/[id]/due-dates/route";
import { GET as progress } from "../src/app/api/teacher/courses/progress/route";

const url = "https://scorpio.test";
const send = (path: string, body: unknown, method = "POST") =>
  new NextRequest(`${url}${path}`, { method, body: JSON.stringify(body) });
const all = defaultOrder("ap-physics-1");

beforeEach(() => {
  mockDocs.clear();
  mockWrites.length = 0;
  mockUid = "t1";
  mockDocs.set("users/t1", { role: "teacher" });
  mockDocs.set("users/t2", { role: "teacher" });
  mockDocs.set("users/s1", { role: "student", courseId: "c1" });
  mockDocs.set("users/s2", { role: "student", courseId: "c1" });
  mockDocs.set("courses/c1", { teacherId: "t1", curriculumId: "ap-physics-1" });
  mockDocs.set("courses/plain", { teacherId: "t1" });
  mockDocs.set("courses/other", { teacherId: "t2", curriculumId: "ap-physics-1" });
});

describe("PATCH /api/courses/{id}/plan", () => {
  const patch = (id: string, body: unknown) =>
    savePlan(send(`/api/courses/${id}/plan`, body, "PATCH"));

  test("a changed order and skipped sets are stored", async () => {
    const order = moveUnit(all, 5, -1);
    const res = await patch("c1", { plan: { order, skipped: ["2C"] } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "c1", plan: { order, skipped: ["2C"] } });
    expect(mockWrites).toEqual([
      { op: "update", path: "courses/c1", data: { curriculumPlan: { order, skipped: ["2C"] } } },
    ]);
  });

  test("the course as written, or null, removes the stored plan", async () => {
    expect(await (await patch("c1", { plan: { order: all, skipped: [] } })).json()).toEqual({
      id: "c1",
      plan: null,
    });
    expect(await (await patch("c1", { plan: null })).json()).toEqual({ id: "c1", plan: null });
    expect(mockWrites.map((w) => w.data)).toEqual([
      { curriculumPlan: DELETE },
      { curriculumPlan: DELETE },
    ]);
  });

  test("a broken plan, or a plan for a class with no course, is refused and nothing is written", async () => {
    const split = [...all];
    [split[3], split[4]] = [split[4], split[3]];
    const bad = await patch("c1", { plan: { order: split, skipped: [] } });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toMatch(/stay together/);
    expect((await patch("c1", { plan: { order: all, skipped: ["9Z"] } })).status).toBe(400);
    expect((await patch("plain", { plan: { order: all, skipped: [] } })).status).toBe(400);
    expect((await patch("c1", {})).status).toBe(400);
    expect((await patch("c1", { plan: "x" })).status).toBe(400);
    expect(mockWrites).toEqual([]);
  });

  test("the calendar is validated, sorted, and can be cleared; it needs no course", async () => {
    const res = await patch("plain", {
      daysOff: [
        { start: "2027-03-22", end: "2027-03-26", label: " Spring break " },
        { start: "2026-10-09", end: "2026-10-09", label: "PD day" },
      ],
    });
    expect(res.status).toBe(200);
    const saved = [
      { start: "2026-10-09", end: "2026-10-09", label: "PD day" },
      { start: "2027-03-22", end: "2027-03-26", label: "Spring break" },
    ];
    expect(mockWrites[0].data).toEqual({ daysOff: saved });
    expect(
      (await patch("plain", { daysOff: [{ start: "2027-03-26", end: "2027-03-22" }] })).status,
    ).toBe(400);
    expect(await (await patch("plain", { daysOff: null })).json()).toEqual({
      id: "plain",
      daysOff: null,
    });
    expect(await (await patch("plain", { daysOff: [] })).json()).toEqual({
      id: "plain",
      daysOff: [],
    });
    expect(mockWrites).toHaveLength(3);
  });

  test("only the owning teacher", async () => {
    expect((await patch("other", { plan: null })).status).toBe(403);
    expect((await patch("missing", { plan: null })).status).toBe(403);
    mockUid = "s1";
    expect((await patch("c1", { plan: null })).status).toBe(403);
    expect(mockWrites).toEqual([]);
  });
});

describe("POST /api/courses/{id}/due-dates", () => {
  const post = (id: string, updates: unknown) =>
    moveDates(send(`/api/courses/${id}/due-dates`, { updates }));
  beforeEach(() => {
    mockDocs.set("assignments/a1", { teacherId: "t1", courseId: "c1" });
    mockDocs.set("assignments/a2", { teacherId: "t1", courseId: "c1" });
    mockDocs.set("assignments/elsewhere", { teacherId: "t1", courseId: "plain" });
    mockDocs.set("assignments/theirs", { teacherId: "t2", courseId: "c1" });
  });

  test("moves only the due dates of the class's own assignments", async () => {
    const res = await post("c1", [
      { assignmentId: "a1", dueDate: "2027-01-06T23:59:00.000Z" },
      { assignmentId: "a2", dueDate: null },
    ]);
    expect(await res.json()).toEqual({ updated: 2 });
    expect(mockWrites).toEqual([
      {
        op: "batch.update",
        path: "assignments/a1",
        data: { dueDate: new Date("2027-01-06T23:59:00.000Z") },
      },
      { op: "batch.update", path: "assignments/a2", data: { dueDate: null } },
    ]);
  });

  test("one assignment from another class or teacher, or a missing one, stops the whole move", async () => {
    for (const id of ["elsewhere", "theirs", "missing"]) {
      const res = await post("c1", [
        { assignmentId: "a1", dueDate: "2027-01-06T23:59:00.000Z" },
        { assignmentId: id, dueDate: "2027-01-06T23:59:00.000Z" },
      ]);
      expect(res.status).toBe(403);
    }
    expect(mockWrites).toEqual([]);
  });

  test("bad input and other people's classes are refused", async () => {
    expect((await post("c1", [])).status).toBe(400);
    expect((await post("c1", [{ assignmentId: "a1", dueDate: "not a date" }])).status).toBe(400);
    expect(
      (
        await post("c1", [
          { assignmentId: "a1", dueDate: 1 },
          { assignmentId: "a1", dueDate: 2 },
        ])
      ).status,
    ).toBe(400);
    expect((await post("other", [{ assignmentId: "a1", dueDate: 1 }])).status).toBe(403);
    expect(mockWrites).toEqual([]);
  });
});

describe("GET /api/teacher/courses/progress", () => {
  const get = (q: string) => progress(new NextRequest(`${url}/api/teacher/courses/progress${q}`));
  beforeEach(() => {
    const a = (id: string, key: string | undefined, courseId = "c1") =>
      mockDocs.set(`assignments/${id}`, {
        teacherId: "t1",
        courseId,
        curriculumId: key ? "ap-physics-1" : undefined,
        curriculumSetKey: key,
      });
    a("a4A", "4A");
    a("a4B", "4B");
    a("own", undefined);
    a("elsewhere", "4A", "plain");
    const s = (
      id: string,
      assignmentId: string,
      studentId: string,
      status: string,
      score?: number,
    ) =>
      mockDocs.set(`submissions/${id}`, {
        assignmentId,
        studentId,
        status,
        graded: status === "graded",
        score,
      });
    s("x1", "a4A", "s1", "graded", 60);
    s("x2", "a4A", "s2", "graded", 80);
    s("x3", "a4B", "s1", "pending_review");
    s("x4", "elsewhere", "s9", "graded", 100);
    const e = (
      id: string,
      studentId: string,
      assignmentId = "a4A",
      courseId = "c1",
      teacherId = "t1",
    ) =>
      mockDocs.set(`misconception_events/${id}`, {
        teacherId,
        courseId,
        assignmentId,
        studentId,
        submissionId: `sub-${studentId}`,
        questionId: "q1",
        tag: "momentum-not-vector",
        apUnit: 4,
        apTopic: "4.1",
        final: true,
      });
    e("e1", "s1");
    e("e2", "s2");
    e("e3", "s9", "elsewhere", "plain");
    e("e4", "s8", "a4A", "c1", "t2");
  });

  test("per-set progress and unit misconceptions for this class only", async () => {
    const res = await get("?courseId=c1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      courseId: "c1",
      curriculumId: "ap-physics-1",
      students: 2,
      truncated: false,
    });
    expect(body.sets).toEqual({
      "4A": {
        key: "4A",
        assignmentId: "a4A",
        submitted: 2,
        graded: 2,
        pending: 0,
        averageScore: 70,
        overdue: 0,
        needsReview: 0,
      },
      "4B": {
        key: "4B",
        assignmentId: "a4B",
        submitted: 1,
        graded: 0,
        pending: 1,
        averageScore: null,
        overdue: 0,
        needsReview: 0,
      },
    });
    expect(body.units).toHaveLength(1);
    expect(body.units[0]).toMatchObject({ unit: 4, studentsInScope: 2 });
    expect(body.units[0].top[0]).toMatchObject({
      tag: "momentum-not-vector",
      studentCount: 2,
      studentShare: 1,
    });
    expect(body.units[0].top[0].suggestion).toMatch(/revisit 4\.1/);
  });

  test("overdue and needsReview for the Status board", async () => {
    // 4A was due last week and only s1 handed 4B in; 4B is due next week. s2's 4A work has an
    // answer to check after a key change.
    const week = 7 * 24 * 60 * 60 * 1000;
    mockDocs.set("assignments/a4A", {
      ...mockDocs.get("assignments/a4A"),
      dueDate: { toDate: () => new Date(Date.now() - week) },
    });
    mockDocs.set("assignments/a4B", {
      ...mockDocs.get("assignments/a4B"),
      dueDate: new Date(Date.now() + week).toISOString(),
    });
    mockDocs.set("submissions/x2", { ...mockDocs.get("submissions/x2"), reviewQuestions: ["q1"] });
    mockDocs.delete("submissions/x1");
    const body = await (await get("?courseId=c1")).json();
    // s1 has nothing in for 4A and it is past due; 4B is not due yet although s2 has not started.
    expect(body.sets["4A"]).toMatchObject({ submitted: 1, overdue: 1, needsReview: 1 });
    expect(body.sets["4B"]).toMatchObject({ submitted: 1, overdue: 0, needsReview: 0 });
  });
  test("a class that follows nothing still reports sets assigned from a course", async () => {
    const body = await (await get("?courseId=plain")).json();
    expect(body.curriculumId).toBe("ap-physics-1");
    expect(body.sets["4A"]).toMatchObject({
      assignmentId: "elsewhere",
      graded: 1,
      averageScore: 100,
    });
    expect(body.students).toBe(0);
  });

  test("a course can be asked for by id; an unknown one is refused", async () => {
    const other = await (await get("?courseId=c1&curriculumId=ap-physics-c-mech")).json();
    expect(other).toMatchObject({ curriculumId: "ap-physics-c-mech", sets: {}, units: [] });
    const same = await (await get("?courseId=c1&curriculumId=ap-physics-1")).json();
    expect(Object.keys(same.sets)).toEqual(["4A", "4B"]);
    expect((await get("?courseId=c1&curriculumId=nope")).status).toBe(400);
  });

  test("bad ids, other teachers' classes and students are refused", async () => {
    expect((await get("")).status).toBe(400);
    expect((await get("?courseId=a/b")).status).toBe(400);
    expect((await get("?courseId=other")).status).toBe(403);
    expect((await get("?courseId=missing")).status).toBe(403);
    mockUid = "s1";
    expect((await get("?courseId=c1")).status).toBe(403);
  });
});
