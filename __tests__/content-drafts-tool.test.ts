// tools/content-drafts.cjs: moving reviewed drafts between projects through the repo file.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { parseArgs, toRecord, toImportDoc } = require("../tools/content-drafts.cjs");
import { courseContent, describeWithContent } from "../tests/helpers/course-content";
import { validateDraftProblem } from "../src/lib/content/problem-format";

const file = courseContent("content/ap-physics-1/units-4-6.json");

describeWithContent("content-drafts tool", () => {
  test("the project is never inferred and commands are checked", () => {
    expect(() => parseArgs(["export", "--out", "x.json"])).toThrow(/--project/);
    expect(() => parseArgs(["import", "--project", "p"])).toThrow(/--file/);
    expect(() => parseArgs(["publish", "--project", "p"])).toThrow(/export or import/);
    expect(parseArgs(["import", "--project", "p", "--file", "f.json"])).toMatchObject({
      apply: false,
    });
    expect(parseArgs(["export", "--project", "p", "--out", "o", "--units", "4,5"]).units).toEqual([
      4, 5,
    ]);
  });

  test("import writes approved, unpublished, unassigned drafts and keeps the AI-review mark", () => {
    const now = new Date("2026-12-01T00:00:00Z");
    const doc = toImportDoc({ ...file.drafts[0], status: "published", reviewKind: "ai" }, now);
    expect(doc).toMatchObject({
      status: "approved",
      assignmentId: null,
      reviewKind: "ai",
      importedAt: now,
    });
    expect(doc.reviewNote).toMatch(/a person still needs to check/);
    expect(() => toImportDoc({ ...file.drafts[0], status: "draft" }, now)).toThrow(/only reviewed/);
    expect(() => toImportDoc({ ...file.drafts[0], problem: null }, now)).toThrow(/no problem/);
  });

  test("export records keep the problem and turn timestamps into strings", () => {
    const ts = { toDate: () => new Date("2026-11-16T10:00:00Z") };
    const r = toRecord("d1", {
      apUnit: 4,
      apTopic: "4.1",
      status: "approved",
      problem: {},
      createdAt: ts,
    });
    expect(r).toMatchObject({ id: "d1", createdAt: "2026-11-16T10:00:00.000Z", reviewKind: null });
  });
});

// Made-up drafts, so these run without the private content files.
describe("verified drafts through export and import", () => {
  const verification = {
    textHash: "abc",
    checks: { recompute: { pass: true } },
    solvers: [{ id: "s1", answer: "2.0 m/s", agrees: true }],
    verifiedAt: "2026-11-21T00:00:00.000Z",
  };
  const solves = [{ id: "s1", answer: "2.0 m/s", textHash: "abc" }];
  const stored = {
    course: "physics-1",
    apUnit: 4,
    apTopic: "4.1",
    status: "approved",
    reviewKind: "verified",
    problem: { text: "t", spec: { givens: {}, expr: "1", unit: "" } },
    verification,
    solves,
  };

  test("the mark, the record, the solves and the spec all survive the round trip", () => {
    const record = toRecord("d1", stored);
    expect(record).toMatchObject({ reviewKind: "verified", verification, solves });
    expect(record.problem.spec).toEqual(stored.problem.spec);
    const doc = toImportDoc(record, new Date("2026-12-01T00:00:00Z"));
    expect(doc).toMatchObject({ status: "approved", reviewKind: "verified", verification, solves });
    expect(doc.problem.spec).toEqual(stored.problem.spec);
    // Accepting AI reviews does not touch a verified draft.
    expect(toImportDoc(record, new Date(), { acceptAiReview: true }).reviewKind).toBe("verified");
  });

  test("drafts without a verification get no empty fields", () => {
    const record = toRecord("d1", {
      ...stored,
      reviewKind: "ai",
      verification: undefined,
      solves: undefined,
    });
    expect("verification" in record || "solves" in record).toBe(false);
    const doc = toImportDoc(record, new Date());
    expect("verification" in doc || "solves" in doc).toBe(false);
    expect(toImportDoc(record, new Date(), { acceptAiReview: true }).reviewKind).toBe(
      "owner-accepted",
    );
  });
});

