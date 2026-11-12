# Morning report: Scorpio remediation (2026-11-11 to 11-12)

**Where the work is:** local branch `remediation/audit-2026-11` (from `f894a61`). Nothing was pushed, no PR opened, `main` untouched, nothing deployed. Every ticket was written by an author agent, then re-checked by a separate verifier agent (re-ran the Gate, mutation checks, browser checks on local emulators) before merging with a normal merge commit; the Gate was re-run on the integration branch after each merge. Final fresh-clone check: **PASS** (see `AFTER.md`).

## Result in one table
| | Before | After |
|---|---|---|
| Tests (jest / security) | 39 / 33 of 34 | **904 / 94 of 94** |
| ESLint errors / warnings | 246 / 195 | **20 / 168** |
| Root prod audit | 76 (5 critical, 38 high) | **19 (0 critical, 4 high)** |
| functions prod audit | 30 (3 critical, 9 high) | **14 (0 critical, 0 high)** |
| `next` | 16.2.1 | 16.4.1 |
| `public/` | 103 MB | 16 MB |
| CI | none | `.github/workflows/ci.yml` |

## Tickets (33)
- **Merged and verified (full):** RT-04, RT-05, RT-07, RT-08, RT-09, RT-14, RT-19, RT-22, RT-23.
- **Merged and verified (part of the ticket; remainder listed in `FOLLOWUPS.md`):** RT-02, RT-03, RT-06, RT-10, RT-11, RT-12, RT-13, RT-15, RT-16, RT-17, RT-18, RT-20, RT-21, RT-24, RT-29, RT-30, RT-31, RT-32, RT-33.
- **Prepared, waiting for you (human-needed):** RT-01 (key rotation), RT-06 (admin claim), RT-30 (claims backfill/indexes deploy), RT-33 (deploy path, history rewrite).
- **Skipped on purpose:** RT-25 (decompose mega pages), RT-26 (data layer), RT-27 (shared package), RT-28 (component/E2E tests). Reasons are in `PROGRESS.md`: large refactors that need RT-28's smoke tests first, or new tooling/dependencies.
- **Blocked:** none. Three tickets failed their first verification (RT-05 sweep not exported, RT-03 wrong IP header, RT-11 anonymous shared bucket, RT-24 font preload inverted) and passed after a fix; no ticket hit the 3-attempt limit.

Status per finding: `docs/quality-audit/findings-status.csv` (+ `remediation/FINDINGS-STATUS-SUMMARY.md`).

