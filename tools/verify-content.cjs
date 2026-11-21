#!/usr/bin/env node
/**
 * The answer-key verifier for the reviewed problems in content/<curriculumId>/*.json. It runs the
 * checks of src/lib/content/verify.ts on every draft and reports which keys are proven, which are
 * contradicted and which still lack evidence. Reads and writes only repo files, never Firestore.
 *
 *   node tools/verify-content.cjs --all                      # every course; exits 1 if any draft fails
 *   node tools/verify-content.cjs --course ap-physics-2      # one course (curriculum id or AP course id)
 *   node tools/verify-content.cjs --set ap-physics-2:9A      # one set
 *   node tools/verify-content.cjs --id <draftId>[,<draftId>] # single drafts
 *   ... --verbose          # a row for every draft, not only the ones that need attention
 *   ... --strict           # also exit 1 for drafts that are incomplete (no spec, too few blind solves)
 *   ... --report json      # the full result as JSON on stdout instead of the table
 *   ... --write            # stamp `verification` and reviewKind "verified" on every draft that passed
 *                          # everything, and take the mark off drafts that no longer do
 *
 * Blind solves (a solver must be given the sheet and nothing else: no key, no solution):
 *   node tools/verify-content.cjs solve-sheet --solver <name> --set ap-physics-2:9A --out sheet.json
 *   node tools/verify-content.cjs record-solve --solver <name> --file answers.json
 *   node tools/verify-content.cjs record-solve --solver <name> --id <draftId> --answer "2.4 m/s"
 * answers.json is [{ "id": "<draftId>", "answer": "..." }] or { "<draftId>": "..." }. For multiple
 * choice the answer is the option's text or the letter on that solver's sheet (each solver sees the
 * options in a different order). An answer is stored with the hash of the text it was given for and
 * stops counting when the problem changes.
 *
 * Specs:
 *   node tools/verify-content.cjs apply-specs --file specs.json
 * specs.json is { "<draftId>": { "spec": {...}, "originalSpec": {...} } } (or the spec itself as the
 * value). `spec` goes on the draft's problem; `originalSpec`, the spec of the question as the model
 * first wrote it, goes on `original` and is only used by the regression corpus.
 *
 * Regression corpus (tests/fixtures/verifier-corpus.json; ids and pass/fail only, no problem text):
 *   node tools/verify-content.cjs corpus            # check: exits 1 if the committed file is stale
 *   node tools/verify-content.cjs corpus --write    # rewrite it
 *
 * docs/content-pipeline.md describes the spec format and every check.
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const CORPUS_FILE = path.join("tests", "fixtures", "verifier-corpus.json");

/**
 * The checks are TypeScript shared with the app. Under jest they load through ts-jest; run directly,
 * this compiles them in memory with the repo's own TypeScript and resolves the "@/" alias.
 */
function registerTypeScript() {
  if (process.env.JEST_WORKER_ID || registerTypeScript.done) return;
  registerTypeScript.done = true;
  const Module = require("node:module");
  const ts = require("typescript");
  const resolveFilename = Module._resolveFilename;
  Module._resolveFilename = function (request, ...rest) {
    const mapped = request.startsWith("@/") ? path.join(ROOT, "src", request.slice(2)) : request;
    return resolveFilename.call(this, mapped, ...rest);
  };
  Module._extensions[".ts"] = (module, filename) => {
    const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      fileName: filename,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
        resolveJsonModule: true,
      },
    });
    module._compile(outputText, filename);
  };
}

function verifier() {
  registerTypeScript();
  return require("../src/lib/content/verify");
}

const COMMANDS = ["verify", "solve-sheet", "record-solve", "apply-specs", "corpus"];

