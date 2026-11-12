# RT-02 result: patch Next.js and audited packages (C-005, J-002)

Branch `rt-02-dependency-patching`. Gate: `[gate] PASS` after each commit
(`GATE_PORT_OFFSET=500`; ESLint stayed at 242 errors / 193 warnings).

| Commit | Change |
|---|---|
| eb25776 | `next` ^16.2.1 (16.2.1) -> ^16.4.1 (16.4.1, lowest release above 16.4.0, no new major) |
| f008b44 | all `@tiptap/*` ^3.20.0 -> ^3.30.5 (`@tiptap/core` 3.30.5, `prosemirror-view` 1.41.6 -> 1.42.9); `protobufjs` 7.5.4 -> 7.6.6 (lockfile only, no override needed) |
| 8da608d | `functions/` `npm audit fix` (lockfile only) |
| 0442256 | `functions/` `@google/genai` ^0.13.0 -> ^3.2.0 (isolated major; `grading.ts` unchanged, tsc + gate green) |
| 62c1e1b | root `npm audit fix` (lockfile only, `package.json` untouched) |

## npm audit --omit=dev totals

| | Before | After |
|---|---|---|
| root | 76 (5 critical, 38 high, 27 moderate, 6 low) | 64 (1 critical, 32 high, 25 moderate, 6 low) |
| functions/ | 30 (3 critical, 9 high) | 13 (0 critical, 0 high, 9 moderate, 4 low) |

(The ticket's 97/48 counted dev dependencies; these are `--omit=dev`.)
`next` is no longer flagged; `node -p "require('next/package.json').version"` = 16.4.1.
`npm audit --omit=dev --audit-level=high` exits 0 in `functions/`; at the root it still exits
non-zero, with the reachability notes below.

## Not done / decisions

- `eslint-config-next` stays at exact `16.0.7`. 16.4.1 pulls `eslint-plugin-react-hooks` 7.1.1,
  whose new rules (`set-state-in-effect` etc.) raise ESLint errors 242 -> 269, breaching the ceiling.
  Fixing those properly is separate work (see FOLLOWUPS.md). The lock also keeps react-hooks 7.0.1.
- Root `vercel` and `sib-api-v3-sdk` removal is left to RT-20 (ticket says so).
- `firebase` stays 12.6.0 (latest 12.x still pins `@grpc/grpc-js ~1.9`; fixing needs a major or an override).

## Runtime smoke and build

`next dev --webpack -p 3400` with demo Firebase env: `/` -> 200, `/login` -> 200; server stopped.
(Dev server rewrote `next-env.d.ts` and generated an `AGENTS.md`; both reverted/removed.)
Build with 16.4.1: no new warnings in `build.log`; `Proxy (Middleware)` still listed and routes unchanged.
`next/og` / image optimizer behaviour was not exercised beyond the build.

## Remaining high/critical at root: reachability

All are devDependency-style or CLI tooling not imported by the app, except the last two rows.

| Advisory (package) | Path | Reachability |
|---|---|---|
| `vercel` and all `@vercel/*` builders, `tar` (critical), `undici`, `path-to-regexp`, `js-yaml`, `smol-toml`, `basic-ftp`, `get-uri`, `pac-proxy-agent`, `proxy-agent`, `sandbox`, `@fastify/busboy` (vercel copy), nested `zod` 3.x | only via `vercel@50.44.0`, a CLI listed in `dependencies` but never imported in `src/` or `functions/` | Not in the runtime bundle or deployed functions; only runs if someone invokes the CLI locally on untrusted input. Removed by RT-20. |
| `minimatch`, `brace-expansion`, `js-yaml` (eslint/jest copies) | eslint, jest, stryker, eslint-config-next | Build/test tooling, ReDoS on attacker-controlled glob/YAML only; no untrusted input. |
| `@grpc/grpc-js` 1.9.16, `@firebase/firestore`, `firebase` (flagged transitively) | `firebase@12.6.0` -> `@firebase/firestore@4.9.2` pinned `~1.9.0` | Client-side Firestore SDK acts only as a gRPC client to Google; the advisories concern servers and a mis-handled auth context. Low reachability; needs firebase major or override (FOLLOWUPS). |
| `path-to-regexp` (firebase-functions copy), `@fastify/busboy` (firebase-admin copy) | firebase-functions / firebase-admin | Used by the Functions framework in `functions/`; no Express routes with user-controlled patterns, no multipart handling in app code. No semver-compatible fix. |
