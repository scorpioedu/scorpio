# COV-90: Jest coverage push (branch `coverage/90pct`)

## Result
| Metric | Before | After |
|---|---|---|
| Statements | 64.48% (2212/3430) | **94.43%** (3239/3430) |
| Branches | 50.58% | **92.43%** (3105/3359) |
| Functions | 68.05% | 93.50% |
| Lines | 65.51% | 94.82% |
| Jest | 904 tests / 60 suites | 1731 tests / 93 suites |

Gate (`gate.sh`, run with `GATE_PORT_OFFSET=100` because an orphan emulator held the default ports): tsc root and functions, Jest, security 94/94, ESLint 20 errors / 168 warnings (unchanged), `next build` all pass.
`baseline-counts.json` ratcheted: `jestCoveragePctStatements` 94.43, `jestTests` 1731, `jestSuites` 93.

## What the figures mean (read this)
Jest has no `collectCoverageFrom`, so the figure counts only the 102 files that tests import. **Statements (94.43%) and branches (92.43%) are both above 90% on that set.** Counting every file under `src/` and `functions/src/`, coverage was 15.6% (2,094/13,413) before this push; 223 files, mostly React pages and components, are untested. Covering them needs `jest-environment-jsdom` and Testing Library, which are not installed and were not added. I deliberately did not add `collectCoverageFrom` (it would drop the ratcheted number to roughly 16-20% and break the ratchet's meaning). It is a separate decision.

## What was added
New test files only (`__tests__/cov-*.test.ts` and `cov2-*.test.ts`, 28 files, ~827 tests), all mocked (no live Firebase/Gemini/Polar/email):
- `src/lib`: firebase, assignment-parser, utils, ai/assignment, ai/utils, ai/grading, landing-visitor.
- `functions/src`: grading, grading-runner, metering, reservations (in-memory Firestore fake).
- API routes: teacher network (membership, portfolio, invites), auth (register, teacher-code, session), courses, student enrollment/tutor, cleanup, grade, assignments, submissions, ai/*, chat/*, notebook/chat, checkout, support/report, admin/firestore, github/stats.

No source files or existing tests were changed.

## Config changes (hygiene, not weakening)
`jest.config.js`, `jest.security.config.cjs` and `eslint.config.mjs` now ignore `.claude/`. Leftover agent worktrees there were being picked up by Jest (192 failing suites), the security run (2,562 tests instead of 94) and ESLint.

## Not covered
`department-banner.tsx` (34%), `use-modal-a11y.ts` (30%), `tools/backfill-claims.cjs` (48%), `tools/set-admin-claim.cjs` (55%), `ai/assignment.ts` dead recovery code, plus unreachable wrapper-duplicated branches in a few routes. Remaining uncovered branches are mostly unreachable optional-chain/default branches (guarded by earlier checks or the auth wrapper) and `tools/*.cjs` `main()`. Bugs and oddities found are in `FOLLOWUPS.md` under COV-90.
