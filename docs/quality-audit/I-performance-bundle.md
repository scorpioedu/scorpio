# I. Performance and Bundle

Findings: `findings-I.csv` (I-001…I-022). Raw: `raw/public-sizes.txt`, `raw/public-large.txt`, `raw/largest-chunks.txt`, `raw/dep-usage-check.txt`, `raw/eslint-bug-rules.txt`, `raw/build.txt`, `raw/bundle-analyzer-client.json`, `raw/bundle-analyzer-routes.json`, `raw/lighthouse-summary.json`, `raw/lighthouse-home-mobile.json`, `raw/lighthouse-home-desktop.json`, `raw/lighthouse-pricing-mobile.json`, `raw/lighthouse-pricing-desktop.json`, `raw/lighthouse-login-mobile.json`, `raw/lighthouse-login-desktop.json`.

## Task checklist
- [x] **I1** Bundle analysis (`@next/bundle-analyzer` with `ANALYZE=true`, webpack production build)
- [x] **I2** Heavy dependency import review
- [x] **I3** Server packages in root `dependencies`
- [x] **I4** Assets, images, fonts
- [x] **I5** Firestore read efficiency
- [x] **I6** Lighthouse (mobile & desktop on `/`, `/pricing`, `/login`; authenticated page skipped — see I6 below)

## I1. Bundle analysis (`raw/bundle-analyzer-client.json`, `raw/bundle-analyzer-routes.json`)
Production build was executed in a scratch copy (`/tmp/scorpio-scratch`) with `@next/bundle-analyzer` (`ANALYZE=true`, `analyzerMode: "json"`). Each App Router route's First-Load JS was computed by summing all initial client chunks for `main-app`, `app/layout`, applicable segment layouts (`app/student/layout`, `app/teacher/layout`, `app/(docs)/layout`), and the route's `page` entrypoint.

### Top 10 heaviest routes by First-Load JS
| Rank | Route | First-Load JS (gzip) | First-Load JS (parsed) | Stat size | Chunks | Top contributing packages (gzip, excl. Next.js runtime ~160 KB gz) |
|---:|---|---:|---:|---:|---:|---|
| 1 | `/student` | **659.5 KB** | 2,141.0 KB | 7,326.7 KB | 20 | `recharts` (100.2 KB), `@firebase/firestore` (82.3 KB), `katex` (73.9 KB), `src/` app code (48.6 KB), `framer-motion` + `motion-dom` (49.9 KB), `react-markdown` (25.3 KB), `@firebase/auth` (24.8 KB) |
| 2 | `/teacher/vault` | **647.6 KB** | 2,112.0 KB | 6,961.0 KB | 19 | `katex` (**147.1 KB** — bundled twice: ESM + CJS), `@firebase/firestore` (82.3 KB), `src/` app code (54.9 KB), `framer-motion` + `motion-dom` (49.9 KB), `react-markdown` (25.3 KB), `@firebase/auth` (24.8 KB) |
| 3 | `/student/vault` | **635.5 KB** | 2,074.4 KB | 6,861.6 KB | 17 | `katex` (**147.1 KB** — bundled twice: ESM + CJS), `@firebase/firestore` (82.3 KB), `framer-motion` + `motion-dom` (48.1 KB), `src/` app code (43.5 KB), `react-markdown` (25.3 KB), `@firebase/auth` (24.8 KB) |
| 4 | `/teacher/create` | **621.9 KB** | 2,019.2 KB | 6,973.2 KB | 21 | `@firebase/firestore` (82.3 KB), `katex` (73.9 KB), `src/` app code (67.8 KB), `framer-motion` + `motion-dom` (48.1 KB), `react-markdown` (25.3 KB), `@firebase/auth` (24.8 KB), `react-day-picker` + `chrono-node` + `date-fns` (33.4 KB) |
| 5 | `/student/notebook` | **608.6 KB** | 1,970.2 KB | 6,628.5 KB | 20 | `@firebase/firestore` (82.3 KB), `katex` (73.9 KB), `src/` app code (50.4 KB), `framer-motion` + `motion-dom` (48.1 KB), `react-markdown` (25.3 KB), `@firebase/auth` (24.8 KB), `showdown` + `turndown` (28.2 KB) |
| 6 | `/student/assignment-view` | **604.1 KB** | 1,952.3 KB | 6,650.4 KB | 22 | `@firebase/firestore` (82.3 KB), `katex` (73.9 KB), `src/` app code (68.4 KB), `framer-motion` + `motion-dom` (49.9 KB), `react-markdown` (25.3 KB), `@firebase/auth` (24.8 KB), `@afixt/a11y-calc` (9.8 KB) |
| 7 | `/teacher/network` | **588.1 KB** | 1,920.0 KB | 6,576.1 KB | 19 | `@firebase/firestore` (82.3 KB), `katex` (73.9 KB), `src/` app code (67.9 KB), `framer-motion` + `motion-dom` (48.1 KB), `react-markdown` (25.3 KB), `@firebase/auth` (24.8 KB) |
| 8 | `/teacher/students` | **574.1 KB** | 1,860.4 KB | 6,373.3 KB | 19 | `@firebase/firestore` (82.3 KB), `katex` (73.9 KB), `src/` app code (57.1 KB), `framer-motion` + `motion-dom` (48.1 KB), `react-markdown` (25.3 KB), `@firebase/auth` (24.8 KB) |
| 9 | `/teacher/waypoints` | **574.0 KB** | 1,855.9 KB | 6,354.7 KB | 18 | `@firebase/firestore` (82.3 KB), `katex` (73.9 KB), `src/` app code (51.8 KB), `framer-motion` + `motion-dom` (49.9 KB), `react-markdown` (25.3 KB), `@firebase/auth` (24.8 KB) |
| 10 | `/teacher/grades` | **573.1 KB** | 1,856.5 KB | 6,377.9 KB | 19 | `@firebase/firestore` (82.3 KB), `katex` (73.9 KB), `src/` app code (50.0 KB), `framer-motion` + `motion-dom` (48.1 KB), `react-markdown` (25.3 KB), `@firebase/auth` (24.8 KB) |

