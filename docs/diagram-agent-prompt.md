# Prompt for the agent continuing the diagram system

Copy everything below the line into a new session.

---

Continue building Scorpio's diagram system: a small text language that Raise (the student AI tutor) and, later, the course-content pipeline use to draw physics graphs, free-body diagrams and setups. A first integration exists and works; your job is to make it trustworthy enough to switch on, then extend it. Do not deploy and do not switch it on in production; the owner decides that.

## Where things are

- **App repo:** `/Users/rushilmahadevu/source/typescript/scorpio`. Work in the worktree `.claude/worktrees/teacher-ui-085412`, which is checked out on branch `claude/raise-diagrams` (commits `139d8f58`, `fa398b40` on top of the code that is live in production). A dev server for that worktree runs on `http://localhost:3110` against the Firebase emulator (no Gemini key there).
- **Prototype ("diagram lab"):** `/Users/rushilmahadevu/source/typescript/scorpio-diagram-lab` (not in git). Its `README.md` explains the language, the token costs, the earlier model tests and the known limits. Read it first.
- **Read `AGENTS.md` in the app repo before touching framework code:** this Next.js version differs from older ones.

## What already exists on the branch

- `src/lib/diagram/`: the renderer copied from the lab (`index.ts` `render(src)` returns `{ ok, svg, alt, errors, warnings, plot }`; `plot.ts`, `fbd.ts`, `scene.ts`, `parse.ts`, `expr.ts`, `svg.ts`, `check.ts`), plus:
  - `prompt.ts`: `DIAGRAM_REFERENCE` (the language reference the model gets) and the tutor rules for explain and solve modes.
  - `blocks.ts`: `auditDiagramBlocks(text)` removes fenced `dg` blocks that cannot be drawn (errors or an unclosed fence) and returns warnings; `hideOpenDiagramBlock(text)` hides a block that is still being typed.
  - `safe.ts`: `isSafeSvg(svg)`, an allowlist of drawing elements with no handlers, links or `url()`.
- `src/components/diagram.tsx`: draws a `dg` source, or "Diagram not available". `src/components/markdown-renderer.tsx` routes fenced `dg` blocks to it, so every markdown surface draws diagrams.
- `src/lib/ai/tutor-prompts.ts`: Raise's two prompts as pure functions (`buildExplainPrompt`, `buildSolvePrompt`) with a `diagrams` switch. `src/lib/ai/tutor.ts` turns it on only when env `RAISE_DIAGRAMS=on` (off by default) and always cleans replies with `auditDiagramBlocks`.
- `src/app/student/tutor/page.tsx`: the typing effect shows a diagram only once its block is complete.
- `__tests__/diagram.test.ts`: 26 tests (rendering, error reporting, no code evaluation in `fn`, markup injection, the block checker, the typing helper, the prompt).
- Verified in a browser: a v-t graph, a free-body diagram, a scene and a broken block render correctly in light and dark themes; ordinary code blocks are unchanged.

## What a real model did (Gemini 3.8 Flash, the production model, 17 Nov 2026)

Twelve realistic student messages were sent with the exact production prompt and diagrams on. Results are in the lab at `ai/raise-e2e/raise-e2e.json` and `raise-e2e.html` (open the HTML to see each reply and its drawing).

