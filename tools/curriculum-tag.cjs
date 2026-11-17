/**
 * Tags already-published global waypoints with the course set they belong to, so they appear in
 * the Courses roadmap (see docs/courses.md). A published assignment matches a set when its
 * `contentDraftIds` are exactly the set's `draftIds` (same ids, any order). For each match it writes
 * curriculumId, curriculumSetKey, curriculumSequence and the normalised title.
 *
 *   node tools/curriculum-tag.cjs --project <project-id>           # dry run: prints what would change
 *   node tools/curriculum-tag.cjs --project <project-id> --apply   # writes
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node tools/curriculum-tag.cjs --project demo-scorpio
 *
 * Safe to re-run: assignments that already carry the right values are left alone. An assignment that
 * matches no set, or a set matched by two assignments, is reported and not touched. Credentials:
 * Application Default Credentials for a real project, or FIRESTORE_EMULATOR_HOST. The project is
 * never inferred.
 */

const fs = require("node:fs");
const path = require("node:path");

const DIR = path.join(__dirname, "..", "src", "data", "curricula");

function loadCurricula(dir = DIR) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
}

function parseArgs(argv) {
  const out = { project: null, apply: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project") {
      const v = argv[++i];
      if (!v || v.startsWith("--")) throw new Error("--project needs a value");
      out.project = v;
    } else if (a === "--apply") out.apply = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!out.project)
    throw new Error("Missing --project <project-id>. The project is never inferred.");
  return out;
}

/** Same ordering rule as src/data/curricula `compareSetKeys`: unit number, then key. */
const compareKeys = (a, b) =>
  parseInt(a.key, 10) - parseInt(b.key, 10) || a.key.localeCompare(b.key);

/** The published title, as src/data/curricula `displayTitle` builds it. */
function displayTitle(curriculum, set) {
  return `${curriculum.name} · Unit ${set.key} · ${set.title}`;
}

const sameIds = (a, b) => a.length === b.length && new Set([...a, ...b]).size === a.length;

/**
 * Match published assignments to sets.
 * @param assignments [{ id, data }] global assignments
 * @returns { updates: [{id, curriculumId, set, patch, unchanged}], unmatched: [id], conflicts: [{ key, ids }] }
 */
function matchAssignments(assignments, curricula) {
  const updates = [];
  const unmatched = [];
  const claims = new Map(); // "curriculumId/key" -> [assignment ids]
  const found = [];
  for (const { id, data } of assignments) {
    const ids = Array.isArray(data.contentDraftIds) ? data.contentDraftIds : [];
    let hit = null;
    if (ids.length)
      for (const c of curricula) {
        const set = c.sets.find((s) => sameIds(s.draftIds, ids));
        if (set) {
          hit = { c, set };
          break;
        }
      }
    if (!hit) {
      unmatched.push(id);
      continue;
    }
    const k = `${hit.c.id}/${hit.set.key}`;
    claims.set(k, [...(claims.get(k) ?? []), id]);
    found.push({ id, data, ...hit });
  }
  const conflicts = [...claims.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([k, ids]) => ({ key: k, ids }));
  const conflicted = new Set(conflicts.flatMap((c) => c.ids));
  for (const { id, data, c, set } of found) {
    if (conflicted.has(id)) continue;
    const patch = {
      curriculumId: c.id,
      curriculumSetKey: set.key,
      curriculumSequence: [...c.sets].sort(compareKeys).findIndex((s) => s.key === set.key),
      title: displayTitle(c, set),
    };
    const unchanged = Object.entries(patch).every(([k, v]) => data[k] === v);
    updates.push({ id, curriculumId: c.id, set, patch, unchanged });
  }
  return { updates, unmatched, conflicts };
}

async function run(opts) {
  const { initializeApp, applicationDefault } = require("firebase-admin/app");
  const { getFirestore } = require("firebase-admin/firestore");
  const app = process.env.FIRESTORE_EMULATOR_HOST
    ? initializeApp({ projectId: opts.project })
    : initializeApp({ projectId: opts.project, credential: applicationDefault() });
  const firestore = getFirestore(app);
  console.log(
    `Project: ${opts.project}${process.env.FIRESTORE_EMULATOR_HOST ? " (emulator)" : ""}`,
  );
  const snap = await firestore.collection("assignments").where("visibility", "==", "global").get();
  const { updates, unmatched, conflicts } = matchAssignments(
    snap.docs.map((d) => ({ id: d.id, data: d.data() })),
    loadCurricula(),
  );
  const todo = updates.filter((u) => !u.unchanged);
  for (const u of updates)
    console.log(
      `${u.unchanged ? "ok     " : "tag    "} ${u.id}  ${u.curriculumId} ${u.set.key}  ${u.patch.title}`,
    );
  for (const c of conflicts)
    console.log(`SKIPPED ${c.key} is matched by several assignments: ${c.ids.join(", ")}`);
  console.log(
    `${snap.size} global assignments: ${todo.length} to tag, ${updates.length - todo.length} already tagged, ${unmatched.length} not part of a course set, ${conflicts.length} conflicts.`,
  );
  if (!opts.apply) return console.log("Dry run. Add --apply to write.");
  for (let i = 0; i < todo.length; i += 400) {
    const batch = firestore.batch();
    for (const u of todo.slice(i, i + 400))
      batch.update(firestore.collection("assignments").doc(u.id), u.patch);
    await batch.commit();
  }
  console.log(`Tagged ${todo.length} assignments.`);
}

if (require.main === module) {
  try {
    run(parseArgs(process.argv.slice(2))).catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

module.exports = { parseArgs, matchAssignments, displayTitle, loadCurricula };
