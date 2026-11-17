import { addDays, chooseClass, dueOnDay, dueState, sameDay } from "../src/lib/teacher-edit";

describe("teacher editing helpers", () => {
  it("keeps the previous time of day when a new day is picked", () => {
    const prev = new Date(2026, 10, 18, 8, 30);
    const next = dueOnDay(new Date(2026, 10, 21), prev);
    expect([next.getDate(), next.getHours(), next.getMinutes()]).toEqual([21, 8, 30]);
  });

  it("defaults a new due date to 23:59", () => {
    const next = dueOnDay(new Date(2026, 10, 21, 3));
    expect([next.getHours(), next.getMinutes()]).toEqual([23, 59]);
  });

  it("reads due states", () => {
    const now = new Date(2026, 10, 17, 12);
    expect(dueState(null, now)).toBe("none");
    expect(dueState(new Date(2026, 10, 16), now)).toBe("past");
    expect(dueState(new Date(2026, 10, 18), now)).toBe("soon");
    expect(dueState(new Date(2026, 10, 30), now)).toBe("later");
  });

  it("chooses the URL class, then the remembered one, then the first", () => {
    const ids = ["a", "b", "c"];
    expect(chooseClass(ids, { fromUrl: "c", remembered: "b" })).toBe("c");
    expect(chooseClass(ids, { fromUrl: "zzz", remembered: "b" })).toBe("b");
    expect(chooseClass(ids, { remembered: "gone" })).toBe("a");
    expect(chooseClass([], { fromUrl: "a" })).toBe("");
  });

  it("adds days keeping the wall-clock time", () => {
    const d = addDays(new Date(2026, 10, 28, 23, 59), 3);
    expect(sameDay(d, new Date(2026, 11, 1))).toBe(true);
    expect(d.getHours()).toBe(23);
  });
});
