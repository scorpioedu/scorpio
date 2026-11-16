# Workstream J: Dependencies and Supply Chain (`J-dependencies.md`)

**Date:** 2026-11-11  
**Scope:** `package.json`, `package-lock.json`, `functions/package.json`, `functions/package-lock.json`  
**Raw Outputs:** `raw/ncu.txt`, `raw/dep-usage-check.txt`, `raw/knip.txt`, `raw/licenses.txt`, `raw/npm-audit.json`, `raw/npm-audit-functions.json`, `raw/audit-summary.txt`, `raw/npm-ci.txt`

---

## Checklist Progress

- [x] **J1** `npx npm-check-updates` (root + functions): list outdated major versions.
- [x] **J2** Version drift and mismatches: `eslint-config-next` vs. `next`; `ts-jest@29` vs. `jest@30`; `@polar-sh/sdk`, `firebase-admin`, `firebase-functions`, `react`, `typescript` in root vs. functions; `@google/genai` vs. `@google-cloud/vertexai`.
- [x] **J3** Redundant dependencies: `motion` + `framer-motion`; `radix-ui` meta-package + individual `@radix-ui/*`; `showdown` + `turndown` + `react-markdown`; `@tiptap/starter-kit` + individually listed extensions.
- [x] **J4** Unused dependencies, from the `knip` output (A5) and verified with `rg`.
- [x] **J5** Licenses: `npx license-checker --summary` and flag copyleft licenses.
- [x] **J6** Lockfile health: consistency with `npm ci`, `engines` field, `.nvmrc`, and stray parent lockfile.

---

## J1. Outdated Major Versions (`raw/ncu.txt`)

Running `npx npm-check-updates` across root (`package.json`) and `functions/package.json` identified **15 major-version upgrades available at root** and **3 major-version upgrades in `functions/`**:

### Root Major-Version Lag (`package.json`)

| Package | Current Spec | Latest Available | Category | Notes |
|---|---|---|---|---|
| `vercel` | `^50.39.0` | `^65.14.0` | CLI (misplaced in `dependencies`) | Unused at runtime; pulls in 15+ High/Critical advisories (`raw/audit-summary.txt`). |
| `@polar-sh/sdk` | `^0.44.0` | `^1.1.0` | Billing SDK | Major `1.x` release available (both root and `functions/`). |
| `@polar-sh/nextjs` | `^0.9.3` | `^1.1.0` | Billing Next.js adapter | Unused in codebase (`raw/dep-usage-check.txt`). |
| `@hookform/resolvers` | `^5.2.2` | `^7.0.6` | Form validation | Unused in codebase (`raw/dep-usage-check.txt`). |
| `firebase` | `^12.6.0` | `^13.3.0` | Client Firebase SDK | 1 major behind. |
| `firebase-admin` | `^13.7.0` | `^14.5.1` | Server Firebase Admin SDK | 1 major behind. |
| `framer-motion` | `^12.23.25` | `^14.12.0` | Animation | 2 majors behind; duplicated with `motion` (`^12.38.0` → `^14.12.0`). |
| `motion` | `^12.38.0` | `^14.12.0` | Animation | 2 majors behind. |
| `lucide-react` | `^0.555.0` | `^1.72.0` | Icons | 1.x stable release available. |
| `react-day-picker` | `^9.14.0` | `^10.0.2` | UI Calendar | 1 major behind. |
| `react-resizable-panels` | `^3.0.6` | `^4.21.0` | UI Layout | 1 major behind. |
| `@firebase/rules-unit-testing` | `^5.0.2` | `^6.0.0` | Security Testing (dev) | 1 major behind. |
| `@types/node` | `^20` | `^26` | Types (dev) | Should match Node 22 LTS (`^22`). |
| `eslint` | `^9` | `^10` | Linting (dev) | Keep on v9 until `eslint-config-next` fully supports v10. |
| `typescript` | `5.9.3` | `7.0.2` | Compiler (dev) | Pin `5.9.3` is appropriate until TS 6/7 ecosystem stabilizes, but out of sync with `functions/`. |

### Functions Major-Version Lag (`functions/package.json`)

