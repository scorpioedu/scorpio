# AP content pipeline and the misconception report

Sprint 2 (23–29 Nov 2026). See [launch-plan.md](launch-plan.md) for why: a teacher will try Scorpio for a unit if it has ready-made AP Physics 1 homework, grades it correctly, and shows which misconceptions the class has.

## Misconceptions from grading

**Tag list:** `functions/src/misconceptions.ts` holds the conceptual tags of every AP course, each mapped to the units where it usually shows up: 37 for AP Physics 1 (mechanics and fluids), 66 for AP Physics 2 (thermodynamics, electric force/field/potential, circuits, magnetism and induction, geometric optics, waves and physical optics, modern physics) plus four mechanics ideas that carry over, and for AP Physics C: Mechanics the mechanics tags again plus three that need calculus. It also holds the procedural slips the numeric checker sets (sign, power of ten, unit missing/wrong/conversion, sig figs, algebra) and `other`, which belong to every course. The wording is our own and follows the standard physics education research findings. The web app re-exports the list from `src/data/ap`.

Unit numbers repeat between courses, so a tag's units are read per course: `misconceptionUnits(tag, course)` (`[]` any unit, `null` not a tag of that course), `misconceptionsForUnit(unit, course)`, `misconceptionsForCourse(course)`. AP Physics 1 is the default everywhere and its lists are unchanged. See "More than one course" in [courses.md](courses.md).

Where tags come from:

| Question | How the misconception is found |
|---|---|
| Multiple choice | The chosen wrong option is listed in the key's `distractors` with a tag |
| Numeric | The answer matches a tagged distractor value, within tolerance and in any unit (checked before the generic sign and power-of-ten slips) |
| Numeric (other wrong answers) | Procedural slips from the deterministic checker |
| Free response / short answer | The AI grader picks tag ids from the list. Anything else becomes `other`, and its phrase is kept as `misconceptionNotes` |

**Distractors are part of the answer key.** They tell you which answers are wrong, so they live in `assignment_keys/{id}.distractors` and never in the assignment document. Create, clone, publish and grading all handle them, and non-owners never see them.

**Events:** every grade, from the Cloud Function or the teacher's grade button, replaces the submission's rows in `misconception_events`. There is one row per (submission, question, tag), carrying the class, assignment, AP course, unit and topic (`apCourse` is null when there is no unit; rows written before it existed mean AP Physics 1) and `final` (false while the submission waits for review). No Firestore rule matches the collection, so clients can't read or write it. This is covered by `tests/security/misconception-events.test.ts`. A failed write is logged and never blocks the grade.

## Report: `/teacher/insights`

"Misconceptions" in the teacher sidebar. `GET /api/teacher/insights?courseId&assignmentId&apCourse&apUnit&pending=0` reads only the caller's own events. `apUnit` is a unit of `apCourse` (AP Physics 1 when no course is sent; a unit the course does not have is a 400).

- Misconceptions are ranked by the number of distinct students who showed them. Ties put conceptual ones before procedural ones.
- The share is out of students with graded work in the current view (graded, plus pending review unless `pending=0`). For example, "8 of 24 students".
- Each row expands to show who, which assignments and which AP topics.
- The side panels group by AP unit, by assignment and by class. Units are grouped per course: with work from more than one course (or any course other than AP Physics 1) each unit is named with its course, "AP Physics C: Mechanics · Unit 2: …", and never merges with another course's Unit 2. The unit filter lists every course's units.

## AP tags

`src/data/ap/physics1.json` lists the 8 units and their topics (1.1–8.4); `physics2.json` (units 9–15) and `physicsc-mech.json` (units 1–7) do the same for the other two courses. They follow the College Board course framework structure, in our own wording. Assignments store `apCourse`, `apUnit` and `apTopics`, all checked on the server by `normaliseApTags`. Questions can store their own `apTopic`. The create page has unit and topic pickers, clones keep the tags, and Waypoints filters by AP unit (in the browser, so no new index is needed).

## Content pipeline: `/admin/content` (admin claim only)

