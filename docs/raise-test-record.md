# Raise test record (18 Nov 2026)

What was tested on Raise, the student tutor, what happened, what was fixed, and what could not be tested. Branch `claude/fixes-polish`, built on production commit `bc165569`, with the diagram feature off.

## How it was tested

- **Model behaviour:** a temporary test called production's own `explainPhysicsConcept` and `helpSolveProblem` (`src/lib/ai/tutor.ts`). That covers name scrubbing, history formatting and the prompts, with the constraint levels the route uses: `FULL` for concepts, `STRICT_CONCISE` for problems. Only the final network call was replaced by a direct call to Gemini 3.8 Flash with production's settings (`thinkingBudget: 0`, the same safety settings). The assignment used was made up for the test.
- **The page:** the emulator at `localhost:3110`, signed in as the seeded test student. Two test conversations were seeded and removed afterwards.

## Model behaviour

| Case | Result |
|---|---|
| Concept question ("what is momentum and why is it conserved") | Clear explanation with LaTeX; ends by offering a next step |
| Follow-up that depends on the previous turn ("yeah let's do it") | Picks up the collision example it had offered and continues |
| Outside physics (write an English essay) | Declines politely and offers physics help |
| Formula-heavy (derive the projectile range) | Full derivation in LaTeX |
| A student's name in the message | Not repeated back in the reply |
| Asks for the answer to an assignment question | Coaches with the knowns and the right equation; no number given |
| Asks again, more insistently | Same: no number |
| Specific question, assignment loaded | Starts from that question (free-body diagram, axes along the ramp) |
| Same question, no assignment loaded | Asks the student to share the question; doesn't make one up |
| Checks a wrong answer (8 m) | Says "Not quite" and names the likely slip (used v = at) |
| Checks a right answer (16 m) | Asks for the working rather than confirming. Socratic, but may frustrate; a product decision for the owner |

None of the 11 replies was cut off. Earlier, 56 more replies across two prompt variants were also measured with production settings: none was cut off with diagrams off, and none with diagrams on (thinking stayed at 0 to 377 tokens of the 1,024 limit). The earlier report that 5 of 8 replies were cut off came from a test that didn't send `thinkingBudget`. `tutor.ts` now logs any reply that ends with `MAX_TOKENS`.

## The page

| Case | Result |
|---|---|
| Opening the page with saved conversations | Opens the newest |
| Switching between conversations | Messages switch; formulas render |
| New Chat | Starter prompts and a toast |
| New Chat, then deleting a different conversation | **Bug, fixed:** used to jump into the newest conversation; now stays on New Chat |
| Deleting the open conversation, the last one | Empty state: "No conversation history" |
| Sending when the model fails (no key locally) | **Two bugs, fixed:** the banner said "Internal server error" (now "Sorry, I encountered an error answering your question. Please try again."), and an empty conversation stayed in the list (now removed). The text goes back into the box to resend, as before. |
| Per-student message limit reached | "You have used all 3 of your Raise messages for this period. Contact your teacher to increase your allowance." |
| Voice input, microphone refused | "Voice recognition failed. Please try typing." |
| Phone width (375 px) | Prompts stack; the input stays reachable; a long title truncates |
| Messages saved without an id | **Fixed:** they used to trip React's list-key warning |

## Not tested

- **Real replies in the page:** there's no Gemini key locally. Typing animation, long-reply scrolling and auto-titles after a real reply were therefore not exercised in the browser.
- **The teacher's "MSGS / STUDENT" count moving:** it only moves on a successful reply, so the same reason applies.
- **Light theme on the tutor page:** the app re-applies the account's saved appearance, so I didn't change the test account's setting to see it.
- **Real voice input:** the test browser blocks the microphone.
- **Anything on production:** not touched, because of the 18 Nov demo.