| Package | Current Spec | Latest Available | Notes |
|---|---|---|---|
| `@google/genai` | `^0.13.0` | `^3.2.0` | Pre-1.0 preview SDK in `functions/src/grading.ts:L2`; flagged with High severity vulnerability in `npm audit` (`0.9.0 - 1.8.0`). |
| `@polar-sh/sdk` | `^0.44.0` | `^1.1.0` | Matches root `0.44.0`. |
| `firebase-admin` | `^13.6.0` | `^14.5.1` | Spec drifts from root (`^13.7.0`). |

### Notable Minor/Security Updates Needed on Current Majors

- `next`: `^16.2.1` → `^16.4.6` (`npm audit` flags `next` `9.3.4-canary.0 - 16.4.0` as **Critical**).
- `zod`: `^4.1.13` → `^4.6.7` (`npm audit` flags `zod < 4.6.6` as **High**).
- `@tiptap/*`: `^3.20.0` → `^3.33.1` (`npm audit` flags `@tiptap/core <= 3.30.4` and `prosemirror-view < 1.42.3` as **High**).

---

## J2. Version Drift and Mismatches (`package.json` vs. `functions/package.json`)

| Package / Pair | Root (`package.json` / lockfile) | Functions (`functions/package.json` / lockfile) | Issue & Risk |
|---|---|---|---|
| `next` vs. `eslint-config-next` | `next: "^16.2.1"` (resolved `16.2.1`) vs. `eslint-config-next: "16.0.7"` (pinned exact) | N/A | Minor version drift between Next.js runtime and its ESLint plugin preset. |
| `jest` vs. `ts-jest` | `jest: "^30.2.0"`, `@types/jest: "^30.0.0"` vs. `ts-jest: "^29.4.6"` | N/A | **Major version mismatch**: `ts-jest@29` only officially supports `jest@29`. Running under Jest 30 risks subtle transformer incompatibilities. |
| `firebase-admin` | `"^13.7.0"` (resolved `13.7.0`) | `"^13.6.0"` (resolved `13.7.0`) | Manifest spec drift (`^13.7.0` vs. `^13.6.0`). |
| `firebase-functions` | `"^7.2.2"` (in root `dependencies`!) | `"^7.0.0"` (resolved `7.2.2`) | Root `package.json:L60` lists `firebase-functions` as a Next.js dependency even though no file in `src/` imports it. |
| `react` / `react-dom` | `"19.2.0"` (pinned exact; resolved `19.2.0`) | `"^19.2.4"` (caret; resolved `19.2.4`) | Root pins React `19.2.0` while `functions/` uses `19.2.4` (and `@types/react` resolves to `19.2.7` at root vs. `19.2.14` in `functions/`). |
| `typescript` | `"5.9.3"` (pinned exact) | `"^5.7.3"` (caret; resolved `5.9.3`) | Manifest spec drift (`5.9.3` vs. `^5.7.3`). |
| `@google/genai` vs. `@google-cloud/vertexai` vs. `firebase/ai` | `@google-cloud/vertexai: "^1.10.0"` in `devDependencies` (`package.json:L96`); `firebase/ai` imported in `src/lib/firebase.ts:L6`; raw `fetch` to `generativelanguage.googleapis.com` used in `src/lib/ai/config.ts:L42` | `@google/genai: "^0.13.0"` used in `functions/src/grading.ts:L2` | **Three different Google AI SDKs/approaches** across the repo: `@google-cloud/vertexai` in root `devDependencies` is **completely unused** (0 imports), `firebase/ai` (`getGenAIInstance` in `src/lib/firebase.ts:L67`) is **dead code** (unused export), Next.js server routes use raw `fetch` in `src/lib/ai/config.ts`, and Cloud Functions use `@google/genai`. |
| Email SDKs (`sib-api-v3-sdk` vs. `resend`) | `sib-api-v3-sdk: "^8.5.0"` in root `dependencies` (`package.json:L84`) | `resend: "^6.9.4"` in `functions/package.json:L24` (`functions/src/lib/email.ts:L1`) | Root installs the deprecated Brevo SDK (`sib-api-v3-sdk@8.5.0`) which has **0 imports anywhere in the codebase**, while actual email sending lives in `functions/src/lib/email.ts` via `resend`. |

