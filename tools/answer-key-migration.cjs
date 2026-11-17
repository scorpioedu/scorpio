// Moves answers that are still stored on assignment documents into assignment_keys/{id}, where only
// the owning teacher can read them (firestore.rules). Teachers can read global and same-network
// assignment documents directly, so any answer left inline is readable by every teacher.
//
// Handles every legacy shape seen in the data:
// - `correctAnswer`, `answer` (seeded waypoints) and `expectedAnswer` on questions, and `rubric` on the assignment;
// - questions without an `id` (seeded waypoints): given stable ids q1, q2, ... by position;
// - documents already marked `answerKeySeparated` that still carry inline fields: merged, the existing key wins;
// - legacy type names: "numerical" -> "numeric", "free-response" -> "text".
// Used by tools/migrate-school-security.cjs. Pure CommonJS so it runs with plain `node`.

const KEY_FIELDS = ["correctAnswer", "answer", "expectedAnswer", "rubric"];
const TYPE_ALIASES = { numerical: "numeric", "free-response": "text" };
const VALID_ID = /^[A-Za-z0-9_-]{1,128}$/;
const RESERVED = new Set(["__proto__", "constructor", "prototype"]);

const text = (v) => (typeof v === "string" ? v : v === undefined || v === null ? "" : String(v));

/** True when the document still exposes something that belongs in the key, or cannot be keyed. */
function needsMigration(data) {
  if (!data) return false;
  if (!data.answerKeySeparated) return true;
  if (data.rubric) return true;
  return (data.questions || []).some(
    (q) =>
      !q ||
      !VALID_ID.test(String(q.id || "")) ||
      KEY_FIELDS.some((f) => q[f] !== undefined) ||
      TYPE_ALIASES[q.type],
  );
}

/**
 * Splits an assignment into its public form and its key. `existingKey` (assignment_keys/{id}, if
 * any) takes precedence for non-empty answers so a teacher's later edit is never overwritten by a
 * stale inline copy.
 */
function splitInlineKeys(data, existingKey) {
  const answers = Object.create(null);
  const used = new Set();
  const questions = (data.questions || []).map((raw, index) => {
    const q = { ...(raw || {}) };
    let id =
      typeof q.id === "string" && VALID_ID.test(q.id) && !RESERVED.has(q.id) && !used.has(q.id)
        ? q.id
        : "";
    if (!id) {
      let n = index + 1;
      while (used.has(`q${n}`)) n++;
      id = `q${n}`;
    }
    used.add(id);
    const inline = text(q.correctAnswer ?? q.answer ?? q.expectedAnswer);
    const kept = text(existingKey && existingKey.answers && existingKey.answers[id]);
    answers[id] = kept || inline;
    for (const f of KEY_FIELDS) delete q[f];
    if (TYPE_ALIASES[q.type]) q.type = TYPE_ALIASES[q.type];
    q.id = id;
    return q;
  });
  return {
    publicQuestions: questions,
    key: {
      answers: { ...answers },
      rubric: text((existingKey && existingKey.rubric) || data.rubric),
      teacherId: data.teacherId || null,
    },
  };
}

/**
 * Pages through every assignment. Dry run by default: returns what would change without writing.
 * With apply, each document is re-read inside a transaction so a concurrent teacher edit is not lost.
 */
async function migrateAnswerKeys(db, { apply = false, pageSize = 100, documentId } = {}) {
  const migrated = [];
  let cursor;
  for (;;) {
    let query = db.collection("assignments").orderBy(documentId).limit(pageSize);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    if (page.empty) break;
    for (const doc of page.docs) {
      if (!needsMigration(doc.data())) continue;
      migrated.push(doc.id);
      if (!apply) continue;
      const keyRef = db.collection("assignment_keys").doc(doc.id);
      await db.runTransaction(async (tx) => {
        const fresh = (await tx.get(doc.ref)).data();
        const existing = (await tx.get(keyRef)).data();
        if (!needsMigration(fresh)) return;
        const { publicQuestions, key } = splitInlineKeys(fresh, existing);
        tx.set(keyRef, key);
        tx.update(doc.ref, { questions: publicQuestions, rubric: null, answerKeySeparated: true });
      });
    }
    if (page.size < pageSize) break;
    cursor = page.docs[page.docs.length - 1];
  }
  return migrated;
}

module.exports = { needsMigration, splitInlineKeys, migrateAnswerKeys };