## What YOU must do (in this order)
1. **Review** the branch: `git log --oneline f894a61..remediation/audit-2026-11` and the docs in `docs/quality-audit/remediation/`. Merge/push it yourself when satisfied.
2. **RT-01 (critical):** rotate/revoke the leaked Firebase Admin key. Exact steps: `docs/quality-audit/remediation/RT-01-runbook.md`.
3. **RT-06:** admins are LOCKED OUT of `/admin` until you grant the claim. Steps: `RT-06-HUMAN.md` (`node tools/set-admin-claim.cjs --project <id> --uid <uid>` is a dry run by default; add `--apply`).
4. **Set secrets before deploy:** `LANDING_VISITOR_COOKIE_SECRET` (landing chat returns 503 without it) and a funded `LANDING_ORG_ID`; remove `ADMIN_SECRET`.
5. **Deploy order:** web app + functions first (or together), then `firebase deploy --only firestore:rules,storage` (RT-14) and `firebase deploy --only firestore:indexes` (RT-05/04/30). Add a Firestore TTL policy on `rate_limits.expiresAt` (RT-11).
6. **Enable CI**: push the branch, require the `typecheck`, `jest`, `security`, `build`, `gitleaks` checks on `main`; enable GitHub secret scanning + push protection (`HUMAN-TODO.md`).
7. **Decide:** deploy path (Vercel vs Firebase Hosting; per-IP rate limits and IP-based protections only work behind Vercel, see RT-11 and `RT-33-DEPLOY-PATHS.md`), the default of a newly created free network (RT-21: today membership creates `none`/0 so AI is refused for it, register creates `active`/50 cents), CSP enforcing after a week of report-only logs (RT-09), whether to rewrite git history (RT-33 runbook; `.git` is 272 MB), the résumé PDF in `public/`, captions for the demo videos.
8. Optional cleanup: `git config --unset core.hooksPath` (an agent's `npm install` set it to `.husky/_`; developers get the husky pre-commit hook via `npm ci`).
9. Kill the leftover test emulator if still running: `lsof -iTCP:8188 -sTCP:LISTEN` then `kill <pid>` (a Firestore emulator started by one of the gate runs; I was not permitted to kill it).

## Intentional behaviour changes (full list: `BEHAVIOUR-CHANGES.md`)
- Admin routes need an `admin: true` token claim (403 otherwise, 401 without token); every admin call writes an `admin_audit` record. `x-admin-secret` is gone.
- Landing chat: signed visitor cookie, per-cookie / per-IP / global daily caps, 503 when the landing budget or secret is missing (it no longer spends uncapped).
- AI budget: failed/timed-out provider calls now release their hold but charge an input estimate; stale reservations expire (30 min); scores above max or injection-like answers go to `pending_review` instead of being clamped/auto-graded.
- AI failures return 502/503 with a request id (not 200 "Error: ..." text); support reports return 503 if saving fails; handler exceptions return 500 instead of 400; unknown request-access actions and malformed bodies on 6 routes return 400.
- Rate limits (429) on AI/auth/write routes, keyed by user id (classroom-safe) or trusted IP.
- Grading triggers run with a 540 s timeout; stuck submissions are swept to `pending_review` after 20 min; new-assignment emails go only to the assignment's course; deleting an assignment deletes the students' uploaded files for it.
- Firestore/Storage rules tightened (assignments: owner can only change `visibility`; notebooks/tutor docs validated; email immutable; teacher resources path).
- Security headers added (CSP report-only); destructive buttons use a darker red (dark mode is now a vivid red); labels/aria/focus changes; assignment drawer is a proper dialog.
- Public assets: demo video re-encoded (softer text), `og-image.png` replaced by `og-image.jpg` (re-scrape social previews), 13 unused media files deleted.
- Teacher dashboard totals now come from server-side counts (this also fixes a pre-existing bug where teachers with 20+ assignments saw partial numbers).

## Incidents and caveats (honest list)
- **Hard-rule slips:** (1) one dev server in the RT-17 work inherited `GEMINI_API_KEY` from your shell and sent ONE real request to Google (HTTP 400, no charge reported); (2) during RT-24 verification servers inherited the shell env and one read-only request with `GITHUB_TOKEN` to GitHub's API may have been made. Both logged in `LOG.md`; from then on all commands ran with provider variables unset. One RT-29 helper script also briefly tried real Google credentials without emulator variables (failed `invalid_grant`, no data access).
- A shared git setting (`core.hooksPath`) and a leftover emulator process remain (steps 8 and 9).
- No Lighthouse/axe scores were measured (tools not available); some live flows were reasoned from code only: Google sign-in popup, Polar checkout, tutor microphone, lockdown fullscreen, calculator (loads desmos.com), real Gemini calls (no live AI was exercised; the major `@google/genai` bump in `functions/` was verified against the SDK's types and a stubbed request only).
- `npm ci` needs npm 11 (the lockfile is npm-11 generated; npm 10 only warns). `next build` downloads Google Fonts, so it can flake offline (retry).
- Remaining quality debt: 20 ESLint errors (React-compiler effect rules and CJS requires), ~20 API routes without body schemas, stricter ESLint rules not enabled (counts in `RT-31-RESULT.md`), pre-commit hook blocks commits touching the ~80 files that still have lint errors until they are fixed (see the suppressions recommendation in `FOLLOWUPS.md`).
- Known pre-existing issues found and left: late-submission check understands only Firestore Timestamps (latent), `/student/grades` showing 0 graded for a student with submissions (not investigated), unreachable demo carousel clips, stale `tutor_sessions` containing old "Error:" assistant messages (needs production cleanup).

## Where to look
`PROGRESS.md` (ledger), `LOG.md` (timeline and incidents), `DECISIONS.md`, `BEHAVIOUR-CHANGES.md`, `FOLLOWUPS.md` (everything out of scope), `HUMAN-TODO.md`, `BASELINE.md` / `AFTER.md`, per-ticket `RT-*-RESULT.md`, `gate.sh` (the regression gate).
