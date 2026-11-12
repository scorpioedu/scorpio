# Progress ledger

Statuses: todo / in-progress / verifying / merged / blocked / human-needed / skipped

| Ticket | Status | Branch | Commit | Gate | Verifier | Notes |
|---|---|---|---|---|---|---|
| RT-01 | human-needed | rt-01-runbook | 8f76777 (merged) | n/a (docs) | orchestrator reviewed (no key material) | runbook prepared; owner must rotate key |
| RT-02 | merged (partial) | rt-02-dependency-patching | f40e808 (merge) | PASS | PASS | next 16.4.1, tiptap 3.30.5, functions clean; root still 1 critical/32 high (mostly unused vercel CLI tree -> RT-20); eslint-config-next held back; genai 3.2.0 verified by stub only, no live call |
| RT-03 | merged (human step pending) | rt-03-landing-spend | c164c5b (merge) | PASS | PASS (2nd attempt) | verifier 1 flagged IP header vs Vercel decision; fixed. Owner must set LANDING_VISITOR_COOKIE_SECRET + LANDING_ORG_ID budget, else landing chat returns 503 |
| RT-04 | merged | rt-04-reservation-lifecycle | c23fec6 (merge 66f0ea5) | PASS | PASS | failed provider calls now charge input estimate; stale holds expire in 30-45 min; index must be deployed |
| RT-05 | merged | rt-05-grading-timeout | 8ac99af (merge 139d0b2) | PASS | PASS (2nd attempt) | verifier 1 FAILED (sweep not exported); fixed; sweep skips manual assignments |
| RT-06 | merged (human step pending) | rt-06-admin-auth | 9a55fb7 (merge) | PASS | PASS | Owner must run set-admin-claim per RT-06-HUMAN.md or admins are locked out; research.ts shim is a follow-up; audit-spam by signed-in users in FOLLOWUPS |
| RT-07 | merged | rt-07-grading-hardening | fe5d34d (merge) | PASS | PASS | scores >max now go to pending_review; dependency-free validator instead of zod in functions; teacher UI does not show reviewFlag yet (FOLLOWUPS) |
| RT-08 | merged | rt-08-ci-stale-test | eed8cfa (merge b082c73) | PASS | PASS | CI workflow, typecheck, stale test fixed; npm10 lockfile caveat in FOLLOWUPS |
| RT-09 | merged | rt-09-security-headers | 579ab24 (merge) | PASS | PASS | CSP report-only per owner; XFO SAMEORIGIN (research PDF iframe); csp-report body cap trusts Content-Length (FOLLOWUPS) |
| RT-10 | merged (partial) | rt-10-pii-scrubbing | 9f38e53 (merge) | PASS | PASS | emails scrubbed centrally; roster names only where caller supplies them (withScrubNames not wired into contact-level routes); phones/ids not masked there |
| RT-11 | merged | rt-11-rate-limits | cc56f74 (merge) | PASS | FAIL on 5c5ccc7 (no-IP shared bucket), fixed in cc56f74; delta reviewed by orchestrator + integration gate | per-IP limits effective only behind Vercel; TTL policy on rate_limits.expiresAt is a human step |
| RT-12 | merged (partial: 6 routes) | rt-12-zod-schemas | 4923f3a (merge) | PASS | PASS | ~20 other routes unschematised (FOLLOWUPS); chat message cap 2000 |
| RT-13 | merged (partial) | rt-13-auth-errors | 648474d (merge) | PASS | PASS | handler throw now 500 not 400; ai-parse/generate/rubric billing types; ctx arg additive, routes not yet converted; notebook counter unification not done |
| RT-14 | merged | rt-14-rules | ccf7d82 (merge) | PASS (shifted ports) | PASS | rules must be deployed by owner (HUMAN-TODO); resources upload mime allowlist narrower (md/html rejected) |
| RT-15 | merged (partial) | rt-15-client-effects | 1bc20a3 (merge) | PASS | PASS | per-student Copilot counter not server-maintained (FOLLOWUPS); timer grace now submits; 3 items skipped (mega pages, carousel) |
| RT-16 | merged (partial) | rt-16-cwv | efce093 (merge) | PASS | CONDITIONAL PASS (a11y finding fixed by orchestrator) | lazy chatbot/markdown; auth only on app routes; Firestore/App Check still eager on login; /student 580KB gz (target 450); Lighthouse not run |
| RT-17 | todo | | | | | |
| RT-18 | merged (partial) | rt-18-functions | 06c798e (merge) | PASS | PASS | emails only same-course students; at-most-once claim; storage cleanup scoped to submissions/<studentId>/; functions/ "npm test" script not added (tests in root) |
| RT-19 | todo | | | | | |
| RT-20 | todo | | | | | |
| RT-21 | merged (decision pending) | rt-21-budget-policy | 87fb74e (merge) | PASS | PASS | new-network default left as today (membership none/0, register active/50); owner decision in HUMAN-TODO; pre-check tightened for 2 cases already refused at reservation |
| RT-22 | in-progress | rt-22a-emulator-wiring | 0cf3c95 (merge) | PASS | PASS (part 1) | part 1 merged: engines, .nvmrc, env names, emulator wiring+alt ports. Part 2 (husky/prettier/lint-staged, zod env, README) todo |
| RT-23 | merged | rt-23-error-boundaries | cf68642 (merge) | PASS | PASS | boundaries only log digest; no error-reporting service yet |
| RT-24 | todo | | | | | |
| RT-25 | todo | | | | | |
| RT-26 | todo | | | | | |
| RT-27 | todo | | | | | |
| RT-28 | todo | | | | | |
| RT-29 | todo | | | | | |
| RT-30 | todo | | | | | |
| RT-31 | todo | | | | | |
| RT-32 | todo | | | | | |
| RT-33 | todo | | | | | |
