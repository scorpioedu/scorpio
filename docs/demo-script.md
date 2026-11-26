# Demo script (production, scorpioedu.org)

Rehearsed end to end on production on 2026-11-17 with a throwaway class and the real student
account: create class, assign, join, submit, auto-grade, results. Every step below worked.

## Before you start (10 minutes)

1. Window A: sign in as the teacher (rushil.mahadevu@gmail.com). Start on **Dashboard**.
2. Window B: sign in as the student (rmahadevu@sageridge.org). The two accounts cannot share
   one window. In Yab, the space "Scorpio student" is already signed in as the student.
3. **The student must leave its current class first.** A student can be in one class only; the
   join link otherwise says "You're already enrolled in My Physics Classroom." On the student
   Dashboard press **Leave class** → **Leave Class**. Do this before the audience is watching.
   (To put the student back afterwards: Leave class, then open `scorpioedu.org/join/class/CODE123`.)
4. Solve the five problems of the set you will open live (Unit 1A) and compare with the key.
   Every problem has been checked by a person, so this is only so you know the answers.
5. If you rehearse with a class, archive it afterwards: Dashboard → My classes → the class's
   settings → **Archive**.

## The demo

### 1. Create a class (about 1 minute)

- Dashboard → **Create Class** (or go straight to `/teacher/welcome`, "Get started").
- Class name: `AP Physics 1`. Period: `Period 5`.
- Course: leave **AP Physics 1** (the picker also offers AP Physics 2 and AP Physics C: Mechanics;
  open it to show all three exist).
- Press **Create class**. Expect "Your class is ready." and an 8-character class code under
  "3. Invite your students".

Say: a class follows one course; students join with the code, nothing to connect to an LMS.

### 2. Assign the first unit (about 1 minute)

- Under "2. Assign a AP Physics 1 unit", choose **Unit 1: Kinematics (4 assignments)**.
- Leave the first due date and "Every 2 school days".
- Press **Assign all 4 to my class**. Expect four lines, 1A to 1D, each with a due date, and
  "All 4 assignments assigned to …". Due dates skip weekends and the Thanksgiving break.

### 3. Invite the student (about 1 minute)

- Press **Copy message** (or **Copy code**).
- In window B, paste the link (`scorpioedu.org/join/class/<code>`). Expect "Join AP Physics 1 - Period 5".
- Press **Join class**. The student lands on its Dashboard with the "AP Physics 1 roadmap":
  "0 of 32 sets handed in", Unit 1 "In progress", and "Next: … Unit 1A · Describing motion".

### 4. The Courses roadmap (about 3 minutes)

- Window A → **Courses**. Pick the new class in the class picker if it is not selected.
- Point at the progress strip: "4 of 32 sets assigned · on pace to finish …".
- Unit 2 is open and badged **Assign next**.
- Click the set name **Systems and free-body diagrams**. The preview shows
  "Misconceptions the wrong answers catch" and "What students see". Close it.
- Press **Assign** on 2A → the dialog shows the due date → **Assign 1 set**. The row now shows
  "Due Thu, Nov 19" and **Results**, and the unit button becomes "Assign the rest (3 sets)".
- Press **Unit guide**: AP topics in order and which set practises each.
- Back on Courses, press **Calendar**: sets on their due dates, "Veterans Day" and
  "Thanksgiving break" marked "No school".
- "..." next to the course name: **Schedule & days off**, **Reorder or skip sets**. Open one, then close it.

### 5. The student does a set (about 3 minutes)

- Window B: press **Continue** (or **Unit 1A · Describing motion**).
- Answers that scored 4 of 5 in the rehearsal: Q1 `7.0 m`, Q2 **Speed**, Q3 `1.5 m/s`,
  Q4 `-2.0 m/s^2`, Q5 pick the wrong one on purpose: "The rover is slowing down because its
  acceleration is negative."
- Press **Submit Assignment**. Within a few seconds it lands on My Submissions: "Graded · 80%".

### 6. Results (about 2 minutes)

- Window A → **Courses**: the strip now reads Students 1, Average 80%; Unit 1 shows "average 80%".
- Unit 1 → **Results** on 1A: "Submissions 1 · Graded 1 · Average score 80%" and the student's row.
- **Misconceptions**: "Thinks negative acceleration always means slowing down · 1 student · 100%",
  also listed by AP unit and by assignment.
- **Gradebook**: the student's row with its submission count and average; "Export Grades (.CSV)".

## Avoid during the demo

- **My Assignments on "All classes".** It lists 10 rows: your class's 5 older assignments plus
  the 5 from the archived rehearsal class. Filter to the demo class, or delete the rehearsal
  class first (Dashboard → Archived classes → settings → Delete).
- **Change course** on a class with assigned sets. It works, but the assigned sets move to
  "Other assignments" and it is confusing to explain live.
- **Delete** in class settings. Use Archive.
- Dragging sets on the Calendar unless you have practised it; it changes due dates.

## State of production after the rehearsal

- Production runs commit `bc165569` (deployed 2026-11-17, night; same code as GitHub `main`): the Gradebook loads on
  "All Classes" and My Assignments no longer lists the 88 published course sets.
- All three courses are published: AP Physics 1 (32 sets), AP Physics C: Mechanics (28), AP Physics 2 (28).
- "My Physics Classroom" (AP Physics C: Mechanics, 1 student, Unit 1 skipped) is unchanged.
- The rehearsal class "AP Physics 1 - TEST run-through" is archived (Dashboard → "Archived classes (1)").
  It holds 5 assigned sets and one graded submission from the student account.
- The student account is back in "My Physics Classroom" with its earlier work (3 completed, 53% average).
