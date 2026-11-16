# RT-19: Test hardening on critical logic

Findings: E-002, E-003, E-004, E-006 (rest), E-007, E-008, E-016, E-017.

## Extractions (behaviour-identical)

| Predicate | Was inline in | Now | Proof |
|---|---|---|---|
| `isSubmissionLate(dueDate, now)` | `src/app/api/submissions/route.ts` (`const due = assignment.dueDate?.toDate?.(); ... isLate: !!due && now > due`) | `src/lib/due-date.ts`, route calls it | Before switching the route, a throw-away test ran the pre-extraction expression as an oracle against the extracted function over 8 due-date shapes (undefined, null, `{}`, Timestamp before/at/after, invalid date, `toDate` returning undefined) x 3 `now` values. All equal. Oracle then deleted. |
| `isWaypointLocked(id, index, starterIds, isFreePlan, activeTab)` | `src/app/teacher/waypoints/page.tsx` | `src/lib/plan-limits.ts`, page wraps it with its own state | Same oracle method over 2 plans x 4 tabs x 3 starter lists x 2 ids x 6 indices (288 cases). |

`__tests__/due-date.test.ts` and `__tests__/waypoints-plan-limits.test.ts` previously defined the function they asserted; the only rewrite is replacing those copies with imports of the real code (existing assertions kept, new ones added).

## Tests added

- `__tests__/webhooks-verification.test.ts` (17): real `@polar-sh/sdk` `validateEvent` with standard-webhooks HMAC signatures from a test secret: missing headers, wrong secret, tampered body, replay under another id, 5 minute timestamp tolerance both ways, malformed JSON, unknown type, unset secret, plus a positive control (a signed schema-valid `customer.deleted` is accepted and writes nothing). All failures expect 401 (the route's actual code; the ticket says 403) and zero writes.
- `__tests__/webhooks-subscription-states.test.ts` (29): `subscription.canceled/revoked/updated(past_due)/active/created/uncanceled` applied; usage reset only on a new period; replay, out-of-order, bad date, unknown org, bad metadata, non-subscription events ignored; transaction failure is 500.
- `__tests__/auth-wrapper-rt19.test.ts` (67): byte (not character) size cap, identityField, teacher gate, org inheritance, lock timing (15 min, expiry boundary), lock failures, portfolio/submission denial paths, rateLimit hook, cookie parsing, audit record shape, log labels.
- `__tests__/usage-limit.test.ts` (26): every `checkBudget` message and lookup, DB failure, `recordUsage`.
- `__tests__/class-enrollment.test.ts` (26): `findClassByCode` validation, case fallback, teacher/org checks, transaction path.
- `__tests__/rate-limit-gaps.test.ts` (20): fake-timer window behaviour, message wording, `merge: true`, unavailable DB, `enforceRateLimit` 429 bodies/headers and the no-IP policies.
- `__tests__/assignment-validation.test.ts` (+16): True/False, `Maybe`, whitespace-only options, blank option elsewhere, etc. No bug found in `validateQuestionAnswers` (a whitespace-only option selected as correct is rejected as intended).
- `tests/helpers/fake-billing-db.ts`: in-memory Firestore double used by both webhook suites.

## Mutation scores

Run: `npx stryker run docs/quality-audit/remediation/stryker-rt19.config.json --mutate <file> --commandRunner.command "npx jest <suites> --silent --bail"`.

| File | Baseline (E-016/E-007) | After | Target | Survivors left |
|---|---|---|---|---|
| `src/lib/auth-verify.ts` | 21.85% | **99.00%** (297 killed, 3 survived) | >60% | cookie `?.` and `if (!session)` (both fall through to the same `null` via try/catch), redundant `student.teacherId !== caller.uid` in portfolio check |
| `src/lib/usage-limit.ts` | 0% | **94.81%** | >50% | 4 `data?.` optional chains (data is non-null there) |
| `functions/src/budget-policy.ts` (now holds the decision logic) | n/a | **96.51%** | n/a | `?? ''` fallback string, `limit <= 0` (equivalent: `used >= limit` already catches 0) |
| `src/lib/rate-limit.ts` | n/a (no tests) | **93.52%** (from 80.56% with RT-11 tests alone) | n/a | dead `if (!identifier)` guard and `doc.exists`/`data` guards |

Caveats: the repo's `stryker.config.json` cannot run because `@stryker-mutator/jest-runner` and `@stryker-mutator/typescript-checker` are not installed (not installed here per the no-new-dependencies rule). The built-in `command` runner was used with `coverageAnalysis: off`, so every mutant runs the listed jest suites. Without the type checker, a mutant that fails ts-jest type-checking is counted as killed, so scores are somewhat optimistic compared with a checker run. The listed surviving mutants were reviewed by hand; none is a behavioural gap.

## Not done / differences from the ticket text

- Webhook verification failures are asserted as 401, not 403 (route returns 401; changing it is a production behaviour change, see FOLLOWUPS).
- Route-level tests for `/api/grade`, `/api/checkout`, `/api/student/tutor` (E-007 text) are not in RT-19's six steps; left to FOLLOWUPS.
- E-006 (grading.ts coverage) is covered by the grading suites from other tickets; no new grading tests here.
