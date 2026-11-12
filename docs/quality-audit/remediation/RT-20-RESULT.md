# RT-20 result: dependency hygiene (J-001, J-003, J-004, J-005; also I-008, I-009, I-011, H-009, E-011, J-006)

Branch `rt-20-dependency-hygiene` (from `remediation/audit-2026-11` f185431). Every commit: fresh `npm ci` in the root and
`functions/` (npm 11), then `[gate] PASS` (`GATE_PORT_OFFSET=2600`; 94 security tests pass; ESLint 238 errors / 175 warnings, ceiling
242 / 181, lower because the deleted dead files carried findings).

| Commit | Change |
|---|---|
| 0315353 | root: remove `vercel`, `sib-api-v3-sdk`, `firebase-functions` (J-001) |
| ea6fc74 | root: remove 17 unused deps, delete 6 dead files; functions: remove `firebase-functions-test` (J-004) |
| 3b09607 | remove 11 `@tiptap/extension-*` already inside `starter-kit` (J-003) |
| 9de1560 | `motion` -> `framer-motion` (8 imports changed), drop `motion` (J-003) |
| d464d7f | `radix-ui` meta-package -> scoped `@radix-ui/react-{accordion,checkbox,slider}` (J-003) |
| 20fb315 | `eslint-config-next` 16.0.7 -> 16.3.8, `ts-jest` 29.4.6 -> 29.4.15 (J-005) |
| 2ba746e | root react/react-dom 19.2.0 -> 19.2.4, `@types/node` ^22; functions `firebase-admin ^13.7.0`, `firebase-functions ^7.2.2`, `typescript 5.9.3` (J-005/J-006) |

The first lockfile attempt for 0315353 failed `npm ci` (npm pruned `@emnapi/runtime` from the lock); fixed with
`npm install --package-lock-only`. No major bump was needed or taken.

## Proof of non-use (removals)
Method: `rg -F <pkg>` over the repo excluding lockfiles and docs, plus an import scanner (static `from`, `import()`, `require`) over
`src __tests__ tests tools next.config.mjs jest*.* eslint.config.mjs postcss.config.mjs`, the CI workflow and package scripts. Results:
zero hits for `vercel` (only the `x-vercel-forwarded-for` header string in `src/lib/client-ip.ts` and tests), `sib-api-v3-sdk`,
`@hookform/resolvers`, `@lucide/lab`, `@polar-sh/nextjs`, `@radix-ui/react-icons`, `@vercel/analytics`, `@vercel/speed-insights`,
`baseline-browser-mapping` (still installed through `next`), `mathjs`, `mathlive` (README prose only), `@fontsource-variable/alan-sans`,
`@google-cloud/vertexai` (only the string `vertexai: true` in `functions/src/grading.ts`), `node-mocks-http`, `firebase-functions-test`,
and the 11 tiptap extensions. `firebase-functions` is imported only under `functions/src` (declared there).

Used only by dead files (nothing imports the files; knip "unused files" plus `rg`): `cobe` (cobe-globe.tsx), `react-globe.gl` and
`three` (scorpio-globe.tsx, imported only by feature-section.tsx), `react-hook-form` (ui/form.tsx), `@radix-ui/react-separator`
(ui/separator.tsx, imported only by ui/sidebar.tsx). Those six files were deleted. `tsc` (root and functions), jest and `next build` pass.

Kept despite looking unused in a naive scan: `zod` (now used by `src/lib/schemas`, `api-schema.ts`; RT-07/11), `tw-animate-css` and
`@tailwindcss/*` (globals.css, postcss), `babel-plugin-react-compiler` (`reactCompiler: true`), `@tiptap/pm` (peer of tiptap),
`@stryker-mutator/core` (stryker.config.json), `react-dom` in functions (peer of `@react-email/components`).

Missing-dependency check: no import in src/tests/tools/functions names an undeclared package. Direct deps added for what code imports:
the three scoped radix packages.

`dependencies` vs `devDependencies`: nothing moved. Firebase Hosting frameworks (`firebase.json` `hosting.source: "."`) builds the app
and installs production `dependencies` for the server, so everything the runtime needs must stay there; the build-only tools were
already in `devDependencies`. No package was listed in both.

## npm audit --omit=dev (totals)
| | Before | After |
|---|---|---|
| root | 64 (1 critical, 32 high, 25 moderate, 6 low) | 19 (0 critical, 4 high, 9 moderate, 6 low) |
| functions/ | 14 (0 critical, 0 high, 10 moderate, 4 low) | 14 (unchanged; no high or critical) |

`npm audit --omit=dev --audit-level=high` still exits non-zero at the root (4 high, one root cause); functions exits 0.

## Remaining at root: reachability
| Advisory | Path | Reachability |
|---|---|---|
| high: `@grpc/grpc-js` <=1.13.5 (auth context, error-message leak), `@firebase/firestore`, `@firebase/firestore-compat`, `firebase` | `firebase@12.6.0` -> `@firebase/firestore` pins `@grpc/grpc-js ~1.9`; firebase 13.3.0 (`@firebase/firestore` 4.20.0) still pins `~1.9.0`, so a major bump does not fix it | The web SDK talks to Google over WebChannel/fetch in browsers; grpc-js is a server-side gRPC library not part of the client bundle. The advisories concern gRPC servers and credential handling. Low reachability. Needs an upstream release or an `overrides` entry (not applied: outside the declared range). |
| moderate: `@google-cloud/firestore`, `@google-cloud/storage`, `google-gax`, `gaxios`, `retry-request`, `teeny-request`, `uuid` | `firebase-admin` 13.7 | `uuid` bounds check only applies when a caller passes `buf` to v3/v5/v6; used inside Google client retry code, not with attacker input. Fix is `firebase-admin` 14 (major; not attempted: it sits under every API route and the fix is moderate only). |
| moderate: `showdown` (XSS in metadata title, table header id) | direct, `src/app/student/notebook/page.tsx` | No fix exists. Converts the student's own notebook Markdown to HTML for TipTap, which parses through its schema; self-XSS reach only. Candidate for replacement (FOLLOWUPS). |
| low: katex chain, `@tootallnate/once` | katex, react-katex, rehype-katex, remark-math; Google clients | Fixes are majors of the math renderers; low severity. |

## Acceptance
- `npm ls motion framer-motion`: only `framer-motion@12.38.0`.
- `npm ls ts-jest jest`: ts-jest 29.4.15 on jest 30.5.2. There is no ts-jest 30; 29.4.15 declares peer `jest ^29 || ^30`, so support is
  official although the major numbers differ.
- `eslint-config-next` 16.3.8 vs `next` 16.4.1: two minors behind; 16.4.x needs `eslint-plugin-react-hooks ^7.1.0`, which lifts ESLint
  errors above the ceiling (RT-02). Re-evaluate after the hooks-rule fixes.
- `npx knip` unused dependencies/devDependencies: only `@stryker-mutator/core` (used by stryker.config.json; knip config noise). Knip also
  lists `functions/` imports as unlisted because `functions/` is not configured as a knip workspace.
- Smoke: `next dev --webpack -p 4600` with demo Firebase env: `/` 200, `/login` 200; stopped; generated `AGENTS.md` and the
  `next-env.d.ts` edit were reverted.
