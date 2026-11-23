// Pure rules behind the student emails (functions/src/student-email-rules.ts).
import {
  assignmentLink,
  dueDayWord,
  dueLabel,
  handedIn,
  isVisibleToStudents,
  justAssigned,
  millis,
  needsReminder,
  resultsLink,
  reviewedResult,
  studentWantsEmails,
  teacherSendsStudentEmails,
} from "../functions/src/student-email-rules";

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse("2026-11-24T18:00:00Z"); // Tue 10:00 AM PST

describe("preferences", () => {
  test("teachers email students unless they turned it off", () => {
    expect(teacherSendsStudentEmails(undefined)).toBe(true);
    expect(teacherSendsStudentEmails({})).toBe(true);
    expect(teacherSendsStudentEmails({ preferences: { disableAssignmentEmails: false } })).toBe(true);
    expect(teacherSendsStudentEmails({ preferences: { disableAssignmentEmails: true } })).toBe(false);
  });

  test("students get emails unless they turned them off", () => {
    expect(studentWantsEmails({})).toBe(true);
    expect(studentWantsEmails({ preferences: { disableStudentEmails: true } })).toBe(false);
  });
});

describe("visibility", () => {
  test("hidden, pooled or ownerless assignments are not announced", () => {
    expect(isVisibleToStudents({ teacherId: "t" })).toBe(true);
    expect(isVisibleToStudents({ teacherId: "t", archivedAt: new Date() })).toBe(false);
    expect(isVisibleToStudents({ teacherId: "t", visibility: "global" })).toBe(false);
    expect(isVisibleToStudents({})).toBe(false);
    expect(isVisibleToStudents(undefined)).toBe(false);
  });

  test("justAssigned: archived -> visible, and not already announced", () => {
    const hidden = { teacherId: "t", archivedAt: new Date() };
    expect(justAssigned(hidden, { teacherId: "t", archivedAt: null })).toBe(true);
    expect(justAssigned(hidden, { teacherId: "t", archivedAt: null, emailsSentAt: new Date() })).toBe(false);
    expect(justAssigned({ teacherId: "t" }, { teacherId: "t", title: "edited" })).toBe(false);
    expect(justAssigned(hidden, hidden)).toBe(false);
  });
});

describe("dates", () => {
  test("millis reads Dates, numbers and Firestore Timestamps", () => {
    expect(millis(new Date(5))).toBe(5);
    expect(millis(7)).toBe(7);
    expect(millis({ toMillis: () => 9 })).toBe(9);
    expect(millis(null)).toBeNull();
    expect(millis("2026-01-01")).toBeNull();
  });

  test("dueLabel is in Pacific time with the zone shown", () => {
    expect(dueLabel(Date.parse("2026-11-26T07:59:00Z"))).toBe("Wed, Nov 25 at 11:59 PM PST");
  });

  test("dueDayWord follows the Pacific calendar", () => {
    expect(dueDayWord(NOW + 6 * HOUR, NOW)).toBe("today");
    expect(dueDayWord(NOW + 20 * HOUR, NOW)).toBe("tomorrow");
  });
});

describe("needsReminder", () => {
  const base = { teacherId: "t", createdAt: new Date(NOW - 3 * 24 * HOUR) };

  test("due within the next day, not yet reminded", () => {
    expect(needsReminder({ ...base, dueDate: new Date(NOW + 20 * HOUR) }, NOW)).toBe(true);
  });

  test("not too early, not too late, and only once", () => {
    expect(needsReminder({ ...base, dueDate: new Date(NOW + 30 * HOUR) }, NOW)).toBe(false);
    expect(needsReminder({ ...base, dueDate: new Date(NOW + 30 * 60 * 1000) }, NOW)).toBe(false);
    expect(needsReminder({ ...base, dueDate: new Date(NOW - HOUR) }, NOW)).toBe(false);
    expect(
      needsReminder({ ...base, dueDate: new Date(NOW + 20 * HOUR), reminderSentAt: new Date() }, NOW),
    ).toBe(false);
  });

  test("skips work with no due date or that students cannot see", () => {
    expect(needsReminder(base, NOW)).toBe(false);
    expect(
      needsReminder({ ...base, dueDate: new Date(NOW + 20 * HOUR), archivedAt: new Date() }, NOW),
    ).toBe(false);
  });

  test("stays quiet when students were told about it in the last 12 hours", () => {
    const due = new Date(NOW + 20 * HOUR);
    expect(needsReminder({ teacherId: "t", createdAt: new Date(NOW - 2 * HOUR), dueDate: due }, NOW)).toBe(false);
    expect(needsReminder({ ...base, emailsSentAt: new Date(NOW - 2 * HOUR), dueDate: due }, NOW)).toBe(false);
  });
});

describe("handedIn", () => {
  test("drafts do not count", () => {
    expect(handedIn({ status: "draft" })).toBe(false);
    expect(handedIn({ status: "submitted" })).toBe(true);
    expect(handedIn({ status: "pending_review" })).toBe(true);
    expect(handedIn({ status: "graded" })).toBe(true);
  });
});

describe("reviewedResult", () => {
  const after = {
    graded: true,
    teacherGraded: false,
    studentId: "s1",
    assignmentId: "a1",
    earnedPoints: 43,
    totalPoints: 50,
    score: 86,
  };

  test("a teacher save that grades work for the first time", () => {
    expect(reviewedResult({ graded: false, status: "pending_review" }, after)).toEqual({
      studentId: "s1",
      assignmentId: "a1",
      earned: 43,
      total: 50,
      percent: 86,
    });
  });

  test("auto-grading (no teacherGraded field) and regrades are not emailed", () => {
    const { teacherGraded: _t, ...auto } = after;
    void _t;
    expect(reviewedResult({ graded: false }, auto)).toBeNull();
    expect(reviewedResult({ graded: true }, after)).toBeNull();
    expect(reviewedResult({ graded: false }, { ...after, graded: false })).toBeNull();
  });

  test("rejects ids that are missing or contain a slash", () => {
    expect(reviewedResult({}, { ...after, studentId: "" })).toBeNull();
    expect(reviewedResult({}, { ...after, assignmentId: "a/b" })).toBeNull();
  });
});

describe("links", () => {
  test("open the assignment itself", () => {
    expect(assignmentLink("a 1")).toBe("https://scorpioedu.org/student/assignment-view?id=a+1");
    expect(resultsLink("a1")).toBe("https://scorpioedu.org/student/assignment-view?id=a1&from=grades");
  });
});
