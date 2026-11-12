# RT-33 history rewrite runbook (HUMAN-ONLY, NOT EXECUTED)

Do not run this from an agent session. It rewrites every commit SHA, needs a force-push to `main`, and invalidates every clone, branch and open PR. It also breaks the SHAs cited in the audit docs and `PROGRESS.md`. Decide first whether 257 MB (see RT-33-RESULT.md) is worth it; the alternative is to stop adding media (RT-24) and use Storage/CDN or Git LFS going forward.

## 0. Preconditions

- Merge or close all open PRs; announce a freeze to every collaborator.
- Rotated secrets (RT-01) are independent of this; a rewrite does not make a leaked key safe.
- Install: `brew install git-filter-repo`.
- Decide that the media is no longer needed in history. Current files in `public/demos/` that the site still uses stay in the working tree only if you re-add them after the rewrite (step 4).

## 1. Fresh mirror clone (never rewrite your working checkout)

```bash
git clone --mirror git@github.com:<owner>/<repo>.git scorpio-rewrite.git
cd scorpio-rewrite.git
git filter-repo --analyze          # reports in filter-repo/analysis/
```

## 2. Paths to strip

Create `paths-to-remove.txt` (one literal path per line; confirm against the analysis output):

```
ai-tutor-chat.mp4
public/demos/assignment-creation-teacher.mp4
public/demos/student-submission-math-file.mp4
public/demos/scorpio-demo-orig.mp4
public/demos/navigation-assistant.mp4
public/demos/landing-demo.webm
public/demos/landing-demo-v2.webm
public/demos/landing-demo.mp4
public/demos/landing-demo-v2.mp4
public/demos/landing-demo-orig.mp4
public/demos/ai-tutor-chat.mp4
public/demos/processed/assignment-creation-teacher.mp4
public/demos/processed/student-submission-math-file.mp4
public/demos/processed/navigation-assistant.mp4
```

Do NOT list `public/demos/scorpio-demo.mp4` / `.webm` if the live site still serves them (the current versions are 4.6 MB / 4.4 MB; the 21 MB and 20 MB blobs are older versions). To drop only old versions of a still-used path, use `--strip-blobs-bigger-than 10M` instead, which keeps small current blobs but removes the large old ones (also would remove any large blob currently at HEAD; check `git ls-tree -r -l HEAD | sort -k4 -n | tail`).

## 3. Rewrite

```bash
git filter-repo --invert-paths --paths-from-file paths-to-remove.txt
# or: git filter-repo --strip-blobs-bigger-than 10M
git count-objects -vH && du -sh .
```

## 4. Verify before publishing

```bash
git clone scorpio-rewrite.git verify && cd verify
npm ci && npm run typecheck && npm test
```

Re-add any media the site still needs (from Storage/CDN or LFS) as a normal new commit.

## 5. Force-push (coordination)

```bash
cd scorpio-rewrite.git
git remote add origin git@github.com:<owner>/<repo>.git   # filter-repo removes origin
git push --force --mirror origin                            # or --force-with-lease on each branch
```

If branch protection blocks force-pushes, temporarily allow it for admins, then re-enable.
GitHub keeps old commits reachable via cached PR refs and old SHAs until a GitHub Support garbage-collection request is made; ask Support to run GC and to purge cached views.

## 6. Everyone else

```bash
# delete the old local clone and re-clone; do not merge or pull the old history back in
git clone git@github.com:<owner>/<repo>.git
```

Rebase unmerged local work onto the new history with `git rebase --onto <new-base> <old-base> <branch>` only if you understand it; otherwise re-apply as patches (`git format-patch` before, `git am` after).

## 7. After

- Update SHA references in `docs/quality-audit/remediation/PROGRESS.md` if you care about them (old SHAs no longer resolve).
- Fresh clone target from the ticket: under 100 MB.
