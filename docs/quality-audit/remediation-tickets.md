# Scorpio Remediation Tickets

**Source:** `SUMMARY.md` section 5 (roadmap) and `findings.csv` (132 verified, de-duplicated findings). **Date:** 2026-11-11.
33 tickets: **Now** RT-01 to RT-08, **Next** RT-09 to RT-24, **Later** RT-25 to RT-33.

Conventions: Priority is the highest verified severity among the linked findings. Effort is S (under 1 hour), M (under 1 day), L (over 1 day), taken from `findings.csv`; where a ticket bundles several findings, effort is the sum. Line references were taken from the audit and re-checked for every Critical/High finding. For Medium findings they are as reported by the workstream, so confirm the lines before editing. Secrets are referred to by variable name only.

Suggested order inside **Now**: RT-01, RT-02 and RT-05 first (all effort S), then RT-08, so every later change runs through CI.

---

# NOW (this week)

### RT-01: Rotate and revoke the leaked Firebase Admin key
- **Priority:** Critical | **Effort:** S | **Findings:** C-001
- **Problem:** `git show dea0862 -- src/lib/firebase-admin.ts` adds a service-account private-key literal (line 44 of that diff) to the file that is now `src/lib/firebase-admin.ts:L12-L42`. Commit `65737a2` ("fix: firebase private key leak") removed it about 38 minutes later, but both commits are reachable from `origin/main`. HEAD only reads `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` from the environment (`src/lib/firebase-admin.ts:L19-L23`). Removing a secret from the tip does not revoke it.
- **Steps:**
  1. In Google Cloud Console, open IAM > Service Accounts for the account named by `FIREBASE_CLIENT_EMAIL`. Create a new key and delete **all** existing keys.
  2. Update `FIREBASE_PRIVATE_KEY` (and `FIREBASE_CLIENT_EMAIL` if the account changes) in every deployment environment and in the local `.env.local`. Do not paste the value into tickets, chat or logs.
  3. In Cloud Audit Logs, search the old key's activity since 2026-03-08 for unfamiliar callers or IPs. Record the result in the ticket.
  4. Enable GitHub secret scanning and push protection on the repository.
  5. Optional, only after steps 1-2: scrub the key block from history with `git filter-repo --replace-text <file>`, then coordinate a force-push and have collaborators re-clone. Rotation is what fixes the exposure; skip the rewrite if the repository is private and the old key is confirmed dead.
  6. Add a `gitleaks` step to CI (RT-08).
- **Acceptance criteria:**
  - Old key IDs no longer appear in the service account's key list.
  - Production and preview deployments authenticate with the new key (a signed-in API call succeeds).
  - Audit-log review is written into the ticket.
  - GitHub secret scanning and push protection show as enabled.

### RT-02: Patch Next.js and the audited packages
- **Priority:** High | **Effort:** S | **Findings:** C-005, J-002
- **Problem:** `package.json:L67` resolves `next` to 16.2.1. `raw/npm-audit.json` flags `next` as critical for range 9.3.4-canary.0 - 16.4.0, including RCE advisories (image optimizer, `next/og`, `use cache`, Windows hosts), middleware/proxy bypass and SSRF. Also flagged: `@tiptap/core` <= 3.30.4 and `prosemirror-view` < 1.42.3 (`package.json:L49-L91`), `protobufjs` <= 7.6.4, and in `functions/package.json` `@google/genai` and `zod`. Totals: root 97 (6 critical, 39 high), functions 48 (3 critical, 13 high).
- **Steps:**
  1. `npm i next@latest eslint-config-next@latest` (version must be above 16.4.0), then `npm audit fix` at the root.
  2. Bump `@tiptap/*` to a patched release; `npm ls prosemirror-view protobufjs` and force a patched version with `overrides` if a parent pins an old one.
  3. `cd functions && npm audit fix`; bump `@google/genai` and `zod`.
  4. Run `npx tsc --noEmit`, `npx jest`, `npm run build`, `npm run test:security`.
  5. Record the new `npm audit --omit=dev` totals in the PR. Dev-only advisories under `vercel` disappear with RT-20.
- **Acceptance criteria:**
  - `npm audit --omit=dev --audit-level=high` exits 0 in the root and in `functions/`, or each remaining advisory has a written reachability note.
  - `node -p "require('next/package.json').version"` is above 16.4.0.
  - Build, unit tests and security tests pass.

### RT-03: Close the landing/research AI spend fail-open
- **Priority:** High | **Effort:** M | **Findings:** F-002 (also C-002)
- **Problem:** `src/lib/ai/config.ts:L48` marks `landing` and `research` calls exempt; L49 skips the organization requirement, and L58-L61 swallow reservation errors for exempt types, so an exhausted or missing `LANDING_ORG_ID` budget means no cap at all. The public route `src/app/api/chat/landing/route.ts:L63-L65` accepts any 1-128 character `visitorId`, so sending new IDs resets the 10-message limit at L84. The only other control is `checkRateLimit` keyed on a raw `x-forwarded-for` (`src/lib/rate-limit.ts:L21-L23`).
- **Steps:**
  1. `config.ts`: remove `landing` from the exemption. If `LANDING_ORG_ID` is empty or `reserveBudget` throws, fail closed and return a friendly 503 from the route. Keep the exemption for `research` only (that route is admin-secret protected, `src/app/api/research/respond/route.ts:L6`) but log the swallowed error.
  2. Landing route: issue an HMAC-signed, `httpOnly` visitor cookie server-side and count messages against the cookie **and** a hashed client IP; stop trusting the body `visitorId`.
  3. Add a global daily counter document (for example `landing_daily/{yyyy-mm-dd}`) updated in a transaction, with a cap such as 2,000 messages per day.
  4. Cap `maxOutputTokens` for landing replies (512 or lower) in `src/app/api/chat/landing/route.ts:L9`.
  5. Emit a log or alert when the landing org passes 80% of its budget.
  6. Add emulator tests: 11th message with fresh `visitorId` and same cookie/IP is rejected; exhausted landing org returns 503 and makes no provider call.
