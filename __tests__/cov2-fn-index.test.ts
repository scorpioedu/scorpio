// Branch coverage for onAssignmentCreated in functions/src/index.ts: missing data, missing teacher
// settings, idempotency claim edge cases, empty recipient list, title fallbacks and per-email failures.
// firebase-admin, the logger and the email sender are mocked; nothing touches Firestore or Resend.
type Doc = Record<string, unknown>;
const state = {
  teacher: undefined as { exists: boolean; data: Doc | undefined } | undefined,
  assignment: undefined as Doc | undefined,
  students: [] as Doc[],
  txUpdates: [] as Doc[],
  txCount: 0,
  teacherReads: [] as string[],
};

jest.mock(require.resolve("../functions/node_modules/firebase-admin"), () => {
  const firestore = () => ({
    collection: (name: string) => ({
      doc: (id: string) => ({
        id,
        collection: name,
        get: async () => {
          if (name === "users") state.teacherReads.push(id);
          const t = state.teacher;
          return { exists: t?.exists ?? false, data: () => t?.data };
        },
      }),
      where: () => {
        const q = {
          where: () => q,
          get: async () => ({ docs: state.students.map((s) => ({ data: () => s })) }),
        };
        return q;
      },
    }),
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      state.txCount++;
      return fn({
        get: async () => ({ data: () => state.assignment }),
        update: (_ref: unknown, data: Doc) => {
          state.txUpdates.push(data);
        },
      });
    },
  });
  (firestore as unknown as { FieldValue: unknown }).FieldValue = {
    serverTimestamp: () => "SERVER_TS",
  };
  return { initializeApp: jest.fn(), firestore, storage: jest.fn() };
});
jest.mock(
  require.resolve("../functions/node_modules/firebase-functions/lib/logger/index.js"),
  () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
);
const sendEmail = jest.fn(
  async (args: { to: string | string[]; subject: string; tag?: string; react: { props: Doc } }) => {
    void args;
  },
);
jest.mock("../functions/src/lib/email", () => ({
  sendEmail: (args: never) => sendEmail(args),
  sendEmailBatch: async ({ messages }: { messages: never[] }) => {
    let sent = 0;
    for (const m of messages) {
      try {
        await sendEmail(m);
        sent++;
      } catch {
        // The real sender logs a failed chunk and carries on.
      }
    }
    return sent;
  },
}));
jest.mock("@google/genai", () => ({ GoogleGenAI: jest.fn() }), { virtual: true });

import * as logger from "../functions/node_modules/firebase-functions/lib/logger/index.js";
import * as fns from "../functions/src/index";

type Runnable = { run: (event: unknown) => Promise<unknown> };
const runCreated = (data: Doc | undefined, noEventData = false) =>
  (fns.onAssignmentCreated as unknown as Runnable).run({
    params: { assignmentId: "a1" },
    data: noEventData ? undefined : { data: () => data },
  });
const enabledTeacher = { exists: true, data: { preferences: { disableAssignmentEmails: false } } };
const infoMessages = () => (logger.info as jest.Mock).mock.calls.map((c) => String(c[0]));

beforeEach(() => {
  Object.assign(state, {
    teacher: enabledTeacher,
    assignment: {},
    students: [{ email: "a@x.test", displayName: "Ann" }],
    txUpdates: [],
    txCount: 0,
    teacherReads: [],
  });
  sendEmail.mockClear();
  sendEmail.mockResolvedValue(undefined);
  (logger.info as jest.Mock).mockClear();
  (logger.error as jest.Mock).mockClear();
});

