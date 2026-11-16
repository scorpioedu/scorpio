# Workstream G: API Routes & Backend Correctness Audit (`G-api-routes.md`)

**Date:** 2026-11-11  
**Repo:** `/Users/pradeepmahdevu/source/learn/scorpio`  
**Scope:** All 29 route handlers in `src/app/api/**/route.ts` and shared backend helpers (`src/lib/auth-verify.ts`, `src/lib/assignment-security.ts`, `src/lib/assignment-validation.ts`, `src/lib/class-enrollment.ts`, `src/lib/rate-limit.ts`, `src/lib/usage-limit.ts`).

---

## Task Checklist

- [x] **G1** For each route, check that HTTP methods are exported correctly, status codes are accurate (`400`/`401`/`403`/`404`/`409`/`429`/`500`), and error responses do not leak stack traces or internal messages.
- [x] **G2** Input validation: list routes that parse `req.json()` without a `zod` schema and identify missing server-side validations.
- [x] **G3** Consistency: evaluate whether a shared response/error helper exists vs. hand-rolled `NextResponse.json`, and measure auth/org-resolution boilerplate duplication.
- [x] **G4** Transactions: audit Firestore writes that must be atomic (`runTransaction` and batch writes) and identify race conditions.
- [x] **G5** Runtime config: check `export const runtime`, `maxDuration`, `dynamic`, `revalidate`, and upstream timeouts on API routes.
- [x] **G6** Logging and observability: check for structured logging, request IDs, and error tracking vs. `console.*`.

---

## G1 & G2. Complete 29-Route Audit Matrix (HTTP Methods, Status Codes, Validation, Error Leakage)

> **Key finding for G2:** Out of 29 API routes, **26 call `await req.json()`** (plus `withAuthorizedRequest` in `src/lib/auth-verify.ts:L41` calls `JSON.parse` on all 17 wrapped routes), and **0 of 29 routes use `zod`**.

