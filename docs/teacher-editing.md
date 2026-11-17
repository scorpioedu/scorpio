# Changing things as a teacher

Goal: **it is easy for a teacher to make changes.** Every screen follows the same few patterns, so a teacher who has changed a due date on one page knows how to on every other page. See [teacher-ui-style.md](teacher-ui-style.md) for the look, and [courses.md](courses.md) for the Courses screens.

## The patterns

| | Pattern | Where it lives |
|---|---|---|
| P1 | **One home per assignment.** `/teacher/assignment-view?id=` has tabs **Results · Problems · Settings** (`&tab=problems`, `&tab=settings`). Every list, roadmap row and preview links here. | `src/app/teacher/assignment-view/page.tsx` |
| P2 | **Quick edits on rows.** Click a title's pencil to rename it, click a due date to change it, use ⋯ for Open, Edit problems, Duplicate, Archive. These save at once. | `InlineTitle`, `DueDateChip`, `AssignmentActionsMenu` in `src/components/teacher/` |
| P3 | **Drafts for multi-field edits.** Problems, settings, the course order, days off and grading are a draft with a save bar (*Unsaved changes · Discard · Save*) and a warning before leaving the page or switching what is shown. | `SaveBar`, `useUnsavedGuard` (`src/hooks/use-unsaved-guard.tsx`) |
| P4 | **Remove = archive.** Archiving hides an assignment or class from students and from the default lists; it can be restored. **Delete permanently** exists only on something already archived, behind a confirmation. | PATCH routes below; `AssignmentActionsMenu`, `ClassSettingsDialog` |
| P5 | **One selected class.** Every teacher page uses the same class, remembered in the browser and kept in the address bar as `?class=`. Pages that can show all classes offer "All classes". | `SelectedClassProvider` / `useSelectedClass` (`src/contexts/selected-class-context.tsx`), `ClassPicker` |
| P6 | **Confirm only when it is permanent or touches graded work.** Everything else just happens, and its message has **Undo** (`undoToast` in `src/lib/undo-toast.ts`). | |

## What a teacher can change, and where

| Change | Where | How |
|---|---|---|
| A problem's wording, answer key, choices or points; add, remove or reorder problems | Assignment → **Problems** (also ⋯ → Edit problems, or Preview → Edit problems on Courses) | Draft + save bar. If students have handed it in, saving asks first and re-grades (below). |
| Title | Assignment header, My Assignments row | Pencil, Enter to save, Escape to cancel. Undo. |
| Student instructions, time limit, tools, lockdown, grading, AP unit | Assignment → **Settings** | Draft + save bar. Sharing stays on the My Assignments row. |
| One due date | Assignment header, My Assignments row, Courses roadmap row, Courses board card (Assigned), Courses calendar (click a set, or drag it to another school day) | Due-date chip: pick a day (time of day is kept; new dates are 11:59 PM) or Clear. Undo. |
| Several due dates | My Assignments: tick rows → *Move due dates* by days; Courses → Schedule: *Move due dates* by school days, re-space, or off days off | Listed before saving (Schedule), Undo. |
| Assign / unassign | Courses: Assign next N, a unit, or one set; ⋯ → Archive to take it back | Archived course sets show "Archived · assign to restore it"; Restore brings the same copy back with its work. |
| Assign one set by dragging | Courses → **Board**: drag an Up next card to Assigned (or press Assign on it) | Assigned at once on the next free date in the pacing guide, shown on the drop zone. Undo archives it again. |
| Take a set back by dragging | Courses → **Board**: drag an Assigned card to Up next (or ⋯ → Archive) | Archived at once with Undo; asks first if students have handed it in. |
| Order of sets still to come | Courses → **Board**: drag an Up next card onto another of the same unit, or ⋯ → Move up / Move down | Saved to the class's plan at once, with Undo. Sets stay inside their unit. |
| Order of units and sets, skipped sets | Courses → **Reorder or skip** (header) | Drag, keyboard or arrows; save bar; offer to re-date after saving. Skip / Unskip also on each List row and Board card. |
| Follow / stop following a course | Courses header: **Following ▾** → Stop following, or the Follow button | At once, with Undo. |
| Class name, period, description; new join code; archive; delete | Dashboard → class → **Settings** | One dialog. A new code frees the old one; delete frees the code and keeps assignments and student work. |
| Days off | Courses → Schedule & days off (header sheet, or the List's tab) | Draft + Save; then an offer to move due dates that land on a day off. |
| A student's score or feedback | Grade page | Save bar and leave warning. Scores set by hand are recorded as `teacherGraded`. *Re-grade with Raise* asks before replacing them. |

## Editing after students handed work in

`PATCH /api/assignments/{id}` (owner only) takes any of `title`, `description`, `topic`, `dueDate` (ISO or null), `timeLimit`, `gradingType`, `requireWorkSubmission`, `enableTabDetection`, `lockdownMode`, `allowAIHelp`, `allowCalculator`, `rubric`, `apUnit`, `apTopics`, `questions` (the whole list) and `archived`. Answer keys are split into `assignment_keys` exactly as on create; Firestore rules still let the browser change only `visibility` on an assignment.

When `questions` changes, every handed-in submission is checked (`src/lib/regrade.ts`):

- A question "changed" when its type, points, answer key, choices, tolerance, significant figures or distractors changed. Rewording does not re-grade anything.
- Answers to changed questions are graded again **without the AI** (multiple choice, true/false, numeric and exact short answers). Removed questions leave the totals; totals always follow the edited questions.
- Answers the teacher graded by hand (`teacherGraded` on the submission) keep their score.
- Answers that would need the AI (written answers) keep their score and are listed in `reviewQuestions`; the Results tab shows "Check N answers" and saving the grade page clears it.
- The response is `{ submissions, regraded, needsReview, changed }`; the page shows it in the message after saving.

Question ids are kept when editing, so grades stay attached to their questions.

## Archive

- Assignments: `PATCH /api/assignments/{id} { archived: true | false }` sets or clears `archivedAt`. Student pages (`/student`, `/student/assignments`) and the class progress route skip archived assignments; the Courses roadmap counts them as not assigned and restores them on assign. My Assignments has an **Archived** view with Restore and Delete permanently.
- Classes: `PATCH /api/courses/{id} { archived }`. Archived classes leave the class pickers and the dashboard list ("Archived classes (n)" shows them, with Restore in Settings). Students and assignments are untouched.

## Class routes

| Route | Does |
|---|---|
| `PATCH /api/courses/{id}` `{ name?, period?, description?, archived? }` | Owner edits the class. |
| `POST /api/courses/{id}/code` | New join code, reserved in `course_codes`, the old reservation freed, in one transaction. Students already in the class stay. |
| `DELETE /api/courses/{id}` | Deletes the class and frees its code. |

`firestore.rules`: the browser cannot write a class's `code` or `archivedAt` (nor `curriculumId`, `curriculumPlan`, `daysOff`), so these routes keep `course_codes` in step.

## Tests

`__tests__/assignment-update.test.ts` (edit route, re-grading, AP tags, archive), `__tests__/course-settings-routes.test.ts` (class routes), `__tests__/assignment-editor.test.ts` (editor helpers), `__tests__/teacher-edit.test.ts` (due dates, class choice), `__tests__/course-editing.test.ts` (drag placement, re-dating, archived sets on the roadmap), `__tests__/course-board.test.ts` (the Status board's columns, stats, drops and Up next reordering), `__tests__/course-calendar.test.ts` (the Calendar's days, month grid and due-date moves), and the class rules in `tests/security/rules-rt14.test.ts`.