describeWithContent("Units 4–6 content file", () => {
  test("12 sets of 5 to 10 problems, one AP unit per set, every draft in exactly one set", () => {
    expect(file.sets).toHaveLength(12);
    const ids = file.sets.flatMap((s) => s.draftIds);
    expect(new Set(ids).size).toBe(ids.length);
    expect(file.drafts).toHaveLength(ids.length);
    expect(new Set(ids)).toEqual(new Set(file.drafts.map((d) => d.id)));
    const unit = Object.fromEntries(file.drafts.map((d) => [d.id, d.apUnit]));
    for (const s of file.sets) {
      expect(s.draftIds.length).toBeGreaterThanOrEqual(5);
      expect(s.draftIds.length).toBeLessThanOrEqual(10);
      expect(new Set(s.draftIds.map((id: string) => unit[id])).size).toBe(1);
    }
    // "verified" once tools/verify-content.cjs --write has stamped a draft.
    expect(file.drafts.every((d) => ["ai", "verified"].includes(d.reviewKind))).toBe(true);
  });

  test("every problem still passes the pipeline's checks with no errors", () => {
    for (const d of file.drafts) {
      const v = validateDraftProblem(d.problem, d.apTopic);
      expect({ id: d.id, errors: v.errors }).toEqual({ id: d.id, errors: [] });
    }
  });

  test("the caught wrong key stays fixed", () => {
    const disk = file.drafts.find((d) => d.id === "ihzE6jd4N6lPRtDscjtK")!;
    expect(disk.problem.correctAnswer).toBe("1");
  });
});

describeWithContent("Units 1–3, 7, 8 content file", () => {
  const rest = courseContent("content/ap-physics-1/units-1-3-7-8.json");
  type D = { id: string; apUnit: number; apTopic: string; reviewKind: string; problem: unknown };

  test("20 sets of 5 to 10 problems, one AP unit per set, every draft in exactly one set", () => {
    const drafts = rest.drafts as D[];
    expect(drafts.length).toBeGreaterThanOrEqual(100);
    expect(drafts.length).toBeLessThanOrEqual(200);
    expect(rest.sets).toHaveLength(20);
    const ids = (rest.sets as { draftIds: string[] }[]).flatMap((s) => s.draftIds);
    expect(new Set(ids)).toEqual(new Set(drafts.map((d) => d.id)));
    expect(ids).toHaveLength(drafts.length);
    expect(new Set(drafts.map((d) => d.apUnit))).toEqual(new Set([1, 2, 3, 7, 8]));
    expect(drafts.every((d) => ["ai", "verified"].includes(d.reviewKind))).toBe(true);
  });

  test("every problem passes the pipeline's checks", () => {
    for (const d of rest.drafts as D[]) {
      const v = validateDraftProblem(d.problem, d.apTopic);
      expect({ id: d.id, errors: v.errors }).toEqual({ id: d.id, errors: [] });
    }
  });

  test("the course definition uses exactly these drafts for 1A–3D and 7A–8D", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const course = require("../src/data/curricula/ap-physics-1.json");
    const inCourse = (course.sets as { unit: number; draftIds: string[] }[])
      .filter((s) => [1, 2, 3, 7, 8].includes(s.unit))
      .flatMap((s) => s.draftIds);
    expect(new Set(inCourse)).toEqual(new Set((rest.drafts as D[]).map((d) => d.id)));
  });

  test("the caught wrong key stays fixed", () => {
    const loop = (rest.drafts as (D & { problem: { correctAnswer: string } })[]).find(
      (d) => d.id === "21gN2Hr7A5JLXxtdanZu",
    )!;
    expect(loop.problem.correctAnswer).toBe("2.2 N");
  });
});
