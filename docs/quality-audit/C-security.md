# Workstream C: Application Security (`C-security.md`)

**Date:** 2026-11-11  
**Auditor:** Agent (Workstream C)  
**Scope:** `src/app/api/**/route.ts` (29 routes), `src/lib/auth-verify.ts`, `src/lib/authenticated-fetch.ts`, `src/lib/assignment-security.ts`, `src/lib/rate-limit.ts`, `src/lib/ai/**`, `src/proxy.ts`, `next.config.mjs`, `firebase.json`, `public/`, and git history.

---

## Task Checklist

- [x] **C1** Scan for secrets across git history and working tree; verify `.env.local` gitignore & history; audit `public/` for sensitive/internal files.
- [x] **C2** Build complete AuthN/AuthZ matrix for all 29 `src/app/api/**/route.ts` files (methods, auth helper, role check, tenant/ownership check, input validation, rate limit).
- [x] **C3** Review `src/lib/auth-verify.ts`, `src/lib/authenticated-fetch.ts`, and `src/lib/assignment-security.ts` in depth.
- [x] **C4** Review webhooks (`src/app/api/webhooks/polar/route.ts`): signature verification, replay protection, idempotency, raw-body handling.
- [x] **C5** Review `src/lib/rate-limit.ts` architecture and route coverage (especially AI and code-redemption endpoints).
- [x] **C6** Check injection and XSS sinks (`dangerouslySetInnerHTML`, `innerHTML`, `showdown`, `eval`, `new Function`) and verify `raw/fallow-security.txt` CWE-79 candidates.
- [x] **C7** Check SSRF and open redirects (`/api/github/stats`, `/api/research/respond`, `/api/checkout`, `src/lib/onboarding-links.ts`, `src/proxy.ts`) and verify `raw/fallow-security.txt` CWE-918 / CWE-601 candidates.
- [x] **C8** Check HTTP security headers in `next.config.mjs` and `firebase.json`.
- [x] **C9** Analyze `raw/npm-audit.json` and `raw/npm-audit-functions.json` for reachable High/Critical vulnerabilities.
- [x] **C10** Verify PII scrubbing (`scrubPII`) across all LLM call paths and audit server/function logs for PII leakage (including `raw/fallow-security.txt` CWE-532 candidates).

---

## C1. Secrets & Public Asset Exposure

### 1.1 `.env.local` & Git History Scan
- **`.gitignore` Verification:** `.env.local` is ignored via `.gitignore:L39` (`.env*`).
- **`.env.local` Git History:** `git log --all --full-history -- .env.local` returned **0 commits** — `.env.local` was never committed. (Commit `74044d1` added only the template `.env.example`.)
- **Secret Scanner Execution:** The standalone `gitleaks` binary is not installed in the local environment and `npx gitleaks` has no executable binary (`npm error could not determine executable to run`). We performed a full-history regex scan via `git log -p --all -S` and `-G` for private keys, Google API keys (`AIza...`), Polar tokens (`polar_...`), Resend keys (`re_...`), and Brevo keys (`xkeysib-...`), and saved the structured report to `docs/quality-audit/raw/gitleaks.json`.
- **Critical Leak Found in Git History (`C-001`):**
  - Commit `dea0862` (`"fix: landing chat api route fixed w/ proxy based lazy init"`) hardcoded a real **Firebase Admin SDK RSA Private Key** (`-----BEGIN PRIVATE KEY-----...`) and service account email (`firebase-adminsdk-p19st@scorpio-srs.iam.gserviceaccount.com`) directly in `src/lib/firebase-admin.ts:L12-L42`.
  - Although commit `65737a2` (`"fix: firebase private key leak"`) removed the key from `HEAD`, the full private key remains permanently accessible in git history to anyone with read access to the repository.
  - Additionally, historical commits prior to `.gitignore` cleanup committed compiled `.next/` client bundles containing the Firebase Web API key (`AIzaSyD09...` for `scorpio-srs`).

### 1.2 Public Directory (`public/`) Audit (`C-011`)
The following personal or internal files are served publicly from `public/`:
- `public/Rushil_Mahadevu_Resume_2026.pdf` (565 KB) — Personal resume containing personal contact information/PII.
- `public/headshot-sage.jpg` (3.10 MB) — Uncompressed high-resolution personal photograph (likely EXIF-bearing original).
- `public/plan.jpg` (1.45 MB) — Internal planning diagram/image.
- `public/mission-control(outdated).png` (455 KB) — Outdated internal screenshot artifact.
- `public/architecture.pdf` (76 KB), `public/layering.pdf` (85 KB), `public/demos/comprehensive_metrics.pdf` (36 KB) — Internal/research PDFs (linked or staging docs, Low/Info risk).

---

## C2. API Route AuthN / AuthZ Matrix (All 29 Routes)

Every route under `src/app/api/**/route.ts` was inspected for HTTP methods, authentication helper, role check, tenant/ownership check, input validation, and rate limiting:

| # | Route (`src/app/api/...`) | Method(s) | AuthN Check | Role Check | Tenant / Ownership Check | Input Validation | Rate Limit | Gaps / Findings |
|---:|---|---|---|---|---|---|---|---|
| 1 | `account/route.ts` | `GET`, `DELETE` | `authenticateRequest` (`L17`, `L23`) | Any signed-in user; teacher check on `DELETE` (`L27` blocks if owning org/courses/assignments/students) | Own `caller.uid` only; `DELETE` enforces `auth_time <= 300s` (`L25`) | None (no body) | ❌ None | Missing rate limit on expensive multi-collection export/delete |
| 2 | `admin/firestore/route.ts` | `POST` | Static header `x-admin-secret === ADMIN_SECRET` (`L30-L33`) | None (shared secret only) | None (queries all 13 `ALLOWED_COLLECTIONS` across all tenants) | Manual check on `ALLOWED_COLLECTIONS`, `limit <= 100` (`L45, L70`); no Zod | ❌ None | **`C-003`**: Non-constant-time secret comparison, no user AuthN, no rate limit, leaks `err.message` (`L101`) |
| 3 | `ai/generate-title/route.ts` | `POST` | `withAuthorizedRequest` (`L3`) | Any signed-in user (`users/{uid}` exists) | None (returns static `"Physics conversation"`) | `withAuthorizedRequest` parses JSON (`<500KB`) | ❌ None | Stub endpoint returning hardcoded string |
| 4 | `ai/generate/route.ts` | `POST` | `withAuthorizedRequest(..., { identityField: "userId", teacher: true })` (`L71`) | `teacher` (`withAuthorizedRequest`) | Resolves `organizationId` from `users/{userId}` (`L27-L36`) + `checkBudget` (`L39`) | Manual check `!topic \|\| !userId` (`L12`); `count`/`difficulty`/`context` unvalidated; no Zod | ✅ `checkRateLimit` (5/min, `L17`) | **`C-008`**, **`C-009`**: No `scrubPII` on `topic`/`context`; no cap on `count`; leaks `error.message` |
| 5 | `ai/parse/route.ts` | `POST` | `withAuthorizedRequest(..., { identityField: "userId", teacher: true })` (`L62`) | `teacher` | Resolves `organizationId` from `users/{userId}` (`L20-L29`) + `checkBudget` (`L32`) | Manual check `!text \|\| !userId` (`L11`); no max chunk count; no Zod | ❌ **None** | **`C-002`**, **`C-008`**: Missing rate limit (loops batches of 5 questions to Gemini!); no `scrubPII(text)` |
| 6 | `ai/synthesize-rubric/route.ts` | `POST` | `withAuthorizedRequest(..., { identityField: "userId", teacher: true })` (`L54`) | `teacher` | Resolves `organizationId` from `users/{userId}` (`L20-L29`) + `checkBudget` (`L32`) | Manual check `!questionText \|\| !userId` (`L11`); no Zod | ❌ **None** | **`C-002`**, **`C-008`**, **`C-009`**: Missing rate limit; no `scrubPII`; leaks `error.message` |
| 7 | `assignments/route.ts` | `POST`, `GET` | `POST`: `withAuthorizedRequest({ teacher: true })` (`L6`); `GET`: `authenticateRequest` (`L27`) | `POST` & `GET`: `teacher` (`L24`, `L33`) | `POST`: checks `course.teacherId === caller.uid` (`L13`); `GET`: checks `teacherId === caller.uid` or `global` or `network` (`L33-L34`) | `POST`: checks `Array.isArray(questions) <= 100` & `splitAssignmentQuestions` (`L10, L15`), **but spreads `...data`** (`L18`); no Zod | ❌ None | **`C-004`**: Mass assignment via `{ ...data }` spread into Firestore `assignments` doc |
| 8 | `auth/register/route.ts` | `POST` | `authenticateRequest` (`L7`) | Self-assigns `student` or `teacher` (teacher requires valid `teacherInviteCodes` doc, `L25-L33`) | Enrolls in class via `findClassByCode` or org via invite inside transaction (`L18-L45`) | Manual checks on `role`, `name <= 120`, `code <= 128` (`L11-L16`); no Zod | ❌ **None** | **`C-002`**: Missing rate limit allows brute-forcing class codes or teacher invite codes |
| 9 | `auth/request-access/route.ts` | `POST` | `list`/`approve`/`reject`: `x-admin-secret` (`L24, L53, L95`); default submit action: **Public (None)** (`L111`) | Admin secret for admin actions; Public for access request submission | None | Email regex & `trim()` (`L114-L121`); no length bounds on `name`, `institution`, `message`; no Zod | ❌ **None** | **`C-002`**, **`C-003`**: Public submit action has no rate limit or length cap (Firestore spam risk); static admin secret |
| 10 | `auth/session/route.ts` | `POST`, `DELETE` | `POST`: `adminAuth.verifyIdToken(idToken, true)` (`L10`); `DELETE`: **None** (`L24`) | `POST`: checks `users/{uid}.role` in `['teacher', 'student']` (`L12`) | `POST`: Origin header check (`L7-L8`) | Manual destructuring `{ idToken }`; no Zod | ❌ None | **`C-006`**: `DELETE` does not verify caller or origin and never calls `adminAuth.revokeRefreshTokens(uid)` |
| 11 | `auth/teacher-code/route.ts` | `POST` | `generate`/`list`/`revoke`: `x-admin-secret` (`L22, L48, L77`); `validate`: **Public (None)** (`L93`) | Admin secret for admin actions; Public for `validate` | Optional `organizationId` bound to code | Manual checks on `action`, `code`; no Zod | ❌ **None** | **`C-002`**, **`C-003`**, **`C-009`**: Public `validate` has no rate limit (invite code enumeration); leaks `err.stack` when `NODE_ENV !== 'production'` (`L132`) |
| 12 | `chat/landing/route.ts` | `POST` | **Public (None)** (`L61`) | Guest / Visitor | Bills `process.env.LANDING_ORG_ID` (`L17, L105`) | Manual check `message <= 4000`, `visitorId` regex (`L65`); no Zod | ⚠️ `checkRateLimit(req, null, 'landing', 5/min)` (`L69`) | **`C-002`**, **`C-008`**: Rate limit & 10-msg cap trivially bypassed by spoofing `X-Forwarded-For` + `visitorId`; no `scrubPII` |
| 13 | `chat/limits/route.ts` | `POST` | `withAuthorizedRequest(..., { identityField: "userId", teacher: true })` (`L91`) | `teacher` | Resolves `organizationId` from `users/{userId}` (`L21-L30`) + `checkBudget` (`L33`) | Manual check `!message \|\| !userId` (`L12`); `chatHistory` unvalidated; no Zod | ❌ **None** | **`C-002`**, **`C-008`**: Missing rate limit; no `scrubPII` on `message` or `chatHistory` |
| 14 | `chat/route.ts` | `POST` | `withAuthorizedRequest(..., { identityField: "userId", teacher: false })` (`L89`) | Any signed-in user (but trusts `userRole` from body for prompt selection, `L11, L58`) | Resolves `organizationId` from `users/{userId}` or `teacherId` (`L22-L37`) + `checkBudget` (`L42`) | Manual check `!message \|\| !userRole \|\| !userId` (`L13`); no Zod | ✅ `checkRateLimit` (`chatbotConfig.rateLimit`, `L49`) | **`C-008`**: No `scrubPII(message)`; trusts client `userRole` instead of `userData.role` for feature list prompt |
| 15 | `checkout/route.ts` | `POST` | `withAuthorizedRequest(..., { identityField: "userId", teacher: true })` (`L99`) | `teacher` | Checks `orgData.ownerId === userId` (`L24`) | Manual check `!userId \|\| !organizationId \|\| !planId` + allowlist map (`L10, L29-L43`); no Zod | ❌ None | **`C-009`**: Leaks raw `polarError.body` and `polarError.message` in 500 response (`L84-L88`) |
| 16 | `courses/route.ts` | `POST` | `withAuthorizedRequest(..., { teacher: true })` (`L4`) | `teacher` | Assigns `teacherId: caller.uid`, `organizationId: profile.organizationId` (`L19`) | Manual check `name.trim()`, `code` regex `/^[A-Za-z0-9_-]{6,64}$/` (`L7-L8`); no Zod | ❌ None | Solid transactional course code reservation |
| 17 | `github/stats/route.ts` | `GET` | **Public (None)** (`L6`) | Public | Hardcoded repo `RushilMahadevu/scorpio` (`L22-L23`) | None (no parameters) | ❌ None (`force-dynamic` overrides `revalidate = 3600`!) | **`C-009`**: `export const dynamic = 'force-dynamic'` (`L3`) disables caching so every page hit calls GitHub API using server `GITHUB_TOKEN`; leaks raw GitHub error `details: text` (`L29`) |
| 18 | `grade/route.ts` | `POST` | `withAuthorizedRequest(..., { teacher: true, resource: "submission" })` (`L197`) | `teacher` | `withAuthorizedRequest` verifies `assignment.teacherId === caller.uid` (`auth-verify.ts:L56`) + acquires `grading_locks` (`L83-L90`) | Validated `submissionId` in `withAuthorizedRequest`; no Zod | ❌ **None** (only per-submission lock) | **`C-002`**, **`C-009`**: No per-teacher rate limit across multiple submissions; leaks `error.message` (`L193`) |
| 19 | `notebook/chat/route.ts` | `POST` | `withAuthorizedRequest(..., { identityField: "studentId", teacher: false })` (`L91`) | Any signed-in user (intended for student) | Resolves `organizationId` from `users/{studentId}` or `teacherId` (`L28-L43`) + `checkBudget` (`L57`) | Manual check `!messages \|\| !studentId` (`L17`); no Zod | ✅ `checkRateLimit` (20/min, `L22`) | **`C-008`**: `scrubPII` only passes `[studentData?.displayName]` (omits classmates); non-atomic `notebookUsage >= notebookLimit` check before increment (`L53, L74`) |
| 20 | `research/respond/route.ts` | `POST` | Static header `x-admin-secret === ADMIN_SECRET` (`L6`) | Admin secret only | Bills `process.env.LANDING_ORG_ID` (`L10`) | Manual check `message <= 10000`, `level in CONSTRAINT_LEVELS` (`L8`); no Zod | ❌ **None** | **`C-002`**, **`C-003`**: Static secret comparison (`!==`), no rate limit |
| 21 | `student/enrollment/route.ts` | `POST` | `withAuthorizedRequest` (`L6`) | Checks `profile?.role === "student"` in transaction (`L14`) | Enrolls in class via `findClassByCode` (`L20`); prevents switching if already enrolled (`L22`) | Manual check inside `findClassByCode`; no Zod | ❌ **None** | **`C-002`**: Missing rate limit allows brute-forcing class codes |
| 22 | `student/tutor/route.ts` | `POST` | `withAuthorizedRequest(..., { identityField: "userId", teacher: false })` (`L92`) + redundant `verifyCallerIdentity` (`L16`) | Checks `role === "student"` from request body (`L12`), **not** `userData.role`! | Resolves `organizationId` from `users/{userId}` or `teacherId` (`L26-L41`) + `checkBudget` (`L64`) | Manual check `!message \|\| !userId \|\| role !== "student"` (`L12`); no Zod | ❌ **None** | **`C-002`**: Missing `checkRateLimit` on primary student AI tutor endpoint! Also checks `role` from request body (`L12`) instead of `userData.role` |
| 23 | `submissions/route.ts` | `POST` | `withAuthorizedRequest` (`L6`) | Checks `profile.role === 'student'` (`L12`) | Verifies student is enrolled in assignment (`L20-L23`), owns existing submission (`L24`), and attachment URLs match `submissions/${caller.uid}/` (`L39-L44`) | Manual validation of `assignmentId`, `status`, `answers <= 100`, `answer <= 50000`, `workFiles <= 20`; no Zod | ❌ None | Well-hardened transactional submission validation |
| 24 | `support/report/route.ts` | `POST` | `withAuthorizedRequest(..., { identityField: "userId" })` (`L75`) | Any signed-in user | `identityField: "userId"` | Manual check `description.trim()` (`L22`); no length bounds on `description`, `screenshots`, `title`; no Zod | ❌ **None** | **`C-002`**, **`C-008`**: Missing rate limit and field size bounds; logs PII in `reportData` (`L57`) |
| 25 | `teacher/network/invites/route.ts` | `POST` | `withAuthorizedRequest(..., { teacher: true })` (`L6`) | `teacher` (`L12`) | Verifies `network?.ownerId === caller.uid` in transaction (`L15`) | No body parameters used | ❌ None | Uses 128-bit `randomBytes(16)` code (`L8`); solid |
| 26 | `teacher/network/membership/route.ts` | `POST` | `withAuthorizedRequest(..., { teacher: true })` (`L5`) | `teacher` | Checks `org?.ownerId === caller.uid` for `remove` (`L33`) and `target?.organizationId === profile.organizationId` (`L41`) | Manual checks on `action`, `name <= 120`, `code`, `memberId`; no Zod | ❌ None | Updates `users/{uid}` but does **not** update legacy `teachers/{uid}` mirror doc (`L18, L28, L44`) |
| 27 | `teacher/network/portfolio/route.ts` | `POST` | `withAuthorizedRequest(..., { identityField: "teacherId", teacher: true, resource: "portfolio" })` (`L116`) | `teacher` (`L23`) | `withAuthorizedRequest` verifies `student.teacherId === caller.uid` or colleague in same org (`auth-verify.ts:L67-L70`) | Manual check `!teacherId \|\| !studentId \|\| !organizationId` (`L13`); no Zod | ❌ **None** | **`C-002`**, **`C-008`**: Missing rate limit on 8,192-output-token AI call; `scrubPII` only masks `[studentName]` |
| 28 | `teacher/students/cleanup/route.ts` | `POST` | `withAuthorizedRequest(..., { teacher: true })` (`L5`) | `teacher` | Verifies `profile?.teacherId === caller.uid` (`L10`) and `assignment?.teacherId === caller.uid` (`L16`) | Manual check `typeof studentId === 'string'`, `!studentId.includes('/')` (`L8`); no Zod | ❌ None | Solid ownership checks before deleting student submissions/files |
| 29 | `webhooks/polar/route.ts` | `POST` | Polar webhook signature `validateEvent(body, headers, POLAR_WEBHOOK_SECRET!)` (`L9`) | Webhook (Polar) | Validates `orgId` format and updates `organizations/{orgId}` in transaction (`L17-L37`) | Validates `event.type.startsWith('subscription.')`, `modified`, `orgId`; no Zod | ❌ None | Well-designed idempotency (`billing_events/{eventId}`) and out-of-order timestamp guard (`L27-L28`) |

