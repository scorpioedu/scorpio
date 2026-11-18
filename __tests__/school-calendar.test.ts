// Holiday-aware due dates (src/lib/school-calendar.ts, src/lib/first-run.ts).
import {
  classCalendar,
  dayOffOn,
  defaultCalendar,
  defaultDaysOff,
  formatDayOff,
  parseDaysOff,
  schoolDays,
  schoolYearOf,
  MAX_DAYS_OFF,
} from "../src/lib/school-calendar";
import {
  addSchoolDays,
  nextSchoolDay,
  previousSchoolDay,
  scheduleDueDates,
  toDateInput,
} from "../src/lib/first-run";
import { planAssignments } from "../src/lib/assign-sets";

const day = (s: string) => new Date(`${s}T12:00:00`);
const cal2026 = defaultDaysOff(2026);
const isDay = schoolDays(cal2026);

describe("default US calendar", () => {
  test("2026-27: the holidays land on the right dates", () => {
    const byLabel = Object.fromEntries(cal2026.map((d) => [d.label, d]));
    expect(byLabel["Labor Day"].start).toBe("2026-09-07");
    expect(byLabel["Indigenous Peoples' Day"].start).toBe("2026-10-12");
    expect(byLabel["Veterans Day"].start).toBe("2026-11-11");
    expect(byLabel["Thanksgiving break"]).toMatchObject({ start: "2026-11-26", end: "2026-11-27" });
    expect(byLabel["Winter break"]).toMatchObject({ start: "2026-12-19", end: "2027-01-04" });
    expect(byLabel["Martin Luther King Jr. Day"].start).toBe("2027-01-18");
    expect(byLabel["Presidents' Day"].start).toBe("2027-02-15");
    expect(byLabel["Memorial Day"].start).toBe("2027-05-31");
    expect(byLabel["Juneteenth"].start).toBe("2027-06-19");
  });

  test("school year runs August to July; the default covers this year and the next", () => {
    expect(schoolYearOf(day("2026-11-16"))).toBe(2026);
    expect(schoolYearOf(day("2027-03-01"))).toBe(2026);
    expect(schoolYearOf(day("2027-08-01"))).toBe(2027);
    const cal = defaultCalendar(day("2027-03-01"));
    expect(cal.some((d) => d.start === "2026-12-19")).toBe(true);
    expect(cal.some((d) => d.start === "2027-12-19")).toBe(true);
  });

  test("Thanksgiving 2029 (a month starting on Thursday) and a February end", () => {
    expect(defaultDaysOff(2029).find((d) => d.label === "Thanksgiving break")).toMatchObject({
      start: "2029-11-22",
      end: "2029-11-23",
    });
    expect(defaultDaysOff(2027).find((d) => d.label === "Memorial Day")?.start).toBe("2028-05-29");
  });
});