| # | Route (`src/app/api/.../route.ts`) | Exported Method(s) | Auth Wrapper / Check | Parses `req.json()`? | `zod` Schema? | Status Codes Returned | Correctness / Validation / Error Leakage Issues |
|---:|---|---|---|---|---|---|---|
| 1 | `account/route.ts` | `GET`, `DELETE` | `authenticateRequest` (`L17`, `L23`) | No | No | `200`, `401`, `403`, `409`, `500` | `DELETE` (`L47-L48`) calls `adminAuth.deleteUser(caller.uid)` **before** deleting `users/{caller.uid}`; if the Firestore delete fails, the Auth user is gone and the user cannot sign in again to retry cleanup. |
| 2 | `admin/firestore/route.ts` | `POST` | `x-admin-secret === process.env.ADMIN_SECRET` (`L30-L33`) | Yes (`L35`) | ❌ No | `200`, `400`, `401`, `500` | If `process.env.ADMIN_SECRET` is unset, `adminSecret` check fails safely (`!adminSecret`), but uses non-constant-time `===`. `limit` (`L36,L70`) is not validated as a positive integer (`NaN` or negative values cause Firestore `.limit()` to throw `500` leaking `err.message` at `L101`). |
| 3 | `ai/generate-title/route.ts` | `POST` | `withAuthorizedRequest` (`L3`) | Via wrapper (`auth-verify.ts:L41`) | ❌ No | `200` (`400`/`401`/`403`/`413` via wrapper) | Static stub returning `{ title: "Physics conversation" }`. Fails with `400` if called with an empty POST body because `withAuthorizedRequest` unconditionally runs `JSON.parse(raw)`. |
| 4 | `ai/generate/route.ts` | `POST` | `withAuthorizedRequest(..., { identityField: "userId", teacher: true })` (`L71`) | Yes (`L10`) | ❌ No | `200`, `400`, `403`, `404`, `429`, `500`, `503` | No validation on `count` (can be negative, `NaN`, or `1000`), `difficulty`, `questionType`, or `context`. Leaks `error.message` on `500` (`L65`). Re-fetches `users/{userId}` (`L27`) already fetched by `withAuthorizedRequest`. |
| 5 | `ai/parse/route.ts` | `POST` | `withAuthorizedRequest(..., { identityField: "userId", teacher: true })` (`L62`) | Yes (`L9`) | ❌ No | `200`, `400`, `403`, `404`, `500`, `503` | No rate limit (`checkRateLimit` missing) and no bound on `text` length or question chunk count (a 400 KB payload with 200 numbered lines triggers 40 sequential Gemini calls). Leaks `error.message` on `500` (`L56`). |
| 6 | `ai/synthesize-rubric/route.ts` | `POST` | `withAuthorizedRequest(..., { identityField: "userId", teacher: true })` (`L54`) | Yes (`L9`) | ❌ No | `200`, `400`, `403`, `404`, `500`, `503` | No rate limit. `synthesizeRubric` (`src/lib/ai/grading.ts:L161-L164`) catches all errors and returns `{ text: "Failed to synthesize rubric..." }`, so route returns HTTP `200` on failure (`L47`), overwriting the teacher's answer key in UI (`F-003`). |
| 7 | `assignments/route.ts` | `POST`, `GET` | `POST`: `withAuthorizedRequest(..., { teacher: true })` + redundant `authenticateRequest` (`L7`); `GET`: `authenticateRequest` (`L27`) | `POST`: Yes (`L8`); `GET`: No | ❌ No | `200`, `400`, `401`, `403` | **1) Mass assignment (`L18`):** `batch.set(ref, { ...data, ... })` spreads unvalidated `data` from `req.json()` directly into Firestore `assignments/{id}`.<br>**2) Missing server-side question validation (`L10,L15`):** Does not call `validateAssignmentQuestions(data.questions)` from `src/lib/assignment-validation.ts`, so empty question text, MCQ `<2` options, or missing `correctAnswer` (which the client UI blocks) are accepted by the API.<br>**3) Unhandled exception (`L20`):** Invalid `data.dueDate` creates `new Date("invalid")` (`Invalid Date`), causing Firestore `batch.commit()` to throw an uncaught error (no `try/catch` in `POST` or `GET`). |
| 8 | `auth/register/route.ts` | `POST` | `authenticateRequest` (`L7`) | Yes (`L10`) | ❌ No | `200`, `400`, `401` | Collapses all transaction errors (`"Profile already exists; sign in instead"` -> should be `409`; `"Network teacher capacity reached"` -> `409`; unexpected DB errors -> `500`) into `400 Bad Request` (`L47-L49`). |
| 9 | `auth/request-access/route.ts` | `POST` | `list`/`approve`/`reject`: `requireAdmin` (`L10-L13`); default fallthrough: public | Yes (`L17`) | ❌ No | `200`, `400`, `401`, `404`, `409`, `500` | **1) Fallthrough bug (`L111-L112`):** Any unknown or misspelled `action` (e.g., `action: "delete"`) falls through into the public `SUBMIT` handler instead of returning `400 Unknown action`.<br>**2) No rate limit or field length bounds** on public `SUBMIT` (`name`, `institution`, `message` can be megabytes).<br>**3) Non-transactional `approve` (`L58-L88`) and `submit` (`L123-L148`)** (see G4). |
| 10 | `auth/session/route.ts` | `POST`, `DELETE` | `POST`: `adminAuth.verifyIdToken(idToken, true)` (`L10`); `DELETE`: none | `POST`: Yes (`L9`); `DELETE`: No | ❌ No | `200`, `401`, `403` | Catch-all block (`L20-L22`) returns `401 { error: 'Invalid session credentials' }` even when `req.json()` fails (`400`) or Firestore is unreachable (`500`). |
| 11 | `auth/teacher-code/route.ts` | `POST` | `generate`/`list`/`revoke`: `x-admin-secret` (`L22,L48,L77`); `validate`: public (`L93`) | Yes (`L17`) | ❌ No | `200`, `400`, `401`, `404`, `410`, `500` | **1) Public `validate` action (`L93-L122`) has no rate limit**, allowing unauthenticated brute-force enumeration of `SCORP-XXXX-XXXX` invite codes and returning `organizationId` (`L120`).<br>**2) Stack trace leak outside `production` (`L132`):** Returns `stack: process.env.NODE_ENV !== 'production' ? err?.stack : undefined` (unlike other routes that check `=== 'development'`). |
| 12 | `chat/landing/route.ts` | `POST` | Public (rate-limited via `checkRateLimit` + `visitorId`) | Yes (`L63`) | ❌ No | `200`, `400`, `429`, `500` | Trusts client-generated `visitorId` (`L65`), performs non-transactional read-then-write on `landing_visitors` (`L76-L98`), fails open on DB error (`L79-L81`), and leaks raw `error.message` on `500` (`L116`). |
| 13 | `chat/limits/route.ts` | `POST` | `withAuthorizedRequest(..., { identityField: "userId", teacher: true })` (`L91`) | Yes (`L10`) | ❌ No | `200`, `400`, `403`, `404`, `500`, `503` | No rate limit; no validation on `message` length or `chatHistory` array structure (`chatHistory.map` in `network.ts:L64` throws `TypeError` if `chatHistory` is not an array). Student count query (`L55`) silently truncates to the first 10 teachers (`teacherIds.slice(0, 10)`). Leaks `error.message` on `500` (`L87`). |
| 14 | `chat/route.ts` | `POST` | `withAuthorizedRequest(..., { identityField: "userId", teacher: false })` (`L89`) | Yes (`L11`) | ❌ No | `200`, `400`, `403`, `404`, `429`, `500` | **Role spoofing (`L11,L58,L75`):** Trusts `userRole` from `req.json()` instead of `userData.role` from Firestore (`L26`), allowing a student to pass `userRole: "teacher"` and receive teacher features/prompts. No length check on `message`. Returns `500` instead of `503` when `!adminDb` (`L18`). |
| 15 | `checkout/route.ts` | `POST` | `withAuthorizedRequest(..., { identityField: "userId", teacher: true })` (`L99`) | Yes (`L8`) | ❌ No | `200`, `400`, `403`, `404`, `500` | **Upstream error leakage (`L46-L49`, `L84-L88`):** Returns raw `polarError.message` and `polarError.body` to the client in production (`L86-L87`), and leaks internal env config details (`"Plan ID '...' is not mapped to a Polar Price ID in the environment variables"`, `L48`). |
| 16 | `courses/route.ts` | `POST` | `withAuthorizedRequest(..., { teacher: true })` + redundant `authenticateRequest` (`L5`) | Yes (`L6`) | ❌ No | `200`, `400` | Returns `400` instead of `409 Conflict` when `'Class code already exists'` (`L17,L22`), and returns `400` on unexpected Firestore transaction failures. |
| 17 | `github/stats/route.ts` | `GET` | Public | No | No | `200`, `500`, `502` | **1) Upstream error leakage (`L29`):** Returns `{ error: "GitHub API error", details: text }` (raw GitHub API response body) to unauthenticated callers.<br>**2) Contradictory caching config (`L3-L4`):** Exports both `dynamic = 'force-dynamic'` and `revalidate = 3600` (see G5), and has no timeout on `fetch` (`L22-L23`). |
| 18 | `grade/route.ts` | `POST` | `withAuthorizedRequest(..., { teacher: true, resource: "submission" })` (`L197`) | Yes (`L15`) | ❌ No | `200`, `400`, `403`, `404`, `500`, `502` | Cyclomatic complexity **61** (`raw/complexity-summary.txt:L6`). Duplicates `functions/src/grading.ts` (`raw/fallow-dupes.txt:L63-L65`). No rate limit. Sequential per-question AI calls with no `maxDuration` export (`G5`). Leaks `error.message` on `500` (`L193`). |
| 19 | `notebook/chat/route.ts` | `POST` | `withAuthorizedRequest(..., { identityField: "studentId", teacher: false })` (`L91`) | Yes (`L15`) | ❌ No | `200`, `400`, `403`, `404`, `429`, `500` | **Crash on empty/non-array `messages` (`L17,L60`):** Only checks `if (!messages || !studentId)`; if `messages` is `[]`, `notebook.ts:L39` (`messages[messages.length - 1].content`) throws `TypeError: Cannot read properties of undefined`. Non-transactional `notebookUsageCurrent` check/increment (`L50-L76`). Leaks `error.message` on `500` (`L86`). |
| 20 | `research/respond/route.ts` | `POST` | `x-admin-secret === process.env.ADMIN_SECRET` (`L6`) | Yes (`L7`) | ❌ No | `200`, `400`, `401`, `503` | No rate limit; if `req.json()` fails on malformed JSON, `await req.json()` is outside the `try/catch` (`L7`), causing an unhandled exception (`500`). |
| 21 | `student/enrollment/route.ts` | `POST` | `withAuthorizedRequest` + redundant `authenticateRequest` (`L7`) | Yes (`L8`) | ❌ No | `200`, `400`, `403`, `409` | No `try/catch` around `adminDb.runTransaction` (`L12-L31`); if `code` is missing/non-string when `action !== "leave"`, or if Firestore throws, unhandled error escapes to `withAuthorizedRequest` which returns misleading `400 { error: "Unable to authorize request" }` (`auth-verify.ts:L99`). |
| 22 | `student/tutor/route.ts` | `POST` | `withAuthorizedRequest(..., { identityField: "userId", teacher: false })` (`L92`) + redundant `verifyCallerIdentity` (`L16`) | Yes (`L10`) | ❌ No | `200`, `401`, `403`, `404`, `500`, `503` | **1) Wrong status code & client-trusted role (`L12-L14`):** `if (!message \|\| !userId \|\| role !== "student") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });` returns `401` for missing `message` (should be `400`) and checks `role` from `req.json()` instead of `userData.role` in Firestore!<br>**2) No rate limit** and no validation on `chatHistory` or `assignmentContext`. |
| 23 | `submissions/route.ts` | `POST` | `withAuthorizedRequest` + redundant `authenticateRequest` (`L7`) | Yes (`L8`) | ❌ No | `200`, `400`, `403` | Cyclomatic complexity **36** (`raw/complexity-summary.txt:L17`). Collapses all transaction errors (`'You are not enrolled in this assignment'` -> `403`, `'Access denied'` -> `403`, `'This submission is already final'` -> `409`, `'Assignment unavailable'` -> `404`, invalid `new URL(file.url)` -> `400`) into `400 Bad Request` (`L52-L54`). |
| 24 | `support/report/route.ts` | `POST` | `withAuthorizedRequest(handlePost, { identityField: "userId" })` (`L75`) | Yes (`L7`) | ❌ No | `200`, `400`, `500` | **1) Silent data loss (`L50-L64`):** If `adminDb.collection('support_tickets').doc(ticketId).set(reportData)` throws (`L53-L55`), it logs the error and **still returns HTTP `200 { success: true, ticketId }`** to the user!<br>**2) Unvalidated base64 `screenshots` (`L44`)** and no rate limit (allows a user to write 450 KB documents into `support_tickets` repeatedly).<br>**3) Client-supplied `userEmail`/`userName`/`userRole` (`L14-L17`)** are trusted from `req.json()` instead of the authenticated user profile. |
| 25 | `teacher/network/invites/route.ts` | `POST` | `withAuthorizedRequest(..., { teacher: true })` + redundant `authenticateRequest` (`L7`) | Via wrapper (`auth-verify.ts:L41`) | No | `201`, `403` | **Empty-body crash in `withAuthorizedRequest` (`auth-verify.ts:L39-L41`):** This route never reads `req.json()`, so a normal `POST /api/teacher/network/invites` with an empty body fails with `400 { error: "Unable to authorize request" }` when `withAuthorizedRequest` runs `JSON.parse("")`! Callers are forced to send `{}` as a dummy JSON body (`tests/security/workflows.test.ts:L89`). |
| 26 | `teacher/network/membership/route.ts` | `POST` | `withAuthorizedRequest(..., { teacher: true })` + redundant `authenticateRequest` (`L6`) | Yes (`L7`) | ❌ No | `200`, `400` | Cyclomatic complexity **42** (`raw/complexity-summary.txt:L10`). **1) Broken initial network state on `create` (`L17`):** Sets `subscriptionStatus: 'none', aiBudgetLimit: 0` (whereas `/api/auth/register/route.ts:L39` sets `subscriptionStatus: 'active', aiBudgetLimit: 50` for new free teacher networks!), so any teacher creating a network via `/api/teacher/network/membership` is immediately blocked from starter AI credit!<br>**2) Status code collapse (`L49-L51`):** Returns `400` for permission errors (`'Only the owner can remove members'`), capacity conflicts (`409`), and not-found (`404`). |
| 27 | `teacher/network/portfolio/route.ts` | `POST` | `withAuthorizedRequest(..., { identityField: "teacherId", teacher: true, resource: "portfolio" })` (`L116`) | Yes (`L11`) | ❌ No | `200`, `400`, `403`, `404`, `500`, `503` | Re-implements teacher and student verification (`L22-L42`) already performed by `withAuthorizedRequest` (`auth-verify.ts:L60-L71`). No rate limit. Leaks raw `error.message` (including raw unparsed AI output from `network.ts:L189`) on `500` (`L112`). |
| 28 | `teacher/students/cleanup/route.ts` | `POST` | `withAuthorizedRequest(..., { teacher: true })` + redundant `authenticateRequest` (`L6`) | Yes (`L7`) | ❌ No | `200`, `400`, `403` | **N+1 Firestore reads & Storage deletes without `try/catch` (`L13-L22`):** Loops over all submissions for `studentId` and fetches `assignments/{data.assignmentId}` sequentially inside the `for` loop (`L15`), and calls `new URL(file.url)` / Storage `.delete()` without a `try/catch`. |
| 29 | `webhooks/polar/route.ts` | `POST` | `validateEvent(body, headers, process.env.POLAR_WEBHOOK_SECRET!)` (`L9`) | Uses `req.text()` (`L7`) | No | `200`, `401`, `500` | If ` req.headers.get('webhook-id')` is absent (`L19`), hashes `body` (`createHash('sha256').update(body)`). Well-structured transaction with `billing_events/{eventId}` replay protection and `billingUpdatedAt` ordering check (`L21-L37`). |

