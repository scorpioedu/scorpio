// The rule My Assignments and the Dashboard share for which assignments are "current".
import {
  isCurrentAssignment,
  isLibrarySet,
  isPutAway,
  timeOf,
} from "../src/lib/assignment-listing";

const archivedClasses = new Set(["old-class"]);

describe("assignment listing", () => {
  it("counts an ordinary class assignment", () => {
    expect(isCurrentAssignment({ courseId: "c1", visibility: "private" }, archivedClasses)).toBe(
      true,
    );
  });

  it("puts away an archived assignment and every assignment in an archived class", () => {
    expect(isCurrentAssignment({ courseId: "c1", archivedAt: "2026-11-01" }, archivedClasses)).toBe(
      false,
    );
    expect(isCurrentAssignment({ courseId: "old-class" }, archivedClasses)).toBe(false);
    expect(isPutAway({ courseId: "old-class" }, archivedClasses)).toBe(true);
    expect(isPutAway({ courseId: "c1" }, archivedClasses)).toBe(false);
  });

  it("leaves out the published course library, but not a library set assigned to a class", () => {
    const library = { visibility: "global", curriculumSetKey: "ap1-4a" };
    expect(isLibrarySet(library)).toBe(true);
    expect(isCurrentAssignment(library, archivedClasses)).toBe(false);
    expect(isCurrentAssignment({ ...library, courseId: "c1" }, archivedClasses)).toBe(true);
  });

  it("reads times from Timestamps, Dates, strings and numbers", () => {
    expect(timeOf({ toMillis: () => 5 })).toBe(5);
    expect(timeOf(new Date(7))).toBe(7);
    expect(timeOf("1970-01-01T00:00:00.009Z")).toBe(9);
    expect(timeOf({ seconds: 2 })).toBe(2000);
    expect(timeOf(undefined)).toBe(0);
    expect(timeOf("not a date")).toBe(0);
  });
});
