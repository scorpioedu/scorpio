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
  async (args: { to: string | string[]; subject: string; react: { props: Doc } }) => {
    void args;
  },
);
jest.mock("../functions/src/lib/email", () => ({ sendEmail: (args: never) => sendEmail(args) }));
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

  it("treats a teacher profile with no preferences as emails disabled", async () => {
    state.teacher = { exists: true, data: { role: "teacher" } };
    await runCreated({ teacherId: "t1", title: "T" });
    expect(infoMessages()).toContain("Teacher t1 has disabled assignment emails, skipping.");
    expect(state.txCount).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("treats a teacher document that exists but has no data as emails disabled", async () => {
    state.teacher = { exists: true, data: undefined };
    await runCreated({ teacherId: "t1" });
    expect(state.txCount).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
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
    expect(call.subject).toBe("New Assignment Published: Assignment");
    expect(call.react.props).toMatchObject({ assignmentName: "Assignment", studentName: "Ann" });
  });

  it('uses the student name field, then "Student", when there is no displayName', async () => {
    state.students = [{ email: "n@x.test", name: "Nora" }, { email: "z@x.test" }];
    await runCreated({ teacherId: "t1", title: "Quiz 1" });
    const names = Object.fromEntries(
      sendEmail.mock.calls.map((c) => [c[0].to as string, c[0].react.props.studentName]),
    );
    expect(names).toEqual({ "n@x.test": "Nora", "z@x.test": "Student" });
    expect(sendEmail.mock.calls[0][0].subject).toBe("New Assignment Published: Quiz 1");
  });

  it('logs a masked address with an "unknown" error name when a send rejects with a non-Error, and still emails the rest', async () => {
    state.students = [{ email: "bad@x.test" }, { email: "good@x.test" }];
    sendEmail.mockImplementation(async (args) => {
      if (args.to === "bad@x.test") throw "smtp down";
    });
    await runCreated({ teacherId: "t1", title: "T" });
    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith("Failed to email student b***@x.test", {
      error: "unknown",
    });
    expect(infoMessages()).toContain("Finished sending assignment creation emails for a1");
  });

  it("logs the error name, never the message, when a send rejects with an Error", async () => {
    sendEmail.mockRejectedValue(new TypeError("secret detail a@x.test"));
    await runCreated({ teacherId: "t1", title: "T" });
    expect(logger.error).toHaveBeenCalledWith("Failed to email student a***@x.test", {
      error: "TypeError",
    });
  });
});
