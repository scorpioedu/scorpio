# Workstream A: Static Analysis and Code Smells (`A-static-analysis.md`)

**Date:** 2026-11-11  
**Scope:** `src/`, `functions/src/`, `__tests__/`, `tests/`, root scripts, TypeScript & ESLint configurations  
**Raw Outputs:** `raw/eslint.json`, `raw/eslint.txt`, `raw/eslint-triage.txt`, `raw/eslint-bug-rules.txt`, `raw/tsc-root.txt`, `raw/tsc-functions.txt`, `raw/complexity.json`, `raw/complexity-summary.txt`, `raw/jscpd/`, `raw/jscpd-summary.txt`, `raw/knip.json`, `raw/knip.txt`, `raw/smells.txt`, `raw/server-any-lines.txt`, `raw/fallow-dead-code.txt`, `raw/fallow-dupes.txt`, `raw/fallow-health.txt`, `raw/fallow-architecture.txt`, `raw/fallow-security.txt`

---

## Checklist Progress

- [x] **A1** Triage `raw/eslint.json`: group by rule and by directory. List the top 10 rules and the top 10 files. Flag rules that point to real bugs separately from purely stylistic ones.
- [x] **A2** Triage the `tsc` output (root + functions). Note that `functions/` is excluded from the root `tsconfig.json`; confirm it is type-checked on its own.
- [x] **A3** Run complexity analysis (`complexity > 15`, `max-lines-per-function > 150`, `max-depth > 4`). List the 20 most complex functions.
- [x] **A4** Detect duplication (`jscpd --min-tokens 70`). Report the duplication % and top clone pairs, including `workspace-preview-*.tsx` and teacher vs. student page pairs.
- [x] **A5** Find dead code (`knip`). List unused files, exports, and dependencies. Cross-check with `src/app/demos/**`, `check_portfolios.ts`, and `update_mermaid.py`.
- [x] **A6** Review type safety: list every `any` / `as any` / `@ts-ignore` from `raw/smells.txt` in `src/lib/**`, `src/app/api/**`, and `functions/src/**`. Check whether `src/lib/types.ts` is the single source of truth.
- [x] **A7** Check that ESLint is not too permissive and recommend stronger rules.

---

## A1. ESLint Triage (`raw/eslint.json`, `raw/eslint-triage.txt`)

`npx eslint .` exited with code `1` and reported **441 total problems** (**246 errors**, **195 warnings**), of which 13 errors are auto-fixable via `--fix`.

### Top Rules by Count

| Rank | Rule ID | Total | Errors | Warnings | Classification |
|---:|---|---:|---:|---:|---|
| 1 | `@typescript-eslint/no-unused-vars` | 175 | 0 | 175 | Dead code / bug indicator (unused state/params) |
| 2 | `@typescript-eslint/no-explicit-any` | 153 | 153 | 0 | Type-safety hole |
| 3 | `react/no-unescaped-entities` | 47 | 47 | 0 | Stylistic / JSX copy |
| 4 | `react-hooks/exhaustive-deps` | 14 | 0 | 14 | **Real bug risk** (stale closures in effects/memos) |
| 5 | `prefer-const` | 13 | 13 | 0 | Stylistic (auto-fixable) |
| 6 | `react-hooks/set-state-in-effect` | 10 | 10 | 0 | **Real bug / perf risk** (cascading synchronous re-renders) |
| 7 | `@typescript-eslint/no-require-imports` | 9 | 9 | 0 | Config / CJS test files (`jest.config.js`, `tests/security/*`) |
| 8 | `@next/next/no-img-element` | 6 | 0 | 6 | **Perf / LCP risk** (unoptimized `<img>` tags) |
| 9 | `@typescript-eslint/no-empty-object-type` | 4 | 4 | 0 | Stylistic (`interface X extends Y {}`) |
| 10 | `react-hooks/refs` | 3 | 3 | 0 | **Real bug risk** (reading/mutating refs or calling ref-reading helpers during render) |
| 11 | `@typescript-eslint/ban-ts-comment` | 3 | 3 | 0 | Type-safety suppression (`@ts-ignore` instead of `@ts-expect-error`) |
| 12 | `react-hooks/purity` | 2 | 2 | 0 | **Real bug risk** (`Math.random()` called during render/memo, breaking React Compiler & SSR hydration) |
| 13 | `react-hooks/immutability` | 2 | 2 | 0 | **Real bug risk** (calling `setGradingRubric` before `useState` declaration — TDZ error; mutating context ref) |

### Breakdown by Directory

| Directory | Total | Errors | Warnings |
|---|---:|---:|---:|
| `src/app` | 202 | 110 | 92 |
| `src/components` | 125 | 60 | 65 |
| `src/lib` | 82 | 52 | 30 |
| `tests/security` | 11 | 9 | 2 |
| `functions/src` | 9 | 6 | 3 |
| `__tests__` | 7 | 6 | 1 |
| `jest.config.js` | 2 | 1 | 1 |
| `tools` | 2 | 1 | 1 |
| `src/hooks` | 1 | 1 | 0 |

### Top 10 Files by ESLint Problem Count