1. **Draft.** Pick a unit (the picker lists every course's units), topic and count (1–10; a set's pool holds 5 to 10 problems). `POST /api/admin/content/generate { apCourse?, apTopic, count }` asks Gemini for problems of that course in our format (the prompt names the course; AP Physics C: Mechanics is told to use calculus and to write mathematics as plain text; AP Physics 2 is told to give constants and how to key Celsius answers): numeric (value + unit key) or 4-option multiple choice, with a worked solution and tagged distractors. The model does not set tolerance; the default 3% applies unless the reviewer changes it.
2. **Validate.** `validateDraftProblem(problem, topic, course)` rejects drafts whose key is unreadable, isn't one of the options, or has the wrong number of options. Distractors with unknown tags, or that the grader would mark correct, are dropped, with a warning; a tag from another unit or another course, and LaTeX in the text or an option (students see the text as written), are flagged. A distractor written as `{ option }` is read like `{ answer }`.
3. **Independent check.** A second call solves each problem without seeing the key. Its answer is graded against the key by the real grader, and a disagreement shows as an amber warning.
4. **Human review.** A person solves the problem, fixes the key, options, distractors and solution if needed, adds a note, and approves. Approval re-runs the checks on the edited problem. Drafts live in the server-only `content_drafts` collection.
   An approval records who checked it: `reviewKind` is `human` (the review screen) or `ai` (`reviewer: "ai"` on `PATCH /api/admin/content`); `verified` and `owner-accepted` are set by tools and are shown under those names on the Sets tab, not as a person's approval (see "Answer-key verifier" below and `tools/content-drafts.cjs import --accept-ai-review`). AI-reviewed drafts show an amber "AI-reviewed: needs your check" badge, and **publish refuses them outside the local emulator**. A person re-approves each one to make it publishable; reopening clears the mark.
5. **Publish.** Approved problems from one unit of one course become a global Waypoints assignment (its `apCourse` comes from the course definition; drafts written for another course are refused): auto-graded, AP-tagged, and with the key and distractors in `assignment_keys`. The drafts are then marked published and frozen. Each draft's worked solution goes to the server-only `assignment_solutions/{assignmentId}` (`{ solutions: { [questionId]: string }, teacherId }`), never to the assignment. A course set that is already published can only be added to: drafts appended to its `draftIds` become questions at the end, after the same checks (see "Admin: publish by set" in [courses.md](courses.md)).

AI calls are billed to `CONTENT_ORG_ID` when set. Otherwise they are uncapped, because the route is admin-only (the same rule as the research route).

**Sets in teaching order.** The sets of each course live in `src/data/curricula/<id>.json`; the **Sets** tab publishes one in a click and teachers get them as a roadmap. See [courses.md](courses.md).

## Answer-key verifier: `tools/verify-content.cjs`

The single independent solve (step 3) missed 7 of the 31 wrong keys of the 17 Nov run and its result goes stale when a draft is edited. The verifier replaces "an AI looked at it" with checks that can be re-run: the answer is **recomputed** from a machine-checkable form of the problem, and at least two solvers who never saw the key must agree with it. A draft that passes everything is marked `reviewKind: "verified"` and can be published without a person re-solving it, for as long as it is not edited.

**The spec** (`problem.spec`, optional; `src/lib/content/spec.ts`). Like the solution, it never reaches students.

```json
{
  "givens": { "m": { "value": 0.50, "unit": "kg" }, "vi": { "value": 2.0, "unit": "m/s" }, "vf": { "value": -1.5, "unit": "m/s" } },
  "expr": "m * (vf - vi)",
  "unit": "kg*m/s"
}
```

