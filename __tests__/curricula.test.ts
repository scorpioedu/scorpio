import physics1 from "../src/data/curricula/ap-physics-1.json";
import firstFive from "../tests/fixtures/set-first-five.json";
import { CONTENT_FILES } from "../src/data/curricula/content-files";
import { courseContent, testWithContent } from "../tests/helpers/course-content";

const units46 = courseContent("content/ap-physics-1/units-4-6.json");
import {
  CURRICULA,
  DEFAULT_SET_SIZE,
  MAX_SET_POOL,
  MIN_SET_SIZE,
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
  setReadyToAppend,
  setReadyToPublish,
} from "../src/lib/curriculum-roadmap";
import { groupByUnit, OTHER_GROUP_LABEL } from "../src/lib/student-grouping";
import {
  cappedSets,
  cloneSetToClass,
  planAssignments,
  restoresArchived,
  runAssignments,
  setSizeOptions,
  sizeChoice,
  sizeFor,
} from "../src/lib/assign-sets";
import { apUnitLabel } from "../src/data/ap";
import { toDateInput, parseDateInput } from "../src/lib/first-run";
import {
  cloneAssignmentBody,
  contentPublishBody,
  courseAssignmentDefaultsBody,
  courseBody,
  courseCurriculumBody,
} from "../src/lib/schemas/api-bodies";

const ap = getCurriculum("ap-physics-1")!;

describe("curriculum definitions", () => {
  test("every shipped curriculum is valid", () => {
    for (const c of CURRICULA) expect(validateCurriculum(c)).toEqual([]);
  });

  testWithContent(
    "the full course: 32 sets, 4 per unit, 1A-8D; 4A-6D round-trip to the Units 4-6 titles",
    () => {
      const keys = [1, 2, 3, 4, 5, 6, 7, 8].flatMap((u) =>
        ["A", "B", "C", "D"].map((l) => `${u}${l}`),
      );
      expect(ap.sets.map((s) => s.key)).toEqual(keys);
      expect(ap.sets.every((s) => s.draftIds.length >= 5 && s.draftIds.length <= 10)).toBe(true);
      const mid = ap.sets.filter((s) => s.unit >= 4 && s.unit <= 6);
      expect(mid.map((s) => displayTitle(s))).toEqual(units46.sets.map((s) => s.title));
      mid.forEach((s, i) => {
        expect(s.draftIds).toEqual(units46.sets[i].draftIds);
        expect(s.topics).toEqual(units46.sets[i].topics);
      });
    },
  );

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
    expect(run([{ ...a, draftIds: [] }])).toBe(""); // a planned set has no problems yet
  });

  test("a set has no problems (planned) or a pool of 5 to 10", () => {
    const base = physics1 as Curriculum;
    const a = base.sets.find((s) => s.key === "4A")!;
    const run = (n: number) =>
      validateCurriculum({
        ...base,
        sets: [{ ...a, draftIds: Array.from({ length: n }, (_, i) => `pool-${i}`) }],
      }).join("\n");
    for (const n of [0, 5, 6, 9, 10]) expect([n, run(n)]).toEqual([n, ""]);
    for (const n of [1, 4, 11, 20])
      expect([n, run(n)]).toEqual([n, `4A: ${n} problems; a set has none (planned) or 5 to 10`]);
    expect([MIN_SET_SIZE, DEFAULT_SET_SIZE, MAX_SET_POOL]).toEqual([3, 5, 10]);
  });

  // Order is the selection rule: a class gets a set's first n problems, so the first five of a set
  // may never change once written. The fixture holds ids only (no problem text, no keys).
  test("the first five problems of every written set are the ones recorded", () => {
    const now = Object.fromEntries(
      CURRICULA.map((c) => [
        c.id,
        Object.fromEntries(
          c.sets.filter((s) => s.draftIds.length).map((s) => [s.key, s.draftIds.slice(0, 5)]),
        ),
      ]),
    );
    expect(now).toEqual(firstFive);
  });

  testWithContent(
    "every assignment of the usual size or larger covers all of its set's topics",
    () => {
      for (const c of CURRICULA) {
        const topicOf = new Map<string, string>(
          (CONTENT_FILES[c.id] ?? []).flatMap((file) =>
            courseContent(file).drafts.map((d) => [d.id, d.apTopic] as [string, string]),
          ),
        );
        for (const s of c.sets.filter((x) => x.draftIds.length)) {
          const topics = s.draftIds.map((id) => topicOf.get(id));
          // Every prefix a class can get from the default size up, however long the pool grows.
          for (let n = Math.max(DEFAULT_SET_SIZE, s.topics.length); n <= s.draftIds.length; n++)
            expect([
              c.id,
              s.key,
              n,
              s.topics.filter((t) => !topics.slice(0, n).includes(t)),
            ]).toEqual([c.id, s.key, n, []]);
        }
      }
    },
  );
});

