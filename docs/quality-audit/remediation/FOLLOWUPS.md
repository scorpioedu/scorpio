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
## RT-06
- `src/lib/ai/research.ts` (owned by another ticket, deliberately untouched) still sends an `x-admin-secret` header from `researchResponse` and takes an unused `adminSecret` parameter in `runComprehensiveStudy`/`runAblationStudy`. The server ignores the header. `src/lib/research-admin-fetch.ts` is a temporary shim that swaps in `authenticatedFetch` for `/api/research/respond` while the study runs. Fix: have `researchResponse` use `authenticatedFetch`, drop the `adminSecret` parameters, then delete the shim and its use in `src/app/(docs)/research/admin/page.tsx`.
- RT-06 step 1 (10/min `checkRateLimit` before the compare) was not implemented separately: it was superseded by step 4. Admin routes are now behind a verified identity plus `admin_audit`, but have no per-admin throttle. Consider `checkRateLimit(req, uid, 'admin', {windowMs: 60000, maxRequests: 60})` inside the admin branch of `withAuthorizedRequest`.
- `/api/admin/firestore` still exposes `users`, `submissions` and `tutor_sessions` across tenants (now to admin-claim holders only, and audited). Consider trimming `ALLOWED_COLLECTIONS` or redacting fields (C-003 recommendation).
- `admin_audit` has no Firestore rules entry; it is written by the Admin SDK only, so the default deny applies. Consider an explicit `allow read, write: if false` and a retention/TTL policy.
- `teacher-code` error responses still return `err.stack` outside production; pre-existing, unrelated to RT-06.
