/**
 * Puts a demo class part-way through its course, so /teacher/courses looks like a real class in
 * the middle of the year: the first unit finished, the second nearly, the third under way, the rest
 * still to assign. Emulators only; test-only accounts.
 *
 * It changes two things for the class's first twelve course sets (the first three units in the
 * class's own data), and nothing else:
 *   - each set's due date, counted in weekdays from today (see PLAN);
 *   - students' hand-ins: roster students who have not handed a set in yet submit it, and the real
 *     Cloud Function grades them (so the functions emulator must be running). Work already handed in
 *     is left alone.
 *
 * The class needs students (tools/seed-insights-demo.cjs makes them) and its sets assigned.
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *     node tools/seed-course-progress-demo.cjs <classId> [--dry-run]
 *
 * The due dates it replaces are printed first, so a run can be put back by hand.
 */
const admin = require("firebase-admin");
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error("Emulators only: set FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST");
}
admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || "demo-scorpio" });
const db = admin.firestore();

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const classId = args.find((a) => !a.startsWith("--"));
if (!classId)
  throw new Error("Usage: node tools/seed-course-progress-demo.cjs <classId> [--dry-run]");

/**
 * For the class's sets in course order: when each is due, in weekdays from today (negative = past),
 * and who hands it in: "all", "none", or the number of roster students who do not.
 */
const PLAN = [
  // Unit one: finished weeks ago, everyone handed everything in.
  { due: -20, missing: 0 },
  { due: -18, missing: 0 },
  { due: -16, missing: 0 },
  { due: -14, missing: 0 },
  // Unit two: finished last week; two students still owe the last set.
  { due: -10, missing: 0 },
  { due: -8, missing: 0 },
  { due: -6, missing: 0 },
  { due: -3, missing: 2 },
  // Unit three: under way. One set just closed, one is due tomorrow and half in, two are ahead.
  { due: -1, missing: 1 },
  { due: 1, missing: "half" },
  { due: 3, missing: "all" },
  { due: 5, missing: "all" },
];

/** `n` weekdays from today, at 23:59 local time (holidays are not skipped). */
function weekdaysFromToday(n) {
  const d = new Date();
  d.setHours(23, 59, 0, 0);
  const step = n < 0 ? -1 : 1;
  for (let left = Math.abs(n); left > 0;) {
    d.setDate(d.getDate() + step);
    if (d.getDay() !== 0 && d.getDay() !== 6) left--;
  }
  return d;
}

// Small deterministic PRNG (mulberry32), seeded per set so runs repeat.
function prng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function wrongAnswer(q, key) {
  if (q.type === "multiple-choice") return (q.options || []).find((o) => o !== key) || "none";
  const m = String(key).match(/^(-?[\d.]+)\s*(.*)$/);
  return m ? `${(Number(m[1]) * 1.7).toPrecision(2)} ${m[2]}`.trim() : "idk";
}

/** "4A" before "4B" before "12A". */
const byKey = (a, b) =>
  a.key.localeCompare(b.key, "en", { numeric: true }) || a.id.localeCompare(b.id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const course = (await db.collection("courses").doc(classId).get()).data();
  if (!course) throw new Error(`Class ${classId} not found`);
  const sets = (await db.collection("assignments").where("courseId", "==", classId).get()).docs
    .map((d) => ({ id: d.id, key: d.data().curriculumSetKey, data: d.data() }))
    .filter(
      (a) =>
        typeof a.key === "string" &&
        !a.data.archived &&
        (!course.curriculumId || a.data.curriculumId === course.curriculumId),
    )
    .sort(byKey)
    .slice(0, PLAN.length);
  if (!sets.length) throw new Error(`${course.name} has no course sets assigned`);
  const roster = (await db.collection("users").where("courseId", "==", classId).get()).docs
    .filter((d) => d.data().role === "student")
    .map((d) => ({ id: d.id, name: d.data().displayName || d.data().name || d.id }))
    .sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
  if (!roster.length) throw new Error(`${course.name} has no students`);

  console.log(`${course.name}: ${sets.length} sets, ${roster.length} students`);
  console.log("Due dates before this run:");
  for (const s of sets)
    console.log(
      `  ${s.key} ${s.id} ${s.data.dueDate ? s.data.dueDate.toDate().toISOString() : "none"}`,
    );

  const written = [];
  for (const [i, s] of sets.entries()) {
    const plan = PLAN[i];
    const due = weekdaysFromToday(plan.due);
    const missing =
      plan.missing === "all"
        ? roster.length
        : plan.missing === "half"
          ? Math.ceil(roster.length / 2)
          : Math.min(plan.missing, roster.length);
    // Those who do not hand it in are taken from the end of the roster, a different stretch per
    // set, so the same students are not always the ones who are late.
    const at = (n) =>
      (((roster.length - 1 - n - i) % roster.length) + roster.length) % roster.length;
    const late = new Set(Array.from({ length: missing }, (_, n) => roster[at(n)].id));
    const key = (await db.collection("assignment_keys").doc(s.id).get()).data();
    if (!key) throw new Error(`${s.key}: no answer key for ${s.id}`);
    const had = new Set(
      (await db.collection("submissions").where("assignmentId", "==", s.id).get()).docs.map(
        (d) => d.data().studentId,
      ),
    );
    const rand = prng(20261117 + i * 7919);
    // Handed in the day before it was due, or today for a set that is still open.
    const submittedAt = new Date(Math.min(Date.now(), due.getTime() - 26 * 3600 * 1000));
    let added = 0;
    for (const st of roster) {
      // Every student draws answers, so a set looks the same whoever already handed it in.
      const answers = s.data.questions.map((q) => {
        const right = key.answers[q.id];
        const distractors = (key.distractors && key.distractors[q.id]) || [];
        const r = rand();
        let answer = right;
        if (r < 0.24 && distractors.length)
          answer = distractors[Math.floor(rand() * distractors.length)].answer;
        else if (r < 0.3) answer = wrongAnswer(q, right);
        return { questionId: q.id, answer };
      });
      if (late.has(st.id) || had.has(st.id)) continue;
      added++;
      if (dryRun) continue;
      const subId = `${s.id}_${st.id}`;
      await db.collection("submissions").doc(subId).set({
        assignmentId: s.id,
        studentId: st.id,
        studentName: st.name,
        answers,
        status: "submitted",
        graded: false,
        submittedAt,
      });
      written.push(subId);
    }
    if (!dryRun)
      await db
        .collection("assignments")
        .doc(s.id)
        .update({ dueDate: admin.firestore.Timestamp.fromDate(due) });
    console.log(
      `  ${s.key}: due ${due.toDateString()}, ${had.size + added} of ${roster.length} handed in (${added} new)`,
    );
  }

  if (dryRun) console.log("Dry run: nothing was written.");
  else {
    // The functions emulator grades each new submission; wait for it so the page is right at once.
    let waiting = written.length;
    for (let tries = 0; waiting > 0 && tries < 90; tries++) {
      await sleep(1000);
      const snaps = await db.getAll(...written.map((id) => db.collection("submissions").doc(id)));
      waiting = snaps.filter((d) => d.data()?.status === "submitted").length;
    }
    console.log(
      waiting
        ? `${waiting} of ${written.length} new submissions are not graded yet: is the functions emulator running?`
        : `${written.length} new submissions graded.`,
    );
  }
  await Promise.all(admin.apps.map((a) => a.delete()));
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