---

## J3. Redundant Dependencies (`raw/dep-usage-check.txt`)

1. **`framer-motion` (`^12.23.25`) + `motion` (`^12.38.0`):**
   - Both packages are installed in root `dependencies` (`package.json:L61,L66`).
   - **54 files** import from `"framer-motion"`, while **8 files** (`src/components/motion/animated-sidebar.tsx:L11`, `src/components/motion/shared-layout-bg.tsx:L9`, `src/components/ui/sticky-banner.tsx:L3`, `src/components/ui/container-scroll-animation.tsx:L3`, `src/components/kokonutui/spotlight-cards.tsx:L15`, `src/components/ui/typing-animation.tsx:L18`, `src/components/ui/macbook-scroll.tsx:L3`, `src/components/ui/text-animate.tsx:L10`) import from `"motion/react"`.
   - Even worse, `src/components/ui/spotlight-cards.tsx:L15` imports from `"framer-motion"` while its clone `src/components/kokonutui/spotlight-cards.tsx:L15` imports from `"motion/react"`.
2. **`radix-ui` meta-package (`^1.4.3`) + 14 individual `@radix-ui/react-*` packages (`package.json:L19-L32,L69`):**
   - 3 components (`src/components/ui/slider.tsx:L4`, `src/components/ui/checkbox.tsx:L5`, `src/components/ui/accordion.tsx:L5`) import from the monolithic `"radix-ui"` package, while 16 components import from `@radix-ui/react-*` individual packages.
3. **Markdown / HTML Conversion (`react-markdown` + `showdown` + `turndown`):**
   - `react-markdown` (`^10.1.0`) is used in `src/components/markdown-renderer.tsx:L4` and `src/components/math-builder-modal.tsx:L15`.
   - `showdown` (`^2.1.0`) and `turndown` (`^7.2.2`) are imported exclusively in `src/app/student/notebook/page.tsx:L67-L68` to convert Markdown ↔ HTML for the TipTap rich-text editor.
4. **TipTap `@tiptap/starter-kit` (`^3.20.0`) + 12 redundant `@tiptap/extension-*` packages (`package.json:L33-L49`):**
   - `src/components/rich-text-editor.tsx:L3-L7` is the **only** file in the repository that imports `@tiptap/*`, and it only imports `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-underline`, `@tiptap/extension-text-align`, and `@tiptap/extension-placeholder`.
   - The 11 individually listed packages (`@tiptap/extension-blockquote`, `bold`, `bullet-list`, `code-block`, `heading`, `history`, `italic`, `link`, `list-item`, `ordered-list`, `strike`) are **already included inside `@tiptap/starter-kit`** and are never imported in code (`raw/knip.txt`). Furthermore, in TipTap v3, `@tiptap/starter-kit` also bundles `underline` and `link` out of the box.

---

## J4. Unused Dependencies (`raw/knip.txt`, `raw/dep-usage-check.txt`)

Combining `npx knip` with full-repo `rg` verification identified **29 unused `dependencies`** and **3 unused `devDependencies`** in root `package.json`:

### Category A: Zero References Anywhere in Source Code (24 packages)

