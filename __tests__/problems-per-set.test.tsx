/**
 * "Problems per set": the assign dialog's one control, and the class remembering the last choice.
 * The jest environment is "node" with no DOM (see route-boundaries.test.tsx), so the control is
 * rendered to static markup; the dialog around it is a portal and renders nothing here.
 */
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";

type Data = Record<string, unknown>;
const mockDocs = new Map<string, Data>();
let mockUid = "t1";
const mockDelete = { __delete: true };

jest.mock("../src/lib/firebase-admin", () => ({
  adminFieldWithValue: { delete: () => mockDelete },
  adminDb: {
    collection: (name: string) => ({
      doc: (id: string) => {
        const path = `${name}/${id}`;
        return {
          get: async () => ({ exists: mockDocs.has(path), data: () => mockDocs.get(path) }),
          update: async (d: Data) => {
            const next: Data = { ...mockDocs.get(path) };
            for (const [k, v] of Object.entries(d))
              if (v === mockDelete) delete next[k];
              else next[k] = v;
            mockDocs.set(path, next);
          },
          // Only { merge: true } is used: one level of maps is merged, as Firestore does.
          set: async (d: Data) => {
            const next: Data = { ...mockDocs.get(path) };
            for (const [k, v] of Object.entries(d))
              next[k] =
                v && typeof v === "object" && !Array.isArray(v)
                  ? { ...(next[k] as Data | undefined), ...(v as Data) }
                  : v;
            mockDocs.set(path, next);
          },
        };
      },
    }),
  },
}));
jest.mock("../src/lib/auth-verify", () => ({
  withAuthorizedRequest:
    (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) => async (req: NextRequest) =>
      handler(req, { caller: { uid: mockUid }, requestId: "r" }),
}));
// The dialog's date formatter lives beside the page's Firestore loaders; only it is needed here.
jest.mock("../src/app/teacher/courses/use-course-data", () => ({
  shortDate: (d: Date) => d.toDateString(),
}));

import { PATCH } from "../src/app/api/courses/[id]/assignment-defaults/route";
import { ProblemsPerSetField } from "../src/app/teacher/courses/assign-dialog";
import { sizeChoice, type AssignableSet } from "../src/lib/assign-sets";
import { deriveRoadmap } from "../src/lib/curriculum-roadmap";
import {
  BASE_ASSIGNMENT_DEFAULTS,
  parseAssignmentDefaults,
  parseProblemsPerSet,
} from "../src/lib/assignment-defaults";

