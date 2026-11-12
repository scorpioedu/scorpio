# Workstream H: Frontend / React Quality

Read-only audit, 2026-11-11. Evidence: `raw/eslint.json`, `raw/eslint-bug-rules.txt`, `raw/dep-usage-check.txt`, source inspection.

## Task checklist
- [x] **H1** Server vs client: 32/45 pages and 105/129 components are "use client"; split pattern used on 2 routes only (H-008).
- [x] **H2** Hooks: 14 exhaustive-deps, 10 set-state-in-effect. All 11 `onSnapshot` call sites reviewed: 10 return an unsubscribe in cleanup (auth-context, tutor x2, submissions, notebook user doc, notebook list, notebook doc, department-banner, use-department-plan, usage-analytics); **1 leaks on a race** (notebook org listener, H-001). Effects deriving state: H-005.
- [x] **H3** React Compiler: enabled (`next.config.mjs:3`), plugin 1.0.0, no opt-outs; 7 rule violations (2 purity, 3 refs, 2 immutability) make components bail out silently (H-006, H-007, H-016).
- [x] **H4** Forms: react-hook-form only via an unused `ui/form.tsx`; zod has 0 imports in `src/`; no shared client/server schemas (H-010).
- [x] **H5** UI hygiene: framer-motion (54 files) + motion (8 files) both used; duplicate spotlight-cards; radix umbrella vs individual packages (H-009, H-011).
- [x] **H6** Styling: UIAUDIT "COMPLETED" claim verified (only 2 translucent `dark:bg-white/3` hits, not violations); primary-colour documentation drift (H-015).
- [x] **H7** Boundaries/states: only 3 error/loading/not-found files in the whole app tree (H-013).

## Findings
### H-001 - Organization onSnapshot listener can leak when effect cleans up before getDoc resolves
- **Severity:** Medium | **Category:** correctness | **Effort:** S | **Confidence:** High
- **Location:** `src/app/student/notebook/page.tsx:L150-L200`
- **Evidence:** L155 `onSnapshot(doc(db,'organizations',orgId),...)` is created inside async fetchOrgSettings after `await getDoc(...)`; its unsubscribe is stored via `orgPromise.then(unsub => { orgUnsubscribe = unsub })` (L180-L181). Cleanup at L197-L200 runs `if (orgUnsubscribe) orgUnsubscribe()`; if the user navigates away or `user` changes before the promise resolves, orgUnsubscribe is undefined and the listener is never removed. Also the notebooks listener (L183) writes migration docs (setDoc L190-L209) from inside the snapshot callback with no in-flight guard.
- **Impact:** Leaked Firestore listener per navigation race (reads billed, setState on unmounted component, duplicate "Initial Notebook" docs possible if snapshot fires twice before the first setDoc lands).
- **Recommendation:** Use a `cancelled` flag + collect unsubscribers in an array pushed synchronously; move org subscription to useDepartmentPlan() (already exists) and move first-notebook creation to an idempotent server action/doc with deterministic id (notebooks/{uid}_default).

### H-002 - Timer effect calls handleSubmit with missing dependency and re-creates interval every second
- **Severity:** Medium | **Category:** correctness | **Effort:** S | **Confidence:** Medium
- **Location:** `src/app/student/assignment-view/page.tsx:L329-L359`
- **Evidence:** eslint react-hooks/exhaustive-deps at page.tsx:L359: missing dependency 'handleSubmit'. The effect deps are [timerActive, timeLeft, inGracePeriod, assignment] so it tears down/recreates setInterval each tick; auto-submit at L339 and L346 uses whichever handleSubmit closure existed at the last timeLeft change.
- **Impact:** Auto-submit on timer expiry might submit answers captured one render stale if answers changed in the same tick (low likelihood, high consequence for graded work). Also wasteful.
- **Recommendation:** Keep `answers` in a ref (or useEffectEvent) and run one interval keyed on [timerActive]; trigger submit from a separate effect on timeLeft===0.

