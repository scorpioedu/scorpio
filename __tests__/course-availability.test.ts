// "Not published yet" vs "Planned" on the course roadmap (docs/courses.md).
import { getCurriculum } from "../src/data/curricula";
import { AVAILABILITY_LABEL, deriveRoadmap, setAvailability } from "../src/lib/curriculum-roadmap";

const ap = getCurriculum("ap-physics-1")!;

describe("set availability", () => {
  test("a written set that is not published here is awaiting, not planned", () => {
    const set = ap.sets[0];
    expect(setAvailability(set, null)).toBe("awaiting");
    expect(setAvailability(set, { id: "a" })).toBe("ready");
    expect(setAvailability({ ...set, draftIds: [] }, null)).toBe("planned");
    expect(AVAILABILITY_LABEL.awaiting).toBe("Not published yet");
  });

  test("with nothing published (a project that has no sets yet) every set is awaiting", () => {
    const road = deriveRoadmap("ap-physics-1", [], []);
    const all = road.flatMap((u) => u.sets);
    expect(all).toHaveLength(32);
    expect(all.every((s) => s.availability === "awaiting")).toBe(true);
    const one = deriveRoadmap(
      "ap-physics-1",
      [{ id: "x", curriculumSetKey: "1A", questionCount: 5 }],
      [],
    );
    expect(one[0].sets.map((s) => s.availability)).toEqual([
      "ready",
      "awaiting",
      "awaiting",
      "awaiting",
    ]);
  });
});
