# Prompt for the agent continuing Scorpio: fixes, UI polish, testing Raise

Copy everything below the line into a new session.

---

You are continuing work on Scorpio, a physics homework platform for teachers (Next.js app on Vercel, Firebase backend, an AI tutor for students called Raise). Three jobs, in this order: fix the known problems listed below, test Raise properly and fix what you find, then polish the teacher and student UI. Work on a branch, verify everything in a browser, and do not deploy unless the owner asks.

## State of things (as of 17 Nov 2026, night)

- **Production:** https://scorpioedu.org runs commit `bc165569`, which is the same code as GitHub `main` (`scorpioedu/scorpio`, public repo, commit `afcb18a3`). Firebase project `scorpio-srs`. Deploys are manual; merging to `main` deploys nothing.
- **Local:** worktree `/Users/rushilmahadevu/source/typescript/scorpio/.claude/worktrees/teacher-ui-085412`, currently on branch `claude/raise-diagrams` (production code plus an unreleased diagram feature, switched off by default). Its dev server is `http://localhost:3110` against the Firebase emulator, signed in as "Pilot Teacher" with seeded demo data (4 classes, 14 students, graded work). No Gemini key locally.
- **All four courses are published in production** (AP Physics 1: 32 sets, AP Physics 2: 28, AP Physics C: Mechanics: 28, AP Physics C: E&M: 24). Every problem has been checked by a person (26 Nov 2026).
- **The owner has a demo on 18 Nov 2026.** The demo steps are in `docs/demo-script.md` in the main checkout. Until the owner says the demo is over, change nothing in production: no deploys, no data changes.
- **Read first:** `AGENTS.md` (this Next.js version differs from older ones; read `node_modules/next/dist/docs/` before framework changes), `docs/courses.md`, `docs/demo-script.md`.

## Job 1: known problems to fix

Each was observed directly; reproduce it before fixing.

1. **Students → Learning insights fails with many students.** On the emulator, `/teacher/students?tab=insights` shows "Learning insights couldn’t load" and the console shows Firestore "maximum of 10 document access calls for one operation is exceeded". The security rules look up a document per result, and `src/components/teacher/network-students.tsx` queries with `in` over up to 30 ids. The Gradebook had the same bug; see how it was fixed in `src/app/teacher/grades/page.tsx` (one query per id) and how the Dashboard does it (`SUBMISSION_QUERY_CHUNK = 1` in `src/app/teacher/page-client.tsx`). Then search for every other client-side `where(..., "in", ...)` and check each against `firestore.rules`; fix any that can pass 10 lookups.
2. **Raise replies may be cut off.** In a test with the production prompt, 5 of 8 explanation replies ended with `MAX_TOKENS`, two after fewer than 40 visible tokens, because the model's thinking tokens count against the 1,024-token limit in `src/lib/ai/tutor.ts`. That test had the diagram feature on; measure whether it also happens with it off (which is what production runs). If it does, this is a live bug: fix it, checking the current Gemini API documentation for how thinking is bounded, and read the budget reservation in `src/lib/ai/config.ts` and `functions/src/metering` before raising any limit.
3. **A student can be in only one class, and the join page dead-ends.** Opening a join link while enrolled elsewhere shows "You’re already enrolled in My Physics Classroom. Manage your enrollment from your dashboard." with no way forward. Propose and build a clearer path (for example a "Leave and join this class" action with a confirmation that says what the student loses access to). Server logic is in `src/app/api/student/enrollment/route.ts`.
4. **Archived classes still clutter My Assignments.** After archiving a class, its assignments still appear under "All but archived" in `/teacher/assignments`. Decide the right rule (hide them, or label them) and apply it; check the Dashboard's assignment count and "Recent assignments" for the same issue.
5. **Wording:** the Get started page says "2. Assign a AP Physics 1 unit" (should be "an AP Physics 1 unit"; it is built from the course name, so handle a/an properly for all three courses).
6. **Pages changed by the lint cleanup but never opened in a browser:** the login recovery form (`src/app/login/page.tsx`), the math builder modal (`src/components/math-builder-modal.tsx`), the billing page (`src/app/teacher/network/billing/page.tsx`), the student tutor's session switching (`src/app/student/tutor/page.tsx`), and the admin panels (`src/components/admin/*`). Exercise each and confirm it behaves as before.
7. **158 lint warnings remain** (`npm run lint` exits 0). Remove the plainly dead imports and variables; leave anything where removal changes behaviour.

## Job 2: test Raise end to end

Raise is the student tutor at `/student/tutor` (`src/app/student/tutor/page.tsx`, API `src/app/api/student/tutor/route.ts`, prompts `src/lib/ai/tutor-prompts.ts`, limits in `src/lib/usage-limit.ts`). Write down what you test and what happened. Cover at least:

- Starting a new conversation, switching between saved sessions, deleting one, and what the page shows with none.
- A concept question, a follow-up that depends on the previous turn ("yeah let's do it"), a question outside physics, and a request for the answer to an assignment question (it must coach, not answer).
- Asking about a specific assignment question when the student has an assignment, and when they don't.
- Formulas render (LaTeX), long replies scroll, the typing effect finishes, and nothing is cut off mid-sentence (see problem 2).
- The message limit: what the student sees when they hit it, and that the count shown to the teacher (Network page, "MSGS / STUDENT") moves.
- Voice input if the browser allows it; the error message if it doesn't.
- Narrow screens (phone width) and both light and dark themes.
- The diagram feature is a separate track with its own prompt at `docs/diagram-agent-prompt.md`; do not switch it on, but confirm that with it off Raise behaves exactly as before.

The local copy has no Gemini key, so model replies can only be tested on production or with a script. On production, use the student account (below) and keep it to ordinary tutoring questions; each message is metered against the owner's plan, so do not run bulk tests there. For bulk prompt testing, call Gemini from a temporary script as described in `docs/diagram-agent-prompt.md` ("How to test against the model").

## Job 3: UI polish

Go through every teacher and student page at desktop and phone width, in light and dark themes, and fix what looks or reads wrong: clipped or overlapping text, controls that jump or misalign, empty states that don't say what to do next, inconsistent wording for the same thing, spinners that never end, and anything a first-time teacher would not understand. Known starting points:

- On `/teacher/courses`, the header controls (class picker, course picker, "..." menu) were seen left-aligned on production and right-aligned on the local copy at different widths. Find out which is intended and make it consistent.
- The Courses page for a class with no students, nothing assigned, or a skipped unit ("Unit 1 · 0 of 0 sets assigned · 4 skipped").
- Empty states on Gradebook, Misconceptions and Students before any work is submitted.
- The student dashboard roadmap and the assignment page (`/student/assignment-view`) on a phone.

Keep changes small and in the existing style; reuse the components already in `src/components/ui`. Show before and after screenshots for anything visual.

## Accounts and tools

- **Local teacher:** the built-in browser pane is already signed in at `http://localhost:3110` as Pilot Teacher. Seeded emulator accounts and their test passwords are documented at the top of `tools/seed-emulator-demo.cjs`; local test sign-ins are fine.
- **Production:** the owner's Yab browser is signed in as the teacher in its main space, and as the student test account in a space called "Scorpio student". Never type a real account's password; if a sign-in is needed, ask the owner to do it. Some pages (Dashboard, results) are sometimes refused by the Yab tools as "protected"; use another page or the text tools.
- **Production writes:** only what a test needs, with a class or data clearly named as a test, cleaned up afterwards (archive, don't delete). The student test account belongs to "My Physics Classroom"; if you move it for a test, put it back (`/join/class/CODE123`). An archived class "AP Physics 1 - TEST run-through" already exists from an earlier rehearsal.

## Rules

- **Never push `claude/raise-diagrams`, `claude/courses-redesign-335a`, `sprint-3`, or any branch descended from them.** Their history contains answer keys and the repo is public. To publish, create a single commit on top of `origin/main` with `git commit-tree "HEAD^{tree}" -p origin/main`, confirm `git ls-tree -r` shows no `content/` files, push that as a new branch, and open a pull request. Wait for CI (including `build` and `eslint`) before merging, and merge only if the owner asked.
- **Do not deploy** (`vercel deploy`, `firebase deploy`) unless the owner asks. If asked: export the commit with `git archive` into a clean folder, copy `.vercel/` from the main checkout, and run `vercel deploy --prod --yes` there. Rules and functions deploy separately and have not changed.
- If your fixes should not include the unreleased diagram feature, start a new branch from `bc165569` rather than from `claude/raise-diagrams`.
- Jest ignores paths containing `.claude`; in the worktree run `npx jest --testPathIgnorePatterns '/node_modules/' '/tests/security/' '/\.firebase/'`.
- The commit hook runs `eslint --fix` and `prettier --write` on staged files and reformats files that were never formatted.
- Do not run a default `next build` in the worktree while its dev server is running; use `npx tsc --noEmit`, `npm run lint`, jest, and CI's build.
- Do not put student emails, class codes or answer keys in anything that goes to the public repo.

## Done means

- Each problem in Job 1 is fixed with a test where one is practical, or reported with the reason it was left.
- A written test record for Raise: what was tested, what passed, what failed and was fixed, what could not be tested.
- UI changes shown with screenshots.
- `npm run lint`, `npx tsc --noEmit` and jest pass; work is committed on a branch; a pull request is open if the owner wants one.
- A short report for the owner that states plainly what is fixed, what is not, and what was not verified.
