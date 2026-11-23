// RT-18 (K-002, K-003, K-007, E-005): trigger-level tests for the assignment email and cleanup functions.
// firebase-admin and the email sender are mocked; nothing here touches Firestore, Storage or Resend.

type Doc = Record<string, unknown>;
const state = {
  users: [] as Array<{ id: string; data: Doc }>,
  submissions: [] as Array<{ id: string; data: Doc }>,
  assignments: {} as Record<string, Doc>,
  deletedKeys: [] as string[],
  deletedSubmissions: [] as string[],
  deletedObjects: [] as string[],
  order: [] as string[],
  bucketFail: new Set<string>(),
};

// functions/ has its own node_modules; mock that copy of firebase-admin, not the root one.
jest.mock(require.resolve("../functions/node_modules/firebase-admin"), () => {
  const docRef = (collection: string, id: string) => ({ collection, id });
  const snap = (rows: Array<{ id: string; data: Doc }>) => ({
    docs: rows.map((r) => ({ id: r.id, ref: docRef("submissions", r.id), data: () => r.data })),
    size: rows.length,
    empty: rows.length === 0,
  });
  const firestore = () => ({
    collection: (name: string) => ({
      doc: (id: string) => ({
        ...docRef(name, id),
        get: async () => ({
          exists: name === "users" && state.users.some((u) => u.id === id),
          data: () => (name === "users" ? state.users.find((u) => u.id === id)?.data : undefined),
        }),
        delete: async () => {
          if (name === "assignment_keys") {
            state.order.push("key");
            state.deletedKeys.push(id);
          }
        },
      }),
      where: (field: string, _op: string, value: unknown) => {
        const filters: Array<[string, unknown]> = [[field, value]];
        const q = {
          where: (f: string, _o: string, v: unknown) => {
            filters.push([f, v]);
            return q;
          },
          get: async () => {
            const rows = (name === "users" ? state.users : state.submissions).filter((r) =>
              filters.every(([f, v]) => r.data[f] === v),
            );
            return snap(rows);
          },
        };
        return q;
      },
    }),
    batch: () => {
      const refs: Array<{ id: string }> = [];
      return {
        delete: (ref: { id: string }) => refs.push(ref),
        commit: async () => {
          state.order.push("docs");
          refs.forEach((r) => state.deletedSubmissions.push(r.id));
        },
      };
    },
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        get: async (ref: { id: string }) => ({ data: () => state.assignments[ref.id] }),
        update: (ref: { id: string }, data: Doc) => {
          state.assignments[ref.id] = { ...state.assignments[ref.id], ...data };
        },
      }),
  });
  (firestore as unknown as { FieldValue: unknown }).FieldValue = {
    serverTimestamp: () => "SERVER_TS",
  };
  const storage = () => ({
    bucket: () => ({
      file: (name: string) => ({
        delete: async () => {
          if (state.bucketFail.has(name)) throw new Error("boom");
          state.order.push("file");
          state.deletedObjects.push(name);
        },
      }),
    }),
  });
  return { initializeApp: jest.fn(), firestore, storage };
});

const sendEmail = jest.fn(async (args: { to: string | string[] }) => {
  void args;
});
jest.mock("../functions/src/lib/email", () => ({
  sendEmail: (args: { to: string | string[] }) => sendEmail(args),
}));
jest.mock("@google/genai", () => ({ GoogleGenAI: jest.fn() }), { virtual: true });

import * as fns from "../functions/src/index";

type Runnable = { run: (event: unknown) => Promise<unknown> };
const created = (id: string, data: Doc) => ({
  params: { assignmentId: id },
  data: { data: () => data },
});
const runCreated = (id: string, data: Doc) =>
  (fns.onAssignmentCreated as unknown as Runnable).run(created(id, data));
const runDeleted = (id: string) =>
  (fns.onAssignmentDeleted as unknown as Runnable).run({ params: { assignmentId: id } });
const recipients = () => sendEmail.mock.calls.map((c) => c[0].to as string).sort();
const url = (object: string) =>
  `https://firebasestorage.googleapis.com/v0/b/bkt/o/${encodeURIComponent(object)}?alt=media&token=t`;

beforeEach(() => {
  Object.assign(state, {
    users: [],
    submissions: [],
    assignments: {},
    deletedKeys: [],
    deletedSubmissions: [],
    deletedObjects: [],
    order: [],
    bucketFail: new Set(),
  });
  sendEmail.mockClear();
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "error").mockImplementation(() => undefined);
  state.users.push(
    { id: "t1", data: { role: "teacher", preferences: { disableAssignmentEmails: false } } },
    { id: "s1", data: { role: "student", teacherId: "t1", courseId: "c1", email: "s1@x.test" } },
    { id: "s2", data: { role: "student", teacherId: "t1", courseId: "c2", email: "s2@x.test" } },
    { id: "s3", data: { role: "student", teacherId: "t1", courseId: "c1" } },
    { id: "s4", data: { role: "student", teacherId: "other", courseId: "c1", email: "s4@x.test" } },
  );
});