---

## G3. Consistency & Auth Boilerplate Duplication

### 3.1 Hand-Rolled Responses & Inconsistent Error Envelopes
There is no shared API response or error helper in `src/lib/`. All 29 routes construct `NextResponse.json(...)` (or `Response.json(...)` in `github/stats/route.ts:L11,L29,L44,L47`) manually, producing **5 incompatible error payload shapes**:
1. `{ error: string }` (most routes)
2. `{ error: string, details?: string }` (`ai/generate`, `ai/parse`, `chat`, `github/stats`)
3. `{ error: string, message: string, details?: unknown }` (`checkout/route.ts:L46-L49,L84-L88,L92-L95`)
4. `{ error: string, stack?: string }` (`auth/teacher-code/route.ts:L132`)
5. `{ valid: false, reason: string }` (`auth/teacher-code/route.ts:L94,L101,L107,L115`)

### 3.2 Severe Auth & Org-Resolution Duplication Caused by `withAuthorizedRequest` Signature
In `src/lib/auth-verify.ts:L29-L101`, `withAuthorizedRequest(handler, options)`:
1. Calls `authenticateRequest(req)` (`L36`), which verifies the Firebase ID token or session cookie with `checkRevoked: true`,
2. Clones and parses the request JSON body (`L39-L41`),
3. Fetches `users/{caller.uid}` from Firestore (`L45`),
4. Resolves `effectiveOrgId`—including the fallback read of `users/{profile.teacherId}` for students (`L73-L79`).