---

## C3. Deep Dive: `auth-verify.ts`, `authenticated-fetch.ts`, and `assignment-security.ts`

### 3.1 `src/lib/auth-verify.ts`
- **Token Verification (`L6-L20`):**
  - Checks `Authorization: Bearer <token>` first via `adminAuth.verifyIdToken(bearer.slice(7), true)` (`checkRevoked = true`).
  - Falls back to `__session` cookie via `adminAuth.verifySessionCookie(token, true)` (`checkRevoked = true`).
  - **Gap (`C-006`):** While `verifyIdToken` and `verifySessionCookie` pass `checkRevoked = true`, `DELETE /api/auth/session` (`src/app/api/auth/session/route.ts:L24-L27`) only clears the browser cookie and never calls `adminAuth.revokeRefreshTokens(uid)`. Thus, server-side revocation is never triggered on logout.
- **Role & Tenant Resolution (`L45-L80`):**
  - Looks up `users/{caller.uid}` in Firestore on **every** authorized API call (plus a second lookup on `users/{profile.teacherId}` if `organizationId` is missing on a student). Furthermore, individual route handlers (e.g., `/api/ai/generate`, `/api/chat`, `/api/student/tutor`, `/api/teacher/network/portfolio`) immediately re-fetch `users/{userId}` a second time and `checkBudget` fetches `users/{userId}` a third time!
  - Custom claims are not used, resulting in 2–4 redundant Firestore `users/{uid}` reads per API request.
- **Body Parsing & Size Limit (`L39-L41`):**
  - `withAuthorizedRequest` clones the request (`await req.clone().text()`), enforces a 500 KB payload cap (`Buffer.byteLength(raw) > 500000`), and calls `JSON.parse(raw)`.
  - Note: For `GET` or bodyless requests wrapped in `withAuthorizedRequest` (if any), `JSON.parse("")` would throw and return `400 Unable to authorize request`. Currently all routes using `withAuthorizedRequest` are `POST` routes, though `tests/security/workflows.test.ts:L80-L81` passes `{}` on `GET`/`DELETE` to `/api/account` (which uses `authenticateRequest` directly).
- **Concurrency Locking (`L81-L96`):**
  - For `resource: "submission"`, `withAuthorizedRequest` acquires a 15-minute lease in `grading_locks/{submissionId}` via `adminDb.runTransaction`, preventing duplicate concurrent AI grading of the same submission.

### 3.2 `src/lib/authenticated-fetch.ts`
- Attaches `Authorization: Bearer ${await user.getIdToken()}` to client `fetch` requests (`L3-L9`).
- **Fallow CWE-918 Candidate (`src/lib/authenticated-fetch.ts:L8`):** Verified **False Positive** for SSRF. This is a client-side browser helper (`auth.currentUser`) called exclusively with hard-coded relative API paths (e.g., `` `/api/assignments?id=${encodeURIComponent(id)}` ``).

