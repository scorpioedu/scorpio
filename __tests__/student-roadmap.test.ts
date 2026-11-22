// The student's course roadmap on the dashboard, and unit grouping in the class's own order.
import { buildStudentRoadmap } from "../src/lib/student-roadmap";
import { groupByUnit } from "../src/lib/student-grouping";
import { defaultOrder, moveSet, moveUnit } from "../src/lib/curriculum-plan";

const ID = "ap-physics-1";
const a = (key: string | undefined, id = `a${key}`, dueDate: Date | null = null) => ({
  id,
  title: `Set ${key}`,
  dueDate,
  curriculumSetKey: key,
});
const s = (assignmentId: string, status = "graded", score?: number) => ({
  assignmentId,
  status,
  graded: status === "graded",
  score,
});

describe("student roadmap", () => {
  test("no course, no roadmap", () => {
    expect(buildStudentRoadmap(null, null, [], [])).toBeNull();
    expect(buildStudentRoadmap("nope", null, [], [])).toBeNull();
  });

  test("units come in course order with the student's own progress", () => {
    const assignments = [..."ABCD"]
      .map((l) => a(`1${l}`))
      .concat([a("2A"), a("2B"), a(undefined, "own")]);
    const r = buildStudentRoadmap(ID, null, assignments, [
      s("a1A", "graded", 80),
      s("a1B", "graded", 60),
      s("a1C", "submitted"),
      s("a1D", "draft"),
      s("own", "graded", 5),
    ])!;
    expect(r.courseName).toBe("AP Physics 1");
    expect(r.units).toHaveLength(8);
    expect(r.units[0]).toMatchObject({
      unit: 1,
      label: "Unit 1: Kinematics",
      planned: 4,
      assigned: 4,
      done: 3,
      averageScore: 70,
      state: "current",
    });
    expect(r.units[0].next).toMatchObject({ id: "a1D", title: "Set 1D" });
    expect(r.units[1]).toMatchObject({ planned: 4, assigned: 2, done: 0, state: "upcoming" });
    expect(r.units[2]).toMatchObject({ assigned: 0, state: "not-assigned", next: null });
    expect(r).toMatchObject({ done: 3, planned: 32 });
    expect(r.upNext?.id).toBe("a1D");
  });

  test("a unit is done only when every planned set is handed in", () => {
    const all = [..."ABCD"].map((l) => a(`1${l}`));
    const subs = all.map((x) => s(x.id, "graded", 90));
    expect(buildStudentRoadmap(ID, null, all, subs)!.units[0]).toMatchObject({
      state: "done",
      done: 4,
    });
    // Three assigned and handed in, the fourth not assigned yet: still in progress, nothing to do now.
    const three = buildStudentRoadmap(ID, null, all.slice(0, 3), subs.slice(0, 3))!;
    expect(three.units[0]).toMatchObject({ state: "current", next: null, done: 3, planned: 4 });
    expect(three.upNext).toBeNull();
  });

  test("the class's plan sets the order; skipped sets do not count unless assigned", () => {
    const plan = {
      order: moveUnit(defaultOrder(ID), 2, -1),
      skipped: ["1C", "1D", "3A", "3B", "3C", "3D"],
    };
    const r = buildStudentRoadmap(
      ID,
      plan,
      [a("1A"), a("1B"), a("1D"), a("2A")],
      [s("a1A"), s("a1B"), s("a1D")],
    )!;
    expect(r.units.map((u) => u.unit)).toEqual([2, 1, 4, 5, 6, 7, 8]); // unit 3 is skipped entirely
    const u1 = r.units[1];
    expect(u1).toMatchObject({ unit: 1, planned: 3, done: 3, state: "done" }); // 1D counts: it was assigned
    expect(r.units[0]).toMatchObject({ unit: 2, state: "current" });
    expect(r.planned).toBe(4 + 3 + 20);
  });

  test("what is due first comes next, even from a later unit", () => {
    const r = buildStudentRoadmap(
      ID,
      null,
      [
        a("1A", "a1A", new Date("2027-01-11T23:59:00")),
        a("1B", "a1B", new Date("2027-01-08T23:59:00")),
        a("3A", "a3A", new Date("2026-11-18T23:59:00")),
      ],
      [],
    )!;
    expect(r.units[0].next?.id).toBe("a1B");
    expect(r.upNext?.id).toBe("a3A");
    expect(r.units[0].state).toBe("current");
  });

  test("a second copy of a set and unknown keys are ignored", () => {
    const r = buildStudentRoadmap(ID, null, [a("1A"), a("1A", "again"), a("9Z")], [s("again")])!;
    expect(r.units[0]).toMatchObject({ assigned: 1, done: 0 });
  });
});

describe("grouping in the class's order", () => {
  const items = ["1A", "1B", "2A", undefined].map((key, i) => ({
    id: `i${i}`,
    title: `t${i}`,
    dueDate: null,
    curriculumSetKey: key,
    curriculumSequence: i,
  }));
  test("without a plan: course order, as before", () => {
    expect(groupByUnit(items).map((g) => g.id)).toEqual(["unit-1", "unit-2", "other"]);
  });
  test("with a plan: units and sets follow it", () => {
    const order = moveSet(moveUnit(defaultOrder(ID), 2, -1), "1B", -1);
    const groups = groupByUnit(items, order);
    expect(groups.map((g) => g.id)).toEqual(["unit-2", "unit-1", "other"]);
    expect(groups[1].items.map((i) => i.curriculumSetKey)).toEqual(["1B", "1A"]);
  });
  test("after the class changes course, sets from the old course are not filed under the new course's units", () => {
    const mixed = [
      {
        id: "old",
        title: "old 1A",
        dueDate: null,
        curriculumSetKey: "1A",
        curriculumId: "ap-physics-1",
      },
      {
        id: "new",
        title: "new 1A",
        dueDate: null,
        curriculumSetKey: "1A",
        curriculumId: "ap-physics-c-mech",
      },
      // A copy from before copies carried a course id: only its AP course says where it is from.
      {
        id: "legacy",
        title: "legacy 2A",
        dueDate: null,
        curriculumSetKey: "2A",
        apCourse: "physics-1",
      },
      {
        id: "mine",
        title: "legacy own 2B",
        dueDate: null,
        curriculumSetKey: "2B",
        apCourse: "physics-c-mech",
      },
    ];
    const groups = groupByUnit(mixed, undefined, "physics-c-mech", "ap-physics-c-mech");
    expect(groups.map((g) => [g.id, g.items.map((i) => i.id)])).toEqual([
      ["unit-1", ["new"]],
      ["unit-2", ["mine"]],
      ["other", ["legacy", "old"]],
    ]);
    // Without the class's course nothing is known, and grouping is by key as before.
    expect(groupByUnit(mixed).map((g) => g.id)).toEqual(["unit-1", "unit-2"]);
  });
});