- **Acceptance criteria:**
  - Sending 11 messages with 11 different `visitorId` values from one client returns 429 after the limit.
  - With `LANDING_ORG_ID` unset or its budget exhausted, the route returns 503 and no Gemini request is made.
  - Daily cap is enforced and covered by a test.

### RT-04: Settle or expire AI budget reservations
- **Priority:** High | **Effort:** M | **Findings:** F-004 (relates to B-003)
- **Problem:** `src/lib/ai/config.ts:L56` creates a `pending` reservation, then the provider `fetch` at L64-L72 runs without `try/finally`. A timeout (`AbortSignal.timeout(60000)`, L66) or network error leaves the reservation pending; L81 also throws without settling when `usageMetadata` is missing. `ai_reservations` is referenced only in `functions/src/metering.ts:L41` and `:L48`, so nothing ever expires a pending row and `organizations.aiUsageReserved` only grows. Worst case is about 10.6 cents per leaked reservation against the 50 cent free-plan cap (`functions/src/metering.ts:L30`).
- **Steps:**
  1. Wrap the provider call and body parse in `try/catch`; on any failure call `settleBudget(adminDb, reservation, estIn, estOut)` with conservative estimates (input from `inputBytes / 4`, output 0) so the hold is released but not free.
  2. When `usageMetadata` is missing (L80-L81) settle with the same estimate and log a warning instead of throwing.
  3. Add a scheduled Cloud Function `expireStaleReservations` (every 15 minutes): query `ai_reservations` where `status == 'pending'` and `createdAt < now - 30 min`, and in a transaction subtract `maxCost` from the organization's `aiUsageReserved` (floor 0) and set `status: 'expired'`. Add the composite index to `firestore.indexes.json`.
  4. Add tests to `tests/security/workflows.test.ts`: a failed provider call releases the reservation; the sweeper is idempotent.
- **Acceptance criteria:**
  - A simulated fetch timeout leaves `aiUsageReserved` back at its prior value.
  - A reservation older than 30 minutes is expired by the sweeper exactly once.
  - `aiUsageReserved` never goes negative.

### RT-05: Explicit timeout and failure path for grading triggers
- **Priority:** High | **Effort:** S | **Findings:** K-001, K-005
- **Problem:** `functions/src/grading.ts:L326-L346` define `onSubmissionCreated`/`onSubmissionUpdated` with no `timeoutSeconds`, and `functions/src/index.ts:L17` sets only `maxInstances`. `gradeSubmission` calls the model once per answer, sequentially (`functions/src/grading.ts:L233-L247`), while the lease is 15 minutes (L316). On a platform timeout the `catch` at L321 never runs, so the submission stays `submitted` and locked. Errors in `processGrading` are swallowed without logging (L320-L323), and `firebase-functions/logger` is never used.
- **Steps:**
  1. Add `timeoutSeconds: 540` and a suitable `memory` to both trigger options (L326-L329 and L336-L339), or set them via `setGlobalOptions`.
  2. Grade answers with bounded concurrency (for example 3) in the loop at L233-L247.
  3. Set the lease to timeout plus 60 s (L316).
  4. Log failures with `logger.error` including `submissionId` (no emails), and re-read the submission instead of passing stale `submissionData` to `gradeSubmission`.
  5. Add a scheduled sweep that moves submissions stuck in `submitted` for more than 20 minutes to `pending_review`.
- **Acceptance criteria:**
  - Deployed configuration shows 540 s timeout for both triggers.
  - A unit/emulator test where `gradeSubmission` rejects ends with `status: 'pending_review'` and the lock deleted.
  - Errors appear in Cloud Logging as structured entries.

### RT-06: Replace the shared `ADMIN_SECRET` header with admin-claim auth
- **Priority:** High | **Effort:** M | **Findings:** C-003
- **Problem:** `src/app/api/admin/firestore/route.ts:L30-L33` authenticates with `adminSecret !== process.env.ADMIN_SECRET` (not constant-time) and exposes `ALLOWED_COLLECTIONS` (L5-L19) including `users`, `submissions` and `tutor_sessions` across all tenants. The same header guards `src/app/api/auth/teacher-code/route.ts:L22,L48,L77`, `src/app/api/auth/request-access/route.ts:L11-L12` and `src/app/api/research/respond/route.ts:L6`, and is typed into the browser by `src/app/admin/page.tsx:L40`, `src/components/admin/*.tsx`, `src/app/(docs)/research/admin/page.tsx:L24` and `src/lib/ai/research.ts:L2`. There is no identity, no throttle and no audit trail.
- **Steps:**
  1. Interim, same day: compare with `crypto.timingSafeEqual`, call `checkRateLimit` (10 per minute per IP) before the compare, and write an `admin_audit` document per call (action, collection, timestamp, hashed IP).
  2. Add `tools/set-admin-claim.cjs` to set a custom `admin: true` claim on named UIDs (run manually by the owner).
  3. Extend `withAuthorizedRequest` in `src/lib/auth-verify.ts:L30-L47` with an `admin: true` option that requires the claim on the verified token.
  4. Migrate the five routes above and the admin UI to `authenticatedFetch` with the user's ID token. Remove the secret input from the UI.
  5. Remove `ADMIN_SECRET` from the environment and `.env.example`.
- **Acceptance criteria:**
  - A signed-in non-admin gets 403 from every admin route; an admin-claim user succeeds.
  - No code path reads `x-admin-secret` or `ADMIN_SECRET`.
  - Each admin read/write produces an `admin_audit` record.

