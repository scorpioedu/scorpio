import { setupSteps } from "../src/components/teacher/setup-checklist";

describe("setupSteps", () => {
  it("starts at creating a class", () => {
    const s = setupSteps({ hasClass: false, hasAssignment: false, students: 0, submissions: 0 });
    expect(s.next).toBe("class");
    expect(s.completed).toBe(0);
  });
  it("is not finished by an assignment alone: students still have to join and turn work in", () => {
    expect(
      setupSteps({ hasClass: true, hasAssignment: true, students: 0, submissions: 0 }).next,
    ).toBe("invite");
    expect(
      setupSteps({ hasClass: true, hasAssignment: true, students: 3, submissions: 0 }).next,
    ).toBe("results");
  });
  it("points at the earliest unfinished step even when later ones are done", () => {
    const s = setupSteps({ hasClass: true, hasAssignment: false, students: 2, submissions: 0 });
    expect(s.next).toBe("assign");
    expect(s.completed).toBe(2);
  });
  it("is done once work has been turned in", () => {
    const s = setupSteps({ hasClass: true, hasAssignment: true, students: 3, submissions: 1 });
    expect(s.next).toBeNull();
    expect(s.completed).toBe(4);
  });
});
