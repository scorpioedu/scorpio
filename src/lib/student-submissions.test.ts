import { assignmentIdsOf, buildSubmissionRows, type AssignmentInfo, type RawSubmission } from "./student-submissions";

const sub = (id: string, data: Record<string, unknown>): RawSubmission => ({ id, data });
const assignments = new Map<string, AssignmentInfo | null>([
  ["a1", { title: "Kinematics", courseId: "c1", teacherId: "t1" }],
  ["a2", { title: "Optics", courseId: "c2", teacherId: "t1" }],
  ["gone", null],
]);

describe("assignmentIdsOf", () => {
  it("returns each assignment id once, in first-seen order", () => {
    const ids = assignmentIdsOf([sub("1", { assignmentId: "a1" }), sub("2", { assignmentId: "a2" }), sub("3", { assignmentId: "a1" }), sub("4", {})]);
    expect(ids).toEqual(["a1", "a2"]);
  });
});

describe("buildSubmissionRows", () => {
  it("shows only submissions in the student's class", () => {
    const rows = buildSubmissionRows([sub("1", { assignmentId: "a1" }), sub("2", { assignmentId: "a2" })], assignments, { courseId: "c1" });
    expect(rows.map((r) => r.id)).toEqual(["1"]);
  });

  it("falls back to the teacher when the student has no class", () => {
    const rows = buildSubmissionRows([sub("1", { assignmentId: "a1" })], assignments, { teacherId: "other" });
    expect(rows).toHaveLength(0);
    expect(buildSubmissionRows([sub("1", { assignmentId: "a1" })], assignments, { teacherId: "t1" })).toHaveLength(1);
  });

  it("drops missing assignments and drafts", () => {
    const rows = buildSubmissionRows(
      [sub("1", { assignmentId: "gone" }), sub("2", { assignmentId: "a1", status: "draft" }), sub("3", { assignmentId: "unknown" }), sub("4", { assignmentId: "a1" })],
      assignments,
      {},
    );
    expect(rows.map((r) => r.id)).toEqual(["4"]);
  });

  it("derives status, defaults and the assignment title", () => {
    const [row] = buildSubmissionRows([sub("1", { assignmentId: "a1", graded: true, score: 0 })], assignments, {});
    expect(row).toMatchObject({ assignmentTitle: "Kinematics", status: "graded", graded: true, score: 0, answers: [], feedback: "", submittedAt: null });
  });

  it("sorts newest first, converting Timestamp-like and numeric dates, undated last", () => {
    const rows = buildSubmissionRows(
      [
        sub("old", { assignmentId: "a1", submittedAt: { toDate: () => new Date(1000) } }),
        sub("none", { assignmentId: "a1" }),
        sub("new", { assignmentId: "a1", submittedAt: 5000 }),
      ],
      assignments,
      {},
    );
    expect(rows.map((r) => r.id)).toEqual(["new", "old", "none"]);
  });
});