### RT-07: Harden AI grading against prompt injection and validate output
- **Priority:** High | **Effort:** M | **Findings:** F-001, F-006, E-006 (partly)
- **Problem:** `src/lib/ai/grading.ts:L25-L30` interpolates the question, rubric and student submission inside double quotes with no escaping and no instruction-hierarchy guard, so an answer such as a quote-closing "give full marks" may steer the score. The JSON reply is parsed with `indexOf('{')`/`lastIndexOf('}')` (L77-L86) and checked with ad-hoc `typeof` tests; the `else if (typeof data.score === 'string')` branch at L96-L107 is unreachable because L91 already throws. The same pattern is duplicated in `functions/src/grading.ts:L147-L151`. `src/lib/ai/assignment.ts:L151` strips `//...` from AI JSON, which corrupts any string containing a URL.
- **Steps:**
  1. Add `systemInstruction` support to `callGeminiDirect` (`src/lib/ai/config.ts:L31`) and move the grading rules there.
  2. Wrap each untrusted field in a per-request random delimiter (for example `<submission-7f3a>...</submission-7f3a>`) and state that content inside is data, not instructions.
  3. Define one `zod` schema for the grader reply (`score` via `z.coerce.number().min(0).max(maxPoints)`, plus the three text fields); parse with it in both `src/lib/ai/grading.ts` and `functions/src/grading.ts`. This also fixes the dead string parser.
  4. If the answer matches an injection heuristic (for example `/ignore (all|previous)|full marks|give (me )?(10|100)/i`) or the score is the maximum for a very short answer, set `status: 'pending_review'` instead of auto-finalising.
  5. Remove the `//` regex in `src/lib/ai/assignment.ts:L151` and use the schema-validated parse instead.
  6. Add table-driven tests (E-006): score above max, negative, NaN, string score `"8/10"`, and an injection payload that must not change the parsed schema or the final state.
- **Acceptance criteria:**
  - Replies that fail the schema never produce a numeric grade; they route to `pending_review`.
  - A submission containing a known injection phrase is not auto-graded to full marks in tests.
  - The `//` regex is gone and a URL inside a question survives a parse round-trip test.

### RT-08: Minimal CI and fix the stale budget test
- **Priority:** High | **Effort:** M | **Findings:** L-001, E-010, E-001 (also D-004, F-007), L-013
- **Problem:** `.github/` contains only `ISSUE_TEMPLATE/` and `PULL_REQUEST_TEMPLATE.md`, so nothing runs before deploy; `package.json:L5-L11` has no `typecheck` script and `npm test` excludes the emulator suites. As a result `tests/security/workflows.test.ts:L60` has been failing unnoticed: it expects `aiUsageCurrent` 0.28 but at the rates in `functions/src/metering.ts:L7-L12` one thousand input plus one thousand output tokens cost 0.45, which is what the run produced. `npm run test:security` also logs haste-map collisions from `.next/standalone/`.
- **Steps:**
  1. Fix the test first: compute the expectation from `getActiveTokenRates()` (`0.075 + 0.375`) so it survives the 2027-01-01 rate change at `metering.ts:L8`. Add `modulePathIgnorePatterns: ['<rootDir>/.next/']` to `jest.config.js`.
  2. Add scripts to `package.json`: `"typecheck": "tsc --noEmit && tsc --noEmit -p functions"` and `"test:ci"`.
  3. Create `.github/workflows/ci.yml` (Node 22, `npm ci` at root and in `functions/`, cache npm) with jobs: typecheck, `eslint` (initially non-blocking or against a baseline; blocking after RT-31), `jest`, `firebase emulators:exec` for `npm run test:security`, `next build`, and `npm audit --omit=dev --audit-level=high`.
  4. Add a `gitleaks` job (full history).
  5. Require the workflow on pull requests to `main` in branch protection.
- **Acceptance criteria:**
  - CI is green on `main` with the corrected test.
  - A PR that breaks `tsc`, a unit test or a rules test turns the check red.
  - The workflow file is in `.github/workflows/` and referenced from `README.md`.

---

# NEXT (this month)

### RT-09: Add security headers
- **Priority:** Medium | **Effort:** S | **Findings:** C-007
- **Problem:** `next.config.mjs:L1-L10` defines no `headers()`, and `firebase.json` adds none, so responses carry no CSP, HSTS, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` or `Permissions-Policy`.
- **Steps:**
  1. Add an `async headers()` to `next.config.mjs` for `/:path*`: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security: max-age=63072000; includeSubDomains`, a restrictive `Permissions-Policy`.
  2. Start CSP as `Content-Security-Policy-Report-Only` allowing the required origins (Firebase, reCAPTCHA/gstatic, Google Fonts, Polar). Note the inline scripts at `src/app/layout.tsx:L150` and `src/components/loading-screen.tsx:L89` need a nonce or hash.
  3. Watch reports for one week, then switch to enforcing.
- **Acceptance criteria:** `curl -I` on `/` and `/login` shows all headers; login, signup, checkout and the chatbot work with CSP enforcing; no unexpected violations in a week of report-only logs.

### RT-10: Centralise PII scrubbing and redact logs
- **Priority:** Medium | **Effort:** M | **Findings:** C-008 (also K-004, B-004)
- **Problem:** `scrubPII` is applied in `src/lib/ai/tutor.ts`, `src/lib/ai/grading.ts`, `src/lib/ai/network.ts` and `src/app/api/notebook/chat/route.ts`, but `src/app/api/ai/parse/route.ts:L11-L38`, `src/app/api/ai/generate/route.ts` and `src/lib/ai/assignment.ts` contain no `scrubPII` call at all (full table in `C-security.md`, route matrix and section C10). Calls reach Gemini through `src/lib/ai/config.ts:L14-L72`. `functions/src/index.ts:L52-L114` logs student emails in plaintext (`console.error` with `student.email`).
- **Steps:**
  1. Apply scrubbing once, inside `callGeminiDirect`, for every text part, with names supplied through `billingContext` (extend `src/lib/billing-context.ts`).
  2. Remove per-caller `scrubPII` calls that become redundant, keeping behaviour identical.
  3. Redact or hash emails in `functions/src/index.ts` and `functions/src/grading.ts` logs.
  4. Add a test that an email address and a roster name in any prompt never appear in the outgoing request body.
