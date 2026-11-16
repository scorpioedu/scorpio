# RT-33: deploy path facts (no decision taken)

The owner decides. This file records what the repository says today and what each path would need. Nothing was deployed or configured.

## What the repository indicates

| Source | Fact |
|---|---|
| `firebase.json` `hosting` | `source: "."` with `frameworksBackend: { region: "us-central1" }`: Firebase Hosting web frameworks (Next.js on a Cloud Function/Cloud Run). Cache headers for static assets. No `predeploy` for hosting. |
| `firebase.json` `functions` | Codebase `default`, source `functions/`, `predeploy` runs `npm --prefix functions run build`. |
| `.firebaserc` | Exists, tracked: single alias `default` -> `scorpio-srs` (a real project id is already committed; it is an identifier, not a secret). No staging/prod aliases. |
| `package.json` | No `vercel` dependency (removed in RT-20), no `@vercel/*`. Scripts: `build`, `start`, no deploy script. |
| `.github/workflows/ci.yml` | typecheck, lint, test, security tests, build, audit. No deploy job for either target. |
| `README.md` Deployment | `npm run build && firebase deploy` plus the RT-33 TODO (kept, now links this file). |
| Vercel artefacts | None tracked: no `vercel.json`, no `.vercel/` (only ignored in `.gitignore`). |
| Code | `src/lib/client-ip.ts` reads only `x-vercel-forwarded-for` then `x-real-ip` (DECISIONS.md: owner said production is on Vercel). With no such header, per-IP limits are skipped or not shared (`rate-limit.ts`, `landing/route.ts`). |
| `apphosting.yaml` | Absent. |

Conclusion: the repo config says Firebase Hosting, the owner and the rate-limit code say Vercel. They disagree. If production is on Vercel, `firebase.json` `hosting` is unused; if it is on Firebase Hosting, per-IP limiting is currently ineffective.

## Path A: Vercel (app) + Firebase (Auth, Firestore, Storage, Functions)

- Build: `npm run build` (`next build --webpack`), install `npm ci`. Node 22 needs npm 11 (lockfile), as in CI.
- Env vars (Vercel project, per environment): everything in `.env.example` (server-side Firebase Admin credentials by variable name, `NEXT_PUBLIC_FIREBASE_*`, AI keys, Polar plan ids/secrets, landing visitor HMAC secret). Preview and Production should use separate Firebase projects or at least separate keys.
- Headers: `next.config.mjs` headers are applied by Vercel.
- Rate-limit IP: `x-vercel-forwarded-for` is set by Vercel; works as designed.
- Functions and rules: deployed separately by a human or CI: `firebase deploy --only functions,firestore:rules,firestore:indexes,storage --project <id>` (CI needs a token or workload identity).
- Cleanup if chosen: remove the `hosting` block from `firebase.json`; finalise README Deployment; add `vercel.json` only if needed.

## Path B: Firebase Hosting webframeworks + Functions

- Build/deploy: `firebase deploy --project <id>`; the Firebase CLI runs the framework build (web frameworks experiment, Blaze billing). Functions predeploy builds `functions/`.
- Env vars: server secrets must be provided through Firebase (`.env.<project>` in the deploy source or Secret Manager); `NEXT_PUBLIC_*` must exist at build time on the deploying machine/CI. `.env*` is gitignored, so CI must inject them.
- Headers: `next.config.mjs` headers apply via the SSR function; `firebase.json` `hosting.headers` also apply to static assets.
- Rate-limit IP: Hosting/Cloud Run supplies `x-forwarded-for` and not `x-vercel-forwarded-for`; `client-ip.ts` would need a change (and a trust-model review) or per-IP limits stay off. `x-real-ip` is not set.
- Add `.firebaserc` aliases (see `.firebaserc.example`) for staging/prod and a CI deploy job gated on typecheck, lint, tests and `test:security`.

## Recommendation

Vercel for the Next.js app (matches the owner statement and the shipped IP-header logic, avoids rewriting trusted-IP code), Firebase for Auth/Firestore/Storage/Functions. Then: delete the `hosting` section from `firebase.json`, rewrite README Deployment (Vercel build + `firebase deploy --only functions,firestore,storage`), and add staging/prod aliases to `.firebaserc`. Until that decision is recorded, README keeps its TODO.
