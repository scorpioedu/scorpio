# Phase P0: Code Quality Baseline (`00-baseline.md`)

**Date:** 2026-11-11  
**Repo:** `/Users/pradeepmahdevu/source/learn/scorpio`  
**Phase 1 Status:** **UNBLOCKED**

---

## 1. Environment & Toolchain (`P0.1`)

| Tool / Runtime | Detected Version | Required / Configured | Status | Notes |
|---|---|---|---|---|
| Node.js | `v24.12.0` | Root: unspecified; `functions/`: `"node": "22"` | ⚠️ Warning | `functions/package.json` emits `EBADENGINE` under Node 24 (`raw/npm-ci.txt`). Root `package.json` lacks an `engines` field and `.nvmrc`. |
| npm | `11.6.2` | Lockfile v3 | ✅ Pass | Clean install succeeded in both root and `functions/`. |
| Java (OpenJDK) | `24.0.2` (Homebrew) | Required for Firebase Emulators | ✅ Pass | Firestore (`v1.20.2`) and Storage (`v1.1.3`) emulators launched cleanly. |
| Root `npm ci` | 1,538 packages | `package-lock.json` | ⚠️ Pass with warnings | Exit `0` in 27s. 8 deprecation warnings (`inflight`, `glob@7`, `querystring`, `formidable@1`, `node-domexception`, `superagent@3`, `tar@7.5.7`, `sib-api-v3-sdk@8.5.0`). `npm audit` reports **97 vulnerabilities** (6 critical, 39 high, 44 moderate, 8 low). |
| Functions `npm ci` | 584 packages | `functions/package-lock.json` | ⚠️ Pass with warnings | Exit `0` in 4s. `EBADENGINE` warning + 4 deprecation warnings. `npm audit` reports **48 vulnerabilities** (3 critical, 13 high, 24 moderate, 8 low). |

---

## 2. Quality Gates Summary (`P0.2`)

| Gate | Command | Pass / Fail | Error / Warning Count | Duration | Raw Output | Notes |
|---|---|---|---|---|---|---|
| TypeScript (Root) | `npx tsc --noEmit -p tsconfig.json` | ✅ **PASS** | 0 errors | < 5s | `raw/tsc-root.txt` | Passed both pre-build and post-build (with `.next/types/**/*.ts`). Note: `functions/` and `scripts/` are excluded in root `tsconfig.json`. |
| TypeScript (`functions/`) | `cd functions && npx tsc --noEmit` | ✅ **PASS** | 0 errors | < 3s | `raw/tsc-functions.txt` | Uses `typescript@5.7.3` (vs. `5.9.3` at root) with `strict: true`, `noImplicitReturns: true`, `noUnusedLocals: true`. |
| ESLint | `npx eslint .` | ❌ **FAIL** | **441 problems** (246 errors, 195 warnings) | ~8s | `raw/eslint.json`, `raw/eslint.txt` | 13 errors auto-fixable. Includes `react-hooks/set-state-in-effect`, `react-hooks/purity`, `react-hooks/refs`, `@typescript-eslint/no-explicit-any`, `react/no-unescaped-entities`. |
| Unit Tests (Jest) | `npx jest --coverage` | ✅ **PASS** | 10/10 suites, 39/39 tests passed | 0.90s | `raw/jest.txt`, `raw/coverage/` | Coverage across *imported* files only: **45.64% statements**, **36.98% branches**, **43.93% functions**, **46.90% lines** (only 13 files collected because `collectCoverageFrom` is not configured). |
| Production Build | `npm run build` (`next build --webpack`) | ✅ **PASS** | 0 errors (2 build warnings) | 53s | `raw/build.txt` | Compiled in 25.9s, static generation (72/72 pages) in 599ms. Warns about duplicate lockfile at `/Users/pradeepmahdevu/package-lock.json` and Recharts negative container dimensions during SSR. |
| Security / Emulator Tests | `npm run test:security` | ❌ **FAIL** | 3/4 suites passed, **1/4 failed** (33/34 tests passed) | 11.56s | `raw/test-security.txt` | `tests/security/workflows.test.ts` failed on `"concurrent budget reservations cannot exceed the cap; settlement is idempotent"` (`expect(org.aiUsageCurrent).toBeCloseTo(0.28)` received `0.45`). Also emitted Jest haste-map collision warnings against `.next/standalone/`. |

---

## 3. Codebase Size & Composition (`P0.3`)

