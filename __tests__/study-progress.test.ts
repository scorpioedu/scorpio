import {
  REVIEW_INTERVAL_DAYS,
  dueTopics,
  emptyProgress,
  nextReviewAt,
  parseProgress,
  recordAttempt,
  splitTopicKey,
  streak,
  topMisconceptions,
  topicKey,
  topicStats,
  type StudyProgress,
} from "../src/lib/study/progress";

const T = topicKey("ap-physics-1", "3.4");
const day = (n: number) => new Date(Date.UTC(2026, 10, 1 + n, 15));
const answer = (
  p: StudyProgress,
  problem: string,
  correct: boolean,
  n: number,
  tags: string[] = [],
) => recordAttempt(p, { problem, topic: T, correct, misconceptions: tags, now: day(n) });

describe("study review schedule", () => {
  test("a right first answer never enters review", () => {
    const p = answer(emptyProgress(), "s:q1", true, 0);
    expect(p.review).toEqual({});
    expect(dueTopics(p, day(30))).toEqual([]);
  });

  test("a miss brings the topic back the next day, then climbs 1, 3, 7, 14 days and leaves", () => {
    let p = answer(emptyProgress(), "s:q1", false, 0);
    expect(p.review[T]).toEqual({ box: 0, due: day(1).toISOString() });
    expect(dueTopics(p, day(0))).toEqual([]);
    expect(dueTopics(p, day(1))).toEqual([T]);

    let now = 1;
    for (let box = 1; box < REVIEW_INTERVAL_DAYS.length; box++) {
      p = answer(p, `s:q${box + 1}`, true, now);
      expect(p.review[T].box).toBe(box);
      now += REVIEW_INTERVAL_DAYS[box];
      expect(p.review[T].due).toBe(day(now).toISOString());
    }
    p = answer(p, "s:last", true, now);
    expect(p.review[T]).toBeUndefined();
    expect(nextReviewAt(p)).toBeNull();
  });

  test("a miss during review drops the topic back to the start", () => {
    let p = answer(emptyProgress(), "s:q1", false, 0);
    p = answer(p, "s:q2", true, 1);
    p = answer(p, "s:q3", false, 4);
    expect(p.review[T]).toEqual({ box: 0, due: day(5).toISOString() });
  });

  test("does not change the progress it was given", () => {
    const before = emptyProgress();
    answer(before, "s:q1", false, 0, ["x"]);
    expect(before).toEqual(emptyProgress());
  });
});

describe("study stats", () => {
  test("levels follow distinct problems and their latest answers", () => {
    let p = emptyProgress();
    expect(topicStats(p, T).level).toBe("new");
    p = answer(p, "s:q1", false, 0);
    expect(topicStats(p, T)).toMatchObject({
      attempted: 1,
      correct: 0,
      level: "learning",
      inReview: true,
    });
    p = answer(p, "s:q1", true, 1); // retrying the same problem counts once
    p = answer(p, "s:q2", true, 1);
    expect(topicStats(p, T)).toMatchObject({ attempted: 2, correct: 2, level: "practised" });
    p = answer(p, "s:q3", true, 2);
    p = answer(p, "s:q4", true, 5);
    p = answer(p, "s:q5", true, 12);
    p = answer(p, "s:q6", true, 26);
    expect(p.review[T]).toBeUndefined();
    expect(topicStats(p, T)).toMatchObject({
      attempted: 6,
      correct: 6,
      level: "strong",
      inReview: false,
    });
  });

  test("misconceptions count wrong answers only and sort by count", () => {
    let p = answer(emptyProgress(), "s:q1", false, 0, ["a", "a"]);
    p = answer(p, "s:q2", false, 1, ["b"]);
    p = answer(p, "s:q3", false, 2, ["b"]);
    p = answer(p, "s:q4", true, 3, ["c"]);
    expect(topMisconceptions(p).map((m) => [m.id, m.count])).toEqual([
      ["b", 2],
      ["a", 1],
    ]);
  });

  test("the streak counts back from today, or from yesterday when nothing was done today", () => {
    let p = emptyProgress();
    for (const n of [0, 1, 2, 4, 5]) p = answer(p, `s:${n}`, true, n);
    expect(p.days).toHaveLength(5);
    expect(streak(p, day(5))).toBe(2);
    expect(streak(p, day(6))).toBe(2);
    expect(streak(p, day(7))).toBe(0);
  });

  test("topic keys keep the course, whose id has dashes", () => {
    expect(splitTopicKey(topicKey("ap-physics-c-mech", "1.2"))).toEqual({
      courseId: "ap-physics-c-mech",
      topicId: "1.2",
    });
  });
});

