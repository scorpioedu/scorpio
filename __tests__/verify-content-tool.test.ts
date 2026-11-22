// tools/verify-content.cjs: the command line around src/lib/content/verify.ts. The first part runs
// on made-up content in a temporary folder; the last part runs the real tool on the private content
// files where they exist (tests/helpers/course-content.ts).
import { execFileSync, spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { describeWithContent } from "../tests/helpers/course-content";
import { contentHash, shuffledOptions, verificationIsCurrent } from "../src/lib/content/verify";
import corpus from "../tests/fixtures/verifier-corpus.json";
import { CURRICULA } from "../src/data/curricula";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const tool = require("../tools/verify-content.cjs");

const ROOT = path.join(__dirname, "..");

const cart = {
  text: "A 2.0 kg cart moving at 3.0 m/s collides with and sticks to a 1.0 kg cart at rest. Find their final speed.",
  type: "numeric",
  correctAnswer: "2.0 m/s",
  solution: "Momentum is conserved: (2.0)(3.0) = (3.0)v, so v = 2.0 m/s.",
  distractors: [{ answer: "3.0 m/s", misconception: "momentum-not-vector" }],
  difficulty: "easy",
  points: 10,
  apTopic: "4.3",
};
const cartSpec = {
  givens: {
    m1: { value: 2.0, unit: "kg" },
    v: { value: 3.0, unit: "m/s" },
    m2: { value: 1.0, unit: "kg" },
  },
  expr: "m1*v/(m1 + m2)",
  unit: "m/s",
};
const truck = {
  text: "A truck collides head-on with a small car. Compare the forces each exerts on the other during the collision.",
  type: "multiple-choice",
  options: [
    "The truck's force is larger",
    "The car's force is larger",
    "They are equal in size",
    "It depends on speed",
  ],
  correctAnswer: "They are equal in size",
  solution: "Newton's third law: the forces form an interaction pair, so they are equal in size.",
  distractors: [],
  difficulty: "medium",
  points: 10,
  apTopic: "4.1",
};
const draft = (id: string, problem: object, extra: object = {}) => ({
  id,
  course: "physics-1",
  apUnit: 4,
  apTopic: (problem as { apTopic: string }).apTopic,
  status: "approved",
  reviewKind: "ai",
  reviewNote: "AI review",
  problem,
  original: null,
  ...extra,
});

let root: string;
const contentFile = () => path.join(root, "content", "ap-physics-1", "units.json");
const readDrafts = () => JSON.parse(fs.readFileSync(contentFile(), "utf8")).drafts;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "verify-content-"));
  fs.mkdirSync(path.join(root, "content", "ap-physics-1"), { recursive: true });
  fs.mkdirSync(path.join(root, "content", "ap-physics-2"), { recursive: true });
  fs.mkdirSync(path.join(root, "src", "data", "curricula"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "src", "data", "curricula", "ap-physics-1.json"),
    JSON.stringify({
      id: "ap-physics-1",
      sets: [
        { key: "4A", draftIds: ["cart", "truck"] },
        { key: "4B", draftIds: ["wrong"] },
      ],
    }),
  );
  fs.writeFileSync(
    contentFile(),
    JSON.stringify(
      {
        drafts: [
          draft("cart", { ...cart, spec: cartSpec }),
          draft("truck", truck),
          draft(
            "wrong",
            { ...cart, correctAnswer: "3.5 m/s", spec: cartSpec, distractors: [] },
            {
              reviewNote: "AI review. WRONG KEY: keyed 3.5 m/s.",
            },
          ),
        ],
      },
      null,
      2,
    ) + "\n",
  );
  // A second course folder, a review log beside the JSON, and a JSON file that is not a draft file.
  fs.writeFileSync(
    path.join(root, "content", "ap-physics-2", "units.json"),
    JSON.stringify({
      drafts: [draft("gas", { ...cart, apTopic: "9.1" }, { course: "physics-2", apTopic: "9.1" })],
    }),
  );
  fs.writeFileSync(path.join(root, "content", "ap-physics-2", "review.md"), "notes");
  fs.writeFileSync(path.join(root, "content", "ap-physics-2", "sets.json"), "[]");
  fs.writeFileSync(path.join(root, "content", "README.txt"), "private");
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("parseArgs", () => {
  test("verify is the default command and needs a selection", () => {
    expect(tool.parseArgs(["--all"])).toMatchObject({
      command: "verify",
      all: true,
      write: false,
      report: "table",
    });
    expect(
      tool.parseArgs(["--course", "ap-physics-2", "--write", "--strict", "--verbose"]),
    ).toMatchObject({
      course: "ap-physics-2",
      write: true,
      strict: true,
      verbose: true,
    });
    expect(tool.parseArgs(["--set", "ap-physics-1:4A", "--report", "json"])).toMatchObject({
      set: "ap-physics-1:4A",
      report: "json",
    });
    expect(tool.parseArgs(["--id", "a,b", "--id", "c"]).ids).toEqual(["a", "b", "c"]);
    expect(() => tool.parseArgs([])).toThrow(/Say what to check/);
    expect(() => tool.parseArgs(["--strict"])).toThrow(/Say what to check/);
    expect(() => tool.parseArgs(["--all", "--report", "xml"])).toThrow(/json or table/);
    expect(() => tool.parseArgs(["--all", "--bogus"])).toThrow(/Unknown argument/);
    expect(() => tool.parseArgs(["--course"])).toThrow(/needs a value/);
    expect(() => tool.parseArgs(["--course", "--all"])).toThrow(/needs a value/);
    expect(() => tool.parseArgs(["publish", "--all"])).toThrow(/Unknown command publish/);
  });

  test("the other commands check what they need", () => {
    expect(
      tool.parseArgs(["solve-sheet", "--solver", "s1", "--all", "--out", "x.json"]),
    ).toMatchObject({
      command: "solve-sheet",
      solver: "s1",
      out: "x.json",
    });
    expect(() => tool.parseArgs(["solve-sheet", "--all"])).toThrow(/needs --solver/);
    expect(() => tool.parseArgs(["solve-sheet", "--solver", "s1"])).toThrow(/Say what to check/);
    expect(tool.parseArgs(["record-solve", "--solver", "s1", "--file", "a.json"]).file).toBe(
      "a.json",
    );
    expect(
      tool.parseArgs(["record-solve", "--solver", "s1", "--id", "d", "--answer", "-3 m"]),
    ).toMatchObject({
      ids: ["d"],
      answer: "-3 m",
    });
    expect(() => tool.parseArgs(["record-solve", "--solver", "s1"])).toThrow(/--file/);
    expect(() => tool.parseArgs(["record-solve", "--solver", "s1", "--id", "d"])).toThrow(/--file/);
    expect(() => tool.parseArgs(["record-solve", "--file", "a.json"])).toThrow(/needs --solver/);
    expect(() => tool.parseArgs(["apply-specs"])).toThrow(/--file/);
    expect(() => tool.parseArgs(["apply-specs", "--file", "s.json", "--write"])).toThrow(
      /--write only/,
    );
    expect(tool.parseArgs(["corpus", "--write"])).toMatchObject({ command: "corpus", write: true });
  });
});

