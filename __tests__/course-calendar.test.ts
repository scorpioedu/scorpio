// The Calendar view on /teacher/courses: which day a set sits on, the month grid, and moving a due date.
import { getCurriculum } from "../src/data/curricula";
import { boardColumns, plannedDates } from "../src/lib/course-board";
import {
  addDays,
  addMonths,
  calendarItems,
  calendarSpan,
  dayOffRuns,
  monthOf,
  monthWeeks,
  moveToDay,
  sameMonth,
  unitFirstDay,
  weekOf,
  weekUnits,
} from "../src/lib/course-calendar";
import { paceCourse } from "../src/lib/course-pacing";
import type { SetProgress } from "../src/lib/course-progress";
import { defaultOrder } from "../src/lib/curriculum-plan";
import { deriveRoadmap, type ClassAssignment } from "../src/lib/curriculum-roadmap";
import { dayKey, defaultDaysOff, schoolDays } from "../src/lib/school-calendar";

const ID = "ap-physics-1";
const all = defaultOrder(ID);
const NOW = new Date("2026-11-17T12:00:00");
const at = (day: string, time = "23:59:00") => new Date(`${day}T${time}`);
const published = getCurriculum(ID)!.sets.map((s) => ({
  id: `g-${s.key}`,
  curriculumSetKey: s.key,
  questionCount: 5,
}));
const copy = (key: string, dueDate: Date | null): ClassAssignment => ({
  id: `a${key}`,
  title: key,
  curriculumId: ID,
  curriculumSetKey: key,
  dueDate,
});
const prog = (key: string, over: Partial<SetProgress> = {}): SetProgress => ({
  key,
  assignmentId: `a${key}`,
  submitted: 0,
  graded: 0,
  pending: 0,
  averageScore: null,
  overdue: 0,
  needsReview: 0,
  ...over,
});
const isSchoolDay = schoolDays(defaultDaysOff(2026));

function calendar(copies: ClassAssignment[], progress: SetProgress[], skipped: string[] = []) {
  const roadmap = deriveRoadmap(ID, published, copies, { order: all, skipped });
  const columns = boardColumns(
    roadmap,
    Object.fromEntries(progress.map((p) => [p.key, p])),
    13,
    NOW,
  );
  const pacing = paceCourse(roadmap, { start: at("2026-11-24"), spacing: 2, isSchoolDay });
  return calendarItems(columns, plannedDates(pacing));
}

describe("sets on days", () => {
  const items = calendar(
    [
      copy("1A", at("2026-11-10")),
      copy("1B", at("2026-11-12")),
      copy("1C", at("2026-11-20")),
      copy("1D", null),
      copy("2A", at("2026-11-20", "08:00:00")),
    ],
    [
      prog("1A", { submitted: 13 }),
      prog("1B", { submitted: 13, pending: 2 }),
      prog("1C", { submitted: 3 }),
      prog("1D"),
      prog("2A"),
    ],
    ["2B"],
  );

  test("an assigned set sits on its due date with the board's status", () => {
    expect(items.byDay.get("2026-11-10")).toMatchObject([{ key: "1A", status: "done" }]);
    expect(items.byDay.get("2026-11-12")).toMatchObject([{ key: "1B", status: "needsYou" }]);
  });

  test("a day's sets come earliest due time first", () => {
    expect(items.byDay.get("2026-11-20")!.map((i) => i.key)).toEqual(["2A", "1C"]);
  });

  test("sets still to come sit where the pacing guide puts them", () => {
    // 2B is skipped, so 2C is the first planned set: one step after the latest real due date.
    const planned = [...items.byDay.values()].flat().filter((i) => i.status === "planned");
    expect(planned[0].key).toBe("2C");
    expect(planned.every((i) => isSchoolDay(i.due))).toBe(true);
    expect(planned.every((i) => i.due.getTime() > at("2026-11-20").getTime())).toBe(true);
    expect(planned.map((i) => i.key)).not.toContain("2B");
    expect(planned).toHaveLength(all.length - 6);
  });

  test("an assigned set with no due date is listed apart", () => {
    expect(items.undated).toMatchObject([{ key: "1D", status: "assigned" }]);
    expect([...items.byDay.values()].flat().map((i) => i.key)).not.toContain("1D");
  });

  test("the span runs from the first month with a set to the last", () => {
    const span = calendarSpan(items)!;
    expect(span.first).toEqual({ year: 2026, month: 10 });
    expect(span.last.year).toBe(2027);
    expect(calendarSpan({ byDay: new Map(), undated: [] })).toBeNull();
  });
});

