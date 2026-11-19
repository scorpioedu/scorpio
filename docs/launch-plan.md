# Scorpio launch plan: AP Physics pilot (Nov 2026 – Aug 2027)

Written 16 Nov 2026, updated 17 Nov 2026. Replaces the interview-first plan: we go straight to pilot offers and learn from usage.

## Where we are (17 Nov 2026)

The three build sprints were finished in two days instead of three weeks, a lot was added on top, and all of it was released to production on 17 Nov. The schedule is now set by the things code cannot speed up: checking answers by hand, and teachers replying.

| | State |
|---|---|
| Sprint 1 (safe, auto-grading) | Done. Live since 16 Nov; on `main`. |
| Sprint 2 (misconception report, AP structure, content pipeline) | Done. **Live since 17 Nov.** |
| Sprint 3 (content, onboarding, feedback, landing claims) | Done. **Live since 17 Nov** (the code; the content is not published, see below). |
| Courses and everything under "Added beyond the plan" | Done. **Live since 17 Nov.** |
| Content | 440 problems in 88 sets across three courses, **AI-reviewed only**. None is published in production: every set on a teacher's Courses page says "Not published yet" until a person approves its problems and an admin publishes the set. |

**The 17 Nov release** was commit `97e07082` of the local branch `claude/courses-redesign-335a` (77 commits ahead of `main`): Cloud Functions to Firebase `scorpio-srs`, the app to Vercel (scorpioedu.org), then Firestore rules. Before it went out it passed 2,315 unit tests, 110 security-rule tests, the functions build and the production build. Afterwards the public pages answered, a signed-out visit to `/teacher/courses` went to the login page and the new API refused a request with no credentials; **the signed-in walkthrough (step 4 of "Release steps") is still to do.** The release also created the scheduled function `expireStaleReservations` (every 15 minutes; it was on `main` but had never been deployed): check its log once.

**GitHub matches production.** Pull request #3 (https://github.com/scorpioedu/scorpio/pull/3) was merged into `main` on 17 Nov, with `content/` (every answer key and worked solution) removed from its history and git-ignored from now on. Production is deployed by hand with the Vercel CLI: merging to `main` did not start a deployment. The problems themselves exist only in the local working folders and the local emulator data: keep a private backup. Older local branches (`sprint-3`, `claude/*`) still carry the answer keys in their history and must not be pushed.

**Next, in order:**
1. **Do the signed-in walkthrough** on scorpioedu.org: sign in as a teacher, open Courses, create a class, change its join code, archive and restore it, and submit one assignment as a student to see it graded.
2. **Back up `content/` somewhere private** (it is no longer in the repository).
3. **Check answers by hand.** This is now the whole critical path to a pilot: a teacher can only assign a set after a person approves its problems and an admin publishes the set. Start with AP Physics 1 Units 4–6 (60 problems), the likely January–March topics.
4. **Outreach** as planned below (contact sheet, sending inbox, first emails 1 Dec).

## The bet
An AP Physics teacher will try Scorpio with one unit if it (1) has ready-made AP Physics 1 homework for what they are teaching, (2) grades it correctly without them, and (3) shows them which misconceptions their class has. Hints-not-answers is the reason homework still means something with AI around.

## What sets the pace
Code is fast with Claude Max, so coding deadlines below are short. These are not, and they set the real schedule:

| Bottleneck | Why it can't be rushed | How we handle it |
|---|---|---|
| Checking problem answers by hand | One wrong answer key in front of a class loses the teacher | AI drafts problems; a person checks every answer before it goes live |
| Teacher reply time | Days per reply, weeks per conversation | Start emails on 1 Dec |
| School calendar | Winter break ~19 Dec – 4 Jan; semester starts mid–late Jan; AP exams in May | Pilots start in January; no new pilots after mid-March |
| New email sender reputation | A brand-new inbox sending 50/day lands in spam | Start at 10/day, rise to 25/day over two weeks |
| Google OAuth verification (only if Classroom) | 4–8 weeks at Google regardless of how fast we build | File the day we decide to build Classroom |
| District app approval | Weeks to months, outside our control | Pilot with class codes; note which schools need approval |

## Timeline

