# RT-11: rate limits per route

Source of truth for the numbers: `src/lib/rate-limit-config.ts`. Mechanism: `enforceRateLimit(req, kind, uid?)` in `src/lib/rate-limit.ts` (one Firestore transaction on `rate_limits/{kind}_{uid | ip_<ip>}`, fixed window). Authenticated routes get it through the `rateLimit` option of `withAuthorizedRequest`, charged right after the token is verified and before any other work, so unauthenticated calls cost no write.

**Keying.** Authenticated routes are keyed by uid, never by IP, so a school (one NAT address, a whole class) shares nothing. Only routes with no logged-in caller are keyed by IP, using the owner-decided trusted source: `x-vercel-forwarded-for`, then `x-real-ip`, first entry (`src/lib/client-ip.ts`). `x-forwarded-for` is never read. **Per-IP limiting only works behind Vercel.** On Firebase Hosting (the documented deployment) neither header is guaranteed, so there is no trusted IP. IP-keyed routes then never use a small shared bucket: teacher-code validate and request-access submit fall back to one generous global cap (`anon_teacherCode`, `anon_requestAccess`: 600/min, always fail open if the store errors), and github/stats skips the limiter. Landing already skips without an IP. The per-IP numbers below apply only when a trusted header is present. The owner may supply a trusted header later.

**On limiter failure.** `closed` = request is refused (429, as before for the routes that already had a limiter and for brute-force targets). `open` = request continues, so a Firestore outage adds no new 429s.

| Route | Kind | Key | Limit | On error | Rationale (evidence in code) |
|---|---|---|---|---|---|
| POST /api/chat | chat | uid | 30 / hour | closed | Unchanged (`chatbot-config.json`). |
| POST /api/ai/generate | generate | uid | 5 / min | closed | Unchanged. |
| POST /api/notebook/chat | notebook | uid | 20 / min | closed | Unchanged. |
| POST /api/chat/landing | landing | hashed trusted IP | 5 / min | closed | Unchanged (RT-03); now also sends Retry-After. |
| POST /api/student/tutor | tutor | uid | 20 / min | open | One call per sent message (also assignment-view help). Typing plus model latency gives under ~6/min per student; same ceiling as notebook. |
| POST /api/ai/parse | parse | uid | 10 / min | open | One call per import click (`teacher/create`), only after the manual parser fails. |
| POST /api/ai/synthesize-rubric | rubric | uid | 30 / min | open | One call per rubric click; a teacher may go question by question. |
| POST /api/ai/generate-title | title | uid | 30 / min | open | Once per new tutor conversation (currently a stub). |
| POST /api/chat/limits | limitsChat | uid | 20 / min | open | Teacher chat in the network page, one per sent message. |
| POST /api/grade | grade | uid | 30 / min | open | One per "grade" click; a per-submission lock already serialises repeats. |
| POST /api/teacher/network/portfolio | portfolio | uid | 10 / min | open | One per "generate portfolio" click; each is a heavy multi-document model call. |
| POST /api/research/respond | research | uid (admin) | 30 / min | open | Admin only. |
| POST /api/checkout | checkout | uid | 10 / min | open | One per billing click. |
| POST /api/support/report | support | uid | 5 / min | open | Human-filed report; sends mail. |
| POST /api/auth/session | session | uid (after verifying the ID token) | 60 / min | open | `auth-context` posts once per users/{uid} snapshot (every page load / profile change). IP is deliberately not used: a class logging in at once shares an IP. |
| POST /api/auth/register | register | uid | 20 / min | open | Once per signup. |
| POST /api/auth/teacher-code (validate/markUsed) | teacherCode | trusted IP | 30 / min | closed | Public brute-force target. Signup calls validate once per attempt; 30/min allows a room of teachers behind one NAT to sign up together while capping guessing at 30 per minute per address. |
| POST /api/auth/request-access (submit) | requestAccess | trusted IP | 20 / min | closed | Public form, once per visitor. |
| GET /api/github/stats | githubStats | trusted IP | 30 / min | open | Public, burns GitHub quota; one call per About page view. |
| POST /api/assignments, /api/courses, /api/submissions, /api/student/enrollment, /api/teacher/network/{invites,membership}, /api/teacher/students/cleanup, /api/admin/firestore, admin actions of teacher-code and request-access | write | uid | 120 / min | open | Not AI or auth; generic abuse ceiling well above any UI use (draft save is a button, not an autosave). |

## Written exemptions

| Route | Why exempt |
|---|---|
| POST /api/webhooks/polar | Authenticated by the Polar signature, called by the provider (not a user); a limiter could drop genuine billing events. |
| POST /api/csp-report | Has its own in-memory limiter (RT-09) that deliberately avoids a Firestore write per report. |
| DELETE /api/auth/session | Clears a cookie; no work, no data. |
| GET /api/assignments, GET and DELETE /api/account | Authenticated reads or a one-off account deletion; no AI, no spend. Listed in FOLLOWUPS in case they should move onto the wrapper. |

## Cost

Each limited call adds one Firestore transaction (1 read + 1 write) on a single small document. Blocked calls write nothing. Buckets now carry `expiresAt` so a TTL policy can delete idle documents (HUMAN-TODO).
