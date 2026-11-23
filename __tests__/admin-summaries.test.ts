import { summariseActivation, summariseUsage, summariseUsers, toMillis } from "../src/lib/admin/summaries";

const NOW = Date.parse("2026-11-19T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

describe("toMillis", () => {
  it("reads Timestamps, Dates, ISO strings and serialised seconds", () => {
    expect(toMillis({ toMillis: () => 5 })).toBe(5);
    expect(toMillis(new Date(7))).toBe(7);
    expect(toMillis("1970-01-01T00:00:01Z")).toBe(1000);
    expect(toMillis({ _seconds: 2 })).toBe(2000);
    expect(toMillis("nope")).toBeNull();
    expect(toMillis(undefined)).toBeNull();
  });
});

describe("summariseUsers", () => {
  const orgs = [
    { id: "o1", name: "Lincoln HS", planId: "pro" },
    { id: "o2", name: "Empty" },
  ];
  const users = [
    {
      id: "t1",
      role: "teacher",
      organizationId: "o1",
      createdAt: new Date(NOW - DAY),
      lastLoginAt: new Date(NOW - DAY),
    },
    { id: "s1", role: "student", teacherId: "t1", createdAt: new Date(NOW - 10 * DAY) },
    { id: "s2", role: "student", organizationId: "o1" },
    { id: "t2", role: "teacher" },
    { id: "s3", role: "student", teacherId: "t2" },
    { id: "s4", role: "student", organizationId: "gone" },
    { id: "x", role: "admin" },
  ];
  const s = summariseUsers(users, orgs, NOW);

  it("counts by role and recency", () => {
    expect(s).toMatchObject({
      total: 7,
      teachers: 2,
      students: 4,
      other: 1,
      newLast7d: 1,
      newLast30d: 2,
      activeLast7d: 1,
    });
  });

  it("inherits a student organization from their teacher and keeps empty and missing orgs", () => {
    const byId = Object.fromEntries(s.organizations.map((o) => [o.id, o]));
    expect(byId.o1).toMatchObject({ name: "Lincoln HS", planId: "pro", teachers: 1, students: 2 });
    expect(byId.o2).toMatchObject({ teachers: 0, students: 0, planId: "free" });
    expect(byId.gone).toMatchObject({ students: 1, planId: "unknown" });
    expect(s.unaffiliated).toEqual({ teachers: 1, students: 1 });
    expect(s.organizations[0].id).toBe("o1");
  });
});

describe("summariseUsage", () => {
  const rows = [
    {
      organizationId: "o1",
      userId: "a",
      type: "tutor",
      inputTokens: 10,
      outputTokens: 5,
      costCents: 2,
      timestamp: new Date(NOW - 1000),
    },
    {
      organizationId: "o1",
      userId: "b",
      type: "tutor",
      inputTokens: 1,
      outputTokens: 1,
      costCents: 1,
      timestamp: new Date(NOW - 2 * DAY),
    },
    {
      organizationId: "o2",
      userId: "a",
      type: "grading",
      costCents: 5,
      timestamp: new Date(NOW - 3 * DAY),
    },
    {
      organizationId: "o1",
      userId: "c",
      type: "tutor",
      costCents: 100,
      timestamp: new Date(NOW - 40 * DAY),
    },
  ];
  const u = summariseUsage(rows, { days: 7, orgNames: new Map([["o1", "Lincoln"]]), now: NOW });

  it("totals only the window", () => {
    expect(u).toMatchObject({
      events: 3,
      costCents: 8,
      inputTokens: 11,
      outputTokens: 6,
      activeUsers: 2,
    });
  });

  it("zero-fills one bucket per day, oldest first", () => {
    expect(u.daily).toHaveLength(7);
    expect(u.daily[6]).toEqual({ date: "2026-11-19", events: 1, costCents: 2 });
    expect(u.daily.reduce((a, d) => a + d.events, 0)).toBe(3);
  });

  it("breaks down by feature and organization", () => {
    expect(u.byType[0]).toEqual({ type: "tutor", events: 2, costCents: 3 });
    expect(u.byOrganization[0]).toMatchObject({ id: "o2", name: "o2", costCents: 5 });
    expect(u.byOrganization[1]).toMatchObject({ id: "o1", name: "Lincoln", events: 2 });
  });
});

describe("summariseActivation", () => {
  const f = summariseActivation({
    teacherIds: ["new", "classOnly", "assigned", "full", "studentsNoWork"],
    courses: [
      { teacherId: "classOnly" },
      { teacherId: "assigned" },
      { teacherId: "full" },
      { teacherId: "studentsNoWork" },
      { teacherId: "gone" },
    ],
    assignments: [
      { teacherId: "assigned", courseId: "c1", visibility: "private" },
      { teacherId: "full", courseId: "c2" },
      { teacherId: "classOnly", courseId: null }, // not given to a class
      { teacherId: "classOnly", courseId: "c0", visibility: "global" }, // library set
    ],
    students: [{ teacherId: "full" }, { teacherId: "full" }, { teacherId: "studentsNoWork" }],
    submissions: [
      { teacherId: "full", status: "graded" },
      { teacherId: "assigned", status: "draft" },
    ],
  });

  it("counts each step only when the earlier ones are done", () => {
    expect(f.teachers).toBe(5);
    expect(f.reached).toEqual({ class: 4, assigned: 2, students: 1, submissions: 1 });
  });

  it("gives each teacher the last step they finished", () => {
    expect(f.byTeacher.new.reached).toBeNull();
    expect(f.byTeacher.classOnly.reached).toBe("class");
    expect(f.byTeacher.assigned.reached).toBe("assigned");
    expect(f.byTeacher.full).toEqual({
      reached: "submissions",
      classes: 1,
      assignments: 1,
      students: 2,
      submissions: 1,
    });
    // Students without an assignment stay at "class": the funnel is in order.
    expect(f.byTeacher.studentsNoWork.reached).toBe("class");
    expect(f.byTeacher.studentsNoWork.students).toBe(1);
  });
});