- `givens`: every quantity the answer uses, with its unit as written in the text (`""` for a pure number). Units are the grader's (`functions/src/units.ts`), plus Celsius: `"°C"` is a reading on the scale (20 °C is 293.15 K), `"C°"` a difference, and `°C` inside a larger unit (`J/(kg·°C)`) a difference.
- `expr`: `+ - * / ^`, parentheses, unary minus, numbers such as `3e8`, and `sqrt abs exp ln log sin cos tan asin acos atan atan2 min max round`. No implied multiplication (`2*R`, not `2R`). Every value carries its dimensions: adding metres to seconds, taking the sine of a length, or a result that is not of the stated `unit` is an error, not a number.
- **Angles are in radians.** A given in degrees is written `{ "value": 30, "unit": "deg" }` and converted like any unit, so `sin(theta)` is right; a literal angle is `sin(30*deg)`; inverse functions return radians, and `"unit": "deg"` gives the result in degrees.
- Constants (CODATA values, SI): `g` 9.8 m/s², `G`, `k` (Coulomb), `c`, `e` (elementary charge; Euler's number is `exp(1)`), `eps0`, `mu0`, `h`, `R`, `kB`, `NA`, `sigma`, `me`, `mp`, `atm`, `pi`, `deg`. A given with the same name replaces the constant, so a problem that says "use g = 10 m/s²" lists `g`.
- Optional fields: `steps` (named intermediate results, `{ "W": "F*d", ... }`, usable in `expr` in any order); `alt` (other routes to the same answer, which must agree with `expr` within 1%: this is what catches data that contradict each other); `extraneous` (numbers in the text that the answer deliberately does not use). A given may be marked `"symbol": "M"` (the text gives only a letter; the value is arbitrary and the answer must not depend on it) or `"assumed": true` (a standard value the text does not state).

**The checks** (`src/lib/content/verify.ts`, one function each; the names are the keys of `verification.checks`):

| Check | Passes when |
|---|---|
| `recompute` | The spec's value is within 0.5% of the numeric key, not more than one unit off in the key's last written digit, and of the same kind of unit. A key with few digits may be further off if it is the answer correctly rounded and within two thirds of the grading tolerance (2% at the default 3%). |
| `spec-matches-text` | Every given is a number in the text (as written, in any notation, or the same amount in another unit: 0.15 m for "15 cm"), and every number in the text is a given, is written in the expression, or is listed as `extraneous`. Zero and labels ("Disk 2") are ignored. |
| `solution-consistent` | The key's number appears in the worked solution. Needs no spec, so it runs on every numeric problem today. |
| `grader-round-trip` | The real grader gives the key full credit against itself and gives no distractor any; multiple choice has exactly 4 different options with the key among them; `validateDraftProblem` has no errors. |
| `mc-quantity` | Multiple choice with a spec: the recomputed value is the keyed option and fits no other option. |
| `blind-solves` | At least 2 solvers agree with the key, judged by the real grader, and they outnumber those who disagree. |
| `near-duplicate` | No other problem of the same set is the same calculation (same spec shape) in at least 60% the same words, or 85% the same words whatever the specs. |
| `not-stale` | A stored verification was made for the problem as it is now. |

A numeric problem **needs a spec**. Multiple choice without one (conceptual questions, options that are not quantities) rests on the blind solves alone and is recorded with `checks.basis.detail = "solver-agreement-only"`, so those can be counted. Verdicts: `verified` (everything passed), `failed` (a check contradicts the problem), `incomplete` (nothing is wrong but a spec or blind solves are missing).

**Running it.** It reads and writes only the files under `content/`.

```bash
node tools/verify-content.cjs --all                      # every course; exits 1 if any draft fails
node tools/verify-content.cjs --course ap-physics-2      # or --set ap-physics-2:9A, or --id <draftId>
node tools/verify-content.cjs --all --report json        # everything, with each check's detail
node tools/verify-content.cjs --all --strict             # also exit 1 while evidence is missing
node tools/verify-content.cjs --all --write              # stamp what passed; unstamp what no longer does

# Blind solves: give a solver the sheet and nothing else, then record the answers
node tools/verify-content.cjs solve-sheet --solver solver-a --set ap-physics-2:9A --out sheet.json
node tools/verify-content.cjs record-solve --solver solver-a --file answers.json   # [{ "id", "answer" }]

node tools/verify-content.cjs apply-specs --file specs.json   # { "<draftId>": <spec> }
```

A sheet holds the questions only, and each solver sees a problem's options in a different order; a letter in the answers file is read against that solver's sheet and stored as the option's text. The tool cannot make a solve blind: that is up to whoever runs the solver. Answers are stored on the draft (`solves`) with the hash of the text they were given for and stop counting when the problem changes.

`--write` puts the record on the draft, beside `problem`: `verification = { textHash, checks, solvers, verifiedAt }`. `textHash` covers the text, options, key and spec. **Publish accepts `verified` only while that hash matches the stored problem** (and the record's checks all passed, with two agreeing solvers); an edit through the review screen leaves the mark but changes the hash, and the draft is refused until it is verified again or a person approves it. `owner-accepted` and `human` publish as before, `ai` does not, and the emulator publishes anything. `tools/content-drafts.cjs` carries the record through export and import.

**Regression corpus** (`tests/fixtures/verifier-corpus.json`: draft ids and pass/fail only). The 33 problems whose review notes record a wrong key (the 31 of the 17 Nov run and one from each AP Physics 1 file) are checked twice, as corrected and as the model first wrote them (`original`, with `original.spec` where the question itself was changed), together with 48 other problems across the three courses as controls. `node tools/verify-content.cjs corpus` fails when the file no longer matches the content; `--write` rewrites it.

- **29 of the 33 are caught by recomputation**: 27 numeric (`recompute`) and 2 multiple choice whose options are numbers (`mc-quantity`). Four of them were impossible or contradictory questions rather than slips, and are caught as such: a total internal reflection (`asin` of more than 1), a bead that never arrives (square root of a negative), and two that only an `alt` route shows (the data gave two different answers).
- **4 cannot be caught without solvers**: multiple choice whose options are sentences or formulas. Only the blind solves stand between such a key and a class.
- Without any spec, `solution-consistent` alone fails 13 of the 27 numeric ones.
- All 33 pass as corrected, and all 48 controls pass. No blind solves have been recorded yet, so no draft is `verified`: 77 of 440 have a spec, 194 numeric problems still need one, and every problem needs its two solves.

### First run (24 Nov 2026, emulators, live Gemini)
10 problems for Unit 4 (4.1 ×3, 4.2 ×3, 4.3 ×2, 4.4 ×2) were generated, reviewed and published. Claude (AI) did the review, solving every problem by hand; **a person still needs to check them before they go to a real class.**
- **1 wrong key caught:** a force-time graph problem keyed 38 m/s; the right answer is 50 m/s. The independent solve flagged it, and the worked solution itself said 50. 1 in 10 is why every problem needs a person.
- 1 key was rounded (11000 N → 11250 N).
- The model's tolerances were fractions read as percents (0.05 meaning "0.05%"), which was far too strict. The generator now ignores model tolerances.
- 3 of the 4 multiple-choice problems were truck-and-car collisions. The prompt now asks for varied situations.
- The checker answered multiple choice as "A. <text>". The parser now accepts a letter, a lettered option or the option text.
- End to end in the emulator: the demo teacher copied the set into the demo class, 12 demo students submitted (`tools/seed-insights-demo.cjs`), the Cloud Function auto-graded all 12, and `/teacher/insights` ranked 6 misconceptions with student counts.

### Sprint 3 run (16 Nov 2026, Firenook emulator, live Gemini): Units 4–6
60 problems in 12 sets of 5 (4 per unit, all 16 topics of Units 4–6), generated through the API in the local emulator. Claude (AI) solved every one by hand and approved them as **AI-reviewed**; they still need a person. Full log: [content/ap-physics-1/units-4-6-review.md](../content/ap-physics-1/units-4-6-review.md).
- **1 wrong key caught** again (1 in 60 this time): a disk angular-acceleration ratio keyed 1/2, correct answer 1. The worked solution slipped and the independent check disagreed, as in Sprint 2. The amber warning remains the best signal.
- 3 keys were rounded (inside tolerance but tightened), 2 problem texts were ambiguous (an object's weight not stated).
- Distractors were the weakest part: 26 changes across 25 problems, mostly values that no mistake produces or tags naming the wrong misconception. A wrong tag puts a wrong row in the teacher's report, so check distractors as carefully as keys.
- No tag fits "rotation ignored in rolling" (v = √2gh). Worth adding to `functions/src/misconceptions.ts`.

### Run of 17 Nov 2026 (Firenook emulator, live Gemini): AP Physics 2 and AP Physics C: Mechanics
280 problems in 56 sets of 5: AP Physics 2 units 9–15 and AP Physics C: Mechanics units 1–7, every topic of both courses, generated through the API in the local emulator. Claude (AI) solved every one by hand and approved them as **AI-reviewed**; they still need a person. Full logs, one row per problem: [content/ap-physics-2/units-9-15-review.md](../content/ap-physics-2/units-9-15-review.md) and [content/ap-physics-c-mech/units-1-7-review.md](../content/ap-physics-c-mech/units-1-7-review.md).

| | AP Physics 2 | AP Physics C: Mechanics |
|---|---|---|
| Problems (numeric / multiple choice) | 140 (83 / 57) | 140 (84 / 56) |
| **Wrong keys caught** | **9** (1 in 16) | **22** (1 in 6) |
| of those, flagged by the independent solve | 6 (it returned no answer for the other 3) | 17 (no answer for 4; it agreed with 1 wrong key) |
| Keys tightened from rounding | 7 | 24 |
| Texts or options changed | 9 | 9 |
| Distractors the model proposed | 271 | 292 |
| **Distractors removed or changed** | **122**, in 93 problems | **196**, in 121 problems |
| Distractors added or re-entered corrected | 32 | 36 |
| Tagged distractors in the final sets | 181 | 132 |
| Drafts repaired / rejected and regenerated | 3 / 6 | 0 / 2 |

- **The wrong-key rate was far higher than for AP Physics 1** (1 in 60–100 there). Almost every one had the same cause: the model's worked solution reached the right answer, said "wait, let's recompute" or "let's adjust the numbers to come out clean", and the key (or the question) was left on an earlier value. Seven problems could not be answered as written (no correct option, a ray that is totally reflected, a bead that never arrives, data that contradict each other). The amber "independent check disagrees" warning caught most, but not all: it was silent on 7 and agreed with 1.
- **Calculus problems are where it fails most.** C: Mechanics units 3, 4, 6 and 7 (work as an integral, impulse, rotation and rolling, oscillations) had 19 of the 22. A person checking these should solve each one, not read the solution.
- **Distractor tags were wrong about half the time**, as in earlier runs: values no mistake produces, arithmetic slips labelled as misconceptions, or a plausible mistake under the wrong tag. Many problems now have no tagged distractor rather than a wrong one.
- Fixed in the pipeline during the run: C: Mechanics drafts came back in LaTeX (the prompt now asks for plain text and validation flags LaTeX); answers in degrees Celsius or "micrograms" could not be keyed (the checker has no such unit; they are keyed as a plain number with "Give your answer in …"); the model sometimes wrote `{ option }` for a distractor.
- Published in the emulator: 28 + 28 sets (with AP Physics 1: 88 global sets, 440 problems). End to end on a separate emulator suite running this branch's functions: a class with one set from each course, 12 demo students each (`tools/seed-insights-demo.cjs`), graded by the Cloud Function; `/api/teacher/insights` listed "AP Physics 1 · Unit 2", "AP Physics C: Mechanics · Unit 2" and "AP Physics 2 · Unit 11" separately, and the class's course progress showed only the units of the course asked for.

**`content/` is not in the public repository.** The files under `content/<curriculumId>/` hold every problem with its answer key and worked solution, and the review logs name the corrected keys. The GitHub repository is public and these are homework sets teachers assign, so `content/` is git-ignored and was removed from the published history. Keep a private copy (the working folder, the Firenook data, or a private repository): it is the only source for importing the problems into a real project and for regenerating the set profiles. Without it the app builds and runs as usual, `tools/content-drafts.cjs import` and `tools/curriculum-profile.cjs` have nothing to read, and the tests that read the files are skipped (`tests/helpers/course-content.ts`), so they only run where the files exist.

**Where the drafts are.** In the Firenook emulator's kept data (`.firenook/`, published there as global waypoints owned by `otherteacher@demo.test`), and in the repo under `content/<curriculumId>/` (the files are listed in `src/data/curricula/content-files.ts`). To load a file into a real project as approved, **unpublished** drafts for the human check:
```bash
node tools/content-drafts.cjs import --project <project-id> --file content/ap-physics-1/units-4-6.json          # dry run
node tools/content-drafts.cjs import --project <project-id> --file content/ap-physics-1/units-4-6.json --apply
```
It keeps ids (re-running overwrites, published drafts are skipped), keeps review notes and the AI-review mark, and never publishes. `export` writes the file from any project; unit numbers repeat between courses, so name the course for any other than AP Physics 1:
```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node tools/content-drafts.cjs export --project demo-scorpio --course physics-2 --out content/ap-physics-2/units-9-15.json
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node tools/content-drafts.cjs export --project demo-scorpio --course physics-c-mech --out content/ap-physics-c-mech/units-1-7.json
```

### Try it locally
`npm run dev:firenook` starts Auth, Firestore, Storage and Functions on the usual ports with data kept between runs in `.firenook/` (console at http://127.0.0.1:4001/console). `npx firebase emulators:start ...` below still works; the security suite (`npm run test:security`) uses the Firebase emulators, so stop Firenook first. Next 16 refuses a second `next dev` in the same folder, so `.claude/launch.json` builds the emulator server into `.next-emulators` and it can run beside `npm run dev`.


```bash
npx firebase emulators:start --only auth,firestore,storage,functions --project demo-scorpio
```
```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node tools/seed-emulator-demo.cjs
```
Give an emulator account the admin claim (`tools/set-admin-claim.cjs` with `FIREBASE_AUTH_EMULATOR_HOST` set). Draft and publish at `/admin/content`, copy the set into the demo class from Waypoints as `teacher@demo.test`, then:
```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node tools/seed-insights-demo.cjs <copied assignment id>
```
