import { addSchoolDays, countByUnit, formatClassName, nextSchoolDay, parseDateInput, randomClassCode, scheduleDueDates, studentMessage, toDateInput } from "../src/lib/first-run";

const d = (s: string) => parseDateInput(s)!;

describe("school-day scheduling", () => {
  test("parse and format date inputs round-trip; bad input is null", () => {
    expect(toDateInput(d("2027-01-12"))).toBe("2027-01-12");
    expect(parseDateInput("12/01/2027")).toBeNull();
  });
  test("weekends move to Monday", () => {
    expect(toDateInput(nextSchoolDay(d("2027-01-09")))).toBe("2027-01-11"); // Saturday
    expect(toDateInput(nextSchoolDay(d("2027-01-12")))).toBe("2027-01-12"); // Tuesday
  });
  test("addSchoolDays skips weekends", () => {
    expect(toDateInput(addSchoolDays(d("2027-01-14"), 2))).toBe("2027-01-18"); // Thu + 2 -> Mon
  });
  test("one assignment every N school days, first on the start day, due 23:59", () => {
    const due = scheduleDueDates(d("2027-01-12"), 4, 2);
    expect(due.map(toDateInput)).toEqual(["2027-01-12", "2027-01-14", "2027-01-18", "2027-01-20"]);
    expect(due.every((x) => x.getHours() === 23 && x.getMinutes() === 59)).toBe(true);
    expect(scheduleDueDates(d("2027-01-12"), 3, 3).map(toDateInput)).toEqual(["2027-01-12", "2027-01-15", "2027-01-20"]);
    expect(scheduleDueDates(d("2027-01-12"), 0, 2)).toEqual([]);
  });
});

describe("class helpers", () => {
  test("formatClassName", () => {
    expect(formatClassName(" AP Physics 1 ", "")).toBe("AP Physics 1");
    expect(formatClassName("AP Physics 1", "3")).toBe("AP Physics 1 - Period 3");
    expect(formatClassName("AP Physics 1", "Block B")).toBe("AP Physics 1 - Block B");
  });
  test("randomClassCode is 8 characters from the unambiguous alphabet", () => {
    expect(randomClassCode()).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  });
  test("countByUnit counts only AP-tagged items", () => {
    const m = countByUnit([{ apUnit: 4, apCourse: "physics-1" }, { apUnit: 4 }, { apUnit: 1 }, { apUnit: null }, {}, { apUnit: 2, apCourse: "other" }]);
    expect([...m.entries()].sort()).toEqual([[1, 1], [4, 2]]);
  });
  test("studentMessage includes link, code and the first assignment", () => {
    const msg = studentMessage({ className: "P3", code: "ABCD2345", joinUrl: "https://x.test/join/class/ABCD2345", firstTitle: "Momentum 1", firstDue: d("2027-01-12") });
    expect(msg).toContain("https://x.test/join/class/ABCD2345");
    expect(msg).toContain("ABCD2345");
    expect(msg).toContain("Momentum 1");
    expect(studentMessage({ className: "P3", code: "C", joinUrl: "u" })).not.toContain("First assignment");
  });
});
