import {
  approvedRequest,
  firstName,
  newEnrollment,
  newResult,
  signupLink,
} from "../functions/src/teacher-email-rules";

describe("approvedRequest", () => {
  const approved = {
    status: "approved",
    email: "t@school.test",
    name: "Dana Rivera",
    generatedCode: "SCORP-AAAA-BBBB",
  };
  it("fires when a pending request becomes approved", () => {
    expect(approvedRequest({ status: "pending" }, approved)).toEqual({
      email: "t@school.test",
      name: "Dana Rivera",
      code: "SCORP-AAAA-BBBB",
    });
  });
  it("ignores later edits to an approved request, rejections, and requests with no code or email", () => {
    expect(approvedRequest(approved, { ...approved, approvalEmailSentAt: new Date() })).toBeNull();
    expect(
      approvedRequest({ status: "pending" }, { status: "rejected", email: "t@school.test" }),
    ).toBeNull();
    expect(approvedRequest({ status: "pending" }, { ...approved, generatedCode: "" })).toBeNull();
    expect(approvedRequest({ status: "pending" }, { ...approved, email: undefined })).toBeNull();
  });
});

describe("newEnrollment", () => {
  it("fires for a new student doc with a teacher, and for joining or switching later", () => {
    expect(newEnrollment(undefined, { teacherId: "t1", courseId: "c1" })).toEqual({
      teacherId: "t1",
      courseId: "c1",
    });
    expect(newEnrollment({ teacherId: null }, { teacherId: "t1", courseId: "c1" })).toEqual({
      teacherId: "t1",
      courseId: "c1",
    });
    expect(
      newEnrollment({ teacherId: "t9", courseId: "c9" }, { teacherId: "t1", courseId: "c1" })
        ?.teacherId,
    ).toBe("t1");
  });
  it("ignores students with no class, leaving, and writes that change nothing about enrollment", () => {
    expect(newEnrollment(undefined, { teacherId: null })).toBeNull();
    expect(
      newEnrollment({ teacherId: "t1", courseId: "c1" }, { teacherId: null, courseId: null }),
    ).toBeNull();
    expect(
      newEnrollment(
        { teacherId: "t1", courseId: "c1" },
        { teacherId: "t1", courseId: "c1", name: "Sam" },
      ),
    ).toBeNull();
    expect(newEnrollment(undefined, undefined)).toBeNull();
  });
});

describe("newResult", () => {
  it("fires when work becomes graded or is set aside for review", () => {
    expect(newResult({ status: "submitted" }, { status: "graded", teacherId: "t1" })).toEqual({
      teacherId: "t1",
      needsReview: false,
    });
    expect(
      newResult({ status: "submitted" }, { status: "pending_review", teacherId: "t1" }),
    ).toEqual({ teacherId: "t1", needsReview: true });
  });
  it("ignores drafts, work still being graded, regrades, and submissions with no teacher", () => {
    expect(newResult({ status: "draft" }, { status: "submitted", teacherId: "t1" })).toBeNull();
    expect(
      newResult({ status: "graded" }, { status: "graded", teacherId: "t1", score: 90 }),
    ).toBeNull();
    expect(
      newResult({ status: "pending_review" }, { status: "graded", teacherId: "t1" }),
    ).toBeNull();
    expect(newResult({ status: "submitted" }, { status: "graded" })).toBeNull();
  });
});

test("firstName and signupLink", () => {
  expect(firstName("Dana Rivera")).toBe("Dana");
  expect(firstName("  ")).toBe("");
  expect(firstName(undefined)).toBe("");
  expect(signupLink("SCORP-AAAA-BBBB")).toBe(
    "https://scorpioedu.org/signup?teacherInvite=SCORP-AAAA-BBBB",
  );
});
