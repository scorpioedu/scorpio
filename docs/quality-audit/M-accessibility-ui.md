# Workstream M: Accessibility and UI Quality

Read-only audit, 2026-11-11. Evidence: `raw/jsx-a11y.json`, `raw/jsx-a11y-summary.txt`, `raw/contrast.txt`.

## Task checklist
- [x] **M1** Static a11y: temp flat config (`tmp/a11y.eslint.config.mjs`, deleted) with `eslint-plugin-jsx-a11y` recommended rules over `src/`: **40 messages**: no-autofocus 15, label-has-associated-control 9, click-events-have-key-events 3, no-static-element-interactions 3, media-has-caption 2, no-noninteractive-tabindex 2, heading-has-content 1, anchor-has-content 1, anchor-is-valid 1, no-redundant-roles 1, plus 2 exhaustive-deps. Top files: math-builder-modal 10, workspace-preview-pages 7. (M-001..M-003, M-006, M-007, M-012)
- [ ] **M2** Runtime axe/Lighthouse: **not run**. `@axe-core/cli`/`lighthouse` are not installed, need a downloaded Chromium plus a running `next start` with Firebase config (which I did not want to boot against real services). Recommend running against `npm run start` with emulators.
- [x] **M3** Keyboard/focus: only 1 `<div onClick>` by regex (+5 from lint); 4 custom overlays without dialog semantics (M-004).
- [x] **M4** Math a11y: KaTeX default MathML output is retained; MathLive unused; math-input labelling unverified (M-008).
- [x] **M5** Contrast: computed from the oklch tokens in `globals.css` (`raw/contrast.txt`):

| Pair | Ratio | AA (4.5) |
|---|---|---|
| light: primary-foreground on primary | 5.82 | pass |
| dark: primary-foreground on primary | 4.13 | **fail** for small text |
| light/dark: muted-foreground on background | 7.68 / 6.59 | pass |
| dark: muted-foreground on card | 6.00 | pass |
| light: white on destructive | 3.85 | **fail** |
| dark: white on destructive (before `/60` alpha) | 2.77 | **fail** |
| dark: primary as text on background | 4.17 | **fail** |

- [ ] **M6** Responsiveness at 375/768px: **not run** (no browser tooling). Static proxy only: 107 files use responsive breakpoints; wide tables in teacher/grades and teacher/students need manual checks (M-011).

## Findings
### M-001 - 15 autoFocus usages incl. 10 in the math builder modal
- **Severity:** Medium | **Category:** a11y | **Effort:** S | **Confidence:** High
- **Location:** `src/components/math-builder-modal.tsx:L68-L259`
- **Evidence:** jsx-a11y/no-autofocus: math-builder-modal.tsx L68,L213,L220,L226,L233,L238,L243,L248,L253,L259; admin/page.tsx:L88; student/notebook/page.tsx:L604; student/tutor/page.tsx:L863,L918; teacher/network/page.tsx:L530 (raw/jsx-a11y.json).
- **Impact:** Moves focus unexpectedly for screen-reader users; in math-builder 9 separate autoFocus props suggest several inputs compete for focus.
- **Recommendation:** Keep one deliberate focus target per dialog (Radix Dialog already focuses first element); remove the rest.

### M-002 - 9 form labels not associated with controls
- **Severity:** Medium | **Category:** a11y | **Effort:** S | **Confidence:** High
- **Location:** `src/components/landing/workspace-preview-pages.tsx:L873`
- **Evidence:** jsx-a11y/label-has-associated-control: workspace-preview-pages.tsx L873,L898,L1369,L1388,L1404,L2334,L2347; navigation-chatbot.tsx L628,L654.
- **Impact:** Screen readers announce unlabeled inputs; clicking label does not focus control. navigation-chatbot is a real, global widget.
- **Recommendation:** Add htmlFor/id pairs or wrap control in <label>; for navigation-chatbot fix first.