### Sprint 1 — Make it safe and make grading work (planned 16–22 Nov) · done 16 Nov, live
| Due | Task | Done when |
|---|---|---|
| Tue 17 Nov | Close the answer-key leak in `src/app/api/assignments/route.ts` (keys only to the assignment's own teacher); add server-side clone for forking bank assignments | Emulator test: another org's teacher gets no keys |
| Wed 18 Nov | Server-side plan gates (`src/lib/plan-gates.ts`) so free-plan limits are not client-only; re-validate answer keys on the server | Unit tests pass |
| Fri 20 Nov | Auto-grading actually runs: grading-type selector on create page, default auto; one shared grading core for the API route and Cloud Function | Submitting an assignment produces a grade with no teacher action |
| Sun 22 Nov | Numeric questions: value + unit + tolerance, unit conversion, deterministic check before AI | Tests: tolerance, km/h vs m/s, wrong unit, sig figs, junk input |

### Sprint 2 — Misconception report and AP structure (planned 23–29 Nov) · built 16 Nov, live 17 Nov
| Due | Task | Done when |
|---|---|---|
| Tue 24 Nov | Keep misconceptions from grading (per answer + a server-only events collection) | Graded submissions show misconceptions in Firestore |
| Wed 25 Nov | Class misconception report page (`/teacher/insights`): top misconceptions by class, assignment and AP topic | Demo class shows a ranked list with student counts |
| Fri 27 Nov | AP Physics 1 topic list (`src/data/ap/physics1.json`, own wording) and a misconception tag list; AP tags on assignments; topic filter in the shared library | Library filters by AP unit |
| Sun 29 Nov | Content pipeline: AI generates problems per AP topic in the numeric format; a review screen to approve/fix each one | 10 problems generated and reviewed end to end |

### Sprint 3 — Content and pilot readiness (planned 30 Nov – 6 Dec) · built 16–17 Nov, live 17 Nov (content not published)
| Due | Task | Done when |
|---|---|---|
| Wed 2 Dec | AP Physics 1 Units 4–6 reviewed and live (likely January–March topics; confirm against replies) | ~60 checked problems in ~12 assignments |
| Fri 4 Dec | Teacher onboarding without friction: one invite code per contacted teacher (`scripts/generate-teacher-code.mjs`) so we can track who came from which email; first-run page that creates a class and assigns a unit in under 5 minutes | A new teacher goes from code to assigned unit in ≤5 minutes |
| Sat 5 Dec | Pilot feedback: in-app "suggest a feature / report a problem" box per page, routed to support tickets | Feedback lands in one list we read daily |
| Sun 6 Dec | Fix landing-page claims that don't match the app (free waypoint limit; "Mastery Analytics" now real) | Landing page matches the product |

How each row ended up:
- **Units 4–6:** 60 problems in 12 sets are written and AI-reviewed. They are **not live**: the "checked" in "Done when" means checked by a person, and that has not happened yet.
- **Onboarding:** per-contact invite codes with attribution (`tools/teacher-codes.cjs`; the generator script in `scripts/` is kept out of the repository on purpose) and a first-run page (`/teacher/welcome`) that creates a class on a chosen course and assigns its first unit.
- **Feedback:** a "suggest a feature / report a problem" box on every page, read in one list at `/admin/feedback`.
- **Landing claims:** fixed, and the pricing rule is now simple: every global set is free; department and network sharing and higher AI limits are paid (`docs/landing-claims.md`).
- Also in this sprint: Next.js upgraded to 16.4.6 for a security advisory; local development moved to the Firenook emulator with kept data.

The remaining units (1–3, 7–8) were drafted and AI-reviewed in the same two days, so all of AP Physics 1 exists (160 problems, 32 sets). What is left for December is the human check, at about 20 problems a week if done alone; that pace does not finish 160 by 3 Jan, so check Units 4–6 first and the rest in teaching order.

### Added beyond the plan (16–17 Nov) · live 17 Nov
None of this was in the original plan. It came out of using the product as a teacher would.

| What | Why it matters for the pilot |
|---|---|
| **Scorpio Courses** (`/teacher/courses`): a course is an ordered roadmap of units and short auto-graded sets that a class can follow; a class follows one course or none | "Ready-made AP homework for what I am teaching" becomes one click per unit instead of a search through a library |
| **Three courses drafted**: AP Physics 1 (160 problems), AP Physics 2 (140), AP Physics C: Mechanics (140) | The offer is no longer limited to Physics 1 teachers. The AI review caught wrong keys in every course (31 in Physics 2 and C: Mechanics alone), which is why the human check is not optional |
| **List and Calendar views**: units as sections coloured by how far along the class is, each set with its AP topics and results; a month and week calendar with sets coloured by unit, days off named, drag a set to another day | A teacher can see the term at a glance and move work around school events |
| **Pacing and school calendar**: due dates skip weekends, US holidays and the class's own days off; a pacing guide projects the finish date and warns when it runs past AP exams; move many due dates at once | Removes the "when would I assign all this" question |
| **A class's own plan**: reorder units, skip sets, or start part-way through the course | Teachers who are mid-year in January can start at the unit they are on |
| **Unit guides**: one page per unit with its topics, what each set practises, how the class did, the misconceptions students hit and what to re-teach | This is the misconception report placed where a teacher plans the next lesson |
| **Editing after assigning**: rename, re-date, edit problems, archive and restore, with Undo on every change; changing an answer key re-grades and flags work to check | The first wrong key a teacher finds can be fixed by them in a minute |
| **Class settings**: rename, new join code, archive, delete; one class picker shared by every teacher page | Fewer support emails |
| **Students**: a course roadmap on the dashboard, grouped by unit in the class's order | Students see where they are |
| **Per-course misconception tags**, set profiles (time, difficulty, misconceptions caught) and rule-based re-teach suggestions | The report names the right misconceptions for each course |
| **Math in previews**: problem text and choices are typeset wherever a teacher previews a set | Looks right in a demo |

How it works is written up in `docs/courses.md`, `docs/teacher-editing.md`, `docs/content-pipeline.md`, `docs/onboarding.md` and `docs/feedback.md`.

### Release steps (how the 17 Nov release was done; reuse for the next one)
Production is the Vercel project `scorpio` (scorpioedu.org) and the Firebase project `scorpio-srs`. No data migration was needed. In this order:
1. `npx firebase deploy --only functions --project scorpio-srs` — first, because the new grading function works with the old app.
2. `vercel deploy --prod` — the app. Run it from a clean copy of the commit (`git archive <commit> | tar -x -C <folder>`, then copy `.vercel/` in): from a working folder the CLI also uploads local build folders such as `.next-verify/` and fails on files over 100 MB.
3. `npx firebase deploy --only firestore:rules --project scorpio-srs` — after the app, because the rules stop browsers from writing a class's course, plan, days off, join code and archive flag directly (the app uses server routes for those).
4. Signed-in walkthrough on scorpioedu.org (see "Next" at the top).

A course shows "Not published yet" on every set until its problems are approved by a person and published (`docs/courses.md`, "Getting the sets into a real project"). Optional setting: `CONTENT_ORG_ID` (whose AI budget pays for the admin content pipeline).

### Outreach (runs alongside, starts 1 Dec)
| Dates | Task | Target |
|---|---|---|
| 16–30 Nov | Build the contact sheet by hand: schools with AP Physics from the College Board AP school list, then each school's public staff page. Columns: name, school, state, email, source URL, date sent, reply, LMS | 150 teachers by 30 Nov |
| By 24 Nov | Set up the sending inbox on the project domain with SPF, DKIM and DMARC; install a free Gmail mail-merge tool | Test emails reach Gmail and Outlook inboxes, not spam |
| 1–6 Dec | Send 10/day | 50 sent |
| 7–18 Dec | Send 20–25/day; reply to every response the same day; book 15-minute demo calls | 250 sent total, 15+ replies, 8+ teachers signed up |
| 19 Dec – 4 Jan | No sending (break). Ask anyone who replied for one colleague they would forward it to | — |
| 5–22 Jan | Resume at 25/day to new contacts plus one follow-up to non-repliers | 450 sent total, 10 classrooms committed |

Rule: if fewer than 3 replies after the first 75 emails, rewrite the email before sending more.

### Pilot (12 Jan – 13 Mar)
| Dates | Task | Target |
|---|---|---|
| 12–30 Jan | Pilot teachers assign their first unit | 10 teachers, 5+ with students submitting |
| Every Friday | Short check-in email to each pilot teacher; triage feedback into the build list | Feedback answered within 2 days |
| Weekly | Build the top requests from pilot teachers (1–3 day turnarounds) | Fastest-ever response is the selling point |
| 13 Mar | Review | See scorecard below |

**Integration decision — Sun 10 Jan.** Count the LMS answers from replies.
- Mostly Google Classroom → build Classroom sync (roster import, publish assignment, grade passback): build 11–17 Jan; file Google verification 11 Jan; pilot users fit inside Google's 100-user test limit until approved.
- Mostly Canvas → build LTI 1.3 with the `ltijs` library: build 11–20 Jan; it needs one school admin per install, so only build it if a pilot teacher has an admin willing to install it.
- Neither dominates → keep class codes and CSV grade export, decide again 13 Mar.

### After the pilot
| Dates | Task |
|---|---|
| 13–20 Mar | Write up results (usage, misconception findings, teacher quotes); grant report with receipts; ask each pilot teacher for two introductions; apply for more funding |
| Mar – Apr | AP exam review feature (free-response practice graded on AP-style rubrics) — what teachers need in April |
| Apr – May | No new pilots (AP exams). Support existing teachers. Finish the human check of AP Physics 2 and C: Mechanics (both are already drafted); outline AP Physics C: Electricity and Magnetism |
| Jun – Aug | Summer launch: teachers plan next year now. Second outreach round (June), the integration not yet built, AAPT Summer Meeting (Washington DC, 31 Jul – 4 Aug) if funding allows |
| Aug | Back-to-school push: every pilot teacher returns with their new classes |

## Scorecard (13 Mar)
| Measure | Good | Weak signal |
|---|---|---|
| Teachers who assign a second unit without being asked | 5+ of 10 | Under 3 |
| Students who submit at least 3 assignments | 60%+ | Under 30% |
| Teachers who open the misconception report more than once | 6+ | Under 3 |
| Teachers who introduce a colleague | 2+ | 0 |
| Teacher asks what it will cost | Any | — |

If weak: switch to a teacher-only version (teacher uploads student work, gets grading and the misconception report; no student accounts or district approval).

## Budget ($200, receipts for every line)
| Item | Amount |
|---|---|
| Sending inbox on the project domain, 3 months | $25 |
| Classroom donations or gift cards for the first 10 pilot teachers, $10 each, sent after their first unit | $100 |
| One physics-teacher community membership or regional meeting | $25 |
| Reserve for pilot AI usage | $50 |
| AI outreach tools (Explee etc.) | $0 |

## Pilot email (first send)

**Subject:** Free AP Physics homework that AI can't just answer

Hi Ms./Mr. [Last name],

I'm a high school student, and I've built Scorpio, a physics homework tool for AP Physics 1. Students get hints when they're stuck instead of answers. You get the work graded automatically, plus a short report of which misconceptions your class has (like "velocity is in the direction of force").

I've seen your [school] AP Physics page, and I'd like to offer it free for one unit this semester. It has ready-made homework for [unit, e.g. momentum] and takes about five minutes to set up.

Would you be open to trying it, or to a 15-minute look first? Either way, I'd really value your opinion as someone who teaches this.

Thanks,
[Name]
[School], [City, State]
scorpioedu.org

[Postal address] · Reply "no thanks" and I won't email again.

## Follow-up (one only, 5–7 school days later)

**Subject:** Re: Free AP Physics homework that AI can't just answer

Hi Ms./Mr. [Last name], just bumping this once in case it got buried. If [unit] isn't a good fit, I'm glad to set up whichever unit you're on. And if now's a bad time, no worries at all.

[Name]

## Questions to ask every teacher who signs up
1. What LMS do you use (Google Classroom, Canvas, Schoology, other)?
2. Can you use a new tool with students yourself, or does someone have to approve it?
3. What unit are you on, and what comes next?
4. After the first unit: what would make you keep using it, and what almost made you stop?