*(For reference on public routes: `/demos/teacher` is **549.7 KB gz** / 1,824.0 KB parsed; `/research` is **495.4 KB gz**; `/signup` is **413.9 KB gz**; `/login` is **411.2 KB gz**; `/features` is **397.1 KB gz**; `/` is **272.1 KB gz**; `/pricing` is **268.8 KB gz**.)*

### Verification of the 4 suspected bundle issues
1. **`framer-motion` statically bundled on many routes — VERIFIED (worse than suspected: 47 of 47 routes)**:
   - Shared chunk `static/chunks/2441-b8020573eab47a4a.js` (`123.0 KB parsed` / **`40.3 KB gz`**: `framer-motion` 30.9 KB gz + `motion-dom` 13.5 KB gz + `motion-utils` 1.9 KB gz) is included in `app/layout` (via `Providers` → `RouteProgressBar`), so **100% of routes (47/47)** load `framer-motion` in their initial JS. Additional per-route `framer-motion` chunks (`6606`, `1421`, `6181`, `6195`, `6739`) bring total motion library weight to **48–51 KB gz** per route. Note: the separate `motion` package (`motion/react`) shares `motion-dom`/`motion-utils` with `framer-motion@12` and adds ~0.1 KB gz, though keeping both packages in `package.json` remains redundant (I-009).
