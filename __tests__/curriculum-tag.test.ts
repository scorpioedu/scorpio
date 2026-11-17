// tools/curriculum-tag.cjs: matching published waypoints to course sets.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  parseArgs,
  matchAssignments,
  displayTitle,
  loadCurricula,
} = require("../tools/curriculum-tag.cjs");
import { getCurriculum, displayTitle as tsDisplayTitle, setSequence } from "../src/data/curricula";

const curricula = loadCurricula();
const ap = getCurriculum("ap-physics-1")!;
const a = (id: string, contentDraftIds: unknown, extra = {}) => ({
  id,
  data: { contentDraftIds, ...extra },
});

describe("curriculum-tag tool", () => {
  test("the project is required and it is a dry run by default", () => {
    expect(() => parseArgs([])).toThrow(/--project/);
    expect(() => parseArgs(["--project"])).toThrow(/needs a value/);
    expect(() => parseArgs(["--project", "p", "--force"])).toThrow(/Unknown/);
    expect(parseArgs(["--project", "p"])).toEqual({ project: "p", apply: false });
    expect(parseArgs(["--project", "p", "--apply"]).apply).toBe(true);
  });

  test("the title matches the app's displayTitle for every set", () => {
    const c = curricula.find((x: { id: string }) => x.id === "ap-physics-1");
    for (const s of ap.sets) expect(displayTitle(c, s)).toBe(tsDisplayTitle(s));
  });

  test("matches by the same set of draft ids, in any order, and sets the fields", () => {
    const s = ap.sets.find((x) => x.key === "4B")!;
    const { updates, unmatched, conflicts } = matchAssignments(
      [
        a("w1", [...s.draftIds].reverse(), { title: "old title" }),
        a("w2", ["x", "y"]),
        a("w3", undefined),
      ],
      curricula,
    );
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      id: "w1",
      unchanged: false,
      patch: {
        curriculumId: "ap-physics-1",
        curriculumSetKey: "4B",
        curriculumSequence: setSequence("ap-physics-1", "4B"),
        title: tsDisplayTitle(s),
      },
    });
    expect(unmatched).toEqual(["w2", "w3"]);
    expect(conflicts).toEqual([]);
  });

  test("a partial overlap does not match; already tagged assignments are unchanged", () => {
    const s = ap.sets.find((x) => x.key === "4A")!;
    expect(matchAssignments([a("p", s.draftIds.slice(0, 4))], curricula).updates).toEqual([]);
    expect(matchAssignments([a("p", [...s.draftIds, "extra"])], curricula).updates).toEqual([]);
    const done = matchAssignments(
      [
        a("w", s.draftIds, {
          curriculumId: "ap-physics-1",
          curriculumSetKey: "4A",
          curriculumSequence: setSequence("ap-physics-1", "4A"),
          title: tsDisplayTitle(s),
        }),
      ],
      curricula,
    );
    expect(done.updates[0].unchanged).toBe(true);
  });

  test("two assignments for one set are reported and neither is tagged", () => {
    const s = ap.sets.find((x) => x.key === "4C")!;
    const r = matchAssignments([a("w1", s.draftIds), a("w2", s.draftIds)], curricula);
    expect(r.updates).toEqual([]);
    expect(r.conflicts).toEqual([{ key: "ap-physics-1/4C", ids: ["w1", "w2"] }]);
  });
});
