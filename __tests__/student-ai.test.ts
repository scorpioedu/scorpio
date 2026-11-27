// Student AI is off unless a teacher turns it on for the class: the setting, the server check, and
// the three routes a student could reach a model through.
import { NextRequest } from "next/server";

type Data = Record<string, unknown>;
const mockDocs = new Map<string, Data>();

jest.mock("../src/lib/firebase-admin", () => ({
  adminFieldWithValue: { increment: (n: number) => ({ increment: n }) },
  adminDb: {
    collection: (name: string) => {
      const q = {
        where: () => q,
        get: async () => ({ docs: [] }),
        doc: (id: string) => ({
          get: async () => ({
            exists: mockDocs.has(`${name}/${id}`),
            data: () => mockDocs.get(`${name}/${id}`),
          }),
          update: async (d: Data) =>
            mockDocs.set(`${name}/${id}`, { ...mockDocs.get(`${name}/${id}`), ...d }),
        }),
      };
      return q;
    },
  },
}));
let mockUid = "s1";
jest.mock("../src/lib/auth-verify", () => ({
  withAuthorizedRequest:
    (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) => (req: NextRequest) =>
      handler(req, { caller: { uid: mockUid }, requestId: "r" }),
  verifyCallerIdentity: async () => ({ authorized: true }),
}));
const mockCheckBudget = jest.fn();
jest.mock("../src/lib/usage-limit", () => ({
  checkBudget: (...a: unknown[]) => mockCheckBudget(...a),
  recordUsage: jest.fn(async () => undefined),
}));
const mockExplain = jest.fn();
const mockSolve = jest.fn();
jest.mock("../src/lib/ai/tutor", () => ({
  diagramsOn: () => false,
  explainPhysicsConcept: (...a: unknown[]) => mockExplain(...a),
  helpSolveProblem: (...a: unknown[]) => mockSolve(...a),
}));
const mockNotebook = jest.fn();
jest.mock("../src/lib/ai/notebook", () => ({
  getNotebookAssistantResponse: (...a: unknown[]) => mockNotebook(...a),
}));
const mockNav = jest.fn();
jest.mock("../src/lib/ai/chatbot", () => ({
  getNavigationResponse: (...a: unknown[]) => mockNav(...a),
}));

import { STUDENT_AI_OFF_MESSAGE, classStudentAiOn } from "../src/lib/student-ai";
import { studentAiAllowed } from "../src/lib/student-ai-server";
import { updateCourseBody } from "../src/lib/schemas/api-bodies";
import { POST as tutorPost } from "../src/app/api/student/tutor/route";
import { POST as notebookPost } from "../src/app/api/notebook/chat/route";
import { POST as chatPost } from "../src/app/api/chat/route";
import { PATCH as coursePatch } from "../src/app/api/courses/[id]/route";
import { studentNavSections, studentNavSectionsNoAi } from "../src/components/student-sidebar";

jest.mock("../src/components/app-sidebar", () => ({ AppSidebar: () => null }));
jest.mock("../src/contexts/student-ai-context", () => ({ useStudentAi: () => false }));

const post = (path: string, body: unknown, method = "POST") =>
  new NextRequest(`https://scorpio.test${path}`, { method, body: JSON.stringify(body) });

/** A student in class c1 of teacher t1 (network o1). `course` is what the class doc stores. */
function seed(course: Data | undefined, student: Data = {}) {
  mockDocs.set("users/s1", {
    role: "student",
    teacherId: "t1",
    courseId: "c1",
    displayName: "Ada",
    ...student,
  });
  mockDocs.set("users/t1", { role: "teacher", organizationId: "o1" });
  mockDocs.set("organizations/o1", {});
  if (course) mockDocs.set("courses/c1", { teacherId: "t1", ...course });
}

