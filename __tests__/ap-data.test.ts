import physics1 from "../src/data/ap/physics1.json";
import {
  AP_UNITS,
  apTopic,
  apTopicLabel,
  apUnitLabel,
  compareTopicIds,
  isApTopicId,
  normaliseApTags,
} from "../src/data/ap";

describe("AP Physics 1 topic list", () => {
  test("8 units, numbered 1..8, each with topics numbered n.1, n.2, …", () => {
    expect(AP_UNITS.map((u) => u.unit)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    for (const u of AP_UNITS) {
      expect(u.title.length).toBeGreaterThan(3);
      expect(u.topics.length).toBeGreaterThanOrEqual(4);
      u.topics.forEach((t, i) => {
        expect(t.id).toBe(`${u.unit}.${i + 1}`);
        expect(t.title.length).toBeGreaterThan(3);
        expect(t.summary.length).toBeGreaterThan(20);
      });
    }
    expect(physics1.note).toMatch(/own words/);
  });

  test("lookups and labels", () => {
    expect(apTopic("4.2")).toMatchObject({ unit: 4, title: "Change in momentum and impulse" });
    expect(isApTopicId("4.2")).toBe(true);
    expect(isApTopicId("4.9")).toBe(false);
    expect(isApTopicId(4.2)).toBe(false);
    expect(apUnitLabel(8)).toBe("Unit 8: Fluids");
    expect(apUnitLabel(12)).toBe("Unit 12");
    expect(apTopicLabel("1.5")).toBe("1.5 Vectors and motion in two dimensions");
    expect(apTopicLabel("x")).toBe("x");
    expect(["2.10", "2.9", "1.1"].sort(compareTopicIds)).toEqual(["1.1", "2.9", "2.10"]);
  });

  test("normaliseApTags", () => {
    expect(normaliseApTags({})).toEqual({ apCourse: null, apUnit: null, apTopics: [] });
    expect(normaliseApTags({ apUnit: 3, apTopics: ["3.4", "3.1", "1.1", "bad", "3.4"] })).toEqual({
      apCourse: "physics-1",
      apUnit: 3,
      apTopics: ["3.1", "3.4"],
    });
    expect(normaliseApTags({ apTopics: ["6.5"] })).toEqual({
      apCourse: "physics-1",
      apUnit: 6,
      apTopics: ["6.5"],
    });
    expect(normaliseApTags({ apUnit: 0, apTopics: "4.1" })).toEqual({
      apCourse: null,
      apUnit: null,
      apTopics: [],
    });
  });
});
