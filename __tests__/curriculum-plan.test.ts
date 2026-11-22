// A class's own order and skipped sets, the pacing guide and bulk due-date moves.
import { getCurriculum } from "../src/data/curricula";
import {
  defaultOrder,
  isDefaultPlan,
  moveSet,
  moveUnit,
  normalisePlan,
  parsePlan,
  planStartingAt,
  livePlan,
  toggleSkipped,
  unitOrder,
  withSkipped,
} from "../src/lib/curriculum-plan";
import { deriveRoadmap, nextUnit } from "../src/lib/curriculum-roadmap";
import { paceCourse, respaceDueDates, shiftDueDates } from "../src/lib/course-pacing";
import { defaultDaysOff, schoolDays } from "../src/lib/school-calendar";
import { toDateInput } from "../src/lib/first-run";

const ID = "ap-physics-1";
const all = defaultOrder(ID);
const day = (s: string) => new Date(`${s}T12:00:00`);
const due = (s: string) => new Date(`${s}T23:59:00`);
const isDay = schoolDays(defaultDaysOff(2026));
const published = getCurriculum(ID)!.sets.map((s) => ({
  id: `g-${s.key}`,
  curriculumSetKey: s.key,
  questionCount: 5,
}));

describe("plan order", () => {
  test("the default order is 1A..8D and is a default plan", () => {
    expect(all).toHaveLength(32);
    expect(all[0]).toBe("1A");
    expect(all[31]).toBe("8D");
    expect(isDefaultPlan(ID, { order: all, skipped: [] })).toBe(true);
    expect(isDefaultPlan(ID, { order: all, skipped: ["2B"] })).toBe(false);
    expect(defaultOrder("nope")).toEqual([]);
  });

  test("moving a unit keeps its sets together; the ends do not move", () => {
    const moved = moveUnit(all, 4, -1);
    expect(unitOrder(moved)).toEqual([1, 2, 4, 3, 5, 6, 7, 8]);
    expect(moved.slice(8, 12)).toEqual(["4A", "4B", "4C", "4D"]);
    expect(moveUnit(all, 1, -1)).toEqual(all);
    expect(moveUnit(all, 8, 1)).toEqual(all);
    expect(moveUnit(all, 99, 1)).toEqual(all);
    expect(parsePlan(ID, { order: moved, skipped: [] }).ok).toBe(true);
  });

  test("a set moves only inside its unit", () => {
    expect(moveSet(all, "4B", -1).slice(12, 16)).toEqual(["4B", "4A", "4C", "4D"]);
    expect(moveSet(all, "4A", -1)).toEqual(all); // would cross into unit 3
    expect(moveSet(all, "4D", 1)).toEqual(all);
    expect(moveSet(all, "zz", 1)).toEqual(all);
  });

  test("skipping toggles and stays in roadmap order", () => {
    let plan = { order: all, skipped: [] as string[] };
    plan = toggleSkipped(plan, "5C");
    plan = toggleSkipped(plan, "2A");
    expect(plan.skipped).toEqual(["2A", "5C"]);
    expect(toggleSkipped(plan, "2A").skipped).toEqual(["5C"]);
  });

  test("withSkipped skips once; livePlan drops skips of sets the class has assigned", () => {
    const plan = { order: all, skipped: ["2A", "5C"] };
    expect(withSkipped(plan, "3B").skipped).toEqual(["2A", "3B", "5C"]);
    expect(withSkipped(plan, "2A")).toBe(plan);
    expect(livePlan(plan, new Set(["2A", "4A"])).skipped).toEqual(["5C"]);
    expect(livePlan(plan, new Set(["4A"]))).toBe(plan);
  });

  test("an assigned set is never shown as skipped, and an archived copy reports its size", () => {
    const published = ["2A", "2B"].map((k) => ({
      id: `p${k}`,
      curriculumSetKey: k,
      questionCount: 10,
    }));
    const roadmap = deriveRoadmap(
      ID,
      published,
      [
        { id: "a", curriculumId: ID, curriculumSetKey: "2A" },
        { id: "b", curriculumId: ID, curriculumSetKey: "2B", archived: true, questionCount: 8 },
      ],
      { order: all, skipped: ["2A", "2B"] },
    );
    const sets = roadmap.find((u) => u.unit === 2)!.sets;
    const of = (k: string) => sets.find((s) => s.set.key === k)!;
    expect([of("2A").assigned, of("2A").skipped]).toEqual([true, false]);
    expect([of("2B").assigned, of("2B").skipped]).toEqual([false, true]);
    expect([of("2B").archivedId, of("2B").archivedCount]).toEqual(["b", 8]);
  });

  test("the route's strict check refuses broken plans", () => {
    const err = (raw: unknown) => {
      const r = parsePlan(ID, raw);
      return r.ok ? "" : r.error;
    };
    expect(err(null)).toMatch(/needs an order/);
    expect(err({ order: all.slice(1), skipped: [] })).toMatch(/exactly once/);
    expect(err({ order: [...all.slice(1), "1B"], skipped: [] })).toMatch(/exactly once/);
    expect(err({ order: [...all.slice(1), "9Z"], skipped: [] })).toMatch(/exactly once/);
    const split = [...all];
    [split[3], split[4]] = [split[4], split[3]]; // 1D and 2A swapped: unit 1 is split
    expect(err({ order: split, skipped: [] })).toMatch(/stay together/);
    expect(err({ order: all, skipped: ["9Z"] })).toMatch(/Unknown set/);
    expect(err({ order: all, skipped: [] })).toBe("");
    expect(parsePlan("nope", { order: [], skipped: [] })).toEqual({
      ok: false,
      error: "Unknown course",
    });
  });

  test("a stored plan is read leniently", () => {
    expect(normalisePlan(ID, undefined)).toEqual({ order: all, skipped: [] });
    expect(normalisePlan(ID, "junk")).toEqual({ order: all, skipped: [] });
    // Unit 4 first, with only two of its sets listed, a stray key and a repeat.
    const plan = normalisePlan(ID, {
      order: ["4B", "4A", "zz", "4B", "1A"],
      skipped: ["4D", "zz", 7],
    });
    expect(plan.order.slice(0, 4)).toEqual(["4B", "4A", "4C", "4D"]);
    expect(plan.order.slice(4, 8)).toEqual(["1A", "1B", "1C", "1D"]);
    expect(unitOrder(plan.order)).toEqual([4, 1, 2, 3, 5, 6, 7, 8]);
    expect(plan.order).toHaveLength(32);
    expect(plan.skipped).toEqual(["4D"]);
    expect(parsePlan(ID, plan).ok).toBe(true);
  });
});