| Package | Location in `package.json` | Verification |
|---|---|---|
| `vercel` (`^50.39.0`) | `dependencies` (`L90`) | 0 imports. Deployment CLI accidentally installed as a production dependency. |
| `sib-api-v3-sdk` (`^8.5.0`) | `dependencies` (`L84`) | 0 imports. Deprecated Brevo SDK; pulls in deprecated `superagent@3.7.0`, `formidable@1.2.6`, `querystring@0.2.0`. |
| `firebase-functions` (`^7.2.2`) | `dependencies` (`L60`) | 0 imports in `src/`; belongs only in `functions/package.json`. |
| `zod` (`^4.1.13`) | `dependencies` (`L91`) | 0 imports in `src/`, `functions/`, or tests. |
| `@polar-sh/nextjs` (`^0.9.3`) | `dependencies` (`L17`) | 0 imports (app uses `@polar-sh/sdk` directly in `src/lib/polar.ts`). |
| `@hookform/resolvers` (`^5.2.2`) | `dependencies` (`L15`) | 0 imports. |
| `@lucide/lab` (`^0.1.2`) | `dependencies` (`L16`) | 0 imports. |
| `@radix-ui/react-icons` (`^1.3.2`) | `dependencies` (`L22`) | 0 imports (app uses `lucide-react`). |
| `@vercel/analytics` (`^2.0.1`) | `dependencies` (`L50`) | 0 imports (never mounted in `src/app/layout.tsx`). |
| `@vercel/speed-insights` (`^2.0.0`) | `dependencies` (`L51`) | 0 imports (never mounted in `src/app/layout.tsx`). |
| `baseline-browser-mapping` (`^2.10.10`) | `dependencies` (`L52`) | 0 imports. |
| `mathjs` (`^15.2.0`) | `dependencies` (`L64`) | 0 imports. |
| `mathlive` (`^0.109.0`) | `dependencies` (`L65`) | 0 imports (app uses a custom math builder in `src/components/math-input.tsx`). |
| `@tiptap/extension-blockquote` | `dependencies` (`L33`) | 0 imports (bundled in `@tiptap/starter-kit`). |
| `@tiptap/extension-bold` | `dependencies` (`L34`) | 0 imports (bundled in `@tiptap/starter-kit`). |
| `@tiptap/extension-bullet-list` | `dependencies` (`L35`) | 0 imports (bundled in `@tiptap/starter-kit`). |
| `@tiptap/extension-code-block` | `dependencies` (`L36`) | 0 imports (bundled in `@tiptap/starter-kit`). |
| `@tiptap/extension-heading` | `dependencies` (`L37`) | 0 imports (bundled in `@tiptap/starter-kit`). |
| `@tiptap/extension-history` | `dependencies` (`L38`) | 0 imports (bundled in `@tiptap/starter-kit`). |
| `@tiptap/extension-italic` | `dependencies` (`L39`) | 0 imports (bundled in `@tiptap/starter-kit`). |
| `@tiptap/extension-link` | `dependencies` (`L40`) | 0 imports (bundled in `@tiptap/starter-kit`). |
| `@tiptap/extension-list-item` | `dependencies` (`L41`) | 0 imports (bundled in `@tiptap/starter-kit`). |
| `@tiptap/extension-ordered-list` | `dependencies` (`L42`) | 0 imports (bundled in `@tiptap/starter-kit`). |
| `@tiptap/extension-strike` | `dependencies` (`L44`) | 0 imports (bundled in `@tiptap/starter-kit`). |
| `@fontsource-variable/alan-sans` | `devDependencies` (`L95`) | 0 imports (fonts are loaded from `/public/fonts/` in `src/app/layout.tsx`). |
| `@google-cloud/vertexai` | `devDependencies` (`L96`) | 0 imports. |
| `node-mocks-http` | `devDependencies` (`L110`) | 0 imports in `__tests__/` or `tests/`. |
| `firebase-functions-test` (`^3.4.1`) | `functions/package.json` `devDependencies` (`L29`) | Flagged by `npx fallow dead-code` (`raw/fallow-dead-code.txt:L116`): 0 imports anywhere in `functions/`. |

### Category B: Only Imported by Dead/Unreachable Components (5 packages)

| Package | Location in `package.json` | Dead File That Imports It |
|---|---|---|
| `cobe` (`^2.0.1`) | `dependencies` (`L56`) | Only imported in unused `src/components/cobe-globe.tsx`. |
| `react-globe.gl` (`^2.37.1`) | `dependencies` (`L73`) | Only imported in unused `src/components/scorpio-globe.tsx`. |
| `three` (`^0.184.0`) | `dependencies` (`L87`) | 0 direct imports; only installed as peer dep of `react-globe.gl` for unused `scorpio-globe.tsx`. |
| `react-hook-form` (`^7.68.0`) | `dependencies` (`L74`) | Only imported in unused `src/components/ui/form.tsx`. |
| `@radix-ui/react-separator` (`^1.1.8`) | `dependencies` (`L29`) | Only imported in unused `src/components/ui/separator.tsx`. |

---

## J5. License Audit (`raw/licenses.txt`)

