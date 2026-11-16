# E. Testing Quality

Scope: tasks E1–E7. Findings: `findings-E.csv` (E-001…E-017). Raw: `raw/jest.txt`, `raw/coverage/coverage-summary.json`, `raw/test-security.txt`, `raw/fallow-health.txt`, `raw/stryker-report.json`, `raw/stryker.txt`.

## Task checklist
- [x] **E1** Coverage per directory
- [x] **E2** Critical-path map
- [x] **E3** Test quality review (9 + 4 files)
- [x] **E4** Config health
- [x] **E5** Missing test types and risk
- [x] **E6** Mutation testing (Stryker on `assignment-validation.ts`, `auth-verify.ts`, `usage-limit.ts`)
- [x] **E7** Top 15 tests to add

## E1. Coverage (Jest, `raw/jest.txt`; 10 suites, 39 tests pass, 0.9 s)
Coverage is collected only for files that tests import, so the real number is much lower. Fallow static analysis: **215 untested files, 405 untested exports, 14.3% file coverage**.

| Directory | Lines | Branches | Functions | Notes |
|---|---|---|---|---|
| All instrumented files | 46.9% (250/533) | 36.98% (250/676) | 43.9% (29/66) | only 17 source files are instrumented |
| `src/lib` | 61.8% (94/152) | 51.8% (115/222) | 78.9% (15/19) | assignment-validation 100%, billing-context 100%, auth-verify 56.7%, rate-limit 66.7%, utils 20.8% |
| `src/lib/ai` | 35.5% (75/211) | 33.7% (94/279) | 30.8% (8/26) | grading 44.6%, config 63.8%, utils 10.2%; tutor/notebook/network/research/chatbot/assignment: **not loaded at all** |
| `src/app/api` | auth/session 84%, chat/landing 86% | 87.5% / 63.9% | 50% / 100% | **2 of 29 routes** have any coverage |
| `functions/src` | 17.8% (8/45) | 1.5% (1/66) | 14.3% (1/7) | only `metering.ts`; `grading.ts`, `billing.ts`, `index.ts` untested |
| Components (`src/components`, `ui`) | 31.7% / 66.7% | 16% / 0% | 12.5% / 0% | only `department-banner` pure helper and `raise-logo` |
| Pages (`src/app/**/page.tsx`), contexts, hooks | 0% | 0% | 0% | not instrumented |

## E2. Critical path → test map
| Critical path | Status | Evidence |
|---|---|---|
| Auth verify | **Covered** | `__tests__/auth-verify.test.ts` (8 tests, negative cases) |
| Session cookie / CSRF origin | Covered | `session.test.ts` |
| Assignment validation | Covered | `assignment-validation.test.ts` (100% lines, 92% branches) |
| Assignment security (answer-key separation) | Partial | `assignment-security.test.ts` (7 lines); rules + emulator workflow tests cover the key doc |
| Grading AI | **Partial** | `grading-failure.test.ts` failure modes only; happy path/clamping untested (E-006) |
| Grading manual / Cloud Function triggers | **None** (rules-level only) | `functions/src/grading.ts` untested (E-005) |
| Billing / metering / budget | **Partial, failing** | `workflows.test.ts` budget test fails (E-001); `functions/src/metering.ts` 18% |
| Usage limits (`usage-limit.ts`) | **None** | no importing test (E-007) |
| Webhooks (Polar) | Partial | `webhooks.test.ts` idempotency/order only; signature validation mocked (E-004) |
| Plan limits | **Illusory** | `waypoints-plan-limits.test.ts` tests a local copy (E-003) |
| Class enrollment | Partial | emulator workflows (join/leave/duplicate code); `class-enrollment.ts` has no unit test |
| Rate limiting | Partial | incidental via landing-chat (E-008) |
| Assignment parser | **None** | `assignment-parser.ts` untested |
| Due dates | **Illusory** | `due-date.test.ts` tests a local copy (E-002) |
| Firestore/Storage rules | Covered | `rules.test.cjs` + workflows (emulator) |

