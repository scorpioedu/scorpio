// GET /api/assignments/set-pool: a published course set's problems with their answers, for a teacher
// choosing what to assign. The same access as cloning the set; never for students.
import { NextRequest } from "next/server";

type Data = Record<string, unknown>;
const mockDocs = new Map<string, Data>();
let mockUid = "t1";

jest.mock("../src/lib/firebase-admin", () => ({
  adminDb: {
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => ({
          exists: mockDocs.has(`${name}/${id}`),
          data: () => mockDocs.get(`${name}/${id}`),
        }),
      }),
    }),
  },
}));
jest.mock("../src/lib/auth-verify", () => ({
  withAuthorizedRequest:
    (
      handler: (req: NextRequest, ctx: unknown) => Promise<Response>,
      options: { teacher?: boolean },
    ) =>
    async (req: NextRequest) => {
      const profile = mockDocs.get(`users/${mockUid}`) ?? {};
      if (options.teacher && profile.role !== "teacher")
        return Response.json({ error: "Access denied" }, { status: 403 });
      return handler(req, { caller: { uid: mockUid }, profile, requestId: "r" });
    },
}));

import { GET } from "../src/app/api/assignments/set-pool/route";

const get = (sourceId?: string) =>
  GET(
    new NextRequest(
      `https://scorpio.test/api/assignments/set-pool${sourceId === undefined ? "" : `?sourceId=${sourceId}`}`,
    ),
  );

beforeEach(() => {
  mockDocs.clear();
  mockUid = "t1";
  mockDocs.set("users/t1", { role: "teacher" });
  mockDocs.set("users/s1", { role: "student" });
  mockDocs.set("assignments/set", {
    teacherId: "admin",
    visibility: "global",
    answerKeySeparated: true,
    curriculumId: "ap-physics-1",
    curriculumSetKey: "4A",
    questions: [
      { id: "q1", text: "First", type: "numeric", points: 10, apTopic: "4.1" },
      { id: "q2", text: "Second", type: "multiple-choice", options: ["a", "b"], apTopic: "4.2" },
    ],
  });
  mockDocs.set("assignment_keys/set", {
    answers: { q1: "3 m", q2: "b" },
    distractors: { q2: [{ answer: "a", misconception: "momentum-not-vector" }] },
  });
  mockDocs.set("assignment_solutions/set", { solutions: { q1: "Worked" } });
  mockDocs.set("assignments/mine", { teacherId: "t1", visibility: "private", questions: [] });
  mockDocs.set("assignments/theirs", { teacherId: "t2", visibility: "private", questions: [] });
  mockDocs.set("assignments/waypoint", { teacherId: "admin", visibility: "global", questions: [] });
});

describe("GET /api/assignments/set-pool", () => {
  test("every problem in order with its answer; no ids, distractor tags or worked solutions", async () => {
    const res = await get("set");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      questions: [
        { text: "First", type: "numeric", points: 10, apTopic: "4.1", correctAnswer: "3 m" },
        {
          text: "Second",
          type: "multiple-choice",
          options: ["a", "b"],
          apTopic: "4.2",
          correctAnswer: "b",
        },
      ],
    });
    const raw = JSON.stringify(body);
    expect(raw).not.toContain("momentum-not-vector");
    expect(raw).not.toContain("Worked");
  });

  test("students, other teachers' private work and unknown sets are refused", async () => {
    mockUid = "s1";
    expect((await get("set")).status).toBe(403);
    mockUid = "t1";
    expect((await get("theirs")).status).toBe(403);
    expect((await get("nope")).status).toBe(403);
  });

  test("only a published course set: not the caller's own assignment or a plain waypoint", async () => {
    expect((await get("mine")).status).toBe(400);
    expect((await get("waypoint")).status).toBe(400);
    expect((await get()).status).toBe(400);
    expect((await get("a%2Fb")).status).toBe(400);
  });
});
