
## RT-06: admin routes use the admin claim instead of ADMIN_SECRET (C-003)
- `POST /api/admin/firestore`, `POST /api/research/respond`, and the admin actions of `POST /api/auth/teacher-code` (`generate`, `list`, `revoke`) and `POST /api/auth/request-access` (`list`, `approve`, `reject`) now require `Authorization: Bearer <Firebase ID token>` whose token has custom claim `admin: true`.
  - No credentials: 401 (was 401). Signed-in without the claim: 403. The `x-admin-secret` header is ignored; `ADMIN_SECRET` is not read anywhere.
  - Public actions are unchanged: `teacher-code` `validate` and the `request-access` submit form need no credentials.
- Every admin call (allowed or denied) writes an `admin_audit` document: `uid`, `route`, `method`, `action`, `collection`, `outcome`, truncated SHA-256 `ipHash`, `timestamp`. If the audit write fails the request is rejected with 500 (fail closed).
- Admin-claim users do not need a `users/{uid}` profile document.
- `/admin` and `/research/admin` no longer ask for a secret. They show the dashboard to a signed-in user whose token carries the claim; others see a sign-in prompt or "no administrator access".
- Admins are locked out until the owner runs `tools/set-admin-claim.cjs` (see `RT-06-HUMAN.md`).
- `ADMIN_SECRET` removed from `.env.example`.
