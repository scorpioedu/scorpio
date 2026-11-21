// What used to be fixed to AP Physics 1 and now takes the AP course: misconception tags, the events
// grading records, the insights report, the content generator and the request schemas. Every block
// also pins the AP Physics 1 behaviour, which must not change.
import {
  AP_COURSE_KEYS,
  AP_COURSE_UNIT_RANGE,
  MISCONCEPTION_TAGS,
  apCourseKey,
  isUnitOfCourse,
  misconceptionPromptList,
  misconceptionTag,
  misconceptionUnits,
  misconceptionsForCourse,
  misconceptionsForUnit,
  nonDefaultApCourse,
} from "../functions/src/misconceptions";
import { buildMisconceptionEvents } from "../functions/src/misconception-events";
import { gradeSubmissionAnswers } from "../functions/src/grading-core";
import {
  GRADER_SYSTEM_INSTRUCTION,
  buildGradingRequest,
  graderSystemInstruction,
} from "../functions/src/grading-schema";
import {
  AP_COURSE_IDS,
  apCourseOf,
  apUnitKey,
  apUnits,
  parseApUnitKey,
  type ApCourseId,
} from "../src/data/ap";
import {
  buildInsightsReport,
  courseScopedId,
  eventCourse,
  filterEvents,
  parseCourseScopedId,
  type InsightEvent,
} from "../src/lib/insights";
import { buildUnitInsights } from "../src/lib/course-progress";
import { validateDraftProblem } from "../src/lib/content/problem-format";
import {
  GENERATOR_SYSTEM_INSTRUCTION,
  SOLVER_SYSTEM_INSTRUCTION,
  buildGeneratorPrompt,
  generateProblems,
  generatorSystemInstruction,
  solverSystemInstruction,
  type ModelCall,
} from "../src/lib/content/problem-generator";
import { draftCourse } from "../src/lib/content/drafts";
import { contentGenerateBody, createAssignmentBody } from "../src/lib/schemas/api-bodies";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { parseArgs } = require("../tools/content-drafts.cjs");

jest.mock("../src/lib/ai/config", () => ({ model: { generateContent: jest.fn() } }));

const tag = (id: string) => misconceptionTag(id)!;
// How many tags AP Physics 2 and C: Mechanics had before C: E&M was added (any-unit ones included).
const P2_TAGS = 78;
const MECH_TAGS = 45;