**However, `type Handler = (req: NextRequest) => Promise<Response>` (`L29`) passes none of `{ caller, profile, effectiveOrgId, body }` to `handler`!**
As a result:
- **8 routes** (`assignments`, `courses`, `student/enrollment`, `student/tutor`, `submissions`, `teacher/network/invites`, `teacher/network/membership`, `teacher/students/cleanup`) call `authenticateRequest(req)` or `verifyCallerIdentity(req, userId)` **a second time** on the same request (doubling Firebase Auth `checkRevoked` verification latency).
- **15 routes** fetch `users/{caller.uid}` **a second time** from Firestore, and **4 routes** (`chat/route.ts:L30-L33`, `grade/route.ts:L43-L48`, `notebook/chat/route.ts:L35-L39`, `student/tutor/route.ts:L34-L37`) re-implement the exact same student→teacher `organizationId` fallback query that `withAuthorizedRequest` already executed at `src/lib/auth-verify.ts:L74-L79`!
- `jscpd` (`raw/jscpd-summary.txt:L23-L24,L29,L36`) flags **4 clone pairs (89 duplicated lines)** across `api/ai/parse`, `api/ai/synthesize-rubric`, `api/ai/generate`, `api/chat`, and `api/student/tutor` solely from this repeated boilerplate.
- Furthermore, because `withAuthorizedRequest` wraps `await execute()` inside its outer `try { ... } catch { return NextResponse.json({ error: "Unable to authorize request" }, { status: 400 }); }` (`src/lib/auth-verify.ts:L38-L100`), **any unhandled runtime exception thrown by a handler that lacks its own `try/catch`** (`assignments/route.ts`, `student/enrollment/route.ts`, `teacher/network/invites/route.ts`, `teacher/students/cleanup/route.ts`) is caught and misreported to the client as `400 { error: "Unable to authorize request" }`!

---

## G4. Firestore Transactions & Race Conditions

### 4.1 Where Transactions Are Used Correctly
- `src/app/api/auth/register/route.ts:L18-L45`: Atomically verifies user non-existence, validates and marks `teacherInviteCodes/{code}` as used, checks the 50-teacher network cap, and creates `users/{uid}`, `teachers|students/{uid}`, and `organizations/{id}`.
- `src/app/api/courses/route.ts:L13-L20`: Atomically reserves `course_codes/{code}` and creates `courses/{id}`.
- `src/app/api/student/enrollment/route.ts:L12-L31`: Atomically checks existing `courseId` and updates `users/{uid}` and `students/{uid}`.
- `src/app/api/submissions/route.ts:L16-L50`: Uses deterministic document ID `${caller.uid}_${body.assignmentId}` and runs a transaction preventing overwrite of finalized/graded submissions.
- `src/app/api/webhooks/polar/route.ts:L21-L37`: Uses `billing_events/{eventId}` and `billingUpdatedAt` timestamp comparison inside a transaction for idempotent, monotonic subscription updates.

