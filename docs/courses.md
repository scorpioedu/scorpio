# Scorpio Courses (curriculum roadmaps)

Sprint 3. **Waypoints** is still the library of single sets (global, department, mine). A **course** is an ordered roadmap on top of it: units in order, each with its sets in order. A teacher can optionally attach a course to a class; classes that follow none work exactly as before.

**Four courses: three written, one planned.**

| Course | `curriculumId` | State |
|---|---|---|
| AP Physics 1 | `ap-physics-1` | Complete: 8 units × 4 sets × 5 problems = 32 sets, 160 problems (1A–8D). All are AI-reviewed only and need a person's approval before they can go live; see [units-4-6-review.md](../content/ap-physics-1/units-4-6-review.md) and [units-1-3-7-8-review.md](../content/ap-physics-1/units-1-3-7-8-review.md). In the Firenook emulator all 32 sets are published and tagged. |
| AP Physics 2 | `ap-physics-2` | Complete: 7 units (9–15) × 4 sets × 5 problems = 28 sets, 140 problems (9A–15D). AI-reviewed only; see [units-9-15-review.md](../content/ap-physics-2/units-9-15-review.md). Published and tagged in the Firenook emulator. |
| AP Physics C: Mechanics | `ap-physics-c-mech` | Complete: 7 units (1–7) × 4 sets × 5 problems = 28 sets, 140 problems (1A–7D), calculus-based. AI-reviewed only; see [units-1-7-review.md](../content/ap-physics-c-mech/units-1-7-review.md). Published and tagged in the Firenook emulator. |
| AP Physics C: Electricity and Magnetism | `ap-physics-c-em` | **Planned: outline only, no problems.** 6 units (8–13), 31 topics, 24 planned sets (8A–13D, four per unit, `draftIds: []`), calculus-based. Units, topics and numbering follow the College Board Course and Exam Description (effective Fall 2024; read from AP Central on 21 Nov 2026, URLs in the `note` of `src/data/ap/physicsc-em.json`). No content folder, no unit guides, nothing published anywhere. |

Every problem in the three written courses still needs a person's check before it can go live: the AI review found wrong keys in each course (the review logs list them), and it can miss others.

**How a planned course shows.** A course whose sets have no problems (`hasContent(c)` is false) is never offered as if it were ready:

- Landing page course grid (`src/components/landing/course-grid.tsx`): its card says "Planned · problem sets not written yet" in place of a set count, and the heading counts only written courses ("Three AP Physics courses, already written"). The "Pick your course" preview (`workflow-rows.tsx`) lists written courses only. The hero, FAQ and page metadata name AP Physics 1, 2 and C: Mechanics only.
- `/teacher/courses`: the chooser card says "Planned" with a disabled **Not ready yet** button; the course dialog row is disabled; a teacher with no class who browses it sees "{course} is planned" and every set with a lock and "Planned". `/teacher/welcome` does not list it.
- Admin → Content → Sets lists its 24 sets as planned, with nothing to import or publish.

The API does not refuse a planned course (`PATCH /api/courses/{id}/curriculum` only checks that the course exists); only the UI does.

**Naming.** In code, "course" already means a *class* (`courses` collection, `courseId`, `ownsCourse`) and `apCourse` is the AP subject. The new concept is `curriculum` / `curriculumId` in code and "Courses" in the UI.

## Where things live

