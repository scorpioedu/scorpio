import {
  buildDigest,
  digestKey,
  digestSubject,
  type DigestInput,
} from "../functions/src/teacher-digest-rules";
import { MISCONCEPTION_TAGS } from "../functions/src/misconceptions";

const NOW = Date.parse("2026-11-23T15:00:00Z"); // a Monday
const DAY = 24 * 60 * 60 * 1000;
const [TAG_A, TAG_B] = MISCONCEPTION_TAGS;

const base = (over: Partial<DigestInput> = {}): DigestInput => ({
  now: NOW,
  assignments: [],
  enrolledByCourse: new Map([["c1", 4]]),
  weekSubmissions: [],
  toReview: 0,
  events: [],
  ...over,
});

describe("buildDigest", () => {
  it("is null when nothing happened and nothing is missing", () => {
    expect(buildDigest(base())).toBeNull();
    // An assignment due next week with no work yet is not news.
    expect(
      buildDigest(base({ assignments: [{ id: "a", title: "Set 1", courseId: "c1", dueMs: NOW + 2 * DAY, turnedIn: 0 }] })),
    ).toBeNull();
  });

  it("reports the week's hand-ins against the class size", () => {
    const d = buildDigest(
      base({
        assignments: [{ id: "a", title: "Set 1", courseId: "c1", dueMs: NOW + 2 * DAY, turnedIn: 3 }],
        weekSubmissions: ["a", "a", "a"],
      }),
    )!;
    expect(d.turnedInThisWeek).toBe(3);
    expect(d.rows).toEqual([
      { title: "Set 1", turnedIn: 3, enrolled: 4, due: expect.stringMatching(/^Due Wed, Nov 25$/), behind: false },
    ]);
    expect(digestSubject(d)).toBe("Your week on Scorpio: 3 submissions");
  });

  it("sends for missing work alone, and lists it first", () => {
    const d = buildDigest(
      base({
        assignments: [
          { id: "next", title: "Set 2", courseId: "c1", dueMs: NOW + DAY, turnedIn: 0 },
          { id: "late", title: "Set 1", courseId: "c1", dueMs: NOW - 2 * DAY, turnedIn: 1 },
        ],
      }),
    )!;
    expect(d.rows.map((r) => r.title)).toEqual(["Set 1", "Set 2"]);
    expect(d.rows[0]).toMatchObject({ behind: true, turnedIn: 1, enrolled: 4, due: "Was due Sat, Nov 21" });
    expect(digestSubject(d)).toBe("Scorpio: work is still missing from your class");
  });

  it("leaves out classes with no students and old assignments nobody touched", () => {
    const d = buildDigest(
      base({
        toReview: 2,
        assignments: [
          { id: "empty", title: "Empty class", courseId: "c2", dueMs: NOW - DAY, turnedIn: 0 },
          { id: "old", title: "Last month", courseId: "c1", dueMs: NOW - 30 * DAY, turnedIn: 4 },
        ],
      }),
    )!;
    expect(d.rows).toEqual([]);
    expect(d.toReview).toBe(2);
    expect(digestSubject(d)).toBe("Scorpio: 2 waiting for your review");
  });

  it("never shows more hand-ins than students", () => {
    const d = buildDigest(
      base({
        assignments: [{ id: "a", title: "Set 1", courseId: "c1", dueMs: null, turnedIn: 6 }],
        weekSubmissions: ["a"],
      }),
    )!;
    expect(d.rows[0]).toMatchObject({ turnedIn: 4, enrolled: 4, due: "No due date" });
  });

  it("ranks mistakes by how many students made them, at most three, ignoring unknown tags", () => {
    const d = buildDigest(
      base({
        weekSubmissions: ["a"],
        events: [
          { tag: TAG_A.id, studentId: "s1" },
          { tag: TAG_A.id, studentId: "s1" }, // same student twice counts once
          { tag: TAG_B.id, studentId: "s1" },
          { tag: TAG_B.id, studentId: "s2" },
          { tag: "not-a-tag", studentId: "s3" },
        ],
      }),
    )!;
    expect(d.misconceptions).toEqual([
      { label: TAG_B.label, students: 2 },
      { label: TAG_A.label, students: 1 },
    ]);
  });
});

test("digestKey is the run day", () => {
  expect(digestKey(new Date(NOW))).toBe("2026-11-23");
});