### 3.3 `src/lib/assignment-security.ts`
- `splitAssignmentQuestions` (`L15-L27`) uses `Object.create(null)` for the `answers` map, explicitly rejects prototype-pollution keys (`['__proto__', 'constructor', 'prototype']`), enforces `/^[A-Za-z0-9_-]{1,128}$/` on `question.id`, validates uniqueness, caps `question.text` at 50,000 chars, and strips `correctAnswer` from the public `assignments` document so answer keys are stored exclusively in `assignment_keys/{id}`. This is well-engineered.

---

## C4. Webhook Security (`src/app/api/webhooks/polar/route.ts`)

- **Raw Body & Signature Verification (`L7-L10`):** Reads the raw request body via `await req.text()` before parsing and verifies the Polar Standard Webhooks signature via `validateEvent(body, Object.fromEntries(req.headers), process.env.POLAR_WEBHOOK_SECRET!)`. Returns `401 Invalid signature` on failure.
- **Event Filtering (`L12`):** Explicitly ignores non-subscription events (`if (!event.type.startsWith('subscription.')) return NextResponse.json({ received: true });`), preventing `order.created` from prematurely granting paid access.
- **Replay & Out-of-Order Protection (`L19-L37`):**
  - Computes a SHA-256 `eventId` from `req.headers.get('webhook-id') || body`.
  - Inside a Firestore transaction (`adminDb.runTransaction`), checks `billing_events/{eventId}` for idempotency (`if (seen.exists || !org) return;`) and checks `modified < (org.billingUpdatedAt || 0)` to ignore stale/out-of-order webhook deliveries.
  - Resets `aiUsageCurrent` and `notebookUsageCurrent` **only** when `currentPeriodStart` advances (`org.billingPeriodStart !== periodStart`).
- **Minor Observation:** `process.env.POLAR_WEBHOOK_SECRET!` uses a non-null assertion; if the env var is unset, `validateEvent` throws and the `catch` block safely returns `401 Invalid signature`.

---

## C5. Rate Limiting Review (`src/lib/rate-limit.ts`)

- **Storage Mechanism (`src/lib/rate-limit.ts:L35-L69`):**
  - Contrary to typical serverless pitfalls, `checkRateLimit` is **not** in-memory; it uses a Firestore transaction on `rate_limits/{endpointType}_{identifier}` and fails closed (`allowed: false`) on database errors (`L70-L73`).
- **Critical Weaknesses (`C-002`):**
  1. **IP Spoofing via `x-forwarded-for` (`src/lib/rate-limit.ts:L22`):**
     ```ts
     const ip = req.headers.get("x-forwarded-for") || "unknown-ip";
     const identifier = userId || ip;
     ```
     When `userId` is `null` (as in `/api/chat/landing/route.ts:L69`), `checkRateLimit` trusts the raw `x-forwarded-for` request header string. An attacker can send a random `X-Forwarded-For` header and a random `visitorId` on every request to bypass both the 5 req/min rate limit and the 10-message `landing_visitors` limit, draining the `LANDING_ORG_ID` AI budget.
  2. **Missing Rate Limits on 25 of 29 Routes:**
     - **Unprotected AI routes:** `/api/student/tutor` (the main student Socratic AI tutor!), `/api/ai/parse` (which loops batches of 5 questions to Gemini), `/api/ai/synthesize-rubric`, `/api/grade`, `/api/teacher/network/portfolio`, and `/api/research/respond` do **not** call `checkRateLimit()`.
     - **Unprotected Auth / Code-Redemption routes:** `/api/auth/teacher-code` (`action: "validate"`), `/api/auth/register`, `/api/student/enrollment`, and `/api/auth/request-access` have no rate limit, enabling automated brute-forcing of teacher invite codes (`SCORP-XXXX-XXXX`) and class codes or spamming `accessRequests`.

---

## C6. Injection & XSS Analysis

All occurrences of `dangerouslySetInnerHTML`, `innerHTML`, `showdown`, `rehype-raw`, `eval(`, and `new Function` across `src/` and `functions/src/` were audited:

| Location | Sink / Library | Verification & Risk |
|---|---|---|
| `src/app/student/notebook/page.tsx:L68,L73,L129,L721` | `Showdown.Converter().makeHtml(content)` → `<RichTextEditor content={getHtml(content)} />` | **Finding `C-010` (Low):** `Showdown` converts student notebook Markdown into unsanitized HTML (`getHtml`) and passes it to TipTap's `setContent()`. TipTap's ProseMirror schema strips `<script>` tags when building its document tree, and `prosemirror-view` is patched only in `>=1.42.3` (currently vulnerable `<1.42.3`, see `C-005`). Unsanitized HTML conversion from `showdown` should be sanitized with `DOMPurify` or replaced with TipTap markdown extensions. |
| `src/components/math-input.tsx:L180` | `div.innerHTML = valueToHTML(value)` | **Verified Safe (False Positive in `fallow-security.txt`):** `valueToHTML` (`L17-L60`) escapes `&`, `<`, `>`, and `"` via `esc()` (`L13-L15`) before applying bold/italic/list tags, and renders math chips via `katex.renderToString(latex, { throwOnError: false, displayMode: false, output: "html" })` (where KaTeX `trust` defaults to `false`). |
| `src/components/loading-screen.tsx:L89` | `<script dangerouslySetInnerHTML={{ __html: introScript }} />` | **Verified Safe (False Positive in `fallow-security.txt`):** `introScript` (`L5-L31`) is a module-level compile-time constant string literal with zero external/user input. |
| `src/app/layout.tsx:L150` | `<script dangerouslySetInnerHTML={{ __html: ... }} />` | **Verified Safe (False Positive in `fallow-security.txt`):** Inline font-migration script is a static template literal that validates `localStorage.getItem("app-font")` against a strict 6-item allowlist (`fonts.includes(font)`). |
| `src/components/markdown-renderer.tsx:L27-L62` | `<ReactMarkdown remarkPlugins={[...]} rehypePlugins={[rehypeKatex]}>` | **Verified Safe:** Uses `react-markdown` without `rehype-raw`, so raw HTML in AI or user markdown is escaped by default. External links render with `target="_blank" rel="noopener noreferrer"`. |

---

## C7. SSRF & Open Redirects (Including `fallow-security.txt` Verification)

Every SSRF (`CWE-918`) and Open Redirect (`CWE-601`) candidate from `docs/quality-audit/raw/fallow-security.txt` and the evaluation plan was traced from source to sink:

