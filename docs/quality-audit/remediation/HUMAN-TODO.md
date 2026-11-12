# Human-only follow-ups

## RT-08 step 5: require CI in branch protection
In GitHub: Settings > Branches > branch protection rule for `main` > "Require status checks to pass before merging". Select the CI jobs `typecheck`, `jest`, `security`, `build` and `gitleaks`. Leave `eslint` and `audit` unselected: they are `continue-on-error` until the lint baseline (RT-31) and the advisories (RT-02) are cleared; then remove `continue-on-error` and require them too.
Also enable "Require branches to be up to date before merging".

## RT-06: grant the admin claim (admins are locked out until you do this)
`ADMIN_SECRET` and the `x-admin-secret` header no longer work. `/admin`, `/research/admin` and the four admin API routes now need a Firebase ID token with the custom claim `admin: true`. Until you run `tools/set-admin-claim.cjs` against your real project, nobody can use those pages. Exact steps are in `docs/quality-audit/remediation/RT-06-HUMAN.md`. Also remove `ADMIN_SECRET` from Cloud Run / hosting env once the new build is live.

## RT-01: rotate and revoke the leaked Firebase Admin key (Critical)
Full steps: `docs/quality-audit/remediation/RT-01-runbook.md`. Nothing has been run for you. Rotation is what fixes the exposure (commits `dea0862` and `65737a2` stay reachable).
- [ ] Create a new key for the service account named by `FIREBASE_CLIENT_EMAIL` and note its key ID.
- [ ] Update `FIREBASE_PRIVATE_KEY` (and `FIREBASE_CLIENT_EMAIL` if the account changed) in production, preview, any GitHub Actions secrets, and local `.env.local`; redeploy. Never paste values into tickets, chat or logs.
- [ ] Delete ALL old keys; confirm `gcloud iam service-accounts keys list` shows only the new one.
- [ ] Run the Cloud Audit Logs queries in the runbook (step 4) for activity since 2026-03-08; write the result into the RT-01 ticket, noting whether Data Access logs were enabled.
- [ ] Enable GitHub secret scanning and push protection (Settings > Advanced Security); close any alert for the old key as Revoked.
- [ ] Optional, after the above: scrub history with `git filter-repo` (runbook step 7) with a coordinated force-push and re-clone. Skip if the repo is private and the old key is dead. The CI `gitleaks` job (RT-08, `fetch-depth: 0`) will flag the old commits until you scrub or add the one-commit allowlist described in runbook step 6.
- [ ] Securely delete the downloaded JSON key file from disk.

## RT-03
- [ ] Generate a random secret (at least 32 bytes) and set `LANDING_VISITOR_COOKIE_SECRET` in production and preview. Until it is set the landing chat returns 503. Never commit it.
- [ ] Make sure `LANDING_ORG_ID` is set to a dedicated organization doc with `subscriptionStatus: active` and an `aiBudgetLimit` you are happy to lose; when it is unset or exhausted the landing chat now returns 503 instead of spending uncapped.
- [ ] Optionally set `LANDING_DAILY_CAP` (default 2000 messages/day).
- [ ] Create a log-based alert in Cloud Logging for `[Landing Chat] ALERT` (80% budget, daily cap reached).
- [ ] The app must be deployed on Vercel for per-IP limits to be effective: the client IP is read only from `x-vercel-forwarded-for` / `x-real-ip`. Elsewhere (no such header) per-IP limiting is skipped and only the signed cookie and the global daily cap protect the route.
- [ ] Confirm Firestore rules deny client access to `landing_daily` and `landing_visitors` (they are written only via the Admin SDK; no rule changes were made).

## RT-07
- Teachers will now see AI-graded submissions land in `pending_review` when an answer looks like prompt injection, or gets full marks while being very short and absent from the reference. Decide whether the teacher UI should surface `reviewFlag` / `aiSuggestedScore` on those answers (stored on the answer in `submissions.answers[]`) and whether the thresholds (12-char answer, 40-char question) suit your question styles.
- Out-of-range model scores used to be silently clamped to 10; they now go to review. Watch the `pending_review` rate with `gradingError` text "Invalid grading response" after deploy of the functions.

## RT-14: deploy rules (human-only)
- After merge, deploy `firestore.rules` and `storage.rules` (`firebase deploy --only firestore:rules,storage`). Deploy the web app first or together: the old client writes teacher uploads to `submissions/` (still allowed for non-video files), and the new client writes to `resources/`, which only the new storage rules allow.
- Check for existing `notebooks`/`tutor_sessions` docs that have a `studentId` different from their id-as-uid (possible squatted docs) before or after deploy.
