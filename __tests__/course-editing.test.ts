// Courses editing helpers: drag placement, re-dating to a new order, archived copies on the roadmap.
import { defaultOrder, placeSet, placeUnit, unitOrder } from "../src/lib/curriculum-plan";
import { redateToOrder } from "../src/lib/course-pacing";
import { deriveRoadmap } from "../src/lib/curriculum-roadmap";

const all = defaultOrder("ap-physics-1");

describe("drag placement", () => {
  test("a unit moves as a block, sets stay together", () => {
    const order = placeUnit(all, 5, 0);
    expect(unitOrder(order).slice(0, 3)).toEqual([5, 1, 2]);
    expect(order.slice(0, 4)).toEqual(["5A", "5B", "5C", "5D"]);
    expect(placeUnit(all, 1, 99).slice(-4)).toEqual(["1A", "1B", "1C", "1D"]);
  });

  test("a set moves only inside its unit", () => {
    const order = placeSet(all, "2D", 0);
    expect(order.filter((k) => k.startsWith("2"))).toEqual(["2D", "2A", "2B", "2C"]);
    expect(order.filter((k) => !k.startsWith("2"))).toEqual(all.filter((k) => !k.startsWith("2")));
  });
});

describe("re-date to a new order", () => {
  const d = (day: number) => new Date(2026, 10, day, 23, 59);
  test("the same dates, handed out in the new order; unchanged ones are left out", () => {
    const changes = redateToOrder(
      ["1B", "1A", "1C"],
      [
        { key: "1A", id: "a", due: d(18) },
        { key: "1B", id: "b", due: d(20) },
        { key: "1C", id: "c", due: d(24) },
      ],
    );
    expect(changes).toEqual([
      { id: "b", due: d(18) },
      { id: "a", due: d(20) },
    ]);
  });
});

describe("archived copies", () => {
  test("count as not assigned and are remembered for restoring", () => {
    const published = [{ id: "g1", curriculumSetKey: "1A", questionCount: 5 }];
    const roadmap = deriveRoadmap("ap-physics-1", published, [
      { id: "old", curriculumSetKey: "1A", archived: true, title: "Mine" },
    ]);
    const set = roadmap[0].sets.find((s) => s.set.key === "1A")!;
    expect(set.assigned).toBe(false);
    expect(set.archivedId).toBe("old");
    expect(roadmap[0].assignable.map((s) => s.set.key)).toEqual(["1A"]);
  });

  test("the class copy's title is kept for the row", () => {
    const roadmap = deriveRoadmap(
      "ap-physics-1",
      [],
      [{ id: "x", curriculumSetKey: "1A", title: "Kinematics warm-up" }],
    );
    expect(roadmap[0].sets[0].copyTitle).toBe("Kinematics warm-up");
  });
});