describe("onAssignmentCreated email recipients", () => {
  test("with a courseId only students of that course with an email are emailed", async () => {
    state.assignments.a1 = {};
    await runCreated("a1", { teacherId: "t1", courseId: "c1", title: "HW" });
    expect(recipients()).toEqual(["s1@x.test"]);
  });

  test("without a courseId all of the teacher's students with an email are emailed (unchanged)", async () => {
    state.assignments.a1 = {};
    await runCreated("a1", { teacherId: "t1", title: "HW" });
    expect(recipients()).toEqual(["s1@x.test", "s2@x.test"]);
  });

  test("teachers who never changed the setting email their students (on by default)", async () => {
    state.users[0] = { id: "t1", data: { role: "teacher" } };
    state.assignments.a1 = {};
    await runCreated("a1", { teacherId: "t1", title: "HW" });
    expect(recipients()).toEqual(["s1@x.test", "s2@x.test"]);
  });

  test("teachers who turned student emails off send nothing", async () => {
    state.users[0] = { id: "t1", data: { role: "teacher", preferences: { disableAssignmentEmails: true } } };
    state.assignments.a1 = {};
    await runCreated("a1", { teacherId: "t1", title: "HW" });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test("a failing send does not stop the other recipients", async () => {
    state.assignments.a1 = {};
    sendEmail.mockRejectedValueOnce(new Error("resend down"));
    await runCreated("a1", { teacherId: "t1", title: "HW" });
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });
});

describe("onAssignmentCreated idempotency", () => {
  test("two deliveries of the same create event send one batch", async () => {
    state.assignments.a1 = {};
    await runCreated("a1", { teacherId: "t1", courseId: "c1", title: "HW" });
    await runCreated("a1", { teacherId: "t1", courseId: "c1", title: "HW" });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  test("emailsSentAt is written to the assignment", async () => {
    state.assignments.a1 = {};
    await runCreated("a1", { teacherId: "t1", title: "HW" });
    expect(state.assignments.a1.emailsSentAt).toBeInstanceOf(Date);
  });
});

describe("onAssignmentDeleted storage cleanup", () => {
  beforeEach(() => {
    state.submissions.push(
      {
        id: "sub1",
        data: {
          assignmentId: "a1",
          studentId: "s1",
          workFiles: [{ url: url("submissions/s1/a.png") }, { url: url("submissions/s1/b.pdf") }],
        },
      },
      {
        id: "sub2",
        data: {
          assignmentId: "a1",
          studentId: "s2",
          workFiles: [{ url: url("submissions/s2/c.png") }],
        },
      },
      {
        id: "sub3",
        data: {
          assignmentId: "a2",
          studentId: "s1",
          workFiles: [{ url: url("submissions/s1/keep.png") }],
        },
      },
    );
  });

  test("deletes exactly the submission files of the deleted assignment", async () => {
    await runDeleted("a1");
    expect(state.deletedObjects.sort()).toEqual([
      "submissions/s1/a.png",
      "submissions/s1/b.pdf",
      "submissions/s2/c.png",
    ]);
  });

  test("never deletes files of another assignment", async () => {
    await runDeleted("a1");
    expect(state.deletedObjects).not.toContain("submissions/s1/keep.png");
  });

  test("never deletes objects outside the student's submissions prefix", async () => {
    state.submissions.push({
      id: "evil",
      data: {
        assignmentId: "a1",
        studentId: "s1",
        workFiles: [
          { url: url("resources/t1/lesson.mp4") },
          { url: url("submissions/s2/other-student.png") },
          { url: url("submissions/s1/../../resources/t1/x") },
          { url: "data:image/png;base64,AAAA" },
          { url: "not a url" },
          {},
        ],
      },
    });
    await runDeleted("a1");
    expect(state.deletedObjects.every((o) => o.startsWith("submissions/"))).toBe(true);
    expect(state.deletedObjects).not.toContain("submissions/s2/other-student.png");
    expect(state.deletedObjects).toHaveLength(3);
  });

  test("files go before the submission documents", async () => {
    await runDeleted("a1");
    expect(state.order.indexOf("docs")).toBeGreaterThan(state.order.lastIndexOf("file"));
  });

  test("a storage failure does not block deleting the submissions", async () => {
    state.bucketFail.add("submissions/s1/a.png");
    await runDeleted("a1");
    expect(state.deletedSubmissions.sort()).toEqual(["sub1", "sub2"]);
    expect(state.deletedKeys).toEqual(["a1"]);
  });
});
