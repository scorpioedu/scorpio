# Workstream K: Cloud Functions Audit (`K-cloud-functions.md`)

**Date:** 2026-11-11  
**Repo:** `/Users/pradeepmahdevu/source/learn/scorpio`  
**Scope:** `functions/src/index.ts`, `functions/src/billing.ts`, `functions/src/grading.ts`, `functions/src/metering.ts`, `functions/src/lib/email.ts`, `functions/src/templates/*`, `functions/tsconfig.json`, `functions/package.json`, and `firebase.json`.

---

## Task Checklist

- [x] **K1** Review `functions/src/index.ts`, `billing.ts`, `grading.ts`, `metering.ts`, `lib/email.ts`, and `templates/`.
- [x] **K2** Triggers: evaluate idempotency (at-least-once delivery), retry config, and infinite-trigger loop prevention.
- [x] **K3** Config: audit region, memory, timeout, `minInstances`, `maxInstances`, and secrets via `defineSecret` vs. `process.env`.
- [x] **K4** Error handling and logging (`firebase-functions/logger` vs. `console`).
- [x] **K5** Build: review `tsconfig.json` strictness in `functions/`, `firebase.json` predeploy hooks, and whether `functions/lib/` is committed or ignored.
- [x] **K6** Tests: verify whether `firebase-functions-test` is used and evaluate test coverage of Cloud Functions.

---

## K1. File-by-File Review of `functions/src/`

| File | LOC | Exported Symbols / Triggers | Summary & Issues Found |
|---|---:|---|---|
| `functions/src/index.ts` | 116 | `onAssignmentDeleted`, `onAssignmentCreated`, re-exports `onSubmissionCreated`, `onSubmissionUpdated`, `deliverBillingUsage` | 1. **`onAssignmentDeleted` (`L22-L36`)** deletes `submissions` docs and `assignment_keys/{assignmentId}`, but **never deletes student file attachments in Firebase Storage** (`submission.workFiles`), permanently orphaning uploaded PDFs/images.<br>2. **`onAssignmentCreated` (`L52-L114`)** defaults `disableAssignmentEmails` to `true` (`const disableEmails = teacherData?.preferences?.disableAssignmentEmails ?? true` at `L72`), disabling assignment emails by default until a teacher explicitly toggles the setting.<br>3. **`onAssignmentCreated` (`L80-L83`)** queries all students where `teacherId == teacherId` without filtering by `assignmentData.courseId`, emailing students in the teacher's other classes.<br>4. **`onAssignmentCreated` (`L92-L112`)** fires `Promise.all(emailPromises)` across all students with no concurrency cap or `resend.batch.send`, risking Resend rate-limit rejections (`429`). |
| `functions/src/billing.ts` | 17 | `deliverBillingUsage` (`onDocumentCreated('billing_outbox/{eventId}')`) | Ingests usage events to Polar with `externalId: event.params.eventId`. Never increments `attempts` or records `lastError` on `billing_outbox/{eventId}` when `polar.events.ingest` fails (`metering.ts:L61` initializes `attempts: 0`). Reads `process.env.POLAR_ENV` (`L10`) without `defineString` or validation, defaulting silently to `'production'`. |
| `functions/src/grading.ts` | 346 | `onSubmissionCreated`, `onSubmissionUpdated` | 1. **100% duplicated logic (`raw/fallow-dupes.txt:L16-L18,L63-L68`):** `scrubPII` (`L19-L59`) is a 41-line clone of `src/lib/ai/utils.ts:L9-L68`; `gradeResponseAI` (`L64-L173`, complexity 33) clones `src/lib/ai/grading.ts:L4-L127`; `gradeSubmission` (`L178-L280`, complexity 49) clones `src/app/api/grade/route.ts:L37-L189`.<br>2. **Unused secret binding (`L7,L328,L338`):** Binds `secrets: [resendApiKey]` on both triggers even though the email notification block (`L281-L302`) is completely commented out.<br>3. **Stale event snapshot overwrite (`L308-L320`, `L222`):** `processGrading` reads the latest `current` doc inside the lock transaction (`L313`), but then passes the trigger event's original `submissionData` (`L320`) into `gradeSubmission`, rather than using `current`. |
| `functions/src/metering.ts` | 64 | `getActiveTokenRates`, `TOKEN_RATES`, `estimateMaximumCost`, `reserveBudget`, `settleBudget` | Imported across package boundaries by Next.js (`src/lib/ai/config.ts:L3` via `../../../functions/src/metering`). `getActiveTokenRates` and `TOKEN_RATES` (`L7,L14`) are flagged as unused exports by `knip`/`fallow` (`raw/fallow-dead-code.txt:L61-L63`), and `TOKEN_RATES` is evaluated once at module load time. |
| `functions/src/lib/email.ts` | 40 | `sendEmail` | Caches a module-level singleton `let resend: Resend \| null = null` (`L4,L23-L25`) initialized with the first `apiKey` seen on cold start; subsequent calls passing a different or rotated `apiKey` reuse the stale `Resend` instance. Logs recipient email addresses to stdout (`L34,L37`). |
| `functions/src/templates/AssignmentCreatedEmail.tsx` | 106 | `AssignmentCreatedEmail`, `default` | Exports both named and default export (`raw/fallow-dead-code.txt:L132-L133`). Accepts `courseName = "Physics"` prop (`L18,L25`) that is never rendered anywhere in the email body. |
| `functions/src/templates/GradeAvailableEmail.tsx` | 89 | `GradeAvailableEmail`, `default` | **Completely unused dead file** (`raw/fallow-dead-code.txt:L7`) because grade notification emails in `functions/src/grading.ts:L281-L302` are commented out. Also hardcodes broken `/dashboard` URLs (`https://scorpioedu.org/dashboard` at `L30` and `/dashboard/student/assignments/${assignmentId}` at `grading.ts:L295`). |

