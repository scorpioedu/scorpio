// tools/content-drafts.cjs: moving reviewed drafts between projects through the repo file.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { parseArgs, toRecord, toImportDoc } = require("../tools/content-drafts.cjs");
import file from "../content/ap-physics-1/units-4-6.json";
import { validateDraftProblem } from "../src/lib/content/problem-format";

describe("content-drafts tool", () => {
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
    const doc = toImportDoc({ ...file.drafts[0], status: "published" }, now);
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

describe("Units 4–6 content file", () => {
  test("60 AI-reviewed problems in 12 sets of 5, one AP unit per set, every draft in exactly one set", () => {
    expect(file.drafts).toHaveLength(60);
    expect(file.sets).toHaveLength(12);
    const ids = file.sets.flatMap((s) => s.draftIds);
    expect(new Set(ids).size).toBe(60);
    expect(new Set(ids)).toEqual(new Set(file.drafts.map((d) => d.id)));
    const unit = Object.fromEntries(file.drafts.map((d) => [d.id, d.apUnit]));
    for (const s of file.sets) {
      expect(s.draftIds).toHaveLength(5);
      expect(new Set(s.draftIds.map((id) => unit[id])).size).toBe(1);
    }
    expect(file.drafts.every((d) => d.reviewKind === "ai")).toBe(true);
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
