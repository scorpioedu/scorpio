# RT-01 owner runbook: rotate and revoke the leaked Firebase Admin key

Finding C-001. Human-only: nothing here has been run for you. No step below needs you to copy, paste or print the key. Refer to the key by its **key ID** (a short hex string shown in the console), never by its body.

What leaked: the Admin SDK service-account private key was added in commit `dea0862` (file `src/lib/firebase-admin.ts`) and removed in commit `65737a2`. Both commits are reachable from `origin/main`. The service account is the one named by `FIREBASE_CLIENT_EMAIL`. Deleting the line at the tip did not revoke anything.

**Rotation (steps 1-3) is what fixes the exposure.** History scrubbing (step 7) is optional hygiene and cannot un-leak a key that anyone may already have cloned.

Placeholders used below: `<PROJECT_ID>` (value of `FIREBASE_PROJECT_ID`), `<SA_EMAIL>` (value of `FIREBASE_CLIENT_EMAIL`, a service-account address ending `.iam.gserviceaccount.com`), `<OLD_KEY_ID>`, `<NEW_KEY_ID>`.

## 0. Prerequisites
- Owner or `Service Account Key Admin` (`roles/iam.serviceAccountKeyAdmin`) on the project, plus `Logs Viewer` for step 4.
- `gcloud` installed and logged in as yourself: `gcloud auth login` then `gcloud config set project <PROJECT_ID>`.
- Know every place the key is deployed (step 2 inventory). Rotating before updating them will take the app down, so do steps 1a, 2, then 1b.

## 1. Create the new key, then delete every old key

### 1a. List existing keys and create a new one
Console path: Google Cloud Console > IAM & Admin > Service Accounts > click `<SA_EMAIL>` > **Keys** tab.

CLI equivalent:
```bash
# List keys. USER_MANAGED keys are the ones that can leak. Note every KEY_ID.
gcloud iam service-accounts keys list --iam-account=<SA_EMAIL> --managed-by=user
```
Create the replacement. Write it to a file outside the repo with tight permissions; do not `cat` it, and do not put it anywhere under the repo directory:
```bash
umask 077
gcloud iam service-accounts keys create "$HOME/secure/scorpio-new-key.json" --iam-account=<SA_EMAIL>
```
Console alternative: Keys tab > Add key > Create new key > JSON (the browser downloads it; move it out of Downloads when done).

From that JSON file you need two fields for step 2: `private_key` and `client_email`. Copy them straight from the file into each secret store (password manager / hosting dashboard). Do not paste them into tickets, chat, shell history or CI logs.

A cleaner alternative that avoids a long-lived key altogether is Workload Identity / attached service account on Cloud Run or Firebase App Hosting, in which case `FIREBASE_PRIVATE_KEY` is not needed. That is a code change (the app currently reads the three env vars in `src/lib/firebase-admin.ts`) and is out of scope for RT-01.

### 1b. Delete ALL old keys (only after step 2 is deployed and verified)
Delete every key that is not `<NEW_KEY_ID>`, including any you do not recognise:
```bash
gcloud iam service-accounts keys delete <OLD_KEY_ID> --iam-account=<SA_EMAIL>
# repeat for each old key id
gcloud iam service-accounts keys list --iam-account=<SA_EMAIL> --managed-by=user
# expected: only <NEW_KEY_ID> remains
```
Console: Keys tab > the trash icon on each old row.

If you cannot tell which key matches the leaked one, delete all but the new one anyway. If you suspect an active attacker, you may delete old keys first and accept a short outage; also consider disabling the service account while you work (`gcloud iam service-accounts disable <SA_EMAIL>`, then `enable` once the new key is deployed).

Org policy check: Console > IAM & Admin > Organization Policies > `iam.disableServiceAccountKeyCreation`. If it is enforced, key creation will fail; the preferred fix is the keyless option above.

