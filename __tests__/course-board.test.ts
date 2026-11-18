// Where each set of a class's course stands on /teacher/courses (up next, assigned, needs you, done)
// and the numbers strip above the List and the Calendar.
import { getCurriculum } from "../src/data/curricula";
import {
  boardColumns,
  boardStats,
  filterBoard,
  plannedDates,
  toCheck,
} from "../src/lib/course-board";
import type { SetProgress } from "../src/lib/course-progress";
import { paceCourse } from "../src/lib/course-pacing";
import { defaultOrder } from "../src/lib/curriculum-plan";
import { deriveRoadmap, type ClassAssignment } from "../src/lib/curriculum-roadmap";

const ID = "ap-physics-1";
const all = defaultOrder(ID);
const NOW = new Date("2026-11-17T12:00:00");
const past = new Date("2026-11-10T23:59:00");
const future = new Date("2026-11-21T23:59:00");
const STUDENTS = 13;
const published = getCurriculum(ID)!.sets.map((s) => ({
  id: `g-${s.key}`,
  curriculumSetKey: s.key,
  questionCount: 5,
}));

const copy = (key: string, dueDate: Date | null, extra: Partial<ClassAssignment> = {}) => ({
  id: `a${key}`,
  title: key,
  curriculumId: ID,
  curriculumSetKey: key,
  dueDate,
  ...extra,
});
const prog = (key: string, over: Partial<SetProgress> = {}): SetProgress => ({
  key,
  assignmentId: `a${key}`,
  submitted: 0,
  graded: 0,
  pending: 0,
  averageScore: null,
  overdue: 0,
  needsReview: 0,
  ...over,
});
const byKey = (...list: SetProgress[]) => Object.fromEntries(list.map((p) => [p.key, p]));
const keys = (cards: { key: string }[]) => cards.map((c) => c.key);

/** The board for a class with the given copies and progress; every set is published. */
function board(
  copies: ClassAssignment[],
  progress: Record<string, SetProgress> | null,
  opts: { plan?: { order: string[]; skipped: string[] }; published?: typeof published } = {},
) {
  const roadmap = deriveRoadmap(ID, opts.published ?? published, copies, opts.plan);
  return boardColumns(roadmap, progress, STUDENTS, NOW);
}

