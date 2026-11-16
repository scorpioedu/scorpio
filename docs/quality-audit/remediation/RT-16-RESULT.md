# RT-16 result: Core Web Vitals (login, landing, providers, layouts)

Findings: I-018, I-019, I-020, I-021. Branch `rt-16-cwv`.

## Method
- "First Load JS" = gzip size of every `<script src>` in the prerendered HTML of the route (`.next/server/app/<route>.html`), from `next build --webpack` before (ff333a6) and after. Next 16 webpack builds no longer print sizes in the route table, so this is computed from the build output.
- Runtime numbers: `next start` on both builds, in-app browser, same-origin JS encoded bytes after 4-5 s (includes lazily loaded chunks), plus a check of which chunks contain Firestore/KaTeX and whether reCAPTCHA is requested.
- Behaviour checks: `next dev` against Auth/Firestore/Storage emulators on 19399/18380/19499, baseline (ff333a6 sources) and after.

## First Load JS (KB gz, initial HTML scripts)
| Route | Before | After |
|---|---|---|
| / | 330.0 | 331.3 |
| /login | 468.6 | 469.1 |
| /signup | 472.2 | 473.3 |
| /pricing | 326.4 | 327.8 |
| /student | 717.3 | 581.9 |
| /student/assignments | 618.1 | 478.6 |
| /student/vault | 696.8 | 556.6 |
| /student/tutor | 626.7 | 613.6 |
| /teacher | 619.6 | 486.9 |
| /teacher/assignments | 629.6 | 496.6 |
| /teacher/vault | 709.2 | 571.9 |

(+1 KB on public routes is the dynamic-import glue; the real public-page savings are in the runtime chunks below.)

## Runtime (same-origin JS, encoded KB, includes lazy chunks)
| Route | Before | After | Firestore chunk | reCAPTCHA requests |
|---|---|---|---|---|
| /pricing | 450 (36 reqs) | 289 (30 reqs) | 82 KB -> none | 4 -> 0 |
| / | 421 (33 reqs) | 299 (32 reqs) | none | 0 |
| /login | 430 | 431 | 82 KB (unchanged) | 4 (unchanged) |

KaTeX chunk (75 KB gz) on `/`: loaded before, not loaded after (it loads when the Raise chat renders an assistant message).

## Changes and evidence
1. **I-018 chatbot out of layouts** (`src/app/student/layout.tsx`, `src/app/teacher/layout.tsx`): `NavigationChatbot` via `next/dynamic({ ssr: false })`; `navigation-chatbot.tsx` and `landing-chatbot.tsx` use `LazyMarkdownRenderer` (new `src/components/lazy-markdown-renderer.tsx`). Evidence: `/student` 717 -> 582, `/teacher` 620 -> 487 KB gz; KaTeX and react-markdown are no longer initial chunks of the layouts. Browser: launcher renders on both dashboards, opens, and the welcome message renders (Markdown chunk fetched on open).
2. **I-018 KaTeX once** (`src/components/latex.tsx`, both vault pages): `react-katex` (a second, CommonJS KaTeX copy) replaced by `katex.renderToString`. `/student/vault` 697 -> 557, `/teacher/vault` 709 -> 572 (includes change 1). Browser: 24 formulas render on each vault page.
3. **I-019 needsAuth allow-list** (`src/lib/auth-routes.ts`, `providers.tsx`, test `__tests__/auth-routes.test.ts`): auth only on `/student /teacher /admin /login /signup /join`. Evidence above (`/pricing`: no Firestore, no reCAPTCHA, -161 KB runtime JS). Browser: student signup, teacher signup with a seeded invite code, both dashboards, sign-out, re-login, and signed-out `/student/vault` and `/teacher` redirecting to `/login` (server proxy) all behave as at baseline.
4. **I-020 login** (`src/app/login/page.tsx`): removed the `authLoading` full-page spinner and the `opacity: 0` initial on the outer wrapper; the Suspense fallback is a server-rendered card shell with the real "Welcome Back" heading (min-height matches the form to avoid layout shift); buttons show "Preparing..." while the auth listener initialises. Mechanism: before, the first HTML contained only a spinner and the heading appeared after hydration plus dynamic import of firebase/firestore/App Check plus `onAuthChange`; now `curl /login` contains "Welcome Back" in the HTML (before: only `animate-spin`). Lighthouse LCP not re-measured (see FOLLOWUPS). Also dropped unused `db`, `auth`, `doc`, `setDoc` imports.
5. **I-021 landing** (`home-reveal.module.css`): removed the rule that paused hero/scroll-reveal animations while `#scorpio-intro[open]`. Mechanism: the LCP element `#dashboard-preview` had a 1.95 s element-render delay because its reveal animation (opacity 0) sat paused until the splash closed; it now runs behind the splash (verified `getAnimations()` is `running` while the dialog is open). Landing KaTeX chunk deferral comes from change 1.

## Browser verification (emulators, own tab)
Landing `/` (splash then page, Raise launcher opens), `/login` (renders, shell to form), `/signup` student and teacher, `/student`, `/teacher`, `/student/vault`, `/teacher/vault`, Support chatbot on both dashboards, sign-out to `/login`, re-login to `/student`, signed-out redirects, dark default and `theme=light` via localStorage (class applied), teacher dashboard at 375px (viewport reset to desktop afterwards). Console errors: after = only the report-only CSP notice for the Auth emulator iframe (emulator-specific); the baseline flow showed no additional errors.

## Not done
See FOLLOWUPS.md "From RT-16": lazy Firebase/App Check in `firebase.ts`, the 450 KB `/student` target, remaining `react-katex` users, Lighthouse re-run.