describe("the month grid", () => {
  test("weeks start on Sunday and cover the whole month", () => {
    const weeks = monthWeeks({ year: 2026, month: 10 }); // November 2026 starts on a Sunday
    expect(weeks).toHaveLength(5);
    expect(dayKey(weeks[0][0])).toBe("2026-11-01");
    expect(dayKey(weeks[4][6])).toBe("2026-12-05");
    expect(weeks.every((w) => w.length === 7 && w[0].getDay() === 0)).toBe(true);
  });

  test("a month that starts late in the week borrows the days before it", () => {
    const weeks = monthWeeks({ year: 2026, month: 7 }); // August 2026 starts on a Saturday
    expect(dayKey(weeks[0][0])).toBe("2026-07-26");
    expect(dayKey(weeks[0][6])).toBe("2026-08-01");
    expect(weeks).toHaveLength(6);
    expect(dayKey(weeks[5][1])).toBe("2026-08-31");
  });

  test("a four-week February", () => {
    const weeks = monthWeeks({ year: 2026, month: 1 }); // 1 Feb 2026 is a Sunday, 28 days
    expect(weeks).toHaveLength(4);
    expect(dayKey(weeks[3][6])).toBe("2026-02-28");
  });

  test("months step across years", () => {
    expect(addMonths({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    expect(addMonths({ year: 2027, month: 0 }, -1)).toEqual({ year: 2026, month: 11 });
    expect(addMonths({ year: 2026, month: 10 }, 0)).toEqual(monthOf(NOW));
    expect(sameMonth(monthOf(NOW), { year: 2026, month: 10 })).toBe(true);
    expect(sameMonth(monthOf(NOW), { year: 2027, month: 10 })).toBe(false);
  });
});

describe("moving a due date by dropping on a day", () => {
  const items = calendar([copy("1A", at("2026-11-20", "08:30:00"))], [prog("1A")]);
  const assigned = items.byDay.get("2026-11-20")![0];
  const planned = [...items.byDay.values()].flat().find((i) => i.status === "planned")!;
  const noon = (day: string) => at(day, "12:00:00");

  test("the date moves and keeps its time of day", () => {
    const move = moveToDay(assigned, noon("2026-11-24"), isSchoolDay);
    expect(move).toEqual({ ok: true, due: at("2026-11-24", "08:30:00") });
  });

  test("the same day, a weekend and a holiday are refused", () => {
    expect(moveToDay(assigned, noon("2026-11-20"), isSchoolDay)).toEqual({
      ok: false,
      reason: "same",
    });
    expect(moveToDay(assigned, noon("2026-11-21"), isSchoolDay)).toEqual({
      ok: false,
      reason: "off",
    });
    // Thanksgiving
    expect(moveToDay(assigned, noon("2026-11-26"), isSchoolDay)).toEqual({
      ok: false,
      reason: "off",
    });
  });

  test("a planned set cannot be moved: its date comes from the pacing guide", () => {
    expect(moveToDay(planned, noon("2026-12-01"), isSchoolDay)).toEqual({
      ok: false,
      reason: "planned",
    });
  });
});

describe("weeks, units and days off", () => {
  const items = calendar(
    [copy("1C", at("2026-11-10")), copy("1D", at("2026-11-12")), copy("2A", at("2026-11-13"))],
    [],
    all.filter((k) => !["1C", "1D", "2A", "2B"].includes(k)),
  );

  test("a week is Sunday to Saturday at noon", () => {
    const week = weekOf(at("2026-11-18", "08:00:00"));
    expect(week.map(dayKey)).toEqual([
      "2026-11-15",
      "2026-11-16",
      "2026-11-17",
      "2026-11-18",
      "2026-11-19",
      "2026-11-20",
      "2026-11-21",
    ]);
    expect(week.every((d) => d.getHours() === 12)).toBe(true);
    expect(dayKey(addDays(week[0], -7))).toBe("2026-11-08");
  });

  test("a week belongs to the units of its sets; an empty week to the unit that comes next", () => {
    // 2B is planned for Tue 24 Nov, so the week of 15 Nov has nothing on it.
    expect(items.byDay.get("2026-11-24")).toMatchObject([{ key: "2B", status: "planned" }]);
    const weeks = monthWeeks({ year: 2026, month: 10 });
    expect(weekUnits(weeks, items)).toEqual([[], [1, 2], [2], [2], []]);
    // With the school calendar, a week that is all break belongs to no unit.
    const later = calendar([copy("1A", at("2026-12-15")), copy("1B", at("2027-01-12"))], []);
    const december = monthWeeks({ year: 2026, month: 11 });
    expect(weekUnits(december, later)).toEqual([[], [], [1], [1], [1]]);
    expect(weekUnits(december, later, isSchoolDay)).toEqual([[], [], [1], [], []]);
  });

  test("the first day of a unit, for jumping to it", () => {
    expect(dayKey(unitFirstDay(items, 1)!)).toBe("2026-11-10");
    expect(dayKey(unitFirstDay(items, 2)!)).toBe("2026-11-13");
    expect(unitFirstDay(items, 7)).toBeNull();
  });

  test("days off side by side are one run; a break covers the weekend too", () => {
    const daysOff = defaultDaysOff(2026);
    expect(dayOffRuns(weekOf(at("2026-11-26")), daysOff)).toEqual([
      { from: 4, to: 5, label: "Thanksgiving break" },
    ]);
    expect(dayOffRuns(weekOf(at("2026-11-11")), daysOff)).toEqual([
      { from: 3, to: 3, label: "Veterans Day" },
    ]);
    expect(dayOffRuns(weekOf(at("2026-12-23")), daysOff)).toEqual([
      { from: 0, to: 6, label: "Winter break" },
    ]);
    // Winter break starts on Saturday 19 December.
    expect(dayOffRuns(weekOf(at("2026-12-16")), daysOff)).toEqual([
      { from: 6, to: 6, label: "Winter break" },
    ]);
    expect(dayOffRuns(weekOf(at("2026-11-18")), daysOff)).toEqual([]);
  });
});