describe("loading and selecting", () => {
  test("every course folder is read, with each draft's set from the course definition", () => {
    const { files, entries } = tool.loadContent(root);
    expect(files.map((f: { file: string }) => f.file)).toEqual([
      path.join("content", "ap-physics-1", "units.json"),
      path.join("content", "ap-physics-2", "units.json"),
    ]);
    expect(
      entries.map((e: { draft: { id: string }; curriculumId: string; setKey: string }) => [
        e.draft.id,
        e.curriculumId,
        e.setKey,
      ]),
    ).toEqual([
      ["cart", "ap-physics-1", "4A"],
      ["truck", "ap-physics-1", "4A"],
      ["wrong", "ap-physics-1", "4B"],
      ["gas", "ap-physics-2", null],
    ]);
    expect(tool.loadContent(path.join(root, "nowhere"))).toEqual({ files: [], entries: [] });
  });

  test("--course takes either id; --set and --id narrow; a selection of nothing is an error", () => {
    const { entries } = tool.loadContent(root);
    const ids = (opts: object) =>
      tool.select(entries, opts).map((e: { draft: { id: string } }) => e.draft.id);
    expect(ids({ all: true })).toEqual(["cart", "truck", "wrong", "gas"]);
    expect(ids({ course: "ap-physics-2" })).toEqual(["gas"]);
    expect(ids({ course: "physics-2" })).toEqual(["gas"]);
    expect(ids({ set: "ap-physics-1:4A" })).toEqual(["cart", "truck"]);
    expect(ids({ set: "4B" })).toEqual(["wrong"]);
    expect(ids({ ids: ["truck", "gas"] })).toEqual(["truck", "gas"]);
    expect(ids({ course: "ap-physics-1", ids: ["truck"] })).toEqual(["truck"]);
    expect(() => ids({ set: "ap-physics-2:4A" })).toThrow(/Nothing matches/);
    expect(() => ids({ course: "ap-physics-9" })).toThrow(/Nothing matches/);
    expect(() => ids({ ids: ["truck", "nope"] })).toThrow(/No such draft: nope/);
  });
});