---

## K2. Triggers: Idempotency, Retry Configuration & Loop Safety

| Trigger | Event Type & Path | Infinite-Loop Safe? | Idempotent on Duplicate Delivery? | Retry Configured? | Analysis |
|---|---|---|---|---|---|
| `onAssignmentDeleted` (`index.ts:L22`) | `onDocumentDeleted("assignments/{assignmentId}")` | ✅ Yes (deletes `submissions` and `assignment_keys`) | ⚠️ Partial (Firestore deletes are idempotent, but Storage files in `workFiles` are never deleted) | ❌ `false` (default) | If batch deletion fails halfway through, there is no retry enabled (`retry: true` is omitted), leaving orphaned submissions and answer keys. |
| `onAssignmentCreated` (`index.ts:L52`) | `onDocumentCreated("assignments/{assignmentId}")` | ✅ Yes (read-only + external email) | ❌ **No** | ❌ `false` (default) | Firestore triggers guarantee *at-least-once* delivery. `onAssignmentCreated` does **not** record a delivery marker (e.g., `notificationSentAt` on `assignments/{assignmentId}`) or pass an idempotency key to Resend, so duplicate event delivery sends duplicate emails to every student. |
| `onSubmissionCreated` (`grading.ts:L326`) | `onDocumentCreated("submissions/{submissionId}")` | ✅ Yes (writes `status: 'graded'` or `'pending_review'`) | ✅ Yes (uses `grading_locks/{submissionId}` transaction + checks `!current.graded` at `L315`) | ❌ `false` (default) | Protected by `grading_locks/{submissionId}` (`15m` lease) and `current.graded` check. However, see `K3` regarding 60s function timeout vs. 15m lock lease. |
| `onSubmissionUpdated` (`grading.ts:L336`) | `onDocumentUpdated("submissions/{submissionId}")` | ✅ Yes (`L343` checks `afterData.status === 'submitted' && beforeData?.status !== 'submitted' && !afterData.graded`, and `gradeSubmission` transitions `status` to `'graded'` or `'pending_review'`) | ✅ Yes (same `grading_locks/{submissionId}` transaction) | ❌ `false` (default) | Does not infinite-loop because `processGrading` updates `status` away from `'submitted'`. However, if `gradeSubmission` exits early without updating `status` (`L194`: no org, `L212`: assignment missing, `L214`: `gradingType !== 'ai'`), `status` remains `'submitted'`, which is still safe because `beforeData.status` on any subsequent update will already be `'submitted'`. |
| `deliverBillingUsage` (`billing.ts:L5`) | `onDocumentCreated("billing_outbox/{eventId}")` | ✅ Yes (`onDocumentCreated` does not re-fire on `.update()`) | ⚠️ Mostly (`L9` checks `current.status === 'delivered'` non-transactionally and passes `externalId: event.params.eventId` to Polar) | ✅ `retry: true` (`L5`) | Passing `externalId: event.params.eventId` to `polar.events.ingest` (`L12`) provides upstream idempotency, though `ref.get()` at `L8-L9` is not wrapped in a transaction and `attempts` is never incremented. |

