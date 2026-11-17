# Scorpio Courses (curriculum roadmaps)

Sprint 3. **Waypoints** is still the library of single sets (global, department, mine). A **course** is an ordered roadmap on top of it: units in order, each with its sets in order. A teacher can optionally attach a course to a class; classes that follow none work exactly as before.

**Three courses.**

| Course | `curriculumId` | State |
|---|---|---|
| AP Physics 1 | `ap-physics-1` | Complete: 8 units × 4 sets × 5 problems = 32 sets, 160 problems (1A–8D). All are AI-reviewed only and need a person's approval before they can go live; see [units-4-6-review.md](../content/ap-physics-1/units-4-6-review.md) and [units-1-3-7-8-review.md](../content/ap-physics-1/units-1-3-7-8-review.md). In the Firenook emulator all 32 sets are published and tagged. |
| AP Physics 2 | `ap-physics-2` | **Planned.** Outline only: units 9–15, 28 sets (9A–15D), no problems written. |
| AP Physics C: Mechanics | `ap-physics-c-mech` | **Planned.** Outline only: units 1–7, 28 sets (1A–7D), no problems written. |

A planned course shows on `/teacher/courses` with a "Planned" badge; its roadmap and unit guides can be read, but nothing can be previewed, assigned or followed until sets are published. AP Physics C: Electricity and Magnetism is not outlined yet.

**Naming.** In code, "course" already means a *class* (`courses` collection, `courseId`, `ownsCourse`) and `apCourse` is the AP subject. The new concept is `curriculum` / `curriculumId` in code and "Courses" in the UI.

## Where things live

| What | Where |
|---|---|
| Course definition | `src/data/curricula/ap-physics-1.json`, helpers in `src/data/curricula/index.ts` |
| Roadmap state (availability, assigned, next unit, draft states) | `src/lib/curriculum-roadmap.ts` |
| A class's order and skipped sets | `src/lib/curriculum-plan.ts` |
| Days off and school-day tests | `src/lib/school-calendar.ts` |
| Pacing guide, bulk due-date moves | `src/lib/course-pacing.ts` |
| Class progress, re-teach suggestions | `src/lib/course-progress.ts` |
| Status board: columns, stats, what a drop means | `src/lib/course-board.ts` |
| Calendar: sets on days, the month grid, moving a due date | `src/lib/course-calendar.ts` |
| Student dashboard roadmap | `src/lib/student-roadmap.ts` |
| Set profiles (time, difficulty, misconceptions) | `src/data/curricula/profiles.ts`, `tools/curriculum-profile.cjs` |
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

**Adding a course:** add `src/data/ap/<course>.json` and register it in `AP_COURSES`; add `src/data/curricula/<id>.json` with its `apCourse` and register it in `CURRICULA` (and its profile in `profiles.ts` once it has content).

**Still AP Physics 1 only.** These must be generalised before problems can be written or published for the two planned courses (none of them affects AP Physics 1):

| Where | What is fixed to Physics 1 |
|---|---|
| `functions/src/misconceptions.ts` | The 37 conceptual tags are mechanics, mapped to Physics 1 unit numbers. Physics 2 needs its own tags (thermodynamics, electricity, magnetism, optics, waves, modern physics); C: Mechanics can reuse the mechanics tags but its unit numbers differ |
| `functions/src/misconception-events.ts` | Events store `apUnit` (1–8) and `apTopic` with no course, so unit 2 of two courses would merge in `/teacher/insights`. Add `apCourse` to events, then label and filter by it in `src/lib/insights.ts` and the insights route (`apUnit` 1–8 check) |
| `src/lib/content/problem-generator.ts`, `/api/admin/content/generate`, `src/lib/content/drafts.ts` | Prompts say "AP Physics 1 … no calculus"; drafts are typed `course: "physics-1"`; the admin page lists Physics 1 units |
| `src/lib/schemas/api-bodies.ts` | `apCourse` enum is `["physics-1"]`, `apUnit` max 8, topic id regex `[1-8].n` |
| `/api/admin/content/publish` | Does not set `apCourse` from the course definition |
| `src/app/teacher/create/page.tsx`, `/teacher/waypoints`, `/teacher/welcome` | Unit pickers and filters list Physics 1 units; the first-run page offers only AP Physics 1 |
| `src/app/admin/content/sets-panel.tsx` | Shows the first course only |

## Admin: publish by set

