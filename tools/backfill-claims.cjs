/**
 * Backfills the `role` and `organizationId` custom claims on Firebase Auth users from users/{uid}
 * (RT-30 / D-007, step 2 of docs/quality-audit/remediation/RT-30-CLAIMS-PLAN.md).
 * Run manually by the project owner. It never infers the project and defaults to a dry run.
 *
 *   node tools/backfill-claims.cjs --project <project-id>                 # dry run: prints the plan only
 *   node tools/backfill-claims.cjs --project <project-id> --apply         # writes claims
 *   node tools/backfill-claims.cjs --project <project-id> --limit 50      # only the first 50 users
 *
 * Credentials: Application Default Credentials, or set FIREBASE_AUTH_EMULATOR_HOST and
 * FIRESTORE_EMULATOR_HOST to run against the emulators with no credentials.
 * Existing custom claims (for example `admin`) are preserved. Users must refresh their ID token
 * (sign out and in, or getIdToken(true)) before a new claim appears. Nothing reads these claims
 * yet: firestore.rules still uses get(), so running this is safe before the rules change.
 */

const MANAGED = ['role', 'organizationId'];

function parseArgs(argv) {
  const out = { project: null, apply: false, limit: null };
  const value = i => (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--apply') out.apply = true;
    else if (arg === '--project') { out.project = value(i); if (out.project) i++; }
    else if (arg === '--limit') {
      const v = value(i); if (v) i++;
      out.limit = Number(v);
      if (!Number.isInteger(out.limit) || out.limit < 1) throw new Error('--limit needs a positive integer.');
    }
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!out.project) throw new Error('Missing required --project <project-id>. The project is never inferred.');
  return out;
}

/** Pure: next claims for a user given existing claims and the Firestore profile; null when unchanged. */
function planClaims(existing, profile) {
  const next = { ...(existing ?? {}) };
  for (const key of MANAGED) delete next[key];
  if (profile && (profile.role === 'teacher' || profile.role === 'student')) next.role = profile.role;
  if (profile && typeof profile.organizationId === 'string' && profile.organizationId) next.organizationId = profile.organizationId;
  const same = MANAGED.every(k => (existing ?? {})[k] === next[k]);
  return same ? null : next;
}

function describePlan({ project, apply, limit }, emulatorHost) {
  const target = emulatorHost ? `Auth EMULATOR at ${emulatorHost}` : `LIVE Firebase project "${project}"`;
  return [
    `Target:  ${target}`,
    `Action:  set custom claims ${MANAGED.join(' + ')} on Auth users from users/{uid}${limit ? ` (first ${limit} users)` : ''}`,
    `Mode:    ${apply ? 'APPLY (changes will be written)' : 'DRY RUN (nothing will be written; add --apply to execute)'}`,
  ].join('\n');
}

async function main(argv, env) {
  const args = parseArgs(argv);
  console.log(describePlan(args, env.FIREBASE_AUTH_EMULATOR_HOST));
  const admin = (await import('firebase-admin')).default;
  admin.initializeApp(env.FIREBASE_AUTH_EMULATOR_HOST
    ? { projectId: args.project }
    : { projectId: args.project, credential: admin.credential.applicationDefault() });
  const db = admin.firestore();
  const auth = admin.auth();
  const stats = { seen: 0, changed: 0, unchanged: 0, noAuthUser: 0, failed: 0 };
  let cursor;
  scan: while (true) {
    let q = db.collection('users').orderBy(admin.firestore.FieldPath.documentId()).limit(200);
    if (cursor) q = q.startAfter(cursor);
    const page = await q.get();
    if (page.empty) break;
    for (const doc of page.docs) {
      if (args.limit && stats.seen >= args.limit) break scan;
      stats.seen++;
      try {
        const user = await auth.getUser(doc.id);
        const next = planClaims(user.customClaims, doc.data());
        if (!next) { stats.unchanged++; continue; }
        if (args.apply) await auth.setCustomUserClaims(doc.id, next);
        stats.changed++;
        console.log(`${args.apply ? 'updated' : 'would update'} ${doc.id}: claims -> ${JSON.stringify(next)}`);
      } catch (err) {
        if (err.code === 'auth/user-not-found') stats.noAuthUser++;
        else { stats.failed++; console.error(`FAILED ${doc.id}: ${err.message}`); }
      }
    }
    cursor = page.docs[page.docs.length - 1];
  }
  console.log(`Summary: ${JSON.stringify(stats)}`);
  if (!args.apply) console.log('Dry run complete. Re-run with --apply to make the change.');
  if (stats.failed) process.exitCode = 1;
}

module.exports = { parseArgs, planClaims, describePlan };

if (require.main === module) {
  main(process.argv.slice(2), process.env).catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}