function parseArgs(argv) {
  const out = {
    command: "verify",
    all: false,
    course: null,
    set: null,
    ids: [],
    write: false,
    strict: false,
    verbose: false,
    report: "table",
    solver: null,
    file: null,
    answer: null,
    out: null,
  };
  const rest = [...argv];
  if (rest[0] && !rest[0].startsWith("--")) {
    out.command = rest.shift();
    if (!COMMANDS.includes(out.command))
      throw new Error(`Unknown command ${out.command} (one of: ${COMMANDS.join(", ")})`);
  }
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    const next = () => {
      const v = rest[++i];
      if (v === undefined || v.startsWith("--")) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === "--all") out.all = true;
    else if (a === "--course") out.course = next();
    else if (a === "--set") out.set = next();
    else if (a === "--id") out.ids.push(...next().split(",").filter(Boolean));
    else if (a === "--write") out.write = true;
    else if (a === "--strict") out.strict = true;
    else if (a === "--verbose") out.verbose = true;
    else if (a === "--report") out.report = next();
    else if (a === "--solver") out.solver = next();
    else if (a === "--file") out.file = next();
    else if (a === "--answer") out.answer = rest[++i];
    else if (a === "--out") out.out = next();
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!["table", "json"].includes(out.report)) throw new Error("--report must be json or table");
  const selects = out.all || out.course || out.set || out.ids.length;
  if (["verify", "solve-sheet"].includes(out.command) && !selects)
    throw new Error(
      "Say what to check: --all, --course <id>, --set <course>:<key> or --id <draftId>",
    );
  if (["solve-sheet", "record-solve"].includes(out.command) && !out.solver)
    throw new Error(`${out.command} needs --solver <name>`);
  if (out.command === "record-solve" && !out.file && !(out.ids.length === 1 && out.answer != null))
    throw new Error("record-solve needs --file <answers.json>, or --id <draftId> --answer <text>");
  if (out.command === "apply-specs" && !out.file)
    throw new Error("apply-specs needs --file <specs.json>");
  if (out.write && !["verify", "corpus"].includes(out.command))
    throw new Error("--write only applies to verify and corpus");
  return out;
}

/**
 * Every content file of every course folder, with each draft's course and set looked up in the
 * course definitions (src/data/curricula/<id>.json).
 * @returns {{ files: { file: string, data: any }[], entries: { draft: any, file: string, curriculumId: string, setKey: string | null }[] }}
 */
function loadContent(root = ROOT) {
  const contentDir = path.join(root, "content");
  const files = [];
  const entries = [];
  if (!fs.existsSync(contentDir)) return { files, entries };
  for (const curriculumId of fs.readdirSync(contentDir).sort()) {
    const dir = path.join(contentDir, curriculumId);
    if (!fs.statSync(dir).isDirectory()) continue;
    const setOf = new Map();
    const definition = path.join(root, "src", "data", "curricula", `${curriculumId}.json`);
    if (fs.existsSync(definition))
      for (const set of JSON.parse(fs.readFileSync(definition, "utf8")).sets ?? [])
        for (const id of set.draftIds ?? []) setOf.set(id, set.key);
    for (const name of fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .sort()) {
      const file = path.join("content", curriculumId, name);
      const raw = fs.readFileSync(path.join(root, file), "utf8");
      const data = JSON.parse(raw);
      if (!Array.isArray(data.drafts)) continue;
      files.push({ file, data, raw });
      for (const draft of data.drafts)
        entries.push({ draft, file, curriculumId, setKey: setOf.get(draft.id) ?? null });
    }
  }
  return { files, entries };
}

const plainJson = (data) => JSON.stringify(data, null, 2) + "\n";

/**
 * Writes back the files that changed. A file that was formatted with Prettier (short arrays on one
 * line) is formatted with it again, so a change shows up as a small diff; without Prettier it is
 * left as plain two-space JSON.
 */