### H-003 - Missing hook deps in notebook auto-save/sync effects
- **Severity:** Medium | **Category:** correctness | **Effort:** M | **Confidence:** Medium
- **Location:** `src/app/student/notebook/page.tsx:L238-L274`
- **Evidence:** exhaustive-deps: L238 missing activeNotebookId, L263 missing user, L274 missing saveNotebook. Auto-save effect (L266-L274) captures saveNotebook from the render when [hasUnsavedChanges, content, title] last changed. The remote-sync listener (L245) depends on hasUnsavedChanges so it re-subscribes every time typing starts/stops.
- **Impact:** Stale saves possible (saves old notebook id after quick tab switch) and listener churn costs extra Firestore reads on every edit burst.
- **Recommendation:** Use refs for latest values; split subscription (deps: activeNotebookId) from the unsaved-changes guard (ref).

### H-004 - 14 total react-hooks/exhaustive-deps warnings (demo-carousel 3, notebook 3, others 8)
- **Severity:** Low | **Category:** maintainability | **Effort:** M | **Confidence:** High
- **Location:** `src/components/demo-carousel.tsx:L40-L107`
- **Evidence:** raw/eslint.json counts: exhaustive-deps 14, set-state-in-effect 10, refs 3, purity 2, immutability 2. Files: student/submissions L84, teacher/assignments L61, teacher/network/billing L43, teacher/network L370, teacher/uploads L52, teacher/waypoints L68, admin/ai-cost-calculator L61, demo-carousel L47/L81/L107. Most are fetchX functions defined in component body and omitted from deps (fetch-on-mount pattern).
- **Impact:** Stale closures and, with React Compiler, components that violate rules are skipped from auto-optimization.
- **Recommendation:** Wrap fetchers in useCallback or define inside the effect; add `react-hooks` rules as errors in CI.

### H-005 - 10 set-state-in-effect violations (state derived/synced in effects)
- **Severity:** Medium | **Category:** maintainability | **Effort:** M | **Confidence:** High
- **Location:** `src/components/motion/animated-sidebar.tsx:L336-L340`
- **Evidence:** react-hooks/set-state-in-effect at: animated-sidebar.tsx L336,L340; usage-analytics.tsx L83; route-progress-bar.tsx L14; scorpio-globe.tsx L14; macbook-scroll.tsx L47; smart-datetime-picker.tsx L46 (derives `date` from initialValue); space-background.tsx L20; typing-animation.tsx L109; hooks/use-sidebar-state.ts L17 (reads localStorage then setIsCollapsedState + setIsLoaded). Many are the `useEffect(()=>setMounted(true),[])` hydration idiom.
- **Impact:** Extra render passes and flash of wrong state (sidebar collapsed state flickers after hydration). Derived state in smart-datetime-picker can overwrite user typing.
- **Recommendation:** Use useSyncExternalStore for localStorage/matchMedia, derive state during render, or key the component on initialValue.

### H-006 - Impure Math.random in render and refs read during render
- **Severity:** Medium | **Category:** correctness | **Effort:** S | **Confidence:** High
- **Location:** `src/components/ui/sidebar.tsx:L609-L611`
- **Evidence:** react-hooks/purity: ui/sidebar.tsx:L611 `useMemo(() => `${Math.floor(Math.random()*40)+50}%`, [])` (SidebarMenuSkeleton; shadcn upstream code); landing/solution-flowchart.tsx:L326 `duration: 1.5 + Math.random()` in JSX. react-hooks/refs: math-input.tsx:L487 (x2) and motion/shared-layout-bg.tsx:L78 read refs during render; animated-sidebar.tsx:L612 mutates forwarded ref value in a ref callback (react-hooks/immutability).
- **Impact:** SSR/CSR hydration mismatches (random widths/durations differ between server HTML and client) and React Compiler skips these components (compiler enabled at next.config.mjs:L3).
- **Recommendation:** Generate random values in useState initializer behind useEffect/useId-seeded PRNG; read refs only in effects/handlers.

### H-007 - setGradingRubric referenced above its useState declaration (React Compiler bail-out, not a runtime TDZ)
- **Severity:** Low | **Category:** correctness | **Effort:** S | **Confidence:** Medium
- **Location:** `src/components/landing/workspace-preview-pages.tsx:L1642-L1654`
- **Evidence:** react-hooks/immutability "Cannot access variable before it is declared" at L1642: the effect (L1620-L1646) calls setGradingRubric which is declared at L1654. Effect callbacks run after render, by which point the const is initialised, so no ReferenceError occurs at runtime. A-001 claims a TDZ ReferenceError; I disagree (Medium confidence) - the real impact is the Compiler skipping this ~900-line component.
- **Impact:** Component is excluded from compiler memoization; ordering is fragile.
- **Recommendation:** Move the useState above the effect.

