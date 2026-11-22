// Class progress on the roadmap and the rule-based re-teach suggestions.
import fs from "fs";
import path from "path";
import { CURRICULA, getCurriculum } from "../src/data/curricula";
import {
  curriculumProfile,
  prefixProfile,
  setProfile,
  setsTargeting,
  shownProfile,
  typeSummary,
  type SetProfile,
} from "../src/data/curricula/profiles";
import { misconceptionTag, misconceptionsForCourse } from "../src/data/ap";
import {
  buildSetProgress,
  buildUnitInsights,
  reteachAction,
  studentsByUnit,
} from "../src/lib/course-progress";
import type { InsightEvent } from "../src/lib/insights";

import { testWithContent } from "../tests/helpers/course-content";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const tool = require("../tools/curriculum-profile.cjs");
const ID = "ap-physics-1";

describe("set profiles", () => {
  testWithContent("the committed profiles match the content files, for every course", () => {
    for (const { id } of CURRICULA) {
      const fresh = tool.buildProfile(getCurriculum(id), tool.loadDrafts(id));
      const committed = JSON.parse(
        fs.readFileSync(path.join(__dirname, `../src/data/curricula/profiles/${id}.json`), "utf8"),
      );
      expect([id, committed]).toEqual([id, fresh]);
    }
  });

  test("every written set of the newer courses has a profile whose tags belong to the course", () => {
    for (const id of ["ap-physics-2", "ap-physics-c-mech"]) {
      const curriculum = getCurriculum(id)!;
      const own = new Set(misconceptionsForCourse(curriculum.apCourse).map((t) => t.id));
      for (const set of curriculum.sets.filter((s) => s.draftIds.length)) {
        const p = setProfile(id, set.key)!;
        expect([id, set.key, p.problems]).toEqual([id, set.key, set.draftIds.length]);
        expect(p.minutes).toBeGreaterThanOrEqual(p.problems);
        expect(p.minutes).toBeLessThanOrEqual(p.problems * 6);
        for (const m of p.misconceptions)
          expect([set.key, m.tag, own.has(m.tag)]).toEqual([set.key, m.tag, true]);
      }
    }
  });

  test("every set has a profile with known tags and a sensible time", () => {
    const profile = curriculumProfile(ID);
    for (const set of getCurriculum(ID)!.sets) {
      const p = profile[set.key];
      expect(p.problems).toBe(set.draftIds.length);
      expect(p.difficulty.easy + p.difficulty.medium + p.difficulty.hard).toBe(p.problems);
      expect(p.minutes).toBeGreaterThanOrEqual(p.problems);
      expect(p.minutes).toBeLessThanOrEqual(p.problems * 6);
      expect(p.misconceptions.length).toBeGreaterThan(0);
      for (const m of p.misconceptions) expect(misconceptionTag(m.tag)).toBeTruthy();
    }
    expect(typeSummary(setProfile(ID, "4A")!)).toBe("2 multiple choice, 3 numeric");
    expect(setProfile(ID, "zz")).toBeUndefined();
    expect(curriculumProfile("nope")).toEqual({});
  });

  test("a missing draft is an error, and minutes depend on type and difficulty", () => {
    expect(() => tool.buildProfile({ sets: [{ key: "1A", draftIds: ["x"] }] }, new Map())).toThrow(
      /1A: draft x/,
    );
    expect(tool.problemMinutes({ type: "numeric", difficulty: "hard" })).toBe(4.5);
    expect(tool.problemMinutes({ type: "essay", difficulty: "odd" })).toBe(4);
  });

  test("every profile lists its problems one by one, and they add up to the set's figures", () => {
    for (const { id } of CURRICULA)
      for (const [key, p] of Object.entries(curriculumProfile(id))) {
        const where = `${id} ${key}`;
        expect([where, p.each.length]).toEqual([where, p.problems]);
        // The tool's summary and the app's sum of a prefix are the same arithmetic.
        const { each: problems, ...whole } = p;
        expect([where, tool.summarise(problems)]).toEqual([where, whole]);
        const sliced = { ...p, each: [...problems, problems[0]] };
        expect([where, prefixProfile(sliced, p.problems)]).toEqual([where, p]);
        expect(prefixProfile(p, 99)).toBe(p);
      }
  });

  // A made-up pool of 10: two quick multiple-choice problems, then numeric ones that get harder.
  const each: SetProfile["each"] = [
    { minutes: 1.5, difficulty: "easy", type: "multiple-choice", tags: ["a"] },
    { minutes: 1.5, difficulty: "easy", type: "multiple-choice", tags: ["a", "b"] },
    { minutes: 2, difficulty: "easy", type: "numeric", tags: [] },
    { minutes: 3, difficulty: "medium", type: "numeric", tags: ["b"] },
    { minutes: 3, difficulty: "medium", type: "numeric", tags: ["a"] },
    { minutes: 3, difficulty: "medium", type: "numeric", tags: [] },
    { minutes: 4.5, difficulty: "hard", type: "numeric", tags: ["c"] },
    { minutes: 4.5, difficulty: "hard", type: "numeric", tags: ["c"] },
    { minutes: 3, difficulty: "hard", type: "multiple-choice", tags: ["c"] },
    { minutes: 4.5, difficulty: "hard", type: "numeric", tags: ["a"] },
  ];
  const pool: SetProfile = { ...tool.summarise(each), each };

  test("minutes, difficulty, types and misconceptions are those of the first n problems", () => {
    expect(prefixProfile(pool, 3)).toMatchObject({
      problems: 3,
      minutes: 5,
      difficulty: { easy: 3, medium: 0, hard: 0 },
      types: { "multiple-choice": 2, numeric: 1 },
      misconceptions: [
        { tag: "a", problems: 2 },
        { tag: "b", problems: 1 },
      ],
    });
    expect(prefixProfile(pool, 5)).toMatchObject({
      problems: 5,
      minutes: 11,
      difficulty: { easy: 3, medium: 2, hard: 0 },
      types: { "multiple-choice": 2, numeric: 3 },
    });
    expect(typeSummary(prefixProfile(pool, 5))).toBe("2 multiple choice, 3 numeric");
    expect(prefixProfile(pool, 8)).toMatchObject({ problems: 8, minutes: 23 });
    expect(prefixProfile(pool, 8).misconceptions[0]).toEqual({ tag: "a", problems: 3 });
    // Minutes only ever grow with the number of problems.
    const minutes = pool.each.map((_, i) => prefixProfile(pool, i + 1).minutes);
    expect(minutes).toEqual([...minutes].sort((a, b) => a - b));
    expect(prefixProfile(pool, 10).minutes).toBe(31);
    expect(prefixProfile(pool, 0).problems).toBe(0);
  });

  test("a set that is not assigned is shown as it is assigned by default; a copy by its own size", () => {
    // Today every pool is five, so nothing reads differently.
    const p = setProfile(ID, "4A")!;
    expect(shownProfile(ID, "4A")).toEqual({ ...p, pool: 5, count: "5 problems" });
    expect(shownProfile(ID, "4A", 5)).toMatchObject({ problems: 5, minutes: p.minutes });
    expect(shownProfile(ID, "4A", null)).toMatchObject({ count: "5 problems" });
    const three = shownProfile(ID, "4A", 3)!;
    expect(three).toMatchObject({ problems: 3, pool: 5, count: "3 problems" });
    expect(three.minutes).toBeLessThan(p.minutes);
    expect(three.difficulty.easy + three.difficulty.medium + three.difficulty.hard).toBe(3);
    // A copy the teacher added a question to: its own count, the pool's figures.
    expect(shownProfile(ID, "4A", 6)).toMatchObject({ problems: 6, count: "6 problems" });
    expect(shownProfile(ID, "4A", 1)!.count).toBe("1 problem");
    expect(shownProfile(ID, "zz")).toBeUndefined();
  });

  test("with a pool larger than five, the default assignment is named as part of it", () => {
    jest.isolateModules(() => {
      jest.doMock("../src/data/curricula/profiles/ap-physics-1.json", () => ({
        __esModule: true,
        default: { "4A": pool },
      }));
      const profiles =
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("../src/data/curricula/profiles") as typeof import("../src/data/curricula/profiles");
      expect(profiles.shownProfile(ID, "4A")).toMatchObject({
        problems: 5,
        pool: 10,
        minutes: 11,
        count: "5 of 10 problems",
        types: { "multiple-choice": 2, numeric: 3 },
      });
      expect(profiles.shownProfile(ID, "4A", 8)).toMatchObject({
        problems: 8,
        minutes: 23,
        count: "8 problems",
      });
      expect(profiles.shownProfile(ID, "4A", 10)).toMatchObject({
        minutes: 31,
        count: "10 problems",
      });
      // Tag "c" is only on problems 7 to 9: a class with the usual five has none of them.
      expect(profiles.setsTargeting(ID, "c")).toEqual([]);
      expect(profiles.setsTargeting(ID, "c", { "4A": 8 })).toEqual([{ key: "4A", problems: 2 }]);
      expect(profiles.setsTargeting(ID, "a")).toEqual([{ key: "4A", problems: 3 }]);
    });
    jest.dontMock("../src/data/curricula/profiles/ap-physics-1.json");
  });

  test("sets that target a tag come most problems first", () => {
    const sets = setsTargeting(ID, "momentum-not-vector");
    expect(sets.length).toBeGreaterThan(0);
    expect(sets[0].key).toMatch(/^4/);
    expect(sets.every((s, i) => i === 0 || sets[i - 1].problems >= s.problems)).toBe(true);
    expect(setsTargeting(ID, "no-such-tag")).toEqual([]);
  });
});

