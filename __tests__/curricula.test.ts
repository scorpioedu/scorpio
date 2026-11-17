import physics1 from "../src/data/curricula/ap-physics-1.json";
import units46 from "../content/ap-physics-1/units-4-6.json";
import {
  CURRICULA,
  compareSetKeys,
  curriculumSet,
  curriculumUnits,
  displayTitle,
  getCurriculum,
  setSequence,
  validateCurriculum,
  type Curriculum,
} from "../src/data/curricula";
import {
  deriveRoadmap,
  draftState,
  nextUnit,
  setReadyToPublish,
} from "../src/lib/curriculum-roadmap";
import { groupByUnit, OTHER_GROUP_LABEL } from "../src/lib/student-grouping";
import { planAssignments, runAssignments, cloneSetToClass } from "../src/lib/assign-sets";
import { apUnitLabel } from "../src/data/ap";
import { toDateInput, parseDateInput } from "../src/lib/first-run";
import {
  contentPublishBody,
  courseBody,
  courseCurriculumBody,
} from "../src/lib/schemas/api-bodies";

const ap = getCurriculum("ap-physics-1")!;

describe("curriculum definitions", () => {
  test("every shipped curriculum is valid", () => {
    for (const c of CURRICULA) expect(validateCurriculum(c)).toEqual([]);
  });

  test("the full course: 32 sets, 4 per unit, 1A-8D; 4A-6D round-trip to the Units 4-6 titles", () => {
    const keys = [1, 2, 3, 4, 5, 6, 7, 8].flatMap((u) =>
      ["A", "B", "C", "D"].map((l) => `${u}${l}`),
    );
    expect(ap.sets.map((s) => s.key)).toEqual(keys);
    expect(ap.sets.every((s) => s.draftIds.length === 5)).toBe(true);
    const mid = ap.sets.filter((s) => s.unit >= 4 && s.unit <= 6);
    expect(mid.map((s) => displayTitle(s))).toEqual(units46.sets.map((s) => s.title));
    mid.forEach((s, i) => {
      expect(s.draftIds).toEqual(units46.sets[i].draftIds);
      expect(s.topics).toEqual(units46.sets[i].topics);
    });
  });

  test("units come in order with their sets; sequence follows unit then letter", () => {
    const units = curriculumUnits("ap-physics-1");
    expect(units.map((u) => u.unit)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(units.every((u) => u.sets.length === 4)).toBe(true);
    expect(units[3].sets.map((s) => s.key)).toEqual(["4A", "4B", "4C", "4D"]);
    expect(setSequence("ap-physics-1", "1A")).toBe(0);
    expect(setSequence("ap-physics-1", "4A")).toBe(12);
    expect(setSequence("ap-physics-1", "8D")).toBe(31);
    expect(setSequence("ap-physics-1", "9Z")).toBe(-1);
    expect(setSequence("nope", "4A")).toBe(-1);
    expect(curriculumSet("ap-physics-1", "5B")?.title).toBeTruthy();
    expect(curriculumSet("ap-physics-1", "zz")).toBeUndefined();
    expect(getCurriculum("nope")).toBeUndefined();
    expect(getCurriculum(5)).toBeUndefined();
    expect(compareSetKeys({ key: "10A" }, { key: "9B" })).toBeGreaterThan(0);
  });

  test("validation catches bad keys, units, topics and shared drafts", () => {
    const base = physics1 as Curriculum;
    const [a, b, c, d] = base.sets.filter((s) => s.unit === 4);
    const run = (sets: Curriculum["sets"]) => validateCurriculum({ ...base, sets }).join("\n");
    expect(run([a, { ...a }])).toMatch(/4A: duplicate key/);
    expect(run([a, { ...b, draftIds: [a.draftIds[0], "other"] }])).toMatch(
      /4B: draft .* is also in 4A/,
    );
    expect(run([{ ...a, unit: 5 }])).toMatch(/4A: unit 5 does not match the key/);
    expect(run([{ ...c, topics: ["5.1"] }])).toMatch(/topic 5\.1 is in unit 5/);
    expect(run([{ ...d, topics: ["9.9"] }])).toMatch(/unknown topic 9\.9/);
    expect(run([{ ...d, draftIds: ["x", "x"] }])).toMatch(/repeated draftIds/);
    expect(run([{ ...a, key: "4a" }])).toMatch(/key must be/);
    expect(run([{ ...a, draftIds: [] }])).toMatch(/no draftIds/);
  });
});

describe("roadmap state", () => {
  const published = [
    { id: "w4A", curriculumSetKey: "4A", questionCount: 5 },
    { id: "w4B", curriculumSetKey: "4B", questionCount: 5 },
    { id: "w5A", curriculumSetKey: "5A", questionCount: 5 },
  ];
  const due = new Date("2027-01-12T23:59:00");

  test("sets are assigned when the class has an assignment with the key; unpublished sets are neither", () => {
    const road = deriveRoadmap("ap-physics-1", published, [
      { curriculumSetKey: "4A", dueDate: due },
      { curriculumSetKey: undefined },
    ]);
    expect(road).toHaveLength(8);
    const u4 = road[3];
    expect(u4.sets.map((s) => [s.set.key, !!s.published, s.assigned])).toEqual([
      ["4A", true, true],
      ["4B", true, false],
      ["4C", false, false],
      ["4D", false, false],
    ]);
    expect(u4.sets[0].dueDate).toEqual(due);
    expect(u4.assignable.map((s) => s.set.key)).toEqual(["4B"]);
    expect(u4.allAssigned).toBe(false);
    expect(road[0].allAssigned).toBe(false); // nothing published in unit 1
  });

  test("next unit is the first with published, unassigned sets", () => {
    expect(nextUnit(deriveRoadmap("ap-physics-1", [], []))).toBeUndefined();
    expect(nextUnit(deriveRoadmap("ap-physics-1", published, []))?.unit).toBe(4);
    const after = deriveRoadmap("ap-physics-1", published, [
      { curriculumSetKey: "4A" },
      { curriculumSetKey: "4B" },
    ]);
    expect(after[3].allAssigned).toBe(true);
    expect(nextUnit(after)?.unit).toBe(5);
    expect(
      nextUnit(
        deriveRoadmap("ap-physics-1", published, [
          { curriculumSetKey: "4A" },
          { curriculumSetKey: "4B" },
          { curriculumSetKey: "5A" },
        ]),
      ),
    ).toBeUndefined();
  });

  test("draft states and readiness for the admin Sets tab", () => {
    expect(draftState(undefined)).toBe("missing");
    expect(draftState({ status: "draft" })).toBe("draft");
    expect(draftState({ status: "rejected" })).toBe("rejected");
    expect(draftState({ status: "approved", reviewKind: "ai" })).toBe("ai-reviewed");
    expect(draftState({ status: "approved", reviewKind: "human" })).toBe("human-approved");
    expect(draftState({ status: "approved" })).toBe("human-approved");
    expect(draftState({ status: "published", reviewKind: "ai" })).toBe("published");
    expect(setReadyToPublish(["human-approved", "ai-reviewed"])).toBe(true);
    expect(setReadyToPublish(["human-approved", "draft"])).toBe(false);
    expect(setReadyToPublish(["human-approved", "missing"])).toBe(false);
    expect(setReadyToPublish([])).toBe(false);
  });
});

describe("student grouping", () => {
  const d = (s: string) => new Date(`${s}T23:59:00`);
  const a = (
    id: string,
    key: string | undefined,
    seq: number | undefined,
    due: string,
    title = id,
  ) => ({
    id,
    title,
    dueDate: d(due),
    curriculumSetKey: key,
    curriculumSequence: seq,
  });

  test("units in roadmap order, sets by sequence then due date, the rest under Other", () => {
    const groups = groupByUnit([
      a("hw", undefined, undefined, "2027-01-05"),
      a("5A", "5A", 4, "2027-01-20"),
      a("4B", "4B", 1, "2027-01-14"),
      a("4A", "4A", 0, "2027-01-18"), // due later than 4B, still first
      a("old", "4C", undefined, "2027-01-01"), // no sequence: after sequenced ones in the unit
      a("quiz", undefined, undefined, "2027-01-02"),
    ]);
    expect(groups.map((g) => g.label)).toEqual([apUnitLabel(4), apUnitLabel(5), OTHER_GROUP_LABEL]);
    expect(groups.map((g) => g.items.map((x) => x.id))).toEqual([
      ["4A", "4B", "old"],
      ["5A"],
      ["quiz", "hw"],
    ]);
  });

  test("no groups for nothing; no Other group when every item has a set", () => {
    expect(groupByUnit([])).toEqual([]);
    expect(groupByUnit([a("x", "6A", 8, "2027-01-02")]).map((g) => g.id)).toEqual(["unit-6"]);
  });

  test("work with no due date sorts after dated work, not first", () => {
    const groups = groupByUnit([
      { id: "undated", title: "u", dueDate: null },
      { id: "dated", title: "d", dueDate: new Date("2027-01-02") },
    ]);
    expect(groups[0].items.map((x) => x.id)).toEqual(["dated", "undated"]);
  });

  test("a malformed key is treated as other", () => {
    expect(groupByUnit([a("x", "zz", 1, "2027-01-02")]).map((g) => g.id)).toEqual(["other"]);
  });
});

describe("assign-sets", () => {
  const start = parseDateInput("2027-01-12")!;
  const sets = ["4A", "4B", "4C", "4D"].map((key) => ({
    sourceId: `w${key}`,
    key,
    title: `T ${key}`,
  }));

  test("sets already assigned are skipped and do not use up due dates", () => {
    const plan = planAssignments(sets, new Set(["4A", "4C"]), start, 2);
    expect(plan.map((p) => [p.key, toDateInput(p.due)])).toEqual([
      ["4B", "2027-01-12"],
      ["4D", "2027-01-14"],
    ]);
    expect(planAssignments(sets, new Set(sets.map((s) => s.key)), start, 2)).toEqual([]);
  });

  test("runAssignments stops at the first failure and reports progress", async () => {
    const plan = planAssignments(sets, new Set(), start, 1);
    const done: string[] = [];
    const copy = jest.fn(async (item: { key: string }) => {
      if (item.key === "4C") throw new Error("boom");
    });
    await expect(runAssignments(plan, copy, (i) => done.push(i.key))).rejects.toThrow("boom");
    expect(done).toEqual(["4A", "4B"]);
    expect(copy).toHaveBeenCalledTimes(3);
  });

  test("cloneSetToClass sends the set's own title and due date", async () => {
    const calls: unknown[] = [];
    const fetcher = async (url: string, init: RequestInit) => {
      calls.push([url, JSON.parse(String(init.body))]);
      return new Response(JSON.stringify({ id: "n" }), { status: 200 });
    };
    const [item] = planAssignments(sets, new Set(), start, 1);
    await cloneSetToClass(fetcher, "class1", item);
    expect(calls).toEqual([
      [
        "/api/assignments/clone",
        { sourceId: "w4A", courseId: "class1", title: "T 4A", dueDate: item.due.toISOString() },
      ],
    ]);
    await expect(
      cloneSetToClass(
        async () => new Response(JSON.stringify({ error: "nope" }), { status: 403 }),
        "c",
        item,
      ),
    ).rejects.toThrow("nope");
  });
});

describe("request bodies", () => {
  test("publish takes drafts and a title, or a course set, not a mix", () => {
    const ok = (b: unknown) => contentPublishBody.safeParse(b).success;
    expect(ok({ draftIds: ["a"], title: "T" })).toBe(true);
    expect(ok({ curriculumId: "ap-physics-1", setKey: "4A" })).toBe(true);
    expect(ok({ curriculumId: "ap-physics-1" })).toBe(false);
    expect(ok({ setKey: "4A" })).toBe(false);
    expect(ok({ curriculumId: "ap-physics-1", setKey: "4A", title: "X" })).toBe(false);
    expect(ok({ curriculumId: "ap-physics-1", setKey: "4A", draftIds: ["a"] })).toBe(false);
    expect(ok({ draftIds: ["a"] })).toBe(false);
    expect(ok({})).toBe(false);
  });
  test("class and follow bodies", () => {
    expect(
      courseBody.safeParse({ name: "A", code: "ABCDEF12", curriculumId: "ap-physics-1" }).success,
    ).toBe(true);
    expect(courseBody.safeParse({ name: "A", code: "ABCDEF12" }).success).toBe(true);
    expect(courseCurriculumBody.safeParse({ curriculumId: null }).success).toBe(true);
    expect(courseCurriculumBody.safeParse({ curriculumId: "x" }).success).toBe(true);
    expect(courseCurriculumBody.safeParse({}).success).toBe(false);
  });
});