beforeEach(() => {
  mockDocs.clear();
  mockUid = "s1";
  mockCheckBudget.mockReset().mockResolvedValue({ allowed: true });
  mockExplain.mockReset().mockResolvedValue({ text: "explained" });
  mockSolve.mockReset().mockResolvedValue({ text: "hint" });
  mockNotebook.mockReset().mockResolvedValue({ content: "notes help" });
  mockNav.mockReset().mockResolvedValue({ text: "go there" });
});

describe("the class setting", () => {
  test.each([
    [{ studentAi: true }, true],
    [{ studentAi: false }, false],
    [{}, false],
    [{ studentAi: "true" }, false],
    [{ studentAi: 1 }, false],
    [null, false],
    [undefined, false],
    ["studentAi", false],
  ])("classStudentAiOn(%j) is %s: only a stored true turns it on", (course, on) => {
    expect(classStudentAiOn(course)).toBe(on);
  });

  test("the class update accepts studentAi as a boolean only", () => {
    expect(updateCourseBody.safeParse({ studentAi: true }).success).toBe(true);
    expect(updateCourseBody.safeParse({ studentAi: false }).success).toBe(true);
    expect(updateCourseBody.safeParse({ studentAi: "yes" }).success).toBe(false);
  });

  test("the owner turns it on and off through PATCH /api/courses/{id}; another teacher cannot", async () => {
    mockDocs.set("courses/c1", { teacherId: "t1", name: "Period 1" });
    mockUid = "t1";
    expect((await coursePatch(post("/api/courses/c1", { studentAi: true }, "PATCH"))).status).toBe(
      200,
    );
    expect(mockDocs.get("courses/c1")).toMatchObject({ studentAi: true, name: "Period 1" });
    expect((await coursePatch(post("/api/courses/c1", { studentAi: false }, "PATCH"))).status).toBe(
      200,
    );
    expect(mockDocs.get("courses/c1")?.studentAi).toBe(false);
    mockUid = "t2";
    expect((await coursePatch(post("/api/courses/c1", { studentAi: true }, "PATCH"))).status).toBe(
      403,
    );
    expect(mockDocs.get("courses/c1")?.studentAi).toBe(false);
  });
});

describe("studentAiAllowed", () => {
  const profile = { role: "student", teacherId: "t1", courseId: "c1" };

  test("true only when the student's own class has it on", async () => {
    mockDocs.set("courses/c1", { teacherId: "t1", studentAi: true });
    expect(await studentAiAllowed(profile)).toBe(true);
  });

  test.each([
    ["the class has never set it", { teacherId: "t1" }, profile],
    ["the class has it off", { teacherId: "t1", studentAi: false }, profile],
    ["the class belongs to another teacher", { teacherId: "t2", studentAi: true }, profile],
    ["the student is in no class", { teacherId: "t1", studentAi: true }, { role: "student" }],
    ["the student has no teacher", { teacherId: "t1", studentAi: true }, { courseId: "c1" }],
    [
      "the class id is a path",
      { teacherId: "t1", studentAi: true },
      { ...profile, courseId: "c1/x" },
    ],
    ["there is no profile", { teacherId: "t1", studentAi: true }, undefined],
  ])("false when %s", async (_why, course, who) => {
    mockDocs.set("courses/c1", course);
    expect(await studentAiAllowed(who)).toBe(false);
  });

  test("false when the class no longer exists", async () => {
    expect(await studentAiAllowed(profile)).toBe(false);
  });
});