describe("misconception tags per AP course", () => {
  test("the functions bundle and the web app agree on the courses and their unit numbers", () => {
    expect([...AP_COURSE_KEYS]).toEqual(AP_COURSE_IDS);
    for (const course of AP_COURSE_IDS) {
      const units = apUnits(course).map((u) => u.unit);
      expect(AP_COURSE_UNIT_RANGE[course]).toEqual([Math.min(...units), Math.max(...units)]);
      expect(units.every((u) => isUnitOfCourse(u, course))).toBe(true);
    }
    expect(isUnitOfCourse(9, "physics-1")).toBe(false);
    expect(isUnitOfCourse(8, "physics-c-mech")).toBe(false);
    expect(isUnitOfCourse(9, "physics-2")).toBe(true);
    expect(isUnitOfCourse("9", "physics-2")).toBe(false);
    expect(AP_COURSE_UNIT_RANGE["physics-c-em"]).toEqual([8, 13]);
    expect([7, 8, 13, 14].map((u) => isUnitOfCourse(u, "physics-c-em"))).toEqual([
      false,
      true,
      true,
      false,
    ]);
    expect(apCourseKey("physics-c-em")).toBe("physics-c-em");
    expect(nonDefaultApCourse("physics-c-em")).toBe("physics-c-em");
    expect(apCourseKey(undefined)).toBe("physics-1");
    expect(apCourseKey("physics-9")).toBe("physics-1");
    expect(apCourseKey("physics-2")).toBe("physics-2");
    expect(nonDefaultApCourse("physics-1")).toBeUndefined();
    expect(nonDefaultApCourse("physics-c-mech")).toBe("physics-c-mech");
  });

  test("every unit of every course has at least three conceptual tags of its own", () => {
    for (const course of AP_COURSE_IDS)
      for (const u of apUnits(course)) {
        const own = misconceptionsForUnit(u.unit, course).filter(
          (t) => t.category === "conceptual" && t.id !== "other",
        );
        expect([course, u.unit, own.length >= 3]).toEqual([course, u.unit, true]);
      }
  });

  test("courseUnits only name units of their own course", () => {
    for (const t of MISCONCEPTION_TAGS)
      for (const [course, units] of Object.entries(t.courseUnits ?? {})) {
        expect(course).not.toBe("physics-1");
        expect(units!.length).toBeGreaterThan(0);
        for (const u of units!) expect(isUnitOfCourse(u, course as ApCourseId)).toBe(true);
      }
  });

  test("AP Physics 1 keeps exactly the tags it had: the ones with Physics 1 units, plus the any-unit ones", () => {
    const before = MISCONCEPTION_TAGS.filter((t) => t.units.length || !t.courseUnits).map(
      (t) => t.id,
    );
    expect(misconceptionsForCourse("physics-1").map((t) => t.id)).toEqual(before);
    expect(misconceptionsForCourse().map((t) => t.id)).toEqual(before);
    // 37 mechanics tags + 7 procedural slips + "other", as before the other courses.
    expect(before).toHaveLength(45);
    expect(misconceptionsForUnit(4).map((t) => t.id)).toEqual(
      MISCONCEPTION_TAGS.filter(
        (t) => t.units.includes(4) || (!t.units.length && !t.courseUnits),
      ).map((t) => t.id),
    );
    const list = misconceptionPromptList();
    expect(list).toContain("- force-implies-motion:");
    expect(list).not.toContain("current-used-up");
    expect(list).not.toContain("constant-acceleration-assumed");
    expect(list.split("\n")).toHaveLength(38);
  });

  test("AP Physics 2 has its own tags and borrows the few mechanics ideas that carry over", () => {
    expect(misconceptionUnits(tag("current-used-up"), "physics-2")).toEqual([11]);
    expect(misconceptionUnits(tag("current-used-up"), "physics-1")).toBeNull();
    expect(misconceptionUnits(tag("current-used-up"), "physics-c-mech")).toBeNull();
    expect(misconceptionUnits(tag("third-law-unequal-forces"), "physics-2")).toEqual([10, 12]);
    expect(misconceptionUnits(tag("third-law-unequal-forces"))).toEqual([2, 4]);
    expect(misconceptionUnits(tag("force-implies-motion"), "physics-2")).toBeNull();
    expect(misconceptionUnits(tag("frequency-changes-in-medium"), "physics-2")).toEqual([13, 14]);
    const unit9 = misconceptionsForUnit(9, "physics-2").map((t) => t.id);
    expect(unit9).toEqual(expect.arrayContaining(["heat-temperature-confusion", "sign-error"]));
    expect(unit9).not.toContain("current-used-up");
    expect(unit9).not.toContain("velocity-acceleration-confusion");
    const list = misconceptionPromptList("physics-2");
    expect(list).toContain("- lenz-opposes-field:");
    expect(list).not.toContain("force-implies-motion");
  });

  test("C: Mechanics reuses the mechanics tags under the same unit numbers, without fluids", () => {
    expect(misconceptionUnits(tag("force-implies-motion"), "physics-c-mech")).toEqual([2]);
    expect(misconceptionUnits(tag("graph-as-picture"), "physics-c-mech")).toEqual([1, 7]);
    expect(
      misconceptionUnits(tag("buoyancy-depends-on-object-weight"), "physics-c-mech"),
    ).toBeNull();
    expect(misconceptionUnits(tag("constant-acceleration-assumed"), "physics-c-mech")).toContain(1);
    expect(misconceptionUnits(tag("rolling-ignores-rotation"), "physics-c-mech")).toEqual([6]);
    expect(misconceptionUnits(tag("rolling-ignores-rotation"))).toBeNull();
    expect(misconceptionUnits(tag("heat-temperature-confusion"), "physics-c-mech")).toBeNull();
    for (const course of AP_COURSE_IDS)
      expect(misconceptionUnits(tag("sign-error"), course)).toEqual([]);
  });

  test("C: E&M reuses AP Physics 2's electricity and magnetism tags under its own unit numbers", () => {
    const em = "physics-c-em";
    // The circuits unit is 11 in both courses; the other shared tags are renumbered.
    expect(misconceptionUnits(tag("current-used-up"), em)).toEqual([11]);
    expect(misconceptionUnits(tag("rc-linear-change"), em)).toEqual([11]);
    expect(misconceptionUnits(tag("power-energy-confusion"), em)).toEqual([11]);
    expect(misconceptionUnits(tag("field-force-confusion"), em)).toEqual([8]);
    expect(misconceptionUnits(tag("field-potential-zero-together"), em)).toEqual([9]);
    expect(misconceptionUnits(tag("conductor-interior-field"), em)).toEqual([10]);
    expect(misconceptionUnits(tag("capacitance-depends-on-charge"), em)).toEqual([10, 11]);
    expect(misconceptionUnits(tag("magnetic-force-does-work"), em)).toEqual([12]);
    expect(misconceptionUnits(tag("lenz-opposes-field"), em)).toEqual([13]);
    expect(misconceptionUnits(tag("lenz-opposes-field"), "physics-2")).toEqual([12]);
    expect(misconceptionUnits(tag("third-law-unequal-forces"), em)).toEqual([8, 12]);
    expect(misconceptionUnits(tag("third-law-unequal-forces"))).toEqual([2, 4]);
    expect(misconceptionUnits(tag("derivative-integral-confusion"), em)).toEqual([9, 11, 13]);
    expect(misconceptionUnits(tag("derivative-integral-confusion"), "physics-c-mech")).toEqual([
      1, 3, 4, 5,
    ]);
    // Every AP Physics 2 tag of units 10-12 is offered in C: E&M; none of the other units' is.
    for (const t of MISCONCEPTION_TAGS) {
      const p2 = t.courseUnits?.["physics-2"];
      if (!p2) continue;
      const shared = p2.some((u) => u >= 10 && u <= 12);
      expect([t.id, misconceptionUnits(t, em) !== null]).toEqual([t.id, shared]);
    }
    for (const id of [
      "heat-temperature-confusion", // Physics 2 unit 9
      "celsius-as-absolute", // 9 and 15
      "optics-sign-convention", // 13
      "frequency-changes-in-medium", // 13 and 14
      "half-life-linear", // 15
      "graph-as-picture", // Physics 1 units 1 and 7; Physics 2 unit 14
      "force-implies-motion", // mechanics only
      "buoyancy-depends-on-object-weight", // Physics 1 unit 8
      "constant-acceleration-assumed", // C: Mechanics only
    ])
      expect([id, misconceptionUnits(tag(id), em)]).toEqual([id, null]);
    for (const course of AP_COURSE_IDS)
      expect(misconceptionUnits(tag("unit-wrong"), course)).toEqual([]);
  });

  test("C: E&M's own calculus tags belong to no other course, and every one is complete", () => {
    const own = MISCONCEPTION_TAGS.filter(
      (t) => Object.keys(t.courseUnits ?? {}).join() === "physics-c-em" && !t.units.length,
    );
    expect(own.map((t) => t.id)).toEqual([
      "gauss-law-without-symmetry",
      "flux-field-confusion",
      "enclosed-charge-or-current-wrong",
      "distribution-as-point-charge",
      "potential-gradient-sign",
      "dielectric-misapplied",
      "time-constant-misread",
      "ampere-law-without-symmetry",
      "emf-from-flux-not-rate",
      "inductor-opposes-current",
      "inductor-limits-swapped",
      "lc-charge-current-in-phase",
    ]);
    for (const t of own) {
      expect([t.id, !!t.label.trim(), t.description.length > 40, t.category]).toEqual([
        t.id,
        true,
        true,
        "conceptual",
      ]);
      for (const course of ["physics-1", "physics-2", "physics-c-mech"] as const) {
        expect([t.id, course, misconceptionUnits(t, course)]).toEqual([t.id, course, null]);
        expect(misconceptionPromptList(course)).not.toContain(`- ${t.id}:`);
      }
    }
    expect(misconceptionUnits(tag("enclosed-charge-or-current-wrong"), "physics-c-em")).toEqual([
      8, 12,
    ]);
    expect(misconceptionUnits(tag("time-constant-misread"), "physics-c-em")).toEqual([11, 13]);
  });

  test("unit numbers shared with other courses do not leak tags: 8 (Physics 1), 9-13 (Physics 2)", () => {
    const ids = (unit: number, course?: ApCourseId) =>
      misconceptionsForUnit(unit, course).map((t) => t.id);
    // Unit 8: fluids in AP Physics 1, charge and Gauss's law in C: E&M.
    expect(ids(8)).toContain("buoyancy-depends-on-object-weight");
    expect(ids(8)).not.toContain("gauss-law-without-symmetry");
    expect(ids(8)).not.toContain("field-force-confusion");
    expect(ids(8, "physics-c-em")).toEqual(
      expect.arrayContaining(["gauss-law-without-symmetry", "field-force-confusion", "sign-error"]),
    );
    expect(ids(8, "physics-c-em")).not.toContain("buoyancy-depends-on-object-weight");
    // Unit 9: thermodynamics in AP Physics 2, potential in C: E&M.
    expect(ids(9, "physics-2")).toContain("heat-temperature-confusion");
    expect(ids(9, "physics-2")).not.toContain("potential-gradient-sign");
    expect(ids(9, "physics-2")).not.toContain("field-potential-zero-together");
    expect(ids(9, "physics-c-em")).toContain("potential-gradient-sign");
    expect(ids(9, "physics-c-em")).not.toContain("heat-temperature-confusion");
    expect(ids(9, "physics-c-em")).not.toContain("thermal-work-sign");
    // Unit 10: Physics 2 keeps its whole electrostatics unit; C: E&M has conductors and capacitors.
    expect(ids(10, "physics-2")).toContain("field-force-confusion");
    expect(ids(10, "physics-2")).not.toContain("dielectric-misapplied");
    expect(ids(10, "physics-c-em")).toContain("dielectric-misapplied");
    expect(ids(10, "physics-c-em")).not.toContain("field-force-confusion");
    // Unit 12: induction is in Physics 2's unit 12 but in C: E&M's unit 13.
    expect(ids(12, "physics-2")).toContain("induction-needs-change");
    expect(ids(12, "physics-c-em")).not.toContain("induction-needs-change");
    expect(ids(12, "physics-c-em")).toContain("ampere-law-without-symmetry");
    expect(ids(12, "physics-2")).not.toContain("ampere-law-without-symmetry");
    // Unit 13: geometric optics in AP Physics 2, induction in C: E&M.
    expect(ids(13, "physics-2")).toContain("optics-sign-convention");
    expect(ids(13, "physics-2")).not.toContain("lenz-opposes-field");
    expect(ids(13, "physics-2")).not.toContain("inductor-opposes-current");
    expect(ids(13, "physics-c-em")).toEqual(
      expect.arrayContaining(["lenz-opposes-field", "inductor-opposes-current"]),
    );
    expect(ids(13, "physics-c-em")).not.toContain("optics-sign-convention");
    // Adding the course changed no other course's list.
    expect(misconceptionsForCourse("physics-2")).toHaveLength(P2_TAGS);
    expect(misconceptionsForCourse("physics-c-mech")).toHaveLength(MECH_TAGS);
    // The grader and the generator are offered C: E&M's tags only.
    const grader = graderSystemInstruction("physics-c-em");
    expect(grader).toContain("- gauss-law-without-symmetry:");
    expect(grader).toContain("- current-used-up:");
    expect(grader).not.toContain("- heat-temperature-confusion:");
    expect(grader).not.toContain("- force-implies-motion:");
    expect(graderSystemInstruction("physics-2")).not.toContain("- gauss-law-without-symmetry:");
    expect(GRADER_SYSTEM_INSTRUCTION).not.toContain("gauss-law-without-symmetry");
  });

  test("the AI grader is offered the tags of the assignment's course; Physics 1 is unchanged", () => {
    expect(graderSystemInstruction()).toBe(GRADER_SYSTEM_INSTRUCTION);
    expect(graderSystemInstruction("physics-1")).toBe(GRADER_SYSTEM_INSTRUCTION);
    expect(GRADER_SYSTEM_INSTRUCTION).not.toContain("current-used-up");
    const p2 = graderSystemInstruction("physics-2");
    expect(p2).toContain("- current-used-up:");
    expect(p2).not.toContain("- force-implies-motion:");
    expect(p2).toContain("SECURITY RULES");
    const base = { question: "q", answer: "a" };
    expect(buildGradingRequest(base, "n").systemInstruction).toBe(GRADER_SYSTEM_INSTRUCTION);
    expect(buildGradingRequest({ ...base, apCourse: "physics-2" }, "n").systemInstruction).toBe(p2);
  });

  test("grading hands the course to the AI grader only when it is not AP Physics 1", async () => {
    const questions = [{ id: "q1", text: "Explain why the bulb dims.", type: "text", points: 10 }];
    const answers = [{ questionId: "q1", answer: "Because the current gets used up in the bulb." }];
    const aiGrader = jest.fn(async () => ({ score: 5, feedback: "f", reasoning: "r" }));
    await gradeSubmissionAnswers(questions, answers, { aiGrader });
    expect(aiGrader).toHaveBeenLastCalledWith({
      question: questions[0].text,
      answer: answers[0].answer,
      reference: undefined,
      rubric: undefined,
    });
    await gradeSubmissionAnswers(questions, answers, { aiGrader, apCourse: "physics-2" });
    expect(aiGrader).toHaveBeenLastCalledWith(expect.objectContaining({ apCourse: "physics-2" }));
  });
});

