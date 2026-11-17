# Scorpio Courses (curriculum roadmaps)

Sprint 3. **Waypoints** is still the library of single sets (global, department, mine). A **course** is an ordered roadmap on top of it: units in order, each with its sets in order. A teacher can optionally attach a course to a class; classes that follow none work exactly as before.

**Three courses.**

| Course | `curriculumId` | State |
|---|---|---|
| AP Physics 1 | `ap-physics-1` | Complete: 8 units × 4 sets × 5 problems = 32 sets, 160 problems (1A–8D). All are AI-reviewed only and need a person's approval before they can go live; see [units-4-6-review.md](../content/ap-physics-1/units-4-6-review.md) and [units-1-3-7-8-review.md](../content/ap-physics-1/units-1-3-7-8-review.md). In the Firenook emulator all 32 sets are published and tagged. |
| AP Physics 2 | `ap-physics-2` | Complete: 7 units (9–15) × 4 sets × 5 problems = 28 sets, 140 problems (9A–15D). AI-reviewed only; see [units-9-15-review.md](../content/ap-physics-2/units-9-15-review.md). Published and tagged in the Firenook emulator. |
| AP Physics C: Mechanics | `ap-physics-c-mech` | Complete: 7 units (1–7) × 4 sets × 5 problems = 28 sets, 140 problems (1A–7D), calculus-based. AI-reviewed only; see [units-1-7-review.md](../content/ap-physics-c-mech/units-1-7-review.md). Published and tagged in the Firenook emulator. |

Every problem in all three courses still needs a person's check before it can go live: the AI review found wrong keys in each course (the review logs list them), and it can miss others. A course whose sets have no problems yet would show on `/teacher/courses` with a "Planned" badge (none does now). AP Physics C: Electricity and Magnetism is not outlined yet.

**Naming.** In code, "course" already means a *class* (`courses` collection, `courseId`, `ownsCourse`) and `apCourse` is the AP subject. The new concept is `curriculum` / `curriculumId` in code and "Courses" in the UI.

## Where things live

| What | Where |
|---|---|
| Course definition | `src/data/curricula/<id>.json` (`ap-physics-1`, `ap-physics-2`, `ap-physics-c-mech`), helpers in `src/data/curricula/index.ts` |
| Roadmap state (availability, assigned, next unit, draft states) | `src/lib/curriculum-roadmap.ts` |
| A class's order and skipped sets | `src/lib/curriculum-plan.ts` |
| Days off and school-day tests | `src/lib/school-calendar.ts` |
| Pacing guide, bulk due-date moves | `src/lib/course-pacing.ts` |
| Class progress, re-teach suggestions | `src/lib/course-progress.ts` |
| Student dashboard roadmap | `src/lib/student-roadmap.ts` |
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
`apCourse` says which AP course's units and topics the sets refer to. Units and topics come from `src/data/ap/` (`physics1.json`, `physics2.json`, `physicsc-mech.json`); they are not repeated. A set with an empty `draftIds` is planned. The published title is `displayTitle(set)`: "AP Physics 1 · Unit 4A · Momentum of objects and systems".

A published set is a global `assignments` doc with the usual AP fields plus `curriculumId`, `curriculumSetKey` and `curriculumSequence` (0-based position over the whole course). Clones copy all three, so a class's own assignment keeps its set key. A class doc may have `curriculumId` (absent or null = follows nothing), `curriculumPlan` (its own order and skipped sets) and `daysOff` (its school calendar).

## Adding sets

Append to `sets` in the same shape (keys are `<unit><letter>`, e.g. `1A`, `7C`, `12B`; they never change once published). `draftIds` are approved `content_drafts` ids, in question order. Order in the file is cosmetic: unit then letter decides the roadmap. `npx jest curricula ap-courses` checks that keys are unique, each set's unit matches its key and its topics, topics exist in the course, and no draft id appears in two sets. To get drafts into a project, see [content-pipeline.md](content-pipeline.md) (`tools/content-drafts.cjs import`).

## More than one course

Unit numbers and topic ids repeat between courses: AP Physics 1 and AP Physics C: Mechanics both have a unit 2 and a topic "1.1", and both have a set "1A". So:

- **AP data is scoped by course.** `src/data/ap/index.ts` has `AP_COURSES` (`physics-1`, `physics-2`, `physics-c-mech`) and every helper takes the course last: `apUnits(course)`, `apUnit(unit, course)`, `apTopic(id, course)`, `apUnitLabel`, `apTopicLabel`, `isApTopicId`. The default is AP Physics 1, which is what every assignment saved so far is. `normaliseApTags` checks topics against the assignment's own `apCourse`.
- **A set key only means something with its `curriculumId`.** The roadmap, class progress and the student views ignore a class assignment whose `curriculumId` is another course (older copies without one still count). `GET /api/teacher/courses/progress` takes an optional `curriculumId`.
- **A class follows one course at a time.** Viewing another course offers "Switch to …"; switching keeps every assignment.