### 4.2 Missing Transactions, Race Conditions & State Bugs
1. **Inconsistent Organization Initialization in `/api/teacher/network/membership` (`src/app/api/teacher/network/membership/route.ts:L14-L18` vs. `/api/auth/register/route.ts:L37-L41`)**:
   - In `/api/auth/register/route.ts:L37-L41`, creating a new free teacher network sets:
     `subscriptionStatus: "active", planId: "free", aiUsageCurrent: 0, aiBudgetLimit: 50, baseMonthlyFee: 0`
   - In `/api/teacher/network/membership/route.ts:L17`, creating a new free teacher network (`action === 'create'`) sets:
     `planId: 'free', subscriptionStatus: 'none', aiUsageCurrent: 0, aiBudgetLimit: 0`
   - Because `checkBudget` (`src/lib/usage-limit.ts:L25,L35`) and `reserveBudget` (`functions/src/metering.ts:L29-L31`) require `subscriptionStatus` to be `'active'` or `'trialing'` and `aiBudgetLimit > 0`, **any teacher who creates a network via `/api/teacher/network/membership` has a broken organization state (`subscriptionStatus: 'none'`, `aiBudgetLimit: 0`) that blocks all AI features**.
2. **Non-Transactional `approve` and `submit` in `/api/auth/request-access` (`src/app/api/auth/request-access/route.ts:L52-L91,L123-L148`)**:
   - `approve` (`L58-L88`) reads `accessRequests/{id}`, checks `data.status !== 'pending'`, then performs two separate non-atomic writes (`teacherInviteCodes.doc(code).set(...)` and `accessRequests.doc(id).update(...)`). Concurrent clicks or a partial failure leave orphaned invite codes or overwrite `generatedCode`.
   - `submit` (`L123-L148`) checks for an existing pending request by email via `.where('email', '==', ...).get()` and then calls `.add(...)` outside a transaction, allowing concurrent requests to create duplicate pending access requests.
3. **Non-Transactional `notebookUsageCurrent` Check and Increment (`src/app/api/notebook/chat/route.ts:L46-L55,L74-L76`)**:
   - Reads `orgData.notebookUsageCurrent` before the Gemini call (`L51`), then calls `orgRef.update({ notebookUsageCurrent: adminFieldWithValue.increment(1) })` after the Gemini call (`L74-L76`). Concurrent requests bypass `notebookLimit`.
4. **Non-Transactional `landing_visitors` Counter (`src/app/api/chat/landing/route.ts:L76-L98`)**:
   - Reads `currentCount` via `visitorRef.get()` (`L77-L78`) and writes `messageCount: currentCount + 1` via `visitorRef.set(..., { merge: true })` (`L93-L98`) after the check, rather than using `runTransaction` or `FieldValue.increment(1)`.
5. **Partial Grading Spend Without Checkpoint Persistence (`src/app/api/grade/route.ts:L107-L188` & `functions/src/grading.ts:L233-L277`)**:
   - Both grading implementations loop sequentially over all answers (`for (const ans of answers)`), calling `gradeResponse` / `gradeResponseAI` (which settles budget per question immediately), and only write `gradedAnswers` to `submissions/{submissionId}` **after the entire loop finishes**. If question 8 of 10 fails or times out, the organization has already been billed for questions 1–7, nothing is saved to Firestore (`grade/route.ts:L146-L147`), and retrying re-grades and re-bills questions 1–7 from scratch.

---

## G5. Runtime Configuration, Caching & Timeouts

Scanning `src/app/api/**/route.ts` for Next.js route segment config exports (`runtime`, `maxDuration`, `dynamic`, `revalidate`):
- **0 of 29 routes** export `maxDuration` or `runtime`.
- **Only 1 of 29 routes** (`src/app/api/github/stats/route.ts:L3-L4`) exports `dynamic` or `revalidate`:
  ```typescript
  // src/app/api/github/stats/route.ts:L3-L4
  export const dynamic = 'force-dynamic';
  export const revalidate = 3600; // Cache for 1 hour
  ```
  - **Bug 1 (Contradictory segment config in `github/stats/route.ts:L3-L4`):** Setting `export const dynamic = 'force-dynamic'` forces Next.js to execute the route dynamically on **every single request**, completely overriding `export const revalidate = 3600`. Because `fetch('https://api.github.com/...')` at `L22-L23` also lacks `{ next: { revalidate: 3600 } }` and lacks `AbortSignal.timeout(...)`, every page load that fetches `/api/github/stats` makes two live un-cached requests to GitHub's API with no timeout and no rate limit!
  - **Bug 2 (Missing `maxDuration` on Multi-Call & Long-Running AI Routes):** `src/lib/ai/config.ts:L66` sets a **60-second** per-call timeout (`AbortSignal.timeout(60000)`), and:
    - `/api/grade/route.ts:L107-L169` executes `N` sequential Gemini calls (one per open-ended question in a submission).
    - `/api/ai/parse/route.ts:L38` (`parseQuestionsFromText` at `src/lib/ai/assignment.ts:L237-L252`) executes `ceil(Q / 5)` sequential Gemini calls with 500ms sleeps.
    - `/api/ai/generate/route.ts` and `/api/teacher/network/portfolio/route.ts` request up to `maxOutputTokens: 8192`.
    Without `export const maxDuration = 60` (or `120`/`300`) and parallelized (`Promise.all` with concurrency limits) batching in `/api/grade` and `/api/ai/parse`, serverless deployments with default 15s–60s function timeouts will terminate these routes mid-execution.

---

## G6. Logging & Observability

- **No Structured Logger or Request Correlation:** None of the 29 API routes or `src/lib/*` modules use a structured logger (`pino`, `winston`, or `firebase-functions/logger`) or attach a request correlation ID (`x-request-id` / `crypto.randomUUID()`). All logging uses raw `console.log`, `console.warn`, and `console.error`.
- **No Error Tracking / APM Integration:** Neither Sentry (`@sentry/nextjs`) nor OpenTelemetry is installed or configured; production 500 errors are only visible by tailing container stdout/stderr logs.
- **PII in Server Logs (`src/app/api/support/report/route.ts:L57` & `src/app/api/chat/route.ts:L39`):**
  - `src/app/api/support/report/route.ts:L57`: `console.log('[Support API] Admin DB not available, logged report:', reportData)` dumps the full support ticket including `userEmail`, `userName`, `userId`, and up to 3 base64-encoded `screenshots` to stdout.
  - `src/app/api/chat/route.ts:L39`: `console.log(\`[NavAI] Message from ${userId} (${userRole}), Org: ${organizationId}\`)` logs every chat invocation to stdout.