describe("misconception events carry the AP course", () => {
  const build = (assignment: Record<string, unknown>, questions: unknown[] = [{ id: "q1" }]) =>
    buildMisconceptionEvents({
      submissionId: "s1",
      studentId: "st1",
      assignmentId: "a1",
      assignment: { teacherId: "t1", title: "T", questions, ...assignment },
      answers: [{ questionId: "q1", score: 0, maxPoints: 10, misconceptions: ["sign-error"] }],
      final: true,
    })[0];

  test("an assignment with no course is AP Physics 1, exactly as before", () => {
    expect(build({ apUnit: 4, apTopics: ["4.2", "4.3"] })).toMatchObject({
      apCourse: "physics-1",
      apUnit: 4,
      apTopic: null,
    });
    expect(build({ apUnit: 4 }, [{ id: "q1", apTopic: "4.3" }])).toMatchObject({
      apCourse: "physics-1",
      apUnit: 4,
      apTopic: "4.3",
    });
    // Unit 9 is not an AP Physics 1 unit: no unit, and so no course either.
    expect(build({ apUnit: 9, apTopics: ["9.1"] })).toMatchObject({
      apCourse: null,
      apUnit: null,
      apTopic: null,
    });
    expect(build({})).toMatchObject({ apCourse: null, apUnit: null, apTopic: null });
  });

  test("units and topics are read in the assignment's own course", () => {
    expect(
      build({ apCourse: "physics-2", apUnit: 11 }, [{ id: "q1", apTopic: "11.3" }]),
    ).toMatchObject({ apCourse: "physics-2", apUnit: 11, apTopic: "11.3" });
    expect(build({ apCourse: "physics-2", apTopics: ["14.6"] })).toMatchObject({
      apCourse: "physics-2",
      apUnit: 14,
      apTopic: "14.6",
    });
    expect(build({ apCourse: "physics-c-mech", apUnit: 2, apTopics: ["2.9"] })).toMatchObject({
      apCourse: "physics-c-mech",
      apUnit: 2,
      apTopic: "2.9",
    });
    // A topic of another course is ignored; unit 8 does not exist in C: Mechanics.
    expect(
      build({ apCourse: "physics-2", apUnit: 9 }, [{ id: "q1", apTopic: "4.2" }]),
    ).toMatchObject({ apUnit: 9, apTopic: null });
    expect(build({ apCourse: "physics-c-mech", apUnit: 8 })).toMatchObject({
      apCourse: null,
      apUnit: null,
    });
  });
});

