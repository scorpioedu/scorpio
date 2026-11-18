/**
 * Moves reviewed AP content drafts between Firestore projects through a JSON file in the repo.
 *
 *   # Save drafts from the local emulator (Firenook or the Firebase emulators) to a file
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node tools/content-drafts.cjs export \
 *     --project demo-scorpio --units 4,5,6 --sets content/ap-physics-1/sets.json \
 *     --out content/ap-physics-1/units-4-6.json
 *   # Unit numbers repeat between AP courses, so name the course for any other than AP Physics 1
 *   ... export --project demo-scorpio --course physics-c-mech --out content/ap-physics-c-mech/units-1-7.json
 *
 *   # Load them into another project as approved, UNPUBLISHED drafts (dry run unless --apply)
 *   node tools/content-drafts.cjs import --project <project-id> --file content/ap-physics-1/units-4-6.json
 *   node tools/content-drafts.cjs import --project <project-id> --file ... --apply
 *
 * Import never publishes and never touches assignments or answer keys. Every imported draft keeps
 * its review note and its reviewKind, so AI-reviewed problems still need a person's approval at
 * /admin/content before they can be published (the publish route enforces this outside the
 * emulator). Document ids are kept, so running an import twice overwrites rather than duplicates;
 * a draft that is already published in the target project is skipped.
 *
 * Credentials: Application Default Credentials for a real project, or FIRESTORE_EMULATOR_HOST.
 * The project is never inferred.
 */

const fs = require("node:fs");
const path = require("node:path");

const COLLECTION = "content_drafts";

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const out = {
    command,
    project: null,
    units: null,
    course: null,
    out: null,
    file: null,
    sets: null,
    apply: false,
  };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    const next = () => {
      const v = rest[++i];
      if (!v || v.startsWith("--")) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === "--project") out.project = next();
    else if (a === "--units") out.units = next().split(",").map(Number);
    else if (a === "--course") out.course = next();
    else if (a === "--out") out.out = next();
    else if (a === "--file") out.file = next();
    else if (a === "--sets") out.sets = next();
    else if (a === "--apply") out.apply = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!["export", "import"].includes(command))
    throw new Error("First argument must be export or import");
  if (!out.project)
    throw new Error("Missing --project <project-id>. The project is never inferred.");
  if (command === "export" && !out.out) throw new Error("export needs --out <file>");
  if (command === "import" && !out.file) throw new Error("import needs --file <file>");
  return out;
}

const iso = (v) =>
  v && typeof v.toDate === "function"
    ? v.toDate().toISOString()
    : v instanceof Date
      ? v.toISOString()
      : (v ?? null);

/** A stored draft -> the JSON record kept in the repo. */
function toRecord(id, data) {
  return {
    id,
    course: data.course,
    apUnit: data.apUnit,
    apTopic: data.apTopic,
    status: data.status,
    reviewKind: data.reviewKind ?? null,
    reviewNote: data.reviewNote ?? null,
    edited: !!data.edited,
    problem: data.problem,
    original: data.original ?? null,
    check: data.check ?? null,
    warnings: data.warnings ?? [],
    errors: data.errors ?? [],
    batchId: data.batchId ?? null,
    createdAt: iso(data.createdAt),
    reviewedAt: iso(data.reviewedAt),
  };
}

/** A repo record -> the draft written on import: approved (never published), unassigned. */
function toImportDoc(record, importedAt) {
  if (!record.problem) throw new Error(`Draft ${record.id} has no problem`);
  if (!["approved", "published"].includes(record.status))
    throw new Error(`Draft ${record.id} is ${record.status}; only reviewed drafts are imported`);
  return {
    course: record.course,
    apUnit: record.apUnit,
    apTopic: record.apTopic,
    status: "approved",
    problem: record.problem,
    original: record.original ?? null,
    errors: record.errors ?? [],
    warnings: record.warnings ?? [],
    check: record.check ?? null,
    edited: !!record.edited,
    batchId: record.batchId ?? null,
    generatedBy: "import",
    createdAt: record.createdAt ? new Date(record.createdAt) : importedAt,
    reviewedBy: "import",
    reviewedAt: record.reviewedAt ? new Date(record.reviewedAt) : importedAt,
    reviewNote: record.reviewNote ?? null,
    reviewKind: record.reviewKind ?? "ai",
    assignmentId: null,
    importedAt,
  };
}

function db(projectId) {
  const { initializeApp, applicationDefault } = require("firebase-admin/app");
  const { getFirestore } = require("firebase-admin/firestore");
  const app = process.env.FIRESTORE_EMULATOR_HOST
    ? initializeApp({ projectId })
    : initializeApp({ projectId, credential: applicationDefault() });
  return getFirestore(app);
}

async function runExport(opts) {
  const snap = await db(opts.project).collection(COLLECTION).get();
  const drafts = snap.docs
    .map((d) => toRecord(d.id, d.data()))
    // Unit numbers repeat between AP courses; drafts stored without a course are AP Physics 1.
    .filter((r) => !opts.course || (r.course || "physics-1") === opts.course)
    .filter((r) => !opts.units || opts.units.includes(r.apUnit))
    .filter((r) => r.status === "approved" || r.status === "published")
    .sort(
      (a, b) =>
        a.apTopic.localeCompare(b.apTopic, "en", { numeric: true }) || a.id.localeCompare(b.id),
    );
  const sets = opts.sets ? JSON.parse(fs.readFileSync(opts.sets, "utf8")) : undefined;
  const file = {
    exportedAt: new Date().toISOString(),
    sourceProject: opts.project,
    count: drafts.length,
    ...(sets ? { sets } : {}),
    drafts,
  };
  fs.mkdirSync(path.dirname(opts.out), { recursive: true });
  fs.writeFileSync(opts.out, JSON.stringify(file, null, 2) + "\n");
  console.log(`Exported ${drafts.length} reviewed drafts to ${opts.out}`);
}

async function runImport(opts) {
  const file = JSON.parse(fs.readFileSync(opts.file, "utf8"));
  const now = new Date();
  const docs = file.drafts.map((r) => [r.id, toImportDoc(r, now)]);
  const firestore = db(opts.project);
  const existing = await firestore.getAll(
    ...docs.map(([id]) => firestore.collection(COLLECTION).doc(id)),
  );
  const published = new Set(
    existing.filter((s) => s.exists && s.data().status === "published").map((s) => s.id),
  );
  const todo = docs.filter(([id]) => !published.has(id));
  console.log(`${opts.apply ? "APPLY" : "DRY RUN"}: project ${opts.project}`);
  console.log(
    `  ${todo.length} drafts to write as approved/unpublished, ${published.size} skipped (already published)`,
  );
  const ai = todo.filter(([, d]) => d.reviewKind === "ai").length;
  console.log(`  ${ai} are AI-reviewed and still need a person's approval at /admin/content`);
  if (!opts.apply) return;
  for (let i = 0; i < todo.length; i += 400) {
    const batch = firestore.batch();
    for (const [id, d] of todo.slice(i, i + 400))
      batch.set(firestore.collection(COLLECTION).doc(id), d);
    await batch.commit();
  }
  console.log(`Wrote ${todo.length} drafts.`);
}

if (require.main === module) {
  const opts = parseArgs(process.argv.slice(2));
  (opts.command === "export" ? runExport(opts) : runImport(opts)).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}

module.exports = { parseArgs, toRecord, toImportDoc };
