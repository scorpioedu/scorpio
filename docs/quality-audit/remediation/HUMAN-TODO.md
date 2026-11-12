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

## RT-21: default of a newly created free network (G-003) - OPEN QUESTION
- Decide what a newly created free network gets. Today `/api/auth/register` creates it `active` with a 50 cent AI budget, while `/api/teacher/network/membership` (action `create`) creates it `none` with a 0 budget, so AI is refused for it. Both are kept as-is.
- To change: edit the `membership` preset (one line) in `src/lib/organization-defaults.ts` and update `__tests__/organization-defaults.test.ts`.
## RT-09: security headers (human-only)
- After one week of `[csp-report]` log lines in production with nothing unexpected, switch the CSP to enforcing: rename `Content-Security-Policy-Report-Only` to `Content-Security-Policy` in `src/lib/security-headers.cjs`. Before that, replace `'unsafe-inline'` in `script-src` with a nonce/hash (see FOLLOWUPS), otherwise enforcement gives little XSS protection.
- HSTS is `max-age=63072000; includeSubDomains` with no `preload`. Make sure every subdomain of the production domain serves HTTPS before deploying. Do not add `preload` or submit to hstspreload.org unless you accept that it is very hard to undo.
- The headers come from `next.config.mjs`, which Vercel applies. `firebase.json` has a `hosting` block with `frameworksBackend`; if the app is ever deployed through Firebase Hosting instead, check the headers are present with `curl -I` (Firebase's framework backend normally forwards Next headers, but its static `headers` entries in `firebase.json` would then also need the same values).
- Real-browser check on the deployed site: Google sign-in popup, App Check reCAPTCHA, Polar checkout redirect, Desmos calculator, tutor microphone and lockdown fullscreen. Only the first three origins were reasoned from code, not exercised (demo Firebase env, no Polar token).

## RT-11: rate limits (human-only)
- Firestore TTL policy: in the Firebase console (Firestore > Time-to-live) add a policy on collection group `rate_limits`, field `expiresAt`. New buckets carry it (window end); old documents without it are never deleted by the policy and can be removed once by hand. Without a policy the collection only grows (one small document per user/route/IP); nothing breaks.
- No composite index is needed (all access is by document id).
- Confirm production runs on Vercel so `x-vercel-forwarded-for` is set. Per-IP limiting is only effective behind Vercel. On Firebase Hosting (the documented deployment) there is no trusted client IP, so only generous global caps apply (600/min for teacher-code validate and request-access, none for github/stats): brute-force protection of invite codes is weak there. Supply a trusted header (or move to Vercel) and tell us which one, and `getClientIp` can read it.

## RT-24: media (owner actions)
- Landing/demo videos are 300 s of screen recording squeezed to about 4.6-4.9 MB (720p, CRF 35 H.264 / CRF 49 VP9). If sharper text is wanted, re-export from the original recording and host the file in Firebase Storage or a CDN rather than in `public/`.
- Deleted files stay in repository history (about 85 MB of videos/images). Shrinking clone size needs a history rewrite coordinated by the owner.
- Social crawlers cache `/og-image.png`; re-scrape with the Facebook Sharing Debugger / LinkedIn Post Inspector after deploy.

## RT-29: bounded reads (owner actions)
- No index deploy needed: the new count queries use equality filters only (index merging). Nothing was added to `firestore.indexes.json`.
- Decision for the rules owner (RT-30): the `submissions` read rule uses `ownsAssignment(resource.data.assignmentId)`, so on the emulator Firestore denies any teacher query over several assignments (`in`), which makes the gradebook "All assignments" view and the old dashboard query silently return nothing (confirm on a staging project). Fixing it needs a server-written `teacherId` on submissions (backfill) and a read rule on `resource.data.teacherId == request.auth.uid`; the dashboard can then count with 4 queries in total instead of 4 per assignment (raise `SUBMISSION_QUERY_CHUNK` or filter on `teacherId`).
