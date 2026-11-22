import { sortByDueThenCourse } from "@/lib/student-grouping";

const d = (day: number) => new Date(2026, 10, day);
const a = (id: string, dueDate: Date | null, curriculumSetKey?: string) => ({
  id,
  title: id,
  dueDate,
  curriculumSetKey,
});

describe("sortByDueThenCourse", () => {
  test("due date first, then course order, no due date last", () => {
    const items = [
      a("none", null, "1A"),
      a("late", d(20), "1A"),
      a("2B", d(10), "2B"),
      a("1C", d(10), "1C"),
      a("early", d(5), "3A"),
    ];
    expect(sortByDueThenCourse(items, ["1A", "1C", "2B", "3A"]).map((x) => x.id)).toEqual([
      "early",
      "1C",
      "2B",
      "late",
      "none",
    ]);
  });

  test("the class's own order breaks a tie on the due date", () => {
    const items = [a("1C", d(10), "1C"), a("2B", d(10), "2B")];
    expect(sortByDueThenCourse(items, ["2B", "1C"]).map((x) => x.id)).toEqual(["2B", "1C"]);
  });

  test("latest due first for handed-in work, undated still last", () => {
    const items = [a("x", d(5)), a("none", null), a("y", d(9))];
    expect(sortByDueThenCourse(items, undefined, -1).map((x) => x.id)).toEqual(["y", "x", "none"]);
  });
});