- **Acceptance criteria:** the test passes for all AI entry points; `rg "student.email" functions/src` finds no log statements; the scrubber has a single implementation (merge with RT-27 when it lands).

### RT-11: Rate-limit all AI and auth routes with a trusted client IP
- **Priority:** Medium | **Effort:** M | **Findings:** C-002 (also F-009, G-007)
- **Problem:** Only `chat`, `chat/landing`, `ai/generate` and `notebook/chat` call `checkRateLimit`; 25 of 29 routes do not, including `ai/parse` (loops model calls) and `ai/synthesize-rubric`. `src/lib/rate-limit.ts:L21-L23` takes the first value of a client-controlled `x-forwarded-for`. `src/app/api/auth/teacher-code/route.ts` validation is unthrottled.
- **Steps:**
  1. Add `getClientIp(req)` using the platform-trusted header for the deployment target (document which), and use it in `rate-limit.ts`.
  2. Add `withRateLimit(kind, config)` and apply to every AI route, `auth/*`, `checkout`, `support/report`, `github/stats`.
  3. Per-endpoint budgets in one config file; return 429 with `Retry-After`.
  4. Tests for N+1th request blocked, window reset, key isolation (E-008).
- **Acceptance criteria:** every route in the C2 matrix shows a limiter or a written exemption; spoofing `x-forwarded-for` no longer changes the bucket.

### RT-12: zod schemas for API request bodies
- **Priority:** Medium | **Effort:** M | **Findings:** G-001 (also C-004), G-005, G-009
- **Problem:** None of the 29 routes uses `zod` (26 call `req.json()`). `src/app/api/assignments/route.ts:L8,L18` spreads `...data` into Firestore; `src/app/api/notebook/chat/route.ts:L15-L19` crashes on an empty `messages` array; `src/app/api/auth/request-access/route.ts:L52-L91` falls through on an unknown action and is not transactional (G-009).
- **Steps:**
  1. Add `src/lib/api/parse.ts` with `parseBody(req, schema)` returning a 400 with field errors.
  2. Start with `assignments` (explicit allow-list of fields, move `validateQuestionAnswers` logic server-side), `notebook/chat` (non-empty array, role enum), `auth/request-access` (action enum, wrap approve/submit in `runTransaction`), `grade`, `submissions`, `checkout`.
  3. Share request types with the client where the page already defines the same shape.
  4. Tests: unknown extra field is dropped, malformed body is 400.
- **Acceptance criteria:** the six routes above reject malformed bodies with 400; no `...data` spread of request input remains in `src/app/api/`; coverage tracked in the C2 matrix.

### RT-13: Fix `withAuthorizedRequest` error semantics
- **Priority:** Medium | **Effort:** M | **Findings:** G-004, F-008
- **Problem:** `src/lib/auth-verify.ts:L39-L41` runs `JSON.parse` on the raw body, so an empty POST throws and the catch at L98-L100 returns 400 "Unable to authorize request". The same catch also converts exceptions thrown by `execute()` (L97) into 400 instead of 500. The wrapper re-reads the profile (L45, L73-L79) that handlers re-read again. L72 classifies feature type from the URL (for example `/api/ai/*` as navigation), and the notebook uses three different usage counters (F-008).
- **Steps:**
  1. Treat an empty body as `{}`; return 400 only for invalid JSON, 413 for oversize.
  2. Move `execute()` outside the authorisation `try`, or catch separately and return 500 with a request id.
  3. Pass the loaded profile and effective org id to handlers via context to remove duplicate reads.
  4. Give each route an explicit `feature` option instead of path matching at L72; unify the notebook counters.
  5. Tests from E-016.
- **Acceptance criteria:** an empty-body POST reaches the handler; a handler throwing returns 500; `/api/ai/*` usage is recorded under its own feature.

### RT-14: Firestore and Storage rules corrections
- **Priority:** Medium | **Effort:** M | **Findings:** D-002, D-003, D-005, D-006
- **Problem:** `firestore.rules:L43-L48` has no `allow update` on assignments, so the visibility toggle at `src/app/teacher/assignments/page.tsx:L130` is denied and only logged (L133). `firestore.rules:L76-L85` let a user create notebooks/tutor sessions with any document id and unbounded content. `firestore.rules:L31-L32` lets a user change their own `email` to any value, which Cloud Functions use for mail. `storage.rules:L9-L14` rejects teacher video uploads and stores course resources under `/submissions/{userId}/`.
- **Steps:**
  1. Assignments: `allow update: if teacher() && resource.data.teacherId == request.auth.uid && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['visibility'])` (extend the key list only for fields the UI edits).
  2. Notebooks/tutor sessions: drop `id == request.auth.uid` from read/delete, require `request.resource.data.studentId == request.auth.uid` on create, add `size()` and key allow-lists.
  3. Users: block `email` changes unless equal to `request.auth.token.email`.
  4. Storage: add a `/resources/{courseId}/{allPaths=**}` block for teacher owners with video types and a size limit; stop writing resources under `/submissions`.
  5. Extend `tests/security/*.test.ts` with deny cases for each change.
  6. Surface the visibility error with a toast at `src/app/teacher/assignments/page.tsx:L133`.
