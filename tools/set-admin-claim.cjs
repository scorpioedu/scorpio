/**
 * Grants or revokes the custom `admin: true` claim on named Firebase Auth users (RT-06 / C-003).
 * Run manually by the project owner. It never infers the project and defaults to a dry run.
 *
 *   node tools/set-admin-claim.cjs --project <project-id> --uid <uid>[,<uid>...]            # dry run
 *   node tools/set-admin-claim.cjs --project <project-id> --uid <uid>[,<uid>...] --apply    # grant
 *   node tools/set-admin-claim.cjs --project <project-id> --uid <uid> --revoke --apply      # revoke
 *
 * Credentials: Application Default Credentials (gcloud auth application-default login), or set
 * FIREBASE_AUTH_EMULATOR_HOST to run against the Auth emulator with no credentials.
 * Other existing custom claims on a user are preserved. The user must sign out and in again (or
 * refresh their ID token) before the new claim appears in their token.
 */

function parseArgs(argv) {
  const out = { project: null, uids: [], apply: false, revoke: false };
  const value = i => (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--apply') out.apply = true;
    else if (arg === '--revoke') out.revoke = true;
    else if (arg === '--project') { out.project = value(i); if (out.project) i++; }
    else if (arg === '--uid') { const v = value(i); if (v) i++; out.uids.push(...(v ?? '').split(',').map(u => u.trim()).filter(Boolean)); }
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!out.project) throw new Error('Missing required --project <project-id>. The project is never inferred.');
  if (out.uids.length === 0) throw new Error('Missing required --uid <uid>[,<uid>...].');
  return out;
}

function describePlan({ project, uids, apply, revoke }, emulatorHost) {
  const target = emulatorHost ? `Auth EMULATOR at ${emulatorHost}` : `LIVE Firebase project "${project}"`;
  const lines = [
    `Target:  ${target}`,
    `Action:  ${revoke ? 'REMOVE' : 'SET'} custom claim admin=${revoke ? '(removed)' : 'true'} on ${uids.length} user(s)`,
    ...uids.map(uid => `  - ${uid}`),
    `Mode:    ${apply ? 'APPLY (changes will be written)' : 'DRY RUN (nothing will be written; add --apply to execute)'}`,
  ];
  return lines.join('\n');
}

async function main(argv, env) {
  const args = parseArgs(argv);
  console.log(describePlan(args, env.FIREBASE_AUTH_EMULATOR_HOST));
  const admin = (await import('firebase-admin')).default;
  admin.initializeApp(env.FIREBASE_AUTH_EMULATOR_HOST
    ? { projectId: args.project }
    : { projectId: args.project, credential: admin.credential.applicationDefault() });
  const auth = admin.auth();
  let failed = 0;
  for (const uid of args.uids) {
    try {
      const user = await auth.getUser(uid);
      const rest = { ...(user.customClaims ?? {}) };
      delete rest.admin;
      const next = args.revoke ? rest : { ...rest, admin: true };
      if (args.apply) await auth.setCustomUserClaims(uid, next);
      console.log(`${args.apply ? 'updated' : 'would update'} ${uid} (${user.email ?? 'no email'}): claims -> ${JSON.stringify(next)}`);
    } catch (err) {
      failed++;
      console.error(`FAILED ${uid}: ${err.message}`);
    }
  }
  if (!args.apply) console.log('Dry run complete. Re-run with --apply to make the change.');
  if (failed) process.exitCode = 1;
}

module.exports = { parseArgs, describePlan };

if (require.main === module) {
  main(process.argv.slice(2), process.env).catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}
