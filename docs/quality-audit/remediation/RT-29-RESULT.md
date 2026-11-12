# RT-29 result: bounded reads

Method: local Firestore + Auth emulators (alt ports), `next dev` on 5400 with the app pointed at a counting reverse proxy in front of the emulator. The proxy counts `documentChange` messages delivered by the watch stream (documents read) and `runAggregationQuery` requests. Every row was measured by client-side navigation (away and back), after the first load. Seed: 1 teacher, 40 students, 60 assignments, 200 submissions (later 6000). Aggregate queries each cost 1 read (under 1000 index entries each).

## Teacher dashboard
| Scenario | Graded | To grade | Documents read | Count requests | Approx. billed reads |
|---|---|---|---|---|---|
| BEFORE, real rules, 200 subs | 0 | 0 (wrong) | 125 | 0 | 125 |
| BEFORE, rules relaxed so the old `in` query works, 200 subs | 98 | 84 | 325 | 0 | 325 |
| AFTER, real rules, 200 subs | 98 | 84 | 69 | 246 | 315 |
| BEFORE, relaxed rules, 6000 subs | 2745 | 2676 | 6125 | 0 | 6125 |
| AFTER, real rules, 6000 subs | 2745 | 2676 | 75 | 246 | 321 |

Expected values (computed from the seed with the old filter logic): 98/84 and 2745/2676. AFTER matches exactly; reads no longer grow with submissions (they grow with assignments: 4 count requests each, plus one read of each assignment).
Students total stays 40 (union of "my students" and "in my classes" via inclusion-exclusion over three counts).

## Student "My Submissions" (student with 9 submissions, 5 shown)
| | Rows shown | Docs read on page load | Docs read when one grade changes |
|---|---|---|---|
| BEFORE | identical 5 rows | 22 | 22 |
| AFTER | identical 5 rows | 22 | 9 |

No `getDoc` runs in a snapshot callback any more (assignments are fetched once per id by a separate effect and cached).

## Finding while testing
Under the current `firestore.rules`, `where("assignmentId","in",[2+ ids])` on submissions is denied for teachers (single-id equality works). This is why the dashboard showed 0/0 before this change. Probe results: list/count with `in` of 30 ids: permission-denied; with `==` or one-element `in`: allowed.
