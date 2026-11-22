#!/usr/bin/env node
/**
 * Applies one unit's hand-written problems to the content files and the course definition.
 *
 * A unit's author writes a single delivery file (it holds answer keys: keep it out of git) and this
 * tool puts it in place, so several units can be written at once without editing the same files:
 *
 *   node tools/content-delivery.cjs ids 20                      # print 20 new draft ids
 *   node tools/content-delivery.cjs apply --file delivery.json  # idempotent; run again after edits
 *   node tools/content-delivery.cjs apply --file delivery.json --content content/x/units.json
 *
 * delivery.json:
 *   {
 *     "curriculumId": "ap-physics-1",
 *     "unit": 4,
 *     "specs":  { "<existing draft id>": { ...ProblemSpec } },        // specs for problems already there
 *     "drafts": [ { "id": "<new id>", "apTopic": "4.1", "problem": { ...DraftProblem with spec } } ],
 *     "order":  { "4A": ["<new id>", ...] },                          // appended after the set's current ids
 *     "note":   "optional text for the drafts' reviewNote"
 *   }
 *
 * apply: adds the specs, adds or replaces the new drafts (status approved, reviewKind "ai"; the
 * verifier stamps "verified"), and appends each set's new ids to its draftIds in
 * src/data/curricula/<id>.json and in the content file's own set list. Existing ids are never
 * removed or reordered. Afterwards run tools/curriculum-profile.cjs --id <id> --write and
 * tools/verify-content.cjs. docs/content-pipeline.md describes the draft and spec formats.
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..");
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function newId() {
  const bytes = crypto.randomBytes(20);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

const plainJson = (data) => JSON.stringify(data, null, 2) + "\n";

/**
 * Writes a JSON file back the way tools/verify-content.cjs does: a file that was formatted with
 * Prettier (src/data/curricula/<id>.json, short arrays on one line) is formatted with it again, so
 * a delivery only changes the lines it means to. A new or plain two-space file stays plain. `raw`
 * is the file's text before the change (undefined for a new file); an unchanged file is not written.
 */
function writeJson(file, data, raw) {
  const text = plainJson(data);
  const wasPlain = raw === undefined || raw === plainJson(JSON.parse(raw));
  if (wasPlain && text === raw) return;
  if (!wasPlain && JSON.stringify(JSON.parse(raw)) === JSON.stringify(data)) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  if (wasPlain) return;
  try {
    const prettier = require.resolve("prettier/bin/prettier.cjs");
    require("node:child_process").execFileSync(
      process.execPath,
      // content/ is git-ignored, and Prettier skips ignored files unless told otherwise
      [
        prettier,
        "--ignore-path",
        require("node:os").devNull,
        "--log-level",
        "silent",
        "--write",
        file,
      ],
      { stdio: "ignore" },
    );
  } catch {
    // Plain JSON is still correct; only the layout differs.
  }
}

/** The text of a file, or undefined when there is none. */
const rawText = (file) => (fs.existsSync(file) ? fs.readFileSync(file, "utf8") : undefined);

/** The content files of a course, read from src/data/curricula/content-files.ts without compiling it. */
function contentFiles(curriculumId) {
  const dir = path.join(ROOT, "content", curriculumId);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => path.join(dir, f));
}

/**
 * @param {object} delivery parsed delivery file
 * @param {{ content?: string, now?: Date, root?: string }} [options]
 * @returns {{ file: string, specs: number, drafts: number, appended: Record<string, number> }}
 */