| What | Where |
|---|---|
| Course definition | `src/data/curricula/<id>.json` (`ap-physics-1`, `ap-physics-2`, `ap-physics-c-mech`, `ap-physics-c-em`), helpers in `src/data/curricula/index.ts` |
| Roadmap state (availability, assigned, next unit, draft states) | `src/lib/curriculum-roadmap.ts` |
| A class's order and skipped sets | `src/lib/curriculum-plan.ts` |
| Days off and school-day tests | `src/lib/school-calendar.ts` |
| Pacing guide, bulk due-date moves | `src/lib/course-pacing.ts` |
| Class progress, re-teach suggestions | `src/lib/course-progress.ts` |
| Where a set stands (not assigned, assigned, needs you, done), the numbers strip | `src/lib/course-board.ts` |
| Calendar: sets on days, month and week grids, runs of days off, what dropping a set on a day means | `src/lib/course-calendar.ts` |
| Unit colours, status marks, topic chips (shared by List, Calendar, unit guide) | `src/app/teacher/courses/unit-look.tsx` |
| Student dashboard roadmap | `src/lib/student-roadmap.ts` |
| Topic guides (content, schema, loader, verifier) | `src/data/guides/<id>/unit-<n>.json`, `src/lib/guides/`, `src/components/guide/`, `tools/verify-guides.cjs`; see [Guides](#guides) |
| Set profiles (time, difficulty, misconceptions) | `src/data/curricula/profiles.ts`, `src/data/curricula/profiles/<id>.json`, `tools/curriculum-profile.cjs` |
| Reviewed problems (exported drafts) and review logs | `content/<id>/` |
| Misconception tags per course | `functions/src/misconceptions.ts` (`misconceptionUnits`, `misconceptionsForUnit`) |
| Copy sets into a class with due dates | `src/lib/assign-sets.ts` (used by `/teacher/welcome` and `/teacher/courses`) |
| Browser reads | `src/lib/curriculum-client.ts` |
| Student grouping | `src/lib/student-grouping.ts` |
| Backfill tool | `tools/curriculum-tag.cjs` |

## Data shapes

Definition (`src/data/curricula/<id>.json`):
```json
{ "id": "ap-physics-1", "apCourse": "physics-1", "name": "AP Physics 1", "description": "...",
  "sets": [ { "key": "4A", "unit": 4, "title": "Momentum of objects and systems",
              "description": "One sentence.", "topics": ["4.1"], "draftIds": ["<id>", "..."] } ] }
```
`apCourse` says which AP course's units and topics the sets refer to. Units and topics come from `src/data/ap/` (`physics1.json`, `physics2.json`, `physicsc-mech.json`, `physicsc-em.json`); they are not repeated. A set with an empty `draftIds` is planned; a written set lists 5 to 10 (see [How many problems a class gets](#how-many-problems-a-class-gets)). The published title is `displayTitle(set)`: "AP Physics 1 · Unit 4A · Momentum of objects and systems".

A published set is a global `assignments` doc with the usual AP fields plus `curriculumId`, `curriculumSetKey` and `curriculumSequence` (0-based position over the whole course). Clones copy all three, so a class's own assignment keeps its set key. A class's copy holds the set's first 5 problems unless the teacher chose another number. A class doc may have `curriculumId` (absent or null = follows nothing), `curriculumPlan` (its own order and skipped sets) and `daysOff` (its school calendar).

## How many problems a class gets

A written set is a **pool of 5 to 10 problems** (`draftIds`; `validateCurriculum` refuses 1–4 and more than 10). **Order is the selection rule:** a class's copy is the set's first *n* problems, where *n* is 5 unless the teacher chooses 3 to the size of the pool. So:

- **The first five of a set never change once written**, and problems 6–10 are only ever appended. `tests/fixtures/set-first-five.json` records today's first five ids of every set and `npx jest curricula` fails if one moves (ids only; no text or keys).
- **Write the pool so every prefix is a sensible assignment.** The test checks that every prefix from five problems up covers all of the set's topics (true by construction once the first five do). Prefixes of 3 and 4 are **not** guaranteed to: in 41 of today's 88 sets the first five are grouped by topic (1A is 1.1, 1.1, 1.2, 1.2, 1.2), so a copy of 3 can leave a topic out. The copy's own `apTopics` are narrowed to the topics of its problems; the roadmap's topic chips still show the set's.
- **Where the number is chosen.** The assign dialog has one control, **Problems per set** (First 3 … First *n*, "First 5 (usual)"), shown only when a set being assigned has more than five problems, so until pools grow the dialog is as it was. When the sets have different sizes each gets at most what it has, and one line says which ("4B has 5 problems, so it gets all 5."). The class remembers the last choice (`assignmentDefaults.problemsPerSet`, written by `PATCH /api/courses/{id}/assignment-defaults { problemsPerSet }`, 3–10) and the dialog opens on it; it is not a setting and is shown nowhere else. Dropping a set on a calendar day, `/teacher/welcome` and the Library's **Use this set** offer no choice and give five.
- **The server.** `POST /api/assignments/clone` takes an optional `count` (whole number, 3–100). For a published course set (global, with a `curriculumSetKey`) the copy gets the first `min(count ?? 5, pool)` questions, with `totalPoints` summed from them and the key, distractors and worked solutions copied for those questions only. For every other source (Duplicate, a teacher's own assignment, any other waypoint) `count` is ignored and everything is copied, as before.
- **An archived copy.** Assigning a set whose class copy was archived restores that copy with its students' work. When the teacher chose a number in the dialog and the archived copy has a different number of questions, it is **not** restored: it stays archived (its work with it, still restorable from its own menu) and the class gets a new copy of the chosen size (`restoresArchived` in `src/lib/assign-sets.ts`). With no choice offered the copy is restored whatever its size.
- **What the pages say.** A set that is not assigned is described as it would be assigned: "5 problems · about 12 min", or "5 of 10 problems" once its pool is larger. An assigned set is described by its copy: its real question count and the minutes, question types, difficulty and misconceptions of that many problems (`shownProfile` in `src/data/curricula/profiles.ts`). The preview of an unassigned set lists the whole pool and marks where the extra problems start. A copy the teacher edited by hand keeps its real count, but the minutes and mix are still those of the set's first problems.

## Adding sets

Append to `sets` in the same shape (keys are `<unit><letter>`, e.g. `1A`, `7C`, `12B`; they never change once published). `draftIds` are approved `content_drafts` ids, in question order: 5 to 10 of them, never fewer once the set is written. To grow a set, append ids after the existing ones (never insert or reorder), re-run the profile tool, and press **Add n new problems** on the admin Sets tab. The order of sets in the file is cosmetic: unit then letter decides the roadmap. `npx jest curricula ap-courses` checks that keys are unique, each set's unit matches its key and its topics, topics exist in the course, and no draft id appears in two sets. To get drafts into a project, see [content-pipeline.md](content-pipeline.md) (`tools/content-drafts.cjs import`).

## More than one course

Unit numbers and topic ids repeat between courses: AP Physics 1 and AP Physics C: Mechanics both have a unit 2 and a topic "1.1", and both have a set "1A"; AP Physics C: Electricity and Magnetism's units 8–13 overlap AP Physics 1's unit 8 and AP Physics 2's units 9–13 (its unit 9 is electric potential, Physics 2's is thermodynamics), and both have a set "9A". So:

- **AP data is scoped by course.** `src/data/ap/index.ts` has `AP_COURSES` (`physics-1`, `physics-2`, `physics-c-mech`, `physics-c-em`) and every helper takes the course last: `apUnits(course)`, `apUnit(unit, course)`, `apTopic(id, course)`, `apUnitLabel`, `apTopicLabel`, `isApTopicId`. The default is AP Physics 1, which is what every assignment saved so far is. `normaliseApTags` checks topics against the assignment's own `apCourse`.
- **A set key only means something with its `curriculumId`.** The roadmap, class progress and the student views ignore a class assignment whose `curriculumId` is another course (older copies without one still count). `GET /api/teacher/courses/progress` takes an optional `curriculumId`.
- **A class follows one course at a time.** Viewing another course offers "Switch to …"; switching keeps every assignment.

- **Misconception tags belong to courses.** `functions/src/misconceptions.ts` keeps one list. A tag's `units` are its AP Physics 1 units; `courseUnits` holds the other courses; `misconceptionUnits(tag, course)` is the only place that reads them (`[]` = any unit, `null` = not a tag of that course). AP Physics 2 has 66 tags of its own for units 9–15 (thermodynamics, electricity, circuits, magnetism, optics, waves, modern physics) and borrows four mechanics ideas that carry over. AP Physics C: Mechanics reuses the mechanics tags under the same unit numbers (its units 1–7 match Physics 1 units 1–7; the fluids tags are left out) and adds three that only show up with calculus (`constant-acceleration-assumed`, `derivative-integral-confusion`, `rolling-ignores-rotation`). AP Physics C: Electricity and Magnetism reuses AP Physics 2's electricity and magnetism tags under its own unit numbers and adds twelve that only show up with calculus (Gauss's and Ampère's law used without symmetry, flux against field, enclosed charge or current, a distribution treated as a point charge, the sign between field and potential, dielectrics, time constants, emf from flux instead of its rate, and three inductor and LC ideas). The sharing is one table, `SHARED_UNITS`: a course may take another course's tags with the units renumbered (C: Mechanics takes Physics 1 units 1–7 as they are; C: E&M takes Physics 2 unit 10 as its 8–10, 11 as 11 and 12 as 12–13, and nothing from thermodynamics, optics, waves or modern physics). A tag's own `courseUnits` entry wins over the table, which is how most shared tags are narrowed to the units they really fit (`lenz-opposes-field` is unit 12 in Physics 2 and unit 13 in C: E&M). `__tests__/ap-course-scoping.test.ts` checks that no tag leaks between courses that share a unit number. The AI grader is offered the tags of the assignment's course.
- **Misconception events carry the course.** Each row in `misconception_events` stores `apCourse` with its `apUnit` and `apTopic` (null when there is no unit). Rows written before this have no `apCourse` and mean AP Physics 1. `/teacher/insights` groups "By AP unit" per course ("AP Physics C: Mechanics · Unit 2: …" never merges with Physics 1's Unit 2; a report with only Physics 1 work reads as before), the unit filter lists every course's units, and `GET /api/teacher/insights` takes `apCourse` with `apUnit` (no course = AP Physics 1). A class's unit insights on `/teacher/courses` count only events of the course it follows.
- **The content pipeline takes the course.** `POST /api/admin/content/generate { apCourse?, apTopic, count }` (default AP Physics 1); drafts store `course`; the prompts name the course, and only the two AP Physics C courses are told to use calculus; a draft is validated against its own course's topics and tags; publish sets the assignment's `apCourse` from the course definition and refuses drafts written for another course. See [content-pipeline.md](content-pipeline.md).
- **Unit pickers list every course.** The create page, the Waypoints filter, the insights filter and the admin content page use one grouped picker (`src/components/ap-unit-select-items.tsx`). Its values are `apUnitKey(course, unit)`: the bare number for AP Physics 1 ("4"), prefixed otherwise ("physics-2:9").

**Adding a course.** Every place that names the courses one by one; anything not listed reads `CURRICULA` or `AP_COURSE_IDS` and follows by itself.

1. **Outline, from the source.** `src/data/ap/<course>.json`: units and topics with the College Board numbering, titles and summaries in our own words, and the source URL and the day it was read in `note`. Register it in `AP_COURSES` (`src/data/ap/index.ts`).
2. **Course key for the functions bundle.** `AP_COURSE_KEYS` and `AP_COURSE_UNIT_RANGE` in `functions/src/misconceptions.ts` (a test keeps them in step with `AP_COURSES`). `z.enum(AP_COURSE_KEYS)` in `src/lib/schemas/api-bodies.ts`, the unit pickers and the insights filters follow.
3. **Misconception tags.** Every unit needs at least three conceptual tags (tested). Reuse existing tags first: add the course to a tag's `courseUnits`, or, when the course covers the ground of another, add a line to `SHARED_UNITS` and narrow with `courseUnits` where a tag fits fewer units. New tags need `id`, `label`, `description`, `category` and `units: []` with `courseUnits`. Add leak tests for every unit number the course shares with another.
4. **Generator.** A line in `COURSE_METHODS` (`src/lib/content/problem-generator.ts`): the level, whether calculus is used, the constants to give, plain-text mathematics.
5. **Publishing.** An entry in `LEGACY_TOPIC` (`src/app/api/admin/content/publish/route.ts`), the older topic filter published sets also show under.
6. **Roadmap.** `src/data/curricula/<id>.json` with its `apCourse`, registered in `CURRICULA`: four sets a unit, keys `<unit><letter>`, every topic covered, `draftIds: []` while planned. The description must say the sets are planned until they are written.
7. **Content files and profile.** An entry in `CONTENT_FILES` (`src/data/curricula/content-files.ts`; `[]` while nothing is written, a test compares its keys with `CURRICULA`). Run `node tools/curriculum-profile.cjs --id <id> --write` (it writes `{}` for a planned course; a test reads the file for every course) and register the file in `profiles.ts`. Once it has content: export the drafts to `content/<id>/`, list the file in `CONTENT_FILES`, run the profile tool again.
8. **Icon and blurb.** A drawing in `DRAWINGS` and a `LOOKS` entry (level, what it covers, tint) in `src/components/teacher/course-icon.tsx`; without them the course shows the plain route icon and its description.
9. **Unit colours.** The course's first colour in `FIRST` (`src/app/teacher/courses/unit-look.tsx`), matching its tint.
10. **Landing page and marketing copy.** The course grid and the "Pick your course" preview read `CURRICULA` and only count written courses. Written by hand, to change when the course has problems (never before): the hero line (`LINE_ONE` in `src/components/landing/LandingHero.tsx`), the FAQ answer in `src/components/landing-faq.tsx`, the description and keywords in `src/app/layout.tsx`, and the course table in `README.md`.
11. **Tests with the courses written out.** `__tests__/ap-courses.test.ts` (course ids, unit lists, the per-course loops over written courses), `__tests__/ap-course-scoping.test.ts` (tags, unit keys, request schemas, prompts), `__tests__/course-progress.test.ts` (profiles of written courses). `curricula.test.ts` and `ap-data.test.ts` loop over `CURRICULA`.
12. **Name matching.** `curriculumNamedIn` (`src/data/curricula/index.ts`) matches a class's name to the longest course name it contains; check that the new name is not contained in, and does not contain, another course's name, and add it to the test.
13. **Tools.** Nothing to register: `tools/content-drafts.cjs --course <course>`, `tools/curriculum-profile.cjs --id <id>` and `tools/curriculum-tag.cjs` (every `.json` in `src/data/curricula/`) take any course; the seed tools work on whatever a class follows.
14. **Docs.** The table at the top of this file, and the per-course lines in [content-pipeline.md](content-pipeline.md) (tag counts, AP data files).

**Still AP Physics 1 only.** None of these blocks the other courses; each is a place where a teacher of another course gets less:

| Where | What is fixed to Physics 1 |
|---|---|
| `src/app/features/page.tsx` | The marketing page lists AP Physics 1 units |
| `tools/grading-eval/cases.json` | The 50 labelled grading cases are AP Physics 1 answers; free-response grading of Physics 2 or C: Mechanics answers has not been measured |
| Answer units | The numeric checker has no Celsius unit and does not know spelled-out prefixes ("micrograms"). Such answers are keyed as a plain number with "Give your answer in …" in the question (the Physics 2 generator prompt says so) |

## Admin: publish by set

`/admin/content` has a **Sets** tab with a course picker (`?tab=sets&course=ap-physics-2` opens on a course). For each set it shows every draft's state (draft, AI-reviewed, verified, owner-accepted, human-approved, published, rejected, missing; "verified" is the answer-key verifier's mark, not a person's approval, and the label cannot tell whether the draft was edited since: publish checks that) from `GET /api/admin/content/sets?curriculumId=` (admin only, read-only). **Publish set** is enabled when every draft is approved and calls `POST /api/admin/content/publish { curriculumId, setKey }`. The title, description, draft list and question order then come from the definition. Every existing check still applies (approved, one unit, re-validation, and AI-reviewed drafts are refused outside the emulator; the tab shows that error). Publishing a set that already exists as a global waypoint returns 409; an unknown set returns 400. `{ draftIds, title }` still works for ad-hoc sets.

**Adding problems to a published set.** When the definition lists more drafts than the set was published with (the assignment's `contentDraftIds`), the row shows **Add n new problems** and the same request appends them: the new drafts go through every check a first publish makes and become questions at the end (`{ id, appended }`), their answers and distractors are merged into `assignment_keys/{id}`, and `totalPoints`, `apTopics` and `contentDraftIds` are brought up to date. The questions already there keep their ids and order. Copies classes already have are separate documents and are not touched: a class gets the new problems only by assigning the set again with a larger number. It is refused (409) when the drafts already published were changed, removed or reordered in the definition, or when the published assignment no longer has one question per published draft.

**Worked solutions.** Publishing (first or append) writes each draft's `problem.solution` to `assignment_solutions/{assignmentId}` = `{ solutions: { [questionId]: string }, teacherId }`; on an append, questions published before solutions were stored are filled in too (matched to their draft by position and text). Cloning copies the solutions of the copied questions under their new ids to the copy's own `assignment_solutions/{newId}` (nothing is written when the source has none). No Firestore rule matches the collection, so only the server can read it.

## Why a teacher may see "Not published yet" on every set

The roadmap lists every set in the definition, but a set can only be assigned once it exists as a published global waypoint **in the Firebase project the app is running against**. The 440 problems of the three written courses were published only in the local Firenook emulator, so `npm run dev` against a real project shows every set as "Not published yet" (this used to read "Coming soon"). Three states (`setAvailability` in `src/lib/curriculum-roadmap.ts`):

| State | Meaning |
|---|---|
| Ready | Published here; can be previewed and assigned |
| Not published yet | The definition lists its problems (`draftIds`), but no published set exists in this project |
| Planned | Nothing is written yet (`draftIds` is empty) |

The page explains this in a notice, and admins get a link to **Admin → Content → Sets**, which shows how many drafts are missing and the import commands.

**Getting the sets into a real project** (a person does this; nothing here deploys):

1. Import the reviewed drafts. Each command is a dry run until you add `--apply`; it writes approved, unpublished drafts and keeps their ids.
   ```bash
   node tools/content-drafts.cjs import --project <project-id> --file content/ap-physics-1/units-1-3-7-8.json
   node tools/content-drafts.cjs import --project <project-id> --file content/ap-physics-1/units-4-6.json
   node tools/content-drafts.cjs import --project <project-id> --file content/ap-physics-2/units-9-15.json
   node tools/content-drafts.cjs import --project <project-id> --file content/ap-physics-c-mech/units-1-7.json
   ```
2. At `/admin/content` → **Approved**, open each problem, solve it, check the key and the misconception tags, and approve it yourself. Imported drafts are `reviewKind: "ai"` and publish refuses those outside the emulator. The review logs in `content/<id>/*-review.md` list what the AI review changed, problem by problem.
3. On the **Sets** tab, press **Publish set** for each set. `/teacher/courses` then shows it as ready.

## Teachers: `/teacher/courses`

"Course" is the second item in the teacher sidebar (Home, Course, Assignments, Grading, Classes; Department and Sustainability at the bottom). The page is built around one class, chosen with the class picker in the header; it is the same selected class as every other teacher page (see [teacher-editing.md](teacher-editing.md)). The view (`?view=calendar`), the Calendar's unit filter (`?unit=`) and the Schedule sheet (`?tab=schedule`) are kept in the address bar.

**One course per class.** A class follows one course, or none (`curriculumId` on the class doc). The Courses page shows the chosen class's course and names it on a highlighted **course button** beside the class picker; there is no way to look at a different course from the one the class follows, so a teacher never looks at one course while a class follows another. Where the course is set:

- **A class with no course** opens the page on **Which course is {class} taking?**: one card per course with its icon, whether it is algebra- or calculus-based, what it covers, its units as chips, its size ("8 units · 32 sets · 160 problems") and **Start {course}**. A course whose name appears in the class's name is marked "Matches the class name" and gets the filled button. Nothing else is offered until one is chosen (a class may also stay without a course and keep working as a plain class).
- **The course button** ("AP Physics 2 ▾", tinted in the primary colour so the course on screen is obvious) opens a small dialog with one row per course (icon, level, size; the class's course is marked **Current** and the choice is ticked) and a **No course** row.
- **Where the class starts.** Picking a course (from the chooser's **Start {course}**, or the course button) opens one dialog: the courses as rows, then **Where does the class start?** with **From the beginning** or **Part-way through** (a unit, then the first set to do). Starting part-way saves a plan with every earlier set skipped (`planStartingAt` in `src/lib/curriculum-plan.ts`), so those sets are not offered, paced or counted, "Assign next" begins at the chosen set, and any of them can be un-skipped later. Nothing new is stored: it is the class's ordinary `curriculumPlan`.
- **Course icons.** Each course has its own hand-drawn icon (`src/components/teacher/course-icon.tsx`), used on the course button, the chooser, the dialog and the dropdowns: a ball in flight for AP Physics 1 (algebra-based mechanics), an atom for AP Physics 2 (electricity through modern physics), an integral sign beside a moving ball for AP Physics C: Mechanics (mechanics with calculus), and the same integral sign beside a lightning bolt for AP Physics C: Electricity and Magnetism. A new course needs a drawing and a `LOOKS` entry there; without one it shows the plain route icon.
- **Dashboard → class → Settings** has a **Course** dropdown (saves at once, with Undo), and **Create Class** has an optional one.
- `/teacher/welcome` has a **Course** dropdown: the first class is created on the chosen course, and step 2 lists that course's units.

Changing a class's course never touches assignments: sets already assigned from the old course stay in the class with students' work, and show under "Other assignments" for students and outside the roadmap for the teacher. The Courses page says so in one line under the header ("Period 3 also has 2 assigned sets from AP Physics 1, from before its course changed…") with a link to My Assignments, so they do not seem to have vanished. The class's own plan (order and skipped sets) belongs to the old course, whose set keys can repeat in the new one ("1A" exists in both AP Physics 1 and C: Mechanics), so `PATCH /api/courses/{id}/curriculum` clears `curriculumPlan` whenever the course changes; the page's Undo puts both back. A teacher with no class yet can still browse the courses (`?course=`) from a dropdown in the header.

Everything is changed where it is shown; each change saves at once and its message has **Undo**.

The page has two views of the same class and course, switched with **List | Calendar** under the header:

- **List** (the default): the roadmap, unit by unit. A teacher with no class, or a course whose sets are not written yet, sees only the List (there is nothing to put on a calendar).
- **Calendar** (`?view=calendar`): a month or a week at a time, every set on the day it is due. See [Calendar](#calendar) below.

There used to be a third view, a Status board; it was removed. An old `?view=board` link opens the List. What the board's columns meant is still how a set's status is decided everywhere: see [Where a set stands](#where-a-set-stands).

**Header** (every view): the **class** picker; the **course button**, which names the class's course and opens Change course; **⋯ More**, a menu with **Schedule & days off** (opens in a side sheet; an old `?tab=schedule` link opens it straight away) and **Reorder or skip sets** (swaps the view for the plan editor until it is saved or discarded); and, on the Calendar only, **Assign next N**, which opens the assign dialog for the N sets still to assign in the first unit that has any. On the List each unit has its own Assign button instead, filled for the unit that is up next and outlined for the others, so there is one obvious thing to press in every view.

- **One strip of numbers above both views** (`course-stats.tsx`): the course progress bar with the finish date at the current pace ("12 of 31 sets assigned · on pace to finish Mar 19"; skipped sets are not counted), then Students, the class **Average** (mean of the sets' averages), **Needs you** (the number of sets waiting for the teacher, with the answers inside them underneath: "2 sets · 7 answers") and **Overdue** (missing hand-ins past their due date, summed over sets). A class with no students also gets a line with its join code and a link to the Dashboard's invite link, and its sets say "No students yet" instead of "0 of 0 submitted".
- **List** (`roadmap-tab.tsx`). The list is headed by the course itself: its icon on its tinted tile, its name, level ("Algebra-based"), what it covers and its size. Under it, units and sets look different on purpose, so a teacher can tell where one unit ends and what kind of thing a row is:
  - **A unit is a section.** Its number sits on a tile beside a large title; under the title, "Unit 1 · 4 of 4 sets assigned · due Nov 18 – Nov 30 · average 48% · 1 needs you". The dates are the unit's real due dates, or for a unit with nothing assigned "planned Jan 27 – Feb 2" (where the pacing guide puts it, the same dates as the Calendar's dashed sets), so the List and the Calendar agree. **The tile's colour says how far along the class is**: green only when every set is **done** (handed in by everyone, or past due with nobody missing; see [Where a set stands](#where-a-set-stands)), amber while sets are out with students, grey when nothing is assigned. Assigned is not done: a unit whose four sets are all assigned but not yet due is amber. Red is not used for "not started": on this page it means overdue. On the right, a bar with **one segment per set** (green = done; amber = out with students, stronger when it needs the teacher; grey = still to come; dashed = skipped) and a badge only where the colour does not already say it: **Assign next** (the first unit with sets still to assign; it is not a claim about what the class is working on now), or Skipped / Planned / Not published yet. Units are in the class's order and collapse; the next unit is open, and an open unit sits on a card while closed ones are bare headings with space between them.
  - **Units have their own colours on the Calendar and the unit guide only** (`unitLook` in `unit-look.tsx`): the course's own tint for its first unit (sky for AP Physics 1, amber for AP Physics 2, emerald for C: Mechanics, violet for C: Electricity and Magnetism), then round a fixed wheel of eight, so neighbouring units never share a colour. A unit keeps its colour when a class reorders its units. The List does not use them (eight colours in a column was too much), so on the Calendar the **Jump to** row is the key.
  - **A set is a child of its unit.** The unit's summary, its **Assign this unit / the rest (n sets)** and **Unit guide** buttons and its sets all hang off a neutral rail. Each set has a **status mark on the rail**, told apart by shape as well as colour: filled (assigned), a green tick (done), an amber "!" (needs you), a hollow ring (not assigned), a dashed ring with the title struck through (skipped), a lock (not published or planned). Beside the title are the set's **AP topics** as small chips ("4.1", "4.2"; hover for the topic's name), then a lighter line with the description, problem count and time estimate.
  - On the right of the row: an assigned set has a **due-date chip** (click it to pick another day, or clear it), **Results** (or **Review** when answers wait), a ⋯ menu (Edit problems, Preview, Skip / Stop skipping, Duplicate, Archive), and under them "9 of 13 submitted · average 71% · 2 to check · 1 overdue";
  - a published set that is not assigned has **Assign** (just that set) and a ⋯ menu with **Preview** and **Skip**; clicking its name also opens the preview; a skipped set shows **Unskip**;
  - a set whose class copy was archived shows "Archived · assign to restore it", and **Restore** brings the same copy back (with its students' work) instead of copying it again.
  **Preview** (`set-preview-dialog.tsx`) shows the problems as students see them, the topics and the misconceptions the wrong answers catch; for the class's own copy it has **Edit problems** and **Results**, and **Show answers** loads the key through `GET /api/assignments?id=`; for an unassigned set it has **Assign this set**. Question text, every answer choice and the shown answers go through the app's Markdown renderer, so `$…$` math is typeset (KaTeX) exactly as students see it; the renderer is loaded when the dialog first shows problems. The assignment editor's student preview already rendered math the same way. Under the sets, **What students got wrong** lists up to three misconceptions for the unit with a re-teach suggestion.
- **Reorder or skip sets** (in the header's ⋯ menu, for a class that follows the course) turns the page into an editor: drag a unit or a set by its handle (or focus the handle and use the arrow keys), or use the arrows; tick Skip. Changes are a draft with a save bar (Save order / Discard) and a warning before leaving. After saving, if assigned sets are now out of date order, a message offers **Re-date**: the same due dates handed out again in the new order (`redateToOrder` in `src/lib/course-pacing.ts`), with Undo. This replaces the old Customize tab.
- **Assign dialog.** Lists exactly which sets will be copied and each due date before anything is created. First due date and spacing (every 1, 2 or 3 school days, or weekly) can be changed there; for a single set it asks only for the due date. When a set has more than five problems it also has **Problems per set** (see [How many problems a class gets](#how-many-problems-a-class-gets)). Sets already in the class are skipped, so nothing is duplicated. A class that does not follow the course can still have units assigned.
- **Schedule and days off** (the side sheet from ⋯). The pacing guide, bulk due-date moves and the class's days off (below). It is no longer a tab on the List.

Files: `src/app/teacher/courses/` (`page-client.tsx`, `use-course-data.ts`, `use-set-actions.ts`, `roadmap-tab.tsx`, `course-stats.tsx`, `unit-filter.tsx`, `unit-look.tsx`, `plan-editor.tsx`, `schedule-tab.tsx`, `assign-dialog.tsx`, `set-preview-dialog.tsx`), `src/app/teacher/courses/calendar/course-calendar.tsx` and `src/app/teacher/courses/[curriculumId]/[unit]/page-client.tsx`. `use-set-actions.ts` holds what can be done to one set (assign, assign for a day, change the due date, skip); List rows and the Calendar call the same functions, so a change behaves the same in both. `unit-look.tsx` holds what is shared by every screen: a unit's colour, its number tile, a set's status mark, the per-set progress bar and the topic chips.

### Where a set stands

Every set of the course is in exactly one group. `boardColumns` in `src/lib/course-board.ts` decides which, and `setStatuses` gives each set's status by key; both are pure and tested in `__tests__/course-board.test.ts`. (The names say "board" because the groups were first the columns of the Status board.) The List's marks, the numbers strip, the Calendar and the unit guide all read from it, so a set reads the same everywhere.

| Status | A set has it when | Mark |
|---|---|---|
| **Not assigned** (up next) | published, not assigned, not skipped | hollow ring; dashed chip on the Calendar |
| **Skipped** / **Not published yet** / **Planned** | skipped in the class's plan, or not published here, or not written | dashed ring; lock. Not on the Calendar. |
| **Assigned** | assigned, nothing waiting for the teacher, and not Done | filled dot |
| **Needs you** | assigned and something waits for the teacher: written answers to grade (`pending`) or answers to check after an answer-key change (`needsReview`) | amber "!" |
| **Done** | assigned, nothing waiting, and either everyone on the roster handed it in, or the due date has passed and nobody is missing | green tick |

The checks run in this order: Needs you, then Done, then Assigned. Details worth knowing:

- A set that is past due while students still owe it **stays Assigned** (and counts in Overdue); it is Done when the last student hands it in. (A class with no students has nobody missing, so its sets are Done once past due.)
- An assigned set keeps its status even if the plan skips it. An archived copy counts as not assigned, so its set is back to Not assigned, marked "Archived"; **Restore** brings the same copy back.
- While progress is loading, assigned sets read as Assigned.

Nothing here adds Firestore rules or makes AI calls: assigning uses `POST /api/assignments/clone` (every global set is free to copy), archiving and due dates use `PATCH /api/assignments/{id}`, and the plan uses `PATCH /api/courses/{id}/plan`.

### Calendar

A month or a week at a time (`src/lib/course-calendar.ts`, tested in `__tests__/course-calendar.test.ts`). It opens on the current month; the arrows step a month (or a week), **Today** comes back, **Last set** jumps to the month the course finishes in, and **Month | Week** switches the range. The same strip of numbers sits above it.

- **Colour is the unit.** A set's chip has its unit's colour, so a glance shows where one unit ends and the next begins. The fill says where the set stands: **dashed outline** = planned (not assigned yet, on the date the pacing guide gives it at the current pace), **tinted** = assigned, with an amber "!" when it needs the teacher and a green tick when it is done. Planned sets move when the pace, the plan or the days off change. Skipped and unpublished sets are not shown.
- **Jump to a unit.** Under the grid, one chip per unit in its colour (this row is also the key to the colours); pressing it goes to the month (or week) of the unit's first set (`unitFirstDay`). The **unit filter** beside the List | Calendar switch (`Unit  All 1 2 3 …`, `?unit=4`; `unit-filter.tsx`) narrows the calendar to one unit and jumps to it too; pressing the chosen unit again, or All, shows everything.
- **Today** has a ring, a filled date and the word "Today".
- **Weekends** are narrow columns. A set due on a weekend shows as a count; press it for the list.
- **Days off look different from empty days.** A day with no school is hatched, and the break is **named once across all of its days in the week** on a small card with its dates ("Thanksgiving break · No school · Thu, Nov 26 – Fri, Nov 27"; a winter break runs across the whole row, weekend included). `dayOffRuns` finds the runs. Plain weekends are not named. If a set is due on a day off, the name moves to the bottom of the day.
- **Full days do not overflow.** In the Month view a day shows up to three sets (four when that is all there are), then **+N more**, which lists the rest. The Week view shows every set.
- **Week view.** One tall row with the same days off and weekends, with each set on a roomier card (key, whole title, and "11 of 13 in · 3 to check" or "Planned").
- An assigned set with **no due date** has no day to sit on, so it is listed under the calendar with a link.

Click a set for its unit, where it stands ("8 of 13 handed in · 3 overdue") and its actions: an assigned set has the **due-date chip**, **Results** (or **Review** when something waits) and **Preview**; a planned set has **Assign** (the one-set dialog) and **Preview**.

**Drag a set to another day.** What a drop means is decided by `moveToDay`:

| Drag | What happens |
|---|---|
| An **assigned** set to another school day | Its due date moves there; the time of day is kept and the message has Undo (the same `PATCH /api/assignments/{id}` as the due-date chip). |
| A **planned** set to a school day | That one set is assigned at once, due that day (`assignNow` in `use-set-actions.ts`); Undo archives the copy again, so students stop seeing it and the set is planned again. An archived copy is restored instead of copied. The other planned sets then re-space after it, as the pacing guide always does. |

Only school days take a drop: a weekend or a day off is refused with a message, and the due-date chip in the popover can still set any date. To assign a planned set without dragging, click it and press **Assign** (the one-set dialog, where the date can be changed). Dragging works with a mouse, and with press-and-hold on touch; with a keyboard, open the set and use its buttons.

**Phone width.** The grid becomes a list of the month's (or week's) days that have sets, each with its sets in their unit colours, with the days off in between as hatched rows ("Winter break · no school · Sat, Dec 19 – Mon, Jan 4"); today's day is outlined. Everything else works the same (no dragging on the list, use the due-date chip).

**Setting a class's course.** `POST /api/courses` accepts an optional `curriculumId`. `PATCH /api/courses/{id}/curriculum { curriculumId: string | null }` is owner-only (teacher who owns the class; unknown course 400). Following changes nothing in existing assignments. `firestore.rules` stops clients from writing `curriculumId`, `curriculumPlan` or `daysOff` on a class, so the routes are the only way.

The first-run page (`/teacher/welcome`) has a Course dropdown, lists the chosen course's sets from the definition in roadmap order, and creates the class following that course unless the box is unticked.

### Unit guides: `/teacher/courses/{curriculumId}/{unit}`

A unit's home page, linked from each unit on the List (**Unit guide**). From top to bottom:

- **Header** in the unit's colour: the unit number on a large tile, the course's icon and name, the unit's title and summary, and the facts (sets, problems, student time, AP topics). With a class chosen it adds the class's line (the per-set progress bar, "2 of 4 sets assigned · average 81%", answers to check) and the one filled button, **Assign this unit / the rest (n sets)**, which opens the assign dialog on `/teacher/courses` (`?assign={unit}`).
- **What this unit covers**: one card per AP topic with its number, name and summary, and the sets that practise it (links down the page). When the unit has a guide file, each topic also has **Read the guide**, which opens the topic's full guide in place (see [Guides](#guides)); `#topic-4-2` in the address opens the tab on that topic. A unit with no guide file looks as it did before.
- **Sets in this unit**, on the unit's rail. Each set has, on the left, what it practises: title (opens the preview), description, its AP topics by name, problem count, question types, difficulty mix and time, and the misconceptions its wrong answers catch (highlighted when this class has hit them). On the right, how the class did: the status mark, due date, a hand-in bar ("12 of 13"), the average, answers waiting and students overdue, with **Results** (or **Review**), **Preview** and, for a set not assigned yet, **Assign** (`?assign=4C` opens the one-set dialog on `/teacher/courses`).
- **What students got wrong, and what to re-teach** (with a class): up to three misconceptions, each with how many students hit it, a bar, and the rule-based suggestion labelled **Re-teach to the whole class**, **Pull a small group** or **Check in one to one** (see below). Before anything is graded it says so instead.
- **Misconceptions this unit is built to catch**: every one the unit targets with the sets that target it; those this class has hit are marked "Seen in this class".
- **Previous unit / Next unit**, in the class's order.

**The guide belongs to the chosen class's course.** A class follows exactly one course, so if the chosen class follows a different course (or none) the page does not show the unit; it says which course the class follows, with **Open {course}** (or **Choose a course**) and **Switch to {class}** for each class that does follow this course. A teacher with no class yet can read any course's guides. Nothing about the class is shown until its assignments have loaded.

The per-set facts come from `src/data/curricula/profiles/<id>.json` (`setProfile` in `src/data/curricula/profiles.ts`), generated from the reviewed drafts in `content/<id>/`:
```bash
node tools/curriculum-profile.cjs                              # check AP Physics 1; exits 1 when the committed file is stale
node tools/curriculum-profile.cjs --id ap-physics-2 --write    # after changing a set's draftIds or re-exporting drafts
```
`npx jest course-progress` fails when any course's committed profile no longer matches its content. A planned set (no problems) has no profile. Besides the whole set's figures a profile lists its problems one by one in question order (`each`: minutes, difficulty, type, misconception tags; no text and no answers), which is what lets a page describe the first *n* (`prefixProfile`, `shownProfile`). Minutes are an estimate from question type and difficulty (see `MINUTES` in the tool).

### School calendar and due dates

`src/lib/school-calendar.ts`. Due dates skip weekends and the class's days off. Without its own list a class uses the US defaults for the current and next school year: Labor Day, Indigenous Peoples' Day, Veterans Day, Thanksgiving Thursday and Friday, winter break 19 Dec–4 Jan, Martin Luther King Jr. Day, Presidents' Day, Memorial Day and Juneteenth. Spring break is not included because it differs by district. On the Schedule tab a teacher removes days their school works through, adds their own days or breaks, and saves; the list is stored as `daysOff` on the class (`[{ start, end, label }]`, local `YYYY-MM-DD`, both ends inclusive, at most 80). "Reset to the default calendar" removes it. An empty saved list means weekends only. Saving the calendar does not move due dates by itself: if any upcoming due date now falls on a day off, a message offers **Move them** (each to the next school day).

`addSchoolDays`, `nextSchoolDay`, `scheduleDueDates` (`src/lib/first-run.ts`) and `planAssignments` take an optional school-day test; `schoolDays(calendar)` builds one. `/teacher/welcome` uses the defaults.

### Pacing guide and moving due dates

`src/lib/course-pacing.ts`. `paceCourse` gives every set the class will do a date: sets already assigned keep their real due dates; the rest are spaced from "Next set due", or from one step after the latest real due date when that is later. The tab shows each unit's date range and the finish date, and warns when the course would finish in May or later (AP exams start in early May).

**Move due dates** changes several at once: everything not yet due, one unit, or the class's assignments that are not course sets (every assignment in the class with a due date can be moved, listed by title); later or earlier by 1–10 school days, re-spaced from the pacing guide's date and spacing, or only moved off days off (useful after editing the calendar). Every change is listed before saving, and the message after saving has Undo. One due date is changed on its row instead. `POST /api/courses/{id}/due-dates { updates: [{ assignmentId, dueDate }] }` (owner only, at most 100) writes only `dueDate`, and refuses the whole request if any assignment is not in that class.

### A class's own plan: order and skipped sets

`src/lib/curriculum-plan.ts`. A class that follows a course may store `curriculumPlan: { order: string[], skipped: string[] }`. `order` lists every set key, with each unit's sets together: a teacher can move a whole unit, or a set inside its unit, but a set never leaves its unit, so unit headings and unit insights keep their meaning. Skipped sets are never offered for assigning, do not count in "sets assigned" or the pacing guide, and are not suggested as practice. A set that was already assigned stays assigned if it is skipped later.

`PATCH /api/courses/{id}/plan { plan?: { order, skipped } | null, daysOff?: DayOff[] | null }` (owner only) validates and stores both. A plan equal to the course as written is not stored. Stored plans are read leniently (`normalisePlan`), so a plan saved before the course gains sets keeps working: new sets appear in their usual place.

### Class progress and re-teach suggestions

`GET /api/teacher/courses/progress?courseId=` (owner only) returns the roster size, per-set progress (`submitted`, `graded`, `pending`, `averageScore`, and `overdue`: students on the roster with nothing handed in after the due date, and `needsReview`: students whose handed-in work has answers listed in `reviewQuestions` after an answer-key change) and, per unit, up to three misconceptions from `misconception_events` with the share of students who have graded work in that unit (`src/lib/course-progress.ts`, built on `buildInsightsReport`).

The re-teach suggestion is **rule-based**, so the same data always gives the same words:

| Share of the unit's students | Suggestion starts |
|---|---|
| 40% or more (and at least 3 students) | Re-teach to the whole class |
| 20% or more (and at least 2 students) | Pull a small group |
| otherwise | Check in with these students one to one |

It then names the AP topic to revisit, unassigned sets **from the same unit** that target the misconception ("for more practice, assign …"), and assigned sets whose missed problems are worth going over. Which sets target which misconception comes from the set profiles.

> **Later:** these suggestions could be written by the AI (a short note per unit that reads the actual wrong answers). That needs AI quota, a prompt-injection review of student text, and its own review step, so it starts rule-based.

### Demo data: a class part-way through its course

`tools/seed-course-progress-demo.cjs <classId>` (emulators only, test-only accounts) makes a demo class look like a real one in the middle of the year, so the List and the Calendar have something believable to show: the first unit finished (green), the second finished except for two students who owe its last set, the third under way (one set just closed, one due tomorrow and half in, two ahead), the rest still to assign. It re-dates the class's first twelve course sets in weekdays from today and has roster students hand in what they have not handed in yet; the real Cloud Function grades them, so the functions emulator must be running. Work already handed in is left alone, `--dry-run` prints the plan without writing, and the due dates it replaces are printed first.

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
  node tools/seed-course-progress-demo.cjs <classId> --dry-run
```

## Students

**Dashboard (`/student`).** If the student's class follows a course, a roadmap card shows the units in the class's order: sets handed in out of sets planned, the student's own average per unit, the state (done, in progress, assigned, not assigned yet) and the next set with its due date; **Continue** opens whatever is due first. It appears once at least one course set is assigned. Only the student's own work is used. `src/lib/student-roadmap.ts`, `src/components/dashboard/student-course-roadmap.tsx`.

**Unit guides (`/student/courses/{curriculumId}/{unit}`).** A unit that has a guide file gets a page listing its topics, each with **Read the guide**; `#topic-4-2` opens that topic. On the dashboard roadmap the unit's heading links to it (units without a guide are plain text). "Practise this" links to the class's own assignment for a set that covers the topic, when the class has one. See [Guides](#guides).

**Assignments (`/student/assignments`).** If the class has a `curriculumId`, assignments are grouped under unit headings (`Unit 4: Linear momentum`) in the class's order (its plan, else `curriculumSequence`, then due date). Anything without a set key goes under "Other assignments". Status filters still apply. A class that follows no course shows the flat list with the sort menu as before.

## Guides

A guide teaches one AP topic: the idea, a picture, the equations, two worked examples, the usual mistakes, three questions to check yourself, and sometimes a diagram with sliders. Guides are public, committed content: one file per unit, `src/data/guides/<curriculumId>/unit-<n>.json`, with one guide for every AP topic of that unit. Today there is one file, the exemplar every later unit should copy: **AP Physics 1, Unit 4** (topics 4.1–4.4).

| What | Where |
|---|---|
| Content | `src/data/guides/<curriculumId>/unit-<n>.json` |
| Schema and types | `src/lib/guides/schema.ts` (zod) |
| Which units have a guide, and loading one (a dynamic import per file, so a page downloads only the unit it shows) | `src/lib/guides/index.ts` (`hasUnitGuide`, `loadUnitGuide`, `topicAnchor`, `studentGuideHref`, `requiresDerivation`) |
| Checks | `src/lib/guides/verify.ts` (pure), `tools/verify-guides.cjs` |
| "Try it" templates | `src/lib/guides/try-it.ts` |
| Rendering | `src/components/guide/topic-guide.tsx` (`TopicGuide`), `unit-guide-topics.tsx` (the list with **Read the guide**), `use-unit-guide.ts` |
| Pages | Teacher: the "What it covers" tab of `/teacher/courses/{curriculumId}/{unit}`. Student: `/student/courses/{curriculumId}/{unit}`. Both take `#topic-4-2`. |

### Schema

File: `{ "curriculumId": "ap-physics-1", "unit": 4, "guides": [ … ] }`. Each guide (unknown fields are refused, so a misspelt field is an error):

| Field | What it is |
|---|---|
| `topic` | The AP topic id in the file's course ("4.2") |
| `bigIdea` | One sentence |
| `picture?` | `{ diagram, caption }`: a diagram source (the `dg` language, without the fence) and a caption. Leave out only where no picture helps |
| `explanation` | Markdown, 2–4 short paragraphs |
| `equations[]` | `{ latex, meaning, variables[{ symbol, name, unit }], useWhen, notWhen }`. `latex` and `symbol` are KaTeX without dollar signs |
| `derivation?` | Markdown, shown collapsed. Required for the calculus-based courses (`requiresDerivation`: any AP course whose id starts `physics-c`) |
| `workedExamples[]` | Exactly 2: `{ title, prompt, steps[], answer, style, spec? }`. `style` is `"stepped"` (one step per press, then the answer) or `"ap"` (written out like an exam answer). An answer with a digit in it is numeric and must have a `spec` |
| `spec` | `{ givens: { name: { value, unit } }, expr, unit }`: arithmetic over the givens whose value, in `unit`, is the answer |
| `misconceptions[]` | `{ tag?, wrong, right }`. `tag` is a misconception tag of the course (`functions/src/misconceptions.ts`); teachers see its label |
| `checkYourself[]` | Exactly 3: `{ q, a }` |
| `tryIt?` | `{ diagram, caption?, params[{ name, label, min, max, step, default, unit }] }`. The diagram source has `{{…}}` placeholders: a parameter's name, or arithmetic over parameters (`{{300/t}}`, `{{round(100*m/(m+2))}}`; + - * / ^, parentheses, `pi`, `sqrt abs sin cos tan min max round`). One slider per parameter |
| `prerequisites?` | Topic ids earlier in the same course |
| `teacherNotes?` | Markdown. Shown only where the page passes `teacher` (the teacher's unit guide) |

Every text field is Markdown and may use LaTeX (`$…$`, and `$$` on its own lines for display); write `\$` for a dollar sign. A Markdown field may hold a fenced `dg` diagram. The rule that problems avoid LaTeX does not apply to guides. Paragraphs are separated by a blank line; a single line break inside a paragraph shows as a line break. The diagram kinds in use are `plot`, `fbd` and `scene` (`src/lib/diagram/prompt.ts`).

`teacherNotes` is hidden by the page, not by access control: the file is public content that any signed-in user's browser can load. Do not put answer keys or anything private in it.

### What the verifier checks

```bash
node tools/verify-guides.cjs --all                            # every guide file
node tools/verify-guides.cjs --course ap-physics-1            # one course
node tools/verify-guides.cjs --course ap-physics-1 --unit 4   # one unit
npx jest guides topic-guide                                   # the same checks, plus the component tests
```

It exits 1 on any error. For each file:

- the schema; the file's course and unit exist, and match its folder and name;
- **one guide for every AP topic of the unit**, none twice, none for another unit;
- every LaTeX string compiles in KaTeX with `throwOnError` (equation cards, variable symbols, and all `$…$` / `$$…$$` in every Markdown field, teacher notes included); a stray `$` or an unclosed code fence is an error;
- every diagram (the picture, `dg` blocks in Markdown, the try-it diagram) draws with `ok === true`, is safe to show, and has no "physics" warning. Readability warnings are printed, not failed;
- a try-it diagram draws with every parameter at its minimum, default and maximum, and with each parameter alone at each end; every placeholder has a parameter and every parameter is used;
- every symbol in an equation is explained by its `variables`. The heuristic (`latexSymbols`): a symbol is a Latin letter or Greek command with its subscript; `\vec{}`, `\hat{}` and the like are looked through; `\Delta`, `\Sigma`, function names, numbers and anything in `\text{}` are not symbols; `d` directly before a letter is a differential. A listed symbol with no subscript covers its subscripted forms (`v` covers `v_i`, `v_f`); `v_i` alone does not cover `v_f`. List several symbols in one entry as `m_1,\ m_2`. Units inside an equation belong in `\text{}`;
- misconception tags belong to the course; prerequisites exist and come earlier;
- the calculus-based courses have a derivation;
- the big idea is one sentence and the explanation has 2–4 paragraphs;
- **length: 400–900 words per topic** across the big idea, the explanation, the derivation, the worked examples, the misconceptions and check-yourself. Equation cards, captions, labels, teacher notes and diagram sources are not counted; a piece of math counts as one word (`COUNTED` and `countWords` in `verify.ts`).

It ends with a coverage report: for each course, which units have no guide file yet. That is not a failure.

**Worked-example numbers.** `checkWorkedExample(example, evaluate?)` takes the evaluator as a parameter. With one, the spec is evaluated and the answer must state that value, to the digits it is written with (`6.0` accepts 5.95–6.05; `8.7 × 10^3` accepts 8650–8750), in the spec's unit. Without one it checks shape only: a numeric answer has a spec, the expression reads only its givens, the answer states a number and names the spec's unit. The evaluator is meant to be `evaluateSpec` from `src/lib/content/spec.ts`; it is **not connected yet** (two places marked `INTEGRATION HOOK`: `tools/verify-guides.cjs` and `__tests__/guides-content.test.ts`). Until it is, the command-line tool checks shape only, and the test run recomputes every answer with a small test-only arithmetic evaluator (`tests/helpers/guide-fixture.ts`).

### Adding a unit

1. Copy `src/data/guides/ap-physics-1/unit-4.json` to `src/data/guides/<curriculumId>/unit-<n>.json` and write a guide for every topic of the unit in `src/data/ap/`. Teach, do not summarise; original wording; check every number by hand.
2. Register the file in `LOADERS` in `src/lib/guides/index.ts` (one line; a test fails if the list and the files on disk differ).
3. Run `node tools/verify-guides.cjs --course <curriculumId> --unit <n>` until it passes, then `npx jest guides`.
4. Look at it in the browser: the teacher's unit guide ("What it covers") and `/student/courses/<curriculumId>/<n>`, at phone width and in dark mode, and drag every slider end to end.

Nothing else changes: the teacher tab, the student page and the roadmap link appear for any unit that has a file.

## Backfill: `tools/curriculum-tag.cjs`

Tags global waypoints published before this feature: an assignment matches a set when its `contentDraftIds` are exactly the set's `draftIds`, and it gets `curriculumId`, `curriculumSetKey`, `curriculumSequence` and the normalised title. Dry run unless `--apply`; safe to re-run; two assignments for one set are reported and skipped.
```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node tools/curriculum-tag.cjs --project demo-scorpio          # dry run
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node tools/curriculum-tag.cjs --project demo-scorpio --apply
node tools/curriculum-tag.cjs --project <project-id>                                                # real project: ADC, dry run
```
Tests: `__tests__/curricula.test.ts`, `curriculum-routes`, `curriculum-tag`, `course-availability`, `school-calendar`, `curriculum-plan` (plan, pacing, bulk moves), `course-progress` (profiles, progress, re-teach), `course-plan-routes`, `problems-per-set` (the dialog's control, the remembered choice), `assignment-clone` (the first n problems), `student-roadmap`, `guides-verify`, `guides-content`, `topic-guide`, and the class rules in `tests/security/rules-rt14.test.ts`.
