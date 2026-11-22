import {
  BASE_ASSIGNMENT_DEFAULTS,
  parseAssignmentDefaults,
  parseProblemsPerSet,
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
  it("a remembered number of problems is not a setting", () => {
    // Alone it leaves the class without settings, so copies keep the source's own.
    expect(parseAssignmentDefaults({ problemsPerSet: 8 })).toBeNull();
    expect(resolveAssignmentDefaults({ problemsPerSet: 8 })).toBe(BASE_ASSIGNMENT_DEFAULTS);
    // Beside real settings it is left out of them.
    expect(parseAssignmentDefaults({ lockdownMode: true, problemsPerSet: 8 })).toEqual({
      ...BASE_ASSIGNMENT_DEFAULTS,
      lockdownMode: true,
    });
    expect(parseProblemsPerSet({ problemsPerSet: 8 })).toBe(8);
    expect(parseProblemsPerSet({ lockdownMode: true, problemsPerSet: 3 })).toBe(3);
    for (const v of [undefined, null, "x", [], {}, { problemsPerSet: 2 }, { problemsPerSet: 11 }])
      expect(parseProblemsPerSet(v)).toBeNull();
    expect(parseProblemsPerSet({ problemsPerSet: 4.5 })).toBeNull();
    expect(parseProblemsPerSet({ problemsPerSet: "5" })).toBeNull();
  });
  it("resolves to the base when absent", () => {
    expect(resolveAssignmentDefaults(undefined)).toBe(BASE_ASSIGNMENT_DEFAULTS);
  });
});
