import {
  MISCONCEPTION_TAGS,
  misconceptionPromptList,
  normaliseMisconceptions,
} from "../functions/src/misconceptions";
import {
  buildMisconceptionEvents,
  eventId,
  recordMisconceptionEvents,
} from "../functions/src/misconception-events";
import { checkChoice, checkNumeric, gradeSubmissionAnswers } from "../functions/src/grading-core";
import { GRADER_SYSTEM_INSTRUCTION } from "../functions/src/grading-schema";
import { mergeAnswerKey, splitAssignmentQuestions } from "../src/lib/assignment-security";
import { stripAnswerKey } from "../src/lib/answer-key-access";

describe("misconception tag list", () => {
  test("ids are unique kebab-case and every tag has a label, description and valid units", () => {
    const ids = MISCONCEPTION_TAGS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of MISCONCEPTION_TAGS) {
      expect(t.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(t.label.length).toBeGreaterThan(3);
      expect(t.description.length).toBeGreaterThan(10);
      for (const u of t.units) expect(u >= 1 && u <= 8).toBe(true);
    }
  });

  test("every tag id is unique kebab-case, with a non-empty label and description of its own", () => {
    const ids = MISCONCEPTION_TAGS.map((t) => t.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
    const labels = MISCONCEPTION_TAGS.map((t) => t.label.trim().toLowerCase());
    expect(labels.filter((l, i) => labels.indexOf(l) !== i)).toEqual([]);
    for (const t of MISCONCEPTION_TAGS) {
      expect([t.id, /^[a-z0-9]+(-[a-z0-9]+)*$/.test(t.id)]).toEqual([t.id, true]);
      expect([t.id, t.label.trim().length > 0, t.label === t.label.trim()]).toEqual([
        t.id,
        true,
        true,
      ]);
      expect([t.id, t.description.trim().length > 0, t.description === t.description.trim()]).toEqual(
        [t.id, true, true],
      );
      expect([t.id, ["conceptual", "procedural"].includes(t.category)]).toEqual([t.id, true]);
    }
  });

  test("every AP Physics 1 unit has at least two conceptual tags", () => {
    for (let unit = 1; unit <= 8; unit++) {
      const n = MISCONCEPTION_TAGS.filter(
        (t) => t.category === "conceptual" && t.units.includes(unit),
      ).length;
      expect(n).toBeGreaterThanOrEqual(2);
    }
  });

  test("the grading prompt lists the conceptual tags but not the checker's own slips", () => {
    const list = misconceptionPromptList();
    expect(list).toContain("force-implies-motion");
    expect(list).not.toContain("sign-error:");
    expect(list).not.toMatch(/^- other:/m);
    expect(GRADER_SYSTEM_INSTRUCTION).toContain("- third-law-unequal-forces:");
  });
});

describe("normaliseMisconceptions", () => {
  test("keeps known ids, dedupes, and accepts spacing, case and prefixes", () => {
    expect(
      normaliseMisconceptions([
        "force-implies-motion",
        "Force Implies Motion",
        "tag: mass_weight_confusion",
        "`heavier-falls-faster`",
      ]).tags,
    ).toEqual(["force-implies-motion", "mass-weight-confusion", "heavier-falls-faster"]);
  });

  test("legacy free text maps to a tag when we know the phrase", () => {
    expect(normaliseMisconceptions(["Confusing mass with weight"]).tags).toEqual([
      "mass-weight-confusion",
    ]);
  });

  test("unknown text becomes a single 'other' with short notes", () => {
    const r = normaliseMisconceptions([
      "thinks magnets pull on aluminium",
      "believes air pushes objects down",
      "x".repeat(500),
      "fourth",
      42,
      "",
    ]);
    expect(r.tags).toEqual(["other"]);
    expect(r.notes).toHaveLength(3);
    expect(r.notes[2]).toHaveLength(160);
  });

  test("empty and missing input", () => {
    expect(normaliseMisconceptions(undefined)).toEqual({ tags: [], notes: [] });
    expect(normaliseMisconceptions([])).toEqual({ tags: [], notes: [] });
  });
});

describe("distractors", () => {
  const mc = {
    id: "q1",
    text: "A ball is thrown up. At the top, its acceleration is",
    type: "multiple-choice",
    options: ["zero", "g downward", "g upward"],
    correctAnswer: "g downward",
    distractors: [
      { answer: "zero", misconception: "velocity-acceleration-confusion" },
      { answer: "C", misconception: "force-implies-motion" },
      { answer: "g downward", misconception: "not-a-real-tag" },
    ],
  };

  test("a wrong MC option tags its misconception (by text or letter)", () => {
    expect(checkChoice("zero", mc).misconceptions).toEqual(["velocity-acceleration-confusion"]);
    expect(checkChoice("g upward", mc).misconceptions).toEqual(["force-implies-motion"]);
    expect(checkChoice("g downward", mc)).toMatchObject({ fraction: 1, misconceptions: [] });
  });

  const numeric = {
    id: "q2",
    text: "Two carts collide and stick. Find the final speed.",
    type: "numeric",
    correctAnswer: "2 m/s",
    distractors: [
      { answer: "4 m/s", misconception: "momentum-kinetic-energy-confusion" },
      { answer: "-2 m/s", misconception: "momentum-not-vector" },
    ],
  };

  test("a numeric common wrong answer tags its misconception, in any unit, before generic slips", () => {
    expect(checkNumeric("4 m/s", numeric)).toMatchObject({
      fraction: 0,
      misconceptions: ["momentum-kinetic-energy-confusion"],
    });
    expect(checkNumeric("14.4 km/h", numeric)?.misconceptions).toEqual([
      "momentum-kinetic-energy-confusion",
    ]);
    // The teacher's tag wins over the generic sign-error hint.
    expect(checkNumeric("-2 m/s", numeric)?.misconceptions).toEqual(["momentum-not-vector"]);
    expect(checkNumeric("2.0 m/s", numeric)?.fraction).toBe(1);
    expect(checkNumeric("7 m/s", numeric)?.misconceptions).toEqual([]);
  });

  test("distractor feedback does not reveal the key", () => {
    const fb = checkNumeric("4 m/s", numeric)!.feedback;
    expect(fb).not.toContain("2");
  });

  test("distractors move into the answer key and never reach a non-owner", () => {
    const { publicQuestions, distractors } = splitAssignmentQuestions([
      {
        id: "q2",
        text: numeric.text,
        type: "numeric",
        correctAnswer: "2 m/s",
        distractors: numeric.distractors,
      },
      { id: "q3", text: "Plain", type: "text", correctAnswer: "x" },
    ]);
    expect(publicQuestions[0]).not.toHaveProperty("distractors");
    expect(distractors).toEqual({ q2: numeric.distractors });
    const merged = mergeAnswerKey(
      { questions: publicQuestions },
      { answers: { q2: "2 m/s" }, distractors },
    );
    expect(merged.questions[0].distractors).toEqual(numeric.distractors);
    expect(merged.questions[1]).not.toHaveProperty("distractors");
    expect(stripAnswerKey(merged).questions).toEqual([
      expect.not.objectContaining({ distractors: expect.anything() }),
      expect.anything(),
    ]);
  });

  test("malformed distractors are rejected at create time", () => {
    for (const bad of [
      "zero",
      [{ answer: "zero" }],
      [{ answer: "zero", misconception: "made-up" }],
      [{ answer: "", misconception: "other" }],
      Array.from({ length: 11 }, () => ({ answer: "a", misconception: "other" })),
    ]) {
      expect(() =>
        splitAssignmentQuestions([{ id: "q", text: "t", correctAnswer: "a", distractors: bad }]),
      ).toThrow("Invalid distractors");
    }
  });
});

describe("AI misconceptions are normalised in the grading core", () => {
  test("ids kept, free text becomes other + note", async () => {
    const r = await gradeSubmissionAnswers(
      [{ id: "q1", text: "Explain why the cart keeps moving.", type: "text", points: 10 }],
      [{ questionId: "q1", answer: "the force of the push stays with it" }],
      {
        aiGrader: async () => ({
          score: 2,
          feedback: "Think about what acts after the push.",
          reasoning: "",
          misconceptions: ["impetus-force", "thinks friction is a kind of energy"],
        }),
      },
    );
    expect(r.answers[0]).toMatchObject({
      misconceptions: ["impetus-force", "other"],
      misconceptionNotes: ["thinks friction is a kind of energy"],
    });
  });
});

describe("misconception events", () => {
  const assignment = {
    title: "Momentum HW",
    teacherId: "t1",
    organizationId: "org1",
    courseId: "c1",
    apUnit: 4,
    apTopics: ["4.2", "4.3"],
    questions: [{ id: "q1", apTopic: "4.3" }, { id: "q2" }],
  };
  const answers = [
    {
      questionId: "q1",
      score: 0,
      maxPoints: 10,
      method: "numeric",
      misconceptions: ["momentum-not-vector"],
    },
    {
      questionId: "q2",
      score: 5,
      maxPoints: 10,
      method: "ai",
      misconceptions: ["other", "impulse-force-confusion", "other", "bogus"],
      misconceptionNotes: ["odd idea"],
    },
    { questionId: "q3", misconceptions: "not-an-array" },
  ];
  const now = new Date("2026-11-24T12:00:00Z");

  test("one event per (question, tag), with AP topic from the question else the assignment unit", () => {
    const events = buildMisconceptionEvents({
      submissionId: "s1",
      studentId: "st1",
      assignmentId: "a1",
      assignment,
      answers,
      final: true,
      now,
    });
    expect(events.map((e) => [e.questionId, e.tag, e.apTopic, e.apUnit, e.scoreFraction])).toEqual([
      ["q1", "momentum-not-vector", "4.3", 4, 0],
      ["q2", "other", null, 4, 0.5],
      ["q2", "impulse-force-confusion", null, 4, 0.5],
    ]);
    expect(events[1]).toMatchObject({
      note: "odd idea",
      teacherId: "t1",
      organizationId: "org1",
      courseId: "c1",
      assignmentTitle: "Momentum HW",
      final: true,
      createdAt: now,
    });
    expect(events[0].note).toBeNull();
  });

  test("single-topic assignment gives every question its topic; no AP info gives nulls", () => {
    const one = buildMisconceptionEvents({
      submissionId: "s1",
      studentId: "st1",
      assignmentId: "a1",
      assignment: { ...assignment, apUnit: undefined, apTopics: ["2.5"], questions: [] },
      answers: [answers[0]],
      final: false,
    });
    expect(one[0]).toMatchObject({ apTopic: "2.5", apUnit: 2, final: false });
    const none = buildMisconceptionEvents({
      submissionId: "s1",
      studentId: "st1",
      assignmentId: "a1",
      assignment: { teacherId: "t1" },
      answers: [answers[0]],
      final: true,
    });
    expect(none[0]).toMatchObject({
      apTopic: null,
      apUnit: null,
      courseId: null,
      organizationId: null,
    });
  });

  test("event ids are deterministic and path-safe", () => {
    expect(eventId({ submissionId: "s/1", questionId: "q1", tag: "other" })).toBe("s_1__q1__other");
  });

  function fakeDb(existing: string[] = []) {
    const docs = new Map<string, unknown>(existing.map((id) => [id, { submissionId: "s1" }]));
    const ops: string[] = [];
    const col = {
      doc: (id: string) => ({ id, path: id }),
      where: () => ({
        get: async () => ({
          docs: [...docs.keys()].map((id) => ({ id, ref: { id, path: id } })),
        }),
      }),
    };
    const db = {
      collection: () => col,
      batch: () => {
        const pending: (() => void)[] = [];
        return {
          set: (ref: { id: string }, data: unknown) =>
            pending.push(() => {
              ops.push(`set ${ref.id}`);
              docs.set(ref.id, data);
            }),
          delete: (ref: { id: string }) =>
            pending.push(() => {
              ops.push(`delete ${ref.id}`);
              docs.delete(ref.id);
            }),
          commit: async () => pending.forEach((f) => f()),
        };
      },
    };
    return { db: db as never, docs, ops };
  }

  test("record replaces stale events for the submission and writes the new ones", async () => {
    const { db, docs, ops } = fakeDb(["s1__q9__other", "s1__q1__momentum-not-vector"]);
    const n = await recordMisconceptionEvents(db, {
      submissionId: "s1",
      studentId: "st1",
      assignmentId: "a1",
      assignment,
      answers: [answers[0]],
      final: true,
    });
    expect(n).toBe(1);
    expect(ops).toEqual(["delete s1__q9__other", "set s1__q1__momentum-not-vector"]);
    expect([...docs.keys()]).toEqual(["s1__q1__momentum-not-vector"]);
  });

  test("record never throws; errors go to onError", async () => {
    const onError = jest.fn();
    const db = {
      collection: () => ({
        where: () => ({ get: async () => Promise.reject(new Error("down")) }),
      }),
    } as never;
    await expect(
      recordMisconceptionEvents(
        db,
        {
          submissionId: "s1",
          studentId: "st1",
          assignmentId: "a1",
          assignment,
          answers,
          final: true,
        },
        onError,
      ),
    ).resolves.toBe(0);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "down" }));
  });
});