| Rank | File | Total | Errors | Warnings |
|---:|---|---:|---:|---:|
| 1 | `src/app/teacher/network/page.tsx` | 17 | 4 | 13 |
| 2 | `src/lib/ai/assignment.ts` | 17 | 14 | 3 |
| 3 | `src/app/features/page.tsx` | 16 | 0 | 16 |
| 4 | `src/app/student/assignment-view/page.tsx` | 16 | 12 | 4 |
| 5 | `src/app/(docs)/research/page.tsx` | 13 | 7 | 6 |
| 6 | `src/lib/firebase.ts` | 13 | 3 | 10 |
| 7 | `src/app/student/notebook/page.tsx` | 11 | 5 | 6 |
| 8 | `src/app/(docs)/about/about-client.tsx` | 10 | 9 | 1 |
| 9 | `src/components/motion/animated-sidebar.tsx` | 10 | 10 | 0 |
| 10 | `src/lib/ai/config.ts` | 10 | 10 | 0 |

### Bug-Pointing Rules vs. Stylistic Rules (`raw/eslint-bug-rules.txt`)

- **`react-hooks/immutability` (2 errors):**
  - `src/components/landing/workspace-preview-pages.tsx:L1642`: `setGradingRubric(initialDraft.gradingRubric)` is referenced inside a `useEffect` at line 1642 **before** `const [gradingRubric, setGradingRubric] = React.useState(...)` is declared at line 1654.
  - `src/components/motion/animated-sidebar.tsx:L612`: Mutates `context.triggerRef.current = node` directly inside a callback ref.
- **`react-hooks/purity` (2 errors):**
  - `src/components/landing/solution-flowchart.tsx:L326`: Calls `Math.random()` directly during render (`duration: 1.5 + Math.random()`).
  - `src/components/ui/sidebar.tsx:L611`: Calls `Math.random()` inside `React.useMemo`.
- **`react-hooks/refs` (3 errors):**
  - `src/components/math-input.tsx:L487`: References `applyFormat` and `applyList` in render-time array literal before their declarations or while accessing `editorRef.current`.
  - `src/components/motion/shared-layout-bg.tsx:L78`: Accesses `hovering` ref inside `Children.toArray(children).map(...)` during render.
- **`react-hooks/exhaustive-deps` (14 warnings):**
  - Missing effect dependencies in `src/app/student/assignment-view/page.tsx:L359` (`handleSubmit`), `src/app/student/notebook/page.tsx:L238,L263,L274` (`activeNotebookId`, `user`, `saveNotebook`), `src/app/student/submissions/page.tsx:L84` (`profile.courseId`, `profile.teacherId`), `src/app/teacher/assignments/page.tsx:L61`, `src/app/teacher/network/billing/page.tsx:L43`, `src/app/teacher/network/page.tsx:L370`, `src/app/teacher/uploads/page.tsx:L52`, `src/app/teacher/waypoints/page.tsx:L68`, `src/components/admin/ai-cost-calculator.tsx:L61`, and `src/components/demo-carousel.tsx:L47,L81,L107`.
- **`react-hooks/set-state-in-effect` (10 errors):**
  - Synchronous `setState` in `useEffect` bodies in `src/components/admin/usage-analytics.tsx:L83`, `src/components/motion/animated-sidebar.tsx:L336,L340`, `src/components/route-progress-bar.tsx:L14`, `src/components/scorpio-globe.tsx:L14`, `src/components/ui/smart-datetime-picker.tsx:L46`, `src/components/ui/space-background.tsx:L20`, `src/components/ui/typing-animation.tsx:L109`, and `src/hooks/use-sidebar-state.ts:L17`.

---

## A2. TypeScript (`tsc`) Triage (`raw/tsc-root.txt`, `raw/tsc-functions.txt`)

