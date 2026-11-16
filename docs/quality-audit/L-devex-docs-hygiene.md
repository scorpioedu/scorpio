# L. DevEx, Docs and Repo Hygiene

Findings: `findings-L.csv` (L-001…L-013). Raw: `raw/env-used.txt`, `raw/env-example-names.txt`, `raw/env-diff-missing-from-example.txt`, `raw/env-diff-unused-in-code.txt`, `raw/git-large-objects.txt`, `raw/clean-clone-log.txt`.
`.env.local` values were never read; only variable names from `.env.example` and source were compared.

## Task checklist
- [x] **L1** CI/CD: no workflows. Deploy path = Firebase Hosting (webframeworks, `firebase.json` hosting `source:"."`, project `scorpio-srs`) + Cloud Functions; README says `npm run build && firebase deploy`. Vercel artefacts (CLI, analytics) exist but no `vercel.json`/`.vercel`. Proposed CI: node 22 → `npm ci` → `tsc --noEmit` → `eslint` (soft until 246 errors fixed) → `npm test` → `npm run test:security` (Java + emulators) → `npm run build` → `cd functions && npm ci && npm run build`. (L-001, L-002)
- [x] **L2** Pre-commit: none (no husky/lint-staged/prettier/editorconfig/nvmrc/engines/typecheck script). Formatting inconsistent. (L-003)
- [x] **L3** Docs accuracy & clean-clone verification (`raw/clean-clone-log.txt`): verified both statically and by cloning into `/tmp/scorpio-clean-clone` and executing `README.md` Quick Start with `.env.example` dummy values (see L3 section below; L-004, L-005, L-012, L-013).
- [x] **L4** Root clutter classification (L-006)

| File | Decision |
|---|---|
| `check_portfolios.ts` | move to `tools/` or delete (touches admin DB) |
| `update_mermaid.py` | move to `tools/` or delete |
| `demo.md` | move to `docs/` |
| `diagram.mermaid` | move to `docs/` |
| `opencode.json` | keep only if team uses opencode; else delete |
| `UIAUDIT.MD` | move to `docs/audits/` (rename `.md`) |
| `LAYERING.MD` | move to `docs/architecture.md` (update `opencode.json`) |

- [x] **L5** Git hygiene: 360 commits, mixed conventions, 257 MB `.git`, no LFS (L-007, L-008)
- [x] **L6** CHANGELOG: stale single v0.1.0 entry (L-009)

## L3. Clean-clone verification (`raw/clean-clone-log.txt`)
The repo was cloned into `/tmp/scorpio-clean-clone` (`git clone /Users/pradeepmahdevu/source/learn/scorpio /tmp/scorpio-clean-clone`, deleted after verification) on Node `v24.12.0`, npm `11.6.2`, OpenJDK `24.0.2`, and `firebase-tools` `15.5.1`, following `README.md:L197-L251` literally with `cp .env.example .env.local` (dummy values only).

