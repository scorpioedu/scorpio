# Scorpio research summary (16 Nov 2026)

A short report of what the research found and what we are doing about it. Full timeline and email drafts: [launch-plan.md](launch-plan.md).

## What the research found
- **Homework no longer shows what students know.** Chatbots now solve intro physics questions at or above student level, 54% of teens use chatbots for schoolwork, and 40% of teachers assign less homework than two years ago.
- **Open AI help can hurt learning; guarded AI help doesn't.** In a study of about 1,000 high school students, open chatbot use lowered later exam scores by 17%. A tutor that gave hints instead of answers avoided that harm, though it did not raise scores. Our honest claim is "homework that still means something", not "raises scores".
- **Knowing the common wrong answers is what makes a teacher effective.** Students learned more when their teacher could predict the usual misconception. That is the evidence behind the class misconception report.
- **Homework and grading are the teacher's own call.** About three-quarters of physics teachers control their own homework, so they can adopt a homework tool without asking anyone. Content and materials are mostly decided above them.
- **Physics teachers are stretched and isolated.** There are about 27,600 in the US. Most are the only physics teacher in their school, and they work about 50 hours a week, 5–10 of them on grading. They hear about tools mostly from other teachers.
- **Timing matters.** Teachers try new tools in August and at the start of a semester. April and May are taken up by AP exams.
- **LMS integration can wait.** Canvas always needs a school admin to install a tool, and Google Classroom needs 4–8 weeks of verification by Google. Class codes plus grade export are enough for a pilot.

## Key objectives
1. 10 AP Physics 1 classrooms using Scorpio by 22 Jan 2027.
2. At least 5 of those teachers assign a second unit without being asked by 13 Mar.
3. Decide on 10 Jan which LMS to integrate with, based on what pilot teachers actually use.
4. Report results and receipts to the grant funder by 20 Mar, and use them to apply for more funding.

## What we are building (16 Nov – 6 Dec)
| Done by | What |
|---|---|
| 17 Nov | Close the security hole that lets any teacher read the shared library's answer keys |
| 22 Nov | Auto-grading that actually runs, including numeric answers with units and tolerance |
| 25 Nov | Class misconception report: which wrong ideas each class has, by assignment and AP topic |
| 29 Nov | AP Physics 1 topic tags and a pipeline where AI drafts problems and a person checks every answer |
| 6 Dec | ~60 checked problems for Units 4–6, five-minute teacher setup, in-app feedback box |
| 3 Jan | Remaining AP Physics 1 units |
| Jan (only if pilots want it) | Google Classroom sync (~1 week) or Canvas integration (~1–2 weeks) |

## Outreach
- **Method:** personal emails written by hand, sent from a free Gmail mail-merge tool. No AI outreach agents.
- **Why not Explee or similar:** they are built to find company buyers, not teachers. Explee sends from shared inboxes on autopilot, and users report emails sent without approval and billing problems. The others cost $30 to several thousand dollars a month.
- **List:** 150 AP Physics teachers by 30 Nov, built by hand from the College Board's list of AP schools and each school's staff page.
- **Pitch:** a student offering a free AP Physics homework tool for one unit this semester. A pilot offer, not a survey.
- **Volume:**
  - 10 emails a day from 1 Dec, rising to 25 a day from 7 Dec
  - nothing over winter break
  - resume 5 Jan
  - about 450 emails in total, with one follow-up each
- **Rule:** if fewer than 3 people reply out of the first 75, rewrite the email before sending more.
- **Also:** ask every teacher who replies for one colleague. Message moderators before posting in teacher communities.

## Spending ($200)
| Item | Cost | Purpose |
|---|---|---|
| Email inbox on the project domain, 3 months | $25 | So emails reach school inboxes instead of spam |
| Thank-yous for 10 pilot teachers ($10 classroom donation or gift card each) | $100 | Sent after their first unit; a classroom donation works even where teachers can't accept payment |
| One physics-teacher community membership or regional meeting | $25 | Meet teachers where they already talk to each other |
| Reserve for pilot AI usage | $50 | The least predictable cost |
| AI outreach tools | $0 | Not a fit at this scale |
| **Total** | **$200** | Every line has a receipt |

**If funding grows:** about $500 covers thank-yous for more pilots and a full unit of AI usage. About $1,500 adds the national physics teachers' summer conference (Washington DC, 31 Jul – 4 Aug 2027). Not worth buying at any of these levels: teacher email lists (from about $550) and paid creator sponsorships ($200–1,000 each).

## Risks and unknowns
- **Unproven:** no study yet shows a hint-based AI tutor raising high school physics scores.
- **Approval:** some districts may require approval before students can use a new tool. If too many pilots hit this, switch to a teacher-only version with no student accounts.
- **Wrong answer keys:** one would lose a teacher's trust, so every problem is checked by a person.
- **Unknown reply rate:** no benchmark exists for teachers answering a student; the volume above is an estimate.
- **Unverified prices:** the domain, the community membership and pilot AI costs.
