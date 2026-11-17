# Scorpio Courses (curriculum roadmaps)

Sprint 3. **Waypoints** is still the library of single sets (global, department, mine). A **course** is an ordered roadmap on top of it: units in order, each with its sets in order. A teacher can optionally attach a course to a class; classes that follow none work exactly as before.

**Naming.** In code, "course" already means a *class* (`courses` collection, `courseId`, `ownsCourse`) and `apCourse` is the AP subject. The new concept is `curriculum` / `curriculumId` in code and "Courses" in the UI.

## Where things live

| What | Where |
|---|---|
| Course definition | `src/data/curricula/ap-physics-1.json`, helpers in `src/data/curricula/index.ts` |
| Roadmap state (assigned, next unit, draft states) | `src/lib/curriculum-roadmap.ts` |
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
Units and topics come from `src/data/ap/physics1.json`; they are not repeated. The published title is `displayTitle(set)`: "AP Physics 1 · Unit 4A · Momentum of objects and systems".

A published set is a global `assignments` doc with the usual AP fields plus `curriculumId`, `curriculumSetKey` and `curriculumSequence` (0-based position over the whole course). Clones copy all three, so a class's own assignment keeps its set key. A class doc may have `curriculumId` (absent or null = follows nothing).

## Adding sets

Append to `sets` in the same shape (keys are `<unit><letter>`, e.g. `1A`, `7C`; they never change once published). `draftIds` are approved `content_drafts` ids, in question order. Order in the file is cosmetic: unit then letter decides the roadmap. `npx jest curricula` checks that keys are unique, each set's unit matches its key and its topics, topics exist, and no draft id appears in two sets. To get drafts into a project, see [content-pipeline.md](content-pipeline.md) (`tools/content-drafts.cjs import`).

## Admin: publish by set

`/admin/content` has a **Sets** tab. For each set it shows every draft's state (draft, AI-reviewed, human-approved, published, rejected, missing) from `GET /api/admin/content/sets?curriculumId=` (admin only, read-only). **Publish set** is enabled when every draft is approved and calls `POST /api/admin/content/publish { curriculumId, setKey }`. The title, description, draft list and question order then come from the definition. Every existing check still applies (approved, one unit, re-validation, and AI-reviewed drafts are refused outside the emulator; the tab shows that error). Publishing a set that already exists as a global waypoint returns 409; an unknown set returns 400. `{ draftIds, title }` still works for ad-hoc sets.

## Teachers: `/teacher/courses`

"Courses" in the sidebar, next to Waypoints. Pick a class; the page shows the 8 units in order, each set with topics and problem count, and "Coming soon" for sets that are not published. For the chosen class each published set shows "Assigned · due <date>" (matched on `curriculumSetKey` among that class's own assignments) or "Not assigned". **Assign unit** copies the unassigned published sets in that unit; **Assign next unit** picks the first unit that still has some. Sets already in the class are skipped, so nothing is duplicated, and the remaining sets get due dates from the chosen first date and spacing (school days only). A class that does not follow the course can still have units assigned.

**Follow / stop following.** `POST /api/courses` accepts an optional `curriculumId`. `PATCH /api/courses/{id}/curriculum { curriculumId: string | null }` is owner-only (teacher who owns the class; unknown course 400). Following changes nothing in existing assignments. `firestore.rules` stops clients from writing `curriculumId` on a class (the vault page's client update must leave it unchanged), so the route is the only way.

The first-run page (`/teacher/welcome`) lists sets from the definition, ordered by roadmap, and creates the class following AP Physics 1 unless the box is unticked.

## Students

`/student/assignments`: if the student's class has a `curriculumId`, assignments are grouped under unit headings (`Unit 4: Linear momentum`) in roadmap order (by `curriculumSequence`, then due date). Anything without a set key goes under "Other assignments". Status filters still apply. A class that follows no course shows the flat list with the sort menu as before.

## Backfill: `tools/curriculum-tag.cjs`

Tags global waypoints published before this feature: an assignment matches a set when its `contentDraftIds` are exactly the set's `draftIds`, and it gets `curriculumId`, `curriculumSetKey`, `curriculumSequence` and the normalised title. Dry run unless `--apply`; safe to re-run; two assignments for one set are reported and skipped.
```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node tools/curriculum-tag.cjs --project demo-scorpio          # dry run
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node tools/curriculum-tag.cjs --project demo-scorpio --apply
node tools/curriculum-tag.cjs --project <project-id>                                                # real project: ADC, dry run
```
Tests: `__tests__/curricula.test.ts`, `__tests__/curriculum-routes.test.ts`, `__tests__/curriculum-tag.test.ts`, and the class rules in `tests/security/rules-rt14.test.ts`.
