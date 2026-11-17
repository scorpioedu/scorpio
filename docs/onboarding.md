# Teacher onboarding (Sprint 3)

Goal: a new teacher goes from invite code to an assigned AP Physics 1 unit in 5 minutes or less, and we can tell which outreach email each teacher came from.

## One invite code per contacted teacher

`scripts/generate-teacher-code.mjs` still makes a single code the old way:

```bash
node scripts/generate-teacher-code.mjs "Reddit - physics_guy" [organizationId]
```

Batch mode reads a CSV with a header row and at least `email,name,school` (other columns are ignored, quoted fields are fine):

```bash
node scripts/generate-teacher-code.mjs --csv contacts.csv --campaign "Dec outreach" [--out contacts-codes.csv] [--expires-days 120] [--organization <orgId>] [--base-url https://scorpioedu.org] [--dry-run]
```

- One code per email (lowercased and trimmed). Invalid or duplicate rows are skipped with a warning.
- Each `teacherInviteCodes` doc stores `contactEmail`, `contactName`, `school`, `label` (the campaign) and the usual fields.
- **Safe to re-run.** If an email already has an unused, unexpired, unrevoked code, that code is reused and no duplicate is made.
- The output CSV (default: the input name with `-codes` added) has `email,name,school,code,signupUrl` for mail merge. The URL (`/signup?teacherInvite=CODE`) opens the Teacher tab with the code filled in.
- Default expiry is 120 days (pilots start in January). The single-code form keeps 30 days unless you pass `--expires-days`.
- `--dry-run` reads existing codes but writes nothing, including the output file.
- Credentials: with `FIRESTORE_EMULATOR_HOST` set, only a project id is used (`FIREBASE_PROJECT_ID`, default `demo-scorpio`) and `.env.local` is not read. Without it, the script reads `.env.local` and writes to that project, so check `--dry-run` first.

The parsing, record building and idempotency logic live in `tools/teacher-codes.cjs` (tests: `__tests__/teacher-codes.test.ts`).

## Attribution

`POST /api/auth/register` redeems the invite inside its existing transaction. For a teacher it now also writes `invite: { code, contactEmail, label, redeemedAt }` on `users/{uid}` and `teachers/{uid}`, and keeps `usedByEmail` on the code. Clients cannot write it: `users` updates are limited to a short list of keys, `teachers` has no client write rule, and `firestore.rules` is unchanged. To see where teachers came from, read `invite.label` and `invite.contactEmail` on those docs (or `teacherInviteCodes` where `isUsed == true`). Codes without contact data (the single-code form) record `null` for those fields.

## First-run page: `/teacher/welcome`

A teacher with a Network and no classes is sent here from the dashboard. "Skip for now" remembers the choice in the browser (`localStorage`), and the dashboard's empty state still links to it ("Guided setup").

1. **Create a class.** Name (default "AP Physics 1") and optional period, using the same `POST /api/courses` as the dashboard, with a generated code.
2. **Assign a unit.** The unit list comes from `src/data/ap/physics1.json`; units show how many global Waypoints carry that `apUnit`, and units with none are disabled with "not published yet". Pick a first due date and spacing (every school day, 2 or 3 school days; weekends are skipped). **Assign** copies every set into the class with `POST /api/assignments/clone`, which copies the answer key server-side. The route accepts an optional `dueDate` for this. Assignments are copied in the order they were published; if one copy fails, pressing Assign again continues without duplicating the ones already made.
3. **Invite students.** Shows the class code and a copyable message with the join link and the first due date.

Due dates are 23:59 local time and do not know about holidays; teachers can edit them afterwards. Tests: `__tests__/first-run.test.ts` (scheduling and message helpers), `__tests__/assignment-clone.test.ts` (due date).

## End-to-end check (16 Nov 2026, Firenook emulator)
`scripts/generate-teacher-code.mjs --csv` made a code for a test contact; its link opened signup on the Teacher tab with the code filled in. Signup → `/teacher/welcome` → class created → Unit 5 (4 sets) assigned with due dates took **73 seconds** of browser time. Firestore showed `invite { code, contactEmail, label }` on the profile, the code marked used, four copies with their keys in `assignment_keys`, and auto-grading set.
Emulator-only test account from that run: `pilot.teacher@demo.test` / `demo-pilot-pass` (in `.firenook/` kept data).
Fixed after the run: the copies were titled "… (Copy)" (students see that) and the first due date defaulted to today; it is now two school days out. Holidays are not known (a 2-day spacing can land on Thanksgiving); teachers can edit dates afterwards.
