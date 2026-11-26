// The Study problem pool: which course-set problems are served, how answers are checked, and that a
// set any class has open is never served.
type Doc = Record<string, unknown>;
const docs = new Map<string, Doc>();

function snap(path: string) {
  const data = docs.get(path);
  return { id: path.split("/").pop()!, exists: !!data, data: () => data };
}

jest.mock("../src/lib/firebase-admin", () => ({
  adminDb: {
    collection: (name: string) => ({
      doc: (id: string) => ({ get: async () => snap(`${name}/${id}`) }),
      where: (field: string, op: string, value: unknown) => ({
        get: async () => {
          const rows = [...docs.entries()]
            .filter(([p]) => p.startsWith(`${name}/`) && !p.slice(name.length + 1).includes("/"))
            .filter(([, d]) =>
              op === "in" ? (value as unknown[]).includes(d[field]) : d[field] === value,
            )
            .map(([p]) => snap(p));
          return { docs: rows, size: rows.length };
        },
      }),
    }),
  },
}));

import {
  checkAnswer,
  decimalComma,
  loadPool,
  pickProblems,
  publicProblem,
  resetPoolCache,
  type PoolProblem,
} from "../src/lib/study/pool";

const NOW = new Date("2026-11-26T12:00:00Z");

function seedSet(id: string, extra: Doc = {}) {
  docs.set(`assignments/${id}`, {
    visibility: "global",
    curriculumId: "ap-physics-1",
    curriculumSetKey: "3A",
    answerKeySeparated: true,
    questions: [
      { id: "n1", text: "How fast?", type: "numeric", apTopic: "3.4", points: 10 },
      {
        id: "m1",
        text: "Which one?",
        type: "multiple-choice",
        options: ["Up", "Down", "Neither"],
        apTopic: "3.4",
      },
      { id: "t1", text: "Explain.", type: "text", apTopic: "3.4" },
    ],
    ...extra,
  });
  docs.set(`assignment_keys/${id}`, {
    answers: { n1: "4.0 m/s", m1: "Down", t1: "Because." },
    distractors: { m1: [{ answer: "Up", misconception: "force-implies-motion" }] },
  });
  docs.set(`assignment_solutions/${id}`, { solutions: { n1: "Use $v = d/t$." } });
}

beforeEach(() => {
  docs.clear();
  resetPoolCache();
});

describe("study pool", () => {
  test("serves the numeric and multiple-choice problems of published course sets, without keys", async () => {
    seedSet("s1");
    docs.set("assignments/plain", {
      visibility: "global",
      questions: [{ id: "x", type: "numeric" }],
    });
    const pool = await loadPool(NOW);
    expect([...pool.keys()].sort()).toEqual(["s1:m1", "s1:n1"]);
    const n1 = pool.get("s1:n1")!;
    expect(n1).toMatchObject({ topic: "ap-physics-1:3.4", unit: 3, solution: "Use $v = d/t$." });
    const shown =
      JSON.stringify(publicProblem(n1)) + JSON.stringify(publicProblem(pool.get("s1:m1")!));
    expect(shown).not.toMatch(/4\.0 m\/s|force-implies-motion|v = d\/t|correctAnswer/);
  });

  test("a set a class has open is left out; past, library-only and unrelated copies are not", async () => {
    for (const id of ["open", "hidden", "undated", "past", "library", "chained"]) seedSet(id);
    const copy = (id: string, data: Doc) => docs.set(`assignments/${id}`, data);
    // Written the way POST /api/assignments/clone writes a class copy.
    copy("c-open", { forkedFrom: "open", courseId: "class1", dueDate: "2026-12-01T00:00:00Z" });
    copy("c-hidden", {
      forkedFrom: "hidden",
      courseId: "class1",
      dueDate: "2026-12-05T00:00:00Z",
      archivedAt: "2026-11-20T00:00:00Z",
    });
    copy("c-undated", { forkedFrom: "undated", courseId: "class1", dueDate: null });
    copy("c-past", { forkedFrom: "past", courseId: "class1", dueDate: "2026-11-20T00:00:00Z" });
    copy("c-library", { forkedFrom: "library", courseId: null, dueDate: null });
    // A teacher reuses their own (past) class copy for another class, due next week.
    copy("c-chain-1", {
      forkedFrom: "chained",
      courseId: "class1",
      dueDate: "2026-11-01T00:00:00Z",
    });
    copy("c-chain-2", {
      forkedFrom: "c-chain-1",
      courseId: "class2",
      dueDate: "2026-12-03T00:00:00Z",
    });
    const sets = new Set([...(await loadPool(NOW)).values()].map((p) => p.setId));
    expect([...sets].sort()).toEqual(["library", "past"]);
  });

  test("decimal commas are read as decimal points, thousands separators are not", () => {
    expect(decimalComma("1,5 m/s")).toBe("1.5 m/s");
    expect(decimalComma("-2,0 m/s^2")).toBe("-2.0 m/s^2");
    expect(decimalComma("0,400 m/s")).toBe("0.400 m/s");
    expect(decimalComma("0,0250 s")).toBe("0.0250 s");
    expect(decimalComma("1,500 N")).toBe("1,500 N");
    expect(decimalComma("1.5 m/s")).toBe("1.5 m/s");
    expect(decimalComma("12 m")).toBe("12 m");
  });

  test("answers are checked like homework, with the matched misconception and the solution", async () => {
    seedSet("s1");
    const pool = await loadPool(NOW);
    expect(checkAnswer(pool.get("s1:n1")!, "4.02 m/s")).toMatchObject({
      correct: true,
      answer: "4.0 m/s",
      solution: "Use $v = d/t$.",
    });
    expect(checkAnswer(pool.get("s1:n1")!, "lots")).toMatchObject({ correct: false, fraction: 0 });
    const wrong = checkAnswer(pool.get("s1:m1")!, "Up");
    expect(wrong).toMatchObject({ correct: false, answer: "Down", solution: null });
    expect(wrong.misconception?.id).toBe("force-implies-motion");
    expect(checkAnswer(pool.get("s1:m1")!, "Neither").misconception).toBeNull();
  });
});

describe("pickProblems", () => {
  const p = (key: string) => ({ key }) as PoolProblem;
  const candidates = ["a", "b", "c", "d"].map(p);

  test("unanswered problems first, then the ones answered longest ago", () => {
    const at: Record<string, string> = { a: "2026-11-03", b: "2026-11-01", c: "2026-11-02" };
    const picked = pickProblems(candidates, 4, (k) => at[k], 1).map((x) => x.key);
    expect(picked).toEqual(["d", "b", "c", "a"]);
  });

  test("the same seed gives the same order and the count is respected", () => {
    const one = pickProblems(candidates, 2, () => undefined, 7).map((x) => x.key);
    expect(one).toHaveLength(2);
    expect(pickProblems(candidates, 2, () => undefined, 7).map((x) => x.key)).toEqual(one);
  });
});
