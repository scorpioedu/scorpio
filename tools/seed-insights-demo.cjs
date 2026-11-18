/**
 * Fills the demo class with students who submit an assignment, so the misconception report
 * (/teacher/insights) has something to show. Emulators only; test-only accounts.
 *
 * Needs tools/seed-emulator-demo.cjs first, and the functions emulator running so submissions are
 * graded by the real Cloud Function (which records the misconception events):
 *   npx firebase emulators:start --only auth,firestore,storage,functions --project demo-scorpio
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *     node tools/seed-insights-demo.cjs <assignmentId> [studentCount=12]
 *
 * Each student answers each question correctly, with one of the key's tagged distractors (the
 * common wrong answers), or with an untagged wrong answer, using a fixed seed so runs repeat.
 */
const admin = require("firebase-admin");
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error("Emulators only: set FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST");
}
admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || "demo-scorpio" });
const db = admin.firestore();

const [assignmentId, countArg] = process.argv.slice(2);
if (!assignmentId)
  throw new Error("Usage: node tools/seed-insights-demo.cjs <assignmentId> [studentCount]");
const count = Number(countArg) || 12;

const NAMES = [
  "Ava",
  "Ben",
  "Chloe",
  "Dev",
  "Elena",
  "Felix",
  "Grace",
  "Hiro",
  "Isla",
  "Jamal",
  "Kira",
  "Leo",
  "Maya",
  "Noah",
  "Omar",
  "Priya",
];

// Small deterministic PRNG (mulberry32) so the demo looks the same every run.
let seed = 20261124;
function rand() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function wrongAnswer(q, key) {
  if (q.type === "multiple-choice") return (q.options || []).find((o) => o !== key) || "none";
  const m = String(key).match(/^(-?[\d.]+)\s*(.*)$/);
  return m ? `${(Number(m[1]) * 1.7).toPrecision(2)} ${m[2]}`.trim() : "idk";
}

(async () => {
  const assignment = (await db.collection("assignments").doc(assignmentId).get()).data();
  const key = (await db.collection("assignment_keys").doc(assignmentId).get()).data();
  if (!assignment || !key) throw new Error(`Assignment ${assignmentId} (or its key) not found`);
  const teacherId = assignment.teacherId;
  const courseId = assignment.courseId;
  if (!courseId) throw new Error("Assign it to a class first (the demo class is demo-course)");

  for (let i = 0; i < count; i++) {
    const name = `${NAMES[i % NAMES.length]} ${String.fromCharCode(65 + Math.floor(i / NAMES.length))}.`;
    const uid = `demo-student-${i + 1}`;
    await db
      .collection("users")
      .doc(uid)
      .set(
        {
          email: `${uid}@demo.test`,
          displayName: name,
          name,
          role: "student",
          teacherId,
          courseId,
          organizationId: assignment.organizationId || "demo-org",
          classIds: [courseId],
          createdAt: new Date(),
        },
        { merge: true },
      );
    const answers = assignment.questions.map((q) => {
      const right = key.answers[q.id];
      const distractors = (key.distractors && key.distractors[q.id]) || [];
      const r = rand();
      let answer = right;
      if (r < 0.45 && distractors.length)
        answer = distractors[Math.floor(rand() * distractors.length)].answer;
      else if (r < 0.55) answer = wrongAnswer(q, right);
      return { questionId: q.id, answer };
    });
    const subId = `${assignmentId}_${uid}`;
    await db.collection("submissions").doc(subId).set({
      assignmentId,
      studentId: uid,
      studentName: name,
      answers,
      status: "submitted",
      graded: false,
      submittedAt: new Date(),
    });
  }
  console.log(
    `Submitted ${count} demo students' answers for ${assignmentId}; the functions emulator grades them.`,
  );
  await Promise.all(admin.apps.map((a) => a.delete()));
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