describe("roadmap with a plan", () => {
  test("units and sets follow the plan; skipped sets are not assignable", () => {
    const plan = { order: moveSet(moveUnit(all, 4, -1), "4B", -1), skipped: ["4C"] };
    const road = deriveRoadmap(
      ID,
      published,
      [{ id: "a1", curriculumSetKey: "1A", dueDate: due("2026-11-20") }],
      plan,
    );
    expect(road.map((u) => u.unit)).toEqual([1, 2, 4, 3, 5, 6, 7, 8]);
    const u4 = road[2];
    expect(u4.sets.map((s) => s.set.key)).toEqual(["4B", "4A", "4C", "4D"]);
    expect(u4.sets.map((s) => s.skipped)).toEqual([false, false, true, false]);
    expect(u4.assignable.map((s) => s.set.key)).toEqual(["4B", "4A", "4D"]);
    expect(road[0].sets[0]).toMatchObject({ assigned: true, assignmentId: "a1" });
    expect(nextUnit(road)?.unit).toBe(1);
  });

  test("a unit whose remaining sets are all skipped counts as assigned", () => {
    const road = deriveRoadmap(
      ID,
      published,
      [{ curriculumSetKey: "1A" }, { curriculumSetKey: "1B" }],
      { order: all, skipped: ["1C", "1D"] },
    );
    expect(road[0].allAssigned).toBe(true);
    expect(nextUnit(road)?.unit).toBe(2);
    // A whole unit skipped is simply passed over.
    const none = deriveRoadmap(ID, published, [], {
      order: all,
      skipped: ["1A", "1B", "1C", "1D"],
    });
    expect(none[0].allAssigned).toBe(false);
    expect(nextUnit(none)?.unit).toBe(2);
  });
});