### M-003 - Clickable <div> without role/keyboard support (and 2 more)
- **Severity:** Medium | **Category:** a11y | **Effort:** S | **Confidence:** High
- **Location:** `src/components/calculator/scientific-calculator.tsx:L211`
- **Evidence:** jsx-a11y click-events-have-key-events x3 and no-static-element-interactions x3; rg "<div[^>]*onClick" finds scientific-calculator.tsx:211 `<div ... cursor-pointer onClick={() => setIsMinimized(false)}>` (Minimized bar). Other hits: admin/access-requests.tsx (2), roster-import.tsx (2), navigation-chatbot.tsx (2), tutor page (2) are from the lint report.
- **Impact:** Keyboard and AT users cannot restore the minimized calculator.
- **Recommendation:** Use <button type="button"> (or role="button" tabIndex=0 + onKeyDown).

### M-004 - Custom drawers/overlays without dialog semantics, focus trap or Escape handling
- **Severity:** Medium | **Category:** a11y | **Effort:** M | **Confidence:** Medium
- **Location:** `src/app/student/assignment-view/page.tsx:L1530-L1545`
- **Evidence:** Hand-rolled overlays: assignment-view mobile AI helper drawer (fixed inset-0 backdrop L1536 + fixed panel L1540, motion.div onClick closes), notebook full-screen editor (notebook/page.tsx:L466 `fixed inset-0 z-[100]`), navigation-chatbot.tsx:L384 expanded panel, animated-sidebar.tsx:L405 mobile backdrop. Only landing-chatbot.tsx:L335 sets role="dialog" and Escape handler (L338); `rg aria-modal|role="dialog"` shows none for the others.
- **Impact:** Keyboard focus can tab behind the drawer; Escape does not close; screen readers are not told a modal opened.
- **Recommendation:** Rebuild with Radix Dialog/Sheet (already in components/ui/sheet.tsx) or add role=dialog aria-modal, focus trap and Escape.

### M-005 - Destructive button contrast below WCAG AA, especially in dark mode
- **Severity:** Medium | **Category:** a11y | **Effort:** S | **Confidence:** Medium
- **Location:** `src/components/ui/button.tsx:L14`
- **Evidence:** Computed from oklch tokens (raw/contrast.txt): destructive bg + white text = 3.85:1 light, 2.77:1 dark; and button.tsx:L14 additionally applies dark:bg-destructive/60 in dark mode (lower still). Primary button white-on-primary = 5.82:1 light but 4.13:1 dark (--primary oklch(0.6132 0.2294 291.74)); primary as text on dark background 4.17:1. Muted foreground passes (7.68 light / 6.59 dark).
- **Impact:** text-sm buttons need 4.5:1; destructive actions (delete, remove student) are hard to read for low-vision users.
- **Recommendation:** Darken --destructive (light ~L0.55) and drop /60 in dark; lower dark --primary lightness to ~0.56 or use dark --primary-foreground.

### M-006 - <video> elements without captions track
- **Severity:** Low | **Category:** a11y | **Effort:** S | **Confidence:** High
- **Location:** `src/components/landing/system-demos.tsx:L51`
- **Evidence:** jsx-a11y/media-has-caption: demos/page.tsx:L74 and landing/system-demos.tsx:L51. public/ has scorpio-demo*.mp4.
- **Impact:** Deaf users cannot access product demo content; WCAG 1.2.2.
- **Recommendation:** Add <track kind="captions"> VTT or transcript.

### M-007 - Empty heading, redundant role, empty/invalid anchors
- **Severity:** Low | **Category:** a11y | **Effort:** S | **Confidence:** Medium
- **Location:** `src/components/feature-section.tsx:L123`
- **Evidence:** heading-has-content feature-section.tsx:L123; no-redundant-roles landing/classroom-bento.tsx:L32; anchor-has-content markdown-renderer.tsx:L51 (react-markdown <a {...props}/> with children from props - false-positive likely); anchor-is-valid sticky-banner-demo.tsx:L11; no-noninteractive-tabindex app-sidebar.tsx:L108 and landing/workspace-preview.tsx:L373.
- **Impact:** Minor SR noise; one empty heading is announced as blank.
- **Recommendation:** Fix individually (S each); suppress markdown-renderer false positive with a comment.

