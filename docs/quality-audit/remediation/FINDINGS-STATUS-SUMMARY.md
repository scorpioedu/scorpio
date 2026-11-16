# Findings status after remediation

Generated from `docs/quality-audit/findings-status.csv` (132 findings from `findings.csv`, three added columns: `status`, `ticket`, `note`).
Status rules: `fixed` only when the merged ticket's acceptance for that finding was met; `partially` when only part was merged or a follow-up records a remaining part; `human-needed` when the code side is done or prepared and the remaining step is a human one (key rotation, admin claim script, deploying rules/indexes, setting env secrets, history rewrite, claims backfill, owner decisions); `blocked` for attempted-but-failed items (none); `open` when no ticket touched the finding or its ticket item was skipped.

## Totals

| Status | Count |
|---|---|
| fixed | 43 |
| partially | 32 |
| human-needed | 13 |
| blocked | 0 |
| open | 44 |
| **total** | **132** |

## By severity

| Severity | fixed | partially | human-needed | blocked | open | total |
|---|---|---|---|---|---|---|
| Critical | 0 | 0 | 1 | 0 | 0 | 1 |
| High | 2 | 1 | 4 | 0 | 0 | 7 |
| Medium | 34 | 24 | 7 | 0 | 13 | 78 |
| Low | 7 | 7 | 1 | 0 | 20 | 35 |
| Info | 0 | 0 | 0 | 0 | 11 | 11 |

## Per-ticket breakdown

Ticket status is from `remediation/PROGRESS.md`. Counts are findings whose `ticket` column names the ticket (the primary covering ticket; secondary tickets are named in the note). `(none)` = findings no ticket covers.

| Ticket | Progress status | fixed | partially | human-needed | blocked | open | total | Findings |
|---|---|---|---|---|---|---|---|---|
| RT-01 | human-needed | 0 | 0 | 1 | 0 | 0 | 1 | C-001 |
| RT-02 | merged (partial) | 0 | 1 | 0 | 0 | 0 | 1 | C-005 |
| RT-03 | merged (human step pending) | 0 | 0 | 1 | 0 | 0 | 1 | F-002 |
| RT-04 | merged | 0 | 0 | 1 | 0 | 0 | 1 | F-004 |
| RT-05 | merged | 2 | 0 | 0 | 0 | 0 | 2 | K-001, K-005 |
| RT-06 | merged (human step pending) | 0 | 0 | 1 | 0 | 0 | 1 | C-003 |
| RT-07 | merged | 2 | 1 | 0 | 0 | 0 | 3 | F-001, E-006, F-006 |
| RT-08 | merged | 1 | 0 | 1 | 0 | 0 | 2 | L-001, E-001 |
| RT-09 | merged | 0 | 1 | 0 | 0 | 0 | 1 | C-007 |
| RT-10 | merged (partial) | 0 | 2 | 0 | 0 | 0 | 2 | C-008, K-004 |
| RT-11 | merged | 1 | 0 | 0 | 0 | 0 | 1 | C-002 |
| RT-12 | merged (partial: 6 routes) | 0 | 3 | 0 | 0 | 0 | 3 | G-001, G-005, G-009 |
| RT-13 | merged (partial) | 0 | 2 | 0 | 0 | 0 | 2 | F-008, G-004 |
| RT-14 | merged | 0 | 1 | 3 | 0 | 0 | 4 | D-002, D-003, D-005, D-006 |
| RT-15 | merged (partial) | 3 | 2 | 0 | 0 | 0 | 5 | D-001, H-001, H-002, H-003, H-004 |
| RT-16 | merged (partial) | 1 | 3 | 0 | 0 | 0 | 4 | I-018, I-019, I-020, I-021 |
| RT-17 | merged (partial) | 2 | 1 | 0 | 0 | 0 | 3 | C-009, F-003, G-006 |
| RT-18 | merged (partial) | 2 | 2 | 0 | 0 | 0 | 4 | E-005, K-002, K-003, K-007 |
| RT-19 | merged | 6 | 1 | 0 | 0 | 0 | 7 | E-002, E-003, E-004, E-007, E-008, E-016, E-017 |
| RT-20 | merged (partial) | 3 | 1 | 0 | 0 | 0 | 4 | J-001, J-003, J-004, J-005 |
| RT-21 | merged (decision pending) | 1 | 0 | 1 | 0 | 0 | 2 | B-003, G-003 |
| RT-22 | merged | 6 | 1 | 0 | 0 | 0 | 7 | L-003, L-004, L-005, L-012, J-006, L-010, L-013 |
| RT-23 | merged | 1 | 0 | 0 | 0 | 0 | 1 | H-013 |
| RT-24 | merged (partial) | 4 | 2 | 0 | 0 | 0 | 6 | I-001, I-002, I-004, I-006, I-003, I-005 |
| RT-25 | skipped | 0 | 0 | 0 | 0 | 3 | 3 | A-002, A-005, B-001 |
| RT-26 | skipped | 0 | 0 | 0 | 0 | 1 | 1 | B-005 |
| RT-27 | skipped | 0 | 0 | 0 | 0 | 2 | 2 | B-002, B-009 |
| RT-28 | skipped | 0 | 0 | 0 | 0 | 1 | 1 | E-009 |
| RT-29 | merged (partial) | 1 | 1 | 0 | 0 | 2 | 4 | I-012, I-013, I-014, I-015 |
| RT-30 | partial (indexes done; claims prepared, awaiting human) | 0 | 0 | 1 | 0 | 0 | 1 | D-007 |
| RT-31 | merged (partial) | 1 | 3 | 0 | 0 | 3 | 7 | A-001, A-003, A-004, H-005, H-006, A-007, A-008 |
| RT-32 | merged (partial) | 6 | 2 | 1 | 0 | 0 | 9 | M-001, M-002, M-003, M-004, M-005, M-006, M-007, M-009, M-011 |
| RT-33 | partial (history rewrite human-needed) | 0 | 2 | 2 | 0 | 2 | 6 | L-002, L-007, C-011, L-006, L-008, L-009 |
| (none) |  | 0 | 0 | 0 | 0 | 30 | 30 | C-006, F-005, G-008, I-007, A-006, B-006, B-008, B-012, C-010, E-012, E-013, G-002, H-010, H-011, H-015, I-016, K-006, K-008, M-010, B-010, B-011, E-014, E-015, H-012, H-016, I-010, I-017, L-011, M-008, M-012 |

