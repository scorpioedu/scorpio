import { chunk, distinctIds, summarizeSubmissionCounts, unionCount } from "./count-math";

type Sub = { status?: string; graded?: boolean };

// The dashboard's old client-side maths, used as the oracle.
function legacy(subs: Sub[]) {
  const submitted = subs.filter((s) => s.status !== "draft");
  const pending = submitted.filter((s) => !s.graded);
  return { completedSubmissions: submitted.length - pending.length, pendingSubmissions: pending.length };
}
function partsOf(subs: Sub[]) {
  return {
    total: subs.length,
    drafts: subs.filter((s) => s.status === "draft").length,
    graded: subs.filter((s) => s.graded === true).length,
    gradedDrafts: subs.filter((s) => s.graded === true && s.status === "draft").length,
  };
}

describe("summarizeSubmissionCounts", () => {
  const subs: Sub[] = [
    { graded: true },
    { graded: true, status: "graded" },
    { graded: false, status: "submitted" },
    {}, // legacy doc: no graded, no status -> pending
    { status: "draft" },
    { status: "draft", graded: true },
    { status: "pending_review", graded: false },
  ];

  it("matches the old filter-everything result for mixed data", () => {
    expect(summarizeSubmissionCounts([partsOf(subs)])).toEqual(legacy(subs));
  });

  it("sums across chunks", () => {
    const a = subs.slice(0, 3);
    const b = subs.slice(3);
    expect(summarizeSubmissionCounts([partsOf(a), partsOf(b)])).toEqual(legacy(subs));
  });

  it("is zero for no chunks", () => {
    expect(summarizeSubmissionCounts([])).toEqual({ completedSubmissions: 0, pendingSubmissions: 0 });
  });
});

describe("unionCount", () => {
  it("de-duplicates overlap", () => {
    const a = new Set(["1", "2", "3"]);
    const b = new Set(["3", "4"]);
    const both = [...a].filter((x) => b.has(x)).length;
    expect(unionCount(a.size, b.size, both)).toBe(new Set([...a, ...b]).size);
  });
});

describe("chunk", () => {
  it("splits into groups of at most 30 by default", () => {
    const sizes = chunk(Array.from({ length: 65 }, (_, i) => i)).map((c) => c.length);
    expect(sizes).toEqual([30, 30, 5]);
  });
  it("returns no chunks for empty input", () => expect(chunk([])).toEqual([]));
  it("rejects a non-positive size", () => expect(() => chunk([1], 0)).toThrow(/positive integer/));
});

describe("distinctIds", () => {
  it("drops empties and duplicates", () => expect(distinctIds(["a", "", undefined, null, "b", "a"])).toEqual(["a", "b"]));
});