describe("verifying", () => {
  const run = (opts: object = {}) => {
    const { files, entries } = tool.loadContent(root);
    const result = tool.runVerify(entries, tool.select(entries, { all: true }), {
      now: "2026-11-21T00:00:00.000Z",
      ...opts,
    });
    return { files, entries, ...result };
  };
  const solveAll = () => {
    const { files, entries } = tool.loadContent(root);
    for (const solver of ["s1", "s2"])
      tool.recordSolves(entries, solver, [
        { id: "cart", answer: "2.0 m/s" },
        { id: "truck", answer: "They are equal in size" },
        { id: "wrong", answer: "2.0 m/s" },
        { id: "gas", answer: "2.0 m/s" },
      ]);
    tool.saveContent(files, root);
  };

  test("without blind solves: the wrong key fails, the rest are incomplete, nothing is verified", () => {
    const { rows, summary } = run();
    expect(rows.map((r: { id: string; verdict: string }) => [r.id, r.verdict])).toEqual([
      ["cart", "incomplete"],
      ["truck", "incomplete"],
      ["wrong", "failed"],
      ["gas", "incomplete"],
    ]);
    expect(summary).toEqual({
      drafts: 4,
      verified: 0,
      failed: 1,
      incomplete: 3,
      withSpec: 2,
      solverAgreementOnly: 1,
      missing: { "blind-solves": 4, recompute: 1 },
      failedChecks: { recompute: 1, "solution-consistent": 1 },
    });
    expect(rows[2]).toMatchObject({
      set: "4B",
      course: "ap-physics-1",
      type: "numeric",
      basis: "spec",
    });
    expect(rows[1].basis).toBe("solver-agreement-only");
  });

  test("the table names each failed check and counts what is missing", () => {
    const { rows, summary } = run();
    const table = tool.formatTable(rows, summary);
    expect(table).toMatch(/^draft +set +type +verdict +checks$/m);
    expect(table).toMatch(
      /^wrong +4B +numeric +failed +FAIL recompute, ok spec-matches-text, FAIL solution-consistent/m,
    );
    expect(table).toMatch(
      /^ {4}recompute: The spec gives 2 m\/s; the key "3.5 m\/s" is 75% away$/m,
    );
    expect(table).toMatch(
      /^truck +4A +mc +incomplete +ok solution-consistent, ok grader-round-trip, ok near-duplicate, -- blind-solves, ok not-stale$/m,
    );
    expect(table).toMatch(
      /4 drafts: 0 verified, 1 failed, 3 incomplete \(2 have a spec; 1 multiple choice rest on solver agreement only\)/,
    );
    expect(table).toMatch(/Failed checks: recompute 1, solution-consistent 1/);
    expect(table).toMatch(/Evidence still missing: blind-solves 4, recompute 1/);
    // More than 40 rows: only the failures are listed unless --verbose.
    const many = Array.from({ length: 41 }, (_, i) => ({ ...rows[i % 4], id: `d${i}` }));
    const short = tool.formatTable(many, summary);
    expect(short).toMatch(/^d2 /m);
    expect(short).not.toMatch(/^d1 /m);
    expect(tool.formatTable(many, summary, { verbose: true })).toMatch(/^d1 /m);
    expect(
      tool.formatTable([], {
        drafts: 0,
        verified: 0,
        failed: 0,
        incomplete: 0,
        withSpec: 0,
        solverAgreementOnly: 0,
        missing: {},
        failedChecks: {},
      }),
    ).toBe(
      "0 drafts: 0 verified, 0 failed, 0 incomplete (0 have a spec; 0 multiple choice rest on solver agreement only)",
    );
  });

  test("solve sheets hide the key; recorded answers are bound to the text they were given for", () => {
    const { files, entries } = tool.loadContent(root);
    const sheet = tool.solveSheet(tool.select(entries, { set: "4A" }), "s1");
    expect(sheet.solver).toBe("s1");
    expect(sheet.problems).toEqual([
      {
        id: "cart",
        type: "numeric",
        text: cart.text,
        textHash: contentHash({ ...cart, spec: cartSpec } as never),
      },
      {
        id: "truck",
        type: "multiple-choice",
        text: truck.text,
        options: shuffledOptions(truck.options, "s1", "truck"),
        textHash: contentHash(truck as never),
      },
    ]);
    expect(JSON.stringify(sheet)).not.toMatch(
      /Momentum|interaction pair|correctAnswer|solution|misconception/,
    );

    const letter = "ABCD"[sheet.problems[1].options.indexOf("They are equal in size")];
    const result = tool.recordSolves(
      entries,
      "s1",
      [
        { id: "cart", answer: "2.0 m/s", textHash: sheet.problems[0].textHash },
        { id: "truck", answer: letter, textHash: sheet.problems[1].textHash },
        { id: "wrong", answer: "2.0 m/s", textHash: "an-older-hash" },
        { id: "gas", answer: "" },
        { id: "nope", answer: "1" },
      ],
      "2026-11-21T00:00:00.000Z",
    );
    expect(result.recorded).toEqual(["cart", "truck"]);
    expect(result.rejected).toEqual([
      { id: "wrong", reason: "the problem changed after the sheet was made" },
      { id: "gas", reason: "the answer names no option" },
      { id: "nope", reason: "no such draft" },
    ]);
    // A second answer from the same solver replaces the first.
    tool.recordSolves(
      entries,
      "s1",
      [{ id: "cart", answer: "2.00 m/s" }],
      "2026-11-22T00:00:00.000Z",
    );
    tool.saveContent(files, root);
    const [savedCart, savedTruck, savedWrong] = readDrafts();
    expect(savedCart.solves).toEqual([
      {
        id: "s1",
        answer: "2.00 m/s",
        textHash: sheet.problems[0].textHash,
        recordedAt: "2026-11-22T00:00:00.000Z",
      },
    ]);
    expect(savedTruck.solves).toEqual([
      {
        id: "s1",
        answer: "They are equal in size",
        textHash: sheet.problems[1].textHash,
        recordedAt: "2026-11-21T00:00:00.000Z",
      },
    ]);
    expect(savedWrong.solves).toBeUndefined();
  });

  test("--write stamps only what passed everything, and a later edit takes the mark off again", () => {
    solveAll();
    const dry = run();
    expect(dry.rows.map((r: { verdict: string }) => r.verdict)).toEqual([
      "verified",
      "verified",
      "failed",
      "incomplete",
    ]);
    expect(dry.changed).toBe(0);
    expect(readDrafts().every((d: { reviewKind: string }) => d.reviewKind === "ai")).toBe(true);

    const written = run({ write: true });
    expect(written.changed).toBe(2);
    expect(written.rows.map((r: { action?: string }) => r.action)).toEqual([
      "stamped",
      "stamped",
      undefined,
      undefined,
    ]);
    tool.saveContent(written.files, root);
    const [c, t, w] = readDrafts();
    expect([c.reviewKind, t.reviewKind, w.reviewKind]).toEqual(["verified", "verified", "ai"]);
    expect(c.verification).toMatchObject({
      textHash: contentHash(c.problem),
      verifiedAt: "2026-11-21T00:00:00.000Z",
      solvers: [
        { id: "s1", answer: "2.0 m/s", agrees: true },
        { id: "s2", answer: "2.0 m/s", agrees: true },
      ],
    });
    expect(c.verification.checks.basis.detail).toBe("spec");
    expect(t.verification.checks.basis.detail).toBe("solver-agreement-only");
    expect(verificationIsCurrent(c)).toBe(true);
    expect(verificationIsCurrent(t)).toBe(true);
    expect(w.verification).toBeUndefined();
    // The wrong key stays unverified although both solvers were recorded for it: they disagree with it.
    expect(written.rows[2].solvers).toEqual([
      { id: "s1", agrees: false },
      { id: "s2", agrees: false },
    ]);

    // Stamping again changes nothing but the record's time.
    const again = run({ write: true, now: "2026-11-23T00:00:00.000Z" });
    expect(again.rows[0].action).toBe("re-stamped");

    // Edit the verified cart's key: a plain run now fails on staleness and on the key itself...
    const file = JSON.parse(fs.readFileSync(contentFile(), "utf8"));
    file.drafts[0].problem.correctAnswer = "2.5 m/s";
    fs.writeFileSync(contentFile(), JSON.stringify(file, null, 2) + "\n");
    expect(verificationIsCurrent(readDrafts()[0])).toBe(false);
    const stale = run();
    expect(stale.rows[0]).toMatchObject({ verdict: "failed", reviewKind: "verified" });
    expect(stale.rows[0].failed).toEqual(["recompute", "solution-consistent", "not-stale"]);
    // ...and --write takes the mark off.
    const cleaned = run({ write: true });
    expect(cleaned.rows[0]).toMatchObject({ action: "mark removed", reviewKind: "ai" });
    tool.saveContent(cleaned.files, root);
    expect(readDrafts()[0].reviewKind).toBe("ai");
    expect(readDrafts()[0].verification).toBeUndefined();
    expect(readDrafts()[1].reviewKind).toBe("verified");
  });

  test("the near-duplicate check looks at the whole set even when one draft is selected", () => {
    const file = JSON.parse(fs.readFileSync(contentFile(), "utf8"));
    file.drafts[1] = { ...file.drafts[0], id: "truck" };
    fs.writeFileSync(contentFile(), JSON.stringify(file));
    const { entries } = tool.loadContent(root);
    const { rows } = tool.runVerify(entries, tool.select(entries, { ids: ["cart"] }));
    expect(rows).toHaveLength(1);
    expect(rows[0].failed).toEqual(["near-duplicate"]);
    expect(rows[0].checks["near-duplicate"].detail).toMatch(/Near-duplicate of truck/);
  });

  test("saving rewrites only files that changed and keeps plain JSON plain", () => {
    const before = fs.readFileSync(contentFile(), "utf8");
    const other = path.join(root, "content", "ap-physics-2", "units.json");
    const otherBefore = fs.readFileSync(other, "utf8");
    const { files, entries } = tool.loadContent(root);
    tool.saveContent(files, root);
    expect(fs.readFileSync(contentFile(), "utf8")).toBe(before);
    expect(fs.readFileSync(other, "utf8")).toBe(otherBefore); // compact JSON, untouched
    tool.applySpecs(entries, { truck: null });
    tool.saveContent(files, root);
    expect(fs.readFileSync(contentFile(), "utf8")).toBe(before);
  });
});