## E3. Test-quality judgement
| File | Verdict |
|---|---|
| `assignment-security` (3 tests) | Behavioural; asserts no `correctAnswer` leaks and duplicate-id rejection. Good. |
| `assignment-validation` (115 lines) | Behavioural, error text + index. Good; missing 2 branches. |
| `auth-verify` | Behavioural, strong negative/authz cases, mocks only firebase-admin. Best unit file. |
| `department-banner` | Behavioural on pure helper; mocks firebase/auth only to import the module. |
| `due-date` | **Tautological** (tests copied function). |
| `grading-failure` | Behavioural; but noisy `console.error` output not silenced; mocks the model (appropriate). |
| `landing-chat` | Behavioural for 200/429/guest; sizeable mocking but reasonable. |
| `session` | Behavioural, forged role + cross-origin 403. Good. |
| `waypoints-plan-limits` | **Tautological**. |
| `src/lib/utils.test.ts` | Misplaced (E-012); tiny. |
| `tests/security/rules.test.cjs` | Strong: 15 rules tests incl. cross-school denial, forged grading, storage. |
| `tests/security/workflows.test.ts` | Strong coverage; **1 failing**; dense one-liners. |
| `tests/security/webhooks.test.ts` | Good idempotency/out-of-order; signature mocked. |
| `tests/security/full-student-teacher-workflow.test.ts` | Broad (9 steps, 833 lines) but order-dependent (E-013). |

Flakiness: unit tests use no network and no real timers; security tests need emulators and run `--runInBand` (acceptable). Authz-denial cases are present and good. Mocking is moderate, not excessive.

## E4. Config health
- `jest@30` with `ts-jest@29` (E-011). `jest.config.js` ignores `/tests/security/`, so `npm test` never runs the emulator suites.
- `src/lib/utils.test.ts` lives in `src/` (E-012); haste-map collisions from `.next/standalone` printed in the security run.
- `functions/` has no test script or tests; only `metering.ts` is imported from root tests (E-005).
- Jest uses `testEnvironment: node` only (no jsdom).

## E5. Missing test types / risk
No RTL component tests, no E2E, no CI (E-009, E-010, L-001). Quantified: 29 API routes (2 unit-tested), 45 pages (0 tested), 215/251 files untested. The one existing failing test went unnoticed. Risk is **High** for billing/grading regressions and UI-only logic (e.g. 3000-line `student/tutor/page.tsx`, churn hotspots in fallow-health).

## E6. Mutation testing (`raw/stryker-report.json`, `raw/stryker.txt`)
Stryker (`@stryker-mutator/core` + `@stryker-mutator/jest-runner` + `@stryker-mutator/typescript-checker`, `coverageAnalysis: "perTest"`, `jest.config.js` with `ts-jest`) was executed in a scratch copy (`/tmp/scorpio-scratch`) scoped to `src/lib/assignment-validation.ts`, `src/lib/auth-verify.ts`, and `src/lib/usage-limit.ts` (completed in 2m 09s).

### Mutation score per file
| File | % Total Score | % Covered Score | Killed | Survived | No Coverage | Compile Errors (excluded) |
|---|---:|---:|---:|---:|---:|---:|
| **All files** | **23.77%** | **74.04%** | **77** | **27** | **220** | **124** |
| `src/lib/assignment-validation.ts` | **88.00%** | **93.62%** | 44 | 3 | 3 | 19 |
| `src/lib/auth-verify.ts` | **21.85%** | **57.89%** | 33 | 24 | 94 | 68 |
| `src/lib/usage-limit.ts` | **0.00%** | **0.00%** | 0 | 0 | 123 | 37 |

### Surviving & uncovered mutants and tests that would kill them

