import { NextRequest } from "next/server";
import { buildInsightsReport, type InsightEvent } from "../src/lib/insights";

// --- Pure report ------------------------------------------------------------------------------

const ev = (o: Partial<InsightEvent>): InsightEvent => ({
  submissionId: "s1",
  assignmentId: "a1",
  assignmentTitle: "Momentum HW",
  studentId: "st1",
  courseId: "c1",
  questionId: "q1",
  tag: "momentum-not-vector",
  apUnit: 4,
  apTopic: "4.3",
  final: true,
  ...o,
});

const events: InsightEvent[] = [
  ev({ studentId: "st1", submissionId: "s1", tag: "momentum-not-vector" }),
  ev({ studentId: "st1", submissionId: "s1", questionId: "q2", tag: "momentum-not-vector" }),
  ev({ studentId: "st2", submissionId: "s2", tag: "momentum-not-vector" }),
  ev({ studentId: "st3", submissionId: "s3", tag: "momentum-not-vector", final: false }),
  ev({ studentId: "st2", submissionId: "s2", tag: "impulse-force-confusion", apTopic: "4.2" }),
  ev({ studentId: "st2", submissionId: "s2", tag: "sign-error", apTopic: null }),
  ev({
    studentId: "st4",
    submissionId: "s4",
    assignmentId: "a2",
    assignmentTitle: "Forces HW",
    courseId: "c2",
    tag: "force-implies-motion",
    apUnit: 2,
    apTopic: "2.5",
  }),
];

describe("buildInsightsReport", () => {
  test("ranks by distinct students, with counts, shares, students, assignments and topics", () => {
    const r = buildInsightsReport(
      events,
      {},
      { st1: "Ana", st2: "Ben", st3: "Cy" },
      {
        studentsInScope: 10,
      },
    );
    expect(r.top.map((t) => [t.tag, t.studentCount, t.answerCount])).toEqual([
      ["momentum-not-vector", 3, 4],
      // ties: conceptual before procedural, then label
      ["impulse-force-confusion", 1, 1], // "Confuses impulse…"
      ["force-implies-motion", 1, 1], // "Velocity is in…"
      ["sign-error", 1, 1],
    ]);
    const first = r.top[0];
    expect(first).toMatchObject({
      label: expect.stringMatching(/direction of momentum/i),
      category: "conceptual",
      studentShare: 0.3,
      students: [
        { id: "st1", name: "Ana" },
        { id: "st2", name: "Ben" },
        { id: "st3", name: "Cy" },
      ],
      assignments: [{ id: "a1", title: "Momentum HW", studentCount: 3 }],
      topics: [{ id: "4.3", label: "4.3 Conservation of linear momentum", studentCount: 3 }],
    });
    expect(r.top.find((t) => t.tag === "sign-error")!.category).toBe("procedural");
    expect(r.totals).toEqual({
      students: 4,
      studentsInScope: 10,
      submissions: 4,
      answers: 5,
      tags: 4,
    });
  });

  test("groups by AP unit, assignment and class", () => {
    const r = buildInsightsReport(
      events,
      {},
      {},
      { classNames: { c1: "Period 2", c2: "Period 5" } },
    );
    expect(r.byUnit.map((g) => [g.label, g.studentCount])).toEqual([
      ["Unit 4: Linear momentum", 3],
      ["Unit 2: Force and translational dynamics", 1],
    ]);
    expect(r.byUnit[0].top[0]).toEqual({
      tag: "momentum-not-vector",
      label: expect.any(String),
      studentCount: 3,
    });
    expect(r.byUnit[0].top).toHaveLength(3);
    expect(r.byAssignment.map((g) => g.label)).toEqual(["Momentum HW", "Forces HW"]);
    expect(r.byClass.map((g) => g.label)).toEqual(["Period 2", "Period 5"]);
  });

  test("filters by class, assignment, unit and pending review", () => {
    expect(buildInsightsReport(events, { courseId: "c2" }).top.map((t) => t.tag)).toEqual([
      "force-implies-motion",
    ]);
    expect(buildInsightsReport(events, { assignmentId: "a1", apUnit: 4 }).totals.students).toBe(3);
    expect(buildInsightsReport(events, { apUnit: 7 }).top).toEqual([]);
    const finalOnly = buildInsightsReport(events, { includePending: false });
    expect(finalOnly.top[0].studentCount).toBe(2);
  });

  test("the share never exceeds 100% when the denominator is unknown or too small", () => {
    const r = buildInsightsReport(events, {}, {}, { studentsInScope: 1 });
    expect(r.top[0].studentShare).toBe(0.75);
    expect(buildInsightsReport([], {}).totals.studentsInScope).toBe(0);
  });

  test("unknown names fall back to 'Student'", () => {
    expect(buildInsightsReport(events).top[0].students[0].name).toBe("Student");
  });
});