function applyDelivery(delivery, options = {}) {
  const root = options.root ?? ROOT;
  const now = (options.now ?? new Date()).toISOString();
  const { curriculumId, unit } = delivery;
  const curriculumFile = path.join(root, "src", "data", "curricula", `${curriculumId}.json`);
  if (!curriculumId || !fs.existsSync(curriculumFile))
    throw new Error(`Unknown curriculumId "${curriculumId}"`);
  if (!Number.isInteger(unit)) throw new Error("delivery.unit must be a whole number");
  const curriculumRaw = rawText(curriculumFile);
  const curriculum = JSON.parse(curriculumRaw);
  const sets = curriculum.sets.filter((s) => s.unit === unit);
  if (!sets.length) throw new Error(`${curriculumId} has no sets in unit ${unit}`);

  const files = options.content
    ? [path.resolve(root, options.content)]
    : contentFiles(curriculumId).map((f) => path.resolve(root, path.relative(ROOT, f)));
  const loaded = files.map((file) => {
    const raw = rawText(file);
    return { file, raw, data: raw ? JSON.parse(raw) : { exportedAt: now, count: 0, drafts: [] } };
  });
  if (!loaded.length) throw new Error(`No content file for ${curriculumId}; pass --content`);
  const unitIds = new Set(sets.flatMap((s) => s.draftIds));
  // The file that already holds this unit's problems, else the first (or the one named).
  const target =
    loaded.find((l) => l.data.drafts.some((d) => unitIds.has(d.id) || d.apUnit === unit)) ??
    loaded[0];
  const everyDraft = new Map(loaded.flatMap((l) => l.data.drafts.map((d) => [d.id, d])));
  const courseKey =
    delivery.course ??
    [...everyDraft.values()].find((d) => d.course)?.course ??
    String(curriculum.apCourse).replace(/^physics(c?)-?/, (_, c) =>
      c ? "physics-c-" : "physics-",
    );

  // Specs for problems that are already there.
  let specs = 0;
  for (const [id, spec] of Object.entries(delivery.specs ?? {})) {
    const draft = everyDraft.get(id);
    if (!draft) throw new Error(`specs: no draft ${id}`);
    if (!unitIds.has(id)) throw new Error(`specs: draft ${id} is not in unit ${unit}`);
    draft.problem.spec = spec;
    specs++;
  }

  // New problems.
  const topics = new Set(sets.flatMap((s) => s.topics));
  const incoming = delivery.drafts ?? [];
  const seen = new Set();
  for (const d of incoming) {
    if (!/^[A-Za-z0-9]{20}$/.test(d.id ?? "")) throw new Error(`drafts: bad id "${d.id}"`);
    if (seen.has(d.id)) throw new Error(`drafts: id ${d.id} twice`);
    seen.add(d.id);
    if (!d.problem || typeof d.problem.text !== "string")
      throw new Error(`drafts: ${d.id} has no problem`);
    const topic = d.apTopic ?? d.problem.apTopic;
    if (!topics.has(topic))
      throw new Error(`drafts: ${d.id} topic ${topic} is not in unit ${unit}`);
    const existing = everyDraft.get(d.id);
    if (existing && !String(existing.batchId ?? "").startsWith("ce-"))
      throw new Error(`drafts: ${d.id} is an existing reviewed problem; use "specs" for it`);
    const record = {
      id: d.id,
      course: courseKey,
      apUnit: unit,
      apTopic: topic,
      status: "approved",
      reviewKind: "ai",
      reviewNote:
        delivery.note ??
        "AI-written (Claude), not generated by the pipeline. Written with a machine-checkable spec. Awaits blind solves; a person still needs to check it.",
      edited: false,
      problem: { ...d.problem, apTopic: topic },
      original: null,
      check: null,
      warnings: [],
      errors: [],
      batchId: `ce-${curriculumId}-unit${unit}`,
      createdAt: existing?.createdAt ?? now,
      reviewedAt: now,
    };
    if (existing) {
      const home = loaded.find((l) => l.data.drafts.includes(existing));
      home.data.drafts[home.data.drafts.indexOf(existing)] = record;
    } else target.data.drafts.push(record);
    everyDraft.set(d.id, record);
  }

  // Set order: new ids go after what the set already has; nothing is removed or reordered.
  const appended = {};
  const placed = new Set();
  for (const [key, ids] of Object.entries(delivery.order ?? {})) {
    const set = sets.find((s) => s.key === key);
    if (!set) throw new Error(`order: no set ${key} in unit ${unit}`);
    const fresh = ids.filter((id) => !set.draftIds.includes(id));
    for (const id of ids) {
      if (!seen.has(id) && !set.draftIds.includes(id))
        throw new Error(`order: ${id} in ${key} is not a delivered draft`);
      if (placed.has(id)) throw new Error(`order: ${id} is in two sets`);
      placed.add(id);
      const draft = everyDraft.get(id);
      if (!set.topics.includes(draft.apTopic))
        throw new Error(`order: ${id} (topic ${draft.apTopic}) does not belong in ${key}`);
    }
    set.draftIds.push(...fresh);
    if (set.draftIds.length > 10) throw new Error(`order: ${key} would have more than 10 problems`);
    appended[key] = fresh.length;
    // The content file keeps its own copy of the set list, when it has one.
    for (const l of loaded) {
      const own = (l.data.sets ?? []).find(
        (s) => Array.isArray(s.draftIds) && s.draftIds.some((id) => set.draftIds.includes(id)),
      );
      if (own) own.draftIds = [...set.draftIds];
    }
  }
  for (const id of seen)
    if (!sets.some((s) => s.draftIds.includes(id)))
      throw new Error(`drafts: ${id} is not placed in a set (see "order")`);

  for (const l of loaded) {
    if ("count" in l.data) l.data.count = l.data.drafts.length;
    writeJson(l.file, l.data, l.raw);
  }
  writeJson(curriculumFile, curriculum, curriculumRaw);
  return {
    file: path.relative(root, target.file),
    specs,
    drafts: incoming.length,
    appended,
  };
}

function main(argv, out = console) {
  const [command, ...rest] = argv;
  if (command === "ids") {
    if (rest[0] !== undefined && !/^\d+$/.test(rest[0])) {
      out.error(`ids needs a whole number of ids to print (1 to 200), not "${rest[0]}": ids 20`);
      return 1;
    }
    const n = Math.max(1, Math.min(200, Number(rest[0]) || 1));
    for (let i = 0; i < n; i++) out.log(newId());
    return 0;
  }
  if (command === "apply") {
    const arg = (name) => {
      const i = rest.indexOf(name);
      return i >= 0 ? rest[i + 1] : undefined;
    };
    const file = arg("--file");
    if (!file) {
      out.error("apply needs --file <delivery.json>");
      return 1;
    }
    try {
      const result = applyDelivery(readJson(path.resolve(file)), { content: arg("--content") });
      out.log(
        `Applied to ${result.file}: ${result.specs} specs, ${result.drafts} new drafts, appended ${
          Object.entries(result.appended)
            .map(([k, n]) => `${k}+${n}`)
            .join(" ") || "nothing"
        }`,
      );
      return 0;
    } catch (e) {
      out.error(e.message);
      return 1;
    }
  }
  out.error(
    "Usage: content-delivery.cjs ids <n> | apply --file <delivery.json> [--content <file>]",
  );
  return 1;
}

module.exports = { applyDelivery, newId, main };

if (require.main === module) process.exitCode = main(process.argv.slice(2));
