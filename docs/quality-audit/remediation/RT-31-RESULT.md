# RT-31 result: lint and type safety (safe parts)

Findings: A-001 (also H-007), A-003, A-004, A-007 (partly), A-008 (not started), H-005, H-006 (partly).
Branch `rt-31-lint`, based on `remediation/audit-2026-11`.

## Before / after (`eslint .`, same ignore patterns as the gate)

| Rule | Before | After |
|---|---|---|
| `@typescript-eslint/no-explicit-any` (errors) | 131 | 0 |
| `react/no-unescaped-entities` | 47 | 0 |
| `prefer-const` | 13 | 0 |
| `@typescript-eslint/no-require-imports` | 9 | 6 (all CommonJS files, see below) |
| `@typescript-eslint/no-empty-object-type` | 4 | 0 |
| `@typescript-eslint/ban-ts-comment` | 3 | 0 |
| `react-hooks/immutability` | 2 | 1 |
| `react-hooks/set-state-in-effect` | 9 | 9 (skipped) |
| `react-hooks/refs` | 3 | 3 (skipped) |
| `react-hooks/purity` | 1 | 1 (skipped) |
| **Errors total** | **222** | **20** |
| Warnings total | 171 | 168 |
| `no-unused-vars` (warning) | 165 | 164 |

`baseline-counts.json` is ratcheted to 20 errors / 168 warnings.

## Gate results

- Batch 1 (prefer-const, entities, require, server `any`): `[gate] PASS`, eslint 96 errors / 168 warnings.
- Batch 2 (components `any`, catch variables, sidebar, ts-ignore): `[gate] PASS`, eslint 20 errors / 168 warnings.
- Both runs: tsc root and functions clean, jest green (59 suites, 898 tests), security emulator suite 94 passed / 0 failed, `next build` OK.

## How behaviour preservation was checked

- `prefer-const`: eslint `--fix`, diff reviewed (13 `let` to `const`).
- Entities: 47 replacements (`'` `"` `>` `}` to `&apos;` `&quot;` `&gt;` `&#125;`) in 16 files. A TypeScript AST script compared the decoded `JsxText` and JSX string attributes of every touched file against `HEAD`: 16 files, 0 mismatches. (This is stronger than a few renderToStaticMarkup samples, because it covers every changed node.)
- `any` removal is type-only except where noted below; `tsc` passes at root and in `functions/` after every batch.
- Browser (local Next dev server, Firebase emulators on shifted ports, test user): `/` renders, `/login` renders, student sign-in lands on `/student` (dashboard, touched `page-client.tsx`), `/student/grades` and `/student/notebook` load. The only console error is a Firestore `permission-denied` on the organisation read for a seeded student with no organisation (rules behaviour, unrelated to this change).

## Deliberate small code changes (not purely type-level)

- `src/lib/ai/utils.ts`, `src/lib/ai/assignment.ts`: removed two dead locals that were only kept alive by `@ts-ignore` (`inQuestion`, `isTruncated`/`finReason`); never read.
- `src/components/landing/workspace-preview-pages.tsx`: removed the `p.type === "free-response"` arm (the manual parser never produces that type) and moved the `gradingRubric` `useState` above the effect that calls its setter (hook order is stable per render, so behaviour is the same).
- `src/lib/ai/config.ts`: a bare-string request is normalised to `{}` for option reads; `string?.x` was `undefined` before, `{}.x` is `undefined` now.
- `catch (e: any)` became `catch (e: unknown)` with `errorMessage`/`errorCode` from the new, tested `src/lib/error-utils.ts`. State setters that could receive `undefined` now receive `""` or `null` (both falsy, only used for truthiness). `${error.message}` templates still print `undefined` exactly as before.
- `tests/security/*.test.ts`: `require('firebase-admin')` inside `jest.mock` factories replaced by `jest.requireActual('firebase-admin')` (same module instance; the 94 emulator tests pass). `__tests__/ai-system-instruction.test.ts`, `__tests__/landing-chat.test.ts`, `src/lib/student-submissions.test.ts`: only parameter types changed.
- Dates in `student/page-client.tsx` go through a small `dateMs` helper that reproduces the previous seconds-or-parse arithmetic.

## Not done and why

See `FOLLOWUPS.md` (section RT-31) for the list with file:line.

- 9 `react-hooks/set-state-in-effect`, 3 `react-hooks/refs`, 1 `react-hooks/purity`, 1 `react-hooks/immutability`: effect/ref/render refactors change timing; skipped per ticket guidance.
- 6 `no-require-imports`: `jest.config.js`, `tests/security/rules.test.cjs` (4), `tools/migrate-school-security.cjs` are CommonJS entry points; converting to ESM means renaming files and changing how jest/firebase tooling loads them.
- 164 `no-unused-vars` warnings: not touched (warnings; mostly unused imports; a separate mechanical pass).
- Ticket parts not attempted: enabling stricter rules, `eslint-plugin-security` (not installed; no new dependencies allowed), blocking CI lint job, `tsconfig` including `functions/` (A-008), complexity warnings.

## Cost of enabling the stricter rules (scratch config, type-aware, not committed)

Measured with `projectService: true` on the whole repo after this pass:

| Rule | Findings |
|---|---|
| `@typescript-eslint/no-floating-promises` | 69 |
| `@typescript-eslint/no-misused-promises` | 101 |
| `@typescript-eslint/consistent-type-imports` | 87 (auto-fixable) |
| `complexity` (warn at 15) | 79 |
| `eslint-plugin-security` | not measurable (package not installed) |