function saveContent(files, root = ROOT) {
  for (const { file, data, raw } of files) {
    const text = plainJson(data);
    const wasPlain = raw === undefined || raw === plainJson(JSON.parse(raw));
    if (wasPlain && text === raw) continue;
    if (!wasPlain && JSON.stringify(JSON.parse(raw)) === JSON.stringify(data)) continue;
    const target = path.join(root, file);
    fs.writeFileSync(target, text);
    if (wasPlain) continue;
    try {
      const prettier = require.resolve("prettier/bin/prettier.cjs");
      require("node:child_process").execFileSync(
        process.execPath,
        [
          prettier,
          "--ignore-path",
          require("node:os").devNull,
          "--log-level",
          "silent",
          "--write",
          target,
        ],
        { stdio: "ignore" },
      );
    } catch {
      // Plain JSON is still correct; only the layout differs.
    }
  }
}

/** The entries an invocation names. Throws when a filter matches nothing, so a typo is not a clean run. */
function select(entries, opts) {
  let chosen = entries;
  if (opts.course)
    chosen = chosen.filter(
      (e) =>
        e.curriculumId === opts.course ||
        e.draft.course === opts.course ||
        `ap-${e.draft.course}` === opts.course,
    );
  if (opts.set) {
    const [curriculumId, key] = opts.set.includes(":") ? opts.set.split(":") : [null, opts.set];
    chosen = chosen.filter(
      (e) => e.setKey === key && (!curriculumId || e.curriculumId === curriculumId),
    );
  }
  if (opts.ids && opts.ids.length) {
    chosen = chosen.filter((e) => opts.ids.includes(e.draft.id));
    const missing = opts.ids.filter((id) => !chosen.some((e) => e.draft.id === id));
    if (missing.length) throw new Error(`No such draft: ${missing.join(", ")}`);
  }
  if (!chosen.length) throw new Error("Nothing matches that selection");
  return chosen;
}

/** The other drafts of the same set (all of `entries`, not only the selection). */
function siblingsOf(entry, entries) {
  if (!entry.setKey) return [];
  return entries
    .filter(
      (e) => e !== entry && e.curriculumId === entry.curriculumId && e.setKey === entry.setKey,
    )
    .map((e) => e.draft);
}

/**
 * Verifies the chosen entries. With `write`, stamps the passing drafts in place (the caller saves).
 * @returns {{ rows: object[], summary: object, changed: number }}
 */
function runVerify(entries, chosen, opts = {}) {
  const { verifyProblem } = verifier();
  const now = opts.now ?? new Date().toISOString();
  const rows = [];
  let changed = 0;
  for (const entry of chosen) {
    const { draft } = entry;
    // Stamping starts from the content alone: an earlier stamp is replaced, not consulted.
    const subject = opts.write ? { ...draft, verification: null } : draft;
    const result = verifyProblem(subject, draft.solves ?? [], {
      siblings: siblingsOf(entry, entries),
      now,
    });
    const marked = draft.reviewKind === "verified";
    let action = null;
    if (opts.write && result.verdict === "verified") {
      draft.verification = result.verification;
      draft.reviewKind = "verified";
      action = marked ? "re-stamped" : "stamped";
      changed++;
    } else if (opts.write && marked) {
      // No longer proven: back to what it was before the verifier, an AI-reviewed draft.
      delete draft.verification;
      draft.reviewKind = "ai";
      action = "mark removed";
      changed++;
    }
    rows.push({
      id: draft.id,
      course: entry.curriculumId,
      set: entry.setKey,
      topic: draft.apTopic,
      type: draft.problem?.type ?? null,
      reviewKind: draft.reviewKind ?? null,
      verdict: result.verdict,
      basis: result.verification.checks.basis?.detail ?? null,
      failed: result.failed,
      missing: result.missing,
      checks: result.verification.checks,
      solvers: result.verification.solvers.map((s) => ({ id: s.id, agrees: s.agrees })),
      ...(action ? { action } : {}),
    });
  }
  const count = (verdict) => rows.filter((r) => r.verdict === verdict).length;
  const summary = {
    drafts: rows.length,
    verified: count("verified"),
    failed: count("failed"),
    incomplete: count("incomplete"),
    withSpec: chosen.filter((e) => e.draft.problem?.spec).length,
    solverAgreementOnly: rows.filter((r) => r.basis === "solver-agreement-only").length,
    missing: {},
    failedChecks: {},
  };
  for (const r of rows) {
    for (const m of r.missing) summary.missing[m] = (summary.missing[m] ?? 0) + 1;
    for (const f of r.failed) summary.failedChecks[f] = (summary.failedChecks[f] ?? 0) + 1;
  }
  return { rows, summary, changed };
}