describe("board columns", () => {
  test("every set lands in exactly one column", () => {
    const b = board(
      [copy("1A", past), copy("1B", past), copy("1C", future), copy("1D", future)],
      byKey(
        prog("1A", { submitted: 13, graded: 13, averageScore: 80 }),
        prog("1B", { submitted: 13, pending: 2 }),
        prog("1C", { submitted: 4 }),
        prog("1D"),
      ),
      { plan: { order: all, skipped: ["8D"] }, published: published.slice(0, 20) },
    );
    const everything = [...b.upNext, ...b.parked, ...b.assigned, ...b.needsYou, ...b.done];
    expect(keys(everything).sort()).toEqual([...all].sort());
    expect(new Set(keys(everything)).size).toBe(all.length);
    expect(keys(b.done)).toEqual(["1A"]);
    expect(keys(b.needsYou)).toEqual(["1B"]);
    expect(keys(b.assigned)).toEqual(["1C", "1D"]);
  });

  test("Up next is the published, unassigned, unskipped sets in plan order", () => {
    const order = ["1B", "1A", ...all.slice(2)];
    const b = board([copy("1C", future)], null, { plan: { order, skipped: ["1D"] } });
    expect(keys(b.upNext).slice(0, 3)).toEqual(["1B", "1A", "2A"]);
    expect(b.upNext.every((c) => c.progress === null)).toBe(true);
    expect(b.upNext[0].unit).toBe(1);
  });

  test("skipped and unpublished sets are parked, with the reason", () => {
    const b = board([], null, {
      plan: { order: all, skipped: ["1B", "5A"] },
      published: published.filter(
        (p) => p.curriculumSetKey !== "5A" && p.curriculumSetKey !== "5B",
      ),
    });
    const reason = Object.fromEntries(b.parked.map((c) => [c.key, c.reason]));
    // Skipped wins over "not published": Unskip is the action the teacher can take.
    expect(reason).toEqual({ "1B": "skipped", "5A": "skipped", "5B": "unpublished" });
    expect(keys(b.upNext)).not.toContain("1B");
    expect(keys(b.upNext)).not.toContain("5B");
  });

  test("a set with nothing written is parked as planned", () => {
    const roadmap = deriveRoadmap(ID, [], []);
    roadmap[0].sets[0] = { ...roadmap[0].sets[0], availability: "planned" };
    const b = boardColumns(roadmap, null, STUDENTS, NOW);
    expect(b.parked[0]).toMatchObject({ key: "1A", reason: "planned" });
    expect(b.parked[1]).toMatchObject({ key: "1B", reason: "unpublished" });
    expect(b.upNext).toEqual([]);
  });

  test("an assigned set stays on the board even when the plan skips it", () => {
    const b = board([copy("1A", future)], byKey(prog("1A")), {
      plan: { order: all, skipped: ["1A"] },
    });
    expect(keys(b.assigned)).toEqual(["1A"]);
    expect(keys(b.parked)).toEqual([]);
  });

  test("an archived copy puts the set back in Up next", () => {
    const b = board([copy("1A", past, { archived: true })], byKey(prog("1A", { submitted: 13 })));
    expect(keys(b.upNext)[0]).toBe("1A");
    expect(b.upNext[0].s.archivedId).toBe("a1A");
    expect(b.upNext[0].progress).toBeNull();
    expect(b.done).toEqual([]);
  });

  test("Needs you comes first: written answers to grade or a changed key", () => {
    const b = board(
      [copy("1A", past), copy("1B", future), copy("1C", past)],
      byKey(
        // Past due and everyone in would be Done, but answers are waiting.
        prog("1A", { submitted: 13, pending: 5 }),
        prog("1B", { submitted: 2, needsReview: 2 }),
        prog("1C", { submitted: 13 }),
      ),
    );
    expect(keys(b.needsYou)).toEqual(["1A", "1B"]);
    expect(keys(b.done)).toEqual(["1C"]);
    expect(toCheck(b.needsYou[0].progress)).toBe(5);
    expect(toCheck(null)).toBe(0);
  });

  test("Done: everyone handed it in, even before the due date or without one", () => {
    const b = board(
      [copy("1A", future), copy("1B", null), copy("1C", future)],
      byKey(
        prog("1A", { submitted: 13 }),
        prog("1B", { submitted: 14 }), // a student has since left the class
        prog("1C", { submitted: 12 }),
      ),
    );
    expect(keys(b.done).sort()).toEqual(["1A", "1B"]);
    expect(keys(b.assigned)).toEqual(["1C"]);
  });

  test("past due: Done when nobody is missing, Assigned while students still owe it", () => {
    const b = board(
      [copy("1A", past), copy("1B", past)],
      byKey(prog("1A", { submitted: 10, overdue: 3 }), prog("1B", { submitted: 0, overdue: 0 })),
    );
    expect(keys(b.assigned)).toEqual(["1A"]);
    expect(keys(b.done)).toEqual(["1B"]);
  });

  test("no due date and not everyone in stays Assigned", () => {
    const b = board([copy("1A", null)], byKey(prog("1A", { submitted: 3 })));
    expect(keys(b.assigned)).toEqual(["1A"]);
  });

  test("a class with no students: nothing is done until its due date passes", () => {
    const roadmap = deriveRoadmap(ID, published, [copy("1A", future), copy("1B", past)]);
    const b = boardColumns(roadmap, byKey(prog("1A"), prog("1B")), 0, NOW);
    expect(keys(b.assigned)).toEqual(["1A"]);
    expect(keys(b.done)).toEqual(["1B"]);
  });

  test("while progress is missing an assigned set waits in Assigned", () => {
    const copies = [copy("1A", past), copy("1B", future)];
    expect(keys(board(copies, null).assigned)).toEqual(["1A", "1B"]);
    expect(keys(board(copies, {}).assigned)).toEqual(["1A", "1B"]);
  });

  test("Assigned is soonest due first with undated sets last; Done is latest first", () => {
    const later = new Date("2026-12-01T23:59:00");
    const earlier = new Date("2026-11-03T23:59:00");
    const b = board(
      [
        copy("1A", null),
        copy("1B", later),
        copy("1C", future),
        copy("2A", earlier),
        copy("2B", past),
      ],
      byKey(prog("1A"), prog("1B"), prog("1C"), prog("2A"), prog("2B")),
    );
    expect(keys(b.assigned)).toEqual(["1C", "1B", "1A"]);
    expect(keys(b.done)).toEqual(["2B", "2A"]);
  });

  test("the unit filter keeps one unit in every column", () => {
    const b = board(
      [copy("1A", past), copy("2A", future)],
      byKey(prog("1A", { submitted: 13 }), prog("2A")),
      { plan: { order: all, skipped: ["2D"] } },
    );
    const two = filterBoard(b, 2);
    expect(keys(two.upNext)).toEqual(["2B", "2C"]);
    expect(keys(two.parked)).toEqual(["2D"]);
    expect(keys(two.assigned)).toEqual(["2A"]);
    expect(two.done).toEqual([]);
    expect(filterBoard(b, null)).toBe(b);
  });
});

describe("board stats", () => {
  test("counts sets, averages set averages, sums what is waiting and overdue", () => {
    const b = board(
      [copy("1A", past), copy("1B", past), copy("1C", past), copy("1D", future)],
      byKey(
        prog("1A", { submitted: 13, averageScore: 70 }),
        prog("1B", { submitted: 13, averageScore: 81, pending: 5, needsReview: 2 }),
        prog("1C", { submitted: 10, overdue: 3, averageScore: 90 }),
        prog("1D", { submitted: 1 }),
      ),
      { plan: { order: all, skipped: ["8C", "8D"] }, published: published.slice(0, 30) },
    );
    expect(boardStats(b)).toEqual({
      assigned: 4,
      // 32 sets, two skipped; unpublished ones still count as to come.
      total: 30,
      average: 80,
      needsYou: 1,
      toCheck: 7,
      overdue: 3,
    });
  });

  test("an empty class has no average", () => {
    expect(boardStats(board([], null))).toEqual({
      assigned: 0,
      total: 32,
      average: null,
      needsYou: 0,
      toCheck: 0,
      overdue: 0,
    });
  });
});

describe("planned dates", () => {
  const start = new Date("2026-11-24T23:59:00");
  test("unassigned sets get the pacing guide's dates; assigned and skipped sets have none", () => {
    const roadmap = deriveRoadmap(ID, published, [copy("1A", past)], {
      order: all,
      skipped: ["1B"],
    });
    const pacing = paceCourse(roadmap, { start, spacing: 2 });
    const planned = plannedDates(pacing);
    expect(planned.has("1A")).toBe(false);
    expect(planned.has("1B")).toBe(false);
    expect(planned.get("1C")).toEqual(start);
    expect(planned.get("1D")!.getTime()).toBeGreaterThan(start.getTime());
  });
});
