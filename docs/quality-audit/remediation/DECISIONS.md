# Decisions

| Item | Decision | Source |
|---|---|---|
| Uncommitted audit/package files | Tree was clean at start; audit docs, stryker, package.json were already committed in f894a61. Nothing to stash. | observed |
| Lockfile | Resync with `npm install --package-lock-only` as first commit (npm ci broken at HEAD). No dependency versions changed by hand. | orchestrator |
| Gate Node version | Node 22.22.0 (matches `functions` engines). Not answered by user; conservative default. | default |
| RT-11 trusted IP source | Vercel (`x-vercel-forwarded-for` / `x-real-ip`); unknown/absent header falls back to no trust. | user |
| RT-09 CSP | Report-only. | user |
| RT-02 / RT-20 dependency bumps | Majors allowed if Gate stays green; each major isolated, reverted on any regression. | user |
| RT-21 / G-003 new free network default | **Pending**: user asked what "register flow" is. Until answered: keep `'none'`/0 (no behaviour change). | default |