describe("how many problems a set's copy gets", () => {
  const set = (key: string, poolSize?: number) => ({
    sourceId: `w${key}`,
    key,
    title: key,
    poolSize,
  });

  test("setSizeOptions: 3 up to the pool, starting at 5", () => {
    expect(setSizeOptions(5)).toEqual({ min: 3, max: 5, default: 5 });
    expect(setSizeOptions(10)).toEqual({ min: 3, max: 10, default: 5 });
    expect(setSizeOptions(7)).toEqual({ min: 3, max: 7, default: 5 });
    expect(setSizeOptions(4)).toEqual({ min: 3, max: 4, default: 4 });
    expect(setSizeOptions(2)).toEqual({ min: 2, max: 2, default: 2 });
    expect(setSizeOptions(0)).toEqual({ min: 0, max: 0, default: 0 });
  });

  test("the choice is not offered while every set has five problems", () => {
    expect(sizeChoice([set("4A", 5), set("4B", 5)])).toMatchObject({ offered: false, initial: 5 });
    expect(sizeChoice([set("4A")])).toMatchObject({ offered: false });
    expect(sizeChoice([])).toMatchObject({ offered: false });
    // A remembered number does not bring the control back.
    expect(sizeChoice([set("4A", 5)], 8)).toMatchObject({ offered: false, initial: 5 });
  });

  test("it is offered once a set has more, from 3 to the largest pool, starting at 5", () => {
    expect(sizeChoice([set("4A", 10)])).toEqual({ offered: true, min: 3, max: 10, initial: 5 });
    expect(sizeChoice([set("4A", 5), set("4B", 8)])).toEqual({
      offered: true,
      min: 3,
      max: 8,
      initial: 5,
    });
  });

  test("it opens on the class's last choice, kept inside what the sets allow", () => {
    expect(sizeChoice([set("4A", 10)], 8).initial).toBe(8);
    expect(sizeChoice([set("4A", 10)], 3).initial).toBe(3);
    expect(sizeChoice([set("4A", 7)], 10).initial).toBe(7);
    expect(sizeChoice([set("4A", 10)], null).initial).toBe(5);
    expect(sizeChoice([set("4A", 10)], 4.5).initial).toBe(5);
  });

  test("each set is capped at its own pool", () => {
    const sets = [set("4A", 10), set("4B", 5), set("4C", 7), set("4D")];
    expect(cappedSets(sets, 8).map((s) => s.key)).toEqual(["4B", "4C", "4D"]);
    expect(cappedSets(sets, 5)).toEqual([]);
    expect(sets.map((s) => sizeFor(s, 8))).toEqual([8, 5, 7, 5]);
    expect(sets.map((s) => sizeFor(s, undefined))).toEqual([5, 5, 5, 5]);
    expect(sizeFor(set("4A", 10), 3)).toBe(3);
  });

  test("an archived copy is restored unless the teacher chose another size than it has", () => {
    const due = new Date("2027-01-12T23:59:00");
    const item = (count?: number, poolSize = 10) => ({ ...set("4A", poolSize), due, count });
    expect(restoresArchived(item(), undefined)).toBe(false);
    // No choice offered (or "assign now"): restored whatever its size, as before.
    expect(restoresArchived(item(), { questionCount: 5 })).toBe(true);
    expect(restoresArchived(item(), { questionCount: 7 })).toBe(true);
    expect(restoresArchived(item(), {})).toBe(true);
    // A choice: only a copy of that size comes back.
    expect(restoresArchived(item(8), { questionCount: 8 })).toBe(true);
    expect(restoresArchived(item(8), { questionCount: 5 })).toBe(false);
    expect(restoresArchived(item(5), { questionCount: 8 })).toBe(false);
    expect(restoresArchived(item(8), {})).toBe(false);
    // The choice is capped at the set's own pool before comparing.
    expect(restoresArchived(item(8, 5), { questionCount: 5 })).toBe(true);
    // Problems chosen by hand always make a new copy: the archived one may hold others.
    expect(restoresArchived({ ...item(8), pick: [0, 1, 2] }, { questionCount: 3 })).toBe(false);
  });

  test("the clone request carries the count only when one was chosen", async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetcher = async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ id: "copy" }));
    };
    const due = new Date("2027-01-12T23:59:00");
    await cloneSetToClass(fetcher, "c1", { ...set("4A", 10), due });
    await cloneSetToClass(fetcher, "c1", { ...set("4A", 10), due, count: 8 });
    expect("count" in bodies[0]).toBe(false);
    expect(bodies[1]).toMatchObject({ sourceId: "w4A", courseId: "c1", count: 8 });
    // The teacher's own choice of problems, and a copy kept hidden to edit first.
    await cloneSetToClass(
      fetcher,
      "c1",
      { ...set("4A", 10), due, count: 8, pick: [0, 2, 7] },
      true,
    );
    expect(bodies[2]).toMatchObject({ count: 8, pick: [0, 2, 7], hidden: true });
    expect("pick" in bodies[1] || "hidden" in bodies[1]).toBe(false);
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
    // A machine's mark and the owner's acceptance are not a person's approval and are not called one.
    expect(draftState({ status: "approved", reviewKind: "verified" })).toBe("verified");
    expect(draftState({ status: "approved", reviewKind: "owner-accepted" })).toBe("owner-accepted");
    expect(draftState({ status: "published", reviewKind: "verified" })).toBe("published");
    expect(setReadyToPublish(["verified", "owner-accepted", "human-approved"])).toBe(true);
    expect(setReadyToPublish(["verified", "rejected"])).toBe(false);
    // Adding to a published set: everything after the published problems is approved.
    expect(setReadyToAppend(["published", "published", "verified", "human-approved"])).toBe(true);
    expect(setReadyToAppend(["published", "published"])).toBe(false);
    expect(setReadyToAppend(["published", "draft"])).toBe(false);
    expect(setReadyToAppend(["published", "missing", "verified"])).toBe(false);
    expect(setReadyToAppend(["verified", "verified"])).toBe(false);
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
  test("clone takes an optional whole count from 3 to 100", () => {
    const ok = (count: unknown) => cloneAssignmentBody.safeParse({ sourceId: "a", count }).success;
    expect(cloneAssignmentBody.safeParse({ sourceId: "a" }).success).toBe(true);
    for (const n of [3, 5, 10, 100]) expect([n, ok(n)]).toEqual([n, true]);
    for (const n of [2, 0, -3, 101, 5.5, "5", null]) expect([n, ok(n)]).toEqual([n, false]);
  });
  test("class defaults: the settings, or only the remembered number of problems (3 to 10)", () => {
    const ok = (b: unknown) => courseAssignmentDefaultsBody.safeParse(b).success;
    const settings = {
      timeLimit: null,
      gradingType: "ai",
      allowCalculator: false,
      allowAIHelp: false,
      requireWorkSubmission: false,
      enableTabDetection: true,
      lockdownMode: false,
    };
    expect(ok({ assignmentDefaults: settings })).toBe(true);
    expect(ok({ assignmentDefaults: null })).toBe(true);
    for (const n of [3, 5, 10]) expect([n, ok({ problemsPerSet: n })]).toEqual([n, true]);
    for (const n of [2, 11, 4.5, "5", null])
      expect([n, ok({ problemsPerSet: n })]).toEqual([n, false]);
    expect(ok({})).toBe(false);
    expect(ok({ assignmentDefaults: settings, problemsPerSet: 5 })).toBe(false);
    expect(ok({ assignmentDefaults: { ...settings, problemsPerSet: 5 } })).toBe(true); // extra key dropped
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
