# AFTER (integration branch `remediation/audit-2026-11`, 2026-11-12, Node 22.22.0 / npm 11, fresh clone + `npm ci`)

Measured from a fresh local clone of the integration branch with provider credentials unset. Baseline: `BASELINE.md` (HEAD f894a61).

| Metric | Before | After |
|---|---|---|
| `tsc --noEmit` root / functions | pass / pass | pass / pass |
| Jest | 10 suites, 39 tests | **60 suites, 904 tests** (all pass) |
| Jest coverage (statements / branches / functions / lines) | 45.64 / 36.98 / 43.93 / 46.90 | **64.48 / 50.58 / 68.05 / 65.51** |
| Security (emulator) tests | 33 pass, 1 fail (stale budget test) | **94 pass, 0 fail** |
| ESLint errors / warnings | 246 / 195 | **20 / 168** (`no-explicit-any` 131 -> 0) |
| `next build` | pass (needs NEXT_PUBLIC_FIREBASE_* in clean checkout) | pass (same) |
| `npm audit --omit=dev` root | 76 (5 critical, 38 high, 27 moderate, 6 low) | **19 (0 critical, 4 high, 9 moderate, 6 low)** |
| `npm audit --omit=dev` functions | 30 (3 critical, 9 high) | **14 (0 critical, 0 high, 10 moderate, 4 low)** |
| `next` | 16.2.1 (critical advisories) | **16.4.1** |
| `public/` size | 103 MB | **16 MB** |
| `.git` size | 272 MB | 272 MB (history rewrite is a human step, RT-33) |
| CI | none | `.github/workflows/ci.yml` (typecheck, eslint, jest, security, build, audit, gitleaks) |
| `npm ci` from clean clone | **failed at HEAD** (lockfile out of sync) | works (needs npm 11; npm 10 only warns) |

Not measured: Lighthouse / LCP / axe scores (no tooling in this environment); bundle effects are shown as gzipped First Load JS deltas in `RT-16-RESULT.md` (e.g. /student 714 -> 580 KB, /teacher 617 -> 485 KB).

The 4 remaining high root advisories all come from `firebase@12` pinning `@grpc/grpc-js ~1.9` (client SDK; reachability notes in `RT-20-RESULT.md`). Remaining ESLint errors: 14 React-compiler effect/render rules (timing-sensitive, intentionally not touched) and 6 CommonJS `require` in tool/config files.

Gate wall time ~3 min (`docs/quality-audit/remediation/gate.sh`).