const assignments = [
  { id: "a4A", curriculumSetKey: "4A" },
  { id: "a4B", curriculumSetKey: "4B" },
  { id: "dup", curriculumSetKey: "4A" },
  { id: "own", curriculumSetKey: undefined },
];
const sub = (assignmentId: string, studentId: string, status: string, score?: number) => ({
  assignmentId,
  studentId,
  status,
  graded: status === "graded",
  score,
});

describe("set progress", () => {
  test("counts students once, ignores drafts, averages graded scores", () => {
    const p = buildSetProgress(assignments, [
      sub("a4A", "s1", "graded", 80),
      sub("a4A", "s2", "graded", 61),
      sub("a4A", "s3", "pending_review"),
      sub("a4A", "s4", "draft"),
      sub("a4A", "s5", "submitted"),
      sub("dup", "s9", "graded", 100),
      sub("own", "s1", "graded", 10),
    ]);
    expect(Object.keys(p)).toEqual(["4A", "4B"]);
    expect(p["4A"]).toEqual({
      key: "4A",
      assignmentId: "a4A",
      submitted: 4,
      graded: 2,
      pending: 1,
      averageScore: 71,
      overdue: 0,
      needsReview: 0,
    });
    expect(p["4B"]).toMatchObject({ submitted: 0, graded: 0, averageScore: null });
  });

  test("overdue counts roster students with nothing handed in once the due date has passed", () => {
    const now = new Date("2026-11-17T12:00:00");
    const roster = ["s1", "s2", "s3", "s4"];
    const dated = [
      { id: "a4A", curriculumSetKey: "4A", dueDate: new Date("2026-11-10T23:59:00") },
      { id: "a4B", curriculumSetKey: "4B", dueDate: new Date("2026-11-20T23:59:00") },
      { id: "a4C", curriculumSetKey: "4C", dueDate: null },
      { id: "a4D", curriculumSetKey: "4D", dueDate: new Date("2026-11-10T23:59:00") },
    ];
    const subs = [
      sub("a4A", "s1", "graded", 80),
      // A draft is not a hand-in; a student who left the class is not on the roster.
      sub("a4A", "s2", "draft"),
      sub("a4A", "gone", "graded", 70),
      ...roster.map((id) => sub("a4D", id, "graded", 90)),
    ];
    const p = buildSetProgress(dated, subs, { roster, now });
    expect(p["4A"].overdue).toBe(3);
    expect(p["4B"].overdue).toBe(0); // not due yet
    expect(p["4C"].overdue).toBe(0); // no due date
    expect(p["4D"].overdue).toBe(0); // everyone handed it in
    // Without a roster nothing is overdue.
    expect(buildSetProgress(dated, subs, { now })["4A"].overdue).toBe(0);
  });

  test("needsReview counts students with answers flagged after a key change", () => {
    const p = buildSetProgress(assignments, [
      { ...sub("a4A", "s1", "graded", 80), reviewQuestions: ["q1", "q2"] },
      { ...sub("a4A", "s2", "graded", 80), reviewQuestions: [] },
      { ...sub("a4A", "s3", "graded", 80), reviewQuestions: "q1" },
      { ...sub("a4A", "s4", "draft"), reviewQuestions: ["q1"] },
      { ...sub("a4B", "s1", "graded", 80), reviewQuestions: ["q9"] },
      sub("a4B", "s2", "graded", 80),
    ]);
    expect(p["4A"].needsReview).toBe(1);
    expect(p["4B"].needsReview).toBe(1);
  });

  test("students per unit count graded and pending work only", () => {
    expect(
      studentsByUnit(
        [...assignments, { id: "a5A", curriculumSetKey: "5A" }],
        [
          sub("a4A", "s1", "graded", 80),
          sub("a4B", "s1", "graded", 80),
          sub("a4B", "s2", "pending_review"),
          sub("a4B", "s3", "draft"),
          sub("a5A", "s1", "graded", 50),
          sub("own", "s7", "graded", 50),
        ],
      ),
    ).toEqual({ 4: 2, 5: 1 });
  });
});

