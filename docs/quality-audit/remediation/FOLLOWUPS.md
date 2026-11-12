# Follow-ups discovered during remediation

## RT-08
- `package-lock.json` (root and `functions/`) was generated with npm 11. `npm ci` under Node 22's bundled npm 10.9.4 fails with EUSAGE ("Missing: @emnapi/runtime@1.11.3, @emnapi/core@1.11.3 from lock file"). CI works around this with `npm install -g npm@11`; a proper fix is to regenerate the lockfile so npm 10 and 11 both accept it (a dependency/lockfile change, out of scope for RT-08), or pin `packageManager`/`engines.npm`.
- `.nvmrc` pinning Node 22 and Java/emulator prerequisites in README (L-013) are not added by RT-08.
- `.github/dependabot.yml` (suggested by L-001) is not added.

- RT-22a: emulator ports are hardcoded (auth 9099, firestore 8080, storage 9199) in src/lib/firebase-emulator.ts; if another project holds those ports there is no override. Consider NEXT_PUBLIC_FIREBASE_*_EMULATOR_PORT overrides. Also firebase.ts keeps a pre-existing ts-ignore (App Check debug token) and a hardcoded production reCAPTCHA site key fallback.

## RT-05
- `functions/src/index.ts`, `billing.ts` still use `console.*` (and index.ts logs recipient emails); migrate to `firebase-functions/logger` and redact emails (K-005 remainder, RT-17/RT-18).
- `gradeSubmission` returns early (no org, non-AI assignment, budget) in ways that leave the status `submitted`; the sweep now covers the AI cases after 20 min, but the early-return paths should set an explicit status.
- `gradeResponseAI` still uses `any` and an unvalidated JSON parse (RT-07). `@google/genai` ^0.13 pinned (RT-02).
- Sweep scan is capped at 2000 candidates per run; with a very large permanent manual-grading backlog older than the cap, AI-stuck submissions beyond it wait for later runs. A denormalised `gradingType` field on submissions would allow a query-level filter.

## RT-04
- Reservation tests live in `tests/security/ai-reservations.test.ts` (emulator suite) rather than `workflows.test.ts` to avoid merge conflicts with concurrent tickets.
- `functions/src/grading.ts` calls `reserveBudget`/`settleBudget` directly; check its failure paths settle the hold (RT-07 scope). Per-user usage counters incremented at reservation time are not rolled back when a reservation expires.
- The stale threshold (30 min) is a constant in `functions/src/metering.ts`; finding F-004 suggested 5 min, the ticket says 30 min (kept, well above the 60 s provider timeout).
