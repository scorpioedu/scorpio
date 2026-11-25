// "Read the lessons first": which lessons an assignment asks for (src/lib/read-first.ts), and
// GET/POST /api/assignments/{id}/lesson-reads, every allow and deny branch. The auth wrapper is a
// pass-through here (covered by auth-wrapper-rt13/19); caller and profile come from the test.
import { NextRequest } from "next/server";
import {
  lessonCourse,
  lessonTopics,
  mayStart,
  readAll,
  readFirstTopics,
} from "../src/lib/read-first";
import { lessonBody } from "../src/components/guide/lesson-dialog";

type Doc = Record<string, unknown> | undefined;
const mockDocs = new Map<string, Doc>();
const mockWrites: { path: string; data: Record<string, unknown>; merge: boolean }[] = [];
let mockCaller = { uid: "stu1" };
let mockProfile: Record<string, unknown> = {};

/** A tiny Firestore: `set` with merge deep-merges plain objects, the way Firestore merges maps. */
function merge(into: Record<string, unknown>, from: Record<string, unknown>) {
  const out = { ...into };
  for (const [k, v] of Object.entries(from))
    out[k] =
      v && typeof v === "object" && !(v instanceof Date) && out[k] && typeof out[k] === "object"
        ? merge(out[k] as Record<string, unknown>, v as Record<string, unknown>)
        : v;
  return out;
}

jest.mock("../src/lib/firebase-admin", () => ({
  adminDb: {
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => ({ data: () => mockDocs.get(`${name}/${id}`) }),
        set: async (data: Record<string, unknown>, opts?: { merge?: boolean }) => {
          const path = `${name}/${id}`;
          mockWrites.push({ path, data, merge: !!opts?.merge });
          mockDocs.set(path, opts?.merge ? merge(mockDocs.get(path) ?? {}, data) : data);
        },
      }),
      where: (field: string, _op: string, value: unknown) => ({
        get: async () => ({
          docs: [...mockDocs.entries()]
            .filter(([path, d]) => path.startsWith(`${name}/`) && d?.[field] === value)
            .map(([, d]) => ({ data: () => d })),
        }),
      }),
    }),
  },
}));

jest.mock("../src/lib/auth-verify", () => ({
  withAuthorizedRequest:
    (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) => (req: NextRequest) =>
      handler(req, { caller: mockCaller, profile: mockProfile, requestId: "req-1" }),
}));

import { GET, POST } from "../src/app/api/assignments/[id]/lesson-reads/route";