### H-008 - Most pages are monolithic client components; server components under-used
- **Severity:** Medium | **Category:** maintainability | **Effort:** L | **Confidence:** Medium
- **Location:** `src/app/student/assignment-view/page.tsx:L1`
- **Evidence:** 45 page.tsx files: 32 "use client", 13 server (join/*, student/page.tsx, teacher/page.tsx, (docs)/*, demos/*, page.tsx). 105 of 129 components are "use client". The server/client split pattern (teacher/page.tsx -> page-client.tsx 553 lines; student/page.tsx -> page-client.tsx 545 lines) is used for only 2 routes; marketing pages (features 682 lines, pricing, sustainability, signup, login, forgot-password, request-access) are fully client-side only due to framer-motion usage.
- **Impact:** Larger JS payloads, no streaming/SSR data for authenticated pages (they all wait for AuthProvider + client Firestore), poorer LCP.
- **Recommendation:** Make features/pricing/sustainability server components with small client motion islands; keep data pages client-side until a server data layer (B-005) exists.

### H-009 - Two animation libraries (framer-motion in 54 files, motion in 8) bundled together
- **Severity:** Medium | **Category:** deps | **Effort:** S | **Confidence:** High
- **Location:** `package.json:L61-L66`
- **Evidence:** rg: `from "framer-motion"` 54 files; `from "motion/react"` 8 files (animated-sidebar, shared-layout-bg, typing-animation, text-animate, macbook-scroll, container-scroll-animation, sticky-banner, kokonutui/spotlight-cards). Same package family (motion v12 is the renamed framer-motion v12); both listed: framer-motion ^12.23.25, motion ^12.38.0. Exact duplicate of component: ui/spotlight-cards.tsx (framer-motion, L52-L112) vs kokonutui/spotlight-cards.tsx (motion/react, L76-L136) - 61 lines identical.
- **Impact:** Two copies of motion runtime can ship in the client bundle (~30-50 KB gz extra, unverified) and hooks/context (MotionConfig, LayoutGroup) do not interoperate across the two.
- **Recommendation:** Standardise on `motion/react`: codemod imports in 54 files, remove framer-motion, delete one spotlight-cards.

### H-010 - react-hook-form/zod forms not used; validation is hand-rolled
- **Severity:** Low | **Category:** maintainability | **Effort:** M | **Confidence:** High
- **Location:** `src/components/ui/form.tsx:L1`
- **Evidence:** react-hook-form and @hookform/resolvers referenced only by components/ui/form.tsx (0 callers; knip lists @hookform/resolvers unused). `from "zod"` appears in 0 files under src/ although zod ^4.1.13 is a dependency; login/signup/request-access/create assignment use manual useState validation. Client and server schemas are therefore not shared (server routes also validate manually - see G workstream).
- **Impact:** Inconsistent validation messages; client-side rules can drift from server rules; 3 unused deps ship in node_modules.
- **Recommendation:** Introduce src/lib/schemas/*.ts (zod) used by API routes and, via zodResolver, by signup/login/create-assignment forms; or drop the unused deps.

### H-011 - UI primitives duplicated across components/ui, kokonutui, prompt-kit; radix imported two ways
- **Severity:** Low | **Category:** maintainability | **Effort:** S | **Confidence:** Medium
- **Location:** `src/components/kokonutui/spotlight-cards.tsx:L76-L136`
- **Evidence:** Spotlight cards duplicated (see above). `radix-ui` meta-package imported in 3 files while 13 files import individual @radix-ui/* packages (dialog, select, tabs, tooltip, etc.); package.json lists both `radix-ui` ^1.4.3 and @radix-ui/react-*. @radix-ui/react-icons and @lucide/lab unused per dep-usage-check.
- **Impact:** Duplicate Radix copies are deduped by npm only if versions align; mixed import style confuses contributors.
- **Recommendation:** Pick `radix-ui` umbrella (shadcn current) and migrate 13 imports; delete kokonutui duplicate.

### H-012 - React Compiler is enabled; no opt-outs
- **Severity:** Info | **Category:** maintainability | **Effort:** S | **Confidence:** High
- **Location:** `next.config.mjs:L3`
- **Evidence:** next.config.mjs:3 `reactCompiler: true`; babel-plugin-react-compiler 1.0.0 in devDependencies (package.json:L106); no "use no memo" directives (rg = 0). Compiler-violations listed in findings H-005..H-007 mean those components silently skip optimization.
- **Impact:** Positive: enabled correctly. Risk: silent bail-outs.
- **Recommendation:** Add `compilationMode`/panicThreshold or run eslint react-hooks rules as errors to surface bail-outs.

### H-013 - Missing route-level error/loading boundaries
- **Severity:** Medium | **Category:** correctness | **Effort:** S | **Confidence:** High
- **Location:** `src/app`
- **Evidence:** find src/app -name error.tsx|loading.tsx|not-found.tsx|global-error.tsx: only join/error.tsx, demos/teacher/loading.tsx and app/not-found.tsx. No app/error.tsx, no global-error.tsx, none for student/, teacher/, admin/. No class ErrorBoundary / componentDidCatch anywhere in src.
- **Impact:** An uncaught render error on any teacher/student page (all are heavy client pages) shows the Next default error or blank screen and loses unsaved state; no skeleton during route transitions.
- **Recommendation:** Add app/error.tsx, app/global-error.tsx, student/error.tsx, teacher/error.tsx (with reset + report) and loading.tsx skeletons for student/ and teacher/.

### H-014 - onSnapshot callback does an N+1 getDoc per submission on every snapshot
- **Severity:** Low | **Category:** performance | **Effort:** S | **Confidence:** High
- **Location:** `src/app/student/submissions/page.tsx:L36-L60`
- **Evidence:** L36 onSnapshot(q, async ...) -> Promise.all(snapshot.docs.map(... await getDoc(doc(db,"assignments",data.assignmentId)))) for each submission each time any submission changes (comment: "Cache these maybe?"). Also profile.courseId/teacherId missing from deps (L84).
- **Impact:** Read amplification (N reads per snapshot) and out-of-order async results overwriting newer state.
- **Recommendation:** Cache assignments by id in a Map ref, or denormalize assignmentTitle on the submission; ignore stale snapshots with a sequence counter.

### H-015 - Lazy useState initialiser reads localStorage -> hydration mismatch
- **Severity:** Low | **Category:** correctness | **Effort:** S | **Confidence:** Medium
- **Location:** `src/components/department-banner.tsx:L30-L41`
- **Evidence:** useState(() => { if (typeof window === 'undefined') return false; localStorage.getItem(SNOOZE_KEY) ... }) - server renders not-snoozed, client first render may be snoozed. Same duplicated org onSnapshot also in hooks/use-department-plan.ts:L27 (two listeners on the same org doc per page when both used).
- **Impact:** React hydration warning and banner flash; duplicate listener reads.
- **Recommendation:** Initialise false and read localStorage in an effect (or useSyncExternalStore); have DepartmentBanner consume useDepartmentPlan().

### H-016 - UIAUDIT "COMPLETED" styling claims verified for the dark:bg-white / dark:text-black pattern; theme token drift remains
- **Severity:** Info | **Category:** maintainability | **Effort:** S | **Confidence:** High
- **Location:** `docs/teacher-ui-style.md`
- **Evidence:** rg "dark:bg-white|dark:text-black|bg-zinc-900 dark:bg-white" src -> 2 hits, both translucent (`dark:bg-white/3`, ui/spotlight-cards.tsx:117 and kokonutui/spotlight-cards.tsx:141) - not violations. However UIAUDIT.MD says primary is electric royal blue oklch(0.6203 0.1952 253.75) while globals.css:145 :root --primary is purple oklch(0.5393 0.2713 286.75) (blue only via .theme-blue at globals.css:324).
- **Impact:** Docs describe a palette that is not the default.
- **Recommendation:** Update UIAUDIT.MD or the default theme.

## Score: **3 / 5**
Listener hygiene is mostly good (10 of 11 correct, careful `disposed` guard in the auth context) and the Compiler is enabled. Debt: 14+10 hook-rule errors, two animation libraries, almost no error boundaries, monolithic client pages, unused form/validation stack. Counts: 0 Critical, 0 High, 8 Medium, 6 Low, 2 Info. Cross-ref: H-007 disagrees with A-001's "TDZ ReferenceError" claim (effect callbacks run after declaration), downgrade suggested to Low.
