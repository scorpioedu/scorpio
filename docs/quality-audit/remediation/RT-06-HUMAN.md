# RT-06 owner steps: grant the admin claim

After this change ships, `ADMIN_SECRET` is dead. Admin pages and routes need a Firebase Auth user with the custom claim `admin: true`. Nothing below has been run for you.

## 0. Prerequisites
- Node 22, repo checked out at the RT-06 commit, `npm ci` done.
- Gcloud Application Default Credentials for the project owner account: `gcloud auth application-default login`.
- The admin account(s) must already exist in Firebase Auth (sign up/in once through the app). Find each UID in Firebase Console > Authentication > Users.

## 1. Dry run (writes nothing)
```bash
node tools/set-admin-claim.cjs --project <YOUR_FIREBASE_PROJECT_ID> --uid <UID1>,<UID2>
```
Check that the printed `Target:` is `LIVE Firebase project "<your project>"` and the UIDs are the ones you intend. The script refuses to run without `--project` and never guesses the project.

## 2. Apply
```bash
node tools/set-admin-claim.cjs --project <YOUR_FIREBASE_PROJECT_ID> --uid <UID1>,<UID2> --apply
```
Existing custom claims on those users are preserved. To remove admin later, add `--revoke`.

## 3. Refresh the token
Each admin must sign out and sign in again (the claim is baked into the ID token). `/admin` also force-refreshes the token on load.

## 4. Verify
1. Signed in as an admin, open `/admin`: the dashboard loads (no secret prompt), the Access & Security tab lists requests and invite codes, the Database Explorer lists collections.
2. Signed in as a normal teacher, open `/admin`: you see "This account does not have administrator access."
3. In Firestore Console, the `admin_audit` collection now has documents for your calls (`uid`, `route`, `action`, `outcome: "allowed"`; the teacher's attempt shows `outcome: "denied"`).
4. Old header is dead (replace the host; expect 401 without a token, never 200):
   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<your-host>/api/admin/firestore \
     -H 'content-type: application/json' -H 'x-admin-secret: anything' -d '{"action":"listCollections"}'
   ```

## 5. Clean up
- Delete `ADMIN_SECRET` from Cloud Run / hosting environment variables and any local `.env.local`, and rotate it anywhere else it was reused.
- `/research/admin` still works for admins, but its client library still sends a legacy header (ignored); see FOLLOWUPS.md (RT-06).

## Rollback
Redeploy the previous build and restore `ADMIN_SECRET`. The claim itself is harmless to leave in place.