`/admin/content` has a **Sets** tab. For each set it shows every draft's state (draft, AI-reviewed, human-approved, published, rejected, missing) from `GET /api/admin/content/sets?curriculumId=` (admin only, read-only). **Publish set** is enabled when every draft is approved and calls `POST /api/admin/content/publish { curriculumId, setKey }`. The title, description, draft list and question order then come from the definition. Every existing check still applies (approved, one unit, re-validation, and AI-reviewed drafts are refused outside the emulator; the tab shows that error). Publishing a set that already exists as a global waypoint returns 409; an unknown set returns 400. `{ draftIds, title }` still works for ad-hoc sets.

## Why a teacher may see "Not published yet" on every set

The roadmap lists every set in the definition, but a set can only be assigned once it exists as a published global waypoint **in the Firebase project the app is running against**. The 160 AP Physics 1 problems were published only in the local Firenook emulator, so `npm run dev` against a real project shows every set as "Not published yet" (this used to read "Coming soon"). Three states (`setAvailability` in `src/lib/curriculum-roadmap.ts`):

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
   ```
2. At `/admin/content` → **Approved**, open each problem, solve it, check the key and the misconception tags, and approve it yourself. Imported drafts are `reviewKind: "ai"` and publish refuses those outside the emulator. The review logs in `content/ap-physics-1/*-review.md` list what the AI review changed.
3. On the **Sets** tab, press **Publish set** for each set. `/teacher/courses` then shows it as ready.

## Teachers: `/teacher/courses`

"Courses" is the first item under **Teach** in the sidebar (Teach: Courses, My Assignments, Create Assignment, Waypoints; then Results and School). The page is built around one class, chosen with the class picker in the header; it is the same selected class as every other teacher page (see [teacher-editing.md](teacher-editing.md)). The course (`?course=`), view (`?view=calendar`, `?view=list`), unit filter (`?unit=`) and List tab (`?tab=schedule`) are kept in the address bar.

Everything is changed where it is shown; each change saves at once and its message has **Undo**.

The page has three views of the same class and course, switched with **Board | Calendar | List** under the course chips:

- **Board** (the default): every set as a card in one of four columns, by where it stands. See [Status board](#status-board) below.
- **Calendar** (`?view=calendar`): a month at a time, every set on the day it is due. See [Calendar](#calendar) below.
- **List** (`?view=list`): the roadmap, unit by unit, with the Schedule tab. An old link to `?tab=schedule` opens the List on that tab. A teacher with no class, or a course whose sets are not written yet, sees only the List (there is nothing to put on a board or a calendar).

**Header** (every view): the class picker; **Following ▾** for a class that follows the course (its menu says what following does and has **Stop following**), or a **Follow / Switch to** button for one that does not, with a line under the header saying what following changes; **Schedule & days off**, which opens the Schedule tab's content in a side sheet; **Reorder or skip** (a class that follows the course), which swaps the view for the plan editor until it is saved or discarded; and **Assign next N**, which opens the assign dialog for the N sets still to assign in the first unit that has any.

- **No class card.** Following lives in the header (above). On the List a summary strip sits under the course chips: sets assigned, students, average score and the date the course finishes at the current pace; on the Board and the Calendar those numbers are in the strip at the top. The List's own "Assign next: Unit n" button is gone; **Assign next N** in the header does that in every view.
- **Roadmap tab (List).** Units in the class's order, as collapsible sections; the next unit is open. Each set row shows its key, title (the class copy's own name if the teacher renamed it), description, problem count and time estimate, and its status. On the row:
  - an assigned set has a **due-date chip** (click it to pick another day, or clear it), "9 of 13 submitted · average 71%", **Results**, and a ⋯ menu (Edit problems, Duplicate, Archive, and Skip / Stop skipping for a class that follows the course);
  - a published set that is not assigned has **Assign** (just that set) and, for a following class, **Skip** / **Unskip**;
  - a set whose class copy was archived shows "Archived · assign to restore it", and **Restore** brings the same copy back (with its students' work) instead of copying it again.
  **Preview** shows the problems as students see them, the topics and the misconceptions the wrong answers catch; for the class's own copy it has **Edit problems** and **Results**, and **Show answers** loads the key through `GET /api/assignments?id=`; for an unassigned set it has **Assign this set**. Under the sets, **What students got wrong** lists up to three misconceptions for the unit with a re-teach suggestion.
- **Reorder or skip** (in the header, for a class that follows the course) turns the page into an editor: drag a unit or a set by its handle (or focus the handle and use the arrow keys), or use the arrows; tick Skip. Changes are a draft with a save bar (Save order / Discard) and a warning before leaving. After saving, if assigned sets are now out of date order, a message offers **Re-date**: the same due dates handed out again in the new order (`redateToOrder` in `src/lib/course-pacing.ts`), with Undo. This replaces the old Customize tab.
- **Assign dialog.** Lists exactly which sets will be copied and each due date before anything is created. First due date and spacing (every 1, 2 or 3 school days, or weekly) can be changed there; for a single set it asks only for the due date. Sets already in the class are skipped, so nothing is duplicated. A class that does not follow the course can still have units assigned.
- **Schedule and days off** (a tab on the List, a side sheet from the header). The pacing guide, bulk due-date moves and the class's days off (below).

Files: `src/app/teacher/courses/` (`page-client.tsx`, `use-course-data.ts`, `use-set-actions.ts`, `roadmap-tab.tsx`, `plan-editor.tsx`, `schedule-tab.tsx`, `assign-dialog.tsx`, `set-preview-dialog.tsx`) `src/app/teacher/courses/calendar/course-calendar.tsx`, and `src/app/teacher/courses/board/` (`course-board.tsx`, `board-column.tsx`, `board-card.tsx`, `board-stats.tsx`, `unit-filter.tsx`, `board-dnd.tsx`). `use-set-actions.ts` holds what can be done to one set (assign, change the due date, skip, archive, move in the plan); List rows and Board cards call the same functions, so a change behaves the same in both.

### Status board

Every set of the course is in exactly one column. `boardColumns` in `src/lib/course-board.ts` decides which; it is pure and tested in `__tests__/course-board.test.ts`.

| Column | A set is here when | The card shows |
|---|---|---|
| **Up next** | published, not assigned, not skipped; in the class's plan order | unit, title, problem count, the due date it would get at the current pace, **Assign**, ⋯ (Preview, Move up, Move down, Skip) |
| under Up next, dimmed | skipped, or not published here yet | "Skipped" with **Unskip**, or "Not published yet" / "Planned". Cannot be assigned or dragged. |
| **Assigned** | assigned, nothing waiting for the teacher, and not Done | hand-in bar and "8 of 13 handed in", an "n overdue" pill, the due-date chip, ⋯ (Open, Edit problems, Results, Preview, Duplicate, Archive) |
| **Needs you** | assigned and something waits for the teacher: written answers to grade (`pending`) or answers to check after an answer-key change (`needsReview`) | amber pills ("Check 5 written answers", "Key changed · 2 to check"), **Grade** or **Review** to the assignment's Results |
| **Done** | assigned, nothing waiting, and either everyone on the roster handed it in, or the due date has passed and nobody is missing | average, **Results** |

The checks run in that order: Needs you, then Done, then Assigned. Details worth knowing:

- A set that is past due while students still owe it **stays in Assigned** with its overdue pill; it moves to Done when the last student hands it in. (A class with no students has nobody missing, so its sets are Done once past due.)
- An assigned set stays on the board even if the plan skips it. An archived copy counts as not assigned, so its set is back in Up next marked "Archived copy"; **Restore** (or a drop on Assigned) brings the same copy back.
- Assigned is soonest due first (sets with no due date last); Done is latest due first. Up next shows the first six with "+ n more planned"; Done shows the latest four until **Show done (n)** is pressed.
- While progress is loading, assigned sets wait in Assigned.

**Above the columns:** one strip with the course progress bar ("12 of 31 sets assigned · on pace to finish Mar 19"; skipped sets are not counted), the class **Average** (mean of the sets' averages), **Needs you** (answers waiting, summed over sets) and **Overdue** (missing hand-ins past their due date, summed over sets). The **unit filter** sits beside the Board | Calendar | List switch, for the Board and the Calendar alike: `Unit  All 1 2 3 …`, one small numbered chip per unit in the class's order. Only the chosen unit spells out its name (under the row on a phone); the others show it on hover. It narrows every column to one unit (`?unit=4`); pressing the chosen unit again, or All, shows everything.

**Drag and drop** (`@dnd-kit`, `board-dnd.tsx`). `boardDrop` in `course-board.ts` decides what a drop means:

| Drag | What happens | Same thing without dragging |
|---|---|---|
| Up next → Assigned | That one set is assigned with the next free date in the pacing guide; while a card is carried the top of Assigned says "Drop to assign · due Mon, Nov 24". Undo archives the copy again. An archived copy is restored instead of copied. | **Assign** on the card (opens the assign dialog for that set, where the date can be changed) |
| Assigned → Up next | The class's copy is archived (students stop seeing it; their work is kept). If anyone has handed it in, a dialog asks first. Undo restores it. | ⋯ → **Archive** |
| Up next card onto another | The set takes the other's place in the class's plan (`placeSet`), saved at once with Undo. Sets stay inside their unit: a drop on another unit's card is refused with a message. Needs a class that follows the course. | ⋯ → **Move up** / **Move down** (swaps with the nearest Up next set of the same unit) |

Needs you and Done take no drops, and their cards cannot be dragged. Reordering whole units stays in **Reorder or skip**.

- **Mouse:** drag a card from anywhere on it (a small move starts the drag, so its buttons still click).
- **Keyboard:** each movable card has a move button (the grip). Space or Enter picks the card up; Right carries an Up next card to Assigned, Left carries an Assigned card to Up next, the opposite arrow brings it back, Up and Down step through Up next; Space or Enter drops, Escape cancels. A screen reader hears what is picked up, what it is over and what dropping there would do.
- **Touch:** press and hold a card to pick it up; a swipe still scrolls.

**Phone width.** The columns become one row that scrolls sideways, one column per swipe, with a switcher above it (Up next 15 · Assigned 3 · Needs you 2 · Done 12) that jumps to a column.

The board adds no Firestore rules and makes no AI calls: assigning uses `POST /api/assignments/clone` (every global set is free to copy), archiving and due dates use `PATCH /api/assignments/{id}`, and reordering uses `PATCH /api/courses/{id}/plan`.

### Calendar

One month at a time (`src/lib/course-calendar.ts`, tested in `__tests__/course-calendar.test.ts`). It opens on the current month; the arrows step a month, **Today** comes back, and **Last set** jumps to the month the course finishes in. The same strip of numbers as the Board sits above it, and the unit filter beside the view switch (`?unit=`) narrows it the same way.

- **Assigned sets** sit on their real due date, coloured by their Board column: Assigned (purple), Needs you (amber), Done (green).
- **Sets still to come** (the Board's Up next) are dashed, on the date the pacing guide gives them at the current pace. They move when the pace, the plan or the days off change. Skipped and unpublished sets are not shown.
- **Days off** are shaded and named (weekends, the default holidays, the class's own days off); today is marked.
- An assigned set with **no due date** has no day to sit on, so it is listed under the calendar with a link.

Click a set for its unit, where it stands ("8 of 13 handed in · 3 overdue") and its actions: an assigned set has the **due-date chip**, **Results** (or **Review** when something waits) and **Preview**; a planned set has **Assign** (the one-set dialog) and **Preview**.

**Drag an assigned set to another day** to move its due date there; the time of day is kept and the message has Undo (the same `PATCH /api/assignments/{id}` as the due-date chip). Only school days take a drop: a weekend or a day off is refused with a message, and the due-date chip in the popover can still set any date. Planned sets cannot be dragged, because their dates come from the pacing guide (change the pace in **Schedule & days off**, or the order in **Reorder or skip**). Dragging works with a mouse, and with press-and-hold on touch; with a keyboard, open the set and use the due-date chip.

**Phone width.** The grid becomes a list of the month's days that have sets, each with its sets; everything else works the same (no dragging on the list, use the due-date chip).

**Follow / stop following.** `POST /api/courses` accepts an optional `curriculumId`. `PATCH /api/courses/{id}/curriculum { curriculumId: string | null }` is owner-only (teacher who owns the class; unknown course 400). Following changes nothing in existing assignments. `firestore.rules` stops clients from writing `curriculumId`, `curriculumPlan` or `daysOff` on a class, so the routes are the only way.

The first-run page (`/teacher/welcome`) lists sets from the definition, ordered by roadmap, and creates the class following AP Physics 1 unless the box is unticked.

### Unit guides: `/teacher/courses/{curriculumId}/{unit}`

One page per unit (linked from each unit on the roadmap): sets, problems, estimated student time and topics; each set with its topics, question types, difficulty mix and the misconceptions it catches; the AP topics with their summaries; and every misconception the unit targets with the sets that target it. With a class chosen it also shows that class's status, results and re-teach suggestions for the unit, and **Assign N sets** opens the assign dialog for the unit on `/teacher/courses` (`?assign={unit}`).

The per-set facts come from `src/data/curricula/profiles/<id>.json` (`setProfile` in `src/data/curricula/profiles.ts`), generated from the reviewed drafts in `content/<id>/`:
```bash
node tools/curriculum-profile.cjs            # check; exits 1 when the committed file is stale
node tools/curriculum-profile.cjs --write    # after changing a set's draftIds or re-exporting drafts
```
`npx jest course-progress` fails when the committed profile no longer matches the content. Minutes are an estimate from question type and difficulty (see `MINUTES` in the tool).

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

`GET /api/teacher/courses/progress?courseId=` (owner only) returns the roster size, per-set progress (`submitted`, `graded`, `pending`, `averageScore`, and for the Status board `overdue`: students on the roster with nothing handed in after the due date, and `needsReview`: students whose handed-in work has answers listed in `reviewQuestions` after an answer-key change) and, per unit, up to three misconceptions from `misconception_events` with the share of students who have graded work in that unit (`src/lib/course-progress.ts`, built on `buildInsightsReport`).

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