### Step-by-step results from clean clone
| Step | Command / Action | Result | Findings & missing/failing details |
|---|---|---|---|
| **1. Clone & install** (`README.md:L205-L210`) | `git clone ... && cd scorpio && npm install` | **PASS (with warnings)** (exit `0`, 15 s) | Installs 1,535 packages; reports 8 deprecated-package warnings (`inflight`, `glob@7`, `querystring`, `formidable@1`, `node-domexception`, `superagent@3.7`, `tar@7.5.7`, `sib-api-v3-sdk@8.5.0`) and **97 npm audit vulnerabilities** (6 critical, 39 high). **Missing step**: does not install `functions/node_modules`. |
| **2. Environment setup** (`README.md:L212-L239`) | `cp .env.example .env.local` | **PARTIAL / GAPS** | `README.md` never mentions `.env.example` and its inline snippet (`L214-L239`) omits `FIREBASE_PROJECT_ID`, `POLAR_WEBHOOK_SECRET`, `POLAR_MONTHLY_ID`, `POLAR_YEARLY_ID`, `POLAR_PRODUCT_ID`, `NEXT_PUBLIC_APP_URL`, `LANDING_ORG_ID`, `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`, `NEXT_PUBLIC_RECAPTCHA_PROVIDER`, and `NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN`. `.env.example` itself omits `POLAR_PRODUCT_ID`, `NEXT_PUBLIC_RECAPTCHA_PROVIDER`, and `NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN`, and includes unused `NEXT_PUBLIC_FIREBASE_CLIENT_ID` (L-005). Furthermore, `src/lib/firebase-admin.ts:L37-L44` calls `admin.credential.cert()` unconditionally, which throws `Invalid PEM formatted message` on `.env.example`'s placeholder `FIREBASE_PRIVATE_KEY` (L-012). |
| **3. Unit tests** | `npm test` | **PASS** (exit `0`, 1.02 s) | 10 suites, 39 tests pass out of the box (prints 5 noisy `console.error` stack traces from `grading-failure.test.ts`). Note: `jest.config.js` ignores `/tests/security/`. |
| **4. Security / emulator tests** | `npm run test:security` | **FAIL** (exit `1`, 13.4 s) | Starts Firestore (`:8188`) and Storage (`:9298`) emulators via `firebase.test.json` (logs JDK 24 `WARNING: sun.misc.Unsafe::arrayBaseOffset has been called` from `cloud-storage-rules-runtime-v1.1.3.jar`). 3 suites pass (`rules.test.cjs`, `webhooks.test.ts`, `full-student-teacher-workflow.test.ts`), **1 suite fails**: `tests/security/workflows.test.ts:L60` (`Expected: 0.28, Received: 0.45` in `concurrent budget reservations cannot exceed the cap; settlement is idempotent`, E-001). **Missing from README**: Java JRE and `firebase-tools` prerequisites and `npm run test:security` command are completely undocumented (L-004). |
| **5. Production build** (`README.md:L249`) | `npm run build` | **PASS (with warnings)** (exit `0`, ~73 s) | Next 16.2.1 webpack build succeeds (72 static pages generated), but logs **20 `read ETIMEDOUT / Retrying 1/3...` warnings** during compilation while fetching all Unicode subsets of the 8 `next/font/google` families (I-022), plus a Recharts `width(-1) and height(-1)` warning during static page generation (I-016). |
| **6. Cloud Functions build / deploy precheck** (`README.md:L250`, `firebase.json:L52-L54`) | `cd functions && npm run build` | **FAIL** (exit `2`) until `cd functions && npm ci` is run | `firebase deploy` runs `npm --prefix "$RESOURCE_DIR" run build` (`tsc`). In a clean clone following README, `functions/node_modules` does not exist, so `tsc` fails with `error TS2307: Cannot find module '@google/genai'`, `'resend'`, and `'@react-email/components'` (L-013). Running `cd functions && npm ci` fixes the build (exit `0`), but emits `npm warn EBADENGINE Unsupported engine { required: { node: '22' }, current: { node: 'v24.12.0' } }` while `README.md:L200` claims `Node.js: 20.x or higher` (L-004, L-010). |
| **7. Local emulator usability** (`src/lib/firebase.ts`, `src/lib/firebase-admin.ts`) | Running app locally without production Firebase | **FAIL / MISSING** | Neither `src/lib/firebase.ts` (client) nor `src/lib/firebase-admin.ts` (server) supports connecting to local Firebase Auth/Firestore/Storage emulators (`connectAuthEmulator`/`connectFirestoreEmulator` absent; `firebase.json` has no `emulators` block; `firebase.test.json` omits `auth` emulator). A clean clone with dummy `.env.local` values can render public pages (`/`, `/pricing`, `/login`) in `npm run dev` / `npm run start`, but cannot sign in or access `/student` or `/teacher` without real Firebase credentials (L-012). |

## Positives
CONTRIBUTING/SECURITY/SUPPORT/CODE_OF_CONDUCT/LICENSE, issue + PR templates, `docs/school-deployment-readiness.md`; `.gitignore` covers `.env*`, service-account keys, logs, tsbuildinfo (none tracked).

## Score: **2 / 5**
Good governance docs, but no CI at all (while lint has 246 errors and `npm run test:security` fails on a clean clone), no hooks/formatter/Node pin, README Quick Start leaves `functions/` unbuilt and omits emulator/test setup, local app cannot run against Firebase emulators without code changes, `.env.example` is incomplete, 257 MB git history of committed video, and root clutter.
