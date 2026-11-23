// PATCH /api/assignments/{id}: owner edits, archive, and re-grading handed-in work without the AI.
import { NextRequest } from "next/server";
import { changedQuestionIds, regradeSubmission } from "../src/lib/regrade";

type Data = Record<string, unknown>;
const mockDocs = new Map<string, Data>();
const mockWrites: { op: string; path: string; data?: Data }[] = [];
let mockUid = "t1";

jest.mock("../src/lib/firebase-admin", () => {
  const ref = (name: string, id: string) => ({
    id,
    path: `${name}/${id}`,
    get: async () => ({
      id,
      exists: mockDocs.has(`${name}/${id}`),
      data: () => mockDocs.get(`${name}/${id}`),
    }),
  });
  return {
    adminDb: {
      collection: (name: string) => {
        const filters: [string, unknown][] = [];
        const q = {
          where: (f: string, _op: string, v: unknown) => (filters.push([f, v]), q),
          get: async () => ({
            docs: [...mockDocs.entries()]
              .filter(([p, d]) => p.startsWith(`${name}/`) && filters.every(([f, v]) => d[f] === v))
              .map(([p, d]) => ({
                id: p.slice(name.length + 1),
                ref: ref(name, p.slice(name.length + 1)),
                data: () => d,
              })),
          }),
          doc: (id: string) => ref(name, id),
        };
        return q;
      },
      batch: () => ({
        update: (r: { path: string }, data: Data) =>
          mockWrites.push({ op: "update", path: r.path, data }),
        set: (r: { path: string }, data: Data) =>
          mockWrites.push({ op: "set", path: r.path, data }),
        commit: async () => undefined,
      }),
    },
  };
});
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

import { PATCH } from "../src/app/api/assignments/[id]/route";

