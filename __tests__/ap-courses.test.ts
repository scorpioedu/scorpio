// More than one AP course: unit numbers and topic ids repeat, so everything is scoped by course.
import {
  AP_COURSE_IDS,
  AP_COURSES,
  apCourseName,
  apTopic,
  apTopicLabel,
  apUnit,
  apUnitLabel,
  apUnits,
  isApCourseId,
  isApTopicId,
  normaliseApTags,
} from "../src/data/ap";
import {
  CURRICULA,
  curriculumNamedIn,
  curriculumUnits,
  displayTitle,
  getCurriculum,
  hasContent,
  validateCurriculum,
  type Curriculum,
} from "../src/data/curricula";
import { deriveRoadmap, nextUnit } from "../src/lib/curriculum-roadmap";
import { defaultOrder, moveUnit, parsePlan, unitOrder } from "../src/lib/curriculum-plan";
import { paceCourse } from "../src/lib/course-pacing";
import { buildStudentRoadmap } from "../src/lib/student-roadmap";
import { groupByUnit } from "../src/lib/student-grouping";
import { setProfile } from "../src/data/curricula/profiles";
import { CONTENT_FILES } from "../src/data/curricula/content-files";
import { describeWithContent } from "../tests/helpers/course-content";
import { validateDraftProblem } from "../src/lib/content/problem-format";
import { misconceptionTag, misconceptionUnits } from "../functions/src/misconceptions";
import fs from "fs";
import path from "path";

