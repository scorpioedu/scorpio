# COV-90: Jest coverage push (branch `coverage/90pct`)

## Result
| Metric | Before | After |
|---|---|---|
| Statements | 64.48% (2212/3430) | **93.03%** (3191/3430) |
| Branches | 50.58% | **86.09%** (2892/3359) |
| Functions | 68.05% | 92.72% |
| Lines | 65.51% | 93.70% |
| Jest | 904 tests / 60 suites | 1498 tests / 76 suites |

Gate (`gate.sh`, run with `GATE_PORT_OFFSET=100` because an orphan emulator held the default ports): tsc root and functions, Jest, security 94/94, ESLint 20 errors / 168 warnings (unchanged), `next build` all pass.
`baseline-counts.json` ratcheted: `jestCoveragePctStatements` 93.03, `jestTests` 1498, `jestSuites` 76.

## What the 93% means (read this)
Jest has no `collectCoverageFrom`, so the figure counts only the 102 files that tests import. **Statements are 90%+ on that set; branches are not (86.09%).** Counting every file under `src/` and `functions/src/`, coverage was 15.6% (2,094/13,413) before this push; 223 files, mostly React pages and components, are untested. Covering them needs `jest-environment-jsdom` and Testing Library, which are not installed and were not added. I deliberately did not add `collectCoverageFrom` (it would drop the ratcheted number to roughly 16-20% and break the ratchet's meaning). It is a separate decision.

## What was added
New test files only (`__tests__/cov-*.test.ts`, 16 files, ~594 tests), all mocked (no live Firebase/Gemini/Polar/email):
- `src/lib`: firebase, assignment-parser, utils, ai/assignment, ai/utils, ai/grading, landing-visitor.
- `functions/src`: grading, grading-runner, metering, reservations (in-memory Firestore fake).
- API routes: teacher network (membership, portfolio, invites), auth (register, teacher-code, session), courses, student enrollment/tutor, cleanup, grade, assignments, submissions, ai/*, chat/*, notebook/chat, checkout, support/report, admin/firestore, github/stats.

No source files or existing tests were changed.

## Config changes (hygiene, not weakening)
`jest.config.js`, `jest.security.config.cjs` and `eslint.config.mjs` now ignore `.claude/`. Leftover agent worktrees there were being picked up by Jest (192 failing suites), the security run (2,562 tests instead of 94) and ESLint.

## Not covered
`department-banner.tsx` (34%), `use-modal-a11y.ts` (30%), `tools/backfill-claims.cjs` (48%), `tools/set-admin-claim.cjs` (55%), `ai/assignment.ts` dead recovery code, plus unreachable wrapper-duplicated branches in a few routes. Remaining branch gap is mostly optional-chaining/default-value branches; closing it to 90% would mean low-value tests. Bugs and oddities found are in `FOLLOWUPS.md` under COV-90.