| Candidate Location | Sink | Verification Result |
|---|---|---|
| `src/lib/authenticated-fetch.ts:L8` (Fallow #3) | `fetch(input, ...)` | **False Positive:** Client-side browser fetch wrapper; all callers pass static internal `/api/...` paths. |
| `src/lib/ai/config.ts:L64` (Fallow #4) | `fetch(url, ...)` | **False Positive:** `url` (`L17`) is hardcoded to `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`. Host and path are not user-controlled. |
| `src/app/api/github/stats/route.ts:L22-L23` | `fetch('https://api.github.com/repos/RushilMahadevu/scorpio/commits...')` | **Safe for SSRF (hardcoded URL):** Destination URL is a constant string literal. (Note: `dynamic = 'force-dynamic'` on `L3` defeats caching; see `C-009`.) |
| `src/app/api/checkout/route.ts:L62` & `src/app/teacher/network/billing/page.tsx:L79` (Fallow #7) | `successUrl` in Polar checkout & `window.location.href = data.url` | **Safe:** `successUrl` uses `process.env.NEXT_PUBLIC_APP_URL \|\| req.nextUrl.origin` + `/teacher/network?success=true`. On the client (`billing/page.tsx:L79`), `data.url` comes from the server-created Polar checkout session (`polar.checkouts.create`). |
| `src/lib/onboarding-links.ts:L1-L11` & `src/app/login/page.tsx:L80` (Fallow #6) | `window.location.href = target` | **Safe (False Positive):** `classInvitePath` and `networkInvitePath` construct relative paths `/join/class/${encodeURIComponent(code)}` and `/join/network/${encodeURIComponent(code)}`. Because `encodeURIComponent` encodes `/` and `:`, `target` in `login/page.tsx:L77-L80` is always a same-origin path starting with `/join/` or `/teacher` or `/student`. |
| `src/app/join/invite-actions.tsx:L81` (Fallow #13) | `window.location.assign(destination)` | **Safe (False Positive):** `destination` (`L66`) is a hardcoded ternary: `studentInvite ? "/student" : "/teacher/network"`. |
| `src/app/teacher/vault/page.tsx:L179` (Fallow #8) | `window.location.href = pendingNavUrl` | **Safe (False Positive):** `pendingNavUrl` is captured from an existing DOM `<a href>` click when the user has unsaved changes (`L155-L166`) and only navigated after the user confirms the "Unsaved changes" dialog. |
| `src/proxy.ts:L9,L11,L14` (Fallow #9, #10, #11) | `NextResponse.redirect(new URL('/login' \| '/signup' \| home, request.url))` | **Safe (False Positive):** The first argument to `new URL(...)` is strictly one of the hardcoded strings `'/login'`, `'/signup'`, `'/teacher'`, or `'/student'`. |

---

## C8. Security Headers (`next.config.mjs` & `firebase.json`)

- **`next.config.mjs` (`L1-L10`):** Defines no `headers()` function and does not set `poweredByHeader: false`.
- **`firebase.json` (`L9-L28`):** Defines only `Cache-Control` headers (`public, max-age=31536000, immutable` for static assets and `no-cache` for `/**`).
- **Missing Headers (`C-007`):**
  - `Content-Security-Policy` (CSP)
  - `Strict-Transport-Security` (HSTS, e.g., `max-age=63072000; includeSubDomains; preload`)
  - `X-Frame-Options` (`DENY` or `SAMEORIGIN`) / CSP `frame-ancestors 'none'`
  - `X-Content-Type-Options` (`nosniff`)
  - `Referrer-Policy` (`strict-origin-when-cross-origin`)
  - `Permissions-Policy` (`camera=(), microphone=(), geolocation=()`)

---

## C9. Dependency Vulnerabilities (`npm audit`)

From `docs/quality-audit/raw/npm-audit.json` (root) and `docs/quality-audit/raw/npm-audit-functions.json` (`functions/`):

| Scope | Critical | High | Moderate | Low | Total |
|---|---:|---:|---:|---:|---:|
| Root (`package.json`) | 6 | 39 | 44 | 8 | **97** |
| Cloud Functions (`functions/package.json`) | 3 | 13 | 24 | 8 | **48** |

### Reachability Triage of Critical & High Advisories (`C-005`)
1. **Directly Reachable in Production Next.js Runtime (`next@16.2.1` — CRITICAL):**
   - `next` (`9.3.4-canary.0 - 16.4.0`) has **34 advisories**, including Middleware/Proxy bypass via dynamic route parameter injection and segment-prefetch routes (`GHSA-492v-c6pp-mqqv`, `GHSA-267c-6grr-h53f`, `GHSA-26hh-7cqf-hhc6` — directly relevant because Scorpio relies on `src/proxy.ts` for `/teacher/:path*` and `/student/:path*` route protection!), Server Components DoS (`GHSA-q4gf-8mx6-v5v3`), and RSC cache poisoning (`GHSA-vfv6-92ff-j949`, `GHSA-wfc6-r584-vfw7`).
2. **Directly Reachable in Rich Text Editor (`@tiptap/core@<=3.30.4` & `prosemirror-view@<1.42.3` — HIGH):**
   - Used in `src/components/rich-text-editor.tsx` (Student Notebook). Vulnerable to XSS in `prosemirror-view` paste handling (`GHSA-c8x8-7fp4-3x9w`), DOM attribute prototype injection in `@tiptap/core` `mergeAttributes()` (`GHSA-cp6q-959q-f8rh`), and quadratic ReDoS (`GHSA-j95f-988m-3j2f`).
3. **Reachable in Server / Cloud Functions Runtime (`protobufjs@<=7.6.4` CRITICAL, `@grpc/grpc-js@<=1.14.4` HIGH, `undici@<=6.29.0` HIGH, `zod@<4.6.6` HIGH):**
   - `protobufjs` and `@grpc/grpc-js` are transitive dependencies of `firebase-admin` and `@google-cloud/firestore` in both root and `functions/`.
4. **Unreachable Bloat in Root `dependencies` (`vercel`, `sib-api-v3-sdk`, `firebase-functions`):**
   - Over half of the High/Critical package entries in root (`tar`, `handlebars`, `path-to-regexp`, `@vercel/*`, `basic-ftp`, `node-forge`) come from `vercel@^50.39.0` (the deploy CLI) and `sib-api-v3-sdk@^8.5.0` being listed in root `dependencies` despite never being imported in `src/` (cross-referenced with Workstream J `J-001`).

---

## C10. PII Handling & Logging Review

### 10.1 PII Masking Before Gemini API Calls (`C-008`)
The README claims *"PII Masking / School Privacy Review (FERPA/COPPA)"*. Auditing all 10 AI call paths revealed inconsistent enforcement:

| AI Endpoint / Function | Calls `scrubPII()`? | Student Roster Names Passed? | Status |
|---|---|---|---|
| `/api/student/tutor` → `explainPhysicsConcept` / `helpSolveProblem` (`src/lib/ai/tutor.ts:L27,L80`) | ✅ Yes (`message`, `chatHistory`, `assignmentContext`) | ✅ Yes (queries teacher's student roster, `L48-L58`) | ✅ Compliant |
| `/api/grade` → `gradeResponse` (`src/lib/ai/grading.ts:L25-L30`) | ✅ Yes (`question`, `rubric`, `answer`) | ✅ Yes (queries teacher's student roster, `L64-L76`) | ✅ Compliant |
| `functions/src/grading.ts` → `gradeResponseAI` (`L84-L90`) | ✅ Yes (duplicate `scrubPII` implementation) | ✅ Yes (queries teacher's student roster, `L201-L208`) | ✅ Compliant (duplicated code) |
| `/api/notebook/chat` (`src/app/api/notebook/chat/route.ts:L60`) | ⚠️ Partial (`messages`, `notebookContent`) | ⚠️ Only `[studentData?.displayName]` (does **not** include classmates' names) | ⚠️ Partial |
| `/api/teacher/network/portfolio` → `generateStudentPortfolio` (`src/lib/ai/network.ts:L128`) | ⚠️ Partial (`chatHistory`) | ⚠️ Only `[studentName]` (does **not** include classmates' names) | ⚠️ Partial |
| `/api/chat` → `getNavigationResponse` (`src/lib/ai/chatbot.ts:L16`) | ❌ **No** | ❌ None | ❌ **Unscrubbed** |
| `/api/chat/limits` → `getNetworkLimitsHelp` (`src/lib/ai/network.ts:L63-L67`) | ❌ **No** (`message`, `chatHistory`, `orgName`) | ❌ None | ❌ **Unscrubbed** |
| `/api/chat/landing` (`src/app/api/chat/landing/route.ts:L105`) | ❌ **No** (`message`) | ❌ None | ❌ **Unscrubbed** |
| `/api/ai/parse` → `parseQuestionsFromText` (`src/lib/ai/assignment.ts:L9`) | ❌ **No** (raw pasted document text sent to Gemini) | ❌ None | ❌ **Unscrubbed** |
| `/api/ai/generate` & `/api/ai/synthesize-rubric` (`src/lib/ai/assignment.ts:L78`, `grading.ts:L131`) | ❌ **No** (`topic`, `learningObjectives`, `questionText`) | ❌ None | ❌ **Unscrubbed** |

### 10.2 PII & Secrets in Logs (Including `fallow-security.txt` CWE-532 Verification)
- `functions/src/index.ts:L108`: `console.error(\`Failed to email student \${student.email}\`, err);` — **Logs student email PII** to Cloud Logging.
- `functions/src/lib/email.ts:L34,L37`: `console.log(\`Email sent successfully to \${to}\`, data);` and `console.error(\`Failed to send email to \${to}\`, error);` — **Logs recipient student email PII** on every email send.
- `src/app/api/support/report/route.ts:L57`: `console.log('[Support API] Admin DB not available, logged report:', reportData);` — **Logs full `reportData` containing `userEmail`, `userName`, `userId`**.
- `functions/src/index.ts:L35` & `L113` (Fallow #1 & #2): Logs only `assignmentId` (`event.params.assignmentId`) and submission count (`snapshot.size`). **False Positive for PII**, though `firebase-functions/logger` should be used instead of `console.log`.
- `tools/migrate-school-security.cjs:L30` (Fallow #12): Logs only `projectId` (`process.env.FIREBASE_PROJECT_ID`) and migrated assignment count. **False Positive for secret leak**.

---

## Detailed Findings (Workstream C)

### `C-001` — Firebase Admin SDK Service Account Private Key Committed in Git History
| Field | Value |
|---|---|
| **ID** | `C-001` |
| **Severity** | **Critical** |
| **Category** | `security` |
| **Location** | `src/lib/firebase-admin.ts:L12-L42` (commit `dea0862`) |
| **Effort** | `S` (<1h) |
| **Confidence** | `High` |

**Evidence:**
In commit `dea0862` (and visible in the diff of `65737a2`), a production Firebase Admin service account email and RSA private key were committed directly into `src/lib/firebase-admin.ts`:
```ts
// Commit dea0862 in src/lib/firebase-admin.ts:L12-L42
const projectId = process.env.FIREBASE_PROJECT_ID || 'scorpio-srs';
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || 'firebase-adminsdk-p19st@scorpio-srs.iam.gserviceaccount.com';
const privateKey = (process.env.FIREBASE_PRIVATE_KEY || `-----BEGIN PRIVATE KEY-----
[REDACTED: key body removed from this report]
-----END PRIVATE KEY-----`)
```
**Impact:**
Firebase Admin service accounts bypass all Firestore and Storage security rules and have full read/write/delete access to all users, grades, assignments, and organizations in the `scorpio-srs` project. Removing a secret in a subsequent commit (`65737a2`) does not remove it from `.git` history.
**Recommendation:**
1. Immediately revoke and delete key ID associated with `firebase-adminsdk-p19st@scorpio-srs.iam.gserviceaccount.com` in Google Cloud IAM & Admin → Service Accounts (if not already rotated after `65737a2`).
2. Purge the historical key from git history using `git filter-repo` or BFG Repo-Cleaner and force-push all branches/tags.
3. Add `gitleaks` to a pre-commit hook and GitHub Actions CI workflow.

---

### `C-002` — Missing Rate Limits on 6 AI & 4 Auth Endpoints + Spoofable `X-Forwarded-For` on `/api/chat/landing`
| Field | Value |
|---|---|
| **ID** | `C-002` |
| **Severity** | **High** |
| **Category** | `security` |
| **Location** | `src/lib/rate-limit.ts:L21-L23` |
| **Effort** | `M` (<1 day) |
| **Confidence** | `High` |

**Evidence:**
```ts
// src/lib/rate-limit.ts:L21-L23
const ip = req.headers.get("x-forwarded-for") || "unknown-ip";
const identifier = userId || ip;
```
And in `src/app/api/chat/landing/route.ts:L63-L70`:
```ts
const { message, visitorId } = await req.json();
...
const rate = await checkRateLimit(req, null, 'landing', { windowMs: 60000, maxRequests: 5 });
```
Furthermore, `checkRateLimit` is called in only 4 of 29 API routes (`ai/generate`, `chat`, `chat/landing`, `notebook/chat`). It is completely absent from:
- AI routes: `src/app/api/student/tutor/route.ts:L8-L90`, `src/app/api/ai/parse/route.ts:L7-L60`, `src/app/api/ai/synthesize-rubric/route.ts:L7-L52`, `src/app/api/grade/route.ts:L8-L195`, `src/app/api/teacher/network/portfolio/route.ts:L9-L114`, `src/app/api/chat/limits/route.ts:L8-L89`, `src/app/api/research/respond/route.ts:L5-L13`.
- Public/Auth code validation routes: `src/app/api/auth/teacher-code/route.ts:L93-L122`, `src/app/api/auth/register/route.ts:L6-L50`, `src/app/api/student/enrollment/route.ts:L6-L36`, `src/app/api/auth/request-access/route.ts:L111-L150`.

**Impact:**
1. An unauthenticated attacker can rotate `X-Forwarded-For` and `visitorId` on `/api/chat/landing` to send unlimited Gemini requests billed to `LANDING_ORG_ID`.
2. Attackers can brute-force teacher invite codes (`SCORP-XXXX-XXXX`) via `/api/auth/teacher-code` (`action: 'validate'`) or class codes via `/api/student/enrollment`, or spam `accessRequests` in Firestore.
3. Authenticated users can flood `/api/student/tutor` or `/api/ai/parse` with burst requests.

**Recommendation:**
1. In `src/lib/rate-limit.ts`, extract only the platform-trusted client IP (e.g., last hop appended by Cloud Run/Firebase Hosting or `req.headers.get("x-fah-client-ip")` / `x-real-ip`) and hash the IP.
2. Add `checkRateLimit` to `withAuthorizedRequest` in `src/lib/auth-verify.ts` with sensible per-feature defaults so all authenticated AI and mutation routes are protected automatically.
3. Add strict IP-based `checkRateLimit` (e.g., 10 req / 15 min) to `/api/auth/teacher-code`, `/api/auth/register`, `/api/student/enrollment`, and `/api/auth/request-access`.

---

### `C-003` — Admin Endpoints Rely on Non-Constant-Time Static Shared Secret Header Without User AuthN or Audit Trail
| Field | Value |
|---|---|
| **ID** | `C-003` |
| **Severity** | **High** |
| **Category** | `security` |
| **Location** | `src/app/api/admin/firestore/route.ts:L30-L33` |
| **Effort** | `M` (<1 day) |
| **Confidence** | `High` |

**Evidence:**
```ts
// src/app/api/admin/firestore/route.ts:L30-L33
const adminSecret = req.headers.get('x-admin-secret');
if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```
Identical pattern in `src/app/api/auth/request-access/route.ts:L10-L13`, `src/app/api/auth/teacher-code/route.ts:L22-L25,L48-L51,L77-L80`, and `src/app/api/research/respond/route.ts:L6`.
**Impact:**
1. Standard `!==` string comparison is susceptible to timing side-channel attacks, compounded by the lack of rate limiting on all four routes.
2. `/api/admin/firestore` dumps raw documents from 13 collections (`users`, `organizations`, `submissions`, `portfolios`, `teacherInviteCodes`, `accessRequests`, etc.) across all schools/tenants without verifying a Firebase Auth user token or logging which administrator accessed the data.
**Recommendation:**
1. Require Firebase Authentication (`authenticateRequest(req)`) with a verified super-admin custom claim (`caller.super_admin === true`) or allowlisted admin UID/email on all `/api/admin/*`, `/api/auth/teacher-code` (admin actions), `/api/auth/request-access` (admin actions), and `/api/research/respond` endpoints.
2. If retaining `ADMIN_SECRET` as a secondary factor, compare hashes using `crypto.timingSafeEqual` and enforce strict rate limiting (`checkRateLimit`).

---

### `C-004` — Unvalidated Request Body Spread (`...data`) in `POST /api/assignments` and Zero `zod` Schema Usage Across API Routes
| Field | Value |
|---|---|
| **ID** | `C-004` |
| **Severity** | **High** |
| **Category** | `security` |
| **Location** | `src/app/api/assignments/route.ts:L8-L21` |
| **Effort** | `M` (<1 day) |
| **Confidence** | `High` |

**Evidence:**
```ts
// src/app/api/assignments/route.ts:L8-L21
const data = await req.json();
...
batch.set(ref, { ...data, teacherId: caller.uid, organizationId: profile.organizationId || null,
  questions: publicQuestions, rubric: null, answerKeySeparated: true,
  dueDate: data.dueDate ? new Date(data.dueDate) : null, createdAt: new Date() });
```
**Impact:**
Because `{ ...data }` is spread directly into the Firestore `assignments` document without an allowlist or schema validator, a teacher client can inject arbitrary fields, invalid `visibility` strings, or unvalidated `gradingType` / `totalPoints` types into `assignments/{id}` via Admin SDK (bypassing Firestore security rules). Across all 29 API routes, `zod` is never imported despite `zod@^4.1.13` being installed.
**Recommendation:**
1. Replace `{ ...data, ... }` in `src/app/api/assignments/route.ts:L18` with an explicit Zod schema (`AssignmentCreateSchema.parse(await req.json())`) that allowlists only known fields (`title`, `description`, `topic`, `courseId`, `visibility`, `dueDate`, `timeLimit`, `gradingType`, `requireWorkSubmission`, `allowAIHelp`, `allowCalculator`, `enableTabDetection`, `lockdownMode`, `totalPoints`, `questions`, `rubric`).
2. Add shared Zod request schemas for all 29 API routes.

---

### `C-005` — Reachable Critical & High CVEs in `next@16.2.1`, `@tiptap/core`, `prosemirror-view`, and `protobufjs`
| Field | Value |
|---|---|
| **ID** | `C-005` |
| **Severity** | **High** |
| **Category** | `deps` |
| **Location** | `package.json:L49-L91` |
| **Effort** | `S` (<1h) |
| **Confidence** | `High` |

**Evidence:**
From `docs/quality-audit/raw/npm-audit.json` and `raw/npm-audit-functions.json`:
- `next@16.2.1` (**Critical**, direct dependency): Vulnerable to App Router Middleware/Proxy bypass via segment-prefetch routes (`GHSA-267c-6grr-h53f`, `GHSA-26hh-7cqf-hhc6`) and dynamic route parameter injection (`GHSA-492v-c6pp-mqqv`), RSC cache poisoning (`GHSA-vfv6-92ff-j949`), and Server Components DoS (`GHSA-q4gf-8mx6-v5v3`).
- `prosemirror-view@<1.42.3` & `@tiptap/core@<=3.30.4` (**High**, used in `src/components/rich-text-editor.tsx`): Vulnerable to paste-handler XSS (`GHSA-c8x8-7fp4-3x9w`) and `__proto__` DOM attribute injection (`GHSA-cp6q-959q-f8rh`).
- `protobufjs@<=7.6.4` (**Critical**, transitive via `firebase-admin` in root and `functions/`): Arbitrary code execution / prototype pollution (`GHSA-xq3m-2v4x-88gg`, `GHSA-66ff-xgx4-vchm`).
**Impact:**
Middleware/Proxy bypass advisories in `next@16.2.1` directly affect `src/proxy.ts` route protection, and `prosemirror-view` / `@tiptap/core` XSS advisories affect the Student Notebook rich-text editor.
**Recommendation:**
Upgrade `next` to `>=16.4.1`, `@tiptap/*` to `>=3.30.5` (with `prosemirror-view>=1.42.3`), `zod` to `>=4.6.6`, remove unused `vercel` and `sib-api-v3-sdk` from root `dependencies`, and run `npm audit fix` in both root and `functions/`.

---

### `C-006` — `DELETE /api/auth/session` Does Not Revoke Session Cookies Server-Side or Verify Request Origin
| Field | Value |
|---|---|
| **ID** | `C-006` |
| **Severity** | **Medium** |
| **Category** | `security` |
| **Location** | `src/app/api/auth/session/route.ts:L24-L27` |
| **Effort** | `S` (<1h) |
| **Confidence** | `High` |

**Evidence:**
```ts
// src/app/api/auth/session/route.ts:L24-L27
export async function DELETE() {
  (await cookies()).delete('__session');
  return NextResponse.json({ status: 'success' });
}
```
**Impact:**
When a user signs out, `DELETE /api/auth/session` deletes the browser cookie but never calls `adminAuth.revokeRefreshTokens(caller.uid)`. Even though `authenticateRequest` in `src/lib/auth-verify.ts:L16` passes `checkRevoked = true` (`verifySessionCookie(token, true)`), any stolen or backed-up `__session` cookie remains valid for its full 5-day lifetime (`expiresIn = 5 * 24 * 60 * 60 * 1000`). Additionally, `DELETE` lacks the `origin` check present on `POST` (`L7-L8`), allowing cross-site logout CSRF.
**Recommendation:**
In `DELETE /api/auth/session`, validate the `Origin` header, authenticate the existing `__session` cookie via `authenticateRequest(req)`, call `await adminAuth.revokeRefreshTokens(caller.uid)` if valid, and then delete the `__session` cookie.

---

### `C-007` — Missing HTTP Security Headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy)
| Field | Value |
|---|---|
| **ID** | `C-007` |
| **Severity** | **Medium** |
| **Category** | `security` |
| **Location** | `next.config.mjs:L1-L10` |
| **Effort** | `S` (<1h) |
| **Confidence** | `High` |

**Evidence:**
`next.config.mjs:L1-L10` and `firebase.json:L9-L28` configure only `Cache-Control` headers. No security response headers are emitted on pages or API routes.
**Impact:**
Without `X-Frame-Options: DENY` / CSP `frame-ancestors 'none'`, authenticated student and teacher pages can be framed for clickjacking; without `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a baseline `Content-Security-Policy`, defense-in-depth against XSS and MIME sniffing is absent.
**Recommendation:**
Add an `async headers()` configuration in `next.config.mjs` (and mirror in `firebase.json`) setting `Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, and `Content-Security-Policy` (`frame-ancestors 'none'; object-src 'none'; base-uri 'self'`).

---

### `C-008` — Incomplete PII Masking Before Gemini Calls (6 of 10 Routes Unscrubbed) and Student Emails Logged in Plaintext
| Field | Value |
|---|---|
| **ID** | `C-008` |
| **Severity** | **Medium** |
| **Category** | `security` |
| **Location** | `src/lib/ai/config.ts:L14-L72` |
| **Effort** | `M` (<1 day) |
| **Confidence** | `High` |

**Evidence:**
1. `scrubPII()` (`src/lib/ai/utils.ts:L9`) is never called in:
   - `src/app/api/chat/route.ts:L61` (`getNavigationResponse`)
   - `src/app/api/chat/limits/route.ts:L77` (`getNetworkLimitsHelp`)
   - `src/app/api/chat/landing/route.ts:L105` (`callGeminiDirect`)
   - `src/app/api/ai/parse/route.ts:L38` (`parseQuestionsFromText`)
   - `src/app/api/ai/generate/route.ts:L45` (`generateAssignmentQuestions`)
   - `src/app/api/ai/synthesize-rubric/route.ts:L37` (`synthesizeRubric`)
2. Plaintext student emails are logged to Cloud Logging / stdout in:
   - `functions/src/index.ts:L108`: `console.error(\`Failed to email student \${student.email}\`, err);`
   - `functions/src/lib/email.ts:L34,L37`: `console.log(\`Email sent successfully to \${to}\`, data);`
   - `src/app/api/support/report/route.ts:L57`: `console.log('[Support API] Admin DB not available, logged report:', reportData);`
**Impact:**
Student or teacher PII (emails, phone numbers, SSNs, student IDs, names) entered into the navigation chatbot, pasted into the AI assignment parser, or logged during email dispatch is sent unscrubbed to Google's Gemini API or written to application logs, contradicting the README's FERPA/COPPA PII-masking guarantee.
**Recommendation:**
1. Enforce `scrubPII()` centrally inside `callGeminiDirect()` in `src/lib/ai/config.ts:L19-L30` so **every** outbound Gemini prompt is automatically scrubbed of emails, phone numbers, IDs, dates of birth, and addresses, in addition to caller-supplied roster names.
2. Redact or hash email addresses in `functions/src/index.ts:L108`, `functions/src/lib/email.ts:L34,L37`, and `src/app/api/support/report/route.ts:L57`.

---

### `C-009` — Verbose Upstream Error Payloads, Stack Traces, and Uncached GitHub Token Calls in API Routes
| Field | Value |
|---|---|
| **ID** | `C-009` |
| **Severity** | **Medium** |
| **Category** | `security` |
| **Location** | `src/app/api/checkout/route.ts:L82-L89` |
| **Effort** | `S` (<1h) |
| **Confidence** | `High` |

**Evidence:**
```ts
// src/app/api/checkout/route.ts:L84-L88
return NextResponse.json({ 
  error: "Polar Checkout Error", 
  message: polarError.message || "Unknown error",
  details: polarError.body || "No additional details"
}, { status: 500 });
```
Also:
- `src/app/api/github/stats/route.ts:L3-L4,L29`: Sets `export const dynamic = 'force-dynamic'` alongside `export const revalidate = 3600`, which forces Next.js to bypass caching and make 2 authenticated GitHub API calls using `process.env.GITHUB_TOKEN` on **every** request, and returns raw upstream `details: text` (`L29`) on error.
- `src/app/api/auth/teacher-code/route.ts:L132`: Returns `stack: process.env.NODE_ENV !== 'production' ? err?.stack : undefined` and raw `err?.message`.
- `src/app/api/admin/firestore/route.ts:L101`, `src/app/api/ai/generate/route.ts:L65`, `src/app/api/ai/parse/route.ts:L56`, `src/app/api/ai/synthesize-rubric/route.ts:L50`, `src/app/api/grade/route.ts:L193`: Return raw `error.message` in 500 responses.
**Impact:**
Leaks internal SDK/Firestore/Polar/GitHub error details to clients and allows any unauthenticated visitor to exhaust the server's `GITHUB_TOKEN` rate limit (5,000 req/hr) by polling `GET /api/github/stats`.
**Recommendation:**
1. Return generic client-safe 500 messages (`"Internal server error"`) across all API routes while logging full error objects server-side.
2. Remove `export const dynamic = 'force-dynamic'` from `src/app/api/github/stats/route.ts:L3` so `revalidate = 3600` caches the GitHub stats response for 1 hour.

---

### `C-010` — Unsanitized `Showdown` Markdown-to-HTML Conversion in Student Notebook
| Field | Value |
|---|---|
| **ID** | `C-010` |
| **Severity** | **Low** |
| **Category** | `security` |
| **Location** | `src/app/student/notebook/page.tsx:L73-L74,L129,L720-L723` |
| **Effort** | `S` (<1h) |
| **Confidence** | `High` |

**Evidence:**
```tsx
// src/app/student/notebook/page.tsx:L73,L129,L720-L723
const converter = new Showdown.Converter();
...
const getHtml = (md: string) => converter.makeHtml(md);
...
<RichTextEditor
  content={getHtml(content)}
  onChange={handleRichTextChange}
/>
```
**Impact:**
`Showdown.Converter().makeHtml()` does not sanitize raw HTML embedded in Markdown. While TipTap parses `content` through its ProseMirror schema, passing unsanitized HTML into a rich-text editor (especially when combined with `D-003` notebook migration from `notebooks/{uid}` and `C-005` `prosemirror-view` / `@tiptap/core` advisories) creates unnecessary XSS surface.
**Recommendation:**
Sanitize the output of `converter.makeHtml(md)` with `DOMPurify.sanitize()` before passing it to `RichTextEditor`, or replace `showdown` + `turndown` with `@tiptap/markdown`.

---

### `C-011` — Personal Resume PDF and Internal Uncompressed Assets Exposed in `public/`
| Field | Value |
|---|---|
| **ID** | `C-011` |
| **Severity** | **Low** |
| **Category** | `security` |
| **Location** | `public/Rushil_Mahadevu_Resume_2026.pdf:L1` |
| **Effort** | `S` (<1h) |
| **Confidence** | `High` |

**Evidence:**
`ls -la public/` reveals:
- `public/Rushil_Mahadevu_Resume_2026.pdf` (565,269 bytes)
- `public/headshot-sage.jpg` (3,100,804 bytes)
- `public/plan.jpg` (1,450,639 bytes)
- `public/mission-control(outdated).png` (455,640 bytes)
**Impact:**
Exposes personal resume PII and internal planning/outdated artifacts publicly at `https://scorpioedu.org/Rushil_Mahadevu_Resume_2026.pdf`, `https://scorpioedu.org/plan.jpg`, etc.
**Recommendation:**
Remove `public/Rushil_Mahadevu_Resume_2026.pdf`, `public/plan.jpg`, and `public/mission-control(outdated).png` (unless intentionally linked from an about page, in which case strip metadata/EXIF and compress `headshot-sage.jpg`).

---

## Workstream C Score & Justification

**Score: 3 / 5** *(Acceptable with notable security debt)*

**Justification:**
- **Strengths:** The core multi-tenant authentication and grading workflows show thoughtful security engineering: Firebase ID tokens and session cookies are verified with `checkRevoked: true` (`src/lib/auth-verify.ts:L10,L16`), answer keys are cleanly separated into `assignment_keys` with prototype-pollution guards (`src/lib/assignment-security.ts:L16-L26`), student submissions validate attachment URLs and prevent grade tampering (`src/app/api/submissions/route.ts:L25-L44`), Polar webhooks verify signatures and enforce transactional idempotency (`src/app/api/webhooks/polar/route.ts:L9-L37`), and AI grading acquires distributed Firestore locks (`src/lib/auth-verify.ts:L81-L96`).
- **Why not 4 or 5:** A production Firebase Admin private key remains in git history (`C-001`, Critical); 25 of 29 API routes (including `/api/student/tutor`, `/api/ai/parse`, and public code-validation endpoints) lack rate limiting while `/api/chat/landing` trusts spoofable `X-Forwarded-For` headers (`C-002`, High); admin endpoints rely on a non-constant-time static `x-admin-secret` header without user identity or audit logging (`C-003`, High); `POST /api/assignments` spreads unvalidated request JSON (`C-004`, High); `next@16.2.1` has Critical Middleware/Proxy bypass advisories (`C-005`, High); 6 of 10 AI routes bypass `scrubPII()` (`C-008`, Medium); and HTTP security headers are completely absent (`C-007`, Medium).
