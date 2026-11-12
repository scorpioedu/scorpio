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

## RT-04
- Reservation tests live in `tests/security/ai-reservations.test.ts` (emulator suite) rather than `workflows.test.ts` to avoid merge conflicts with concurrent tickets.
- `functions/src/grading.ts` calls `reserveBudget`/`settleBudget` directly; check its failure paths settle the hold (RT-07 scope). Per-user usage counters incremented at reservation time are not rolled back when a reservation expires.
- The stale threshold (30 min) is a constant in `functions/src/metering.ts`; finding F-004 suggested 5 min, the ticket says 30 min (kept, well above the 60 s provider timeout).

## RT-03
- `checkRateLimit` (`src/lib/rate-limit.ts`) still derives its identifier from the raw `x-forwarded-for` when no user id is given. The landing route now passes a hashed trusted IP, but other callers (C-002) are unchanged.
- A message is counted before the provider call; if the provider or budget fails after admission, the visitor's counter is not refunded.
- Add a TTL policy on `landing_visitors` and `rate_limits` documents so they do not accumulate.

## RT-07
- `zod` is a root dependency but not a `functions/` dependency, and adding one was out of scope, so the grader-reply schema is a dependency-free validator in `functions/src/grading-schema.ts` (imported by the root app via a relative path, like `metering.ts`). Once `functions/` can take `zod` (with RT-02), swap the validator for a zod schema (`z.coerce.number().min(0).max(10)` plus the text fields) behind the same `parseGraderReply` signature.
- Budget holds in `functions/src/grading.ts` `gradeResponseAI` (RT-04 follow-up check): a provider exception between `reserveBudget` and `settleBudget` (network error, 5xx, safety block) is NOT settled, so the hold stays `pending` until `expireStaleReservations` (30 min) expires it uncharged; a response without `usageMetadata` throws "reservation retained" by design and leaves the hold the same way. Parse/schema failures are fine because the settle happens before parsing. Fix (not done, to keep RT-07 in scope): wrap the provider call and settle with the input estimate on failure, as `callGeminiDirect` does in `src/lib/ai/config.ts`.
- The injection heuristic is deliberately conservative regex; tune the patterns in `INJECTION_PATTERNS` from real `pending_review` volume. `responseSchema` in `generationConfig` (F-001 suggestion) is not used.
- `synthesizeRubric`, `generateAssignmentQuestions` and `parseQuestionsFromText` still interpolate untrusted topic/learning-objective/pasted text into the user prompt without delimiters or a system instruction.
- `src/lib/ai/assignment.ts` still contains an `// @ts-ignore` and `any` types (pre-existing, untouched).
- RT-23: route error boundaries only `console.error` the `error.digest`; they do not post to a real error-reporting service (none exists in the repo). Wire `RouteError` (`src/components/route-error.tsx`) and `global-error.tsx` to one once chosen, sending digest/route only (no message, no PII). The jest environment is `node` with no DOM or testing-library, so `__tests__/route-boundaries.test.tsx` uses `renderToStaticMarkup` plus element-tree resolution; add `@testing-library/react` + jsdom (RT-02/RT-28) to click the button for real. `RouteLoading` is one generic skeleton for all student/teacher routes; per-page skeletons are not done. Also pre-existing and untouched: `src/components/route-progress-bar.tsx` has an ESLint `react-hooks/set-state-in-effect` error.
- Follow-up: tests/security hardcoded emulator ports; now read from FIRESTORE_EMULATOR_HOST/FIREBASE_STORAGE_EMULATOR_HOST (defaults unchanged).

## RT-14 follow-ups
- Not applied: "enforce `notebookLimitPerStudent` via a server API route" (D-003 remediation). The client creates notebooks directly, so this needs a new API route and client change; rules still do not enforce the per-student count.
- Not applied: ticket's `/resources/{courseId}/` storage path (used `resources/{teacherUid}/`, see BEHAVIOUR-CHANGES).
- Legacy migration in `src/app/student/notebook/page.tsx:L196` (`updateDoc(oldRef, { studentId ... })` on a doc without `studentId`) was already denied by the update rule and still is; belongs with RT-15.
- `storage.rules` `submissions/**` still allows `text/*` (including `text/html`) and lets a student overwrite/delete files after grading (D-006 notes); not in RT-14 steps.
- Optional: the old `submissions/{teacherUid}/` resource files could be migrated to `resources/`.