1. **`src/lib/assignment-validation.ts` (88.00% total / 93.62% covered — E-017)**
   - **`L21:51–61` (`Survived`, `MethodExpression`)**: `opt.trim()` → `opt` in `q.options?.some(opt => opt.trim() && opt === q.correctAnswer)`.
     - *Why it survived*: No test supplies a whitespace-only option that matches `correctAnswer`.
     - *Test to kill*: Multiple-choice question with `options: ["   ", "9.8 m/s^2"]` and `correctAnswer: "   "` → assert `valid: false` and `questionIndex: 0`.
   - **`L31:11–90` (`Survived`, `LogicalOperator`) & `L31:32–89` (`Survived`, `ConditionalExpression`)**: `!q.correctAnswer || (q.correctAnswer !== "True" && q.correctAnswer !== "False")` → `!q.correctAnswer && ...` or `!q.correctAnswer || false`.
     - *Why they survived*: The only negative True/False test (`__tests__/assignment-validation.test.ts:L71-L85`) passes `correctAnswer: ""`, so `!q.correctAnswer` is already `true` and the right-hand check is never needed to reject an invalid non-empty string.
     - *Test to kill*: True/False question with `correctAnswer: "Maybe"` → assert `valid: false` and error containing `"Question 1 (True/False)"`.
   - **`L31:62–89` (3 `NoCoverage` mutants on `q.correctAnswer !== "False"`)**: Replaced with `true`, `q.correctAnswer === "False"`, and `""`.
     - *Why uncovered*: The only valid True/False test (`__tests__/assignment-validation.test.ts:L14-L19`) uses `correctAnswer: "True"`, which short-circuits `q.correctAnswer !== "True"` before evaluating `!== "False"`.
     - *Test to kill*: True/False question with `correctAnswer: "False"` → assert `valid: true`.

2. **`src/lib/auth-verify.ts` (21.85% total / 57.89% covered — E-016)**
   - **`L9:28–37` (`Survived`, `StringLiteral`)**: `bearer?.startsWith("Bearer ")` → `bearer?.startsWith("")`.
     - *Test to kill*: Pass `Authorization: "Basic abc"` alongside a valid `__session` cookie (or assert `verifyIdToken` is not called when header is not `"Bearer "`-prefixed).
   - **`L14:19–42` (`Survived`, `MethodExpression`) & `L15:9–44` (3 `Survived` mutants)**: `session.startsWith("{")` → `session.endsWith("{")` and `typeof token !== "string" || !token` → `false` / `&&`.
     - *Test to kill*: Pass `__session={"token":123}`, `__session={"token":""}`, and `__session=plain{` → assert `authenticateRequest` returns `null` and `verifySessionCookie` is not called.
   - **`L24:10–46` & `L26:35–86` (2 `Survived` mutants)**: `caller && caller.uid === expectedUid` → `false` (in `verifyCallerIdentity`) and error message string `""`.
     - *Why it survived*: `__tests__/auth-verify.test.ts` never asserts a *successful* `verifyCallerIdentity` call (`{ authorized: true }`) or the exact `error` string.
     - *Test to kill*: Call `verifyCallerIdentity(request({ Authorization: "Bearer valid" }), "sa")` when `verify` resolves to `{ uid: "sa" }` → assert `{ authorized: true }`; on failure assert `error: "Valid authentication for this account is required"`.
   - **`L40:11–42` (2 `Survived` mutants)**: `Buffer.byteLength(raw) > 500000` → `false` and `>= 500000`.
     - *Test to kill*: Send a request body of exactly `500,000` bytes (expect `200`) and `500,001` bytes (expect `413` with `{ error: "Request too large" }`).
   - **`L45–48` (6 `Survived` mutants on profile/teacher role check & error objects)**: `profile.role !== "teacher"` → `true`, `"users"` → `""`, and error JSON payloads `{ error: "..." }` → `{}` (tests check `.status` only, never `await res.json()`).
     - *Why it survived*: No test calls a `{ teacher: true }` endpoint with a user whose profile has `role: "teacher"`, so replacing `profile.role !== "teacher"` with `true` still passes the student rejection test at L25-L27!
     - *Test to kill*: Mock profile `{ role: "teacher", organizationId: "org1" }` calling `withAuthorizedRequest(handler, { teacher: true })` → assert `200` and `handler` called; also assert JSON error bodies on `401`/`403` responses and `collection` called with `"users"`.
   - **`L72–80` (6 `Survived` mutants on `feature` routing and `effectiveOrgId` inheritance)**: `req.nextUrl.pathname.includes('/notebook/')`, `!effectiveOrgId && profile.teacherId`, and `effectiveOrgId || ''`.
     - *Test to kill*: Inside `handler`, read `billingContext.getStore()` and assert `{ organizationId, userId, type }` for `/api/notebook/chat`, `/api/student/tutor`, and for a student profile with `organizationId: undefined, teacherId: "t1"` where teacher `"t1"` has `organizationId: "org-from-teacher"`.
   - **`L49–99` (94 `NoCoverage` mutants)**: Entire `options.resource === "submission"` block (L49–59), `options.resource === "portfolio"` block (L60–71), `grading_locks` transaction & already-graded short-circuit (L81–96), and catch block returning `400` (L98–100) are only exercised in emulator security tests (which `jest.config.js` ignores), never in unit tests.
     - *Tests to kill*: Unit tests for `withAuthorizedRequest` with `resource: "submission"` (invalid `submissionId` with `/` → 400, non-owner `teacherId` → 403, active lock → 409, already graded → 200 with cached score, ungraded → executes handler and deletes lock) and `resource: "portfolio"` (mismatched `organizationId` or unrelated student → 403, valid teacher/org → 200), plus invalid JSON body → 400.

