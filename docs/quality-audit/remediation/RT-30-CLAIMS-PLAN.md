# RT-30 part B: custom claims migration plan (prepared, NOT applied)

Status: design only. `firestore.rules`, the auth flows and every API route are unchanged. The indexes half of RT-30 is done (see HUMAN-TODO.md for the deploy). This plan needs a human to run the backfill and deploy the rules in the order below.

## Why

`firestore.rules` derives the caller's `role` and `organizationId` by reading `users/{uid}` with `get()` (helper `me()`, L5-L6). Each `get()` is a billed document read and counts toward the 10 access-call limit per request; `teacher()` alone costs one read on nearly every rule. Moving `role` and `organizationId` into the ID token (`request.auth.token.role`, `request.auth.token.organizationId`) removes most of those reads. The same applies to `storage.rules`, whose `ownStudent()` does 2 `firestore.get()` calls.

## Reads per rule path (counted from `firestore.rules`)

Distinct documents fetched on the worst-case evaluation path (Firestore caches repeated `get()` of the same document within one evaluation, so `me()` counts once). "Claims" = `role` + `organizationId` in the token. "Claims+" = also `teacherId` and `courseId` in the token (optional phase 2; they change on enrollment, so the token must be refreshed then).

| Rule path | Before | After claims | After claims+ |
|---|---:|---:|---:|
| users read (teacher: `member`/`teaches`/`ownsCourse`; student: own teacher) | 3 | 2 | 2 |
| users create (roster placeholder), users update (unlink) | 1 | 0 | 0 |
| students read | 2 | 1 | 1 |
| teachers read | 2 | 2 | 1 |
| assignments read | 1 | 1 | 0 |
| assignments update, delete | 1 | 0 | 0 |
| assignment_keys read | 2 | 1 | 1 |
| submissions read, update, delete | 2 | 1 | 1 |
| courses read | 2 | 1 | 1 |
| courses update, delete | 2 | 1 | 1 |
| resources read | 2 | 2 | 1 |
| resources create, update, delete | 1 | 0 | 0 |
| practice_history read, portfolios read (`teaches(user(studentId).teacherId)`) | 3 | 2 | 2 |
| organizations read | 1 | 0 | 0 |
| organizations update (ownership transfer branch) | 2 | 1 | 1 |
| usage_analytics read | 1 | 0 | 0 |
| notebooks / tutor_sessions create (`exists(users/$(id))`) | 1 | 1 | 1 |

Remaining reads after claims are the ones about a different user or document (`user(teacherId).organizationId` in `teaches()`, `assignment(id)`, `courses/{id}`). They can only be removed by denormalising `organizationId` onto the resource documents, which is out of scope. Total across the 17 rows: 29 before, 15 after claims, 13 after claims+.

## Migration steps (in this order)

1. **Ship the indexes** (done in this ticket; deploy per HUMAN-TODO).
2. **Backfill** claims for existing users with `tools/backfill-claims.cjs` (dry run by default, explicit `--project`, `--apply` required to write). Nothing reads the claims yet, so this is safe at any time. It preserves other claims such as `admin` (RT-06).
3. **Write claims at the source** (code change, separate PR): `/api/auth/register` after creating the profile; `/api/student/enrollment` and `/api/teacher/network/membership` whenever `organizationId` changes; any path that changes `role`. Each calls `adminAuth.setCustomUserClaims(uid, {...existing, role, organizationId})` and tells the client to `getIdToken(true)`. Claims are limited to 1000 bytes; these two are far below that.
4. **Make rules dual-read**: in `firestore.rules`, change the helpers to prefer the claim and fall back to the document, e.g. `function role() { return request.auth.token.get('role', null) != null ? request.auth.token.role : me().role; }` and the same for `organizationId`. `teacher()` becomes `signedIn() && role() == 'teacher'`; `member(org)` compares against the claim-or-doc `organizationId`. Add rules tests (`tests/security/`) for tokens with and without claims (the emulator accepts custom claims via `withSecurityRulesDisabled`/`authenticatedContext(uid, {role, organizationId})`). Deploy rules after the backfill finished and after step 3 is live.
5. **Wait out token lifetime** (ID tokens live up to 1 hour; force refresh on the client after membership changes). Verify in the Firebase console rules monitor that `get()` volume dropped.
6. **Remove the fallback** once every active user has a refreshed token (check with a dry run of the backfill: it should report `changed: 0`). Then deprecate reads of `students/` and `teachers/` (rules `L37-L42`): first stop client reads (grep shows who reads them), then remove the rule blocks and the mirror writes in `/api/auth/register` and `/api/student/enrollment`; delete the collections only after a backup.
7. **Storage rules**: replace the two `firestore.get()` calls in `ownStudent()` with `request.auth.token.role == 'teacher'` plus one `firestore.get()` of the student for `teacherId`.

## Risks

- A user with a stale token and no fallback is denied; hence the dual-read step and the token refresh on membership changes.
- Role downgrades or removal from a network are only effective once the token expires (up to 1 hour) unless you call `revokeRefreshTokens`. The current `get()` model is immediately consistent; this is a real trade-off to accept.
- The `teacherId`/`courseId` claims (claims+) change with enrollment and unlinking, so they need more write-site coverage; do them only after the role/org claims are stable.

## Rollback

Rules: redeploy the previous `firestore.rules` (git revert), which reads only the documents; claims remain in tokens, unused and harmless. Backfill: claims can be cleared per user with `setCustomUserClaims(uid, {...existing without role/organizationId})`; no Firestore data is changed by the backfill. Code in step 3: revert the PR; stale claims are ignored by the old rules.

## Acceptance (from the ticket)

- Rules tests pass using claims (step 4) and without them (fallback).
- Rule `get()` count per request reduced; the table above is the "before" and the expected "after", to be re-measured on the emulator rules-debug output after step 4.
- No query logs "requires an index" (indexes half; confirm after the deploy).