// --- Route ------------------------------------------------------------------------------------

type Row = { id: string; data: Record<string, unknown> };
const mockStore: Record<string, Row[]> = {};
let mockCaller: { uid: string } | null = { uid: "t1" };

function mockQuery(rows: Row[]) {
  const q = {
    where: (field: string, op: string, value: unknown) =>
      mockQuery(
        rows.filter((r) =>
          op === "in" ? (value as unknown[]).includes(r.data[field]) : r.data[field] === value,
        ),
      ),
    select: () => q,
    limit: (n: number) => mockQuery(rows.slice(0, n)),
    get: async () => ({
      size: rows.length,
      docs: rows.map((r) => ({ id: r.id, data: () => r.data })),
    }),
  };
  return q;
}

jest.mock("../src/lib/firebase-admin", () => ({
  adminDb: {
    collection: (name: string) => ({
      ...mockQuery(mockStore[name] || []),
      doc: (id: string) => ({ id, path: `${name}/${id}` }),
    }),
    getAll: async (...refs: { id: string; path: string }[]) =>
      refs.map((ref) => {
        const [name, id] = ref.path.split("/");
        const row = (mockStore[name] || []).find((r) => r.id === id);
        return { id, data: () => row?.data };
      }),
  },
}));

jest.mock("../src/lib/auth-verify", () => ({
  withAuthorizedRequest:
    (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) => (req: NextRequest) =>
      handler(req, {
        caller: mockCaller,
        profile: {},
        organizationId: "",
        body: {},
        requestId: "r",
      }),
}));

import { GET } from "../src/app/api/teacher/insights/route";

const call = (q = "") => GET(new NextRequest(`https://scorpio.test/api/teacher/insights${q}`));

beforeEach(() => {
  mockCaller = { uid: "t1" };
  mockStore.misconception_events = [
    ...events.map((e, i) => ({
      id: `e${i}`,
      data: { ...e, teacherId: "t1" } as Record<string, unknown>,
    })),
    { id: "x", data: { ...ev({ studentId: "spy", tag: "centrifugal-force" }), teacherId: "t2" } },
  ];
  mockStore.courses = [
    { id: "c1", data: { teacherId: "t1", name: "Period 2" } },
    { id: "c2", data: { teacherId: "t1", name: "Period 5" } },
    { id: "c9", data: { teacherId: "t2", name: "Not mine" } },
  ];
  mockStore.assignments = [
    { id: "a1", data: { teacherId: "t1", title: "Momentum HW", courseId: "c1", apUnit: 4 } },
    { id: "a2", data: { teacherId: "t1", title: "Forces HW", courseId: "c2", apUnit: 2 } },
  ];
  mockStore.submissions = [
    ...["st1", "st2", "st5", "st6"].map((s) => ({
      id: `sub-${s}`,
      data: { assignmentId: "a1", studentId: s, status: "graded" },
    })),
    { id: "sub-st3", data: { assignmentId: "a1", studentId: "st3", status: "pending_review" } },
    { id: "sub-st7", data: { assignmentId: "a1", studentId: "st7", status: "submitted" } },
    { id: "sub-st4", data: { assignmentId: "a2", studentId: "st4", status: "graded" } },
  ];
  mockStore.users = [
    { id: "st1", data: { role: "student", displayName: "Ana" } },
    { id: "st2", data: { role: "student", name: "Ben" } },
    { id: "st4", data: { role: "teacher", displayName: "Not a student" } },
  ];
});

