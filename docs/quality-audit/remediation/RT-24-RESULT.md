# RT-24 result: media and image weight

Findings: I-001, I-002, I-004, I-006, I-022, I-003, I-005 (partial).

## Sizes
- `du -sh public`: 103 MB (105,392 KB) before, 16 MB (about 15,900 KB) after. Target (under 25 MB): met.
- `.next-gate/static/media` after a gate build: 204 files, 2.72 MB; `.woff2` files 161 (was 322 per the audit). The ticket's 141 extra files came from the three families that had no `subsets`; they now request latin only.

## Deleted files (all verified unreferenced)
Proof: `rg -F` for the file name and the basename without extension across `src`, `README.md`, `next.config.mjs`, `functions/src`, `tests`, `firebase.json`, `public/sitemap.xml`, `package.json` and `docs` found hits only in audit documents (`docs/quality-audit/*`) or none; no dynamic path patterns (`demos/${`, `og-image-${`) exist in `src`.

| File | Bytes | Proof |
|---|---|---|
| public/demos/scorpio-demo-orig.mp4 | 20,210,123 | name only in audit CSVs; master |
| public/demos/landing-demo-v2.webm | 17,812,647 | name only in audit docs |
| public/demos/landing-demo-v2.mp4 | 9,276,419 | name only in audit docs |
| public/og-image.png | 2,645,443 | replaced by og-image.jpg (layout.tsx and README updated) |
| public/plan.jpg | 1,450,639 | no reference outside audit C-security.md |
| public/og-image-pink.png | 1,246,831 | no reference |
| public/mission-control(outdated).png | 455,640 | no reference outside audit docs |
| public/faculty-network.png | 575,589 | no reference |
| public/mc.png | 437,046 | no reference |
| public/radar-portfolio.png | 351,087 | no reference |
| public/demos/teacher-editor2.png | 141,036 | no reference (teacher-editor.png is the used one) |
| public/og-image-light.png | 68,309 | no reference |
| public/og-image-dark.png | 68,267 | no reference |

## Changed binaries
| File | Before | After |
|---|---|---|
| public/demos/scorpio-demo.mp4 | 22,466,865 (1610x1080) | 4,862,156 (720p H.264 CRF 35, faststart, AAC mono 32k), duration 298.69 s unchanged |
| public/demos/scorpio-demo.webm | 21,012,546 | 4,600,511 (720p VP9 CRF 49, Opus mono 24k), duration 298.70 s |
| public/headshot-sage.jpg | 3,100,804 (2048x2048) | 112,432 (800x800 JPEG q82) |
| public/og-image.jpg (new) | og-image.png 2,645,443 (1920x1080) | 153,779 (1200x630, centre-cropped) |
| public/demos/scorpio-demo-poster.jpg (new) | n/a | about 24 KB (frame at 2 s) |

ffmpeg was available. Compression is heavy (300 s into 5 MB), so on-screen text is softer; see BEHAVIOUR-CHANGES.md and HUMAN-TODO.md.

## Code changes
- `src/components/landing/system-demos.tsx`: poster + `preload="none"` (I-002).
- `src/components/demo-carousel.tsx`: active clip `preload="metadata"` (I-003).
- `src/app/(docs)/about/about-client.tsx`: `next/image` with `fill`, `sizes`, `priority` (I-004, I-005 for this file).
- `src/app/layout.tsx`: `subsets: ['latin']` on Plus Jakarta, Lora, IBM Plex Mono; Plus Jakarta (default) preload on; IBM Plex Sans preload off; OG image path `/og-image.jpg` (still 1200x630). All eight families are referenced from CSS, so none were dropped.

## Browser evidence (own tab, next dev on port 5100; 5000 is held by macOS Control Center)
- `/about`: headshot served via `/_next/image` (`w=828`, 395x395 natural, 34 KB at w=1080), renders correctly; og:image meta is `https://scorpioedu.org/og-image.jpg`.
- `/` and `/login` (375 px and desktop): body/headings still `IBM Plex Sans` with Inter for the brand text; loaded faces Inter and IBM Plex Sans as before; no layout change visible.
- Not done: signed-in student/teacher pages (would need emulators); font family changes are global in the layout and computed families are unchanged. The landing demo video section was not reached on the new landing layout, so the poster is verified only as a file and in code.

## Skipped
See FOLLOWUPS.md and HUMAN-TODO.md: remaining raw `<img>`/`images: {}` (I-005), screenshots 350-670 KB, resume PDF, Alan Sans dependency (RT-20), missing `demos/processed` clips, trimming IBM Plex Mono weights, CDN hosting, history rewrite, OG re-scrape.

## Gate
`[gate] PASS`: security 94 passed, ESLint errors 242 (max 242), warnings 176 (max 177), build OK.
