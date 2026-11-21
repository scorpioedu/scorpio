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
- `__tests__/diagram-bars.test.ts`, `diagram-motion.test.ts`, `diagram-circuit.test.ts`, `diagram-circuit-solve.test.ts`, `diagram-field.test.ts`, `diagram-prompt.test.ts`: the newer kinds (see the section below).
- `__tests__/diagram.test.ts`: 26 tests (rendering, error reporting, no code evaluation in `fn`, markup injection, the block checker, the typing helper, the prompt).
- Verified in a browser: a v-t graph, a free-body diagram, a scene and a broken block render correctly in light and dark themes; ordinary code blocks are unchanged.

## Kinds added for AP Physics 2 and C: E&M (Nov 2026): `bars`, `motion`, `circuit`, `field`

Four more kinds sit beside `plot`, `fbd` and `scene`. They follow one rule: **the author states the physics and the renderer computes the picture.** Nobody places a field line, a dot or a wire by hand, so a model cannot draw them wrong. None of this has been tried against a live model yet; the reference text in `prompt.ts` is a first draft to measure.

| Kind | File | What the author writes | What is computed |
| --- | --- | --- | --- |
| `bars` | `bars.ts` | `initial`, `work` / `impulse`, `final` lines of label–value pairs | bar heights; whether initial + transfers = final |
| `motion` | `motion.ts` | `obj "car" x0= v0= a= n=`, then `seg a= n=` | dot positions, velocity and acceleration arrow lengths, the second row after a turnaround |
| `circuit` | `circuit.ts`, `circuit-solve.ts` | each element and the two nodes it joins | series / parallel structure, the rectangular layout, junction dots, alt text |
| `field` | `field.ts` | charges, plates, uniform fields, end-on wires, test charges | field lines, equipotentials, forces |

Syntax is in the header comment of each file and, compactly, in `prompt.ts`.

**bars.** `bars energy` or `bars momentum` declares the chart as conserving, and then initial + work/impulse must equal final or a `physics` warning is raised (so a live tutor drops it). A plain `bars` chart is not checked, and neither is a chart with a `?` (unknown) bar. Heights are relative units; `unit=J` or `axis` adds a numbered axis. Negative kinetic or spring energy is also a `physics` warning.

**motion.** One `dt` on the first line for every object, so two tracks can be compared. `v`, `a`, `num`, `axis`, `vertical` are flags on the first line. Velocity arrows share one scale (as long as fits before the next dot); there is one acceleration arrow per segment.

**circuit.** Elements are `battery resistor capacitor inductor bulb switch ammeter voltmeter wire`, each followed by its two nodes, an optional value (`12V`, `4.7kΩ`, `10uF`; `ohm` and a space before the unit are accepted) and an optional label. A battery's first node is its + terminal. `series a d ...` and `parallel b c ...` write several elements on one line. `i=I_1` draws a current arrow from the first node to the second (`ir=` reversed); `r=0.5Ω` gives a battery internal resistance; `ground d`; `node b "B"`.

- Layout: the first battery goes on the left with + at the top; everything else is reduced to series and parallel groups (`spTree`) and drawn as rungs between a top and a bottom rail, with the outermost rung bent round the corners. A circuit that does not reduce (a bridge) is an error that asks for `at a 0,1 b 1,2 ...`, which places every node on a grid and draws each element straight between its nodes.
- `physics` warnings: a battery on no closed loop with no open switch to explain it; a loose end (drawn as a visible break); a battery shorted by bare wire or a closed switch; an ammeter across a component; a voltmeter in series; a current arrow against the current when there is one battery and no capacitor or inductor (the direction is then fixed whatever the values).
- **Solver** (`circuit-solve.ts`): `parseCircuit(src)` then `solveCircuit(circuit, { at, ground, switches })` returns node potentials, each element's current (signed a → b, plus `from`/`to`), voltage and power, the single source's current and the equivalent resistance outside it, and for a single-C or single-L circuit the Thevenin resistance and time constant. `at: "t0"` treats capacitors as wires and inductors as open; the default steady state is the reverse. Ideal meters; `switches: "closed"` overrides the drawn states. Shorted sources and undetermined current splits come back as `errors`. `__tests__/diagram-circuit-solve.test.ts` holds the hand-worked circuits it is checked against. It is not yet called by the content pipeline.

**field.** Point charges use the 3-D Coulomb field; lines are followed with 4th-order Runge–Kutta steps. Every charge gets exactly `round(lines × |q| / |q|min)` lines (12 per charge by default for one or two charges up to a 2:1 ratio, otherwise 8): the largest charge starts with an even ring, lines that reach another charge take one of its places, and anything a charge is still owed is traced from it through its widest gaps. A flat picture of a 3-D field cannot be evenly spaced at both ends, so the spacing round a large charge next to a much smaller one is slightly uneven. Plates are uniformly charged strips (closed-form 2-D field), so the edge fringing is computed; their equipotentials are drawn only inside the gap. Equipotentials and the field lines of wires are marching-squares contours at equal steps (of V, and of the vector potential), so their spacing shows field strength. `test x,y + v=right` draws the computed electric and magnetic forces; a force along the line of sight is drawn as a dot or cross. Step sizes, limits and the simplification tolerance are documented at the top of `field.ts`.

- Errors rather than false pictures: a test charge with no field, on top of a source, or at rest in a purely magnetic field; plates mixed with point charges; an E field into the page. A Gaussian surface through a charge is a `physics` warning.

**Reference text.** `prompt.ts` now builds the reference per kind. `diagramReference(course)` returns only the kinds a course uses (mechanics: plot, fbd, scene, bars, motion; AP Physics 2 and C: E&M: plot, fbd, scene, circuit, field); `DIAGRAM_REFERENCE` is still every kind. The problem generator asks for its course's kinds. The tutor and the Try AI page have no course at the call site and still send the full reference, which is now about 3,700 characters instead of 1,700: measure the cost before switching `RAISE_DIAGRAMS` on more widely, or pass a course through.

**Not done.** `src/lib/content/problem-diagram.ts` reads "what a student can see" from quoted labels and fbd labels only. A circuit's values (`4Ω`), a bar chart's heights and a motion map's numbers are visible too, so its answer-leak and invented-number checks do not yet cover the new kinds. The generator's instruction on when to add a diagram does not mention circuits or fields either.

**Gallery.** `node tools/diagram-gallery.cjs` renders about 45 curated sources (every case above, plus two of each older kind) into `diagram-gallery.html` in the repo root, each on a light and a dark panel with its source, alt text, warnings, render time and size. The file is ignored by git. Review it by eye after any renderer change.

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