### M-008 - Math rendering: KaTeX default output includes MathML; MathLive not in use
- **Severity:** Info | **Category:** a11y | **Effort:** S | **Confidence:** Low
- **Location:** `src/components/markdown-renderer.tsx:L8-L29`
- **Evidence:** markdown-renderer.tsx:8,29 use rehype-katex with katex.min.css and default `output: "htmlAndMathml"` (no override), so KaTeX emits an aria-hidden HTML tree plus screen-reader MathML. mathlive and mathjs are listed in knip as unused; math-input.tsx is a custom editor. Not verified with a screen reader.
- **Impact:** Positive; SR users get MathML. Custom math-input.tsx (521 lines) editing UI likely has no accessible name for equation fields (not verified).
- **Recommendation:** Add aria-label on math inputs and aria-live preview; test with VoiceOver.

### M-009 - Reduced-motion support is partial: 54 framer-motion files with no MotionConfig reducedMotion
- **Severity:** Low | **Category:** a11y | **Effort:** S | **Confidence:** High
- **Location:** `src/components/landing/site-header.tsx:L298`
- **Evidence:** prefers-reduced-motion/motion-reduce handled in 7 places (page.tsx, site-header L298/L365/L341, LandingHero, space-background L19, home-interactions L14, home-reveal.module.css L1). `rg MotionConfig src` = 0; 62 files use framer-motion/motion with infinite animations (e.g. solution-flowchart.tsx:L326 repeat: Infinity; floating-prompts).
- **Impact:** Vestibular-sensitive users still get looping animations (WCAG 2.3.3).
- **Recommendation:** Wrap layout in <MotionConfig reducedMotion="user"> once in app/layout.tsx.

### M-010 - Tiny text and untested responsive layouts
- **Severity:** Low | **Category:** a11y | **Effort:** M | **Confidence:** Low
- **Location:** `src/app/layout.tsx:L134-L147`
- **Evidence:** viewport allows zoom (maximumScale 5, layout.tsx:L137; html lang="en" L147 - good). But 449 occurrences of text-[9px|10px|11px] and 105 of text-muted-foreground/NN (reduced alpha - contrast not computed). Large tables: teacher/grades/page.tsx (13 table elements), teacher/students/page.tsx (11); responsive breakpoints used in 107 files. M6 not executed at 375/768px (no browser available, see report).
- **Impact:** Text under 12px fails readability guidance; alpha-reduced muted text may drop below 4.5:1.
- **Recommendation:** Set a 12px floor token; audit /50-/70 alpha usage; run Playwright screenshots at 375/768.

### M-011 - 67 `size="icon"` buttons on lines without aria-label/sr-only (needs manual verification)
- **Severity:** Low | **Category:** a11y | **Effort:** M | **Confidence:** Low
- **Location:** `src/components`
- **Evidence:** rg size="icon" lines lacking aria-label|sr-only in same line = 67 (multi-line JSX makes this an upper bound); jsx-a11y button-has-content-like rules gave 0 errors so many are likely labelled on adjacent lines. aria-* attributes total 356, role= 39, sr-only 22, live regions 28.
- **Impact:** Icon-only buttons without names are unusable with a screen reader.
- **Recommendation:** Run axe on authenticated pages with emulator; add eslint rule jsx-a11y/control-has-associated-label.

### M-012 - Baseline: eslint-config-next already enforces a subset of jsx-a11y; full recommended set reports only 40 problems
- **Severity:** Info | **Category:** a11y | **Effort:** S | **Confidence:** High
- **Location:** `eslint.config.mjs:L1-L18`
- **Evidence:** Temp flat config with jsx-a11y recommended over src/: 40 messages (no-autofocus 15, label-has-associated-control 9, click-events 3, static-element-interactions 3, media-has-caption 2, no-noninteractive-tabindex 2, heading-has-content 1, anchor-has-content 1, anchor-is-valid 1, no-redundant-roles 1, 2 exhaustive-deps) - raw/jsx-a11y.json. Alt-text, aria-props etc. have 0 violations.
- **Impact:** Positive: low static violation count.
- **Recommendation:** Adopt jsxA11y.flatConfigs.recommended in eslint.config.mjs.

## Score: **3 / 5**
Static results are good (40 jsx-a11y problems; alt text and ARIA props are clean; lang and zoom are correct; KaTeX output is MathML-capable). Real gaps: custom overlays without dialog semantics, dark-mode contrast on primary/destructive, partial reduced-motion support, and two checks (axe runtime, viewport tests) that could not be run. Counts: 0 Critical, 0 High, 5 Medium, 5 Low, 2 Info.