describe("parseProgress", () => {
  test("drops malformed entries instead of throwing", () => {
    expect(parseProgress(null)).toEqual(emptyProgress());
    const p = parseProgress({
      problems: { ok: { topic: T, correct: true, tries: 2, at: "x" }, bad: { topic: 1 } },
      review: { [T]: { box: 9, due: "d" }, junk: "x" },
      misconceptions: { a: { count: 1, at: "t" }, b: null },
      days: ["2026-11-01", 3],
      updatedAt: 5,
      shareToken: "kept elsewhere",
    });
    expect(Object.keys(p.problems)).toEqual(["ok"]);
    expect(p.review[T].box).toBe(REVIEW_INTERVAL_DAYS.length - 1);
    expect(Object.keys(p.misconceptions)).toEqual(["a"]);
    expect(p.days).toEqual(["2026-11-01"]);
    expect(p.updatedAt).toBeNull();
  });
});

import { studyNextPath } from "../src/lib/onboarding-links";

describe("studyNextPath", () => {
  test("allows Study pages in this app and nothing else", () => {
    for (const ok of [
      "/student/study",
      "/student/study/review",
      "/student/study/practice?course=ap-physics-1&topic=3.4",
      "/student/study/practice?course=ap-physics-c-em&unit=10",
      "/student/courses/ap-physics-1/3",
      "/student/courses/ap-physics-c-mech/5#topic-5-1",
    ])
      expect(studyNextPath(ok)).toBe(ok);
    for (const bad of [
      null,
      "",
      "//evil.example",
      "https://evil.example/student/study",
      "/student/studyx",
      "/student/study/../../teacher",
      "/teacher",
      "/student/study?x=<script>",
      `/student/study?${"a".repeat(300)}`,
      "/student/courses/ap-physics-1/3/../../teacher",
      "/student/courses/ap-physics-1/3#topic-3-4?x=1",
      "/student/courses/../../teacher/1",
    ])
      expect(studyNextPath(bad)).toBeNull();
  });
});

import { lastActivity, recordRead } from "../src/lib/study/progress";

describe("lesson reading", () => {
  test("opening lessons records them and counts as the latest activity when it is", () => {
    let p = answer(emptyProgress(), "s:q1", true, 0);
    expect(topicStats(p, T).read).toBe(false);
    const other = topicKey("ap-physics-1", "3.5");
    p = recordRead(p, [T, other], day(1));
    expect(topicStats(p, T).read).toBe(true);
    expect(lastActivity(p)).toMatchObject({ kind: "read" });
    p = answer(p, "s:q2", false, 2);
    expect(lastActivity(p)).toEqual({ topic: T, kind: "practice", at: day(2).toISOString() });
    // Answers keep what was read.
    expect(Object.keys(p.read).sort()).toEqual([T, other].sort());
    expect(recordRead(p, [], day(3))).toBe(p);
  });

  test("parseProgress keeps read times and drops junk", () => {
    expect(parseProgress({ read: { [T]: "2026-11-01T00:00:00Z", bad: 3 } }).read).toEqual({
      [T]: "2026-11-01T00:00:00Z",
    });
  });
});