describe("school days", () => {
  test("weekends, holidays and winter break are not school days", () => {
    expect(isDay(day("2026-11-25"))).toBe(true);
    expect(isDay(day("2026-11-26"))).toBe(false);
    expect(isDay(day("2026-11-28"))).toBe(false); // Saturday
    expect(isDay(day("2026-12-18"))).toBe(true);
    expect(isDay(day("2026-12-21"))).toBe(false);
    expect(isDay(day("2027-01-04"))).toBe(false);
    expect(isDay(day("2027-01-05"))).toBe(true);
    expect(dayOffOn(day("2026-12-25"), cal2026)?.label).toBe("Winter break");
    expect(dayOffOn(day("2026-12-18"), cal2026)).toBeUndefined();
  });

  test("due dates step over Thanksgiving and winter break", () => {
    // Mon 23 Nov, every 2 school days: Mon 23, Wed 25, (Thu/Fri off) Tue 1 Dec.
    expect(scheduleDueDates(day("2026-11-23"), 3, 2, isDay).map(toDateInput)).toEqual([
      "2026-11-23",
      "2026-11-25",
      "2026-12-01",
    ]);
    // Thu 17 Dec, every school day: Thu 17, Fri 18, then Tue 5 Jan.
    expect(scheduleDueDates(day("2026-12-17"), 3, 1, isDay).map(toDateInput)).toEqual([
      "2026-12-17",
      "2026-12-18",
      "2027-01-05",
    ]);
    // A start inside the break moves to the first day back.
    expect(toDateInput(nextSchoolDay(day("2026-12-24"), isDay))).toBe("2027-01-05");
    expect(toDateInput(previousSchoolDay(day("2026-12-24"), isDay))).toBe("2026-12-18");
    expect(scheduleDueDates(day("2026-12-24"), 1, 2, isDay)[0].getHours()).toBe(23);
  });

  test("without a calendar only weekends are skipped, as before", () => {
    expect(scheduleDueDates(day("2026-11-25"), 2, 1).map(toDateInput)).toEqual([
      "2026-11-25",
      "2026-11-26",
    ]);
  });

  test("moving back by school days; zero stays put", () => {
    expect(toDateInput(addSchoolDays(day("2027-01-05"), -1, isDay))).toBe("2026-12-18");
    expect(toDateInput(addSchoolDays(day("2026-11-30"), -2, isDay))).toBe("2026-11-24");
    expect(toDateInput(addSchoolDays(day("2026-11-30"), 0, isDay))).toBe("2026-11-30");
  });

  test("a calendar with no school days at all does not hang", () => {
    const never = () => false;
    expect(addSchoolDays(day("2026-11-30"), 3, never)).toBeInstanceOf(Date);
    expect(nextSchoolDay(day("2026-11-30"), never)).toBeInstanceOf(Date);
  });

  test("planAssignments passes the calendar through", () => {
    const sets = ["4A", "4B"].map((key) => ({ sourceId: key, key, title: key }));
    expect(
      planAssignments(sets, new Set(), day("2026-11-25"), 1, isDay).map((p) => toDateInput(p.due)),
    ).toEqual(["2026-11-25", "2026-11-30"]);
  });
});

describe("a class's own list", () => {
  test("valid lists are sorted and trimmed; an empty list means weekends only", () => {
    const r = parseDaysOff([
      { start: "2027-03-22", end: "2027-03-26", label: "  Spring break  " },
      { start: "2026-10-09", end: "2026-10-09", label: "" },
    ]);
    expect(r).toEqual({
      ok: true,
      daysOff: [
        { start: "2026-10-09", end: "2026-10-09", label: "Day off" },
        { start: "2027-03-22", end: "2027-03-26", label: "Spring break" },
      ],
    });
    expect(parseDaysOff([])).toEqual({ ok: true, daysOff: [] });
    expect(schoolDays(classCalendar([], day("2026-11-16")))(day("2026-11-26"))).toBe(true);
  });

  test("bad lists are refused with a reason", () => {
    const bad = (v: unknown) => {
      const r = parseDaysOff(v);
      return r.ok ? "" : r.error;
    };
    expect(bad("x")).toMatch(/list/);
    expect(bad([{ start: "2027-02-30", end: "2027-03-01", label: "a" }])).toMatch(/valid start/);
    expect(bad([{ start: "2027-03-02", end: "2027-03-01", label: "a" }])).toMatch(
      /before it starts/,
    );
    expect(bad([{ start: "2027-01-01", end: "2027-09-01", label: "a" }])).toMatch(/at most/);
    expect(bad([null])).toMatch(/valid start/);
    expect(
      bad(
        Array.from({ length: MAX_DAYS_OFF + 1 }, () => ({
          start: "2027-01-01",
          end: "2027-01-01",
        })),
      ),
    ).toMatch(/Keep the list/);
  });

  test("no stored list, or a broken one, falls back to the defaults", () => {
    const now = day("2026-11-16");
    expect(classCalendar(undefined, now)).toEqual(defaultCalendar(now));
    expect(classCalendar(null, now)).toEqual(defaultCalendar(now));
    expect(classCalendar([{ start: "nope" }], now)).toEqual(defaultCalendar(now));
    expect(
      classCalendar([{ start: "2027-03-22", end: "2027-03-26", label: "Spring break" }], now),
    ).toHaveLength(1);
  });

  test("rows read as a day or a range", () => {
    expect(formatDayOff({ start: "2026-11-11", end: "2026-11-11", label: "x" }, "en-US")).toBe(
      "Wed, Nov 11, 2026",
    );
    expect(formatDayOff({ start: "2026-12-19", end: "2027-01-04", label: "x" }, "en-US")).toBe(
      "Sat, Dec 19, 2026 – Mon, Jan 4, 2027",
    );
  });
});