describe("GET /api/teacher/insights", () => {
  test("reads only the caller's events, classes and assignments", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.top.map((t: { tag: string }) => t.tag)).not.toContain("centrifugal-force");
    expect(body.classes).toEqual([
      { id: "c1", name: "Period 2" },
      { id: "c2", name: "Period 5" },
    ]);
    expect(body.assignments.map((a: { id: string }) => a.id).sort()).toEqual(["a1", "a2"]);
    expect(body.byClass.map((g: { label: string }) => g.label)).toEqual(["Period 2", "Period 5"]);
    expect(body.truncated).toBe(false);
  });

  test("names students, never non-students, and counts graded students in scope", async () => {
    const body = await (await call("?assignmentId=a1")).json();
    expect(body.top[0].students.map((s: { name: string }) => s.name)).toEqual([
      "Ana",
      "Ben",
      "Student",
    ]);
    // st1, st2, st5, st6 graded + st3 pending; st7 still submitted.
    expect(body.totals.studentsInScope).toBe(5);
    expect(body.top[0].studentShare).toBe(0.6);
    const finalOnly = await (await call("?assignmentId=a1&pending=0")).json();
    expect(finalOnly.totals.studentsInScope).toBe(4);
    expect(finalOnly.top[0].studentCount).toBe(2);
    const unit2 = await (await call("?apUnit=2")).json();
    expect(unit2.top[0].students).toEqual([{ id: "st4", name: "Student" }]);
  });

  test("rejects malformed filters", async () => {
    for (const q of [
      "?apUnit=9",
      "?apUnit=x",
      "?courseId=a/b",
      "?assignmentId=" + "x".repeat(200),
    ]) {
      expect((await call(q)).status).toBe(400);
    }
  });
});

describe("GET /api/teacher/insights with more than one AP course", () => {
  beforeEach(() => {
    // A second class works through AP Physics C: Mechanics; its unit 2 is not AP Physics 1's unit 2.
    mockStore.misconception_events.push({
      id: "m1",
      data: {
        ...ev({
          studentId: "st8",
          submissionId: "s8",
          assignmentId: "a3",
          assignmentTitle: "C Mech forces",
          courseId: "c2",
          tag: "constant-acceleration-assumed",
          apCourse: "physics-c-mech",
          apUnit: 2,
          apTopic: "2.9",
        }),
        teacherId: "t1",
      },
    });
    mockStore.assignments.push({
      id: "a3",
      data: {
        teacherId: "t1",
        title: "C Mech forces",
        courseId: "c2",
        apCourse: "physics-c-mech",
        apUnit: 2,
      },
    });
    mockStore.submissions.push({
      id: "sub-st8",
      data: { assignmentId: "a3", studentId: "st8", status: "graded" },
    });
  });

  test("a unit is read with its course; without one it is AP Physics 1", async () => {
    const p1 = await (await call("?apUnit=2")).json();
    expect(p1.top.map((t: { tag: string }) => t.tag)).toEqual(["force-implies-motion"]);
    expect(p1.totals.studentsInScope).toBe(1);
    const mech = await (await call("?apUnit=2&apCourse=physics-c-mech")).json();
    expect(mech.filters).toMatchObject({ apUnit: 2, apCourse: "physics-c-mech" });
    expect(mech.top.map((t: { tag: string }) => t.tag)).toEqual(["constant-acceleration-assumed"]);
    expect(mech.totals.studentsInScope).toBe(1);
    expect(mech.byUnit.map((g: { id: string; label: string }) => [g.id, g.label])).toEqual([
      ["physics-c-mech:2", "AP Physics C: Mechanics · Unit 2: Force and translational dynamics"],
    ]);
    const all = await (await call()).json();
    expect(all.byUnit.map((g: { id: string }) => g.id).sort()).toEqual([
      "2",
      "4",
      "physics-c-mech:2",
    ]);
    expect(
      all.assignments.map((a: { id: string; apCourse: string }) => [a.id, a.apCourse]).sort(),
    ).toEqual([
      ["a1", "physics-1"],
      ["a2", "physics-1"],
      ["a3", "physics-c-mech"],
    ]);
  });

  test("a unit must exist in the course named", async () => {
    expect((await call("?apUnit=9&apCourse=physics-2")).status).toBe(200);
    expect((await call("?apCourse=physics-2")).status).toBe(200);
    for (const q of [
      "?apUnit=8&apCourse=physics-c-mech",
      "?apUnit=4&apCourse=physics-2",
      "?apUnit=2&apCourse=chemistry",
      "?apCourse=x",
    ])
      expect((await call(q)).status).toBe(400);
  });
});