2. **`recharts` and `katex` statically imported — VERIFIED (plus a critical layout leak and double-bundling bug, I-018)**:
   - **`recharts` (`319.5 KB parsed` / `96.9 KB gz` in `static/chunks/3343-e01feed1c60c08ab.js`, plus `9.6–9.7 KB gz` in `915`/`6739` = ~106 KB gz)**: Statically bundled into `/student` (`student-progress-chart.tsx:L12`), `/research` (`layer-efficacy-chart.tsx:L12`), and `/admin` (`usage-analytics.tsx`). Properly lazy-loaded on `/pricing` (`landing/pricing.tsx:L12`).
   - **`katex` (`73.9 KB gz` on 25 routes; `147.1 KB gz` on 3 routes — bundled TWICE)**:
     - **Layout leak**: `src/app/student/layout.tsx:L5` and `src/app/teacher/layout.tsx:L6` statically import `NavigationChatbot`, which imports `MarkdownRenderer` (`src/components/ui/markdown-renderer.tsx`), pulling `static/chunks/d3ac728e-50ca38d62d7321b0.js` (`katex/dist/katex.mjs`, `258.2 KB parsed` / `73.9 KB gz`) and `static/chunks/2831-776defa864343916.js` (`react-markdown` + `remark-gfm` + `rehype-katex`, `158.1 KB parsed` / `47.3 KB gz`) into **every single `/student/*` and `/teacher/*` route** (`21` routes), plus `/ai`, `/features`, `/research`, and `/demos/teacher`.
     - **Dual CJS + ESM duplication**: `react-katex` (`src/app/student/vault/page.tsx:L31`, `src/app/teacher/vault/page.tsx:L48`, `src/components/landing/workspace-preview-pages.tsx:L30`) uses CommonJS `require("katex")`, creating a second full KaTeX chunk `static/chunks/bdfe9574-108517677fd46d35.js` (`katex/dist/katex.js`, `258.7 KB parsed` / `73.2 KB gz`). Consequently, `/teacher/vault`, `/student/vault`, and `/demos/teacher` download **both** chunks (**516.9 KB parsed / 147.1 KB gz of KaTeX alone**; see I-018).
3. **Firebase SDK weight — VERIFIED (~154.8 KB gz / 499.6 KB parsed across 5 chunks on 30 routes, plus eager runtime loads on public pages, I-019)**:
   - Every route importing `@/lib/firebase` (`src/lib/firebase.ts:L1-L64`) pulls in 5 initial chunks: `7508b87c` (`@firebase/firestore`, `281.5 KB parsed` / **`82.3 KB gz`**), `3630` (`@firebase/webchannel-wrapper` + `@firebase/app` + `@firebase/util`, `82.3 KB parsed` / **`29.1 KB gz`**), `84c12632` (`@firebase/auth`, `85.7 KB parsed` / **`24.8 KB gz`**), `4521` (`@firebase/storage` + `@firebase/app-check`, `42.2 KB parsed` / **`14.3 KB gz`**), and `391fd0f2` (`@firebase/ai`, `8.1 KB parsed` / **`2.9 KB gz`**) — totaling **499.8 KB parsed / 153.4 KB gz** on 30 entrypoints (including `/login`, `/signup`, `/forgot-password`, `/join/*`, and all `/student/*` and `/teacher/*` routes).
   - Worse, `src/components/providers.tsx:L14` sets `needsAuth = pathname !== "/" && pathname !== "/demos/teacher"`, so `AuthProvider` dynamically loads all 5 Firebase chunks AND triggers `ReCaptchaEnterpriseProvider` (`360 KiB` `recaptcha__en.js` from `gstatic.com`) on public pages like `/pricing` (see I-019).
4. **The 8 `next/font/google` families — PARTIALLY VERIFIED / NUANCED (I-006, I-022)**:
   - **Preload behavior (Refuted for 6 of 8 fonts)**: Inspection of `.next/server/next-font-manifest.json` confirms that only `Inter` and `IBM_Plex_Sans` have `preload: true` (`src/app/layout.tsx:L41,L50`), emitting just **2** `<link rel="preload" as="font">` tags (`e4af272ccee01ff0-s.p.woff2` and `26d4368bf94c0ec4-s.p.woff2`). The other 6 families set `preload: false`, so browsers do not eagerly download unused font `.woff2` files on initial paint.
   - **Build & CSS bloat (Verified, I-022)**: `Plus_Jakarta_Sans`, `Lora`, and `IBM_Plex_Mono` (`src/app/layout.tsx:L15-L35`) omit `subsets: ["latin"]` (`IBM_Plex_Mono` also requests 7 weights × 2 styles), generating **141 Google Font `.woff2` files** across all Unicode ranges (+ 20 KaTeX `.woff2` files = **161 `.woff2` files, 3.0 MB** in `.next/static/media/`, duplicated to 322 files when `.next/standalone` is present), bloating the global CSS font stylesheet (`f51d6fff944d3fdb.css`), and causing 20 `read ETIMEDOUT` retries during `npm run build`.