describe("apply-specs", () => {
  test("puts specs on problems and original specs on originals", () => {
    const file = JSON.parse(fs.readFileSync(contentFile(), "utf8"));
    file.drafts[2].original = { correctAnswer: "3.5 m/s" };
    fs.writeFileSync(contentFile(), JSON.stringify(file, null, 2) + "\n");
    const { files, entries } = tool.loadContent(root);
    const other = { ...cartSpec, expr: "v*m1/(m1 + m2)" };
    expect(
      tool.applySpecs(entries, {
        gas: cartSpec,
        wrong: { spec: other, originalSpec: cartSpec },
        cart: null,
      }),
    ).toEqual(["gas", "wrong", "cart"]);
    tool.saveContent(files, root);
    const [c, , w] = readDrafts();
    expect(c.problem.spec).toBeUndefined();
    expect(w.problem.spec).toEqual(other);
    expect(w.original.spec).toEqual(cartSpec);
    expect(tool.loadContent(root).entries[3].draft.problem.spec).toEqual(cartSpec);
    expect(() => tool.applySpecs(entries, { nope: cartSpec })).toThrow(/No such draft: nope/);
    expect(() => tool.applySpecs(entries, { cart: { originalSpec: cartSpec } })).toThrow(
      /no original/,
    );
  });
});