---

## K3. Runtime Configuration (Region, Memory, Timeout, Instances, Secrets)

### 3.1 Function Options Summary
In `functions/src/index.ts:L17`:
```typescript
setGlobalOptions({ maxInstances: 10 });
```
None of the 5 Cloud Functions specify `region`, `memory`, `timeoutSeconds`, `minInstances`, or `concurrency`:

| Setting | Configured Value | Cloud Functions v2 Default | Risk / Issue |
|---|---|---|---|
| `region` | Unspecified in `setGlobalOptions` | `us-central1` | Implicitly relies on default while `grading.ts:L13` hardcodes `location: "us-central1"` for Vertex AI and `firebase.json:L30` sets `frameworksBackend.region: "us-central1"`. Should be explicitly set in `setGlobalOptions({ region: "us-central1", maxInstances: 10 })`. |
| `timeoutSeconds` | Unspecified on all functions | **`60` seconds** | **Critical mismatch in `grading.ts`:** `processGrading` (`grading.ts:L316`) acquires a **15-minute (900s) lease lock**, and `gradeSubmission` (`L233-L263`) grades every short-answer/text question sequentially via Vertex AI (`gradeResponseAI` has no per-call timeout!). If an assignment has 5–10 open-ended questions and takes >60s total, Cloud Functions v2 **kills the container at 60 seconds**, before `finally { await lease.delete(); }` (`L323`) can execute! The submission is left ungraded (`status: 'submitted'`), locked for 15 minutes, with no error message (`pending_review` is never written), while the organization has already been billed for the questions graded before the 60s kill! |
| `memory` | Unspecified on all functions | `256MiB` | `grading.ts` loads `firebase-admin`, `@google/genai`, and `react` (via `index.ts` shared entry point). 256MiB is tight under concurrent requests (v2 default concurrency is 80 per instance unless memory/CPU are sized appropriately). |
| `minInstances` | Unspecified (`0`) | `0` | Acceptable for cost control on background Firestore triggers. |
| `secrets` | `RESEND_API_KEY` (`index.ts:L47`, `grading.ts:L7`), `POLAR_ACCESS_TOKEN` (`billing.ts:L4`) | N/A | `onSubmissionCreated` and `onSubmissionUpdated` (`grading.ts:L328,L338`) bind `resendApiKey` even though email sending is commented out (`L281-L302`), violating least privilege. Meanwhile `billing.ts:L10` reads `process.env.POLAR_ENV` directly without `defineString("POLAR_ENV")`. |

---

## K4. Error Handling & Logging (`firebase-functions/logger` vs. `console`)

1. **Zero Usage of `firebase-functions/logger`:**
   Across `functions/src/index.ts`, `grading.ts`, and `lib/email.ts`, there are **0 imports of `firebase-functions/logger`** and **18 raw `console.log` / `console.warn` / `console.error` calls** (`6` `console.log` in `index.ts`, `1` `console.log` and `5` `console.error` in `grading.ts`, `1` `console.log`, `1` `console.warn`, and `1` `console.error` in `lib/email.ts`). In Cloud Functions v2, raw `console.log` with multi-argument objects does not emit structured JSON payload fields or severity correlation properly in Google Cloud Logging compared to `logger.info` / `logger.error`.
2. **Silent Error Swallowing in `processGrading` (`functions/src/grading.ts:L320-L323`):**
   ```typescript
   // functions/src/grading.ts:L320-L323
   try { await gradeSubmission(submissionId, submissionData); }
   catch {
     await ref.update({ graded: false, status: 'pending_review', gradingError: 'AI grading unavailable; teacher review required' });
   } finally { await lease.delete(); }
   ```
   The `catch` block does not bind or log the error (`catch (err)` is omitted). If an exception is thrown anywhere in `gradeSubmission` outside `gradeResponseAI` (for example, a Firestore permission/read error, missing index on `users` query, or `ans.answer.trim()` throwing `TypeError` when `ans.answer` is not a string on `L256`), **nothing is logged anywhere in Cloud Logging**, and the submission is silently marked `"AI grading unavailable"`.
