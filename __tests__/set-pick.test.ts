// Which problems a class gets for a chosen set size (src/lib/set-pick.ts).
import { pickSetIndexes, pickSetProblems } from "../src/lib/set-pick";
import { CURRICULA } from "../src/data/curricula";
import { CONTENT_FILES } from "../src/data/curricula/content-files";
import { courseContent, describeWithContent } from "../tests/helpers/course-content";

describe("pickSetIndexes", () => {
  const grouped = ["1.1", "1.1", "1.2", "1.2", "1.2"];

  test("the usual size and larger are the first problems, in order", () => {
    expect(pickSetIndexes(grouped, 5)).toEqual([0, 1, 2, 3, 4]);
    const pool = [...grouped, "1.1", "1.2", "1.1", "1.2", "1.1"];
    expect(pickSetIndexes(pool, 5)).toEqual([0, 1, 2, 3, 4]);
    expect(pickSetIndexes(pool, 8)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(pickSetIndexes(pool, 10)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  test("a short set takes turns between topics and keeps the written order", () => {
    expect(pickSetIndexes(grouped, 3)).toEqual([0, 1, 2]);
    expect(pickSetIndexes(grouped, 4)).toEqual([0, 1, 2, 3]);
    // Three topics, the last one only at the end: the first three alone would miss it.
    expect(pickSetIndexes(["2.1", "2.1", "2.2", "2.2", "2.3"], 3)).toEqual([0, 2, 4]);
    expect(pickSetIndexes(["2.1", "2.1", "2.2", "2.2", "2.3"], 4)).toEqual([0, 1, 2, 4]);
  });

  test("a short set never draws on problems past the usual five", () => {
    expect(pickSetIndexes(["3.1", "3.1", "3.1", "3.1", "3.1", "3.2"], 3)).toEqual([0, 1, 2]);
  });

  test("never more than the pool, never fewer than nothing, same answer every time", () => {
    expect(pickSetIndexes(grouped, 9)).toEqual([0, 1, 2, 3, 4]);
    expect(pickSetIndexes(grouped, 0)).toEqual([]);
    expect(pickSetIndexes([], 5)).toEqual([]);
    expect(pickSetIndexes(grouped, 3)).toEqual(pickSetIndexes(grouped, 3));
  });

  test("problems without a topic are treated as one topic", () => {
    expect(pickSetProblems([{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }], 3)).toEqual([
      { id: "a" },
      { id: "b" },
      { id: "c" },
    ]);
  });
});

describeWithContent("every written set, at every size", () => {
  const drafts = new Map<string, { problem?: { apTopic?: string } }>();
  for (const file of Object.values(CONTENT_FILES).flat())
    for (const d of courseContent(file).drafts) drafts.set(d.id, d);
  for (const curriculum of CURRICULA) {
    for (const set of curriculum.sets.filter((s) => s.draftIds.length)) {
      test(`${curriculum.id} ${set.key}: a set of 3 or more covers its topics when it can`, () => {
        const topics = set.draftIds.map((id) => drafts.get(id)?.problem?.apTopic as string);
        const all = new Set(topics.slice(0, 5));
        for (let count = 3; count <= set.draftIds.length; count++) {
          const got = new Set(pickSetIndexes(topics, count).map((i) => topics[i]));
          if (count >= all.size) expect([...got].sort()).toEqual([...all].sort());
        }
      });
    }
  }
});
