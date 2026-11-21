// The committed guides (src/data/guides): every file passes the verifier, the loader's list matches
// the files on disk, and every worked-example answer is what its spec computes.
import fs from "fs";
import os from "os";
import {
  guideFiles,
  guideUnits,
  hasUnitGuide,
  loadUnitGuide,
  studentGuideHref,
  topicAnchor,
  topicFromAnchor,
  topicGuide,
} from "../src/lib/guides";
import { unitGuideSchema } from "../src/lib/guides/schema";
import {
  evaluate,
  fillTemplate,
  formatValue,
  placeholders,
  tryItCorners,
} from "../src/lib/guides/try-it";
import { apUnit } from "../src/data/ap";
import { getCurriculum } from "../src/data/curricula";
import { referenceEvaluator } from "../tests/helpers/guide-fixture";
import { evaluateSpec } from "../src/lib/content/spec";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const tool = require("../tools/verify-guides.cjs");
const onDisk: { curriculumId: string; unit: number; file: string }[] = tool.guideFilesOnDisk();

describe("committed guides", () => {
  test("there is at least the exemplar: AP Physics 1, unit 4", () => {
    expect(onDisk.map((f) => `${f.curriculumId}/${f.unit}`)).toContain("ap-physics-1/4");
  });

  test.each(onDisk.map((f) => [`${f.curriculumId} unit ${f.unit}`, f] as const))(
    "%s passes the verifier",
    (_name, entry) => {
      expect(tool.verifyFile(entry).errors).toEqual([]);
    },
  );

  // INTEGRATION HOOK: replace `referenceEvaluator` with `evaluateSpec` from src/lib/content/spec.ts
  // once it is in the tree. Until then a test-only arithmetic evaluator recomputes every answer.
  test.each(onDisk.map((f) => [`${f.curriculumId} unit ${f.unit}`, f] as const))(
    "%s: every worked-example answer is what its spec computes",
    (_name, entry) => {
      expect(tool.verifyFile(entry, { evaluate: evaluateSpec }).errors).toEqual([]);
      expect(tool.verifyFile(entry, { evaluate: referenceEvaluator }).errors).toEqual([]);
    },
  );

  test("the tool exits 0 for all files and 1 for a unit with no file or bad arguments", () => {
    const out = { log: jest.fn(), error: jest.fn() };
    expect(tool.main(["--all"], out)).toBe(0);
    expect(out.log).toHaveBeenCalledWith(
      expect.stringMatching(/^ok {3}src\/data\/guides\/ap-physics-1\/unit-4\.json/),
    );
    expect(out.log).toHaveBeenCalledWith(expect.stringContaining("AP Physics 2: 0 of 7 units"));
    expect(tool.main(["--course", "ap-physics-1", "--unit", "4"], out)).toBe(0);
    expect(tool.main(["--course", "ap-physics-2", "--unit", "9"], out)).toBe(1);
    expect(tool.main([], out)).toBe(1);
    expect(tool.main(["--all", "--unit", "4"], out)).toBe(1);
  });

  test("the tool fails a file that is broken or sits under the wrong name", () => {
    const dir = fs.mkdtempSync(`${os.tmpdir()}/guides-`);
    try {
      fs.mkdirSync(`${dir}/ap-physics-1`);
      const good = fs.readFileSync(onDisk.find((f) => f.unit === 4)!.file, "utf8");
      fs.writeFileSync(`${dir}/ap-physics-1/unit-5.json`, good);
      fs.writeFileSync(`${dir}/ap-physics-1/unit-6.json`, "{ not json");
      const [five, six] = tool.guideFilesOnDisk(dir);
      expect(tool.verifyFile(five).errors).toEqual(["the file is unit-5.json but says unit 4"]);
      expect(tool.verifyFile(six).errors).toEqual([expect.stringContaining("not valid JSON")]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("guide loader", () => {
  test("the registry lists exactly the files on disk", () => {
    expect(guideFiles()).toEqual(onDisk.map((f) => [f.curriculumId, f.unit]));
  });

  test("loads a unit's guide, one guide per AP topic, and null for a unit without one", async () => {
    expect(hasUnitGuide("ap-physics-1", 4)).toBe(true);
    expect(hasUnitGuide("ap-physics-1", 5)).toBe(false);
    expect(hasUnitGuide("ap-physics-2", 4)).toBe(false);
    expect(hasUnitGuide(undefined, 4)).toBe(false);
    expect(guideUnits("ap-physics-1")).toContain(4);
    expect(guideUnits("nope")).toEqual([]);

    const guide = await loadUnitGuide("ap-physics-1", 4);
    expect(unitGuideSchema.safeParse(guide).success).toBe(true);
    const topics = apUnit(4, getCurriculum("ap-physics-1")!.apCourse)!.topics.map((t) => t.id);
    expect(guide!.guides.map((g) => g.topic)).toEqual(topics);
    expect(topicGuide(guide, "4.2")?.topic).toBe("4.2");
    expect(topicGuide(guide, "5.1")).toBeUndefined();
    expect(topicGuide(null, "4.2")).toBeUndefined();
    expect(await loadUnitGuide("ap-physics-1", 5)).toBeNull();
    expect(await loadUnitGuide("nope", 4)).toBeNull();
  });

  test("topic anchors and student links", () => {
    expect(topicAnchor("4.1")).toBe("topic-4-1");
    expect(topicAnchor("12.3")).toBe("topic-12-3");
    expect(topicFromAnchor("#topic-4-1")).toBe("4.1");
    expect(topicFromAnchor("topic-12-3")).toBe("12.3");
    expect(topicFromAnchor("#set-4A")).toBeNull();
    expect(topicFromAnchor("")).toBeNull();
    expect(studentGuideHref("ap-physics-1", 4)).toBe("/student/courses/ap-physics-1/4");
    expect(studentGuideHref("ap-physics-1", 4, "4.3")).toBe(
      "/student/courses/ap-physics-1/4#topic-4-3",
    );
  });
});

describe("try-it templates", () => {
  test("evaluate: arithmetic, precedence, functions, names", () => {
    expect(evaluate("1 + 2 * 3", {})).toBe(7);
    expect(evaluate("(1 + 2) * 3", {})).toBe(9);
    expect(evaluate("-m * v^2 / 2", { m: 2, v: 3 })).toBe(-9);
    expect(evaluate("2^-1", {})).toBe(0.5);
    expect(evaluate("round(1200/mB)/10", { mB: 70 })).toBe(1.7);
    expect(evaluate("max(a, 2) + sqrt(16) + abs(-1)", { a: 1 })).toBe(7);
    expect(evaluate("2*pi", {})).toBeCloseTo(6.2832, 4);
  });

  test("evaluate refuses anything else", () => {
    expect(() => evaluate("m*", { m: 1 })).toThrow();
    expect(() => evaluate("q + 1", { m: 1 })).toThrow('unknown name "q"');
    expect(() => evaluate("process.exit(1)", {})).toThrow();
    expect(() => evaluate("alert(1)", {})).toThrow('unknown function "alert"');
    expect(() => evaluate("constructor", {})).toThrow('unknown name "constructor"');
    expect(() => evaluate("1/0", {})).toThrow("not a finite number");
    expect(() => evaluate("(1 + 2", {})).toThrow();
    expect(() => evaluate("1 2", {})).toThrow();
  });

  test("fillTemplate substitutes values a diagram can read", () => {
    expect(placeholders("seg 0,{{300/t}} {{ t }},0")).toEqual(["300/t", "t"]);
    expect(fillTemplate('seg 0,{{300/t}} {{t}},0 "{{t}} s"', { t: 0.15000000000000002 })).toBe(
      'seg 0,2000 0.15,0 "0.15 s"',
    );
    expect(formatValue(-0.0001)).toBe("0");
    expect(formatValue(1 / 3)).toBe("0.333");
    expect(() => fillTemplate("ground 0..{{w}}", {})).toThrow('unknown name "w"');
  });

  test("tryItCorners: all at min, default and max, then each parameter alone at its ends", () => {
    const params = [
      { name: "m", label: "Mass", min: 1, max: 5, step: 1, default: 2, unit: "kg" },
      { name: "v", label: "Velocity", min: -4, max: 4, step: 1, default: 3, unit: "m/s" },
    ];
    expect(tryItCorners(params)).toEqual([
      { m: 1, v: -4 },
      { m: 2, v: 3 },
      { m: 5, v: 4 },
      { m: 1, v: 3 },
      { m: 5, v: 3 },
      { m: 2, v: -4 },
      { m: 2, v: 4 },
    ]);
  });
});