describe("onAssignmentCreated guards", () => {
  it("does nothing when the event carries no document", async () => {
    await runCreated(undefined, true);
    expect(state.teacherReads).toEqual([]);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("does nothing when the document data is empty", async () => {
    await runCreated(undefined);
    expect(state.teacherReads).toEqual([]);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("skips and logs when the assignment has no teacherId", async () => {
    await runCreated({ title: "T" });
    expect(infoMessages()).toContain("No teacherId found on assignment, skipping emails.");
    expect(state.txCount).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("emails by default when the teacher never changed the setting", async () => {
    state.teacher = { exists: true, data: { role: "teacher" } };
    await runCreated({ teacherId: "t1", title: "T" });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("skips and logs when the teacher turned student emails off", async () => {
    state.teacher = { exists: true, data: { preferences: { disableAssignmentEmails: true } } };
    await runCreated({ teacherId: "t1", title: "T" });
    expect(infoMessages()).toContain("Teacher t1 has disabled assignment emails, skipping.");
    expect(state.txCount).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("emails when the teacher document exists but has no data", async () => {
    state.teacher = { exists: true, data: undefined };
    await runCreated({ teacherId: "t1" });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("waits while the assignment is hidden from students (archived) or a shared course pool", async () => {
    await runCreated({ teacherId: "t1", title: "T", archivedAt: new Date() });
    await runCreated({ teacherId: "t1", title: "T", visibility: "global" });
    expect(infoMessages()).toContain("Assignment a1 is hidden from students, skipping emails for now.");
    expect(state.txCount).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("leaves out students who turned emails off", async () => {
    state.students = [
      { email: "a@x.test" },
      { email: "off@x.test", preferences: { disableStudentEmails: true } },
    ];
    await runCreated({ teacherId: "t1", title: "T" });
    expect(sendEmail.mock.calls.map((c) => c[0].to)).toEqual(["a@x.test"]);
  });

  it("keeps going when the teacher document does not exist", async () => {
    state.teacher = { exists: false, data: undefined };
    await runCreated({ teacherId: "t1", title: "T" });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});

describe("onAssignmentCreated claim and recipients", () => {
  it("claims the send by stamping emailsSentAt", async () => {
    await runCreated({ teacherId: "t1", title: "T" });
    expect(state.txUpdates).toEqual([{ emailsSentAt: expect.any(Date) }]);
  });

  it("claims the send even if the assignment document is not readable inside the transaction", async () => {
    state.assignment = undefined;
    await runCreated({ teacherId: "t1", title: "T" });
    expect(state.txUpdates).toHaveLength(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("does not email again when emailsSentAt is already set", async () => {
    state.assignment = { emailsSentAt: "earlier" };
    await runCreated({ teacherId: "t1", title: "T" });
    expect(state.txUpdates).toEqual([]);
    expect(infoMessages()).toContain("Assignment a1 emails already sent, skipping.");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("stops after claiming when no student has an email address", async () => {
    state.students = [{ displayName: "No Mail" }, { email: "" }];
    await runCreated({ teacherId: "t1", title: "T" });
    expect(state.txUpdates).toHaveLength(1);
    expect(infoMessages()).toContain("No students found for assignment a1, skipping emails.");
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("onAssignmentCreated email content", () => {
  it('falls back to "Assignment" when the title is missing', async () => {
    await runCreated({ teacherId: "t1" });
    const call = sendEmail.mock.calls[0][0];
    expect(call.subject).toBe("New assignment: Assignment");
    expect(call.react.props).toMatchObject({ assignmentTitle: "Assignment", firstName: "Ann" });
  });

  it("links to the assignment itself, shows the due date and problem count, and is tagged", async () => {
    await runCreated({
      teacherId: "t1",
      title: "Quiz 1",
      dueDate: new Date("2036-11-26T07:59:00Z"),
      questions: [{}, {}, {}],
    });
    const call = sendEmail.mock.calls[0][0];
    expect(call.tag).toBe("assignment_new");
    expect(call.react.props).toMatchObject({
      link: "https://scorpioedu.org/student/assignment-view?id=a1",
      due: "Tue, Nov 25 at 11:59 PM PST",
      problems: 3,
    });
  });

  it('uses the student name field, then no name, when there is no displayName', async () => {
    state.students = [{ email: "n@x.test", name: "Nora" }, { email: "z@x.test" }];
    await runCreated({ teacherId: "t1", title: "Quiz 1" });
    const names = Object.fromEntries(
      sendEmail.mock.calls.map((c) => [c[0].to as string, c[0].react.props.firstName]),
    );
    expect(names).toEqual({ "n@x.test": "Nora", "z@x.test": "" });
    expect(sendEmail.mock.calls[0][0].subject).toBe("New assignment: Quiz 1");
  });

  it("a failing send does not stop the rest of the class", async () => {
    state.students = [{ email: "bad@x.test" }, { email: "good@x.test" }];
    sendEmail.mockImplementation(async (args) => {
      if (args.to === "bad@x.test") throw "smtp down";
    });
    await runCreated({ teacherId: "t1", title: "T" });
    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(infoMessages()).toContain("Finished sending assignment creation emails for a1");
  });

  it("skips work that is already past due", async () => {
    await runCreated({ teacherId: "t1", title: "T", dueDate: new Date(Date.now() - 60_000) });
    expect(infoMessages()).toContain("Assignment a1 is already past due, skipping emails.");
    expect(state.txCount).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("leaves out imported students who have not signed up yet", async () => {
    state.students = [{ email: "a@x.test" }, { email: "p@x.test", status: "pending_invite" }];
    await runCreated({ teacherId: "t1", title: "T" });
    expect(sendEmail.mock.calls.map((c) => c[0].to)).toEqual(["a@x.test"]);
  });
});