describe("AP course data", () => {
  test("four courses, each with well-formed units and topics", () => {
    expect(AP_COURSE_IDS).toEqual(["physics-1", "physics-2", "physics-c-mech", "physics-c-em"]);
    for (const id of AP_COURSE_IDS) {
      const units = apUnits(id);
      expect(AP_COURSES[id].course).toBe(id);
      expect(units.length).toBeGreaterThanOrEqual(6);
      const ids = units.flatMap((u) => u.topics.map((t) => t.id));
      expect(new Set(ids).size).toBe(ids.length);
      for (const u of units) {
        expect(u.title && u.summary).toBeTruthy();
        u.topics.forEach((t, i) => {
          expect(t.id).toBe(`${u.unit}.${i + 1}`);
          expect(t.title && t.summary).toBeTruthy();
        });
      }
    }
    expect(apUnits("physics-1").map((u) => u.unit)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(apUnits("physics-2").map((u) => u.unit)).toEqual([9, 10, 11, 12, 13, 14, 15]);
    expect(apUnits("physics-c-mech").map((u) => u.unit)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(apCourseName("physics-c-mech")).toBe("AP Physics C: Mechanics");
    expect(apCourseName()).toBe("AP Physics 1");
  });

  test("AP Physics C: Electricity and Magnetism follows the College Board outline: units 8-13, 31 topics", () => {
    expect(apCourseName("physics-c-em")).toBe("AP Physics C: Electricity and Magnetism");
    // Unit numbers and topics per unit, as in the Course and Exam Description's course at a glance.
    expect(apUnits("physics-c-em").map((u) => [u.unit, u.topics.length])).toEqual([
      [8, 6],
      [9, 3],
      [10, 4],
      [11, 8],
      [12, 4],
      [13, 6],
    ]);
    expect(apUnits("physics-c-em").map((u) => u.title)).toEqual([
      "Electric charges, fields and Gauss's law",
      "Electric potential",
      "Conductors and capacitors",
      "Electric circuits",
      "Magnetic fields and electromagnetism",
      "Electromagnetic induction",
    ]);
    expect(apTopicLabel("8.6", "physics-c-em")).toBe("8.6 Gauss's law");
    expect(apTopicLabel("12.4", "physics-c-em")).toBe("12.4 Ampère's law");
    expect(apTopicLabel("13.6", "physics-c-em")).toMatch(/LC circuits/);
    // The source and the day it was read are recorded with the data.
    expect(AP_COURSES["physics-c-em"].note).toMatch(/apcentral\.collegeboard\.org/);
    expect(AP_COURSES["physics-c-em"].note).toMatch(/retrieved \d{4}-\d{2}-\d{2}/);
    expect(AP_COURSES["physics-c-em"].note).toMatch(/Scorpio's own words/);
  });

  test("the same unit number or topic id means different things per course", () => {
    expect(apUnitLabel(2)).toBe("Unit 2: Force and translational dynamics");
    expect(apTopicLabel("2.9", "physics-c-mech")).toBe("2.9 Resistive forces");
    expect(apTopicLabel("2.9")).not.toBe("2.9 Resistive forces"); // Physics 1's 2.9 is another topic
    expect(isApTopicId("2.10")).toBe(false); // Physics 1 unit 2 stops at 2.9
    expect(isApTopicId("2.10", "physics-c-mech")).toBe(true);
    expect(apUnit(9)).toBeUndefined();
    expect(apUnit(9, "physics-2")?.title).toBe("Thermodynamics");
    expect(apTopic("12.4", "physics-2")?.unit).toBe(12);
    expect(apTopic("12.4")).toBeUndefined();
    expect(apUnitLabel(12)).toBe("Unit 12");
    // C: E&M's unit numbers overlap AP Physics 1 (8) and AP Physics 2 (9-13); each stays its own.
    expect(apUnit(8)?.title).toBe("Fluids");
    expect(apUnit(8, "physics-c-em")?.title).toBe("Electric charges, fields and Gauss's law");
    expect(apUnit(8, "physics-2")).toBeUndefined();
    expect(apUnit(8, "physics-c-mech")).toBeUndefined();
    expect(apUnitLabel(9, "physics-2")).toBe("Unit 9: Thermodynamics");
    expect(apUnitLabel(9, "physics-c-em")).toBe("Unit 9: Electric potential");
    expect(apUnitLabel(13, "physics-2")).toBe("Unit 13: Geometric optics");
    expect(apUnitLabel(13, "physics-c-em")).toBe("Unit 13: Electromagnetic induction");
    expect(apTopicLabel("12.4", "physics-2")).not.toBe(apTopicLabel("12.4", "physics-c-em"));
    expect(isApTopicId("9.4", "physics-2")).toBe(true);
    expect(isApTopicId("9.4", "physics-c-em")).toBe(false); // C: E&M unit 9 stops at 9.3
    expect(apUnit(14, "physics-c-em")).toBeUndefined();
    expect(apUnit(7, "physics-c-em")).toBeUndefined();
    expect(isApCourseId("physics-2")).toBe(true);
    expect(isApCourseId("physics-c-em")).toBe(true);
    expect(isApCourseId("physics-3")).toBe(false);
    expect(isApCourseId("constructor")).toBe(false);
  });

  test("assignment tags are checked against their own course; no course means Physics 1", () => {
    expect(normaliseApTags({ apUnit: 4, apTopics: ["4.1", "9.1"] })).toEqual({
      apCourse: "physics-1",
      apUnit: 4,
      apTopics: ["4.1"],
    });
    expect(normaliseApTags({ apCourse: "physics-2", apTopics: ["11.6", "11.2", "4.1"] })).toEqual({
      apCourse: "physics-2",
      apUnit: 11,
      apTopics: ["11.2", "11.6"],
    });
    expect(
      normaliseApTags({ apCourse: "physics-c-mech", apUnit: 2, apTopics: ["2.10", "2.9"] }),
    ).toEqual({
      apCourse: "physics-c-mech",
      apUnit: 2,
      apTopics: ["2.9", "2.10"],
    });
    expect(
      normaliseApTags({ apCourse: "physics-c-em", apTopics: ["13.6", "13.1", "9.1", "13.9"] }),
    ).toEqual({ apCourse: "physics-c-em", apUnit: 13, apTopics: ["13.1", "13.6"] });
    // 14 is a unit of AP Physics 2 only, and 9.4 a topic of AP Physics 2 only.
    expect(normaliseApTags({ apCourse: "physics-c-em", apUnit: 14 })).toEqual({
      apCourse: null,
      apUnit: null,
      apTopics: [],
    });
    expect(normaliseApTags({ apCourse: "physics-c-em", apUnit: 9, apTopics: ["9.4"] })).toEqual({
      apCourse: "physics-c-em",
      apUnit: 9,
      apTopics: [],
    });
    expect(normaliseApTags({ apCourse: "nope", apUnit: 4 })).toMatchObject({
      apCourse: "physics-1",
      apUnit: 4,
    });
    expect(normaliseApTags({ apCourse: "physics-2", apUnit: 4 })).toEqual({
      apCourse: null,
      apUnit: null,
      apTopics: [],
    });
  });
});

describe("course definitions", () => {
  test("four courses; every set of the two newer written ones is either written (5 problems) or planned", () => {
    expect(CURRICULA.map((c) => c.id)).toEqual([
      "ap-physics-1",
      "ap-physics-2",
      "ap-physics-c-mech",
      "ap-physics-c-em",
    ]);
    for (const c of CURRICULA) expect(validateCurriculum(c)).toEqual([]);
    expect(hasContent(getCurriculum("ap-physics-1")!)).toBe(true);
    for (const id of ["ap-physics-2", "ap-physics-c-mech"]) {
      const c = getCurriculum(id)!;
      expect(hasContent(c)).toBe(c.sets.some((s) => s.draftIds.length > 0));
      expect(c.sets).toHaveLength(28);
      // A set is planned (no problems) or complete; only written sets have a profile.
      for (const s of c.sets) {
        expect([s.key, [0, 5].includes(s.draftIds.length)]).toEqual([s.key, true]);
        expect([s.key, !!setProfile(id, s.key)]).toEqual([s.key, s.draftIds.length > 0]);
      }
      // Every topic of the course is covered by some set.
      const covered = new Set(c.sets.flatMap((s) => s.topics));
      const all = apUnits(c.apCourse).flatMap((u) => u.topics.map((t) => t.id));
      expect(all.filter((t) => !covered.has(t))).toEqual([]);
      expect(curriculumUnits(id).every((u) => u.sets.length === 4 && !!u.info)).toBe(true);
    }
    expect(getCurriculum("ap-physics-2")!.sets[0].key).toBe("9A");
    expect(defaultOrder("ap-physics-2").slice(-1)).toEqual(["15D"]);
    expect(curriculumUnits("ap-physics-2").map((u) => u.unit)).toEqual([9, 10, 11, 12, 13, 14, 15]);
  });

  test("AP Physics C: Electricity and Magnetism is an outline: 24 planned sets, 8A-13D, no problems", () => {
    const id = "ap-physics-c-em";
    const c = getCurriculum(id)!;
    expect(c).toMatchObject({ apCourse: "physics-c-em", name: apCourseName("physics-c-em") });
    expect(c.sets.map((s) => s.key)).toEqual(
      [8, 9, 10, 11, 12, 13].flatMap((u) => ["A", "B", "C", "D"].map((l) => `${u}${l}`)),
    );
    // Nothing is written: no set has problems or a profile, and no content file is listed.
    expect(c.sets.flatMap((s) => s.draftIds)).toEqual([]);
    expect(hasContent(c)).toBe(false);
    expect(c.sets.filter((s) => setProfile(id, s.key))).toEqual([]);
    expect(CONTENT_FILES[id]).toEqual([]);
    expect(c.description).toMatch(/planned/i);
    expect(c.description).toMatch(/not written yet/i);
    // The plan still covers every topic of every unit, four sets a unit.
    const covered = new Set(c.sets.flatMap((s) => s.topics));
    const all = apUnits(c.apCourse).flatMap((u) => u.topics.map((t) => t.id));
    expect(all.filter((t) => !covered.has(t))).toEqual([]);
    expect(curriculumUnits(id).map((u) => [u.unit, u.sets.length, !!u.info])).toEqual(
      [8, 9, 10, 11, 12, 13].map((u) => [u, 4, true]),
    );
    for (const s of c.sets)
      expect([s.key, !!s.title.trim() && !!s.description.trim()]).toEqual([s.key, true]);
    // Teachers see every set as "planned": nothing to preview, assign or pace.
    const road = deriveRoadmap(id, [], []);
    expect(road.map((u) => u.unit)).toEqual([8, 9, 10, 11, 12, 13]);
    expect(new Set(road.flatMap((u) => u.sets.map((s) => s.availability)))).toEqual(
      new Set(["planned"]),
    );
    expect(nextUnit(road)).toBeUndefined();
    // A published set of another course with the same key ("9A" is also AP Physics 2) changes nothing.
    const fromP2 = { id: "a", curriculumId: "ap-physics-2", curriculumSetKey: "9A" };
    expect(deriveRoadmap(id, [], [fromP2])[1].sets[0]).toMatchObject({ assigned: false });
    expect(deriveRoadmap("ap-physics-2", [], [fromP2])[0].sets[0]).toMatchObject({
      assigned: true,
    });
    expect(displayTitle(c.sets[0], c.name)).toBe(
      "AP Physics C: Electricity and Magnetism · Unit 8A · Charge and Coulomb's law",
    );
  });

  test("a class's name suggests its course; the two AP Physics C courses are never confused", () => {
    const named = (name: string) => curriculumNamedIn(name)?.id;
    expect(named("AP Physics 1")).toBe("ap-physics-1");
    expect(named("ap physics 2 - Period 3")).toBe("ap-physics-2");
    expect(named("AP Physics C: Mechanics (P4)")).toBe("ap-physics-c-mech");
    expect(named("AP Physics C: Electricity and Magnetism")).toBe("ap-physics-c-em");
    expect(named("P6 AP PHYSICS C: ELECTRICITY AND MAGNETISM")).toBe("ap-physics-c-em");
    // A class that takes both, named for both: the longer name wins.
    expect(named("AP Physics C: Mechanics / AP Physics C: Electricity and Magnetism")).toBe(
      "ap-physics-c-em",
    );
    // Neither C course is a prefix of the other, and short forms match nothing rather than the wrong one.
    expect(named("AP Physics C")).toBeUndefined();
    expect(named("AP Physics C: E&M")).toBeUndefined();
    expect(named("AP Physics C: Electricity")).toBeUndefined();
    expect(named("Honors Physics")).toBeUndefined();
    // Every course is found by its own name, whatever the others are called.
    for (const c of CURRICULA)
      expect([c.name, named(`${c.name} - Period 1`)]).toEqual([c.name, c.id]);
  });

  test("validation: two-digit units are fine, an unknown AP course or foreign topic is not", () => {
    const p2 = getCurriculum("ap-physics-2") as Curriculum;
    expect(validateCurriculum({ ...p2, apCourse: "physics-9" as never })).toEqual([
      "ap-physics-2: unknown AP course physics-9",
    ]);
    const bad = { ...p2, sets: [{ ...p2.sets[0], topics: ["1.1"] }] };
    expect(validateCurriculum(bad).join()).toMatch(/9A: unknown topic 1\.1/);
    expect(validateCurriculum({ ...p2, sets: [{ ...p2.sets[0], key: "100A" }] }).join()).toMatch(
      /key must be/,
    );
  });

  test("a course with nothing published: sets are 'planned' or 'awaiting', nothing is assignable, plans still work", () => {
    const road = deriveRoadmap("ap-physics-2", [], []);
    expect(road.map((u) => u.unit)).toEqual([9, 10, 11, 12, 13, 14, 15]);
    expect(road[0].info?.title).toBe("Thermodynamics");
    // Written but not published in this project is "awaiting"; not written at all is "planned".
    for (const s of road.flatMap((u) => u.sets))
      expect([s.set.key, s.availability]).toEqual([
        s.set.key,
        s.set.draftIds.length ? "awaiting" : "planned",
      ]);
    expect(nextUnit(road)).toBeUndefined();
    const outline: Curriculum = {
      ...getCurriculum("ap-physics-2")!,
      sets: getCurriculum("ap-physics-2")!.sets.map((s) => ({ ...s, draftIds: [] })),
    };
    expect(hasContent(outline)).toBe(false);
    expect(validateCurriculum(outline)).toEqual([]);
    const order = moveUnit(defaultOrder("ap-physics-2"), 10, -1);
    expect(unitOrder(order).slice(0, 2)).toEqual([10, 9]);
    expect(parsePlan("ap-physics-2", { order, skipped: ["15D"] }).ok).toBe(true);
    expect(parsePlan("ap-physics-2", { order: defaultOrder("ap-physics-1"), skipped: [] }).ok).toBe(
      false,
    );
    const paced = paceCourse(road, { start: new Date("2026-09-01T12:00:00"), spacing: 2 });
    expect(paced.remaining).toBe(28);
  });

  test("set keys repeat between courses: another course's assignments are not counted", () => {
    const fromP1 = { id: "a", curriculumId: "ap-physics-1", curriculumSetKey: "1A" };
    const published = [{ id: "g", curriculumSetKey: "1A", questionCount: 5 }];
    expect(deriveRoadmap("ap-physics-c-mech", published, [fromP1])[0].sets[0].assigned).toBe(false);
    expect(deriveRoadmap("ap-physics-1", published, [fromP1])[0].sets[0].assigned).toBe(true);
    // Older copies with no curriculumId still count.
    expect(
      deriveRoadmap("ap-physics-1", published, [{ curriculumSetKey: "1A" }])[0].sets[0].assigned,
    ).toBe(true);
    const student = buildStudentRoadmap(
      "ap-physics-c-mech",
      null,
      [{ ...fromP1, title: "x" }],
      [],
    )!;
    expect(student.units[0]).toMatchObject({ label: "Unit 1: Kinematics", assigned: 0 });
    expect(student.units).toHaveLength(7);
    expect(buildStudentRoadmap("ap-physics-2", null, [], [])!.units[0].label).toBe(
      "Unit 9: Thermodynamics",
    );
  });

  test("student unit headings use the class's course", () => {
    const items = [{ id: "i", title: "t", dueDate: null, curriculumSetKey: "9A" }];
    expect(groupByUnit(items, undefined, "physics-2")[0].label).toBe("Unit 9: Thermodynamics");
    expect(groupByUnit(items)[0].label).toBe("Unit 9");
  });
});

describeWithContent("reviewed content of every course", () => {
  type Record_ = {
    id: string;
    course?: string;
    apUnit: number;
    apTopic: string;
    status: string;
    reviewKind: string | null;
    reviewNote: string | null;
    problem: { distractors: { misconception: string }[]; text: string; options?: string[] };
  };
  const load = (id: string) =>
    new Map<string, Record_>(
      (CONTENT_FILES[id] ?? []).flatMap((file) =>
        (
          JSON.parse(fs.readFileSync(path.join(__dirname, "..", file), "utf8")).drafts as Record_[]
        ).map((d) => [d.id, d] as [string, Record_]),
      ),
    );

  test("every course lists its content files, and they hold every problem of every set", () => {
    expect(Object.keys(CONTENT_FILES)).toEqual(CURRICULA.map((c) => c.id));
    for (const c of CURRICULA) {
      const drafts = load(c.id);
      const ids = c.sets.flatMap((s) => s.draftIds);
      expect([c.id, ids.filter((id) => !drafts.has(id))]).toEqual([c.id, []]);
      // Nothing in the files that no set uses.
      expect([c.id, drafts.size]).toEqual([c.id, ids.length]);
    }
  });

  test("the planned course has no content: no files, no folder of drafts", () => {
    expect(CONTENT_FILES["ap-physics-c-em"]).toEqual([]);
    expect(load("ap-physics-c-em").size).toBe(0);
    expect(fs.existsSync(path.join(__dirname, "..", "content", "ap-physics-c-em"))).toBe(false);
  });

  test("AP Physics 2 and AP Physics C: Mechanics are complete: 28 sets of 5, 140 problems each", () => {
    for (const id of ["ap-physics-2", "ap-physics-c-mech"]) {
      const c = getCurriculum(id)!;
      expect(hasContent(c)).toBe(true);
      expect(c.sets.map((s) => s.draftIds.length)).toEqual(Array(28).fill(5));
      expect(c.description).not.toMatch(/planned|not written/i);
    }
  });

  test("each problem belongs to its set's course, unit and topics, passes validation there and is marked AI-reviewed", () => {
    for (const id of ["ap-physics-2", "ap-physics-c-mech"]) {
      const c = getCurriculum(id)!;
      const drafts = load(id);
      for (const set of c.sets)
        for (const draftId of set.draftIds) {
          const d = drafts.get(draftId)!;
          const where = `${id} ${set.key} ${draftId}`;
          expect([where, d.course]).toEqual([where, c.apCourse]);
          expect([where, d.apUnit]).toEqual([where, set.unit]);
          expect([where, set.topics.includes(d.apTopic)]).toEqual([where, true]);
          expect([where, d.reviewKind]).toEqual([where, "ai"]);
          expect([where, /a person still needs to check/.test(d.reviewNote ?? "")]).toEqual([
            where,
            true,
          ]);
          const v = validateDraftProblem(d.problem, d.apTopic, c.apCourse);
          expect([where, v.errors]).toEqual([where, []]);
          // Students see the text as written: no LaTeX commands.
          expect([
            where,
            /\\[a-zA-Z]+/.test([d.problem.text, ...(d.problem.options ?? [])].join(" ")),
          ]).toEqual([where, false]);
          // Every distractor tag is one of the course's tags for this unit (or an any-unit one).
          for (const x of d.problem.distractors) {
            const units = misconceptionUnits(misconceptionTag(x.misconception)!, c.apCourse);
            expect([
              where,
              x.misconception,
              units !== null && (!units.length || units.includes(set.unit)),
            ]).toEqual([where, x.misconception, true]);
          }
        }
    }
  });

  test("every topic of the two courses has at least one problem", () => {
    for (const id of ["ap-physics-2", "ap-physics-c-mech"]) {
      const c = getCurriculum(id)!;
      const drafts = load(id);
      const used = new Set(c.sets.flatMap((s) => s.draftIds.map((d) => drafts.get(d)!.apTopic)));
      const all = apUnits(c.apCourse).flatMap((u) => u.topics.map((t) => t.id));
      expect([id, all.filter((t) => !used.has(t))]).toEqual([id, []]);
    }
  });
});
