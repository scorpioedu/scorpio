// Triggers in functions/src/student-emails.ts against an in-memory Firestore: due reminders,
// announcing a hidden copy when it is assigned, and results after a teacher review.
// firebase-admin and the email sender are mocked; nothing touches Firestore or Resend.

type Doc = Record<string, unknown>;
const db: Record<string, Record<string, Doc>> = {};

jest.mock(require.resolve("../functions/node_modules/firebase-admin"), () => {
  const ref = (collection: string, id: string) => ({
    id,
    path: `${collection}/${id}`,
    get: async () => ({ exists: Boolean(db[collection]?.[id]), data: () => db[collection]?.[id] }),
  });
  type Filter = [string, string, unknown];
  const matches = (doc: Doc, [field, op, value]: Filter) => {
    const v = doc[field];
    if (op === "==") return v === value;
    const t = (x: unknown) => (x instanceof Date ? x.getTime() : (x as number));
    if (v == null) return false;
    if (op === ">") return t(v) > t(value);
    if (op === "<=") return t(v) <= t(value);
    return false;
  };
  const firestore = () => ({
    collection: (name: string) => {
      const query = (filters: Filter[]) => ({
        where: (f: string, op: string, v: unknown) => query([...filters, [f, op, v]]),
        select: () => query(filters),
        get: async () => ({
          docs: Object.entries(db[name] ?? {})
            .filter(([, d]) => filters.every((f) => matches(d, f)))
            .map(([id, d]) => ({ id, ref: ref(name, id), data: () => d })),
        }),
      });
      return { doc: (id: string) => ref(name, id), ...query([]) };
    },
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        get: async (r: { path: string }) => {
          const [c, id] = r.path.split("/");
          return { exists: Boolean(db[c]?.[id]), data: () => db[c]?.[id] };
        },
        update: (r: { path: string }, data: Doc) => {
          const [c, id] = r.path.split("/");
          db[c][id] = { ...db[c][id], ...data };
        },
      }),
  });
  return { initializeApp: jest.fn(), firestore, storage: jest.fn() };
});
jest.mock(
  require.resolve("../functions/node_modules/firebase-functions/lib/logger/index.js"),
  () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
);
const sendEmail = jest.fn(async (args: { to: string; subject: string; tag?: string; react: { props: Doc } }) => {
  void args;
});
jest.mock("../functions/src/lib/email", () => ({
  sendEmail: (args: never) => sendEmail(args),
}));

import * as admin from "../functions/node_modules/firebase-admin";
import * as student from "../functions/src/student-emails";

type Runnable = { run: (event: unknown) => Promise<unknown> };
const HOUR = 60 * 60 * 1000;
const NOW = new Date("2026-11-24T18:00:00Z");
const to = () => sendEmail.mock.calls.map((c) => c[0].to).sort();

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  Object.assign(db, {
    users: {
      t1: { role: "teacher", displayName: "Ms. Rivera", email: "rivera@school.test" },
      s1: { role: "student", teacherId: "t1", courseId: "c1", email: "s1@x.test", displayName: "Maya Lee" },
      s2: { role: "student", teacherId: "t1", courseId: "c1", email: "s2@x.test" },
      s3: { role: "student", teacherId: "t1", courseId: "c2", email: "s3@x.test" },
      s4: {
        role: "student",
        teacherId: "t1",
        courseId: "c1",
        email: "s4@x.test",
        preferences: { disableStudentEmails: true },
      },
    },
    courses: { c1: { name: "AP Physics 1" } },
    assignments: {
      a1: {
        teacherId: "t1",
        courseId: "c1",
        title: "Forces",
        createdAt: new Date(NOW.getTime() - 3 * 24 * HOUR),
        dueDate: new Date(NOW.getTime() + 20 * HOUR),
        questions: [{}, {}],
      },
    },
    submissions: {
      sub1: { assignmentId: "a1", studentId: "s1", status: "graded" },
      sub2: { assignmentId: "a1", studentId: "s2", status: "draft" },
    },
  });
  sendEmail.mockClear();
});

describe("runDueReminders", () => {
  const run = () => student.runDueReminders(admin.firestore(), NOW, "key");

  test("emails only class members who have not handed it in, once", async () => {
    expect(await run()).toBe(1);
    expect(to()).toEqual(["s2@x.test"]);
    const call = sendEmail.mock.calls[0][0];
    expect(call.subject).toBe("Due tomorrow: Forces");
    expect(call.tag).toBe("assignment_reminder");
    expect(call.react.props).toMatchObject({ kind: "reminder", className: "AP Physics 1", problems: 2 });
    expect(db.assignments.a1.reminderSentAt).toBeInstanceOf(Date);

    sendEmail.mockClear();
    expect(await run()).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test("replies go to the teacher", async () => {
    await run();
    expect(sendEmail.mock.calls[0][0]).toMatchObject({ replyTo: "rivera@school.test" });
  });

  test("nothing when the teacher turned student emails off", async () => {
    db.users.t1.preferences = { disableAssignmentEmails: true };
    expect(await run()).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test("nothing for work due later than a day out", async () => {
    db.assignments.a1.dueDate = new Date(NOW.getTime() + 40 * HOUR);
    expect(await run()).toBe(0);
  });
});

describe("onAssignmentAssigned", () => {
  const run = (before: Doc, after: Doc) =>
    (student.onAssignmentAssigned as unknown as Runnable).run({
      params: { assignmentId: "a1" },
      data: { before: { data: () => before }, after: { data: () => after } },
    });

  test("a hidden copy that is assigned is announced to its class", async () => {
    const after = { ...db.assignments.a1, archivedAt: null };
    db.assignments.a1 = after;
    await run({ ...after, archivedAt: new Date() }, after);
    expect(to()).toEqual(["s1@x.test", "s2@x.test"]);
    expect(sendEmail.mock.calls[0][0].tag).toBe("assignment_new");
  });

  test("ordinary edits send nothing", async () => {
    await run(db.assignments.a1, { ...db.assignments.a1, title: "Forces (edited)" });
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("onSubmissionReviewed", () => {
  const run = (before: Doc, after: Doc) => {
    db.submissions.sub2 = after;
    return (student.onSubmissionReviewed as unknown as Runnable).run({
      params: { submissionId: "sub2" },
      data: {
        before: { data: () => before },
        after: { data: () => after, ref: { path: "submissions/sub2" } },
      },
    });
  };
  const reviewed = {
    assignmentId: "a1",
    studentId: "s2",
    status: "pending_review",
    graded: true,
    teacherGraded: false,
    earnedPoints: 9,
    totalPoints: 10,
    score: 90,
  };

  test("tells the student once the teacher finishes grading", async () => {
    await run({ ...reviewed, graded: false }, reviewed);
    expect(to()).toEqual(["s2@x.test"]);
    const call = sendEmail.mock.calls[0][0];
    expect(call.subject).toBe("Your results for Forces are ready");
    expect(call.react.props).toMatchObject({ earned: 9, total: 10, teacherName: "Ms. Rivera" });

    sendEmail.mockClear();
    await run({ ...reviewed, graded: false }, db.submissions.sub2);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test("respects the student's setting", async () => {
    db.users.s2.preferences = { disableStudentEmails: true };
    await run({ ...reviewed, graded: false }, reviewed);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