- **Misconception tags belong to courses.** `functions/src/misconceptions.ts` keeps one list. A tag's `units` are its AP Physics 1 units; `courseUnits` holds the other courses; `misconceptionUnits(tag, course)` is the only place that reads them (`[]` = any unit, `null` = not a tag of that course). AP Physics 2 has 66 tags of its own for units 9–15 (thermodynamics, electricity, circuits, magnetism, optics, waves, modern physics) and borrows four mechanics ideas that carry over. AP Physics C: Mechanics reuses the mechanics tags under the same unit numbers (its units 1–7 match Physics 1 units 1–7; the fluids tags are left out) and adds three that only show up with calculus (`constant-acceleration-assumed`, `derivative-integral-confusion`, `rolling-ignores-rotation`). The AI grader is offered the tags of the assignment's course.
- **Misconception events carry the course.** Each row in `misconception_events` stores `apCourse` with its `apUnit` and `apTopic` (null when there is no unit). Rows written before this have no `apCourse` and mean AP Physics 1. `/teacher/insights` groups "By AP unit" per course ("AP Physics C: Mechanics · Unit 2: …" never merges with Physics 1's Unit 2; a report with only Physics 1 work reads as before), the unit filter lists every course's units, and `GET /api/teacher/insights` takes `apCourse` with `apUnit` (no course = AP Physics 1). A class's unit insights on `/teacher/courses` count only events of the course it follows.
- **The content pipeline takes the course.** `POST /api/admin/content/generate { apCourse?, apTopic, count }` (default AP Physics 1); drafts store `course`; the prompts name the course, and only C: Mechanics is told to use calculus; a draft is validated against its own course's topics and tags; publish sets the assignment's `apCourse` from the course definition and refuses drafts written for another course. See [content-pipeline.md](content-pipeline.md).
- **Unit pickers list every course.** The create page, the Waypoints filter, the insights filter and the admin content page use one grouped picker (`src/components/ap-unit-select-items.tsx`). Its values are `apUnitKey(course, unit)`: the bare number for AP Physics 1 ("4"), prefixed otherwise ("physics-2:9").

**Adding a course:** add `src/data/ap/<course>.json` and register it in `AP_COURSES` and in `AP_COURSE_KEYS` / `AP_COURSE_UNIT_RANGE` (`functions/src/misconceptions.ts`; a test keeps the two in step); give its units misconception tags (`courseUnits`); add a line for it in `COURSE_METHODS` (`src/lib/content/problem-generator.ts`); add `src/data/curricula/<id>.json` with its `apCourse` and register it in `CURRICULA`; once it has content, export the drafts to `content/<id>/`, run `node tools/curriculum-profile.cjs --id <id> --write` and register the profile in `profiles.ts`, and list the export file in `CONTENT_FILES` (`src/app/admin/content/sets-panel.tsx`).

**Still AP Physics 1 only.** None of these blocks the other courses; each is a place where a teacher of another course gets less:

| Where | What is fixed to Physics 1 |
|---|---|
| `/teacher/welcome` (`src/app/teacher/welcome/page-client.tsx`, `countByUnit` in `src/lib/first-run.ts`) | The first-run page offers only AP Physics 1 sets and creates the class following AP Physics 1. A teacher of another course picks it on `/teacher/courses` afterwards |
| `src/app/features/page.tsx` | The marketing page lists AP Physics 1 units |
| `tools/grading-eval/cases.json` | The 50 labelled grading cases are AP Physics 1 answers; free-response grading of Physics 2 or C: Mechanics answers has not been measured |
| Answer units | The numeric checker has no Celsius unit and does not know spelled-out prefixes ("micrograms"). Such answers are keyed as a plain number with "Give your answer in …" in the question (the Physics 2 generator prompt says so) |

## Admin: publish by set

`/admin/content` has a **Sets** tab with a course picker (`?tab=sets&course=ap-physics-2` opens on a course). For each set it shows every draft's state (draft, AI-reviewed, human-approved, published, rejected, missing) from `GET /api/admin/content/sets?curriculumId=` (admin only, read-only). **Publish set** is enabled when every draft is approved and calls `POST /api/admin/content/publish { curriculumId, setKey }`. The title, description, draft list and question order then come from the definition. Every existing check still applies (approved, one unit, re-validation, and AI-reviewed drafts are refused outside the emulator; the tab shows that error). Publishing a set that already exists as a global waypoint returns 409; an unknown set returns 400. `{ draftIds, title }` still works for ad-hoc sets.

## Why a teacher may see "Not published yet" on every set

The roadmap lists every set in the definition, but a set can only be assigned once it exists as a published global waypoint **in the Firebase project the app is running against**. The 440 problems of the three courses were published only in the local Firenook emulator, so `npm run dev` against a real project shows every set as "Not published yet" (this used to read "Coming soon"). Three states (`setAvailability` in `src/lib/curriculum-roadmap.ts`):

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

"Courses" in the sidebar, next to Waypoints. The page is built around one class (the choice is remembered in the browser):

- **Class card.** Pick a class, follow or stop following the course, and see a summary strip: sets assigned, students, average score, and the date the course finishes at the current pace. **Assign next** opens the assign dialog for the first unit that still has sets to assign.
- **Roadmap tab.** Units in the class's order, as collapsible sections; the next unit is open. Each set shows its description, problem count and time estimate, its status (assigned with due date, not assigned, not published, skipped) and, once assigned, "9 of 13 submitted · average 71%". **Preview** shows the problems as students see them, the topics and the misconceptions the wrong answers catch; for the class's own copy, **Show answers** loads the key through `GET /api/assignments?id=`. **Results** opens the assignment. Under the sets, **What students got wrong** lists up to three misconceptions for the unit with a re-teach suggestion.
- **Assign dialog.** Lists exactly which sets will be copied and each due date before anything is created. First due date and spacing (every 1, 2 or 3 school days, or weekly) can be changed there. Sets already in the class are skipped, so nothing is duplicated. A class that does not follow the course can still have units assigned.
- **Schedule tab.** The pacing guide, bulk due-date moves and the class's days off (below).
- **Customize tab.** The class's own order and skipped sets (below). Needs the class to follow the course.

Files: `src/app/teacher/courses/` (`page-client.tsx`, `use-course-data.ts`, `roadmap-tab.tsx`, `schedule-tab.tsx`, `customize-tab.tsx`, `assign-dialog.tsx`, `set-preview-dialog.tsx`).

**Follow / stop following.** `POST /api/courses` accepts an optional `curriculumId`. `PATCH /api/courses/{id}/curriculum { curriculumId: string | null }` is owner-only (teacher who owns the class; unknown course 400). Following changes nothing in existing assignments. `firestore.rules` stops clients from writing `curriculumId`, `curriculumPlan` or `daysOff` on a class, so the routes are the only way.

The first-run page (`/teacher/welcome`) lists sets from the definition, ordered by roadmap, and creates the class following AP Physics 1 unless the box is unticked.

### Unit guides: `/teacher/courses/{curriculumId}/{unit}`

One page per unit (linked from each unit on the roadmap): sets, problems, estimated student time and topics; each set with its topics, question types, difficulty mix and the misconceptions it catches; the AP topics with their summaries; and every misconception the unit targets with the sets that target it. With a class chosen it also shows that class's status, results and re-teach suggestions for the unit.

The per-set facts come from `src/data/curricula/profiles/<id>.json` (`setProfile` in `src/data/curricula/profiles.ts`), generated from the reviewed drafts in `content/<id>/`:
```bash
node tools/curriculum-profile.cjs                              # check AP Physics 1; exits 1 when the committed file is stale
node tools/curriculum-profile.cjs --id ap-physics-2 --write    # after changing a set's draftIds or re-exporting drafts
```
`npx jest course-progress` fails when any course's committed profile no longer matches its content. A planned set (no problems) has no profile. Minutes are an estimate from question type and difficulty (see `MINUTES` in the tool).

### School calendar and due dates

`src/lib/school-calendar.ts`. Due dates skip weekends and the class's days off. Without its own list a class uses the US defaults for the current and next school year: Labor Day, Indigenous Peoples' Day, Veterans Day, Thanksgiving Thursday and Friday, winter break 19 Dec–4 Jan, Martin Luther King Jr. Day, Presidents' Day, Memorial Day and Juneteenth. Spring break is not included because it differs by district. On the Schedule tab a teacher removes days their school works through, adds their own days or breaks, and saves; the list is stored as `daysOff` on the class (`[{ start, end, label }]`, local `YYYY-MM-DD`, both ends inclusive, at most 80). "Reset to the default calendar" removes it. An empty saved list means weekends only. Saving the calendar does not move existing due dates.

`addSchoolDays`, `nextSchoolDay`, `scheduleDueDates` (`src/lib/first-run.ts`) and `planAssignments` take an optional school-day test; `schoolDays(calendar)` builds one. `/teacher/welcome` uses the defaults.

### Pacing guide and moving due dates

`src/lib/course-pacing.ts`. `paceCourse` gives every set the class will do a date: sets already assigned keep their real due dates; the rest are spaced from "Next set due", or from one step after the latest real due date when that is later. The tab shows each unit's date range and the finish date, and warns when the course would finish in May or later (AP exams start in early May).

**Move due dates** changes several at once: everything not yet due, or one unit; later or earlier by 1–10 school days, re-spaced from the pacing guide's date and spacing, or only moved off days off (useful after editing the calendar). Every change is listed before saving. `POST /api/courses/{id}/due-dates { updates: [{ assignmentId, dueDate }] }` (owner only, at most 100) writes only `dueDate`, and refuses the whole request if any assignment is not in that class.

### A class's own plan: order and skipped sets

`src/lib/curriculum-plan.ts`. A class that follows a course may store `curriculumPlan: { order: string[], skipped: string[] }`. `order` lists every set key, with each unit's sets together: a teacher can move a whole unit, or a set inside its unit, but a set never leaves its unit, so unit headings and unit insights keep their meaning. Skipped sets are never offered for assigning, do not count in "sets assigned" or the pacing guide, and are not suggested as practice. A set that was already assigned stays assigned if it is skipped later.

`PATCH /api/courses/{id}/plan { plan?: { order, skipped } | null, daysOff?: DayOff[] | null }` (owner only) validates and stores both. A plan equal to the course as written is not stored. Stored plans are read leniently (`normalisePlan`), so a plan saved before the course gains sets keeps working: new sets appear in their usual place.

### Class progress and re-teach suggestions

`GET /api/teacher/courses/progress?courseId=` (owner only) returns the roster size, per-set progress (`submitted`, `graded`, `pending`, `averageScore`) and, per unit, up to three misconceptions from `misconception_events` with the share of students who have graded work in that unit (`src/lib/course-progress.ts`, built on `buildInsightsReport`).

The re-teach suggestion is **rule-based**, so the same data always gives the same words:

| Share of the unit's students | Suggestion starts |
|---|---|
| 40% or more (and at least 3 students) | Re-teach to the whole class |
| 20% or more (and at least 2 students) | Pull a small group |
| otherwise | Check in with these students one to one |

It then names the AP topic to revisit, unassigned sets **from the same unit** that target the misconception ("for more practice, assign …"), and assigned sets whose missed problems are worth going over. Which sets target which misconception comes from the set profiles.

> **Later:** these suggestions could be written by the AI (a short note per unit that reads the actual wrong answers). That needs AI quota, a prompt-injection review of student text, and its own review step, so it starts rule-based.

## Students

**Dashboard (`/student`).** If the student's class follows a course, a roadmap card shows the units in the class's order: sets handed in out of sets planned, the student's own average per unit, the state (done, in progress, assigned, not assigned yet) and the next set with its due date; **Continue** opens whatever is due first. It appears once at least one course set is assigned. Only the student's own work is used. `src/lib/student-roadmap.ts`, `src/components/dashboard/student-course-roadmap.tsx`.

**Assignments (`/student/assignments`).** If the class has a `curriculumId`, assignments are grouped under unit headings (`Unit 4: Linear momentum`) in the class's order (its plan, else `curriculumSequence`, then due date). Anything without a set key goes under "Other assignments". Status filters still apply. A class that follows no course shows the flat list with the sort menu as before.

## Backfill: `tools/curriculum-tag.cjs`

Tags global waypoints published before this feature: an assignment matches a set when its `contentDraftIds` are exactly the set's `draftIds`, and it gets `curriculumId`, `curriculumSetKey`, `curriculumSequence` and the normalised title. Dry run unless `--apply`; safe to re-run; two assignments for one set are reported and skipped.
```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node tools/curriculum-tag.cjs --project demo-scorpio          # dry run
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node tools/curriculum-tag.cjs --project demo-scorpio --apply
node tools/curriculum-tag.cjs --project <project-id>                                                # real project: ADC, dry run
```
Tests: `__tests__/curricula.test.ts`, `curriculum-routes`, `curriculum-tag`, `course-availability`, `school-calendar`, `curriculum-plan` (plan, pacing, bulk moves), `course-progress` (profiles, progress, re-teach), `course-plan-routes`, `student-roadmap`, and the class rules in `tests/security/rules-rt14.test.ts`.
