// The reviewed problems of every course (content/<curriculumId>/*.json) hold answer keys and worked
// solutions, so they are kept out of the public repository (see .gitignore and
// docs/content-pipeline.md). Tests that read them run where the files exist and are skipped where
// they do not (a fresh clone, CI).
import fs from "fs";
import path from "path";

const ROOT = path.join(__dirname, "..", "..");

export const hasCourseContent = fs.existsSync(
  path.join(ROOT, "content", "ap-physics-1", "units-4-6.json"),
);

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface CourseContentFile {
  drafts: any[];
  sets: any[];
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** A content file by its repo path ("content/ap-physics-1/units-4-6.json"); empty when it is not here. */
export function courseContent(file: string): CourseContentFile {
  return hasCourseContent
    ? JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"))
    : { drafts: [], sets: [] };
}

export const describeWithContent = hasCourseContent ? describe : describe.skip;
export const testWithContent = hasCourseContent ? test : test.skip;