3. **PII Logged in Plaintext (`functions/src/index.ts:L108` & `functions/src/lib/email.ts:L34,L37`):**
   Student email addresses are logged in plaintext on every email send and failure (`console.log(\`Email sent successfully to ${to}\`, data)` and `console.error(\`Failed to email student ${student.email}\`, err)`).

---

## K5. Build & TypeScript Configuration (`functions/tsconfig.json`, `functions/lib/`)

1. **`functions/tsconfig.json` Strictness:**
   - Enables `"strict": true`, `"noImplicitReturns": true`, `"noUnusedLocals": true`, `"module": "NodeNext"`, `"moduleResolution": "nodenext"`, and passes `npx tsc --noEmit` with **0 errors** (`00-baseline.md`).
   - **Outdated Compilation Target (`functions/tsconfig.json:L11`):** Sets `"target": "es2017"` even though `functions/package.json:L13` targets `"node": "22"` (which supports ES2023/ES2024 natively).
   - **Missing Strict Flags:** Does not enable `"noUnusedParameters": true`, `"noFallthroughCasesInSwitch": true`, or `"noUncheckedIndexedAccess": true`.
   - **TypeScript & Node Version Drift:** `functions/package.json:L30` uses `typescript@^5.7.3` (vs. `^5.9.3` at root) and requires `"node": "22"` (emitting `EBADENGINE` warnings under local Node `v24.12.0`, `00-baseline.md:L13`).
2. **Is `functions/lib/` Committed or Ignored?**
   - Root `.gitignore` ignores `lib/**/*.js` and `lib/**/*.js.map`, and `git ls-files functions/lib` confirmed **zero compiled files in `functions/lib/` are committed to git**.
   - `firebase.json:L52-L54` properly configures `"predeploy": ["npm --prefix \"$RESOURCE_DIR\" run build"]`, ensuring `tsc` compiles `functions/src` to `functions/lib` before `firebase deploy --only functions`.

---

## K6. Cloud Functions Testing (`firebase-functions-test`)

- **`firebase-functions-test` Is Installed but Completely Unused:**
  - `functions/package.json:L29` lists `"firebase-functions-test": "^3.4.1"` in `devDependencies`, and `raw/fallow-dead-code.txt:L116` confirms it is never imported anywhere.
  - `functions/package.json:L3-L11` has **no `"test"` script**.
  - There are **0 test files in `functions/`**, and the root Jest config (`jest.config.cjs` / `tsconfig.json:L42`) excludes `functions/`.
  - Only `functions/src/metering.ts` is tested indirectly by `tests/security/workflows.test.ts:L18,L54-L68`—and as noted in `F-007`, test case `"concurrent budget reservations cannot exceed the cap; settlement is idempotent"` (`tests/security/workflows.test.ts:L60`) **currently fails** (`Expected: 0.28, Received: 0.45`) after `metering.ts` token rates were updated in commit `4442694f`.
  - None of the 5 Cloud Function triggers (`onAssignmentDeleted`, `onAssignmentCreated`, `onSubmissionCreated`, `onSubmissionUpdated`, `deliverBillingUsage`) have unit or emulator tests.

---

## Detailed Findings (`K-001` – `K-008`)

### `K-001` — High | Correctness: Cloud Functions grading triggers use default 60s timeout against a 15-minute lock lease and sequential Vertex AI calls
- **Category:** `correctness`
- **Location:** `functions/src/grading.ts:L308-L346` (and `functions/src/grading.ts:L233-L263`)
- **Evidence:**
  ```typescript
  // functions/src/grading.ts:L316-L329
      tx.set(lease, { expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 15 * 60 * 1000) });
      return true;
    });
    if (!acquired) return;
    try { await gradeSubmission(submissionId, submissionData); }
    catch {
      await ref.update({ graded: false, status: 'pending_review', gradingError: 'AI grading unavailable; teacher review required' });
    } finally { await lease.delete(); }
  }

  export const onSubmissionCreated = onDocumentCreated({
      document: "submissions/{submissionId}",
      secrets: [resendApiKey]
  }, async (event) => { ... });
  ```