---

## Detailed Findings (`G-001` – `G-009`)

### `G-001` — High | Security & Correctness: `/api/assignments` spreads unvalidated request body into Firestore and skips server-side `validateAssignmentQuestions`
- **Category:** `security`
- **Location:** `src/app/api/assignments/route.ts:L6-L24`
- **Evidence:**
  ```typescript
  // src/app/api/assignments/route.ts:L8-L20
  const data = await req.json();
  const profile = (await adminDb.collection('users').doc(caller.uid).get()).data()!;
  if (!Array.isArray(data.questions) || data.questions.length > 100 || !data.title) return NextResponse.json({ error: 'Invalid assignment' }, { status: 400 });
  ...
  const { publicQuestions, answers } = splitAssignmentQuestions(data.questions);
  const ref = adminDb.collection('assignments').doc();
  const batch = adminDb.batch();
  batch.set(ref, { ...data, teacherId: caller.uid, organizationId: profile.organizationId || null,
    questions: publicQuestions, rubric: null, answerKeySeparated: true,
    dueDate: data.dueDate ? new Date(data.dueDate) : null, createdAt: new Date() });
  ```
- **Impact:**
  1. `batch.set(ref, { ...data, ... })` allows mass assignment of arbitrary fields from `req.json()` into `assignments/{id}`.
  2. Server-side validation does not call `validateAssignmentQuestions(data.questions)` (`src/lib/assignment-validation.ts`), which the client relies on to enforce non-empty question text, `>= 2` options for multiple-choice questions, and required `correctAnswer` values.
  3. Passing an invalid `dueDate` string produces `Invalid Date`, causing `batch.commit()` to throw an uncaught exception that `withAuthorizedRequest` turns into `400 { error: "Unable to authorize request" }`.
- **Recommendation:** Validate the request payload with a strict `zod` schema (whitelisting allowed fields `title`, `description`, `courseId`, `visibility`, `gradingType`, `dueDate`, `rubric`, `questions`, `timeLimit`, `maxAttempts`), call `validateAssignmentQuestions(data.questions)` before splitting the answer key, and validate `dueDate` with `!Number.isNaN(Date.parse(data.dueDate))`.
- **Effort:** `S`
- **Confidence:** `High`

### `G-002` — High | Security: Role spoofing via client-supplied `role` / `userRole` in `/api/chat` and `/api/student/tutor`
- **Category:** `security`
- **Location:** `src/app/api/chat/route.ts:L11-L15` (and `src/app/api/chat/route.ts:L58-L78`, `src/app/api/student/tutor/route.ts:L10-L14`)
- **Evidence:**
  ```typescript
  // src/app/api/chat/route.ts:L11,L58
  const { message, userRole, userId } = await req.json();
  ...
  const features = userRole === 'teacher' ? chatbotConfig.teacherFeatures : chatbotConfig.studentFeatures;
  // src/app/api/student/tutor/route.ts:L10-L14
  const { message, userId, role, mode, chatHistory, assignmentContext } = await req.json();
  if (!message || !userId || role !== "student") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  ```
- **Impact:** Both routes already fetch `userData` from `users/{userId}` in Firestore (`chat/route.ts:L22-L26`, `student/tutor/route.ts:L26-L30`), yet trust `userRole` / `role` from the untrusted JSON request body instead of `userData.role`. A student can pass `userRole: "teacher"` to `/api/chat` to receive teacher navigation prompts/features, and a teacher can pass `role: "student"` to `/api/student/tutor` (which also returns `401` instead of `400` when `message` is empty).
- **Recommendation:** Derive the caller's role exclusively from the server-verified `profile.role` in Firestore (`userData.role`), never from `req.json()`, and return `400` for missing `message` and `403` for role mismatches.
- **Effort:** `S`
- **Confidence:** `High`

### `G-003` — High | Correctness: `/api/teacher/network/membership` creates new free networks with `subscriptionStatus: 'none'` and `aiBudgetLimit: 0`, blocking starter AI access
- **Category:** `correctness`
- **Location:** `src/app/api/teacher/network/membership/route.ts:L14-L18`
- **Evidence:**
  ```typescript
  // src/app/api/teacher/network/membership/route.ts:L14-L18
  if (action === 'create') {
    if (profile.organizationId || typeof name !== 'string' || !name.trim()) throw new Error('Leave your current network first');
    const fresh = adminDb.collection('organizations').doc();
    tx.set(fresh, { id: fresh.id, name: name.trim().slice(0, 120), ownerId: caller.uid, ownerEmail: caller.email || '', planId: 'free', subscriptionStatus: 'none', aiUsageCurrent: 0, aiBudgetLimit: 0, createdAt: new Date() });
    tx.update(ref, { organizationId: fresh.id });
  ```
- **Impact:** Unlike `/api/auth/register/route.ts:L37-L41` (which initializes free teacher networks with `subscriptionStatus: "active", planId: "free", aiBudgetLimit: 50`), creating a network via `/api/teacher/network/membership` sets `subscriptionStatus: 'none'` and `aiBudgetLimit: 0`. Both `checkBudget` (`src/lib/usage-limit.ts:L25`) and `reserveBudget` (`functions/src/metering.ts:L29`) immediately reject all AI requests for that network with `"Your subscription is no longer active"` / `"AI subscription is not active"`.
- **Recommendation:** Extract a shared `buildInitialOrganizationDoc(...)` helper used by both `/api/auth/register` and `/api/teacher/network/membership` so free networks consistently initialize with consistent starter status and budget fields (while preventing free-credit reset abuse if a teacher repeatedly deletes and recreates networks).
- **Effort:** `S`
- **Confidence:** `High`