/** The table printed for a run: failures in full, the rest one line each (or only counted). */
function formatTable(rows, summary, opts = {}) {
  const lines = [];
  const pad = (s, n) => String(s ?? "").padEnd(n);
  const head = `${pad("draft", 22)}${pad("set", 6)}${pad("type", 9)}${pad("verdict", 12)}checks`;
  const line = (r) => {
    const marks = Object.entries(r.checks)
      .filter(([name]) => name !== "basis")
      .map(([name, c]) => `${c.pass ? "ok" : r.missing.includes(name) ? "--" : "FAIL"} ${name}`)
      .join(", ");
    return `${pad(r.id, 22)}${pad(r.set, 6)}${pad(r.type === "multiple-choice" ? "mc" : r.type, 9)}${pad(r.verdict, 12)}${marks}`;
  };
  const showAll = opts.verbose || rows.length <= 40;
  const shown = rows.filter((r) => showAll || r.verdict === "failed" || r.action);
  if (shown.length) lines.push(head);
  for (const r of shown) {
    lines.push(line(r) + (r.action ? `  [${r.action}]` : ""));
    for (const name of r.failed) lines.push(`    ${name}: ${r.checks[name].detail ?? "failed"}`);
  }
  if (shown.length) lines.push("");
  lines.push(
    `${summary.drafts} drafts: ${summary.verified} verified, ${summary.failed} failed, ${summary.incomplete} incomplete` +
      ` (${summary.withSpec} have a spec; ${summary.solverAgreementOnly} multiple choice rest on solver agreement only)`,
  );
  const tally = (o) =>
    Object.entries(o)
      .map(([k, n]) => `${k} ${n}`)
      .join(", ");
  if (summary.failed) lines.push(`Failed checks: ${tally(summary.failedChecks)}`);
  if (summary.incomplete) lines.push(`Evidence still missing: ${tally(summary.missing)}`);
  return lines.join("\n");
}

/** The sheet a blind solver gets for the chosen drafts: questions and shuffled options only. */
function solveSheet(chosen, solver) {
  const { solveSheetEntry } = verifier();
  return {
    solver,
    instructions:
      "Solve each problem independently. Numeric: answer with a number and its unit. Multiple choice: answer with the letter (A is the first option listed here) or the option's text.",
    problems: chosen.filter((e) => e.draft.problem).map((e) => solveSheetEntry(e.draft, solver)),
  };
}

/**
 * Stores a solver's answers on the drafts (in place; the caller saves).
 * @param {{ id: string, answer: string, textHash?: string }[]} answers
 * @returns {{ recorded: string[], rejected: { id: string, reason: string }[] }}
 */
function recordSolves(entries, solver, answers, now = new Date().toISOString()) {
  const { contentHash, resolveSolverAnswer } = verifier();
  const byId = new Map(entries.map((e) => [e.draft.id, e.draft]));
  const recorded = [];
  const rejected = [];
  for (const a of answers) {
    const draft = byId.get(a.id);
    if (!draft || !draft.problem) {
      rejected.push({ id: a.id, reason: "no such draft" });
      continue;
    }
    const textHash = contentHash(draft.problem);
    if (a.textHash && a.textHash !== textHash) {
      rejected.push({ id: a.id, reason: "the problem changed after the sheet was made" });
      continue;
    }
    const answer = resolveSolverAnswer(draft, solver, a.answer);
    if (!answer) {
      rejected.push({ id: a.id, reason: "the answer names no option" });
      continue;
    }
    draft.solves = [
      ...(draft.solves ?? []).filter((s) => s.id !== solver),
      { id: solver, answer, textHash, recordedAt: now },
    ];
    recorded.push(a.id);
  }
  return { recorded, rejected };
}