describe("corpus", () => {
  test("wrong-key drafts are checked as fixed and as first written; other drafts with a spec are controls", () => {
    const file = JSON.parse(fs.readFileSync(contentFile(), "utf8"));
    // "wrong" was fixed in review: the stored problem has the right key, `original` the model's.
    file.drafts[2].problem.correctAnswer = "2.0 m/s";
    file.drafts[2].original = { ...cart, correctAnswer: "3.5 m/s", solution: "v = 3.5 m/s." };
    file.drafts[1].reviewNote = "WRONG KEY: was the truck option.";
    file.drafts[1].original = { correctAnswer: "The truck's force is larger" };
    fs.writeFileSync(contentFile(), JSON.stringify(file));
    const built = tool.buildCorpus(tool.loadContent(root).entries);
    expect(built.summary).toEqual({
      wrongKeys: 2,
      caughtByRecomputation: 1,
      caughtByAnotherCheckOnly: 0,
      notCaughtDeterministically: 1,
      withoutSpec: 1,
      fixedPassing: 2,
      controls: 1,
      controlsPassing: 1,
    });
    expect(built.wrongKeys).toEqual([
      {
        id: "truck",
        course: "ap-physics-1",
        type: "multiple-choice",
        basis: "solver-agreement-only",
        questionChanged: false,
        fixed: {
          "solution-consistent": "pass",
          "grader-round-trip": "pass",
          "near-duplicate": "pass",
        },
        original: {
          "solution-consistent": "pass",
          "grader-round-trip": "pass",
          "near-duplicate": "pass",
        },
        caughtBy: [],
      },
      {
        id: "wrong",
        course: "ap-physics-1",
        type: "numeric",
        basis: "spec",
        questionChanged: false,
        fixed: {
          recompute: "pass",
          "spec-matches-text": "pass",
          "solution-consistent": "pass",
          "grader-round-trip": "pass",
          "near-duplicate": "pass",
        },
        original: {
          recompute: "fail",
          "spec-matches-text": "pass",
          "solution-consistent": "pass",
          "grader-round-trip": "pass",
          "near-duplicate": "pass",
        },
        caughtBy: ["recompute"],
      },
    ]);
    expect(built.controls).toEqual([
      {
        id: "cart",
        course: "ap-physics-1",
        type: "numeric",
        checks: {
          recompute: "pass",
          "spec-matches-text": "pass",
          "solution-consistent": "pass",
          "grader-round-trip": "pass",
          "near-duplicate": "pass",
        },
      },
    ]);
    // Nothing of the problems themselves is in it.
    expect(JSON.stringify(built)).not.toMatch(/cart moving|m\/s|Momentum|truck's/);
  });
});

describe("the committed corpus fixture", () => {
  const outcomes = ["pass", "fail", "missing"];
  const checkNames = [
    "recompute",
    "spec-matches-text",
    "solution-consistent",
    "grader-round-trip",
    "mc-quantity",
    "circuit-consistent",
    "near-duplicate",
  ];
  const isOutcomeMap = (o: object) =>
    Object.entries(o).every(([k, v]) => checkNames.includes(k) && outcomes.includes(v as string));

  test("holds ids, check names and outcomes only: no problem text, no keys", () => {
    expect(Object.keys(corpus).sort()).toEqual(["about", "controls", "summary", "wrongKeys"]);
    for (const w of corpus.wrongKeys) {
      expect(Object.keys(w).sort()).toEqual([
        "basis",
        "caughtBy",
        "course",
        "fixed",
        "id",
        "original",
        "questionChanged",
        "type",
      ]);
      expect(w.id).toMatch(/^[A-Za-z0-9]{20}$/);
      expect(isOutcomeMap(w.fixed) && isOutcomeMap(w.original)).toBe(true);
      expect(w.caughtBy.every((c) => checkNames.includes(c))).toBe(true);
    }
    for (const c of corpus.controls) {
      expect(Object.keys(c).sort()).toEqual(["checks", "course", "id", "type"]);
      expect(c.id).toMatch(/^[A-Za-z0-9]{20}$/);
      expect(isOutcomeMap(c.checks)).toBe(true);
    }
  });

  test("the gate's evidence: every corrected problem passes, every recomputable wrong key is caught, every control passes", () => {
    const all = (o: object) => Object.values(o).every((v) => v === "pass");
    const withSpec = corpus.wrongKeys.filter((w) => w.basis === "spec");
    const withoutSpec = corpus.wrongKeys.filter((w) => w.basis !== "spec");
    expect(corpus.wrongKeys).toHaveLength(33);
    expect(corpus.wrongKeys.every((w) => all(w.fixed))).toBe(true);
    // Every wrong key that has a spec fails recomputation as the model first wrote it.
    expect(withSpec).toHaveLength(29);
    for (const w of withSpec)
      expect([
        w.id,
        w.caughtBy.includes("recompute") || w.caughtBy.includes("mc-quantity"),
      ]).toEqual([w.id, true]);
    // The four without one are multiple choice whose options are not quantities: only blind solves can catch them.
    expect(withoutSpec.map((w) => w.type)).toEqual(Array(4).fill("multiple-choice"));
    for (const w of withoutSpec)
      expect(w.caughtBy.filter((c) => c === "recompute" || c === "mc-quantity")).toEqual([]);
    // Controls: at least 30, in all three courses, all passing.
    expect(corpus.controls.length).toBeGreaterThanOrEqual(30);
    expect(new Set(corpus.controls.map((c) => c.course))).toEqual(
      new Set(["ap-physics-1", "ap-physics-2", "ap-physics-c-mech", "ap-physics-c-em"]),
    );
    expect(corpus.controls.filter((c) => !all(c.checks)).map((c) => c.id)).toEqual([]);
    expect(corpus.summary).toMatchObject({
      wrongKeys: 33,
      caughtByRecomputation: 29,
      withoutSpec: 4,
      controls: corpus.controls.length,
      controlsPassing: corpus.controls.length,
    });
  });
});

// The real tool on the real (private) content. Runs as a child process, the way a person runs it:
// that is also what proves the tool can load the TypeScript checks outside jest.
describeWithContent("on the content files", () => {
  const env = { ...process.env };
  delete env.JEST_WORKER_ID;
  const node = (args: string[]) =>
    spawnSync(process.execPath, [path.join(ROOT, "tools", "verify-content.cjs"), ...args], {
      cwd: ROOT,
      env,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });

  test("--all finds no failed check in any course, and reads every course folder", () => {
    const run = node(["--all", "--report", "json"]);
    expect(run.stderr).toBe("");
    const report = JSON.parse(run.stdout);
    const failed = report.drafts.filter((d: { verdict: string }) => d.verdict === "failed");
    expect(failed.map((d: { id: string; failed: string[] }) => [d.id, d.failed])).toEqual([]);
    expect(run.status).toBe(0);
    expect(report.summary.drafts).toBe(
      CURRICULA.flatMap((c) => c.sets.flatMap((s) => s.draftIds)).length,
    );
    expect(new Set(report.drafts.map((d: { course: string }) => d.course))).toEqual(
      new Set(["ap-physics-1", "ap-physics-2", "ap-physics-c-mech", "ap-physics-c-em"]),
    );
    // Every draft belongs to a set of its course definition.
    expect(report.drafts.filter((d: { set: string | null }) => !d.set)).toEqual([]);
    // A stamped draft must still be entitled to its stamp.
    for (const d of report.drafts)
      if (d.reviewKind === "verified") expect([d.id, d.verdict]).toEqual([d.id, "verified"]);
  });

  test("--strict exits 1 while evidence is missing; a selection of nothing is an error", () => {
    const strict = node(["--set", "ap-physics-1:4A", "--strict"]);
    expect(strict.stdout).toMatch(/\b\d+ drafts: /);
    expect(strict.status).toBe(/ 0 incomplete/.test(strict.stdout) ? 0 : 1);
    const none = node(["--set", "ap-physics-1:nope"]);
    expect(none.status).toBe(1);
    expect(none.stderr).toMatch(/Nothing matches/);
  });

  test("the committed regression corpus is what the content files give today", () => {
    const { entries } = tool.loadContent(ROOT);
    expect(tool.buildCorpus(entries)).toEqual(corpus);
    expect(
      execFileSync(process.execPath, [path.join(ROOT, "tools", "verify-content.cjs"), "corpus"], {
        cwd: ROOT,
        env,
        encoding: "utf8",
      }),
    ).toMatch(/"wrongKeys": 33/);
  });
});