### `G-004` — High | Correctness: `withAuthorizedRequest` crashes on empty-body POST requests, masks unhandled route errors as `400`, and causes double Auth/Firestore lookups across 17 routes
- **Category:** `correctness`
- **Location:** `src/lib/auth-verify.ts:L29-L101`
- **Evidence:**
  ```typescript
  // src/lib/auth-verify.ts:L38-L45,L97-L100
    try {
      const raw = await req.clone().text();
      if (Buffer.byteLength(raw) > 500000) return NextResponse.json({ error: "Request too large" }, { status: 413 });
      const body = JSON.parse(raw);
      ...
      const profile = (await adminDb.collection("users").doc(caller.uid).get()).data();
      ...
      return await execute();
    } catch {
      return NextResponse.json({ error: "Unable to authorize request" }, { status: 400 });
    }
  ```
- **Impact:**
  1. Calling `JSON.parse(raw)` when `raw` is empty (`""`) throws `SyntaxError`, breaking bodyless `POST` requests to wrapped routes like `/api/teacher/network/invites` unless the caller sends a dummy `{}` body.
  2. Wrapping `return await execute()` inside the `try/catch` that returns `400 { error: "Unable to authorize request" }` masks any unhandled 500 error thrown inside routes without their own `try/catch` (`assignments`, `student/enrollment`, `teacher/network/invites`, `teacher/students/cleanup`) as a `400` auth error.
  3. Because `withAuthorizedRequest` does not pass `{ caller, profile, effectiveOrgId, body }` to `handler`, 8 wrapped routes call `authenticateRequest` a second time and 15 wrapped routes fetch `users/{uid}` a second time on every request.
- **Recommendation:** Parse `raw.trim() ? JSON.parse(raw) : {}` only inside the auth pre-check `try/catch`, move `return await execute()` outside that `try/catch` (or into a separate `500` error boundary), and pass `{ caller, profile, organizationId: effectiveOrgId, body }` as a second context argument to `handler(req, ctx)`.
- **Effort:** `M`
- **Confidence:** `High`

### `G-005` — Medium | Correctness: Zero `zod` input validation across 26 JSON API routes; `/api/notebook/chat` crashes on empty `messages` array and `/api/auth/request-access` falls through on unknown `action`
- **Category:** `correctness`
- **Location:** `src/app/api/notebook/chat/route.ts:L15-L19` (also `src/lib/ai/notebook.ts:L39`, `src/app/api/auth/request-access/route.ts:L18-L115`, `src/app/api/ai/generate/route.ts:L10`, `src/app/api/ai/parse/route.ts:L9`)
- **Evidence:**
  ```typescript
  // src/app/api/notebook/chat/route.ts:L15-L19
  const { messages, notebookContent, studentId } = await req.json();
  if (!messages || !studentId) {
    return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
  }
  // src/lib/ai/notebook.ts:L39
  const lastUserMessage = messages[messages.length - 1].content;
  ```
- **Impact:**
  1. None of the 26 JSON routes validate request bodies with `zod`.
  2. Passing `messages: []` to `/api/notebook/chat` passes `if (!messages)` and throws `TypeError: Cannot read properties of undefined (reading 'content')` at `src/lib/ai/notebook.ts:L39`.
  3. In `/api/auth/request-access/route.ts:L111-L149`, any unknown `action` value falls through to the public `SUBMIT` branch instead of returning `400 Unknown action`.
  4. In `/api/ai/generate` and `/api/ai/parse`, `count` and `text` have no upper bounds.
- **Recommendation:** Define and enforce `zod` request schemas on all 26 body-parsing routes, require `messages` to be a non-empty array in `/api/notebook/chat`, and require `action === 'submit'` (or `!action`) explicitly in `/api/auth/request-access`.
- **Effort:** `M`
- **Confidence:** `High`

### `G-006` — Medium | Correctness: `/api/support/report` swallows Firestore write errors and returns HTTP 200 `{ success: true }`, silently losing support tickets
- **Category:** `correctness`
- **Location:** `src/app/api/support/report/route.ts:L50-L64`
- **Evidence:**
  ```typescript
  // src/app/api/support/report/route.ts:L50-L64
    if (adminDb) {
      try {
        await adminDb.collection('support_tickets').doc(ticketId).set(reportData);
      } catch (dbError) {
        console.error('[Support API] Error writing to Firestore:', dbError);
      }
    } else {
      console.log('[Support API] Admin DB not available, logged report:', reportData);
    }

    return NextResponse.json({
      success: true,
      ticketId,
      message: 'Support ticket submitted successfully.',
    });
  ```
- **Impact:** If the Firestore write fails (or `adminDb` is unavailable), the API logs the error (or dumps PII + base64 screenshots to stdout at `L57`) and returns `200 OK` with a generated `ticketId` that does not exist in Firestore.
- **Recommendation:** Return `500` / `503` when `adminDb` is unavailable or `support_tickets.doc(ticketId).set(reportData)` fails, and derive `userEmail`, `userName`, and `userRole` from the authenticated user's profile rather than `req.json()`.
- **Effort:** `S`
- **Confidence:** `High`

