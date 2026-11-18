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
  curriculumUnits,
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
  test("three courses, each with well-formed units and topics", () => {
    expect(AP_COURSE_IDS).toEqual(["physics-1", "physics-2", "physics-c-mech"]);
    for (const id of AP_COURSE_IDS) {
      const units = apUnits(id);
      expect(AP_COURSES[id].course).toBe(id);
      expect(units.length).toBeGreaterThanOrEqual(7);
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
    expect(isApCourseId("physics-2")).toBe(true);
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
  test("three courses; every set of the two newer ones is either written (5 problems) or planned", () => {
    expect(CURRICULA.map((c) => c.id)).toEqual([
      "ap-physics-1",
      "ap-physics-2",
      "ap-physics-c-mech",
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
