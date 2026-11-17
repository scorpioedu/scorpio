# AP content pipeline and the misconception report

Sprint 2 (23–29 Nov 2026). See [launch-plan.md](launch-plan.md) for why: a teacher will try Scorpio for a unit if it has ready-made AP Physics 1 homework, grades it correctly, and shows which misconceptions the class has.

## Misconceptions from grading

**Tag list:** `functions/src/misconceptions.ts` holds 37 conceptual tags, each mapped to the AP Physics 1 units where it usually shows up. It also holds the procedural slips the numeric checker sets (sign, power of ten, unit missing/wrong/conversion, sig figs, algebra) and `other`. The wording is our own and follows the standard physics education research findings on mechanics. The web app re-exports the list from `src/data/ap`.

Where tags come from:

| Question | How the misconception is found |
|---|---|
| Multiple choice | The chosen wrong option is listed in the key's `distractors` with a tag |
| Numeric | The answer matches a tagged distractor value, within tolerance and in any unit (checked before the generic sign and power-of-ten slips) |
| Numeric (other wrong answers) | Procedural slips from the deterministic checker |
| Free response / short answer | The AI grader picks tag ids from the list. Anything else becomes `other`, and its phrase is kept as `misconceptionNotes` |

**Distractors are part of the answer key.** They tell you which answers are wrong, so they live in `assignment_keys/{id}.distractors` and never in the assignment document. Create, clone, publish and grading all handle them, and non-owners never see them.

**Events:** every grade, from the Cloud Function or the teacher's grade button, replaces the submission's rows in `misconception_events`. There is one row per (submission, question, tag), carrying the class, assignment, AP unit/topic and `final` (false while the submission waits for review). No Firestore rule matches the collection, so clients can't read or write it. This is covered by `tests/security/misconception-events.test.ts`. A failed write is logged and never blocks the grade.

## Report: `/teacher/insights`

"Misconceptions" in the teacher sidebar. `GET /api/teacher/insights?courseId&assignmentId&apUnit&pending=0` reads only the caller's own events.

- Misconceptions are ranked by the number of distinct students who showed them. Ties put conceptual ones before procedural ones.
- The share is out of students with graded work in the current view (graded, plus pending review unless `pending=0`). For example, "8 of 24 students".
- Each row expands to show who, which assignments and which AP topics.
- The side panels group by AP unit, by assignment and by class.

## AP Physics 1 tags

`src/data/ap/physics1.json` lists the 8 units and their topics (1.1–8.4). It follows the College Board course framework structure, in our own wording. Assignments store `apCourse`, `apUnit` and `apTopics`, all checked on the server by `normaliseApTags`. Questions can store their own `apTopic`. The create page has unit and topic pickers, clones keep the tags, and Waypoints filters by AP unit (in the browser, so no new index is needed).

## Content pipeline: `/admin/content` (admin claim only)

1. **Draft.** Pick a unit, topic and count (1–5). `POST /api/admin/content/generate` asks Gemini for problems in our format: numeric (value + unit key) or 4-option multiple choice, with a worked solution and tagged distractors. The model does not set tolerance; the default 3% applies unless the reviewer changes it.
2. **Validate.** `validateDraftProblem` rejects drafts whose key is unreadable, isn't one of the options, or has the wrong number of options. Distractors with unknown tags, or that the grader would mark correct, are dropped, with a warning.
3. **Independent check.** A second call solves each problem without seeing the key. Its answer is graded against the key by the real grader, and a disagreement shows as an amber warning.
4. **Human review.** A person solves the problem, fixes the key, options, distractors and solution if needed, adds a note, and approves. Approval re-runs the checks on the edited problem. Drafts live in the server-only `content_drafts` collection.
   An approval records who checked it: `reviewKind` is `human` (the review screen) or `ai` (`reviewer: "ai"` on `PATCH /api/admin/content`). AI-reviewed drafts show an amber "AI-reviewed: needs your check" badge, and **publish refuses them outside the local emulator**. A person re-approves each one to make it publishable; reopening clears the mark.
5. **Publish.** Approved problems from one unit become a global Waypoints assignment: auto-graded, AP-tagged, and with the key and distractors in `assignment_keys`. The drafts are then marked published and frozen.

AI calls are billed to `CONTENT_ORG_ID` when set. Otherwise they are uncapped, because the route is admin-only (the same rule as the research route).

**Sets in teaching order.** The 12 sets of Units 4–6 (and the rest as they are written) live in `src/data/curricula/ap-physics-1.json`; the **Sets** tab publishes one in a click and teachers get them as a roadmap. See [courses.md](courses.md).

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

**Where the drafts are.** In the Firenook emulator's kept data (`.firenook/`, published there as 12 global waypoints owned by `otherteacher@demo.test`), and in the repo as [content/ap-physics-1/units-4-6.json](../content/ap-physics-1/units-4-6.json). To load them into a real project as approved, **unpublished** drafts for the human check:
```bash
node tools/content-drafts.cjs import --project <project-id> --file content/ap-physics-1/units-4-6.json          # dry run
node tools/content-drafts.cjs import --project <project-id> --file content/ap-physics-1/units-4-6.json --apply
```
It keeps ids (re-running overwrites, published drafts are skipped), keeps review notes and the AI-review mark, and never publishes. The groupings for the 12 sets are in the file's `sets`. `export` writes the file from any project.

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