- **Impact:** `onSubmissionCreated` and `onSubmissionUpdated` do not set `timeoutSeconds`, inheriting the Cloud Functions v2 default of **60 seconds**, while `gradeSubmission` grades each open-ended question sequentially with no per-call timeout. If grading takes >60s, the Cloud Function process is terminated before `catch` or `finally { await lease.delete(); }` can run—leaving the submission stuck in `status: 'submitted'`, locked in `grading_locks` for 15 minutes, and with settled AI usage charges for the already-graded questions.
- **Recommendation:** Set `timeoutSeconds: 300` (or `540`) and `memory: "512MiB"` on `onSubmissionCreated` and `onSubmissionUpdated`, add a per-request timeout to `client.models.generateContent`, align the `grading_locks` lease duration with `timeoutSeconds`, and grade questions with bounded concurrency (`Promise.all` in batches of 3–5).
- **Effort:** `S`
- **Confidence:** `High`

### `K-002` — High | Correctness & Privacy: `onAssignmentCreated` emails all students of a teacher across all courses, has no idempotency guard, and defaults to disabled
- **Category:** `correctness`
- **Location:** `functions/src/index.ts:L52-L114`
- **Evidence:**
  ```typescript
  // functions/src/index.ts:L72-L84
          const disableEmails = teacherData?.preferences?.disableAssignmentEmails ?? true;
          if (disableEmails) {
              console.log(`Teacher ${teacherId} has disabled assignment emails, skipping.`);
              return;
          }
      }
      // Find all students for this teacher
      const studentsSnapshot = await db.collection("users")
          .where("teacherId", "==", teacherId)
          .where("role", "==", "student")
          .get();
  ```
- **Impact:**
  1. When `assignmentData.courseId` is set, the query at `L80-L83` still fetches **all** students with `teacherId == teacherId` across every course/section, sending assignment notifications to students who are not enrolled in that class.
  2. There is no idempotency check (at-least-once trigger delivery sends duplicate emails to the entire roster) and `Promise.all(emailPromises)` (`L112`) fires unbounded concurrent requests to Resend.
  3. `disableAssignmentEmails ?? true` (`L72`) disables emails by default for all teachers who have never saved settings.
- **Recommendation:** Filter the student query by `.where("courseId", "==", assignmentData.courseId)` when `assignmentData.courseId` is present; record an idempotency flag on `assignments/{assignmentId}` inside a transaction (or pass an idempotency header to `resend.batch.send`); and chunk email sends.
- **Effort:** `M`
- **Confidence:** `High`

### `K-003` — Medium | Correctness: `onAssignmentDeleted` orphans student attachment files in Firebase Storage
- **Category:** `correctness`
- **Location:** `functions/src/index.ts:L22-L36`
- **Evidence:**
  ```typescript
  // functions/src/index.ts:L27-L35
    const snapshot = await submissionsRef.where("assignmentId", "==", assignmentId).get();

    for (let i = 0; i < snapshot.docs.length; i += 400) {
      const batch = db.batch();
      snapshot.docs.slice(i, i + 400).forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }
    await db.collection('assignment_keys').doc(assignmentId).delete();
  ```
- **Impact:** Unlike `/api/teacher/students/cleanup/route.ts:L17-L20` and `/api/account/route.ts:L39`, deleting an assignment deletes its `submissions` documents without deleting the corresponding Firebase Storage files referenced in `submission.workFiles`, permanently orphaning student uploads in Storage.
- **Recommendation:** Before deleting each submission document in `onAssignmentDeleted`, iterate over `doc.data().workFiles` and delete matching objects under `submissions/${studentId}/` from Firebase Storage.
- **Effort:** `S`
- **Confidence:** `High`

### `K-004` — Medium | Maintainability: Massive code duplication across `functions/src/grading.ts`, `src/lib/ai/grading.ts`, `src/lib/ai/utils.ts`, and `src/app/api/grade/route.ts`
- **Category:** `maintainability`
- **Location:** `functions/src/grading.ts:L19-L280` (and `src/lib/ai/utils.ts:L9-L68`, `src/lib/ai/grading.ts:L4-L127`, `src/app/api/grade/route.ts:L37-L189`)
- **Evidence:**
  ```text
  # raw/fallow-dupes.txt
  59 lines, 2 instances: functions/src/grading.ts:19-58 <-> src/lib/ai/utils.ts:9-67
  4 groups, 55 lines across functions/src/grading.ts, src/app/api/grade/route.ts
  2 groups, 50 lines across functions/src/grading.ts, src/lib/ai/grading.ts
  ```
