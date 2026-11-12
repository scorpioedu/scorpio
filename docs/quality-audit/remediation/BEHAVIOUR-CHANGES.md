# Intentional behaviour changes

## RT-05 (K-001, K-005)
- New scheduled function `sweepStuckGrading` (every 15 min): AI-graded submissions still `submitted` more than 20 minutes after `submittedAt` are set to `status: 'pending_review'`, `graded: false`, `gradingError: 'AI grading timed out; teacher review required'`, and their `grading_locks` doc is deleted. Manually graded assignments are skipped (they legitimately stay `submitted`). Needs the new `submissions (status, submittedAt)` composite index in `firestore.indexes.json` deployed before the function runs.
- `onSubmissionCreated`/`onSubmissionUpdated` now run with `timeoutSeconds: 540` and `memory: 1GiB` (previously the 60 s / 256 MiB defaults).
- Grading lease lengthened from 15 min to 10 min (timeout + 60 s); a crashed run can be retried sooner.
- Short-answer questions of one submission are graded up to 3 at a time instead of sequentially. Results and answer order are unchanged; token budget reservations for concurrent calls are made concurrently.
- Grading now operates on the submission re-read inside the lease transaction, not the trigger snapshot.
- Grading errors are logged with `firebase-functions/logger` (structured, with `submissionId`) instead of being swallowed; `console.*` in `functions/src/grading.ts` replaced.
- Sweep scans up to 10 pages of 200 stuck candidates per run (ordered by `submittedAt`), paging past manual-grading submissions so they cannot starve AI ones.
- After one answer fails, no further model calls are started and the trigger waits for in-flight calls before routing to `pending_review` (the lock is never released while calls run).
- `sweepStuckGrading` is exported from `functions/src/index.ts` so it deploys.

## RT-06: admin routes use the admin claim instead of ADMIN_SECRET (C-003)
- `POST /api/admin/firestore`, `POST /api/research/respond`, and the admin actions of `POST /api/auth/teacher-code` (`generate`, `list`, `revoke`) and `POST /api/auth/request-access` (`list`, `approve`, `reject`) now require `Authorization: Bearer <Firebase ID token>` whose token has custom claim `admin: true`.
  - No credentials: 401 (was 401). Signed-in without the claim: 403. The `x-admin-secret` header is ignored; `ADMIN_SECRET` is not read anywhere.
  - Public actions are unchanged: `teacher-code` `validate` and the `request-access` submit form need no credentials.
- Every admin call (allowed or denied) writes an `admin_audit` document: `uid`, `route`, `method`, `action`, `collection`, `outcome`, truncated SHA-256 `ipHash`, `timestamp`. If the audit write fails the request is rejected with 500 (fail closed).
- Admin-claim users do not need a `users/{uid}` profile document.
- `/admin` and `/research/admin` no longer ask for a secret. They show the dashboard to a signed-in user whose token carries the claim; others see a sign-in prompt or "no administrator access".
- Admins are locked out until the owner runs `tools/set-admin-claim.cjs` (see `RT-06-HUMAN.md`).
- `ADMIN_SECRET` removed from `.env.example`.