- **Acceptance criteria:** rules emulator tests cover allow and deny for each rule; the visibility toggle works for the owner and fails for others; a teacher can upload an mp4 resource.

### RT-15: Client effect, listener and write fixes
- **Priority:** Medium | **Effort:** M | **Findings:** D-001, H-001, H-002, H-003, H-004
- **Problem:** `src/app/student/notebook/page.tsx:L421-L427` writes `aiUsageCount` to `users/{uid}`, which `firestore.rules:L31-L35` deny, so every Copilot answer is followed by a "Copilot connection severed." toast (L428-L429). The organization listener at L150-L200 can leak when cleanup runs before `getDoc` resolves (H-001); sync effects at L238-L274 miss dependencies (H-003). `src/app/student/assignment-view/page.tsx:L329-L359` recreates its interval every second and calls `handleSubmit` with a stale closure (H-002). There are 14 `exhaustive-deps` warnings in total.
- **Steps:**
  1. Delete the client `updateDoc` at L421-L427; read the server-maintained counters instead (L113-L119).
  2. Use a `cancelled` flag and collect unsubscribers synchronously in the org effect; make first-notebook creation idempotent with a deterministic id.
  3. Keep `answers` in a ref and run one interval keyed on `[timerActive]`; submit from a separate effect when `timeLeft === 0`.
  4. Fix the remaining `exhaustive-deps` warnings listed in `raw/eslint.txt`.
- **Acceptance criteria:** no permission-denied errors in the console during a Copilot session; navigating away mid-load leaves no active listener (check with a listener-count debug in the emulator); `eslint` reports no `exhaustive-deps` warnings in these two files.

### RT-16: Core Web Vitals: login, landing, providers, layouts
- **Priority:** Medium | **Effort:** M | **Findings:** I-020, I-021, I-019, I-018
- **Problem:** `src/app/login/page.tsx:L102-L104` returns a full-page spinner while `authLoading`, plus an `opacity: 0` motion wrapper, giving 10.0 s mobile LCP (score 73). `src/components/loading-screen.tsx:L31-L44` splash and a paused hero animation give 5.4 s on `/`. `src/components/providers.tsx:L14` sets `needsAuth` on almost every public page, loading `@firebase/firestore` and reCAPTCHA Enterprise (about 445 KiB) on `/pricing` and `/login`. `src/app/student/layout.tsx:L5` and `src/app/teacher/layout.tsx:L6` statically import `NavigationChatbot`, bundling KaTeX and react-markdown (about 121 KB gz) into 21 routes.
- **Steps:**
  1. Render the login card immediately; show an inline pending state on the submit button while auth initialises.
  2. Remove `initial={{ opacity: 0 }}` from the LCP element; make the landing splash non-blocking.
  3. Limit `needsAuth` to `/student`, `/teacher`, `/admin`, `/login`, `/signup`, `/join`; initialise Firestore, Storage and App Check lazily in `src/lib/firebase.ts`.
  4. Wrap `NavigationChatbot` in `next/dynamic(..., { ssr: false })` and load the Markdown/KaTeX renderer on first open; replace `react-katex` imports (`src/app/student/vault/page.tsx:L31`, `src/app/teacher/vault/page.tsx:L48`) so KaTeX is bundled once.
  5. Re-run Lighthouse mobile on `/`, `/login`, `/pricing`.
- **Acceptance criteria:** mobile LCP under 2.5 s on `/login` and under 3.0 s on `/` in the same Lighthouse setup; `/student` first-load JS under 450 KB gz; no `@firebase/firestore` chunk on `/pricing`.

### RT-17: Error-handling hygiene (AI, API, functions)
- **Priority:** Medium | **Effort:** M | **Findings:** F-003, G-006, C-009 (also G-007), K-005
- **Problem:** `src/lib/ai/tutor.ts:L62-L68` returns `Error: <internal message>` as chat text with HTTP 200; `src/lib/ai/grading.ts:L161-L163` returns a failure sentence as rubric content. `src/app/api/support/report/route.ts:L50-L64` swallows a failed Firestore write and returns success. `src/app/api/checkout/route.ts:L82-L89` and `src/app/api/github/stats/route.ts:L26-L30` forward upstream error bodies; `src/app/api/chat/route.ts` returns `error.message` and optionally the stack. Functions log with `console.*` only.
- **Steps:**
  1. Make AI helpers throw typed errors; routes map them to 502/503 with a generic message and a request id; clients show a retry state.
  2. `support/report`: return 500/503 on persistence failure.
  3. Replace upstream bodies and `error.message` in responses with generic text; log details server-side.
  4. Adopt `firebase-functions/logger` in `functions/src/` (also covers RT-05).
- **Acceptance criteria:** no response body contains a stack trace or provider message (grep test over route handlers); a forced Firestore failure on `support/report` returns non-2xx; tutor failures do not appear as assistant messages in stored sessions.

### RT-18: Cloud Functions: email scoping, storage cleanup, tests
- **Priority:** Medium | **Effort:** M | **Findings:** K-002, K-003, K-007, E-005
- **Problem:** `functions/src/index.ts:L52-L114` emails every student of the teacher regardless of course (query at L80-L83), has no idempotency marker, and defaults to disabled via `?? true` at L72. `functions/src/index.ts:L22-L36` deletes submissions without deleting uploaded files from Storage. `functions/package.json:L26-L31` installs `firebase-functions-test` but no test files exist.
- **Steps:**
  1. Filter recipients by `courseId` when the assignment has one; write `emailsSentAt` on the assignment inside a transaction and skip if present; send with bounded concurrency.
  2. Delete `workFiles` objects from Storage before deleting submissions (mirror `/api/teacher/students/cleanup`).
  3. Add `functions/__tests__/` with tests for grading, billing outbox and the two triggers; add `"test"` to `functions/package.json`.