- **Impact:** `scrubPII`, `gradeResponseAI`, and `gradeSubmission` in `functions/src/grading.ts` duplicate `src/lib/ai/utils.ts`, `src/lib/ai/grading.ts`, and `src/app/api/grade/route.ts` while already drifting in behavior (e.g., `src/app/api/grade/route.ts:L89,L154` uses `mergeAnswerKey` and has an `else if (question.correctAnswer)` fallback that `functions/src/grading.ts:L221,L255` lacks; meanwhile `src/lib/ai/config.ts:L3` imports `../../../functions/src/metering` across package boundaries).
- **Recommendation:** Extract shared pure grading, PII-scrubbing, and metering modules into a shared workspace package (or shared directory included in both `tsconfig.json` and `functions/tsconfig.json`) so Next.js API routes and Cloud Functions execute identical logic.
- **Effort:** `M`
- **Confidence:** `High`

### `K-005` — Medium | Correctness & Observability: `processGrading` silently swallows non-AI exceptions without logging, uses stale trigger event data, and `functions/src/*` never uses `firebase-functions/logger`
- **Category:** `maintainability`
- **Location:** `functions/src/grading.ts:L308-L324` (and `functions/src/grading.ts:L256`, `functions/src/index.ts:L35,L65,L74,L86,L90,L108,L113`, `functions/src/lib/email.ts:L19,L34,L37`)
- **Evidence:**
  ```typescript
  // functions/src/grading.ts:L313-L323
    const current = (await tx.get(ref)).data();
    ...
    try { await gradeSubmission(submissionId, submissionData); }
    catch {
      await ref.update({ graded: false, status: 'pending_review', gradingError: 'AI grading unavailable; teacher review required' });
    } finally { await lease.delete(); }
  ```
- **Impact:**
  1. `catch` at `L321` drops the error object without logging it; any bug or Firestore failure in `gradeSubmission` (e.g., if `ans.answer` is non-string at `L256`) is completely invisible in Cloud Logging.
  2. `processGrading` passes the trigger event's `submissionData` (`L320`) instead of the freshly transaction-read `current` (`L313`) to `gradeSubmission`.
  3. All 18 log statements in `functions/src/` use `console.*` instead of `firebase-functions/logger`, and `index.ts:L108` / `lib/email.ts:L34,L37` log student email addresses in plaintext.
- **Recommendation:** Bind and log the error in `processGrading` using `logger.error("Grading failed", { submissionId, err })`, pass the latest `current` document data from the transaction to `gradeSubmission`, replace `console.*` with `firebase-functions/logger`, and mask email addresses in logs.
- **Effort:** `S`
- **Confidence:** `High`

### `K-006` — Low | Security & Hygiene: Unused `RESEND_API_KEY` secret bound to grading triggers, unused `GradeAvailableEmail.tsx` template, and module-cached Resend client in `lib/email.ts`
- **Category:** `maintainability`
- **Location:** `functions/src/grading.ts:L7` (also `L281-L302`, `L328`, `L338`, `functions/src/templates/GradeAvailableEmail.tsx:L1-L89`, `functions/src/lib/email.ts:L4,L23-L25`)
- **Evidence:**
  ```typescript
  // functions/src/grading.ts:L7,L326-L329
  const resendApiKey = defineSecret("RESEND_API_KEY");
  ...
  export const onSubmissionCreated = onDocumentCreated({
      document: "submissions/{submissionId}",
      secrets: [resendApiKey]
  }, ...);
  ```
- **Impact:**
  1. `onSubmissionCreated` and `onSubmissionUpdated` mount the `RESEND_API_KEY` secret into their environment even though the grade email notification code (`L281-L302`) is commented out, and `functions/src/templates/GradeAvailableEmail.tsx` is dead code with broken `/dashboard` URLs.
  2. `functions/src/lib/email.ts:L23-L25` caches `let resend: Resend | null = null` across invocations, ignoring any changed `apiKey` argument after cold start.
