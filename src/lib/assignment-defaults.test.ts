import {
  BASE_ASSIGNMENT_DEFAULTS,
  parseAssignmentDefaults,
  resolveAssignmentDefaults,
} from "./assignment-defaults";

describe("parseAssignmentDefaults", () => {
  it("returns null when nothing usable is stored", () => {
    for (const v of [undefined, null, "x", 3, []]) expect(parseAssignmentDefaults(v)).toBeNull();
  });
  it("keeps well-typed fields and fills the rest from the base", () => {
    expect(
      parseAssignmentDefaults({ timeLimit: 45, lockdownMode: true, gradingType: "manual" }),
    ).toEqual({
      ...BASE_ASSIGNMENT_DEFAULTS,
      timeLimit: 45,
      lockdownMode: true,
      gradingType: "manual",
    });
  });
  it("rejects bad values", () => {
    const parsed = parseAssignmentDefaults({
      timeLimit: -5,
      gradingType: "x",
      allowCalculator: "yes",
    });
    expect(parsed).toEqual(BASE_ASSIGNMENT_DEFAULTS);
    expect(parseAssignmentDefaults({ timeLimit: 99999 })?.timeLimit).toBe(600);
  });
  it("resolves to the base when absent", () => {
    expect(resolveAssignmentDefaults(undefined)).toBe(BASE_ASSIGNMENT_DEFAULTS);
  });
});