describe("POST /api/student/tutor", () => {
  const body = { message: "Why?", userId: "s1", role: "student", mode: "concept", chatHistory: [] };

  test.each([[undefined], [{}], [{ studentAi: false }]])(
    "refused before any budget or model call when the class is %j",
    async (course) => {
      seed(course);
      const res = await tutorPost(post("/api/student/tutor", body));
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: STUDENT_AI_OFF_MESSAGE, code: "student_ai_off" });
      expect(mockCheckBudget).not.toHaveBeenCalled();
      expect(mockExplain).not.toHaveBeenCalled();
      expect(mockSolve).not.toHaveBeenCalled();
    },
  );

  test("answers when the class has it on", async () => {
    seed({ studentAi: true });
    const res = await tutorPost(post("/api/student/tutor", body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ response: "explained" });
  });

  test("a student in no class keeps the enrolment message", async () => {
    mockDocs.set("users/s1", { role: "student" });
    const res = await tutorPost(post("/api/student/tutor", body));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/enrolled/);
  });

  describe("a hint on an assignment", () => {
    const hint = { ...body, mode: "tutor", assignmentContext: "Q1", assignmentId: "a1" };

    test("is given when the class has Raise on and the assignment allows hints", async () => {
      seed({ studentAi: true });
      mockDocs.set("assignments/a1", { teacherId: "t1", allowAIHelp: true });
      const res = await tutorPost(post("/api/student/tutor", hint));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ response: "hint" });
    });

    test.each([
      ["the assignment has hints off", { teacherId: "t1", allowAIHelp: false }],
      ["the assignment never set hints", { teacherId: "t1" }],
      ["the assignment is another teacher's", { teacherId: "t2", allowAIHelp: true }],
      ["the assignment does not exist", undefined],
    ])("is refused when %s, even with Raise on for the class", async (_why, assignment) => {
      seed({ studentAi: true });
      if (assignment) mockDocs.set("assignments/a1", assignment);
      const res = await tutorPost(post("/api/student/tutor", hint));
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe("hints_off");
      expect(mockSolve).not.toHaveBeenCalled();
    });

    test("is refused for an assignment id that is a path", async () => {
      seed({ studentAi: true });
      const res = await tutorPost(post("/api/student/tutor", { ...hint, assignmentId: "a1/x" }));
      expect(res.status).toBe(403);
      expect(mockSolve).not.toHaveBeenCalled();
    });

    test("is refused when the assignment allows hints but the class has Raise off", async () => {
      seed({});
      mockDocs.set("assignments/a1", { teacherId: "t1", allowAIHelp: true });
      const res = await tutorPost(post("/api/student/tutor", hint));
      expect((await res.json()).code).toBe("student_ai_off");
      expect(mockSolve).not.toHaveBeenCalled();
    });
  });
});

describe("POST /api/notebook/chat", () => {
  const body = { messages: [{ role: "user", content: "help" }], studentId: "s1" };

  test("refused without a model call when the class has Raise off", async () => {
    seed({});
    const res = await notebookPost(post("/api/notebook/chat", body));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("student_ai_off");
    expect(mockNotebook).not.toHaveBeenCalled();
  });

  test("answers when the class has it on", async () => {
    seed({ studentAi: true });
    const res = await notebookPost(post("/api/notebook/chat", body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ content: "notes help" });
  });
});

describe("POST /api/chat", () => {
  test("a student is refused even when the class has Raise on and the request claims teacher", async () => {
    seed({ studentAi: true });
    const res = await chatPost(
      post("/api/chat", { message: "where?", userRole: "teacher", userId: "s1" }),
    );
    expect(res.status).toBe(403);
    expect(mockNav).not.toHaveBeenCalled();
  });

  test("a teacher is answered", async () => {
    seed({});
    const res = await chatPost(
      post("/api/chat", { message: "where?", userRole: "teacher", userId: "t1" }),
    );
    expect(res.status).toBe(200);
  });
});

describe("the student sidebar", () => {
  const hrefs = (sections: typeof studentNavSections) =>
    sections.flatMap((s) => s.items).map((i) => ("href" in i ? i.href : i.label));

  test("with Raise off there is no Raise and no Green Impact; everything else is unchanged", () => {
    expect(hrefs(studentNavSectionsNoAi)).toEqual([
      "/student",
      "/student/assignments",
      "/student/grades",
      "/student/study",
    ]);
    expect(hrefs(studentNavSections)).toEqual([
      ...hrefs(studentNavSectionsNoAi),
      "/student/tutor",
      "/student/sustainability",
    ]);
  });
});