const patch = (id: string, body: unknown) =>
  PATCH(
    new NextRequest(`https://scorpio.test/api/assignments/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  );

const mc = (id: string, correct: string, extra: Data = {}) => ({
  id,
  text: `Question ${id}`,
  type: "multiple-choice",
  points: 10,
  options: ["A", "B", "C"],
  correctAnswer: correct,
  ...extra,
});
const publicQ = ({ correctAnswer: _c, ...q }: Data) => q;

beforeEach(() => {
  mockDocs.clear();
  mockWrites.length = 0;
  mockUid = "t1";
  mockDocs.set("users/t1", { role: "teacher" });
  mockDocs.set("users/t2", { role: "teacher" });
  mockDocs.set("assignments/a1", {
    teacherId: "t1",
    courseId: "c1",
    title: "Forces",
    questions: [
      publicQ(mc("q1", "A")),
      publicQ(mc("q2", "B")),
      { id: "q3", text: "Explain", type: "text", points: 10 },
    ],
    answerKeySeparated: true,
  });
  mockDocs.set("assignment_keys/a1", {
    answers: { q1: "A", q2: "B", q3: "" },
    rubric: "",
    teacherId: "t1",
  });
  mockDocs.set("submissions/s1", {
    assignmentId: "a1",
    graded: true,
    score: 67,
    answers: [
      { questionId: "q1", answer: "B", score: 0, maxPoints: 10 },
      { questionId: "q2", answer: "B", score: 10, maxPoints: 10 },
      { questionId: "q3", answer: "Because", score: 10, maxPoints: 10 },
    ],
  });
});

const updates = (path: string) => mockWrites.filter((w) => w.path === path).map((w) => w.data!);

describe("PATCH /api/assignments/{id}", () => {
  test("renames and moves the due date without touching submissions", async () => {
    const res = await patch("a1", {
      title: "  Newton's laws ",
      dueDate: "2026-12-01T23:59:00.000Z",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, submissions: 0, regraded: 0 });
    expect(updates("assignments/a1")[0]).toMatchObject({
      title: "Newton's laws",
      dueDate: new Date("2026-12-01T23:59:00.000Z"),
    });
    expect(updates("submissions/s1")).toEqual([]);
  });

  test("a moved due date clears reminderSentAt; the same date keeps it", async () => {
    mockDocs.set("assignments/a1", {
      ...mockDocs.get("assignments/a1")!,
      dueDate: new Date("2026-12-01T23:59:00.000Z"),
      reminderSentAt: new Date(),
    });
    await patch("a1", { dueDate: "2026-12-01T23:59:00.000Z" });
    expect(updates("assignments/a1")[0]).not.toHaveProperty("reminderSentAt");
    await patch("a1", { dueDate: "2026-12-03T23:59:00.000Z" });
    expect(updates("assignments/a1")[1].reminderSentAt).toBeNull();
  });

  test("archive sets archivedAt, restore clears it", async () => {
    await patch("a1", { archived: true });
    expect(updates("assignments/a1")[0].archivedAt).toBeInstanceOf(Date);
    await patch("a1", { archived: false });
    expect(updates("assignments/a1")[1].archivedAt).toBeNull();
  });

  test("a changed key re-grades that answer, keeps the others, and splits the key", async () => {
    const res = await patch("a1", {
      questions: [
        mc("q1", "B"),
        mc("q2", "B", { text: "Reworded" }),
        { id: "q3", text: "Explain", type: "text", points: 10 },
      ],
    });
    expect(await res.json()).toMatchObject({
      submissions: 1,
      regraded: 1,
      needsReview: 0,
      changed: ["q1"],
    });
    const saved = updates("assignments/a1")[0];
    expect((saved.questions as Data[]).every((q) => !("correctAnswer" in q))).toBe(true);
    expect(saved.totalPoints).toBe(30);
    expect(mockWrites.find((w) => w.path === "assignment_keys/a1")?.data).toMatchObject({
      answers: { q1: "B", q2: "B", q3: "" },
    });
    const sub = updates("submissions/s1")[0];
    expect(sub.score).toBe(100);
    expect((sub.answers as Data[])[0]).toMatchObject({
      questionId: "q1",
      score: 10,
      method: "exact",
    });
    expect((sub.answers as Data[])[2]).toMatchObject({ questionId: "q3", score: 10 });
  });

  test("hand-graded answers keep their score; removed questions leave the totals", async () => {
    mockDocs.set("submissions/s1", { ...mockDocs.get("submissions/s1")!, teacherGraded: ["q1"] });
    await patch("a1", { questions: [mc("q1", "B"), mc("q2", "B")] });
    const sub = updates("submissions/s1")[0];
    expect((sub.answers as Data[]).map((a) => a.score)).toEqual([0, 10]);
    expect(sub).toMatchObject({ earnedPoints: 10, totalPoints: 20, score: 50 });
  });

  test("AP tags are checked against the AP course", async () => {
    await patch("a1", { apUnit: 2, apTopics: ["2.1", "9.9"] });
    expect(updates("assignments/a1")[0]).toMatchObject({
      apCourse: "physics-1",
      apUnit: 2,
      apTopics: ["2.1"],
    });
  });

  test("only the owner, and nothing is written otherwise", async () => {
    mockUid = "t2";
    expect((await patch("a1", { title: "Mine now" })).status).toBe(403);
    expect((await patch("missing", { title: "x" })).status).toBe(403);
    mockUid = "t1";
    expect((await patch("a1", {})).status).toBe(400);
    expect((await patch("a1", { questions: [] })).status).toBe(400);
    expect(mockWrites).toEqual([]);
  });
});

describe("regrade helpers", () => {
  test("wording changes are not grading changes", () => {
    expect(changedQuestionIds([mc("q1", "A")], [mc("q1", "A", { text: "New words" })])).toEqual([]);
    expect(changedQuestionIds([mc("q1", "A")], [mc("q1", "A", { points: 5 })])).toEqual(["q1"]);
    expect(changedQuestionIds([mc("q1", "A")], [mc("q2", "A")])).toEqual([]);
  });

  test("an answer that would need the AI keeps its score and is listed for review", async () => {
    const q = {
      id: "q3",
      text: "Explain",
      type: "short-answer",
      points: 10,
      correctAnswer: "inertia",
    };
    const result = await regradeSubmission(
      [q],
      { answers: [{ questionId: "q3", answer: "mass resists", score: 7 }] },
      new Set(["q3"]),
    );
    expect(result.answers[0].score).toBe(7);
    expect(result.reviewQuestions).toEqual(["q3"]);
    expect(result.regraded).toBe(0);
  });
});
