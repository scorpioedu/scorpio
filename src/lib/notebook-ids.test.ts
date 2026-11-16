import { defaultNotebookId } from "./notebook-ids";

describe("defaultNotebookId", () => {
  it("is stable for the same user", () => {
    expect(defaultNotebookId("abc")).toBe(defaultNotebookId("abc"));
  });

  it("differs between users and never equals the uid (rules forbid ids that are user docs)", () => {
    expect(defaultNotebookId("a")).not.toBe(defaultNotebookId("b"));
    expect(defaultNotebookId("a")).not.toBe("a");
  });
});
