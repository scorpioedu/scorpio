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