## I2. Heavy dependency table
| Package | How imported | Verdict |
|---|---|---|
| `react-globe.gl` (+ peer `three`) | `next/dynamic` `ssr:false` in `scorpio-globe.tsx:L7`; wrapper statically imported by `feature-section.tsx:L7` | OK (lazy). `three` has no direct imports. |
| `cobe` | `cobe-globe.tsx` only; component is imported nowhere | Dead code + dead dep (I-010) |
| `mathlive`, `mathjs` | 0 imports | Remove (I-008) |
| `recharts` | dynamic in `landing/pricing.tsx:L12`; **static** in `student-progress-chart.tsx:L12`, `layer-efficacy-chart.tsx:L12` | Make the two static ones dynamic |
| `katex` | static in `math-input.tsx:L5` (3 pages) | Dynamic-import on assignment pages |
| `@tiptap/*` | only `rich-text-editor.tsx`, dynamically imported at `student/notebook/page.tsx:L76` | Good; 15 individual extensions duplicate `starter-kit` (J) |
| `framer-motion` + `motion` | 54 files + 8 files, statically | Consolidate, LazyMotion (I-009) |
| `showdown`/`turndown` | static in notebook page:L67-68 | Lazy-load with editor |

## I3. Server packages
`firebase-admin` is imported by 33 server-side files (API routes, `src/lib`, `src/proxy.ts`); none has a `use client` directive, so no client-chunk leakage was found (static check). `vercel` CLI (0 refs), `firebase-functions` (0 refs in `src/`), `baseline-browser-mapping` (0 refs), `sib-api-v3-sdk`, `@vercel/*`, `@polar-sh/nextjs` are unused: see I-011.

## I4. Assets
- `public/` = **103 MB**; `public/demos` 89 MB (five 9–22 MB videos); `headshot-sage.jpg` 3.1 MB, `og-image.png` 2.6 MB, `plan.jpg` 1.4 MB, `og-image-pink.png` 1.2 MB, ~10 PNGs of 340–670 KB; 3 PDFs ~0.4–0.56 MB (incl. a personal résumé PDF in `public/`).
- `<img>`: 6 `no-img-element` hits; `next.config.mjs` has an empty `images` config.
- Fonts: 8 `next/font/google` families in `layout.tsx` (322 `.woff2` in the local `.next`; the plan cited 161); I-006.

## I5. Firestore efficiency
Only 17 `limit()` calls repo-wide, all but 2 server-side. ~50 client `getDocs`/`onSnapshot` sites are unbounded. Worst: `teacher/page-client.tsx:L106-L148`, `teacher/grades/page.tsx:L113-L128`, `student/submissions/page.tsx:L36-L60` (N+1 inside listener). `auth-context` listener is a single-doc listener (fine). `usage-analytics.tsx` is correctly limited (250).

## I6. Lighthouse (`raw/lighthouse-summary.json`, `raw/lighthouse-*.json`)
Executed against `npm run start` (production build in `/tmp/scorpio-scratch` with `.env.example` dummy values) using headless Chrome (`--only-categories=performance`, default mobile preset and `--preset=desktop`).