const URL_ = "https://scorpio.test/api/assignments/a1/lesson-reads";
const get = () => GET(new NextRequest(URL_));
const post = (body: unknown) =>
  POST(
    new NextRequest(URL_, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

const READ_AT = new Date("2026-11-24T10:00:00Z");
const seed = (extra: Record<string, unknown> = {}) =>
  mockDocs.set("assignments/a1", {
    teacherId: "teach1",
    courseId: "class1",
    answerKeySeparated: true,
    curriculumId: "ap-physics-1",
    apCourse: "physics-1",
    apTopics: ["2.3", "2.4"],
    readFirst: true,
    ...extra,
  });

beforeEach(() => {
  mockDocs.clear();
  mockWrites.length = 0;
  mockCaller = { uid: "stu1" };
  mockProfile = { role: "student", courseId: "class1", teacherId: "teach1" };
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe("which lessons an assignment asks for", () => {
  test("its AP topics with lessons, in course order, only when readFirst is on", () => {
    const a = { curriculumId: "ap-physics-1", apTopics: ["2.4", "2.3", "2.4"], readFirst: true };
    expect(lessonTopics(a)).toEqual(["2.3", "2.4"]);
    expect(readFirstTopics(a)).toEqual(["2.3", "2.4"]);
    expect(readFirstTopics({ ...a, readFirst: false })).toEqual([]);
    expect(readFirstTopics({ ...a, readFirst: "yes" })).toEqual([]);
  });

  test("the course comes from the AP tags when the assignment follows no curriculum", () => {
    expect(lessonCourse({ apCourse: "physics-c-mech" })).toBe("ap-physics-c-mech");
    expect(lessonCourse({ curriculumId: "nope", apCourse: "physics-1" })).toBe("ap-physics-1");
    expect(lessonCourse({})).toBeNull();
    expect(lessonTopics({ apCourse: "physics-1", apTopics: ["3.1"] })).toEqual(["3.1"]);
  });

  test("untagged: the questions' own topics; junk and unknown units are left out", () => {
    const a = {
      apCourse: "physics-1",
      questions: [
        { apTopic: "4.2" },
        { apTopic: "4.2" },
        { apTopic: "bad" },
        null,
        { apTopic: "99.1" },
      ],
    };
    expect(lessonTopics(a)).toEqual(["4.2"]);
  });

  test("readAll needs every topic", () => {
    expect(readAll(["2.3", "2.4"], { "2.3": "x" })).toBe(false);
    expect(readAll(["2.3", "2.4"], { "2.3": "x", "2.4": "y" })).toBe(true);
    expect(readAll([], null)).toBe(true);
  });
});

describe("when a student may start", () => {
  test("only once every lesson asked for is read, and not before the reads have loaded", () => {
    expect(mayStart(["2.3", "2.4"], null, false)).toBe(false);
    expect(mayStart(["2.3", "2.4"], { "2.3": "x" }, false)).toBe(false);
    expect(mayStart(["2.3", "2.4"], { "2.3": "x", "2.4": "y" }, false)).toBe(true);
  });

  test("nothing asked for (reading turned off since the page loaded): start straight away", () => {
    expect(mayStart([], null, false)).toBe(true);
  });

  test("the lessons or the reads could not be loaded: our failure never blocks the work", () => {
    expect(mayStart(["2.3"], null, true)).toBe(true);
  });
});

describe("what the lesson dialog shows", () => {
  test("the lesson, a wait while loading, then why there is none, never a spinner for ever", () => {
    expect(lessonBody(true, true, false)).toBe("lesson");
    expect(lessonBody(false, false, false)).toBe("loading");
    expect(lessonBody(false, true, false)).toBe("missing");
    expect(lessonBody(false, false, true)).toBe("failed");
  });
});

describe("GET as a student", () => {
  test("the lessons and their own reads, never cached", async () => {
    seed();
    mockDocs.set("lesson_reads/a1_stu1", { studentId: "stu1", reads: { "2.3": READ_AT } });
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(await res.json()).toEqual({
      topics: ["2.3", "2.4"],
      reads: { "2.3": READ_AT.toISOString() },
    });
  });

  test("a Firestore timestamp reads as its date; a topic no longer asked for is dropped", async () => {
    seed({ apTopics: ["2.4"] });
    mockDocs.set("lesson_reads/a1_stu1", {
      reads: { "2.3": READ_AT, "2.4": { toDate: () => READ_AT } },
    });
    expect((await (await get()).json()).reads).toEqual({ "2.4": READ_AT.toISOString() });
  });

  test("reading turned off after the student opened the page: no lessons asked for", async () => {
    seed({ readFirst: false });
    expect(await (await get()).json()).toEqual({ topics: [], reads: {} });
  });

  test("an assignment with no AP topics that have lessons asks for none", async () => {
    seed({ curriculumId: null, apCourse: null, apTopics: [] });
    expect((await (await get()).json()).topics).toEqual([]);
  });

  test("not enrolled, another role or a missing assignment: 403", async () => {
    seed();
    mockProfile = { role: "student", courseId: "other", teacherId: "teach1" };
    expect((await get()).status).toBe(403);
    mockProfile = { role: "teacher" };
    mockCaller = { uid: "teach2" };
    expect((await get()).status).toBe(403);
    mockDocs.clear();
    mockCaller = { uid: "stu1" };
    mockProfile = { role: "student", courseId: "class1" };
    expect((await get()).status).toBe(403);
  });
});

describe("GET as the owner", () => {
  test("every student's reads", async () => {
    seed();
    mockCaller = { uid: "teach1" };
    mockProfile = { role: "teacher" };
    mockDocs.set("lesson_reads/a1_stu1", {
      assignmentId: "a1",
      studentId: "stu1",
      reads: { "2.3": READ_AT, "2.4": READ_AT },
    });
    mockDocs.set("lesson_reads/a2_stu9", { assignmentId: "a2", studentId: "stu9", reads: {} });
    expect(await (await get()).json()).toEqual({
      topics: ["2.3", "2.4"],
      students: { stu1: { "2.3": READ_AT.toISOString(), "2.4": READ_AT.toISOString() } },
    });
  });
});

describe("POST", () => {
  test("marks one lesson read, keeping the others", async () => {
    seed();
    mockDocs.set("lesson_reads/a1_stu1", { studentId: "stu1", reads: { "2.3": READ_AT } });
    const res = await post({ topic: "2.4" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body.reads).sort()).toEqual(["2.3", "2.4"]);
    expect(mockWrites).toHaveLength(1);
    expect(mockWrites[0]).toMatchObject({
      path: "lesson_reads/a1_stu1",
      merge: true,
      data: { assignmentId: "a1", studentId: "stu1", teacherId: "teach1", courseId: "class1" },
    });
    expect(Object.keys(mockWrites[0].data.reads as object)).toEqual(["2.4"]);
  });

  test("a topic the assignment does not ask for, or reading turned off: 400, nothing written", async () => {
    seed();
    expect((await post({ topic: "5.1" })).status).toBe(400);
    seed({ readFirst: false });
    expect((await post({ topic: "2.3" })).status).toBe(400);
    expect(mockWrites).toHaveLength(0);
  });

  test("a malformed topic: 400", async () => {
    seed();
    expect((await post({ topic: "2.3; drop" })).status).toBe(400);
    expect((await post({})).status).toBe(400);
  });

  test("teachers and students of another class cannot mark reads", async () => {
    seed();
    mockCaller = { uid: "teach1" };
    mockProfile = { role: "teacher" };
    expect((await post({ topic: "2.3" })).status).toBe(403);
    mockCaller = { uid: "stu2" };
    mockProfile = { role: "student", courseId: "other" };
    expect((await post({ topic: "2.3" })).status).toBe(403);
    expect(mockWrites).toHaveLength(0);
  });
});
