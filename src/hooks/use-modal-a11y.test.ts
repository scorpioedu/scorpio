import { wrapFocusTarget } from "./use-modal-a11y";

describe("wrapFocusTarget", () => {
  const panel = { id: "panel" };
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("wraps Tab from the last element to the first", () => {
    expect(wrapFocusTarget(items, items[2], false, panel)).toBe(items[0]);
  });

  it("wraps Shift+Tab from the first element to the last", () => {
    expect(wrapFocusTarget(items, items[0], true, panel)).toBe(items[2]);
  });

  it("wraps Shift+Tab from the panel itself to the last element", () => {
    expect(wrapFocusTarget(items, panel, true, panel)).toBe(items[2]);
  });

  it("leaves Tab in the middle to the browser", () => {
    expect(wrapFocusTarget(items, items[1], false, panel)).toBeNull();
  });

  it("returns null when nothing is focusable", () => {
    expect(wrapFocusTarget([], panel, false, panel)).toBeNull();
  });
});