## 2. Update `FIREBASE_PRIVATE_KEY` / `FIREBASE_CLIENT_EMAIL` everywhere
Variable names the app reads: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`. Update `FIREBASE_CLIENT_EMAIL` only if the service account itself changed.

Tick each environment you actually use; add any that are missing from this list.

| Environment | Where | Done |
|---|---|---|
| Production | Hosting dashboard env vars (Vercel: Project > Settings > Environment Variables > Production; or Cloud Run: service > Edit & deploy new revision > Variables & Secrets; or Firebase App Hosting secrets) | [ ] |
| Preview / staging | Same dashboard, Preview scope | [ ] |
| Cloud Functions (`functions/`) | Only if they use explicit credentials; most use the default runtime service account. Check with `grep -rn "FIREBASE_PRIVATE_KEY" functions/src` | [ ] |
| GitHub Actions secrets | Repo > Settings > Secrets and variables > Actions. Check `.github/workflows/*.yml` for any `FIREBASE_*` use | [ ] |
| Local `.env.local` | Each developer's own machine (untracked; it was never committed) | [ ] |
| Password manager / team vault | Replace the stored copy | [ ] |

Notes:
- Multi-line private keys: store with real newlines if the dashboard supports multi-line values. If it takes a single line, use the JSON `private_key` value with literal `\n` sequences; confirm `src/lib/firebase-admin.ts` handles the format you chose by looking at how it normalises the variable. Never "fix" this by editing the value in a shared doc.
- Local `.env.local`: open it in your editor and replace the two values by hand. Do not `cat`/`echo` it. Confirm it is ignored: `git check-ignore -v .env.local` should print a `.gitignore` rule.
- Vercel CLI alternative (type the value at the interactive prompt, not on the command line, so it stays out of shell history): `vercel env rm FIREBASE_PRIVATE_KEY production` then `vercel env add FIREBASE_PRIVATE_KEY production`.
- Redeploy production and preview after changing env vars; most hosts only apply them to new deployments.
- Quick smoke test after deploy (see step 8): an authenticated API call that touches the Admin SDK must succeed.

Then return to step 1b and delete the old keys.

## 3. Securely dispose of the downloaded JSON
After step 2 is confirmed working, delete `$HOME/secure/scorpio-new-key.json` (`rm -P` on macOS, or `shred -u` on Linux), and empty the browser's downloads/trash if you used the console download. Keep the secret only in the host's secret store and your password manager.

## 4. Review Cloud Audit Logs for use of the old key since 2026-03-08
2026-03-08 is the audit's conservative start date for the exposure window. Start earlier if you know the key was created or committed before then.

Admin Activity audit logs are always on. Data Access logs (which would show Firestore reads/writes by the service account) are **off by default**; check Console > IAM & Admin > Audit Logs > Cloud Firestore API / Identity Toolkit API. If they were off, you cannot reconstruct data access and must treat the data as potentially read.

### 4a. Everything the service account did since 2026-03-08
```bash
gcloud logging read \
  'protoPayload.authenticationInfo.principalEmail="<SA_EMAIL>" AND timestamp>="2026-03-08T00:00:00Z"' \
  --project=<PROJECT_ID> \
  --freshness=400d \
  --order=asc \
  --format='table(timestamp, protoPayload.serviceName, protoPayload.methodName, protoPayload.requestMetadata.callerIp, protoPayload.requestMetadata.callerSuppliedUserAgent, protoPayload.authenticationInfo.serviceAccountKeyName.basename())' \
  > "$HOME/secure/rt01-sa-activity.txt"
```
`--freshness` must cover the window; 400d covers 2026-03-08 from today (2026-11-11). Adjust if you run this later.

### 4b. Narrow to the old key specifically
The log field `protoPayload.authenticationInfo.serviceAccountKeyName` holds the full key resource name ending in the key ID, so you can separate old-key calls from legitimate new-key calls:
```bash
gcloud logging read \
  'protoPayload.authenticationInfo.serviceAccountKeyName:"<OLD_KEY_ID>" AND timestamp>="2026-03-08T00:00:00Z"' \
  --project=<PROJECT_ID> --freshness=400d --order=asc \
  --format='table(timestamp, protoPayload.serviceName, protoPayload.methodName, protoPayload.requestMetadata.callerIp)'
```
Run this once per old key ID from step 1a. If `serviceAccountKeyName` is not populated for a service (it is not for every API), fall back to 4a and judge by caller IP / user agent.

### 4c. Key lifecycle events and IAM changes (look for keys you did not create)
```bash
gcloud logging read \
  'protoPayload.serviceName="iam.googleapis.com" AND (protoPayload.methodName:"ServiceAccountKey" OR protoPayload.methodName="SetIamPolicy") AND timestamp>="2026-03-08T00:00:00Z"' \
  --project=<PROJECT_ID> --freshness=400d --order=asc \
  --format='table(timestamp, protoPayload.methodName, protoPayload.authenticationInfo.principalEmail, protoPayload.requestMetadata.callerIp, protoPayload.resourceName)'
```

### 4d. How to read the result
Expected callers are your own hosting egress (Vercel / Cloud Run / Functions) and your own developer IPs. Flag: unknown source IPs or ASNs, `curl`/`python-requests`/`Go-http-client` user agents, bulk reads (`Firestore.RunQuery`, `BatchGet`, `ListDocuments`, Storage object listing/download) from unknown IPs, `CreateServiceAccountKey`, `SetIamPolicy`, new Auth users or custom-token minting (`identitytoolkit`), and activity in regions you do not use. Also check Console > Billing for unexplained usage spikes.

Record in the RT-01 ticket: query run, time range, number of events, whether any were unrecognised, and whether Data Access logs were enabled. Do not paste raw log lines containing user data into the ticket.

If anything is suspicious: treat as an incident. Rotate again, review Firestore/Storage for modified or exfiltrated data, revoke user sessions (`adminAuth.revokeRefreshTokens` per user, or Firebase Console > Authentication), and assess breach-notification obligations for student data.

## 5. Enable GitHub secret scanning and push protection
Console path: GitHub repo > Settings > Advanced Security (shown as "Code security and analysis" on older UIs) > enable **Secret scanning**, then **Push protection**. Secret scanning is free for public repos; on private repos it requires GitHub Secret Protection (Advanced Security).

CLI equivalent (needs `gh` authenticated with admin on the repo):
```bash
gh api -X PATCH repos/<OWNER>/<REPO> \
  -f 'security_and_analysis[secret_scanning][status]=enabled' \
  -f 'security_and_analysis[secret_scanning_push_protection][status]=enabled'
```
Then open Security > Secret scanning alerts and look for an alert on the old key (GitHub partners with Google, so a Google service-account key may already have been auto-flagged or even auto-disabled). Resolve it as "Revoked" once step 1b is done.

Also check your inbox for a Google Cloud "exposed credentials" notice; it names the key ID.

## 6. Confirm CI secret scanning is in place (RT-08)
`.github/workflows/ci.yml` already has a `gitleaks` job with `fetch-depth: 0`, so every push and PR scans full history. No change needed for RT-01. Reminder: it is only a gate once `gitleaks` is marked a required status check (see HUMAN-TODO, RT-08 step 5).

Expect the job to **fail on the old commits** (`dea0862`, `65737a2`) until history is scrubbed or the finding is allowlisted. If you choose not to scrub, add a minimal `.gitleaks.toml` that ignores only that exact commit and rule:
```toml
[allowlist]
description = "RT-01: key already rotated and revoked; commit is in history"
commits = ["dea0862"]
```
Only add it after step 1b is verified, so the allowlist never hides a live secret. (This repo ships no `.gitleaks.toml` today; if the job is already green, do not add one.) Run `gitleaks` locally with `gitleaks detect --redact --no-banner` so findings never print key bodies.

## 7. Optional: scrub history with git filter-repo
Skip this if the repository is private and the old key is confirmed deleted (step 1b). It rewrites every commit hash, breaks open PRs and forks, and does not help against copies already made.

Do this only after steps 1-2 are complete.

### 7a. Warnings and coordination
- Announce a freeze: no pushes, merges or open-PR updates during the rewrite.
- Everyone with a clone must **re-clone** afterwards (not pull/merge), or they will push the old history straight back.
- Force-pushing needs branch protection temporarily relaxed for admins. Re-enable it afterwards.
- Open PRs and forks keep the old commits; GitHub also keeps unreachable commits reachable by SHA until you contact GitHub Support to run garbage collection and clear cached views.
- Work in a fresh mirror clone, never your working checkout.

### 7b. Build the replace-text file
Create `$HOME/secure/rt01-replace.txt` **outside the repo**. `git filter-repo --replace-text` reads one rule per line. Use the `regex:` form so you never have to type the key. Template (contains no key material):
```
# Replace the entire PEM block, whatever its body, with a marker
regex:-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----==>***REMOVED-RT-01***
# Replace the escaped one-line form (literal backslash-n) if the key was ever committed that way
regex:-----BEGIN PRIVATE KEY-----(?:\\n|[A-Za-z0-9+/=])*?-----END PRIVATE KEY-----==>***REMOVED-RT-01***
```
Do not add a literal-line rule containing the key. If you want to also target the private key id, add a line `<OLD_KEY_ID>==>***REMOVED-RT-01-KEYID***` locally on your machine only.

### 7c. Run it
```bash
git clone --mirror <REPO_URL> scorpio-scrub.git
cd scorpio-scrub.git
git filter-repo --replace-text "$HOME/secure/rt01-replace.txt"
```
(`git filter-repo` is a separate install: `brew install git-filter-repo` or `pip install git-filter-repo`.)

### 7d. Verify before pushing
```bash
git log --all -p -S'BEGIN PRIVATE KEY' --oneline | grep -c 'BEGIN PRIVATE KEY'   # only the marker/docs text may remain
git rev-list --all | wc -l                                                      # sanity check commit count
gitleaks detect --source . --redact --no-banner                                 # expect no findings
```

### 7e. Push (only when everyone is ready)
filter-repo removes the `origin` remote on purpose. Re-add it and push:
```bash
git remote add origin <REPO_URL>
git push --force --mirror origin
```
Note `--mirror` also pushes/overwrites all refs, including any `refs/pull/*` GitHub rejects (those errors are expected and harmless). Then have every collaborator delete their clone and clone fresh, and ask GitHub Support to purge cached commits (`dea0862`, `65737a2` by SHA) if the repo is public.

## 8. Verification checklist
- [ ] `gcloud iam service-accounts keys list --iam-account=<SA_EMAIL> --managed-by=user` shows only `<NEW_KEY_ID>`; no old key ID listed.
- [ ] Production deployment authenticates with the new key: sign in, then call an API route that uses the Admin SDK (for example load the dashboard, or create a session via `/api/auth/session`) and see success, with no `invalid_grant` / `invalid_client` / `Error: Could not load the default credentials` in the host logs.
- [ ] Preview / staging deployment does the same.
- [ ] Local dev works after replacing `.env.local` values.
- [ ] Cloud Functions (if they use explicit credentials) still run.
- [ ] Audit-log review (step 4) is written up in the RT-01 ticket, including whether Data Access logs were on.
- [ ] GitHub Settings shows Secret scanning and Push protection as **Enabled**; any alert for the old key is closed as Revoked.
- [ ] The CI `gitleaks` job is green on `main` (after scrub or allowlist per step 6) and is a required check.
- [ ] If history was rewritten: all collaborators re-cloned, branch protection restored, `git log --all -S'BEGIN PRIVATE KEY'` shows no key body.
- [ ] The downloaded JSON key file has been securely deleted from disk and Downloads/Trash.
- [ ] Nothing in tickets, chat, docs or logs contains the key body (search your own notes for `BEGIN PRIVATE KEY`).

## References
- Finding C-001 in `docs/quality-audit/C-security.md`; ticket RT-01 in `docs/quality-audit/remediation-tickets.md`.
- Related: RT-08 (CI gitleaks), `HUMAN-TODO.md`.
