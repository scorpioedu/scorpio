/** Run with explicit credentials/project. Defaults to a read-only dry run; pass --apply to write. */
const admin = require("firebase-admin");
const { migrateAnswerKeys } = require("./answer-key-migration.cjs");
const projectId = process.env.FIREBASE_PROJECT_ID;
if (!projectId)
  throw new Error("Set FIREBASE_PROJECT_ID explicitly; do not infer the production project");
admin.initializeApp({ projectId, credential: admin.credential.applicationDefault() });
const db = admin.firestore();
const apply = process.argv.includes("--apply");
(async () => {
  const ids = await migrateAnswerKeys(db, {
    apply,
    documentId: admin.firestore.FieldPath.documentId(),
  });
  console.log(`${apply ? "Migrated" : "Would migrate"} ${ids.length} assignments in ${projectId}.`);
  if (ids.length) console.log(ids.join("\n"));
  console.log(
    "Audit existing teacher identities and enrollment separately before trusting historical profiles.",
  );
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