describe("insights: units are labelled and filtered by course", () => {
  const ev = (o: Partial<InsightEvent>): InsightEvent => ({
    submissionId: "s1",
    assignmentId: "a1",
    assignmentTitle: "Forces HW",
    studentId: "st1",
    courseId: "c1",
    questionId: "q1",
    tag: "force-implies-motion",
    apUnit: 2,
    apTopic: "2.5",
    final: true,
    ...o,
  });
  // st1, st2: AP Physics 1 unit 2 (one stored before events had a course). st3: C: Mechanics unit 2.
  const mixed = [
    ev({ studentId: "st1", submissionId: "s1" }),
    ev({ studentId: "st2", submissionId: "s2", apCourse: "physics-1" }),
    ev({
      studentId: "st3",
      submissionId: "s3",
      assignmentId: "a2",
      apCourse: "physics-c-mech",
      apTopic: "2.5",
    }),
    ev({
      studentId: "st3",
      submissionId: "s4",
      assignmentId: "a3",
      apCourse: "physics-2",
      apUnit: 11,
      apTopic: "11.3",
      tag: "current-used-up",
    }),
  ];

  test("ids and the course of an event", () => {
    expect(eventCourse({})).toBe("physics-1");
    expect(eventCourse({ apCourse: null })).toBe("physics-1");
    expect(eventCourse({ apCourse: "nope" })).toBe("physics-1");
    expect(eventCourse({ apCourse: "physics-2" })).toBe("physics-2");
    expect(courseScopedId("physics-1", 4)).toBe("4");
    expect(courseScopedId("physics-c-mech", "2.5")).toBe("physics-c-mech:2.5");
    expect(parseCourseScopedId("4")).toEqual({ course: "physics-1", id: "4" });
    expect(parseCourseScopedId("physics-2:9")).toEqual({ course: "physics-2", id: "9" });
    expect(parseCourseScopedId("bogus:9")).toEqual({ course: "physics-1", id: "bogus:9" });
  });

  test("unit 11 of AP Physics 2 and of C: E&M stay apart, each named for its course", () => {
    const circuits = [
      ev({ apCourse: "physics-2", apUnit: 11, apTopic: "11.8", tag: "rc-linear-change" }),
      ev({
        studentId: "st2",
        submissionId: "s2",
        assignmentId: "a2",
        apCourse: "physics-c-em",
        apUnit: 11,
        apTopic: "11.8",
        tag: "rc-linear-change",
      }),
    ];
    const report = buildInsightsReport(circuits);
    expect(report.byUnit.map((g) => [g.id, g.label, g.studentCount])).toEqual([
      ["physics-2:11", "AP Physics 2 · Unit 11: Electric circuits", 1],
      [
        "physics-c-em:11",
        "AP Physics C: Electricity and Magnetism · Unit 11: Electric circuits",
        1,
      ],
    ]);
    expect(courseScopedId("physics-c-em", "11.8")).toBe("physics-c-em:11.8");
    expect(parseCourseScopedId("physics-c-em:11")).toEqual({ course: "physics-c-em", id: "11" });
    expect(filterEvents(circuits, { apUnit: 11, apCourse: "physics-c-em" })).toHaveLength(1);
    expect(filterEvents(circuits, { apUnit: 11, apCourse: "physics-2" })).toHaveLength(1);
    expect(filterEvents(circuits, { apUnit: 11 })).toHaveLength(0);
  });

  test("unit 2 of AP Physics 1 and of C: Mechanics stay apart, each named for its course", () => {
    const report = buildInsightsReport(mixed);
    expect(report.byUnit.map((g) => [g.id, g.label, g.studentCount])).toEqual([
      ["2", "AP Physics 1 · Unit 2: Force and translational dynamics", 2],
      ["physics-2:11", "AP Physics 2 · Unit 11: Electric circuits", 1],
      ["physics-c-mech:2", "AP Physics C: Mechanics · Unit 2: Force and translational dynamics", 1],
    ]);
    const row = report.top.find((r) => r.tag === "force-implies-motion")!;
    expect(row.topics.map((t) => [t.id, t.label, t.studentCount])).toEqual([
      ["2.5", "2.5 Newton's second law (AP Physics 1)", 2],
      ["physics-c-mech:2.5", "2.5 Newton's second law (AP Physics C: Mechanics)", 1],
    ]);
  });

  test("a report with only AP Physics 1 work reads exactly as it did", () => {
    const report = buildInsightsReport(mixed.slice(0, 2));
    expect(report.byUnit).toEqual([
      {
        id: "2",
        label: "Unit 2: Force and translational dynamics",
        studentCount: 2,
        top: [
          {
            tag: "force-implies-motion",
            label: tag("force-implies-motion").label,
            studentCount: 2,
          },
        ],
      },
    ]);
    expect(report.top[0].topics).toEqual([
      { id: "2.5", label: "2.5 Newton's second law", studentCount: 2 },
    ]);
  });

  test("a single other course is still named", () => {
    const report = buildInsightsReport(mixed.slice(3));
    expect(report.byUnit[0]).toMatchObject({
      id: "physics-2:11",
      label: "AP Physics 2 · Unit 11: Electric circuits",
    });
    expect(report.top[0].topics[0]).toMatchObject({
      id: "physics-2:11.3",
      label: "11.3 Resistance, resistivity and Ohm's law",
    });
  });

  test("a unit filter means that unit of one course; no course means AP Physics 1", () => {
    const students = (f: Parameters<typeof filterEvents>[1]) =>
      filterEvents(mixed, f).map((e) => e.studentId);
    expect(students({ apUnit: 2 })).toEqual(["st1", "st2"]);
    expect(students({ apUnit: 2, apCourse: "physics-1" })).toEqual(["st1", "st2"]);
    expect(students({ apUnit: 2, apCourse: "physics-c-mech" })).toEqual(["st3"]);
    expect(students({ apUnit: 11 })).toEqual([]);
    expect(students({ apUnit: 11, apCourse: "physics-2" })).toEqual(["st3"]);
    expect(students({ apCourse: "physics-c-mech" })).toEqual(["st3"]);
    expect(students({})).toHaveLength(4);
  });

  test("a class's unit insights only count events of the course it follows", () => {
    const context = { studentsByUnit: { 2: 3 }, assignedKeys: [] };
    const p1 = buildUnitInsights("ap-physics-1", mixed, context);
    expect(p1.map((u) => u.unit)).toEqual([2]);
    expect(p1[0].top[0]).toMatchObject({ tag: "force-implies-motion", studentCount: 2 });
    const mech = buildUnitInsights("ap-physics-c-mech", mixed, context);
    expect(mech.map((u) => u.unit)).toEqual([2]);
    expect(mech[0].top[0]).toMatchObject({ studentCount: 1 });
    expect(mech[0].top[0].topics).toEqual([{ id: "2.5", label: "2.5 Newton's second law" }]);
    const p2 = buildUnitInsights("ap-physics-2", mixed, { studentsByUnit: {}, assignedKeys: [] });
    expect(p2.map((u) => u.unit)).toEqual([11]);
    expect(p2[0].top[0].topics[0].label).toBe("11.3 Resistance, resistivity and Ohm's law");
  });
});

