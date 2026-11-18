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
| Where a set stands (not assigned, assigned, needs you, done), the numbers strip | `src/lib/course-board.ts` |
| Calendar: sets on days, month and week grids, runs of days off, what dropping a set on a day means | `src/lib/course-calendar.ts` |
| Unit colours, status marks, topic chips (shared by List, Calendar, unit guide) | `src/app/teacher/courses/unit-look.tsx` |
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

**Adding a course:** add `src/data/ap/<course>.json` and register it in `AP_COURSES` and in `AP_COURSE_KEYS` / `AP_COURSE_UNIT_RANGE` (`functions/src/misconceptions.ts`; a test keeps the two in step); give its units misconception tags (`courseUnits`); add a line for it in `COURSE_METHODS` (`src/lib/content/problem-generator.ts`); add `src/data/curricula/<id>.json` with its `apCourse` and register it in `CURRICULA`; once it has content, export the drafts to `content/<id>/`, run `node tools/curriculum-profile.cjs --id <id> --write` and register the profile in `profiles.ts`, and list the export file in `CONTENT_FILES` (`src/data/curricula/content-files.ts`).

**Still AP Physics 1 only.** None of these blocks the other courses; each is a place where a teacher of another course gets less:

| Where | What is fixed to Physics 1 |
|---|---|
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

"Courses" is the first item under **Teach** in the sidebar (Teach: Courses, My Assignments, Create Assignment, Waypoints; then Results and School). The page is built around one class, chosen with the class picker in the header; it is the same selected class as every other teacher page (see [teacher-editing.md](teacher-editing.md)). The view (`?view=calendar`), the Calendar's unit filter (`?unit=`) and the Schedule sheet (`?tab=schedule`) are kept in the address bar.

**One course per class.** A class follows one course, or none (`curriculumId` on the class doc). The Courses page shows the chosen class's course and names it on a highlighted **course button** beside the class picker; there is no way to look at a different course from the one the class follows, so a teacher never looks at one course while a class follows another. Where the course is set:

- **A class with no course** opens the page on **Which course is {class} taking?**: one card per course with its icon, whether it is algebra- or calculus-based, what it covers, its units as chips, its size ("8 units · 32 sets · 160 problems") and **Start {course}**. A course whose name appears in the class's name is marked "Matches the class name" and gets the filled button. Nothing else is offered until one is chosen (a class may also stay without a course and keep working as a plain class).
- **The course button** ("AP Physics 2 ▾", tinted in the primary colour so the course on screen is obvious) opens a small dialog with one row per course (icon, level, size; the class's course is marked **Current** and the choice is ticked) and a **No course** row.
- **Where the class starts.** Picking a course (from the chooser's **Start {course}**, or the course button) opens one dialog: the courses as rows, then **Where does the class start?** with **From the beginning** or **Part-way through** (a unit, then the first set to do). Starting part-way saves a plan with every earlier set skipped (`planStartingAt` in `src/lib/curriculum-plan.ts`), so those sets are not offered, paced or counted, "Assign next" begins at the chosen set, and any of them can be un-skipped later. Nothing new is stored: it is the class's ordinary `curriculumPlan`.
- **Course icons.** Each course has its own hand-drawn icon (`src/components/teacher/course-icon.tsx`), used on the course button, the chooser, the dialog and the dropdowns: a ball in flight for AP Physics 1 (algebra-based mechanics), an atom for AP Physics 2 (electricity through modern physics), and an integral sign beside a moving ball for AP Physics C: Mechanics (mechanics with calculus). A new course needs a drawing and a `LOOKS` entry there; without one it shows the plain route icon.
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
  - **Units have their own colours on the Calendar and the unit guide only** (`unitLook` in `unit-look.tsx`): the course's own tint for its first unit (sky for AP Physics 1, amber for AP Physics 2, emerald for C: Mechanics), then round a fixed wheel of eight, so neighbouring units never share a colour. A unit keeps its colour when a class reorders its units. The List does not use them (eight colours in a column was too much), so on the Calendar the **Jump to** row is the key.
  - **A set is a child of its unit.** The unit's summary, its **Assign this unit / the rest (n sets)** and **Unit guide** buttons and its sets all hang off a neutral rail. Each set has a **status mark on the rail**, told apart by shape as well as colour: filled (assigned), a green tick (done), an amber "!" (needs you), a hollow ring (not assigned), a dashed ring with the title struck through (skipped), a lock (not published or planned). Beside the title are the set's **AP topics** as small chips ("4.1", "4.2"; hover for the topic's name), then a lighter line with the description, problem count and time estimate.
  - On the right of the row: an assigned set has a **due-date chip** (click it to pick another day, or clear it), **Results** (or **Review** when answers wait), a ⋯ menu (Edit problems, Preview, Skip / Stop skipping, Duplicate, Archive), and under them "9 of 13 submitted · average 71% · 2 to check · 1 overdue";
  - a published set that is not assigned has **Assign** (just that set) and a ⋯ menu with **Preview** and **Skip**; clicking its name also opens the preview; a skipped set shows **Unskip**;
  - a set whose class copy was archived shows "Archived · assign to restore it", and **Restore** brings the same copy back (with its students' work) instead of copying it again.
  **Preview** (`set-preview-dialog.tsx`) shows the problems as students see them, the topics and the misconceptions the wrong answers catch; for the class's own copy it has **Edit problems** and **Results**, and **Show answers** loads the key through `GET /api/assignments?id=`; for an unassigned set it has **Assign this set**. Question text, every answer choice and the shown answers go through the app's Markdown renderer, so `$…$` math is typeset (KaTeX) exactly as students see it; the renderer is loaded when the dialog first shows problems. The assignment editor's student preview already rendered math the same way. Under the sets, **What students got wrong** lists up to three misconceptions for the unit with a re-teach suggestion.
- **Reorder or skip sets** (in the header's ⋯ menu, for a class that follows the course) turns the page into an editor: drag a unit or a set by its handle (or focus the handle and use the arrow keys), or use the arrows; tick Skip. Changes are a draft with a save bar (Save order / Discard) and a warning before leaving. After saving, if assigned sets are now out of date order, a message offers **Re-date**: the same due dates handed out again in the new order (`redateToOrder` in `src/lib/course-pacing.ts`), with Undo. This replaces the old Customize tab.
- **Assign dialog.** Lists exactly which sets will be copied and each due date before anything is created. First due date and spacing (every 1, 2 or 3 school days, or weekly) can be changed there; for a single set it asks only for the due date. Sets already in the class are skipped, so nothing is duplicated. A class that does not follow the course can still have units assigned.
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
- **What this unit covers**: one card per AP topic with its number, name and summary, and the sets that practise it (links down the page).
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
`npx jest course-progress` fails when any course's committed profile no longer matches its content. A planned set (no problems) has no profile. Minutes are an estimate from question type and difficulty (see `MINUTES` in the tool).

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

**Assignments (`/student/assignments`).** If the class has a `curriculumId`, assignments are grouped under unit headings (`Unit 4: Linear momentum`) in the class's order (its plan, else `curriculumSequence`, then due date). Anything without a set key goes under "Other assignments". Status filters still apply. A class that follows no course shows the flat list with the sort menu as before.

## Backfill: `tools/curriculum-tag.cjs`

Tags global waypoints published before this feature: an assignment matches a set when its `contentDraftIds` are exactly the set's `draftIds`, and it gets `curriculumId`, `curriculumSetKey`, `curriculumSequence` and the normalised title. Dry run unless `--apply`; safe to re-run; two assignments for one set are reported and skipped.
```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node tools/curriculum-tag.cjs --project demo-scorpio          # dry run
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node tools/curriculum-tag.cjs --project demo-scorpio --apply
node tools/curriculum-tag.cjs --project <project-id>                                                # real project: ADC, dry run
```
Tests: `__tests__/curricula.test.ts`, `curriculum-routes`, `curriculum-tag`, `course-availability`, `school-calendar`, `curriculum-plan` (plan, pacing, bulk moves), `course-progress` (profiles, progress, re-teach), `course-plan-routes`, `student-roadmap`, and the class rules in `tests/security/rules-rt14.test.ts`.