1. **Replies are being cut off.** 5 of 8 explain replies ended with `MAX_TOKENS`, two of them after fewer than 40 visible tokens. The request allows 1,024 output tokens and the model's thinking tokens count against it (up to 983 thinking tokens in one reply). One reply was cut inside a diagram block, which the checker then removed.
2. **A diagram was valid but physically wrong.** For Newton's third law it drew "F of B on A" on block A pointing toward B (a push from B points away from B). Nothing flagged it.
3. **The model uses label markup the renderer doesn't support:** `\vec{F}_{B \text{ on } A}`. The reference only promises `F_N`, `F_{net}`, `v^2`, `\theta`.
4. **Warnings do fire on real output:** an arrow through the inside of a block (spring force drawn from the block's centre), and values off a labelled tick. These diagrams are currently kept.
5. **Explain mode drew in 5 of 8 replies; solve mode drew in 0 of 4** and correctly declined to draw the free-body diagram for a friction question.

## What to do, in this order

1. **Truncation.** First measure the baseline: run the same messages with `diagrams: false` and see how often replies end with `MAX_TOKENS`. If it happens without diagrams too, it is an existing production problem and should be reported to the owner as such. Then fix it for the tutor calls in `src/lib/ai/tutor.ts`: look up the current Gemini API documentation for how to bound or disable thinking for this model and how thinking tokens count toward `maxOutputTokens`, rather than relying on memory. Note that `src/lib/ai/config.ts` reserves budget from the maximum possible cost, so raising a limit changes what each call reserves; read `estimateMaximumCost` and the metering in `functions/src/metering` before changing it.
2. **Label markup.** Either support `\vec{}` and `\text{}` in `svg.ts` `label()` and `plain()`, or state in `DIAGRAM_REFERENCE` exactly what is allowed and make unsupported markup a renderer warning. Add tests either way.
3. **Wrong-but-valid diagrams.** Decide and implement a policy for a live tutor that nobody reviews. At minimum: treat "arrow runs through the inside of a block" as a reason to drop the diagram; add a free-body check that a body described as at rest or at constant velocity has balanced arrows; for two-body interaction scenes, check that a force labelled "X on Y" sits on Y. Measure before and after on a larger set (at least 40 messages across kinematics, forces, energy, momentum, rotation, oscillations) and review every drawing by eye. Report the rate of wrong diagrams honestly; if it is not near zero, say so and recommend keeping the switch off.
4. **Repair round.** `errorReport()` formats renderer errors for a retry. Decide whether one retry is worth the extra call's cost and delay in a live chat, using the numbers from step 3, and implement it only if it clearly helps.
5. **Re-test** the two messages that were cut off before they could draw ("show me the forces on a box sitting on a ramp", "explain how an Atwood machine works"), and check that solve mode draws a graph the problem itself describes.
6. **Only after 1–5:** the content pipeline (lab README, "Moving it into Scorpio later", steps 3 and 4): add the reference to `src/app/api/admin/content/generate`, validate each block with `render()`, check plots against the answer key with `src/lib/diagram/check.ts`, and show diagrams in the admin review screen so a person approves each one.

## How to test against the model

There is no Gemini key in the emulator setup. The owner has approved calling Gemini from a script that reads `GEMINI_API_KEY` from `/Users/rushilmahadevu/source/typescript/scorpio/.env.local`; never print or log the key. The simplest runner is a temporary jest test that imports `buildExplainPrompt` / `buildSolvePrompt` and `CONSTRAINT_LEVELS` (from `src/lib/ai/constants`), calls the REST endpoint used in `src/lib/ai/config.ts` with the same `generationConfig`, and writes results outside the repo. Delete the temporary test before committing.

## Rules

- **Never push `claude/raise-diagrams` or any branch it descends from.** Their history contains answer keys and the GitHub repo (`scorpioedu/scorpio`) is public. To publish, create a single commit on top of `origin/main` with `git commit-tree "HEAD^{tree}" -p origin/main`, confirm `git ls-tree -r` shows no `content/` files, and push that as a new branch for a pull request.
- **Do not copy the lab's `cases.ts` or `ai/candidates.json` into the repo:** they quote real problems and keys.
- **Do not deploy** (`vercel deploy`, `firebase deploy`) and do not set `RAISE_DIAGRAMS` anywhere outside local testing.
- Jest ignores paths containing `.claude`, so in this worktree run it as `npx jest --testPathIgnorePatterns '/node_modules/' '/tests/security/' '/\.firebase/'`.
- The commit hook runs `eslint --fix` and `prettier --write` on staged files; a file that was never formatted gets reformatted in full.
- A default `next build` would overwrite the running dev server's output in this worktree; rely on `npx tsc --noEmit`, `npm run lint`, jest, and CI's build on the pull request.

## Done means

- `npm run lint`, `npx tsc --noEmit` and jest pass, with new tests for everything you change.
- A written result for the owner: how often replies were cut off before and after, how many of the reviewed diagrams were wrong before and after, what policy now drops a diagram, and your recommendation on whether `RAISE_DIAGRAMS` is ready to be switched on. State plainly anything you could not verify.
- Work committed on `claude/raise-diagrams`; nothing pushed unless the owner asks, and then only as described above.