function readAnswers(file) {
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.answers)) return raw.answers;
  return Object.entries(raw).map(([id, answer]) => ({ id, answer }));
}

/** Puts specs from a { draftId: spec | { spec, originalSpec } } map on the drafts (in place). */
function applySpecs(entries, specs) {
  const byId = new Map(entries.map((e) => [e.draft.id, e.draft]));
  const applied = [];
  for (const [id, value] of Object.entries(specs)) {
    const draft = byId.get(id);
    if (!draft || !draft.problem) throw new Error(`No such draft: ${id}`);
    const wrapped = value && (value.spec !== undefined || value.originalSpec !== undefined);
    const spec = wrapped ? value.spec : value;
    if (spec === null) delete draft.problem.spec;
    else if (spec !== undefined) draft.problem.spec = spec;
    if (wrapped && value.originalSpec !== undefined) {
      if (!draft.original || typeof draft.original !== "object")
        throw new Error(`Draft ${id} has no original to put a spec on`);
      draft.original.spec = value.originalSpec;
    }
    applied.push(id);
  }
  return applied;
}

const WRONG_KEY_NOTE = /WRONG KEY/i;

/**
 * The regression corpus: the deterministic checks run on every problem whose review note records a
 * wrong key, once as fixed and once as the model first wrote it, and on every other problem that
 * has a spec (the controls). Ids, check names and pass/fail only; no text, keys or details.
 */
function buildCorpus(entries) {
  const { deterministicChecks } = verifier();
  const outcomes = (draft, entry) =>
    Object.fromEntries(
      Object.entries(deterministicChecks(draft, { siblings: siblingsOf(entry, entries) })).map(
        ([name, c]) => [name, c.pass ? "pass" : c.missing ? "missing" : "fail"],
      ),
    );
  const sorted = [...entries].sort((a, b) => a.draft.id.localeCompare(b.draft.id));
  const wrongKeys = [];
  const controls = [];
  for (const entry of sorted) {
    const { draft } = entry;
    if (!draft.problem) continue;
    const wrong = WRONG_KEY_NOTE.test(draft.reviewNote ?? "");
    if (!wrong) {
      if (draft.problem.spec)
        controls.push({
          id: draft.id,
          course: entry.curriculumId,
          type: draft.problem.type,
          checks: outcomes(draft, entry),
        });
      continue;
    }
    const o = draft.original && typeof draft.original === "object" ? draft.original : {};
    const first = {
      ...draft,
      verification: null,
      problem: {
        ...draft.problem,
        ...Object.fromEntries(
          ["text", "options", "correctAnswer", "solution", "distractors"]
            .filter((k) => o[k] !== undefined && o[k] !== null)
            .map((k) => [k, o[k]]),
        ),
        ...(o.spec ? { spec: o.spec } : {}),
      },
    };
    const fixed = outcomes(draft, entry);
    const original = outcomes(first, entry);
    const caughtBy = Object.keys(original).filter((k) => original[k] === "fail");
    wrongKeys.push({
      id: draft.id,
      course: entry.curriculumId,
      type: draft.problem.type,
      basis: draft.problem.spec ? "spec" : "solver-agreement-only",
      // The fix changed the question (or its options) as well as, or instead of, the key.
      questionChanged:
        (o.text ?? draft.problem.text) !== draft.problem.text ||
        JSON.stringify(o.options ?? draft.problem.options ?? null) !==
          JSON.stringify(draft.problem.options ?? null),
      fixed,
      original,
      caughtBy,
    });
  }
  const proven = (w) => w.caughtBy.includes("recompute") || w.caughtBy.includes("mc-quantity");
  return {
    about:
      "Regression corpus of the answer-key verifier. Written by `node tools/verify-content.cjs corpus --write` from the private content files; holds draft ids and check outcomes only. fixed = the problem as corrected in review; original = as the model first wrote it, wrong key included.",
    summary: {
      wrongKeys: wrongKeys.length,
      caughtByRecomputation: wrongKeys.filter(proven).length,
      caughtByAnotherCheckOnly: wrongKeys.filter((w) => !proven(w) && w.caughtBy.length).length,
      notCaughtDeterministically: wrongKeys.filter((w) => !w.caughtBy.length).length,
      withoutSpec: wrongKeys.filter((w) => w.basis !== "spec").length,
      fixedPassing: wrongKeys.filter((w) => Object.values(w.fixed).every((v) => v === "pass"))
        .length,
      controls: controls.length,
      controlsPassing: controls.filter((c) => Object.values(c.checks).every((v) => v === "pass"))
        .length,
    },
    wrongKeys,
    controls,
  };
}

