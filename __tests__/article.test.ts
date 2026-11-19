import { article, withArticle } from "../src/lib/article";

describe("article", () => {
  it.each([
    ["AP Physics 1", "an"],
    ["AP Physics 2", "an"],
    ["AP Physics C: Mechanics", "an"],
    ["Physics Honors", "a"],
    ["Honors Physics", "an"],
    ["IB Physics", "an"],
    ["SAT prep", "an"],
    ["Conceptual Physics", "a"],
    ["Introductory course", "an"],
    ["Unit 4", "a"],
    ["8th grade science", "an"],
    ["", "a"],
  ])("%s takes %s", (phrase, want) => {
    expect(article(phrase)).toBe(want);
  });

  it("builds the phrase", () => {
    expect(withArticle("AP Physics 1")).toBe("an AP Physics 1");
  });
});
