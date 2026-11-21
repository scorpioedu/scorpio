#!/usr/bin/env node
/**
 * Checks the course guides in src/data/guides/<curriculumId>/unit-<n>.json. Reads only repo files.
 *
 *   node tools/verify-guides.cjs --all                              # every guide file
 *   node tools/verify-guides.cjs --course ap-physics-1              # one course
 *   node tools/verify-guides.cjs --course ap-physics-1 --unit 4     # one unit
 *
 * Exits 1 when any file has an error (or when the unit asked for has no guide file). Warnings and
 * the coverage report (units with no guide file yet) do not fail the run. The checks themselves
 * are in src/lib/guides/verify.ts; `npx jest guides` runs the same checks over every file.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const GUIDES = path.join(ROOT, "src", "data", "guides");

/**
 * The checks are TypeScript. Under jest they are compiled by ts-jest; run from the command line,
 * this compiles each .ts file as it is required and resolves the "@/" alias, with the TypeScript
 * that is already a dev dependency (no build step, nothing new to install).
 */
function registerTypeScript() {
  if (require.extensions[".ts"]) return;
  const Module = require("module");
  const ts = require("typescript");
  const resolve = Module._resolveFilename;
  Module._resolveFilename = function (request, ...rest) {
    const mapped = request.startsWith("@/") ? path.join(ROOT, "src", request.slice(2)) : request;
    return resolve.call(this, mapped, ...rest);
  };
  require.extensions[".ts"] = (module, filename) => {
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

function loadVerifier() {
  if (!process.env.JEST_WORKER_ID) registerTypeScript();
  return require("../src/lib/guides/verify.ts");
}

/**
 * INTEGRATION HOOK: worked-example numbers. Set this to `evaluateSpec` from
 * src/lib/content/spec.ts once that file is in the tree, e.g.
 *   const evaluateSpec = () => require("../src/lib/content/spec.ts").evaluateSpec;
 * Until then worked examples are checked for shape only (see `checkWorkedExample`).
 */
const evaluateSpec = () => undefined;

/** Every guide file on disk, as { curriculumId, unit, file }, in course then unit order. */
function guideFilesOnDisk(dir = GUIDES) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const curriculumId of fs.readdirSync(dir).sort()) {
    const courseDir = path.join(dir, curriculumId);
    if (!fs.statSync(courseDir).isDirectory()) continue;
    for (const name of fs.readdirSync(courseDir)) {
      const m = name.match(/^unit-(\d+)\.json$/);
      if (m) out.push({ curriculumId, unit: Number(m[1]), file: path.join(courseDir, name) });
    }
  }
  return out.sort((a, b) => a.curriculumId.localeCompare(b.curriculumId) || a.unit - b.unit);
}

/** One file's report. A file that is not JSON, or sits under the wrong name, is an error. */
function verifyFile(entry, options = {}) {
  const { verifyUnitGuide } = loadVerifier();
  let data;
  try {
    data = JSON.parse(fs.readFileSync(entry.file, "utf8"));
  } catch (e) {
    return {
      curriculumId: entry.curriculumId,
      unit: entry.unit,
      topics: [],
      warnings: [],
      errors: [`not valid JSON: ${e.message}`],
    };
  }
  const report = verifyUnitGuide(data, options);
  if (report.curriculumId !== null && report.curriculumId !== entry.curriculumId)
    report.errors.unshift(
      `the file is in ${entry.curriculumId}/ but says curriculumId "${report.curriculumId}"`,
    );
  if (report.unit !== null && report.unit !== entry.unit)
    report.errors.unshift(`the file is unit-${entry.unit}.json but says unit ${report.unit}`);
  return report;
}

function arg(argv, name) {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : undefined;
}

/** Runs the checks and prints the report. Returns the exit code. */
function main(argv, out = console) {
  const course = arg(argv, "--course");
  const unitArg = arg(argv, "--unit");
  const unit = unitArg === undefined ? undefined : Number(unitArg);
  if (!argv.includes("--all") && !course) {
    out.error("Usage: node tools/verify-guides.cjs --all | --course <curriculumId> [--unit <n>]");
    return 1;
  }
  if (unitArg !== undefined && (!course || !Number.isInteger(unit))) {
    out.error("--unit needs a number and a --course");
    return 1;
  }
  const { guideCoverage } = loadVerifier();
  const all = guideFilesOnDisk();
  const files = all.filter(
    (f) => (!course || f.curriculumId === course) && (unit === undefined || f.unit === unit),
  );
  let failed = 0;
  if (unit !== undefined && !files.length) {
    out.error(
      `No guide file for ${course} unit ${unit} (src/data/guides/${course}/unit-${unit}.json)`,
    );
    failed++;
  }
  const evaluate = evaluateSpec();
  for (const f of files) {
    const report = verifyFile(f, { evaluate });
    const name = path.relative(ROOT, f.file);
    const sizes = report.topics.map((t) => `${t.topic}: ${t.words} words, ${t.diagrams} diagrams`);
    if (report.errors.length) {
      failed++;
      out.error(`FAIL ${name}`);
      report.errors.forEach((e) => out.error(`  error: ${e}`));
    } else out.log(`ok   ${name}${sizes.length ? ` (${sizes.join("; ")})` : ""}`);
    report.warnings.forEach((w) => out.log(`  warning: ${w}`));
  }
  if (!evaluate) out.log("Worked-example numbers: shape only (no spec evaluator connected).");
  out.log("Coverage:");
  for (const c of guideCoverage(all.map((f) => [f.curriculumId, f.unit])))
    if (!course || c.curriculumId === course)
      out.log(
        `  ${c.name}: ${c.withGuide.length} of ${c.withGuide.length + c.missing.length} units have a guide` +
          (c.missing.length
            ? `; none yet for unit${c.missing.length === 1 ? "" : "s"} ${c.missing.join(", ")}`
            : ""),
      );
  return failed ? 1 : 0;
}

module.exports = { guideFilesOnDisk, verifyFile, main, registerTypeScript };
if (require.main === module) process.exit(main(process.argv.slice(2)));