### Lighthouse metrics (Mobile & Desktop)
| Route | Form Factor | Perf Score | FCP | LCP | TBT | CLS | Speed Index | TTI | Total Transfer | Key bottleneck |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `/` | **Mobile** | **79** | 1.4 s (1,355 ms) | **5.4 s (5,432 ms)** | 130 ms (132 ms) | 0 | 1.6 s | 5.4 s | 636 KiB | `<dialog id="scorpio-intro">` splash + paused `opacity: 0` hero animation (`elementRenderDelay: 1,953 ms`); `HomeChatbot` loads `katex` + `react-markdown` (124 KiB transfer) on hydration (I-021) |
| `/` | **Desktop** | **98** | 0.4 s (365 ms) | **1.2 s (1,194 ms)** | 0 ms | 0.002 | 0.7 s | 1.2 s | 688 KiB | Same splash/animation delay, scaled to desktop CPU/network |
| `/pricing` | **Mobile** | **99** | 1.2 s (1,207 ms) | **1.2 s (1,207 ms)** | 100 ms (96 ms) | 0 | 2.6 s | 9.6 s | 1,178 KiB | `<h1>` renders immediately (`LCP 1.2 s`), but `Providers` `needsAuth` loads `@firebase/firestore` (84.5 KiB, 94.6% unused) + `recaptcha__en.js` (360 KiB, 57.4% unused), pushing TTI to 9.6 s (I-019) |
| `/pricing` | **Desktop** | **100** | 0.3 s (325 ms) | **0.3 s (325 ms)** | 0 ms | 0 | 0.8 s | 0.3 s | 1,201 KiB | 438 KiB unused JS (`recaptcha__en.js` + `@firebase/firestore`) |
| `/login` | **Mobile** | **73** | 1.1 s (1,057 ms) | **10.0 s (9,993 ms)** | 100 ms (97 ms) | 0 | 3.5 s | 10.0 s | 1,183 KiB | `if (authLoading) return <LoadingSpinner fullPage />` (`login/page.tsx:L102`) blocks form render until Firebase + AppCheck load and `onAuthChange` fires, followed by a 600 ms `framer-motion` `opacity: 0` fade-in (I-020) |
| `/login` | **Desktop** | **90** | 0.3 s (285 ms) | **2.0 s (2,048 ms)** | 0 ms | 0 | 0.7 s | 2.0 s | 1,048 KiB | Same `authLoading` spinner gate + `opacity: 0` fade-in (`elementRenderDelay: 1,109 ms`) + 366 KiB unused JS |

### Why the authenticated page was skipped
Auditing an authenticated page (`/student` or `/teacher`) using only the Firebase emulators without modifying application code is **not possible** for three architectural reasons (see L-012):
1. **No client-side emulator wiring**: `src/lib/firebase.ts:L62-L64` calls `getAuth(app)`, `getFirestore(app)`, and `getStorage(app)` directly with zero `connectAuthEmulator`, `connectFirestoreEmulator`, or `connectStorageEmulator` calls anywhere in `src/`.
2. **Server-side `firebase-admin` requires a valid PEM key even with emulators**: `src/lib/firebase-admin.ts:L25-L44` checks `if (!projectId || !clientEmail || !privateKey) return null;` and calls `admin.credential.cert(...)`, which fails on `.env.example` dummy keys (`Invalid PEM formatted message`), causing `src/proxy.ts:L9` to redirect all `/student/*` and `/teacher/*` requests to `/login`.
3. **Client-side `ProtectedRoute` guard**: Even if `src/proxy.ts` were bypassed, `ProtectedRoute` (`src/components/protected-route.tsx:L18-L21`) and `AuthProvider` (`src/contexts/auth-context.tsx:L46-L55`) call client-side `onAuthChange` against production `identitytoolkit.googleapis.com`; with dummy credentials, `user` resolves to `null` and the client router immediately redirects to `/login`.

## Score: **2 / 5** *(updated from 3 / 5 after I1 & I6)*
While `react-globe.gl` and `@tiptap/*` are dynamically imported, full bundle analysis (`I1`) and Lighthouse (`I6`) revealed severe production performance debt:
1. All 21 `/student/*` and `/teacher/*` routes ship **545–660 KB gzipped (1.77–2.14 MB parsed)** of First-Load JS because `StudentLayout` and `TeacherLayout` statically bundle `NavigationChatbot` (`katex` 73.9 KB gz + `react-markdown` 47.3 KB gz), `@firebase/firestore` (82.3 KB gz), and `framer-motion` (40.3 KB gz), while `/teacher/vault`, `/student/vault`, and `/demos/teacher` bundle **two full copies of KaTeX** (ESM + CJS = 147.1 KB gz / 516.9 KB parsed).
2. Mobile LCP fails Core Web Vitals on both `/login` (**10.0 s**, score **73**, blocked by `authLoading` spinner + `opacity: 0` animation + 445 KiB of unused Firestore/reCAPTCHA JS) and `/` (**5.4 s**, score **79**, delayed by the `#scorpio-intro` modal splash and paused `opacity: 0` hero animation).
3. Combined with 103 MB of unoptimized `public/` media, 141 Google Font `.woff2` files from missing `subsets: ["latin"]`, and ~50 unbounded/N+1 client Firestore queries, the performance risk is significant (**2 / 5**).