Root `package.json:L4` declares `"license": "MIT"`. Across all 1,538 installed root packages:
- **Permissive (1,378 packages):** MIT (1,096), Apache-2.0 (137), ISC (75), BSD-3-Clause (30), BSD-2-Clause (14), BlueOak-1.0.0 (12), Unlicense/CC0/0BSD (6).
- **Weak Copyleft / Dual-Licensed (11 packages):**
  - `MPL-2.0` (9 packages): `lightningcss@1.30.2`, `lightningcss-darwin-arm64@1.30.2` (build-time CSS), `@edge-runtime/*` (6 packages, dev/build), `axe-core@4.11.0` (dev).
  - `LGPL-3.0-or-later` (1 package): `@img/sharp-libvips-darwin-arm64@1.2.4` (Next.js server image optimization binary).
  - `(BSD-3-Clause OR GPL-2.0)` (1 package): `node-forge@1.3.3` (root) / `node-forge@1.4.0` (`functions`) — dual-licensed, so permissive `BSD-3-Clause` applies.
- **No strong copyleft (GPL/AGPL-only) packages** are bundled into client or server application code.

---

## J6. Lockfile & Engine Health (`raw/npm-ci.txt`, `raw/build.txt`)

1. **`npm ci` consistency:** Both `npm ci` (root) and `cd functions && npm ci` succeed with exit code `0`, confirming `package-lock.json` and `functions/package-lock.json` are in sync with their respective `package.json` manifests.
2. **Missing `engines` and `.nvmrc` at root:**
   - `functions/package.json:L12-L14` specifies `"engines": { "node": "22" }`, which emitted `npm warn EBADENGINE Unsupported engine { required: { node: '22' }, current: { node: 'v24.12.0' } }` during `npm ci`.
   - Root `package.json` has **no `engines` field**, and there is **no `.nvmrc` or `.node-version`** file in the repository root.
   - Root `@types/node` is set to `"^20"` (`package.json:L100`) instead of `"^22"`.
3. **Stray parent lockfile warning during `next build` (`raw/build.txt:L5-L10`):**
   - `next build --webpack` warns: `We detected multiple lockfiles and selected the directory of /Users/pradeepmahdevu/package-lock.json as the root directory. To silence this warning, set outputFileTracingRoot in your Next.js config`. Without `outputFileTracingRoot` set in `next.config.mjs`, standalone build tracing resolves relative to the parent directory when a lockfile exists above the repo.

---

## Standard Findings

### Finding `J-001`
| Field | Value |
|---|---|
| `id` | `J-001` |
| `severity` | `High` |
| `category` | `deps` |
| `location` | `package.json:L59-L91` |
| `evidence` | `package.json` places the `vercel` deployment CLI (`"vercel": "^50.39.0"` at `L90`), the deprecated Brevo SDK (`"sib-api-v3-sdk": "^8.5.0"` at `L84`), and `"firebase-functions": "^7.2.2"` (`L60`) in production `dependencies`. None of these 3 packages is imported anywhere in `src/` (`raw/dep-usage-check.txt`). In `raw/npm-audit.json` (`97 vulnerabilities: 6 critical, 39 high`), `vercel` and `sib-api-v3-sdk` alone account for the majority of High/Critical transitive advisories (`@vercel/*`, `tar@7.5.7`, `handlebars`, `path-to-regexp`, `superagent@3.7.0`, `formidable@1.2.6`, `fast-xml-builder`). |
| `impact` | Bloats `node_modules` by hundreds of megabytes, slows down CI/deployment installs, and introduces dozens of avoidable High/Critical CVEs and deprecated unmaintained packages (`inflight`, `glob@7`, `superagent@3`, `formidable@1`) into the production dependency tree. |
| `recommendation` | Uninstall `vercel`, `sib-api-v3-sdk`, and `firebase-functions` from root `package.json` (`npm uninstall vercel sib-api-v3-sdk firebase-functions`). Use `npx vercel` (or global/CI runner CLI) for deployments. |
| `effort` | `S` |
| `confidence` | `High` |