describe("content generator per course", () => {
  test("AP Physics 1 prompts are word for word what they were", () => {
    expect(generatorSystemInstruction()).toBe(GENERATOR_SYSTEM_INSTRUCTION);
    expect(solverSystemInstruction()).toBe(SOLVER_SYSTEM_INSTRUCTION);
    expect(GENERATOR_SYSTEM_INSTRUCTION).toMatch(
      /^You write AP Physics 1 homework problems for high school students in the United States\.\n\nRules:\n- Every problem must be solvable with AP Physics 1 methods \(algebra and trigonometry, no calculus\) and must test the given topic\.\n- Use realistic numbers and SI units\./,
    );
    expect(SOLVER_SYSTEM_INSTRUCTION).toContain("Solve the AP Physics 1 problem yourself");
    expect(buildGeneratorPrompt("4.2", 3, undefined, "physics-1")).toBe(
      buildGeneratorPrompt("4.2", 3),
    );
    expect(buildGeneratorPrompt("4.2", 3)).toContain("Write 3 AP Physics 1 problems:");
  });

  test("each course is named, and only the two AP Physics C courses use calculus", () => {
    const em = generatorSystemInstruction("physics-c-em");
    expect(em).toContain("You write AP Physics C: Electricity and Magnetism homework problems");
    expect(em).toContain("calculus-based");
    expect(em).not.toContain("no calculus");
    expect(em).toContain("Never use LaTeX");
    expect(em).toContain('Return ONLY JSON: {"problems"');
    expect(solverSystemInstruction("physics-c-em")).toContain(
      "AP Physics C: Electricity and Magnetism problem",
    );
    const gauss = buildGeneratorPrompt("8.6", 1, undefined, "physics-c-em");
    expect(gauss).toContain("Write 1 AP Physics C: Electricity and Magnetism problem:");
    expect(gauss).toContain("Topic 8.6: Gauss's law");
    expect(gauss).toContain("gauss-law-without-symmetry");
    expect(gauss).not.toContain("buoyancy-depends-on-object-weight"); // Physics 1's unit 8
    // 9.4 is an AP Physics 2 topic only; 8.6 is not an AP Physics 1 topic.
    expect(() => buildGeneratorPrompt("9.4", 1, undefined, "physics-c-em")).toThrow(
      /Unknown AP topic/,
    );
    expect(() => buildGeneratorPrompt("8.6", 1)).toThrow(/Unknown AP topic/);
    const p2 = generatorSystemInstruction("physics-2");
    expect(p2).toContain("You write AP Physics 2 homework problems");
    expect(p2).toContain("no calculus");
    const mech = generatorSystemInstruction("physics-c-mech");
    expect(mech).toContain("You write AP Physics C: Mechanics homework problems");
    expect(mech).toContain("calculus-based");
    expect(mech).not.toContain("no calculus");
    expect(mech).toContain("Never use LaTeX");
    expect(solverSystemInstruction("physics-c-mech")).toContain("AP Physics C: Mechanics problem");
    // Same output format for every course.
    for (const text of [p2, mech]) expect(text).toContain('Return ONLY JSON: {"problems"');
  });

  test("the prompt takes the topic and the tags from the course", () => {
    const p2 = buildGeneratorPrompt("9.2", 2, "hard", "physics-2");
    expect(p2).toContain("Write 2 AP Physics 2 problems");
    expect(p2).toContain("Unit 9: Thermodynamics. Topic 9.2: The ideal gas law");
    expect(p2).toContain("celsius-as-absolute");
    expect(p2).not.toContain("force-implies-motion");
    const mech = buildGeneratorPrompt("1.2", 1, undefined, "physics-c-mech");
    expect(mech).toContain("Write 1 AP Physics C: Mechanics problem:");
    expect(mech).toContain("Topic 1.2: Displacement, velocity and acceleration");
    expect(mech).toContain("constant-acceleration-assumed");
    expect(mech).toContain("velocity-acceleration-confusion");
    // 9.2 is not an AP Physics 1 topic, and 8.1 is not a C: Mechanics one.
    expect(() => buildGeneratorPrompt("9.2", 1)).toThrow(/Unknown AP topic/);
    expect(() => buildGeneratorPrompt("8.1", 1, undefined, "physics-c-mech")).toThrow();
  });

  test("generateProblems sends the course's instructions and validates against its topics", async () => {
    const seen: string[] = [];
    const call: ModelCall = async (r) => {
      seen.push(r.systemInstruction);
      if (r.systemInstruction.startsWith("You write"))
        return {
          text: JSON.stringify({
            problems: [
              {
                text: "A 12 V battery is connected across a 4.0 ohm resistor. Find the current in the resistor.",
                type: "numeric",
                correctAnswer: "3.0 A",
                solution: "I = V/R = 12 V / 4.0 ohm = 3.0 A.",
                distractors: [{ answer: "48 A", misconception: "voltage-current-confusion" }],
                difficulty: "easy",
              },
            ],
          }),
        };
      return { text: JSON.stringify({ reasoning: "I = V/R", answer: "3.0 A" }) };
    };
    const [draft] = await generateProblems(
      { apTopic: "11.3", count: 1, apCourse: "physics-2" },
      call,
    );
    expect(draft.errors).toEqual([]);
    expect(draft.problem?.apTopic).toBe("11.3");
    expect(draft.problem?.distractors).toEqual([
      { answer: "48 A", misconception: "voltage-current-confusion" },
    ]);
    expect(draft.check?.agrees).toBe(true);
    expect(seen).toEqual([
      generatorSystemInstruction("physics-2"),
      solverSystemInstruction("physics-2"),
    ]);
    await expect(generateProblems({ apTopic: "11.3", count: 1 }, call)).rejects.toThrow(
      /Unknown AP topic/,
    );
  });

  test("a draft is checked against its own course: topics and misconception tags", () => {
    const base = {
      text: "A 12 V battery is connected across a 4.0 ohm resistor. Find the current in the resistor.",
      type: "numeric",
      correctAnswer: "3.0 A",
      solution: "I = V/R = 12 V / 4.0 ohm = 3.0 A.",
      difficulty: "easy",
    };
    const ok = validateDraftProblem(
      { ...base, distractors: [{ answer: "48 A", misconception: "voltage-current-confusion" }] },
      "11.3",
      "physics-2",
    );
    expect(ok.errors).toEqual([]);
    expect(ok.warnings).toEqual([]);
    expect(validateDraftProblem(base, "11.3").errors).toContain("Unknown AP topic 11.3");
    expect(validateDraftProblem(base, "11.3", "physics-c-mech").errors).toContain(
      "Unknown AP topic 11.3",
    );
    // A mechanics-only tag on a circuits problem, and a circuits tag from the wrong unit.
    const off = validateDraftProblem(
      {
        ...base,
        distractors: [
          { answer: "48 A", misconception: "force-implies-motion" },
          { answer: "0.33 A", misconception: "heat-temperature-confusion" },
        ],
      },
      "11.3",
      "physics-2",
    );
    expect(off.problem?.distractors).toHaveLength(2);
    expect(off.warnings).toEqual([
      '"force-implies-motion" is not usually a Unit 11 misconception; check it fits',
      '"heat-temperature-confusion" is not usually a Unit 11 misconception; check it fits',
    ]);
    // The same topic id in two courses: "2.5" passes in both, with each course's tags.
    const mech = validateDraftProblem(
      {
        ...base,
        distractors: [{ answer: "48 A", misconception: "constant-acceleration-assumed" }],
      },
      "2.5",
      "physics-c-mech",
    );
    expect(mech.warnings).toEqual([]);
    const p1 = validateDraftProblem(
      {
        ...base,
        distractors: [{ answer: "48 A", misconception: "constant-acceleration-assumed" }],
      },
      "2.5",
    );
    expect(p1.warnings).toHaveLength(1);
  });

  test("drafts stored before there were courses are AP Physics 1", () => {
    expect(draftCourse({})).toBe("physics-1");
    expect(draftCourse(undefined)).toBe("physics-1");
    expect(draftCourse({ course: "physics-c-mech" })).toBe("physics-c-mech");
    expect(draftCourse({ course: "chemistry" })).toBe("physics-1");
  });
});