Measured via `npx cloc src functions/src __tests__ tests --json` (`raw/cloc.json`):

| Language | Files | Blank Lines | Comment Lines | Code Lines (LOC) |
|---|---:|---:|---:|---:|
| TypeScript (`.ts` / `.tsx`) | 297 | 4,151 | 1,154 | 51,753 |
| CSS | 3 | 88 | 9 | 538 |
| JavaScript (`.cjs` / `.js`) | 1 | 1 | 0 | 71 |
| JSON | 1 | 0 | 0 | 39 |
| **Total** | **302** | **4,240** | **1,163** | **52,401** |

Total raw line count (`wc -l` across `src/` and `functions/src/` `.ts`/`.tsx` files): **55,698 lines**.

### Top 30 Largest Files by Line Count (`raw/top30-loc.txt`)

| Rank | Lines | File |
|---:|---:|---|
| 1 | 2,793 | `src/components/landing/workspace-preview-pages.tsx` |
| 2 | 2,259 | `src/components/landing/workspace-preview-tabs.tsx` |
| 3 | 1,683 | `src/app/student/assignment-view/page.tsx` |
| 4 | 1,584 | `src/app/student/tutor/page.tsx` |
| 5 | 1,495 | `src/app/teacher/network/page.tsx` |
| 6 | 1,195 | `src/components/motion/animated-sidebar.tsx` |
| 7 | 1,153 | `src/app/teacher/create/page.tsx` |
| 8 | 956 | `src/components/sustainability-content.tsx` |
| 9 | 903 | `src/app/student/notebook/page.tsx` |
| 10 | 802 | `src/components/landing/workspace-preview-data.ts` |
| 11 | 785 | `src/components/landing/workspace-preview.tsx` |
| 12 | 781 | `src/components/admin/usage-analytics.tsx` |
| 13 | 731 | `src/components/navigation-chatbot.tsx` |
| 14 | 726 | `src/components/ui/sidebar.tsx` |
| 15 | 719 | `src/components/landing/site-header.tsx` |
| 16 | 682 | `src/app/features/page.tsx` |
| 17 | 653 | `src/components/ui/macbook-scroll.tsx` |
| 18 | 640 | `src/app/teacher/vault/page.tsx` |
| 19 | 594 | `src/components/landing-chatbot.tsx` |
| 20 | 572 | `src/lib/ai/research.ts` |
| 21 | 570 | `src/app/teacher/submission/grade/page.tsx` |
| 22 | 562 | `src/components/admin/access-requests.tsx` |
| 23 | 556 | `src/components/settings-dialog.tsx` |
| 24 | 553 | `src/app/teacher/page-client.tsx` |
| 25 | 545 | `src/app/student/page-client.tsx` |
| 26 | 521 | `src/components/math-input.tsx` |
| 27 | 509 | `src/app/teacher/waypoints/page.tsx` |
| 28 | 504 | `src/app/signup/page.tsx` |
| 29 | 502 | `src/app/(docs)/research/page.tsx` |
| 30 | 501 | `src/app/ai/page.tsx` |

---

## 4. Code Smell Counts (`P0.3` — `raw/smells.txt`)

Scanned across `src/` and `functions/src/`:

| Smell Pattern | Occurrences | Files Affected | Top Hotspots |
|---|---:|---:|---|
| Explicit `: any` / `<any>` / `any[]` | **104** | 53 | `src/app/student/assignment-view/page.tsx` (8), `src/lib/ai/config.ts` (7), `src/lib/ai/assignment.ts` (5), `functions/src/grading.ts` (5) |
| Type assertion `as any` | **24** | 14 | `src/lib/firebase-admin.ts` (3), `src/lib/ai/assignment.ts` (3), `src/components/motion/animated-sidebar.tsx` (3) |
| `@ts-ignore` | **3** | 3 | `src/lib/firebase.ts` (1), `src/lib/ai/utils.ts` (1), `src/lib/ai/assignment.ts` (1) |
| `@ts-expect-error` | **0** | 0 | None |
| `eslint-disable` | **2** | 2 | `src/components/admin/firestore-explorer.tsx` (1), `src/app/ai/page.tsx` (1) |
| `console.log` | **34** | 12 | `src/lib/ai/research.ts` (7), `src/app/login/page.tsx` (6), `functions/src/index.ts` (6), `src/app/student/assignment-view/page.tsx` (3) |
| `TODO` / `FIXME` / `HACK` | **0** | 0 | None in `src/` or `functions/src/` |