### Finding `J-002`
| Field | Value |
|---|---|
| `id` | `J-002` |
| `severity` | `High` |
| `category` | `security` |
| `location` | `package.json:L67` |
| `evidence` | `npm audit` (`raw/audit-summary.txt`) reports Critical/High vulnerabilities in direct runtime dependencies: `next@^16.2.1` (Critical advisory affecting `9.3.4-canary.0 - 16.4.0`), `@tiptap/*@^3.20.0` (High advisories in `@tiptap/core <= 3.30.4` and `prosemirror-view < 1.42.3`), `zod@^4.1.13` (High advisory in `< 4.6.6`), and in `functions/package.json:L17`, `@google/genai@^0.13.0` (High advisory in `0.9.0 - 1.8.0` plus transitive `zod < 4.6.6`, `protobufjs <= 7.6.4`, `websocket-driver <= 0.7.4`). |
| `impact` | Known Critical and High vulnerabilities in the active web framework (`next`), rich-text editor (`@tiptap/*` / `prosemirror-view`), and Cloud Functions AI SDK (`@google/genai`) remain unpatched in production. |
| `recommendation` | Upgrade `next` and `eslint-config-next` to `^16.4.6`, upgrade `@tiptap/*` packages to `^3.33.1`, upgrade `zod` to `^4.6.7` (or remove if unused), and upgrade `@google/genai` in `functions/package.json` to `^3.2.0` (or `>=1.9.0`), then run `npm audit fix` in both root and `functions/`. |
| `effort` | `S` |
| `confidence` | `High` |

### Finding `J-003`
| Field | Value |
|---|---|
| `id` | `J-003` |
| `severity` | `Medium` |
| `category` | `deps` |
| `location` | `package.json:L61-L66` |
| `evidence` | Root `package.json` installs both `"framer-motion": "^12.23.25"` (`L61`) and `"motion": "^12.38.0"` (`L66`). Across `src/`, 54 files import from `"framer-motion"` while 8 files import from `"motion/react"` (`raw/dep-usage-check.txt`). Similarly, `package.json` installs both the monolithic `"radix-ui": "^1.4.3"` (`L69`, used in 3 files: `slider.tsx`, `checkbox.tsx`, `accordion.tsx`) and 14 individual `@radix-ui/react-*` packages (`L19-L32`), and installs 11 `@tiptap/extension-*` packages (`L33-L44`) that are already bundled inside `@tiptap/starter-kit` (`L49`). |
| `impact` | Bundling both `framer-motion` (12.23.25) and `motion` (12.38.0) duplicates animation runtime code in client JS bundles and risks React context conflicts between `AnimatePresence` / `LayoutGroup` boundaries. |
| `recommendation` | Standardize all 8 `"motion/react"` imports onto `"framer-motion"` (or migrate all 54 `"framer-motion"` imports to `"motion/react"`) and uninstall the duplicate package; standardize `slider.tsx`, `checkbox.tsx`, and `accordion.tsx` on `@radix-ui/react-*` (or vice versa); and remove the 11 redundant `@tiptap/extension-*` packages already included in `@tiptap/starter-kit`. |
| `effort` | `S` |
| `confidence` | `High` |

### Finding `J-004`
| Field | Value |
|---|---|
| `id` | `J-004` |
| `severity` | `Medium` |
| `category` | `deps` |
| `location` | `package.json:L15-L110` |
| `evidence` | `npx knip` (`raw/knip.txt`) and `rg` verification (`raw/dep-usage-check.txt`) found 29 unused `dependencies` and 3 unused `devDependencies` in `package.json`. Even excluding the 11 redundant TipTap extensions and 3 misplaced server/CLI packages (`J-001`, `J-003`), 18 packages are completely unused (`@hookform/resolvers`, `@lucide/lab`, `@polar-sh/nextjs`, `@radix-ui/react-icons`, `@vercel/analytics`, `@vercel/speed-insights`, `baseline-browser-mapping`, `mathjs`, `mathlive`, `zod`, `@fontsource-variable/alan-sans`, `@google-cloud/vertexai`, `node-mocks-http`) or only referenced by dead components (`cobe`, `react-globe.gl`, `three`, `react-hook-form`, `@radix-ui/react-separator`). |
| `impact` | Over 30% of the declared dependencies in `package.json` are dead weight, increasing install times, lockfile churn, and security audit noise. Notably, `zod` (`L91`), `@vercel/analytics` (`L50`), and `@vercel/speed-insights` (`L51`) were installed but never wired up. |
| `recommendation` | Uninstall unused packages (`npm uninstall @hookform/resolvers @lucide/lab @polar-sh/nextjs @radix-ui/react-icons baseline-browser-mapping mathjs mathlive cobe react-globe.gl three @fontsource-variable/alan-sans @google-cloud/vertexai node-mocks-http`), and either wire up `@vercel/analytics`, `@vercel/speed-insights`, and `zod` (for API route validation) or remove them. |
| `effort` | `S` |
| `confidence` | `High` |

