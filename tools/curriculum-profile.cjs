#!/usr/bin/env node
/**
 * Builds the per-set profile the course unit pages show: problem count, estimated minutes, difficulty
 * mix, question types and the misconceptions the wrong answers target. Reads only repo files
 * (the course definition and the exported drafts in content/<curriculumId>/), never Firestore.
 *
 *   node tools/curriculum-profile.cjs                 # check: exits 1 if the committed file is stale
 *   node tools/curriculum-profile.cjs --write         # rewrite src/data/curricula/profiles/<id>.json
 *   node tools/curriculum-profile.cjs --id ap-physics-1 --write
 *
 * Re-run with --write after changing a set's draftIds or re-exporting drafts. `npx jest curriculum-profile`
 * fails when the committed file no longer matches.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

/** Minutes a student needs for one auto-graded problem, by type and difficulty. */
const MINUTES = {
  "multiple-choice": { easy: 1.5, medium: 2, hard: 3 },
  numeric: { easy: 2, medium: 3, hard: 4.5 },
  default: { easy: 3, medium: 4, hard: 6 },
};

function problemMinutes(problem) {
  const table = MINUTES[problem.type] ?? MINUTES.default;
  return table[problem.difficulty] ?? table.medium;
}

/**
 * @param {{ sets: { key: string, draftIds: string[] }[] }} curriculum
 * @param {Map<string, { problem: any }>} drafts by id
 * @returns {Record<string, object>} profile by set key (planned sets are left out); a set with a
 *   missing draft throws
 */
function buildProfile(curriculum, drafts) {
  const out = {};
  for (const set of curriculum.sets) {
    // A planned set (no problems written yet) has no profile.
    if (!set.draftIds.length) continue;
    const difficulty = { easy: 0, medium: 0, hard: 0 };
    const types = {};
    const tags = new Map();
    let minutes = 0;
    for (const id of set.draftIds) {
      const problem = drafts.get(id)?.problem;
      if (!problem) throw new Error(`Set ${set.key}: draft ${id} is not in the content files`);
      const level = problem.difficulty in difficulty ? problem.difficulty : "medium";
      difficulty[level] += 1;
      types[problem.type] = (types[problem.type] ?? 0) + 1;
      minutes += problemMinutes(problem);
      // One problem counts once per tag, however many of its wrong answers carry it.
      const seen = new Set((problem.distractors ?? []).map((d) => d.misconception).filter(Boolean));
      for (const tag of seen) tags.set(tag, (tags.get(tag) ?? 0) + 1);
    }
    out[set.key] = {
      problems: set.draftIds.length,
      minutes: Math.ceil(minutes),
      difficulty,
      types: Object.fromEntries(Object.entries(types).sort(([a], [b]) => a.localeCompare(b))),
      misconceptions: [...tags.entries()]
        .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
        .map(([tag, problems]) => ({ tag, problems })),
    };
  }
  return out;
}

function loadDrafts(curriculumId) {
  const dir = path.join(ROOT, "content", curriculumId);
  const drafts = new Map();
  if (!fs.existsSync(dir)) return drafts;
  for (const file of fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort())
    for (const d of JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")).drafts ?? [])
      drafts.set(d.id, d);
  return drafts;
}

// In its own folder: tools/curriculum-tag.cjs treats every .json beside the definitions as a course.
const profilePath = (id) => path.join(ROOT, "src", "data", "curricula", "profiles", `${id}.json`);

function main(argv) {
  const idAt = argv.indexOf("--id");
  const id = idAt >= 0 ? argv[idAt + 1] : "ap-physics-1";
  const curriculum = JSON.parse(
    fs.readFileSync(path.join(ROOT, "src", "data", "curricula", `${id}.json`), "utf8"),
  );
  const next = `${JSON.stringify(buildProfile(curriculum, loadDrafts(id)), null, 2)}\n`;
  const file = profilePath(id);
  if (argv.includes("--write")) {
    fs.writeFileSync(file, next);
    console.log(
      `Wrote ${path.relative(ROOT, file)} (${Object.keys(JSON.parse(next)).length} of ${curriculum.sets.length} sets)`,
    );
    return 0;
  }
  const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  if (current === next) {
    console.log(`${path.relative(ROOT, file)} is up to date`);
    return 0;
  }
  console.error(
    `${path.relative(ROOT, file)} is stale; run: node tools/curriculum-profile.cjs --write`,
  );
  return 1;
}

module.exports = { buildProfile, loadDrafts, problemMinutes };
if (require.main === module) process.exit(main(process.argv.slice(2)));