- **Acceptance criteria:** two deliveries of the same create event send one batch; deleting an assignment removes its storage objects; `npm test` in `functions/` runs at least the grading, billing and email trigger cases.

### RT-19: Test hardening on critical logic
- **Priority:** Medium | **Effort:** M | **Findings:** E-002, E-003, E-004, E-006 (rest), E-007, E-008, E-016, E-017
- **Problem:** `__tests__/due-date.test.ts:L2-L10` and `__tests__/waypoints-plan-limits.test.ts:L10-L23` test functions copy-pasted into the test file. `tests/security/webhooks.test.ts:L6` mocks signature validation. `withAuthorizedRequest` has a 21.85% mutation score and `usage-limit.ts` 0% (`src/lib/auth-verify.ts:L39-L99`, `src/lib/usage-limit.ts:L1`); `src/lib/rate-limit.ts:L44-L73` has no dedicated tests.
- **Steps:**
  1. Extract the due-date and waypoint-lock predicates into `src/lib/` and import them in both pages/routes and tests.
  2. Webhook tests where `validateEvent` throws expect 403 and no writes; add `subscription.canceled/revoked/past_due`.
  3. `auth-verify` tests for 500,000 vs 500,001 byte bodies, teacher allow, submission/portfolio ownership allow/deny, lock 409/200.
  4. Tests for `usage-limit`, class enrollment and rate-limit window behaviour with fake timers.
  5. Add the whitespace-option and "False" cases in `src/lib/assignment-validation.ts:L21-L31`.
  6. Re-run Stryker on the three libraries and record the score.
- **Acceptance criteria:** mutation score for `auth-verify.ts` above 60% and for `usage-limit.ts` above 50%; no test defines the function it asserts; webhook tests exercise the real verification path.

### RT-20: Dependency hygiene
- **Priority:** Medium | **Effort:** M | **Findings:** J-001 (also I-011), J-003 (also H-009, I-009), J-004 (also I-008), J-005 (also E-011)
- **Problem:** `package.json:L60,L84,L90` list `firebase-functions`, `sib-api-v3-sdk` and the `vercel` CLI in `dependencies` with no imports in `src/`, `functions/src` or `scripts`. 32 declared dependencies are unused or only used by dead files (`package.json:L15-L110`), including `mathjs`/`mathlive` (L64-L65). `framer-motion` (54 files) and `motion` (8 files) are both bundled (`package.json:L61-L66`). `jest@30` is paired with `ts-jest@29` and `eslint-config-next` lags `next` (`package.json:L108-L112`).
- **Steps:**
  1. Remove the three unused runtime packages and the 32 dependencies in `raw/knip.txt` after confirming each with `rg`.
  2. Migrate the 8 `motion` imports to `framer-motion` (or the reverse) and drop the other; consider `LazyMotion`.
  3. Choose either the `radix-ui` meta-package or the scoped packages; drop TipTap extensions already in `starter-kit`.
  4. Upgrade `ts-jest` to a Jest 30 compatible release; align `eslint-config-next` with `next`.
  5. `npm ci`, build, tests.
- **Acceptance criteria:** `npx knip` reports no unused dependencies; `npm ls motion framer-motion` shows one animation package; `npm ls ts-jest jest` shows matching majors.

### RT-21: Network defaults and a single budget policy
- **Priority:** Medium | **Effort:** M | **Findings:** G-003, B-003, E-007 (usage-limit)
- **Problem:** `src/app/api/teacher/network/membership/route.ts:L17` creates networks with `subscriptionStatus: 'none'` and `aiBudgetLimit: 0`, while `src/app/api/auth/register/route.ts:L39` creates them `active` with a 50 cent limit; `functions/src/metering.ts:L29` rejects non-active networks. Budget rules also live twice: `checkBudget` in `src/lib/usage-limit.ts:L7-L83` and `reserveBudget` in `functions/src/metering.ts:L20-L44` diverge.
- **Steps:**
  1. Decide the intended behaviour for a newly created free network and write it in the PR; align `membership/route.ts:L17` with `register/route.ts:L39` if it is "same as register".
  2. Extract a pure `evaluateBudget(org, user, type)` and have both `checkBudget` and `reserveBudget` call it; delete the unused counters.
  3. Table tests for free, active, trialing, canceled and none.
- **Acceptance criteria:** both creation paths produce identical organization defaults (test); one function owns budget evaluation.

### RT-22: DevEx baseline (engines, typecheck, hooks, env, README, emulators)
- **Priority:** Medium | **Effort:** M | **Findings:** L-003, L-004, L-005, L-012 (also J-006, L-010, L-013)
- **Problem:** `package.json:L5-L11` has no `typecheck`, `engines`, formatter or hooks; there is no `.nvmrc` although `functions/package.json` requires Node 22. `.env.example` lacks `POLAR_PRODUCT_ID`, `NEXT_PUBLIC_RECAPTCHA_PROVIDER` and `NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN` used at `src/app/api/checkout/route.ts:L37-L40`. `README.md:L4` and `README.md:L205-L251` describe a Quick Start that fails on `functions/` (TS2307, `EBADENGINE`). `src/lib/firebase.ts:L62-L64` has no emulator wiring and `firebase-admin.ts` rejects dummy keys, so the app cannot run against emulators.
- **Steps:**
  1. Add `engines.node: ">=22"` and `.nvmrc`; add `prettier`, `husky`, `lint-staged` (eslint --fix, prettier).
  2. Add the missing names to `.env.example`; add startup validation of required variables with `zod`.
  3. Add an `emulators` block to `firebase.json`; call `connect*Emulator` in `src/lib/firebase.ts` when `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true`; let `firebase-admin.ts` initialise without `cert()` when emulator hosts are set.
  4. Rewrite the README Quick Start and fix the functions build (missing module imports from clean clone).
  5. Verify from a clean clone in `/tmp`.