### Finding `J-005`
| Field | Value |
|---|---|
| `id` | `J-005` |
| `severity` | `Medium` |
| `category` | `deps` |
| `location` | `package.json:L108-L112` |
| `evidence` | `package.json` pairs `"jest": "^30.2.0"` (`L109`) and `"@types/jest": "^30.0.0"` (`L99`) with `"ts-jest": "^29.4.6"` (`L112`), and pins `"eslint-config-next": "16.0.7"` (`L108`) against `"next": "^16.2.1"` (`L67`). Additionally, root `package.json` and `functions/package.json` drift on `react`/`react-dom` (`19.2.0` vs. `^19.2.4`), `firebase-admin` (`^13.7.0` vs. `^13.6.0`), and `typescript` (`5.9.3` vs. `^5.7.3`). |
| `impact` | `ts-jest@29` is built for Jest 29 APIs and is unsupported on Jest 30; version drift between root and `functions/` can cause subtle type and runtime discrepancies. |
| `recommendation` | Align `eslint-config-next` with `next` (`16.4.6`), align `react`, `react-dom`, `firebase-admin`, and `typescript` specs across `package.json` and `functions/package.json`, and upgrade `ts-jest` when a Jest 30-compatible release is used or switch `jest.config.js` to `next/jest` / `@swc/jest`. |
| `effort` | `S` |
| `confidence` | `High` |

### Finding `J-006`
| Field | Value |
|---|---|
| `id` | `J-006` |
| `severity` | `Low` |
| `category` | `devex` |
| `location` | `package.json:L1-L12` |
| `evidence` | `functions/package.json:L12-L14` requires `"engines": { "node": "22" }` (causing `EBADENGINE` warnings under Node `v24.12.0` in `raw/npm-ci.txt`), whereas root `package.json` has no `engines` field, `@types/node` is pinned to `^20` (`package.json:L100`), and there is no `.nvmrc` or `.node-version` file at the repo root. Furthermore, `next build` (`raw/build.txt:L5-L10`) warns about multiple lockfiles because `outputFileTracingRoot` is not configured in `next.config.mjs`. |
| `impact` | Developers and CI runners can inadvertently run mismatched Node versions (Node 20 vs. 22 vs. 24), and Next.js file tracing can resolve against a parent directory's `package-lock.json`. |
| `recommendation` | Add `"engines": { "node": ">=22 <23" }` to root `package.json`, create a `.nvmrc` containing `22`, update `@types/node` to `^22`, and set `outputFileTracingRoot: import.meta.dirname` in `next.config.mjs`. |
| `effort` | `S` |
| `confidence` | `High` |

---

## Workstream J Score

**Score: 2 / 5 (Significant risk / notable supply-chain debt)**

**Justification:**  
While lockfiles are consistent with `npm ci` and license compliance is clean (MIT/Apache/ISC with no strong copyleft in app code), the dependency hygiene has significant issues: **32 of 97 declared dependencies in root `package.json` are unused** (`J-004`), the `vercel` CLI and deprecated `sib-api-v3-sdk` are installed in production `dependencies` (`J-001`), `npm audit` reports **97 vulnerabilities in root (6 critical, 39 high)** and **48 in `functions/` (3 critical, 13 high)** including unpatched advisories in `next`, `@tiptap/*`, `zod`, and `@google/genai` (`J-002`), and heavy libraries like `framer-motion` + `motion` and `radix-ui` + `@radix-ui/*` are duplicated (`J-003`).
