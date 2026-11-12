# Remediation log (append-only)
- 2026-11-11 Phase 0 started on branch audit/quality-audit-2026-11 (clean). Integration branch remediation/audit-2026-11 created from f894a61.
- Baseline run in worktree ../scorpio-wt/baseline (Node 22.22.0). Findings in BASELINE.md. gate.sh validated on untouched tree: PASS (1 expected security failure).
- Observed: a `next dev` server (pid from earlier session) listens on :3000 using ./.next; gate builds into .next-gate to avoid clobbering it. Another project's emulator suite occupies :4000/:4400; remediation uses 8188/9298 only.