- **Acceptance criteria:** the README steps succeed from a clean clone on Node 22; `npm run typecheck` works; a commit with a lint error is blocked by the hook; `rg "process\.env\.\w+" -o` names are all in `.env.example`.

### RT-23: Route error and loading boundaries
- **Priority:** Medium | **Effort:** S | **Findings:** H-013
- **Problem:** Only `join/error.tsx`, `demos/teacher/loading.tsx` and `app/not-found.tsx` exist. `src/app/student/layout.tsx:L1-L44` and `src/app/teacher/layout.tsx:L1-L40` have no `error.tsx` or `loading.tsx`, and there is no `app/error.tsx` or `global-error.tsx`, so a thrown render error shows the framework default and loses layout.
- **Steps:** add `app/error.tsx`, `app/global-error.tsx`, `student/error.tsx`, `teacher/error.tsx` (with reset button and error report) and `loading.tsx` skeletons for `student/` and `teacher/`.
- **Acceptance criteria:** throwing in a student page renders the segment error UI inside the layout with a working reset; loading skeleton shows on slow navigation.

### RT-24: Media and image weight
- **Priority:** Medium | **Effort:** M | **Findings:** I-001, I-002, I-004, I-006 (also I-022, I-003, I-005)
- **Problem:** `public/` is 103 MB; `public/demos` holds five 9-22 MB videos, including `scorpio-demo.mp4` (22.5 MB) and an `-orig` master. `src/components/landing/system-demos.tsx:L51-L54` embeds a 22 MB file with no poster or `preload`. `src/app/(docs)/about/about-client.tsx:L229-L230` serves `headshot-sage.jpg` (3.1 MB) via `<img>`; `og-image.png` is 2.6 MB. `src/app/layout.tsx:L15-L80` loads eight font families, three without `subsets: ['latin']`, producing 141 extra `.woff2` files.
- **Steps:**
  1. Delete unreferenced masters; re-encode used demos to 5 MB or less at 720p (or host on Storage/CDN); add `poster` and `preload="none"` at `system-demos.tsx:L51-L54`.
  2. Convert headshot and OG images (headshot at most 150 KB, OG 1200x630 JPEG at most 300 KB) and render with `next/image`.
  3. Add `subsets: ['latin']` and `display: 'swap'` to the three fonts; set `preload: false` for non-default fonts; drop unused families.
- **Acceptance criteria:** `du -sh public` under 25 MB; no raw `<img>` for files over 100 KB; `.next/static/media` contains no more than the fonts actually used.

---

# LATER (this quarter)

### RT-25: Decompose mega pages and dedupe workspace preview
- **Priority:** Medium | **Effort:** L | **Findings:** B-001 (also H-008), A-002, A-005 (also B-007)
- **Problem:** `src/app/student/assignment-view/page.tsx:L78-L1675` is one 1,444-line component mixing fetching, timers, grading UI and layout; `student/tutor/page.tsx` (1,584 lines), `teacher/network/page.tsx` (1,495) and `teacher/create/page.tsx` (1,153) follow the same shape. 79 functions exceed cyclomatic complexity 15. `src/components/landing/workspace-preview-pages.tsx:L1-L2793` and `workspace-preview-tabs.tsx:L114-L1525` duplicate about 5,000 lines of real app screens, and jscpd finds 64 clone pairs.
- **Steps:** per page, extract data hooks, presentational components and a thin client island; make the page a server component where it only renders props (follow `src/app/teacher/page-client.tsx`). Replace the workspace previews with a data-driven set of reusable preview components or real components in demo mode. Do one page per PR, starting with `assignment-view`.
- **Acceptance criteria:** no file in `src/app` over 600 lines; no function over cyclomatic 25; `jscpd` duplication below 1.5%; behaviour covered by RT-28 smoke tests before and after.

### RT-26: Data-access layer and collection constants
- **Priority:** Medium | **Effort:** L | **Findings:** B-005
- **Problem:** 29 client files call the Firestore SDK directly (for example `src/app/student/notebook/page.tsx:L113-L275`) and collection names are string literals everywhere.
- **Steps:** add `src/lib/data/collections.ts` (typed names and converters) first, then `assignments.ts`, `submissions.ts`, `notebooks.ts` and hooks such as `useNotebooks`; migrate pages gradually; unify the duplicated `Assignment`/`Submission` interfaces on `src/lib/types.ts:L1-L81` (A-004).
- **Acceptance criteria:** `rg 'collection\(db, *"' src/app` returns nothing for migrated domains; one declaration of each core interface.

### RT-27: Shared package for metering, scrubbing and grading logic
- **Priority:** Medium | **Effort:** L | **Findings:** B-002, K-004 (also B-004), B-009
- **Problem:** `src/lib/ai/config.ts:L3` imports `../../../functions/src/metering` by relative path; `scrubPII` and the grading pipeline are copied between `functions/src/grading.ts:L19-L280` and `src/lib/ai/*`; the model name is hard-coded in three places including `functions/src/billing.ts:L14` and `src/lib/ai/config.ts:L16`.
- **Steps:** create a workspace package (for example `packages/shared`) exporting `metering`, `scrubPII`, grading prompt/parse and model constants; add path aliases in both tsconfigs; delete the copies; read the model name from one constant.
- **Acceptance criteria:** one definition of each; `rg "gemini-3.8-flash"` has a single hit; both builds and test suites pass.

### RT-28: Component and E2E tests
- **Priority:** Medium | **Effort:** L | **Findings:** E-009
- **Problem:** `jest.config.js:L8` runs only in the node environment; there are no component, hook or browser tests.
- **Steps:** add jsdom and React Testing Library for the five hotspot components; add three Playwright smoke flows against emulators (login, student submits assignment, teacher grades); run both in CI.
- **Acceptance criteria:** the three flows pass in CI; each hotspot component has at least one rendering and one interaction test.

