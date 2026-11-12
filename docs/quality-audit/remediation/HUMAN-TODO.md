# Human-only follow-ups

## RT-08 step 5: require CI in branch protection
In GitHub: Settings > Branches > branch protection rule for `main` > "Require status checks to pass before merging". Select the CI jobs `typecheck`, `jest`, `security`, `build` and `gitleaks`. Leave `eslint` and `audit` unselected: they are `continue-on-error` until the lint baseline (RT-31) and the advisories (RT-02) are cleared; then remove `continue-on-error` and require them too.
Also enable "Require branches to be up to date before merging".