3. **`src/lib/usage-limit.ts` (0.00% total / 0.00% covered — E-007)**
   - **123 `NoCoverage` mutants (L12–105)**: As expected, `usage-limit.ts` is not imported by any test file.
   - *Tests to kill*: Add `__tests__/usage-limit.test.ts` (item #3 in E7 below) covering: missing `organizationId`, missing org doc, inactive `subscriptionStatus` (`"canceled"`/`"past_due"`), free-plan starter budget (`budgetLimit <= 0` and `currentUsage >= budgetLimit` boundary), paid-plan cap (`budgetLimit > 0 && currentUsage >= budgetLimit` including `aiUsageReserved`), per-student `tutor` and `notebook` monthly allowance caps and `usageMonth` YYYY-MM rollover, Firestore error catch path (`allowed: false, error: "System check failed"`), and `recordUsage` / `checkAndIncrementUsage`.

## E7. Top 15 tests to add (prioritised)
| # | File | Scenario | Expected assertion |
|---|---|---|---|
| 1 | `tests/security/workflows.test.ts` | fix/triage budget test | `aiUsageReserved===0`, `aiUsageCurrent` equals cost of one settle; second settle is no-op |
| 2 | `__tests__/due-date.test.ts` → import real predicate | exact-equal, invalid date, Timestamp | late only when strictly greater; invalid → defined behaviour |
| 3 | `__tests__/usage-limit.test.ts` | limit reached / just under / plan rollover | returns blocked with reason; no increment past cap |
| 4 | `tests/security/webhooks.test.ts` | `validateEvent` throws | 403, no writes |
| 5 | `__tests__/api-grade.test.ts` | student calls `/api/grade`; teacher of other school | 403, no model call |
| 6 | `__tests__/api-submissions.test.ts` | late submit, tampered answers, unknown assignment | 4xx, nothing written; late flagged |
| 7 | `__tests__/ai-grading.test.ts` | score > max, negative, NaN, string score | clamped / rejected; never silently 0 |
| 8 | `functions/__tests__/grading.test.ts` | trigger with Vertex failure | lock released, status `pending_review` (K-001) |
| 9 | `functions/__tests__/assignment-email.test.ts` | course-scoped students only; duplicate trigger | only course students emailed once (K-002) |
| 10 | `__tests__/rate-limit.test.ts` | fake timers: N+1th call, window reset | blocked then allowed after window |
| 11 | `__tests__/class-enrollment.test.ts` | legacy code, duplicate code, case-insensitive | resolves course; ambiguous → error |
| 12 | `__tests__/assignment-parser.test.ts` | malformed / huge / injection input | returns validated structure or error, no throw |
| 13 | `__tests__/api-checkout.test.ts` | missing `POLAR_PRODUCT_ID`; unauthenticated | 4xx/500 with clear error; never calls Polar |
| 14 | `__tests__/api-student-tutor.test.ts` | cross-student uid, over-limit | 403 / 429 before model call |
| 15 | `e2e/smoke.spec.ts` (Playwright + emulators) | login → submit assignment → teacher grade | grade visible to student; no console errors |

## Score: **2 / 5**
Strong, security-focused emulator tests and a few good authz unit tests, but 46.9% line coverage on only 17 instrumented files (14.3% file coverage overall), a **23.77% overall Stryker mutation score** across the three target libraries (`88.00%` on `assignment-validation.ts`, `21.85%` on `auth-verify.ts`, `0.00%` on `usage-limit.ts`), two tautological tests on critical paths, a failing billing test nobody sees, untested Cloud Functions, no CI, no UI/E2E tests, and mismatched toolchain versions.