function main(argv) {
  const opts = parseArgs(argv);
  const { files, entries } = loadContent();
  if (!entries.length)
    throw new Error("No content files here (content/ is private and not in the repository)");

  if (opts.command === "corpus") {
    const built = buildCorpus(entries);
    const target = path.join(ROOT, CORPUS_FILE);
    if (opts.write) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, plainJson(built));
      console.log(`Wrote ${CORPUS_FILE}`);
      return 0;
    }
    // Compared as data, so reformatting the committed file does not make it stale.
    const current = fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, "utf8")) : null;
    console.log(JSON.stringify(built.summary, null, 2));
    if (JSON.stringify(current) !== JSON.stringify(built)) {
      console.error(`${CORPUS_FILE} is stale: run node tools/verify-content.cjs corpus --write`);
      return 1;
    }
    return 0;
  }

  if (opts.command === "apply-specs") {
    const applied = applySpecs(entries, JSON.parse(fs.readFileSync(opts.file, "utf8")));
    saveContent(files);
    console.log(`Applied ${applied.length} specs`);
    return 0;
  }

  if (opts.command === "record-solve") {
    const answers = opts.file ? readAnswers(opts.file) : [{ id: opts.ids[0], answer: opts.answer }];
    const { recorded, rejected } = recordSolves(entries, opts.solver, answers);
    if (recorded.length) saveContent(files);
    console.log(`Recorded ${recorded.length} answers from ${opts.solver}`);
    for (const r of rejected) console.error(`  not recorded: ${r.id} (${r.reason})`);
    return rejected.length ? 1 : 0;
  }

  const chosen = select(entries, opts);
  if (opts.command === "solve-sheet") {
    const sheet = JSON.stringify(solveSheet(chosen, opts.solver), null, 2) + "\n";
    if (opts.out) {
      fs.writeFileSync(opts.out, sheet);
      console.log(`Wrote ${chosen.length} problems to ${opts.out}`);
    } else process.stdout.write(sheet);
    return 0;
  }

  const { rows, summary, changed } = runVerify(entries, chosen, opts);
  if (opts.write && changed) saveContent(files);
  if (opts.report === "json") console.log(JSON.stringify({ summary, drafts: rows }, null, 2));
  else {
    console.log(formatTable(rows, summary, opts));
    if (opts.write) console.log(`${changed} drafts changed in the content files`);
  }
  return summary.failed || (opts.strict && summary.incomplete) ? 1 : 0;
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}

module.exports = {
  parseArgs,
  loadContent,
  saveContent,
  select,
  runVerify,
  formatTable,
  solveSheet,
  recordSolves,
  applySpecs,
  buildCorpus,
  CORPUS_FILE,
};