const event = (studentId: string, tag: string, apUnit = 4, apTopic = "4.1"): InsightEvent => ({
  submissionId: `sub-${studentId}`,
  assignmentId: "a4A",
  studentId,
  courseId: "c1",
  questionId: `q-${tag}`,
  tag,
  apUnit,
  apTopic,
});

describe("unit insights and re-teach suggestions", () => {
  test("action depends on the share and the head count", () => {
    expect(reteachAction(10, 0.42)).toBe("whole-class");
    expect(reteachAction(2, 0.5)).toBe("small-group"); // two students are not a class
    expect(reteachAction(5, 0.2)).toBe("small-group");
    expect(reteachAction(1, 1)).toBe("individual");
    expect(reteachAction(2, 0.1)).toBe("individual");
  });

  test("top misconceptions per unit, with practice sets and a fixed sentence", () => {
    const events = [
      ...["s1", "s2", "s3", "s4", "s5"].map((s) => event(s, "momentum-not-vector")),
      event("s1", "momentum-kinetic-energy-confusion"),
      event("s2", "momentum-kinetic-energy-confusion"),
      event("s9", "velocity-acceleration-confusion", 1, "1.2"),
    ];
    const insights = buildUnitInsights(ID, events, {
      studentsByUnit: { 4: 10, 1: 10 },
      assignedKeys: ["4A"],
    });
    expect(insights.map((u) => u.unit)).toEqual([1, 4]);
    const u4 = insights[1];
    expect(u4.studentsInScope).toBe(10);
    const [first, second] = u4.top;
    expect(first).toMatchObject({
      tag: "momentum-not-vector",
      studentCount: 5,
      studentShare: 0.5,
      action: "whole-class",
    });
    expect(first.topics[0].label).toMatch(/^4\.1 /);
    expect(first.practice.some((p) => p.key === "4A" && p.assigned)).toBe(true);
    // Unassigned sets come first.
    const firstAssigned = first.practice.findIndex((p) => p.assigned);
    expect(first.practice.slice(0, firstAssigned).every((p) => !p.assigned)).toBe(true);
    expect(first.suggestion).toMatch(/^Re-teach to the whole class: revisit 4\.1 /);
    expect(first.suggestion).toMatch(/For more practice, assign 4[B-D] \(/);
    expect(first.suggestion).toMatch(/Go over the missed problems in 4A/);
    expect(second).toMatchObject({ studentCount: 2, action: "small-group" });
    expect(insights[0].top[0]).toMatchObject({ action: "individual", studentShare: 0.1 });
    // Same input, same words.
    expect(
      buildUnitInsights(ID, events, { studentsByUnit: { 4: 10, 1: 10 }, assignedKeys: ["4A"] }),
    ).toEqual(insights);
  });

  test("skipped sets are not suggested; no events means no units", () => {
    const events = ["s1", "s2", "s3"].map((s) => event(s, "momentum-not-vector"));
    const all = buildUnitInsights(ID, events, { studentsByUnit: { 4: 3 }, assignedKeys: [] });
    const keys = all[0].top[0].practice.map((p) => p.key);
    const skipped = buildUnitInsights(ID, events, {
      studentsByUnit: { 4: 3 },
      assignedKeys: [],
      skippedKeys: [keys[0]],
    });
    expect(skipped[0].top[0].practice.map((p) => p.key)).toEqual(keys.slice(1));
    expect(buildUnitInsights(ID, [], { studentsByUnit: {}, assignedKeys: [] })).toEqual([]);
  });

  test("new practice comes only from the same unit; other units only when already assigned", () => {
    // "motion-graph-as-picture" style tags can be targeted by later units too.
    const tag = "distance-displacement-confusion";
    const events = ["s1", "s2", "s3"].map((s) => event(s, tag, 1, "1.3"));
    const none = buildUnitInsights(ID, events, { studentsByUnit: { 1: 3 }, assignedKeys: [] });
    expect(none[0].top[0].practice.length).toBeGreaterThan(0);
    expect(none[0].top[0].practice.every((p) => p.key.startsWith("1"))).toBe(true);
    const other = setsTargeting(ID, tag).find((s) => !s.key.startsWith("1"));
    if (other) {
      const withOther = buildUnitInsights(ID, events, {
        studentsByUnit: { 1: 3 },
        assignedKeys: [other.key],
      });
      expect(withOther[0].top[0].practice.find((p) => p.key === other.key)?.assigned).toBe(true);
    }
  });
});
