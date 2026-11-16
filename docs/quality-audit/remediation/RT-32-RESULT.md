# RT-32 result: accessibility remediation (safe parts)

Findings: M-001, M-002, M-003, M-004, M-005, M-006 (partial), M-007 (reviewed), M-009, M-011.
Branch `rt-32-a11y`, based on `remediation/audit-2026-11`.

## What changed

| Finding | Change | Evidence |
|---|---|---|
| M-001 autoFocus | `math-builder-modal.tsx`: removed the 10 `autoFocus` props. The dialog now sets one deliberate focus target through Radix `onOpenAutoFocus` (first `input`, `preventScroll`). | Browser (local harness): opening the Fraction builder with Enter focuses `#numerator` (its label is "Top Number (Numerator)"), `scrollY` stays 0, Escape closes it. |
| M-001 remaining 4 | `tutor/page.tsx` (search box, inline rename), `notebook/page.tsx` (inline rename), `teacher/network/page.tsx` (inline rename) keep `autoFocus`. Each field appears only after the user clicks "search" or "rename", so moving focus there is the intended interaction; removing it would change mouse behaviour. See FOLLOWUPS. | n/a |
| M-002 labels | `workspace-preview-pages.tsx` (7 labels): `htmlFor`/`id` pairs with `useId`; the Radix `SelectTrigger` and `Checkbox` get the `id`. `navigation-chatbot.tsx`: Description label now bound to its textarea; "Category" is a group heading (`span` + `role="group" aria-labelledby`), not a label for no control. | Browser, `/demos/teacher` Gradebook: both labels resolve to `BUTTON[role=combobox]` through `label.htmlFor` (accessible names "Class" and "Assignment"). |
| M-003 clickable div | `scientific-calculator.tsx` minimized bar is now `<button type="button">` with the same classes plus `w-full text-left` and a `focus-visible` ring; inner `div` became `span` (valid inside a button). The other `onClick` divs named in the audit no longer exist in the code (a repo-wide scan for `<div|span ... onClick` finds none). | Not exercised in the browser: the calculator embeds desmos.com, which I did not load. Static review only. |
| M-004 drawer | See "Drawer decision" below. | Browser (local harness copy of the same markup + hook): focus moves to the panel on open; Tab x4 stays inside, Shift+Tab wraps from the first to the last control; Escape closes; focus returns to the opener. |
| M-005 contrast | New tokens `--destructive-solid` / `--destructive-solid-hover`; Button and Badge destructive variants use them; the `dark:bg-destructive/60` alpha fill is gone. Light `--destructive` L 0.629 -> 0.58. | See contrast table. Computed in the browser too: rendered bg rgb(211,58,65) vs white = 4.72:1 in both themes. |
| M-006 captions | No captions file exists in the repo and I did not write one (a transcript of a 5-minute demo would be invented). Added `aria-label` to the two demo `<video>`s that says captions are not yet available. Captions remain open: HUMAN-TODO. | n/a |
| M-007 | Re-checked: `feature-section.tsx` no longer exists; the `<ol role="list">` in `classroom-bento.tsx` is the deliberate Safari/VoiceOver fix for `list-none` lists; the two scrollable `tabIndex={0}` regions have `role="region"` + `aria-label` (correct pattern); `href="#"` is in a demo page. No change. | n/a |
| M-009 | `Providers` wraps its children in `<MotionConfig reducedMotion="user">` inside `ThemeProvider`, around the unchanged `AuthProvider needsAuth` gating. | Code review; tsc and build pass. Not tested with an OS reduced-motion preference (the browser pane cannot emulate it). |
| M-011 | 22 icon buttons that had no name now have `aria-label` (assignment-view, tutor, teacher grade, workspace preview, navigation chatbot, scroll-button). The audit's 67 candidates were mostly already named; a parser-based scan found 22 real ones. New jest test `src/lib/a11y-icon-buttons.test.ts` fails if any `size="icon"` Button lacks a name. | Scan: 22 before, 0 after. |

## Drawer decision (M-004)

I did not replace the assignment-view mobile Raise drawer with the Radix `Sheet`. The drawer is a `framer-motion` spring slide-in (`damping 25, stiffness 200`) with `AnimatePresence` exit, driven by `aiHelperOpen`, and sits beside a desktop panel using the same state. `Sheet` uses CSS keyframes, so the swap would change the animation and add a portal and `aria-hidden` side effects on a 1,700-line page that RT-25 will restructure. Faithful alternative implemented in place:

- `role="dialog" aria-modal="true" aria-label="Raise AI helper"`, `tabIndex={-1}`, backdrop `aria-hidden`.
- New hook `src/hooks/use-modal-a11y.ts`: focuses the panel on open (`preventScroll`), traps Tab/Shift+Tab, closes on Escape, restores focus to the opener. The wrap decision is a pure function (`wrapFocusTarget`) with unit tests.
- The other overlays named by M-004 (notebook full-screen editor, navigation-chatbot expanded panel, animated-sidebar backdrop) are not changed (FOLLOWUPS); the hook can be reused for them.

Not verified in the real page: the assignment-view page needs a signed-in student, an enrolled class and an assignment (emulator seed data); I tested the identical markup and hook in a throwaway local page (deleted, not committed) instead.

## Contrast (computed from the oklch tokens; script in `src/app/globals-contrast.test.ts`)

| Pair | Before | After | Target |
|---|---|---|---|
| light: white on destructive button | 3.85 | 4.72 | 4.5 |
| dark: white on destructive button | 2.77 (before the `/60` alpha, which lowered it further) | 4.72 | 4.5 |
| button hover fill, both themes | n/a | 5.83 | 4.5 |
| light: `text-destructive` on background | 3.79 | 4.64 | n/a |
| dark: `text-destructive` on background | 6.23 | 6.23 (token kept at L 0.7106) | n/a |

Why a new token rather than only darkening `--destructive`: in dark mode `--destructive` is also used as red text (about 60 usages of `text-destructive`) on a near-black background; darkening it to L 0.58 would drop that text to about 3.65:1. The button fill therefore uses `--destructive-solid` (L 0.58, minimal darkening that clears 4.5 with margin: L 0.60 gives only 4.34). The primary-button dark-mode contrast issue from M-005 (4.13) is not part of this change (FOLLOWUPS).

## Page checks (browser pane, `next dev` on 5500, demo Firebase env, no emulators)

Self-written DOM checks (no axe-core installed, none added): unnamed form controls, unnamed buttons, dangling labels, duplicate ids, images without alt, empty headings, `autofocus`, videos without tracks, `cursor:pointer` divs outside interactive ancestors.

- `/`, `/features`, `/pricing`, `/login`, `/signup`: 0 unnamed controls (apart from Google's hidden reCAPTCHA textarea on login), 0 unnamed buttons, 0 dangling labels, 0 empty headings, 0 `autofocus`, 0 images without alt. These pages were already clean for these checks before my change (my change touches none of their markup), so there is no measurable before/after delta on them; the before evidence is the audit's jsx-a11y output.
- `/login` accessibility tree: tabs, "Student Email", "Student Password", "Show password", "Sign in as Student" all named. Keyboard order on `/login` (Tab x9): Back to Home, Appearance, tab list, Student tab, tab panel, Email, Forgot password, Password, Show password, Sign in. Logical.
- Observations, not fixed (FOLLOWUPS): `/login` and `/signup` have no `<h1>` (CardTitle renders a `div`); `/`, `/features` show 3 and 4 `cursor:pointer` non-interactive elements (not investigated).
- Screenshots (viewed in the browser pane, not saved to the repo): the harness destructive button/badge in dark mode, `/` at 375px after the change, `/demos/teacher` Gradebook. No visual regression noticed; the only intended visual change is the slightly darker destructive red. I did not take before screenshots from a second checkout, so the comparison is against the unchanged parts of the same pages and the known token values.
- Viewport was reset to desktop and my tab closed.

## Not measured

- Lighthouse / axe scores (acceptance criterion 95+): neither tool is installed and the ticket forbids new dependencies. Not measured; run Lighthouse against `next start` with demo env to close the criterion.
- Reduced-motion behaviour (needs OS preference emulation).
- Screen reader testing (VoiceOver, NVDA).
- Signed-in pages (assignment-view drawer, calculator, tutor, notebook) in the real app.

## Tests added

- `src/app/globals-contrast.test.ts`: contrast of destructive tokens in both themes (button, hover, text).
- `src/components/ui/button.test.tsx`: `renderToStaticMarkup` for destructive Button/Badge classes and a labelled icon button.
- `src/hooks/use-modal-a11y.test.ts`: focus-wrap logic.
- `src/lib/a11y-icon-buttons.test.ts`: no unlabelled `size="icon"` Button in `src`.
