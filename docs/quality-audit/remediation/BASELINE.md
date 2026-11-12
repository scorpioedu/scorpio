# Baseline (HEAD f894a61, 2026-11-11, Node 22.22.0 / npm 10 via nvm; run in a clean git worktree)

| Gate | Result | Notes |
|---|---|---|
| `npm ci` (root) | **FAILS at HEAD** | Lockfile out of sync after stryker was added (`@emnapi/*` missing/invalid), on npm 10 and npm 11. Fixed by `npm install --package-lock-only` (lockfile-only, +63/-3 lines), committed first on the integration branch. |
| `npm ci` (functions) | pass | |
| `tsc --noEmit` root / functions | pass / pass | |
| `jest` | 10/10 suites, 39/39 tests | statements coverage 45.64%, branches 36.98%, functions 43.93%, lines 46.90% |
| `test:security` (emulators 8188/9298) | 3/4 suites, 33/34 tests | Only failure: "concurrent budget reservations cannot exceed the cap; settlement is idempotent" (stale 0.28 expectation, fixed by RT-08). Listed in `expected-failures.txt`. |
| `next build` | pass **only with NEXT_PUBLIC_FIREBASE_* set** | In a fresh worktree there is no `.env.local`, so prerender throws `auth/invalid-api-key`. Gate supplies dummy public values. Not a regression, but note: a clean CI checkout needs these vars (RT-08 CI must set dummies). |
| ESLint (`eslint .`) | 246 errors / 195 warnings | matches audit. Gate ignores `.next-gate/` and `coverage/` (generated). |
| `npm audit --omit=dev` | 76 vulns (6 low, 27 moderate, 38 high, 5 critical) | |

Surprises vs. the brief: (1) root `npm ci` broken, (2) build needs env vars in a clean checkout. Gate wall time about 3 min.