### RT-29: Bound Firestore reads and paginate
- **Priority:** Medium | **Effort:** M | **Findings:** I-012, I-013, I-014 (also H-014), I-015
- **Problem:** `src/app/teacher/page-client.tsx:L106-L148` loads every course, assignment, student and submission; `src/app/teacher/grades/page.tsx:L113-L128` reads all submissions for a gradebook; `src/app/student/submissions/page.tsx:L36-L60` does one `getDoc` per submission inside each snapshot; `src/components/admin/global-analytics.tsx:L22-L24` reads the full organizations collection. Only 17 `limit()` calls exist repo-wide.
- **Steps:** maintain `submissionCount`/`gradedCount` on assignments via a Cloud Function and read those; use `getCountFromServer` for totals; `limit()` and paginate lists; denormalise assignment title onto submissions to remove the N+1.
- **Acceptance criteria:** dashboards issue a bounded number of reads independent of class size (verified by emulator read counts); no `getDoc` inside a snapshot callback.

### RT-30: Indexes and custom claims
- **Priority:** Medium | **Effort:** M | **Findings:** D-007
- **Problem:** `firestore.indexes.json:L1-L121` lacks 11 composite indexes used by queries; rules call `get()` one to three times per check (`firestore.rules:L4-L21`); users, teachers and students collections drift.
- **Steps:** add the 11 indexes (list in `D-firebase-rules.md`); move `role` and `organizationId` to custom claims and read them in rules; migrate off `teachers/` and `students/` reads; extend the `tools/migrate-school-security.cjs` pattern with a dry-run.
- **Acceptance criteria:** no query logs "requires an index"; rules tests pass using claims; rule `get()` count per request reduced (record before/after).

### RT-31: Lint and type safety to zero errors, stricter ESLint
- **Priority:** Medium | **Effort:** L | **Findings:** A-001 (also H-007), A-003, A-004, A-007, A-008, H-005, H-006
- **Problem:** `npx eslint .` reports 246 errors and 195 warnings, including React Compiler rules (`react-hooks/set-state-in-effect` at `src/components/motion/animated-sidebar.tsx:L336-L340`, `react-hooks/purity` at `src/components/ui/sidebar.tsx:L609-L611`). There are 131 type-safety suppressions (55 in server/AI libraries, `src/lib/ai/config.ts:L14-L126`). `eslint.config.mjs:L1-L20` has no promise, security or complexity rules; `tsconfig.json:L39-L45` excludes `functions/`.
- **Steps:** fix by rule in batches (auto-fixable 13 first); replace `any` in `src/lib/**`, `src/app/api/**`, `functions/src/**` with real types; enable `no-floating-promises`, `no-misused-promises`, `consistent-type-imports`, `eslint-plugin-security` and a complexity warning; make the CI lint job blocking.
- **Acceptance criteria:** `eslint .` exits 0; `any` count in server code is 0; CI lint job is required.

### RT-32: Accessibility remediation
- **Priority:** Medium | **Effort:** M | **Findings:** M-001, M-002, M-003, M-004, M-005 (plus Low M-006, M-007, M-009, M-011)
- **Problem:** 15 `autoFocus` uses, 10 in `src/components/math-builder-modal.tsx:L68-L259`; 9 labels not associated with controls (`src/components/landing/workspace-preview-pages.tsx:L873`); clickable `div`s without role or keyboard support (`src/components/calculator/scientific-calculator.tsx:L211`); custom drawers without dialog semantics (`src/app/student/assignment-view/page.tsx:L1530-L1545`); destructive button contrast below AA (`src/components/ui/button.tsx:L14`); icon buttons without labels (67 candidates, for example `src/components/demo-carousel.tsx:L146`).
- **Steps:** replace the drawers with the Radix `Sheet`/`Dialog` in `src/components/ui/sheet.tsx`; use `<button>` for clickable divs; associate labels; remove `autoFocus` except in dialogs' first field; darken `--destructive` and re-check dark mode; add `aria-label` to icon buttons; add captions track to videos; wrap motion in `MotionConfig reducedMotion="user"`.
- **Acceptance criteria:** axe/Lighthouse accessibility score 95 or higher on `/`, `/features`, `/pricing`, `/login`, `/signup`; keyboard-only run through assignment-view works; contrast of destructive button at least 4.5:1 in both themes.

### RT-33: Repository size and deploy path
- **Priority:** Medium | **Effort:** M | **Findings:** L-007, L-002 (also L-006, L-008, L-009, C-011)
- **Problem:** The repository is 257 MB because media files and many superseded versions live in history (`public/demos/scorpio-demo.mp4` and others), with no Git LFS. `firebase.json:L2-L24` suggests Firebase Hosting webframeworks while Vercel artefacts also exist, so the supported deploy path is ambiguous. Root clutter (`check_portfolios.ts`, `update_mermaid.py`, `demo.md`, `diagram.mermaid`, `opencode.json`), a stale `CHANGELOG.md` and a personal résumé PDF in `public/` remain.
- **Steps:** after RT-24 removes unused media, move remaining large media to Storage/CDN or Git LFS; consider a one-time history rewrite for the largest blobs (see `raw/git-large-objects.txt`) with team coordination; document one deploy path in `README.md`, add `.firebaserc` aliases for staging/prod, remove unused deploy artefacts; move or delete root clutter and the résumé PDF; adopt conventional commits via commitlint (optional) and keep `CHANGELOG.md` current.
- **Acceptance criteria:** fresh clone under 100 MB; README names exactly one deploy path and it works; root directory contains only intentional files.
