# Human-only follow-ups

## RT-08 step 5: require CI in branch protection
In GitHub: Settings > Branches > branch protection rule for `main` > "Require status checks to pass before merging". Select the CI jobs `typecheck`, `jest`, `security`, `build` and `gitleaks`. Leave `eslint` and `audit` unselected: they are `continue-on-error` until the lint baseline (RT-31) and the advisories (RT-02) are cleared; then remove `continue-on-error` and require them too.
Also enable "Require branches to be up to date before merging".

## RT-06: grant the admin claim (admins are locked out until you do this)
`ADMIN_SECRET` and the `x-admin-secret` header no longer work. `/admin`, `/research/admin` and the four admin API routes now need a Firebase ID token with the custom claim `admin: true`. Until you run `tools/set-admin-claim.cjs` against your real project, nobody can use those pages. Exact steps are in `docs/quality-audit/remediation/RT-06-HUMAN.md`. Also remove `ADMIN_SECRET` from Cloud Run / hosting env once the new build is live.