const patch = (body: unknown, id = "c1") =>
  PATCH(
    new NextRequest(`https://scorpio.test/api/courses/${id}/assignment-defaults`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  );
const stored = () => mockDocs.get("courses/c1")!.assignmentDefaults;
const settings = { ...BASE_ASSIGNMENT_DEFAULTS, timeLimit: 45, lockdownMode: true };

beforeEach(() => {
  mockDocs.clear();
  mockUid = "t1";
  mockDocs.set("courses/c1", { teacherId: "t1", name: "P3" });
});

describe("PATCH /api/courses/{id}/assignment-defaults { problemsPerSet }", () => {
  test("a class with no settings remembers the number and still has no settings", async () => {
    const res = await patch({ problemsPerSet: 8 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: "c1",
      assignmentDefaults: { problemsPerSet: 8 },
      problemsPerSet: 8,
    });
    expect(stored()).toEqual({ problemsPerSet: 8 });
    // What a copy made in the class reads: no class settings, so the source's own are kept.
    expect(parseAssignmentDefaults(stored())).toBeNull();
    expect(parseProblemsPerSet(stored())).toBe(8);
  });

  test("it is stored beside the settings and leaves them alone", async () => {
    mockDocs.set("courses/c1", { teacherId: "t1", assignmentDefaults: settings });
    expect((await patch({ problemsPerSet: 3 })).status).toBe(200);
    expect(stored()).toEqual({ ...settings, problemsPerSet: 3 });
    expect(parseAssignmentDefaults(stored())).toEqual(settings);
    await patch({ problemsPerSet: 10 });
    expect(stored()).toEqual({ ...settings, problemsPerSet: 10 });
  });

  test("saving or clearing the settings keeps the remembered number", async () => {
    await patch({ problemsPerSet: 8 });
    const saved = await patch({ assignmentDefaults: settings });
    expect((await saved.json()).assignmentDefaults).toEqual({ ...settings, problemsPerSet: 8 });
    expect(stored()).toEqual({ ...settings, problemsPerSet: 8 });
    await patch({ assignmentDefaults: null });
    expect(stored()).toEqual({ problemsPerSet: 8 });
  });

  test("without a remembered number the settings route behaves as before", async () => {
    const saved = await patch({ assignmentDefaults: settings });
    expect(await saved.json()).toEqual({ id: "c1", assignmentDefaults: settings });
    expect(stored()).toEqual(settings);
    const cleared = await patch({ assignmentDefaults: null });
    expect(await cleared.json()).toEqual({ id: "c1", assignmentDefaults: null });
    expect("assignmentDefaults" in mockDocs.get("courses/c1")!).toBe(false);
  });

  test("validated on the server: 3 to 10, whole, and only the class's owner", async () => {
    for (const problemsPerSet of [2, 11, 0, 4.5, "5", null])
      expect([problemsPerSet, (await patch({ problemsPerSet })).status]).toEqual([
        problemsPerSet,
        400,
      ]);
    expect((await patch({ problemsPerSet: 5, assignmentDefaults: settings })).status).toBe(400);
    expect((await patch({})).status).toBe(400);
    mockUid = "someoneElse";
    expect((await patch({ problemsPerSet: 5 })).status).toBe(403);
    mockUid = "t1";
    expect((await patch({ problemsPerSet: 5 }, "missing")).status).toBe(403);
    expect(stored()).toBeUndefined();
  });
});

describe("the assign dialog's control", () => {
  const set = (key: string, poolSize: number): AssignableSet => ({
    sourceId: `w${key}`,
    key,
    title: key,
    poolSize,
  });
  const html = (node: ReactNode) => renderToStaticMarkup(node);
  const field = (sets: AssignableSet[], remembered?: number | null, value?: number) => {
    const choice = sizeChoice(sets, remembered);
    return html(
      <ProblemsPerSetField
        choice={choice}
        sets={sets}
        value={value ?? choice.initial}
        onChange={() => undefined}
      />,
    );
  };

  test("hidden while no set has more than five problems: the dialog is as it was", () => {
    expect(field([set("4A", 5), set("4B", 5)])).toBe("");
    expect(field([set("4A", 5)], 8)).toBe("");
  });

  test("shown once a set has more, labelled like the other fields", () => {
    const markup = field([set("4A", 10)]);
    expect(markup).toContain("Problems per set");
    expect(markup).toContain('for="assign-count"');
    expect(markup).toContain('id="assign-count"');
    // No note unless a set is capped.
    expect(markup).not.toContain("so it gets");
  });

  test("starts on five, or on the class's last choice", () => {
    expect(sizeChoice([set("4A", 10)]).initial).toBe(5);
    expect(sizeChoice([set("4A", 10)], 8).initial).toBe(8);
    expect(sizeChoice([set("4A", 10)], parseProblemsPerSet({ problemsPerSet: 7 })).initial).toBe(7);
  });

  test("one short line when sets have different numbers of problems, only when it applies", () => {
    const sets = [set("4A", 10), set("4B", 5), set("4C", 10)];
    expect(field(sets, null, 8)).toContain("4B has 5 problems, so it gets all 5.");
    expect(field(sets, null, 5)).not.toContain("gets all");
    expect(field([set("4A", 10), set("4B", 5), set("4C", 7)], null, 9)).toContain(
      "4B, 4C have fewer than 9, so they get all they have.",
    );
  });
});

describe("the roadmap knows how many problems a class copy has", () => {
  test("an assigned set carries its copy's question count; an unassigned one has none", () => {
    const published = [
      { id: "w4A", curriculumSetKey: "4A", questionCount: 10 },
      { id: "w4B", curriculumSetKey: "4B", questionCount: 10 },
    ];
    const unit4 = deriveRoadmap("ap-physics-1", published, [
      { id: "a1", curriculumSetKey: "4A", questionCount: 8 },
    ])[3];
    expect(unit4.sets[0]).toMatchObject({ assigned: true, questionCount: 8 });
    expect(unit4.sets[1].assigned).toBe(false);
    expect(unit4.sets[1].questionCount).toBeUndefined();
    expect(unit4.sets[1].published?.questionCount).toBe(10);
  });
});
