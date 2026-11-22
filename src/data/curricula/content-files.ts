// Where each course's reviewed problems are kept in the repo (exported drafts, see
// tools/content-drafts.cjs). The admin Sets tab shows these as import commands, and
// tools/curriculum-profile.cjs reads every .json in the same folders.
export const CONTENT_FILES: Record<string, string[]> = {
  "ap-physics-1": [
    "content/ap-physics-1/units-1-3-7-8.json",
    "content/ap-physics-1/units-4-6.json",
  ],
  "ap-physics-2": ["content/ap-physics-2/units-9-15.json"],
  "ap-physics-c-mech": ["content/ap-physics-c-mech/units-1-7.json"],
  "ap-physics-c-em": ["content/ap-physics-c-em/units-8-13.json"],
};
