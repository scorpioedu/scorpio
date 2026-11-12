# RT-33 result (safe, non-history parts)

## Root clutter: proof and action

Tracked root files checked with `git grep` across the repo (excluding audit docs), `package.json` scripts, `.github/workflows/ci.yml`, `tsconfig.json`, `eslint.config.mjs`, `jest*.js/cjs`, `firebase.json`.

| File | References | Action |
|---|---|---|
| `check_portfolios.ts` | None. Prod-DB debug script importing `./src/lib/firebase-admin`; it was compiled by tsc via the `**/*.ts` include. | Removed |
| `update_mermaid.py` | None. One-off script that rewrote README diagrams. | Removed |
| `diagram.mermaid` | None (README embeds the diagram inline). | Removed |
| `demo.md` | None; a video narration script. `.gitignore` already lists `DEMO.md` as scratch. | Removed |
| `LAYERING.MD` | Linked from `CONTRIBUTING.md` and `opencode.json`. | Kept; HUMAN-TODO |
| `UIAUDIT.MD` | No references. | Kept; HUMAN-TODO |
| `opencode.json` | Tool config; also lists `AUDIT.md` (does not exist) and `GROUNDING_SKILL.md` (gitignored). | Kept; HUMAN-TODO |
| `CHANGELOG.md` | Stale (L-009). | Kept; owner decision |
| `firestore-debug.log`, `tsconfig.tsbuildinfo` | Not tracked (`git ls-files` shows neither); already covered by `.gitignore` (`firestore-debug.log*`, `*.log`, `*.tsbuildinfo`). | None |
| `public/Rushil_Mahadevu_Resume_2026.pdf` | No code references. Personal document. | NOT touched; HUMAN-TODO |
| Other root files (configs, licences, rules, lock) | Referenced by tooling | Kept |

`.gitignore`: added `.next-*/` (the rest, `/coverage`, `*.tsbuildinfo`, `*.log`, `.next-verify/`, `/.next-gate/`, were already present). Added `.firebaserc.example` (placeholders only). `.firebaserc` already commits the real project id `scorpio-srs`; reported, unchanged.

## Repo size facts (input for the history decision)

- `du -sh .git`: 272M at time of writing (audit: 257M). Pack: 268.47 MiB, 479 commits, 7177 objects.
- Largest blobs in history (all media):

| Size | Path |
|---|---|
| 29.4 MB | public/demos/assignment-creation-teacher.mp4 |
| 26.0 MB | public/demos/student-submission-math-file.mp4 |
| 21.4 MB | public/demos/scorpio-demo.mp4 (old version) |
| 20.0 MB | public/demos/scorpio-demo.webm (old version) |
| 19.6 MB | public/demos/navigation-assistant.mp4 |
| 19.3 MB | public/demos/scorpio-demo-orig.mp4 |
| 18.5 MB | ai-tutor-chat.mp4 (root) |
| 18.0 MB | public/demos/landing-demo.webm |
| 17.0 MB | public/demos/landing-demo-v2.webm |
| 12.5 MB | public/demos/landing-demo.mp4 |
| 11.5 MB | public/demos/landing-demo-orig.mp4 |
| 8.8 MB | public/demos/landing-demo-v2.mp4 |
| 5.3 MB | public/demos/ai-tutor-chat.mp4 |
| 4.6 MB | public/demos/scorpio-demo.mp4 (current) |
| 4.4 MB | public/demos/scorpio-demo.webm (current) |
| 3.5 MB | public/demos/processed/assignment-creation-teacher.mp4 |
| 3.0 MB | public/demos/processed/student-submission-math-file.mp4 |
| 3.0 MB | public/headshot-sage.jpg |
| 2.5 MB | public/og-image.png |
| 2.2 MB | public/demos/processed/navigation-assistant.mp4 |

The top 13 media blobs total roughly 240 MB. Runbook: `RT-33-HISTORY-RUNBOOK.md` (HUMAN-ONLY, not executed).

## Not done (by design)

History rewrite, résumé/personal-asset removal, deploy-path decision (see `RT-33-DEPLOY-PATHS.md`), conventional commits/commitlint (needs new dependencies; FOLLOWUPS).