- **Recommendation:** Remove `resendApiKey` from `onSubmissionCreated` and `onSubmissionUpdated` (or re-enable grade notifications with corrected `/student/assignments` URLs), delete or wire `GradeAvailableEmail.tsx`, and key the cached `Resend` instance in `lib/email.ts` by `finalApiKey`.
- **Effort:** `S`
- **Confidence:** `High`

### `K-007` — Medium | Testing: Zero test files in `functions/` despite `firebase-functions-test` being installed
- **Category:** `testing`
- **Location:** `functions/package.json:L26-L31`
- **Evidence:**
  ```json
  // functions/package.json:L26-L31
  "devDependencies": {
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "firebase-functions-test": "^3.4.1",
    "typescript": "^5.7.3"
  }
  ```
- **Impact:** `firebase-functions-test` is listed in `functions/package.json` (`raw/fallow-dead-code.txt:L116` flags it as unused), `functions/package.json` has no `"test"` script, and all 5 Cloud Function triggers (`onAssignmentDeleted`, `onAssignmentCreated`, `onSubmissionCreated`, `onSubmissionUpdated`, `deliverBillingUsage`) have **0% test coverage**.
- **Recommendation:** Add unit/emulator tests for `grading.ts`, `billing.ts`, and `index.ts` using `firebase-functions-test` and Jest, and add a `"test"` script to `functions/package.json`.
- **Effort:** `M`
- **Confidence:** `High`

### `K-008` — Low | Correctness: `deliverBillingUsage` never updates `attempts` or `lastError` on `billing_outbox` and silently defaults `POLAR_ENV` to `'production'`
- **Category:** `correctness`
- **Location:** `functions/src/billing.ts:L5-L17`
- **Evidence:**
  ```typescript
  // functions/src/billing.ts:L8-L16
   const current = (await ref.get()).data();
   if (!current || current.status === 'delivered') return;
   const polar = new Polar({ accessToken: token.value(), server: process.env.POLAR_ENV === 'sandbox' ? 'sandbox' : 'production' });
   await polar.events.ingest({ ... });
   await ref.update({ status: 'delivered', deliveredAt: new Date() });
  ```
- **Impact:** `functions/src/metering.ts:L61` initializes `billing_outbox` documents with `status: 'pending', attempts: 0`, but `deliverBillingUsage` never increments `attempts` or records `lastError` when `polar.events.ingest` throws. Additionally, if `POLAR_ENV` is not set in the Cloud Functions environment, `billing.ts:L10` silently targets Polar's `'production'` server.
- **Recommendation:** Use a transaction or atomic update in `deliverBillingUsage` to increment `attempts` and record `lastError` before re-throwing for retry, and declare `POLAR_ENV` with `defineString("POLAR_ENV", { default: "production" })` from `firebase-functions/params`.
- **Effort:** `S`
- **Confidence:** `High`

---

## Workstream K Score: **2.5 / 5** (rounded to **3 / 5** — Acceptable with notable debt and timeout/reliability risks)

**Justification:**
- **Positives:** Clean `tsc --noEmit` build with `"strict": true` (`functions/tsconfig.json`), `functions/lib/` properly gitignored with a `predeploy` build hook in `firebase.json`, transactional `grading_locks` lease preventing concurrent duplicate grading on `onSubmissionCreated`/`onSubmissionUpdated`, and transactional outbox creation in `metering.ts` with `externalId` deduplication in `deliverBillingUsage`.
- **Deductions:** Default 60s function timeout vs. 15-minute lock lease and sequential Vertex AI calls in `grading.ts` (`K-001`); `onAssignmentCreated` emailing all students across all courses without a `courseId` filter or idempotency guard (`K-002`); `onAssignmentDeleted` orphaning student files in Firebase Storage (`K-003`); 100% duplication of `scrubPII` and grading logic between `functions/src/grading.ts` and `src/` (`K-004`); silent `catch {}` block in `processGrading` and zero `firebase-functions/logger` usage (`K-005`); unused `RESEND_API_KEY` secret on grading triggers and dead `GradeAvailableEmail.tsx` (`K-006`); and zero tests in `functions/` (`K-007`).