## Human-needed items

- C-001 (RT-01): RT-01 runbook merged (RT-01-runbook.md) but nothing was rotated; owner must create a new key, delete old keys and review audit logs.
- C-003 (RT-06): RT-06 merged: admin routes use admin:true claim plus admin_audit, but admins are locked out until the owner runs tools/set-admin-claim.cjs; per-admin throttle and collection trimming are follow-ups.
- F-002 (RT-03): RT-03 merged: landing fails closed with signed cookie, daily cap and 512-token cap, but route returns 503 until the owner sets LANDING_VISITOR_COOKIE_SECRET and LANDING_ORG_ID budget.
- F-004 (RT-04): RT-04 merged: failed provider calls settle an estimate and expireStaleReservations sweeps holds after 30 min, but the ai_reservations (status, createdAt) index must be deployed by the owner.
- L-001 (RT-08): RT-08 merged: ci.yml runs typecheck, jest, security, build, gitleaks, but the owner must require the checks in branch protection (eslint/audit are non-blocking, no dependabot).
- D-002 (RT-14): RT-14 merged: visibility-only update rule for assignment owners plus toast, tested in rules emulator; firestore.rules must be deployed by the owner.
- D-005 (RT-14): RT-14 merged: users.email writable only when equal to the token email; firestore.rules must be deployed by the owner.
- D-006 (RT-14): RT-14 merged: new resources/{teacherUid}/ storage path allows teacher video uploads (keyed by teacher uid, not courseId); storage.rules must be deployed, and submissions/** still allows text/html.
- D-007 (RT-30): RT-30 partial: 8 composite indexes added with static coverage test (deploy pending) and claims plan plus dry-run tools/backfill-claims.cjs prepared; claims backfill, rules change and legacy-collection retirement not executed.
- G-003 (RT-21): RT-21 merged with presets in organization-defaults.ts, but the free-network default (none/0 vs active/50) is left unchanged pending an owner decision in HUMAN-TODO.
- L-002 (RT-33): RT-33 merged docs only (RT-33-DEPLOY-PATHS.md); owner must choose Vercel or Firebase Hosting, then finalise README, firebase.json and .firebaserc aliases.
- L-007 (RT-33): RT-24/RT-33 removed media from the tree but .git is still ~272 MB; the history rewrite (RT-33-HISTORY-RUNBOOK.md) is a human-only step.
- M-006 (RT-32): RT-32 added aria-labels noting missing captions, but a human must write WebVTT captions and add <track> elements (HUMAN-TODO).