describe("pacing", () => {
  test("projected dates run from the start, skip breaks, and leave skipped sets out", () => {
    const road = deriveRoadmap(ID, published, [], { order: all, skipped: ["1D"] });
    const p = paceCourse(road, { start: day("2026-11-23"), spacing: 2, isSchoolDay: isDay });
    expect(p.remaining).toBe(31);
    expect(p.units[0].sets.map((s) => [s.key, toDateInput(s.due), s.source])).toEqual([
      ["1A", "2026-11-23", "projected"],
      ["1B", "2026-11-25", "projected"],
      ["1C", "2026-12-01", "projected"],
    ]);
    expect(p.units[0].allAssigned).toBe(false);
    expect(p.units.every((u) => u.sets.every((s) => isDay(s.due)))).toBe(true);
    // No due date inside winter break.
    const keys = p.units.flatMap((u) => u.sets.map((s) => toDateInput(s.due)));
    expect(keys.some((k) => k > "2026-12-18" && k < "2027-01-05")).toBe(false);
    expect(toDateInput(p.finish!)).toBe(keys[keys.length - 1]);
    expect(p.afterExams).toBe(false);
  });

  test("assigned sets keep their dates and the rest follow the latest one", () => {
    const road = deriveRoadmap(ID, published, [
      { curriculumSetKey: "1A", dueDate: due("2026-12-08") },
      { curriculumSetKey: "1B", dueDate: due("2026-12-10") },
    ]);
    const p = paceCourse(road, { start: day("2026-11-23"), spacing: 2, isSchoolDay: isDay });
    expect(p.units[0].sets.map((s) => [toDateInput(s.due), s.source])).toEqual([
      ["2026-12-08", "assigned"],
      ["2026-12-10", "assigned"],
      ["2026-12-14", "projected"],
      ["2026-12-16", "projected"],
    ]);
    // A start after the assigned work wins.
    const later = paceCourse(road, { start: day("2027-01-11"), spacing: 2, isSchoolDay: isDay });
    expect(toDateInput(later.units[0].sets[2].due)).toBe("2027-01-11");
  });

  test("a slow pace that ends in May or later is flagged", () => {
    const road = deriveRoadmap(ID, published, []);
    expect(
      paceCourse(road, { start: day("2027-02-01"), spacing: 3, isSchoolDay: isDay }).afterExams,
    ).toBe(true);
    expect(
      paceCourse(road, { start: day("2026-09-01"), spacing: 3, isSchoolDay: isDay }).afterExams,
    ).toBe(false);
    const empty = paceCourse(deriveRoadmap(ID, [], [], { order: all, skipped: all }), {
      start: day("2026-09-01"),
      spacing: 2,
    });
    expect(empty.finish).toBeNull();
    expect(empty.units[0].allAssigned).toBe(false);
  });
});

describe("moving due dates in bulk", () => {
  const items = [
    { id: "a", due: due("2026-12-16") },
    { id: "b", due: due("2026-12-18") },
    { id: "c", due: due("2026-11-26") }, // Thanksgiving
  ];
  test("shift by school days steps over the break; zero only tidies days off", () => {
    expect(shiftDueDates(items, 2, isDay).map((i) => [i.id, toDateInput(i.due)])).toEqual([
      ["a", "2026-12-18"],
      ["b", "2027-01-06"],
      ["c", "2026-12-02"],
    ]);
    expect(shiftDueDates(items, 0, isDay).map((i) => [i.id, toDateInput(i.due)])).toEqual([
      ["c", "2026-11-30"],
    ]);
    expect(shiftDueDates(items, -1, isDay).map((i) => [i.id, toDateInput(i.due)])).toEqual([
      ["a", "2026-12-15"],
      ["b", "2026-12-17"],
      ["c", "2026-11-25"],
    ]);
    expect(shiftDueDates(items, 2, isDay)[0].due.getHours()).toBe(23);
  });

  test("re-spacing lays items out from a date; unchanged items are left out", () => {
    expect(
      respaceDueDates(items, day("2026-12-16"), 1, isDay).map((i) => [i.id, toDateInput(i.due)]),
    ).toEqual([
      ["b", "2026-12-17"],
      ["c", "2026-12-18"],
    ]);
  });
});

describe("starting a course part-way through", () => {
  test("every set before the start is skipped, in the course's usual order", () => {
    const plan = planStartingAt(ID, "4B");
    expect(plan.order).toEqual(all);
    expect(plan.skipped).toEqual(all.slice(0, all.indexOf("4B")));
    expect(plan.skipped).toHaveLength(13);
    expect(plan.skipped).not.toContain("4B");
    expect(parsePlan(ID, plan).ok).toBe(true);
    // The roadmap then offers 4B first and counts only what is left.
    const roadmap = deriveRoadmap(ID, published, [], plan);
    expect(nextUnit(roadmap)?.unit).toBe(4);
    expect(nextUnit(roadmap)?.assignable[0].set.key).toBe("4B");
  });

  test("the first set, no start, or an unknown set is the course as written", () => {
    for (const start of ["1A", null, "9Z"])
      expect(isDefaultPlan(ID, planStartingAt(ID, start))).toBe(true);
  });

  test("a unit's first set skips exactly the units before it", () => {
    expect(planStartingAt(ID, "3A").skipped).toEqual(all.slice(0, 8));
    // Units of another course are numbered differently; the rule is the same.
    const p2 = planStartingAt("ap-physics-2", "10A");
    expect(p2.skipped).toEqual(["9A", "9B", "9C", "9D"]);
    expect(parsePlan("ap-physics-2", p2).ok).toBe(true);
  });
});