- **Root (`tsconfig.json`):** `npx tsc --noEmit -p tsconfig.json` passes with **0 errors** (both before and after `next build`).
  - `strict: true` is enabled (`tsconfig.json:L11`), along with `skipLibCheck: true` (`tsconfig.json:L10`).
  - **Exclusions (`tsconfig.json:L39-L45`):** Excludes `node_modules`, `functions`, `.firebase`, `scripts`, and `.next/dev`. Notably:
    1. `functions/` is excluded from the root `tsconfig.json` and is only type-checked if `cd functions && npx tsc --noEmit` (or `npm --prefix functions run build`) is explicitly invoked; there is no root npm script that type-checks both.
    2. `scripts` is listed in `exclude` even though no `scripts/` directory exists, while `tools/migrate-school-security.cjs` and root `check_portfolios.ts` exist outside `src/`.
    3. Root `tsconfig.json` does **not** enable `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, or `noUncheckedIndexedAccess`.
- **Cloud Functions (`functions/tsconfig.json`):** `cd functions && npx tsc --noEmit` passes with **0 errors**.
  - Configured with `strict: true`, `noImplicitReturns: true`, `noUnusedLocals: true`, `module: "NodeNext"`.

---

## A3. Complexity Analysis (`raw/complexity.json`, `raw/complexity-summary.txt`)

Running ESLint across `src/` and `functions/src/` with thresholds `complexity: 15`, `max-lines-per-function: 150` (skipping blanks/comments), and `max-depth: 4` produced:
- **79 functions** exceeding cyclomatic complexity of 15
- **73 functions** exceeding 150 non-blank/non-comment lines
- **16 blocks** exceeding nesting depth of 4

### Top 20 Most Complex Functions

| Rank | Cyclomatic Complexity | Non-Blank Lines | Function | Location |
|---:|---:|---:|---|---|
| 1 | **80** | 1,444 | `AssignmentDetailContent` | `src/app/student/assignment-view/page.tsx:L78-L1675` |
| 2 | **76** | 1,318 | `NetworkPage` | `src/app/teacher/network/page.tsx:L83-L1495` |
| 3 | **61** | 171 | `handlePost` | `src/app/api/grade/route.ts:L8-L197` |
| 4 | **59** | 989 | `CreateAssignmentForm` | `src/app/teacher/create/page.tsx:L97-L1153` |
| 5 | **49** | 109 | `gradeSubmission` | `functions/src/grading.ts:L178-L306` |
| 6 | **48** | 740 | `NotebookPage` | `src/app/student/notebook/page.tsx:L86-L903` |
| 7 | **42** | 133 | `POST` handler (arrow fn) | `src/app/api/teacher/network/membership/route.ts:L9-L176` |
| 8 | **40** | 78 | `callGeminiDirect` | `src/lib/ai/config.ts:L14-L102` |
| 9 | **40** | 114 | `parseQuestionsManually` | `src/lib/assignment-parser.ts:L1-L132` |
| 10 | **39** | 133 | `fetchAssignment` (nested in `AssignmentDetailContent`) | `src/app/student/assignment-view/page.tsx:L195-L355` |
| 11 | **39** | 64 | `verifyAuth` (arrow fn) | `src/lib/auth-verify.ts:L35-L114` |
| 12 | **39** | 78 | `checkBudget` | `src/lib/usage-limit.ts:L7-L98` |
| 13 | **37** | 121 | `AnimatedSidebarMenuButton` | `src/components/motion/animated-sidebar.tsx:L1038-L1168` |
| 14 | **36** | 105 | `POST` handler (arrow fn) | `src/app/api/submissions/route.ts:L16-L149` |
| 15 | **35** | 129 | `generateAssignmentQuestions` | `src/lib/ai/assignment.ts:L70-L221` |
| 16 | **34** | 1,257 | `TutorPage` | `src/app/student/tutor/page.tsx:L199-L1585` |
| 17 | **34** | 487 | `LandingChatbot` | `src/components/landing-chatbot.tsx:L77-L593` |
| 18 | **33** | 95 | `gradeResponseAI` | `functions/src/grading.ts:L64-L175` |
| 19 | **32** | 101 | `POST` | `src/app/api/auth/teacher-code/route.ts:L10-L134` |
| 20 | **31** | 108 | `POST` handler (arrow fn) | `src/app/api/auth/register/route.ts:L18-L157` |

---

## A4. Code Duplication (`raw/jscpd/jscpd-report.json`, `raw/jscpd-summary.txt`)

Running `npx jscpd src functions/src --min-tokens 70` found:
- **64 exact/near-exact token clone pairs**
- **1,121 duplicated lines** (2.00% of lines) and **7,756 duplicated tokens** (2.38% of tokens) across 249 source files.

### Top Token Clone Pairs

| Rank | Lines | Tokens | First Location | Second Location | Description |
|---:|---:|---:|---|---|---|
| 1 | 61 | 452 | `src/app/demos/page.tsx:L197-L257` | `src/app/features/page.tsx:L622-L682` | Duplicated CTA / footer section |
| 2 | 61 | 389 | `src/components/kokonutui/spotlight-cards.tsx:L76-L136` | `src/components/ui/spotlight-cards.tsx:L52-L112` | Whole `spotlight-cards.tsx` component duplicated in two folders |
| 3 | 46 | 294 | `src/app/signup/page.tsx:L237-L282` | `src/app/signup/page.tsx:L376-L421` | Teacher vs. student signup form fields |
| 4 | 41 | 291 | `functions/src/grading.ts:L19-L59` | `src/lib/ai/utils.ts:L9-L68` | `scrubPII` copy-pasted between Next.js and Cloud Functions |
| 5 | 36 | 253 | `src/app/demos/page.tsx:L222-L257` | `src/app/sustainability/page.tsx:L63-L110` | Duplicated marketing section |
| 6 | 31 | 184 | `src/app/login/page.tsx:L288-L318` | `src/app/login/page.tsx:L374-L404` | Teacher vs. student login form blocks |
| 7 | 30 | 98 | `src/components/kokonutui/spotlight-cards.tsx:L196-L225` | `src/components/ui/spotlight-cards.tsx:L173-L202` | Duplicate spotlight card subtrees |
| 8 | 29 | 95 | `src/components/kokonutui/spotlight-cards.tsx:L137-L165` | `src/components/ui/spotlight-cards.tsx:L113-L141` | Duplicate spotlight card subtrees |
| 9 | 28 | 178 | `src/app/api/ai/parse/route.ts:L11-L38` | `src/app/api/ai/synthesize-rubric/route.ts:L11-L37` | Duplicated auth + rate-limit + org budget boilerplate |
| 10 | 27 | 161 | `src/app/api/ai/generate/route.ts:L19-L45` | `src/app/api/ai/parse/route.ts:L12-L38` | Duplicated auth + rate-limit + org budget boilerplate |
| 21 | 17 | 107 | `functions/src/grading.ts:L229-L245` | `src/app/api/grade/route.ts:L103-L124` | Grading loop duplicated between API route and Cloud Function |

### Structural / Architectural Duplication in `workspace-preview-*.tsx` & Teacher/Student Pages (`raw/fallow-dupes.txt`)

Running `npx fallow dupes` (`raw/fallow-dupes.txt`, 0.04s) — which groups structural AST clones into families — detected **148 clone groups** and **26 multi-group clone families** totaling **4,866 duplicated lines (8.7% of the codebase)** across 71 files:
- **Grading logic duplication across 3 layers:**
  - 4 clone groups (55 lines) between `functions/src/grading.ts` and `src/app/api/grade/route.ts`
  - 2 clone groups (50 lines) between `functions/src/grading.ts` and `src/lib/ai/grading.ts`
  - 59-line clone (`scrubPII`) between `functions/src/grading.ts:L19-L58` and `src/lib/ai/utils.ts:L9-L67`
- **Marketing page clone family:** 5-way duplication across `src/app/demos/page.tsx`, `src/app/features/page.tsx`, `src/app/pricing/page.tsx`, `src/app/sustainability/page.tsx`, and `src/components/landing/LandingFooter.tsx`.
- **Auth page clone family:** 3 clone groups (66 lines) across `src/app/login/page.tsx` and `src/app/signup/page.tsx`, plus 4 internal clone groups (91 lines) inside `src/app/signup/page.tsx`.
- **Teacher page clone families:** Multiple shared clone groups across `src/app/teacher/assignments/page.tsx`, `src/app/teacher/grades/page.tsx`, `src/app/teacher/uploads/page.tsx`, and `src/app/teacher/students/page.tsx`.

Beyond AST clone families, `src/components/landing/workspace-preview-pages.tsx` (**2,793 lines**) and `src/components/landing/workspace-preview-tabs.tsx` (**2,259 lines**) — **5,052 lines combined** (9.1% of the entire repo) — re-implement bespoke interactive mock versions of the teacher portal (`GradebookPage`, `AssignmentsPage`, `CreateAssignmentPage`, `ResourcesPage`, `NetworkPage`, `StudentsPage`, `WaypointsPage`, `VaultPage`) instead of rendering shared presentational components with mock props.

### Git-Churn × Complexity Hotspots (`raw/fallow-health.txt`)

Running `npx fallow health --hotspots --targets --coverage-gaps` (`raw/fallow-health.txt`) identified **221 functions exceeding 60 LOC** (8% of all 2,785 functions in the repo) and ranked the top **Git-churn × complexity hotspots** over the last 6 months:
1. `src/app/api/auth/register/route.ts` — Hotspot score **31.8** (0.82 complexity density)
2. `src/app/teacher/create/page.tsx` — Hotspot score **28.0** (▲ accelerating: 11 commits, 1,769 lines churned)
3. `src/lib/usage-limit.ts` — Hotspot score **27.6** (7 commits, 0.39 density, 10 fan-in importers)
4. `src/lib/ai/config.ts` — Hotspot score **24.0** (6 commits, 0.39 density, 10 fan-in importers)
5. `src/components/teacher/network-students.tsx` — Hotspot score **21.7** (▲ accelerating: 7 commits, 810 lines churned)
6. `src/app/student/page-client.tsx` — Hotspot score **21.0** (9 commits, 932 lines churned)
7. `src/app/teacher/network/page.tsx` — Hotspot score **19.5** (▲ accelerating: 10 commits, 2,669 lines churned)
8. `src/app/student/assignment-view/page.tsx` — Hotspot score **19.1** (8 commits, 1,085 lines churned)

---

## A5. Dead Code Analysis (`raw/knip.json`, `raw/knip.txt`)

Cross-referencing `npx knip` with `rg` across the entire repository identified:

### 1. Unused Source Files in `src/` and Root (38 confirmed dead files)
*(Note: `knip` also listed 6 files in `functions/src/` and `jest.security.config.cjs` / `tools/migrate-school-security.cjs` because they are separate entrypoints outside Next.js; those are excluded from the dead-file count below.)*

- **Root scripts (unreferenced by any build/npm script):**
  - `check_portfolios.ts:L1-L16` — one-off Firestore inspection script at repo root.
  - `update_mermaid.py:L1-L84` — one-off Python script that overwrites `README.md`'s Mermaid diagram (note: hardcodes `"Google Gemini 3.8 Flash"` at `update_mermaid.py:L41`).
- **Deprecated AI barrel file (0 imports across repo):**
  - `src/lib/gemini.ts:L1-L76` — marked `@deprecated Use specific modules in src/lib/ai/ instead`; zero callers remain.
- **Unused Landing & Marketing Components (16 files, 0 imports):**
  - `src/components/landing/efficacy.tsx`
  - `src/components/landing/header.tsx` (superseded by `site-header.tsx`)
  - `src/components/landing/landing-cta.tsx`
  - `src/components/landing/LandingFooter.tsx` (superseded by `site-footer.tsx`)
  - `src/components/landing/layer-efficacy-chart.tsx`
  - `src/components/landing/logo-cloud.tsx`
  - `src/components/landing/MathematicalFidelity.tsx`
  - `src/components/landing/MissionControl.tsx`
  - `src/components/landing/pricing.tsx`
  - `src/components/landing/solution-flowchart.tsx`
  - `src/components/landing/system-demos.tsx`
  - `src/components/landing/TheChallenge.tsx`
  - `src/components/landing/waypoints-network.tsx`
  - `src/components/landing/workflow.tsx`
  - `src/components/feature-section.tsx`
  - `src/components/hero-section.tsx`
- **Unused UI / Globe / Hook Components (20 files, 0 imports):**
  - `src/components/cobe-globe.tsx`
  - `src/components/scorpio-globe.tsx`
  - `src/components/kokonutui/spotlight-cards.tsx`
  - `src/components/ui/spotlight-cards.tsx`
  - `src/components/theme-provider.tsx`
  - `src/components/ui/back-button.tsx`
  - `src/components/ui/card-3d.tsx`
  - `src/components/ui/chart.tsx`
  - `src/components/ui/constraint-engine.tsx`
  - `src/components/ui/container-scroll-animation.tsx`
  - `src/components/ui/crux-logo.tsx`
  - `src/components/ui/dot-flow.tsx`
  - `src/components/ui/floating-prompts.tsx`
  - `src/components/ui/form.tsx`
  - `src/components/ui/macbook-scroll.tsx`
  - `src/components/ui/separator.tsx`
  - `src/components/ui/sidebar.tsx` (726 lines; superseded by `src/components/motion/animated-sidebar.tsx`)
  - `src/components/ui/text-animate.tsx`
  - `src/components/ui/typing-animation.tsx`
  - `src/hooks/use-window-size.ts`
- **Cross-check with `src/app/demos/**`:**
  - `src/app/demos/page.tsx` and `src/app/demos/teacher/page.tsx` are active Next.js App Router pages linked from `site-header.tsx` and `demo-carousel.tsx`.
  - `src/app/demos/sticky-banner/page.tsx:L1-L26` is an unlinked component sandbox route (`/demos/sticky-banner`) with no inbound links in the app.
- **Notable Dead Exports Inside Active Files (71 total in `raw/knip.txt`, 63 in `raw/fallow-dead-code.txt`):**
  - `GradingTerminalView` (`src/components/landing/workspace-preview-pages.tsx:L116-L598`, 483 lines) and `AssignmentDetailsView` (`src/components/landing/workspace-preview-pages.tsx:L1088-L1270`, 183 lines) — **666 lines of dead component code** inside the largest file in the repo.
  - `signInWithGoogleForTeacher` (`src/lib/firebase.ts:L368`), `changePassword` (`src/lib/firebase.ts:L344`), `compressImage` (`src/lib/firebase.ts:L105`), `convertFilesToBase64` (`src/lib/firebase.ts:L255`).
  - `checkAndIncrementUsage` (`src/lib/usage-limit.ts:L100`).
- **Additional Workspace-Aware Findings from `npx fallow dead-code` (`raw/fallow-dead-code.txt`):**
  - **Orphaned Cloud Functions email template:** `functions/src/templates/GradeAvailableEmail.tsx:L1-L90` is completely unused because its call site in `functions/src/grading.ts:L289` is commented out (`// react: React.createElement(GradeAvailableEmail, {`).
  - **Invalid Next.js Client Component `metadata` export:** `src/components/admin/access-requests.tsx:L75-L78` declares `export const metadata: Metadata = { title: "Access Request • Scorpio", ... }` inside a `"use client"` component (`"use client"` at `L1`). Next.js App Router only reads `metadata` from Server Components (`page.tsx`/`layout.tsx`), so this export is dead and invalid.

---

## A6. Type Safety & Source-of-Truth Review (`raw/smells.txt`, `raw/server-any-lines.txt`)

Across `src/` and `functions/src/`, there are **104 explicit `any` annotations**, **24 `as any` assertions**, and **3 `@ts-ignore` comments** (total **131 type-safety suppressions**).

### Server & Core Library `any` / `as any` / `@ts-ignore` Inventory (`src/lib/**`, `src/app/api/**`, `functions/src/**`)

| Area / File | Count | Exact Lines & Evidence |
|---|---:|---|
| `src/lib/ai/config.ts` | 8 | `L14` (`request: any`), `L19` (`contents: any[]`), `L23` (`c: any`), `L31` (`payload: any`), `L87` (`p: any`), `L105` (`request: any`), `L106` (`options?: any`), `L126` (`} as any`) |
| `src/lib/ai/assignment.ts` | 9 | `L5` (`model: any`, `questions: any[]`), `L76` (`questions: any[]`), `L120` (`// @ts-ignore`), `L141` (`(err as any)`), `L147` (`parsedData: any`), `L194` (`(response as any)`), `L201` (`(err as any)`), `L224` (`questions: any[]`), `L233` (`allQuestions: any[]`) |
| `functions/src/grading.ts` | 5 | `L169` (`error: any`), `L178` (`submissionData: any`), `L221` (`q: any`), `L234` (`q: any`), `L308` (`submissionData: any`) |
| `src/lib/firebase-admin.ts` | 4 | `L47` (`e: any`), `L64` (`(service as any)[prop]`), `L74` (`(service as any)[prop]`), `L84` (`(FV as any)[prop]`) |
| `src/lib/ai/utils.ts` | 4 | `L75` (`// @ts-ignore`), `L125` (`data: any): any[]`), `L126` (`questions: any[]`), `L153` (`q: any`) |
| `src/lib/firebase.ts` | 3 | `L22` (`appCheck: any`), `L25` (`// @ts-ignore`), `L66` (`_genAI: any`) |
| `src/lib/assignment-parser.ts` | 3 | `L1` (`: any[]`), `L2` (`questions: any[]`), `L4` (`currentQuestion: any`) |
| `src/lib/ai/network.ts` | 2 | `L172` (`parsed: any`), `L201` (`masteryLevel as any`) |
| `src/lib/ai/grading.ts` | 1 | `L123` (`error: any`) |
| `src/lib/types.ts` | 1 | `L68` (`questions: any[]; // Consider more specific type later`) |
| `src/app/api/checkout/route.ts` | 3 | `L60` (`checkoutOptions: any`), `L82` (`polarError: any`), `L90` (`error: any`) |
| `src/app/api/chat/route.ts` | 3 | `L76` (`(chatbotConfig as any)`), `L77` (`(chatbotConfig as any)`), `L80` (`error: any`) |
| `src/app/api/teacher/network/portfolio/route.ts` | 2 | `L61` (`m: any`), `L110` (`error: any`) |
| `src/app/api/grade/route.ts` | 2 | `L108` (`q: any`), `L191` (`error: any`) |
| `src/app/api/chat/landing/route.ts` | 2 | `L73` (`visitorRef: any`), `L113` (`error: any`) |
| `src/app/api/admin/firestore/route.ts` | 2 | `L72` (`doc: any`), `L98` (`err: any`) |
| `src/app/api/auth/teacher-code/route.ts` | 2 | `L59` (`doc: any`), `L130` (`err: any`) |
| Other API routes (`parse`, `limits`, `synthesize-rubric`, `notebook/chat`, `request-access`, `github/stats`, `generate`) | 7 | 1 `any` each (catch clauses or `.map((d: any) => ...)`) |

### Is `src/lib/types.ts` the Single Source of Truth?

**No.** `src/lib/types.ts` (`81 lines`) defines only 5 interfaces (`UserPreferences`, `UserProfile`, `Organization`, `PhysicsAssignment`, `StudentPortfolio`), and two of those (`UserPreferences` at `L5`, `PhysicsAssignment` at `L60`) are **completely unused across the codebase** (`raw/knip.txt`). Instead, core domain entities are re-declared ad hoc with conflicting shapes across pages:
- `interface Assignment` is re-declared **5 separate times**:
  - `src/app/student/assignment-view/page.tsx:L53`
  - `src/app/student/assignments/page.tsx:L14`
  - `src/app/teacher/assignment-view/page.tsx:L18`
  - `src/app/teacher/submission/grade/page.tsx:L61`
  - `src/app/teacher/assignments/page.tsx:L21`
- `interface Submission` is re-declared **5 separate times**:
  - `src/app/teacher/assignment-view/page.tsx:L25`
  - `src/app/teacher/submission/grade/page.tsx:L48`
  - `src/app/student/grades/page.tsx:L24`
  - `src/app/student/submissions/page.tsx:L14`
  - `src/app/teacher/page-client.tsx:L22`
- `interface Question` is re-declared **4 separate times**:
  - `src/app/student/assignment-view/page.tsx:L44`
  - `src/app/teacher/submission/grade/page.tsx:L24`
  - `src/app/teacher/create/page.tsx:L54`
  - `src/components/landing/workspace-preview-data.ts:L152`
- `interface Course`, `Student`, `Resource`, `Formula`, `ChatMessage` are similarly duplicated across 2–4 page files each.

---

## A7. ESLint Configuration Permissiveness (`eslint.config.mjs`)

`eslint.config.mjs:L1-L20` only spreads `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript` without type-aware linting (`projectService: true`) or security/consistency plugins:
1. **No type-aware async safety rules:** `@typescript-eslint/no-floating-promises` and `@typescript-eslint/no-misused-promises` are not enabled, allowing unawaited Firestore writes or token fetches (e.g. `src/lib/firebase.ts:L47`) and async callbacks passed to void event handlers to go undetected.
2. **No consistent type import rules:** `@typescript-eslint/consistent-type-imports` is absent.
3. **No security plugin:** `eslint-plugin-security` is not installed.
4. **No complexity or file/function size guardrails:** Cyclomatic complexity up to 80 and 1,444-line functions pass `npm run lint` without warning.

---

## Standard Findings

### Finding `A-001`
| Field | Value |
|---|---|
| `id` | `A-001` |
| `severity` | `High` |
| `category` | `correctness` |
| `location` | `src/components/landing/workspace-preview-pages.tsx:L1642-L1658` |
| `evidence` | `useEffect` on line 1642 calls `setGradingRubric(initialDraft.gradingRubric)` 12 lines **before** `const [gradingRubric, setGradingRubric] = React.useState(...)` is declared on line 1654. Flagged by ESLint `react-hooks/immutability` (`raw/eslint.json`). Additionally, ESLint reports 441 total problems (246 errors, 195 warnings) including 2 `react-hooks/purity` errors (`src/components/landing/solution-flowchart.tsx:L326`, `src/components/ui/sidebar.tsx:L611`), 3 `react-hooks/refs` errors (`src/components/math-input.tsx:L487`, `src/components/motion/shared-layout-bg.tsx:L78`), 10 `react-hooks/set-state-in-effect` errors, and 14 `react-hooks/exhaustive-deps` warnings. |
| `impact` | Accessing `setGradingRubric` before its `const` declaration is in the Temporal Dead Zone and throws a `ReferenceError` if `initialDraft?.gradingRubric` is truthy when the effect runs. Impure render functions (`Math.random()`) and render-time ref access break React 19 / React Compiler memoization invariants and cause hydration mismatches. |
| `recommendation` | Move `const [gradingRubric, setGradingRubric] = React.useState(...)` above the `useEffect` in `src/components/landing/workspace-preview-pages.tsx:L1620`, fix the remaining React Hooks / Compiler errors (`react-hooks/purity`, `react-hooks/refs`, `react-hooks/set-state-in-effect`, `react-hooks/exhaustive-deps`), and gate CI on `npm run lint` exiting 0. |
| `effort` | `M` |
| `confidence` | `High` |

### Finding `A-002`
| Field | Value |
|---|---|
| `id` | `A-002` |
| `severity` | `Medium` |
| `category` | `maintainability` |
| `location` | `src/app/student/assignment-view/page.tsx:L78-L1675` |
| `evidence` | Cyclomatic complexity analysis (`raw/complexity-summary.txt`) found 79 functions with complexity > 15 and 73 functions > 150 lines. Top offenders: `AssignmentDetailContent` (`complexity=80`, 1,444 lines at `src/app/student/assignment-view/page.tsx:L78-L1675`), `NetworkPage` (`complexity=76`, 1,318 lines at `src/app/teacher/network/page.tsx:L83-L1495`), `handlePost` (`complexity=61` at `src/app/api/grade/route.ts:L8-L197`), `CreateAssignmentForm` (`complexity=59`, 989 lines at `src/app/teacher/create/page.tsx:L97-L1153`), and `gradeSubmission` (`complexity=49` at `functions/src/grading.ts:L178-L306`). |
| `impact` | God-functions combining Firestore queries, AI orchestration, form state, and deeply nested JSX (up to depth 6 in `src/lib/ai/assignment.ts:L176` and `src/lib/assignment-parser.ts:L51`) are error-prone to modify and nearly impossible to unit-test in isolation. |
| `recommendation` | Decompose page components > 300 lines into feature sub-components and custom data hooks (`useAssignmentDetail`, `useTeacherNetwork`), and split `handlePost` in `src/app/api/grade/route.ts` and `gradeSubmission` in `functions/src/grading.ts` into smaller single-responsibility helpers with complexity <= 15. |
| `effort` | `L` |
| `confidence` | `High` |

### Finding `A-003`
| Field | Value |
|---|---|
| `id` | `A-003` |
| `severity` | `Medium` |
| `category` | `maintainability` |
| `location` | `src/lib/ai/config.ts:L14-L126` |
| `evidence` | 131 type-safety suppressions across `src/` and `functions/src/` (104 `: any`/`any[]`, 24 `as any`, 3 `@ts-ignore`), including 55 in server/library code (`raw/server-any-lines.txt`). Notably, `src/lib/ai/config.ts:L14-L126` types its entire Gemini REST wrapper and exported `model` with `any` (`callGeminiDirect(request: any)`, `} as any`), `src/lib/ai/assignment.ts:L5-L233` returns `Promise<{ questions: any[] }>`, and `functions/src/grading.ts:L178,L308` types `submissionData: any`. Additionally, `@ts-ignore` is misused on unused variables at `src/lib/ai/assignment.ts:L120` and `src/lib/ai/utils.ts:L75`. |
| `impact` | Erases compile-time guarantees across the AI generation, parsing, and grading pipelines (`tsc --noEmit` passes with 0 errors only because critical payloads are typed as `any`). |
| `recommendation` | Replace `any` in `src/lib/ai/config.ts`, `src/lib/ai/assignment.ts`, `src/lib/ai/utils.ts`, and `functions/src/grading.ts` with strongly typed request/response interfaces (`GenerateContentRequest`, `Question`, `SubmissionRecord`), and remove the 3 `@ts-ignore` directives. |
| `effort` | `M` |
| `confidence` | `High` |

### Finding `A-004`
| Field | Value |
|---|---|
| `id` | `A-004` |
| `severity` | `Medium` |
| `category` | `maintainability` |
| `location` | `src/lib/types.ts:L1-L81` |
| `evidence` | `src/lib/types.ts:L60-L70` defines `PhysicsAssignment` (with `questions: any[]` on L68), which is never imported anywhere (`raw/knip.txt`). Instead, `interface Assignment` is re-declared 5 times (`src/app/student/assignment-view/page.tsx:L53`, `src/app/student/assignments/page.tsx:L14`, `src/app/teacher/assignment-view/page.tsx:L18`, `src/app/teacher/submission/grade/page.tsx:L61`, `src/app/teacher/assignments/page.tsx:L21`), `Submission` 5 times, and `Question` 4 times. |
| `impact` | Schema changes to assignments, questions, or submissions require hunting down 4–5 local interface definitions per entity, leading to silent field drift between teacher and student views. |
| `recommendation` | Consolidate canonical `Assignment`, `Question`, `Submission`, `Course`, `Notebook`, and `Resource` types into `src/lib/types.ts` and import them across all pages, API routes, and Cloud Functions. |
| `effort` | `M` |
| `confidence` | `High` |

### Finding `A-005`
| Field | Value |
|---|---|
| `id` | `A-005` |
| `severity` | `Medium` |
| `category` | `maintainability` |
| `location` | `src/components/landing/workspace-preview-pages.tsx:L1-L2793` |
| `evidence` | `jscpd` (`raw/jscpd-summary.txt`) detected 64 clone pairs (1,121 lines), including `functions/src/grading.ts:L19-L59` vs `src/lib/ai/utils.ts:L9-L68` (`scrubPII` duplicated verbatim), `src/components/kokonutui/spotlight-cards.tsx:L76-L136` vs `src/components/ui/spotlight-cards.tsx:L52-L112`, and API route auth/budget boilerplate across `src/app/api/ai/*/route.ts`. Furthermore, `workspace-preview-pages.tsx` (2,793 lines) and `workspace-preview-tabs.tsx` (2,259 lines) duplicate the UI of 8 teacher portal pages across 5,052 lines, including 666 lines of unused exported components (`GradingTerminalView` at `L116-L598` and `AssignmentDetailsView` at `L1088-L1270`). |
| `impact` | UI or business-logic changes (such as PII scrubbing rules or teacher workspace layouts) must be maintained in multiple places and have already drifted. |
| `recommendation` | Delete the unused `GradingTerminalView` and `AssignmentDetailsView` exports in `workspace-preview-pages.tsx`, extract a shared API middleware helper for `src/app/api/ai/*`, and share presentational components between `src/app/teacher/**` and the landing workspace preview. |
| `effort` | `L` |
| `confidence` | `High` |

### Finding `A-006`
| Field | Value |
|---|---|
| `id` | `A-006` |
| `severity` | `Low` |
| `category` | `maintainability` |
| `location` | `src/lib/gemini.ts:L1-L76` |
| `evidence` | `npx knip` (`raw/knip.txt`) identified 38 unused files in `src/` and root, plus 71 unused value exports and 12 unused type exports. Unused files include `src/lib/gemini.ts`, `check_portfolios.ts`, 16 landing components (`src/components/landing/header.tsx`, `LandingFooter.tsx`, `pricing.tsx`, `workflow.tsx`, `efficacy.tsx`, etc.), and 20 UI/globe components (`src/components/ui/sidebar.tsx` [726 lines], `cobe-globe.tsx`, `scorpio-globe.tsx`, `kokonutui/spotlight-cards.tsx`, etc.). |
| `impact` | Thousands of lines of dead code inflate repository size, slow down static analysis/linting (many ESLint errors are inside dead files like `ui/sidebar.tsx` and `landing/solution-flowchart.tsx`), and confuse contributors. |
| `recommendation` | Remove the 38 confirmed unused files (starting with `src/lib/gemini.ts`, `check_portfolios.ts`, `update_mermaid.py`, and superseded landing/UI components) and prune the 71 unused exports. |
| `effort` | `S` |
| `confidence` | `High` |

### Finding `A-007`
| Field | Value |
|---|---|
| `id` | `A-007` |
| `severity` | `Low` |
| `category` | `devex` |
| `location` | `tsconfig.json:L39-L45` |
| `evidence` | Root `tsconfig.json:L41` excludes `"functions"` and `"scripts"` (non-existent), while root `package.json` has no `typecheck` script and never type-checks `functions/`. Additionally, `tsconfig.json` lacks `noUnusedLocals`, `noUnusedParameters`, and `noImplicitReturns` (which are enabled in `functions/tsconfig.json:L5-L6`). |
| `impact` | Type errors in `functions/src/**` are invisible to root builds/typechecks unless a developer manually cds into `functions/`. Unused locals in `src/` pass `tsc` silently. |
| `recommendation` | Add `"typecheck": "tsc --noEmit && npm --prefix functions run build -- --noEmit"` to root `package.json`, enable `noImplicitReturns: true` in root `tsconfig.json`, and replace the stale `"scripts"` exclusion with `"tools"`. |
| `effort` | `S` |
| `confidence` | `High` |

### Finding `A-008`
| Field | Value |
|---|---|
| `id` | `A-008` |
| `severity` | `Low` |
| `category` | `devex` |
| `location` | `eslint.config.mjs:L1-L20` |
| `evidence` | `eslint.config.mjs` only includes `next/core-web-vitals` and `next/typescript`. It does not enable type-aware promise rules (`@typescript-eslint/no-floating-promises`, `@typescript-eslint/no-misused-promises`), `@typescript-eslint/consistent-type-imports`, `eslint-plugin-security`, or complexity thresholds. |
| `impact` | Unawaited promises, misused async callbacks on DOM events, and extreme function complexity (> 50) are not caught by linting. |
| `recommendation` | Extend `eslint.config.mjs` with `projectService: true` for `@typescript-eslint/no-floating-promises` and `@typescript-eslint/no-misused-promises`, add `@typescript-eslint/consistent-type-imports`, `eslint-plugin-security`, and `complexity: ["warn", 20]`. |
| `effort` | `S` |
| `confidence` | `High` |

---

## Workstream A Score

**Score: 2.5 / 5 (rounded to 3 — Acceptable with notable debt)**

**Justification:**  
Both `tsc --noEmit` (root and `functions/`) and `next build` pass cleanly with `strict: true`, and there are zero `TODO`/`FIXME`/`HACK` markers. However, `npx eslint .` fails with **441 problems (246 errors, 195 warnings)**—including a real Temporal Dead Zone bug (`A-001`), React Compiler purity/ref violations, 131 `any`/`as any`/`@ts-ignore` escapes across core AI/server modules (`A-003`), extreme function complexity up to 80 in 1,400-line page components (`A-002`), 5× re-declared domain interfaces (`A-004`), and 38 dead files (`A-006`).