describe("request schemas and pickers", () => {
  test("generate: the course is optional and topics may have two-digit units", () => {
    expect(contentGenerateBody.safeParse({ apTopic: "4.2", count: 3 }).success).toBe(true);
    expect(
      contentGenerateBody.safeParse({ apCourse: "physics-2", apTopic: "14.8", count: 5 }).success,
    ).toBe(true);
    expect(
      contentGenerateBody.safeParse({ apCourse: "physics-c-mech", apTopic: "2.10", count: 1 })
        .success,
    ).toBe(true);
    expect(
      contentGenerateBody.safeParse({ apCourse: "physics-3", apTopic: "4.2", count: 1 }).success,
    ).toBe(false);
    expect(contentGenerateBody.safeParse({ apTopic: "4", count: 1 }).success).toBe(false);
    expect(contentGenerateBody.safeParse({ apTopic: "104.2", count: 1 }).success).toBe(false);
  });

  test("assignments: a unit must be a unit of its course (AP Physics 1 when none is sent)", () => {
    const body = { title: "T", questions: [] };
    const ok = (extra: Record<string, unknown>) =>
      createAssignmentBody.safeParse({ ...body, ...extra }).success;
    expect(ok({})).toBe(true);
    expect(ok({ apUnit: 8 })).toBe(true);
    expect(ok({ apUnit: 9 })).toBe(false);
    expect(ok({ apCourse: null, apUnit: null })).toBe(true);
    expect(ok({ apCourse: "physics-1", apUnit: 9 })).toBe(false);
    expect(ok({ apCourse: "physics-2", apUnit: 9 })).toBe(true);
    expect(ok({ apCourse: "physics-2", apUnit: 15 })).toBe(true);
    expect(ok({ apCourse: "physics-2", apUnit: 8 })).toBe(false);
    expect(ok({ apCourse: "physics-c-mech", apUnit: 7 })).toBe(true);
    expect(ok({ apCourse: "physics-c-mech", apUnit: 8 })).toBe(false);
    expect(ok({ apCourse: "physics-c-em", apUnit: 8 })).toBe(true);
    expect(ok({ apCourse: "physics-c-em", apUnit: 13 })).toBe(true);
    expect(ok({ apCourse: "physics-c-em", apUnit: 1 })).toBe(false);
    expect(ok({ apCourse: "physics-c-em", apUnit: 7 })).toBe(false);
    expect(ok({ apCourse: "physics-c-em", apUnit: 14 })).toBe(false);
    expect(ok({ apCourse: "physics-c-e-and-m", apUnit: 8 })).toBe(false);
  });

  test("picker values: AP Physics 1 keeps the bare unit number", () => {
    expect(apUnitKey("physics-1", 4)).toBe("4");
    expect(apUnitKey("physics-2", 9)).toBe("physics-2:9");
    expect(parseApUnitKey("4")).toEqual({ course: "physics-1", unit: 4 });
    expect(parseApUnitKey("physics-c-mech:2")).toEqual({ course: "physics-c-mech", unit: 2 });
    expect(parseApUnitKey("9")).toBeNull();
    expect(parseApUnitKey("physics-c-mech:8")).toBeNull();
    expect(parseApUnitKey("all")).toBeNull();
    expect(parseApUnitKey("physics-9:1")).toBeNull();
    // Units 9-13 exist in both AP Physics 2 and C: E&M; the key says which.
    expect(apUnitKey("physics-c-em", 9)).toBe("physics-c-em:9");
    expect(apUnitKey("physics-c-em", 9)).not.toBe(apUnitKey("physics-2", 9));
    expect(parseApUnitKey("physics-c-em:9")).toEqual({ course: "physics-c-em", unit: 9 });
    expect(parseApUnitKey("physics-2:9")).toEqual({ course: "physics-2", unit: 9 });
    expect(parseApUnitKey("8")).toEqual({ course: "physics-1", unit: 8 });
    expect(parseApUnitKey("physics-c-em:8")).toEqual({ course: "physics-c-em", unit: 8 });
    expect(parseApUnitKey("physics-c-em:14")).toBeNull();
    expect(parseApUnitKey("physics-c-em:1")).toBeNull();
    expect(
      new Set(AP_COURSE_IDS.flatMap((c) => apUnits(c).map((u) => apUnitKey(c, u.unit)))).size,
    ).toBe(AP_COURSE_IDS.reduce((n, c) => n + apUnits(c).length, 0));
    expect(apCourseOf(undefined)).toBe("physics-1");
    expect(apCourseOf("physics-2")).toBe("physics-2");
  });

  test("the export tool can keep to one course", () => {
    expect(
      parseArgs(["export", "--project", "p", "--out", "o", "--course", "physics-c-mech"]).course,
    ).toBe("physics-c-mech");
    expect(parseArgs(["export", "--project", "p", "--out", "o"]).course).toBeNull();
  });
});