### `G-007` — Medium | Security: Upstream error bodies and internal details leaked in `/api/github/stats`, `/api/checkout`, and `/api/auth/teacher-code`, plus unthrottled invite code enumeration
- **Category:** `security`
- **Location:** `src/app/api/github/stats/route.ts:L26-L30` (also `src/app/api/checkout/route.ts:L46-L49,L84-L88` and `src/app/api/auth/teacher-code/route.ts:L93-L122,L132`)
- **Evidence:**
  ```typescript
  // src/app/api/github/stats/route.ts:L29
  return Response.json({ error: "GitHub API error", details: text }, { status: 502 });
  // src/app/api/checkout/route.ts:L84-L88
  return NextResponse.json({ 
    error: "Polar Checkout Error", 
    message: polarError.message || "Unknown error",
    details: polarError.body || "No additional details"
  }, { status: 500 });
  ```
- **Impact:**
  1. `/api/github/stats` and `/api/checkout` return raw upstream API error bodies (`details: text`, `details: polarError.body`) and internal environment configuration messages to clients in production.
  2. `/api/auth/teacher-code` (`action: 'validate'`, `L93-L122`) is public, has no rate limit, and returns `organizationId` plus distinct reasons (`'Invalid code'`, `'Code already used'`, `'Code expired'`), enabling brute-force enumeration of `SCORP-XXXX-XXXX` codes (`2^32` space, or smaller if guessed).
- **Recommendation:** Strip raw upstream error bodies and stack traces from production responses, add `checkRateLimit` to `/api/auth/teacher-code` (`action: 'validate'`) and `/api/auth/request-access`, and increase invite code entropy in `teacher-code/route.ts:L6` and `request-access/route.ts:L6` from 4 bytes (`randomBytes(2)` × 2) to at least 8–16 bytes (matching `teacher/network/invites/route.ts:L8`).
- **Effort:** `S`
- **Confidence:** `High`

### `G-008` — Medium | Performance & Reliability: Contradictory caching config on `/api/github/stats` and missing `maxDuration` / concurrency on multi-call AI routes (`/api/grade`, `/api/ai/parse`)
- **Category:** `performance`
- **Location:** `src/app/api/github/stats/route.ts:L3-L4` (and `src/app/api/grade/route.ts:L107-L169`, `src/app/api/ai/parse/route.ts:L38`, `src/lib/ai/assignment.ts:L237-L252`)
- **Evidence:**
  ```typescript
  // src/app/api/github/stats/route.ts:L3-L4
  export const dynamic = 'force-dynamic';
  export const revalidate = 3600; // Cache for 1 hour
  ```
- **Impact:**
  1. In `/api/github/stats/route.ts`, `export const dynamic = 'force-dynamic'` disables caching and overrides `revalidate = 3600`, causing every GET request to make two live un-cached calls to `api.github.com` without a fetch timeout.
  2. None of the AI routes export `maxDuration`, while `/api/grade` and `/api/ai/parse` execute sequential `for` loops of Gemini calls (each with a 60s timeout) that can exceed serverless execution limits.
- **Recommendation:** Remove `export const dynamic = 'force-dynamic'` from `/api/github/stats/route.ts` and pass `{ next: { revalidate: 3600 }, signal: AbortSignal.timeout(5000) }` to `fetch()`; export `maxDuration = 60` (or `120`) on AI routes; and parallelize batch/question grading with bounded concurrency (`p-limit` or chunked `Promise.all`).
- **Effort:** `S`
- **Confidence:** `High`

### `G-009` — Low | Correctness: Non-transactional `approve` and `submit` in `/api/auth/request-access` and account deletion ordering in `DELETE /api/account`
- **Category:** `correctness`
- **Location:** `src/app/api/auth/request-access/route.ts:L52-L91` (also `L123-L148` and `src/app/api/account/route.ts:L43-L49`)
- **Evidence:**
  ```typescript
  // src/app/api/account/route.ts:L47-L48
  await adminAuth.deleteUser(caller.uid);
  await adminDb.collection('users').doc(caller.uid).delete();
  ```
- **Impact:**
  1. In `DELETE /api/account`, `adminAuth.deleteUser(caller.uid)` runs before `users/{caller.uid}.delete()`. Despite the comment on `L42` (*"Delete the profile last so failed deletion can be retried while still authenticated"*), once `adminAuth.deleteUser` succeeds, the user's Firebase Auth account is deleted and they can no longer authenticate if the final Firestore `.delete()` fails.
  2. In `/api/auth/request-access`, `approve` writes to `teacherInviteCodes` and `accessRequests` outside a transaction, and `submit` checks for duplicate pending requests outside a transaction.
- **Recommendation:** Delete `users/{caller.uid}` in the final Firestore batch *before* calling `adminAuth.deleteUser(caller.uid)`, and wrap `approve` and `submit` in `/api/auth/request-access` in `adminDb.runTransaction`.
- **Effort:** `S`
- **Confidence:** `High`

---

## Workstream G Score: **3 / 5** (Acceptable with notable debt)

**Justification:**
- **Positives:** Sensitive state transitions (`auth/register`, `courses`, `student/enrollment`, `submissions`, `teacher/network/invites`, `webhooks/polar`) use Firestore transactions with idempotency keys (`submissions` composite IDs, `course_codes`, `billing_events`), answer keys are split into `assignment_keys` (`src/lib/assignment-security.ts`), and `authenticateRequest` verifies tokens with `checkRevoked: true`.
- **Deductions:** Zero `zod` schema validation across all 26 JSON routes (`G-005`); mass assignment and missing server-side `validateAssignmentQuestions` in `/api/assignments` (`G-001`); client-trusted `role`/`userRole` in `/api/chat` and `/api/student/tutor` (`G-002`); broken `subscriptionStatus: 'none'` / `aiBudgetLimit: 0` on network creation in `/api/teacher/network/membership` (`G-003`); `withAuthorizedRequest` failing on empty bodies, masking unhandled route errors as `400`, and causing double Auth/Firestore reads across 17 routes (`G-004`); silent ticket loss on DB failure in `/api/support/report` (`G-006`); and upstream error leakage + missing `maxDuration` config (`G-007`, `G-008`).
