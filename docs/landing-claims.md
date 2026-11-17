# Landing and pricing claims audit (Sprint 3, Sun 6 Dec)

Free plan decision: every global Waypoint (including all AP Physics 1 sets), auto-grading and the misconception report are free. Paid (Department License): department/network waypoints, network sharing, higher AI limits.

Evidence paths are relative to the repo root. "Removed" means no replacement claim.

| Where | Claim before | Claim after | Evidence |
|---|---|---|---|
| `src/app/pricing/page.tsx` Starter card/table | "1 active Waypoint curriculum module", "1 Module" | "Every global Waypoint, including all AP Physics 1 sets" | `src/lib/plan-limits.ts`, `src/lib/plan-gates.ts` (only network waypoints gated) |
| pricing Starter | Raise and AI grading shown as not included | "Raise hints / AI grading of written answers: starter budget" on Starter, "higher limits" on Department | `src/lib/usage-limit.ts` (free org gets a starter AI budget), `src/app/api/auth/register/route.ts` |
| pricing table | "Classroom Mastery Analytics", Department only | "Class Misconception Report", free on all plans | `src/app/teacher/insights/page.tsx`, `src/app/api/teacher/insights/`, `docs/content-pipeline.md` |
| pricing table | (none) | "Auto-Grading", free | `functions/src/grading-core.ts`, `docs/grading.md` |
| pricing | (none) | "Class codes", "CSV grade export" on all plans | `src/app/join/`, `src/app/teacher/assignment-view/page.tsx` (Export CSV), `src/app/teacher/grades/page.tsx` |
| pricing Department | "Unlimited physics Waypoints" | "Department waypoints and sharing across your school network" | `src/lib/plan-gates.ts` (`network-share`) |
| pricing Department | "Student derivation tracking & portfolios" | "AI-written student portfolios" | `src/app/api/teacher/network/portfolio/route.ts` |
| pricing Department | "AI-assisted grading & rubric synthesis" | "AI-assisted rubric drafting" plus higher AI limits | `src/app/api/ai/synthesize-rubric/` |
| pricing Department | "Priority faculty support" | Removed | No support tier in code |
| pricing Department | "Anti-Solver Derivation Enforcement" row | Removed (Raise hints row stays) | Research only supports "0% direct answers on 25 test questions" (`src/app/(docs)/research/page.tsx`) |
| pricing | "Save 50%" on annual | "Save 17%" ($100 vs $120) | `src/app/teacher/network/billing/page.tsx` ("Save $20") |
| pricing hero | "Covers your entire physics department" as sole message | States what is free and what the Department License adds | as above |
| pricing economics | "Traditional tools charge $4-$12 per student per month" | Removed | No source in docs |
| pricing economics | "You will never receive an unexpected billing overage" | "AI stops when the cap is reached" | `src/app/teacher/network/billing/page.tsx` (spend cap) |
| pricing District | Canvas/Blackboard/Schoology LTI | "Google Classroom and Canvas integrations are not built yet" | `docs/launch-plan.md` (integration decision 10 Jan) |
| pricing District | "Centralized multi-school administration", "FERPA & COPPA compliance agreements", "PO / Invoice / ACH", "Dedicated onboarding & SLA" | Removed. District card says arranged case by case; data-protection review with the school | `src/app/(docs)/privacy/page.tsx` ("does not claim a blanket FERPA or COPPA certification") |
| pricing District CTA | "Request District License" | "Talk to us" (`/contact`) | no district license flow exists |
| `src/components/landing-faq.tsx` | "A-Level, AP Physics, and introductory college physics ... quantum" | Pilot is AP Physics 1; sets released unit by unit, answers checked by a person | `src/data/ap`, `docs/content-pipeline.md`, `docs/launch-plan.md` |
| FAQ | "What are Waypoints": modules that tell Raise which topic to stay on | Shared assignments; global free, department paid | `src/app/teacher/waypoints/page.tsx`, `src/app/api/assignments/clone/route.ts` |
| FAQ | Pricing: subscription only | Free plan contents plus Department License $10/mo or $100/yr | `src/app/teacher/network/billing/page.tsx` |
| FAQ | "Canvas or Blackboard integration ... Enterprise plan" | Not built; class codes and CSV; tell us your LMS | `docs/launch-plan.md` |
| FAQ | "FERPA-ready infrastructure", "Teachers only see aggregated analytics" | Firebase role-based rules; no blanket FERPA/COPPA claim; not used for model training | `src/app/(docs)/privacy/page.tsx` |
| FAQ | "gave no direct answers" | Same, plus "result on 25 test questions, not a guarantee" | `src/app/(docs)/research/page.tsx` |
| FAQ | What is Scorpio | AP Physics 1 homework: auto-grading, hints, misconception report | `docs/launch-plan.md` |
| `src/components/landing/LandingHero.tsx` | "see where your class gets stuck" | "shows you which misconceptions your class has" | `docs/content-pipeline.md` |
| `src/components/landing/classroom-bento.tsx` | "Review class progress: see who submitted and which questions need more class time" | "See class misconceptions: ranked by number of students (8 of 24), by class, assignment and AP unit" | `src/app/teacher/insights/page.tsx` |
| classroom-bento | Post an assignment: "Write questions" | Copy a ready-made AP Physics 1 set or write your own; class code | `src/app/teacher/waypoints/page.tsx`, `src/app/join/` |
| `src/app/page.tsx` | "One subscription for all your students" | "Free for individual teachers" with what is free | as pricing |
| `src/app/page.tsx` CTA | "Scorpio works alongside your existing LMS" | Students join with a class code, nothing to connect | `src/app/join/` |
| `src/app/features/page.tsx` | "Shared Waypoints Network ... peer-validated" and four cards by "Dr. A. Patel", "Prof. R. Chen", "Dr. S. Okafor", "Prof. L. Torres" (fabricated authors) | "Waypoints Library"; cards list the first four AP Physics 1 units from the data file | `src/data/ap` |
| features | "FERPA / COPPA" highlight; "Unlimited Seats"/"mastery telemetry" | Replaced by "Hints, Not Answers" (tested on 25 questions) and "Class Misconception Report" | privacy page; insights route |
| features | "OCR-ready PDF uploads and handwritten math scans" | Replaced by "Auto-Grading" | no handwriting OCR in `src/app/api/ai/parse` (text parsing only) |
| features | "parametric variations", "derivation paths and automated sanity checks", "cohort conceptual bottlenecks", "derivation portfolio tracking" | Real features: copy sets, automatic/manual grading, flagged submissions, misconception ranking, class code | `src/app/teacher/create/page.tsx`, `docs/grading.md` |
| features | "makes solver bypass structurally impossible" / "No answer leaks" | "Tested on 25 problems, not guaranteed" | research page |
| features comparison | Khanmigo and Human Tutor columns (~40%, ~0.8, $4/student, $40-120/hr ...), ChatGPT "$20 / student", Cost row | Removed. ChatGPT/Gemini column kept (study baseline) | `src/app/(docs)/research/page.tsx` (no Khanmigo data) |
| `src/app/api/chat/landing/route.ts` (public chatbot prompt) | "world's only AI Physics LMS", "structurally impossible", Khanmigo 12%/0.31, "Peer-validated ... shared across institutions" | Plain description, study numbers vs unconstrained baseline, free plan and Department License contents, "Google Classroom/Canvas not built" | same evidence |
| `src/app/(docs)/research/page.tsx` | "Always-on Raise, Department Waypoints, and Mastery Analytics come standard with every organizational license" | Higher AI limits, department waypoints; auto-grading and misconception report are free | as pricing |
| `src/app/teacher/network/billing/page.tsx` (in-app plans) | Free: "1 active Waypoint", "No AI tutor or automated grading"; Dept: "All Waypoints", "Instant automated homework and lab grading" | Free: every global Waypoint, auto-grading, misconception report, starter AI budget; Dept: department waypoints/sharing, higher AI limits | `src/lib/plan-gates.ts` |
| `src/components/teacher/department-upgrade-dialog.tsx` | "Free plans include 3 starter waypoints ... 20+ templates"; "3 starter waypoints" | `waypoints` variant removed; free-plan note lists every global waypoint, auto-grading, report | `src/lib/plan-limits.ts` |
| `src/app/teacher/waypoints/page.tsx` | "3 starter waypoints" banner, "Starter Template" badge, per-card locks | Free-plan banner states what is free; only the Department tab is locked | `src/lib/plan-limits.ts` |

## Deleted (unreferenced, with stale or unsupported claims)
`src/components/landing/pricing.tsx` ("Limited Network (1 Waypoint)", "Mastery Analytics", "98% cheaper", "$0.08 per student"), `hero-section.tsx`, `efficacy.tsx`, `workflow.tsx`, `waypoints-network.tsx`, `landing-cta.tsx`, `header.tsx`, `LandingFooter.tsx`, `MathematicalFidelity.tsx`, `MissionControl.tsx`, `TheChallenge.tsx`, `layer-efficacy-chart.tsx`, `solution-flowchart.tsx`, `system-demos.tsx`, `logo-cloud.tsx` (empty). None was imported anywhere in `src`, `__tests__` or `tests`.

## Not changed (known, out of scope)
- `src/lib/chatbot-config.json` (in-app Raise help prompt) was not audited.
- `src/components/landing/workspace-preview-*` (sample workspace demo data) not audited.
- Features page still shows the 0.92 LaTeX density and 4.62 quality figures; they are sourced from the research page.
