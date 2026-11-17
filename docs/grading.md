# How Scorpio grades

One grading core, `functions/src/grading-core.ts`, is used by both the Cloud Function that grades on submit and the teacher's "grade" button (`src/app/api/grade/route.ts`). Checks that need no AI run first. The AI only sees free-response answers.

| Question type | How it is graded |
|---|---|
| Multiple choice | Exact match with the chosen option, ignoring case and spacing. Old letter keys ("B") are matched to the option. |
| True/false | Exact match; accepts true/false/t/f. |
| Numeric | Deterministic, see below. |
| Short answer | Exact match with the expected answer after removing case and punctuation (or the same unit: "newtons" = "N"). Anything else goes to the AI with the expected answer. A short answer whose key is a number ("9.8 m/s^2") is graded as numeric. |
| Free response | AI, with the expected answer and the assignment rubric sent as separate blocks. |

Feedback never reveals the answer key.

## Numeric answers
The key is a number with its unit, for example `12.5 m/s`. Students may write `45 km/h`, `1250 cm/s`, `1.25 x 10^1 m/s`, `v = 100/8 = 12.5 m/s`, or LaTeX from the math chips.

- **Tolerance:** 3% by default, so answers using g = 10 m/s² and g = 9.8 m/s² both pass. Teachers can change it per question. A rounded answer with at least 2 significant figures also counts ("12" for 12.47).
- **Units:** equivalent units are converted and get full credit. The right number with a missing unit, the wrong kind of unit (J for W), or a unit that names a different amount (12.5 km/h for 12.5 m/s) gets half credit, with a reason.
- **Common slips:** a wrong sign or an answer off by a power of ten gets 0, with a hint that names the slip.
- **Significant figures:** only checked when the question sets them. Being off by more than one figure costs 10%.
- **No number:** "idk" gets 0. A worded answer of 3 or more words ("twelve and a half metres per second") goes to the AI with the key.

## When a teacher is asked to review
A submission goes to `pending_review` instead of getting a grade when any of these happen:
- the answer looks like a prompt injection;
- the AI gives full marks to a very short answer that matches nothing in the key;
- a numeric or multiple-choice question has no answer key;
- free response needs AI but the network has no AI budget (all the other answers are still scored);
- the AI call fails or returns an invalid reply.

Grading type: **Automatic** (the default on the create page) grades on submit. **Manual** waits for the teacher. Assignments stored without a grading type count as Automatic.

## Accuracy eval
`tools/grading-eval/cases.json` holds 50 labelled AP Physics 1 answers. Each has the score band a teacher would accept. The set covers rewordings, misconceptions, a right claim with wrong reasoning, arithmetic slips, injections, Spanish, off-topic answers and numeric answers in other units. Run it against the live model with:

```bash
RUN_GRADING_EVAL=1 npx jest __tests__/grading-eval.live.test.ts
```

Results on 16 Nov 2026 (gemini-3.8-flash, 3 runs per case):

| Pipeline | In band | Injections caught | Unstable cases |
|---|---|---|---|
| Before: everything to the AI ([baseline-report.md](../tools/grading-eval/baseline-report.md)) | 90.0% | 9/9 | 0 |
| After: shared core ([last-report.md](../tools/grading-eval/last-report.md)) | 99.3% | 9/9 | 0 |

All the baseline misses were numeric. With the key 12.5 m/s, the AI gave −12.5 m/s 7/10, 125 m/s 5/10 and 12.5 J 8/10, and took marks off 12.4 m/s. Free-response grading was already accurate, so the prompt changed only to label the reference answer separately. The bands are one person's judgement; add cases from real pilot submissions as they arrive.
