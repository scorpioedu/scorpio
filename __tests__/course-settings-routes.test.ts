// PATCH/DELETE /api/courses/{id} and POST /api/courses/{id}/code: class settings, archive, join codes.
import { NextRequest } from "next/server";
import { newClassCode } from "../src/lib/class-codes";

type Data = Record<string, unknown>;
const mockDocs = new Map<string, Data>();
let mockUid = "t1";

jest.mock("../src/lib/firebase-admin", () => {
  const ref = (name: string, id: string) => ({
    id,
    path: `${name}/${id}`,
    get: async () => ({
      exists: mockDocs.has(`${name}/${id}`),
      data: () => mockDocs.get(`${name}/${id}`),
    }),
    update: async (d: Data) =>
      mockDocs.set(`${name}/${id}`, { ...mockDocs.get(`${name}/${id}`), ...d }),
  });
  const collection = (name: string) => {
    const filters: [string, unknown][] = [];
    const q = {
      where: (f: string, _op: string, v: unknown) => (filters.push([f, v]), q),
      limit: () => q,
      doc: (id: string) => ref(name, id),
      get: async () => {
        const docs = [...mockDocs.entries()].filter(
          ([p, d]) => p.startsWith(`${name}/`) && filters.every(([f, v]) => d[f] === v),
        );
        return { empty: docs.length === 0, docs };
      },
    };
    return q;
  };
  return {
    adminDb: {
      collection,
      runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        const writes: (() => void)[] = [];
        const tx = {
          get: (r: { get: () => Promise<unknown> }) => r.get(),
          create: (r: { path: string }, d: Data) => writes.push(() => mockDocs.set(r.path, d)),
          update: (r: { path: string }, d: Data) =>
            writes.push(() => mockDocs.set(r.path, { ...mockDocs.get(r.path), ...d })),
          delete: (r: { path: string }) => writes.push(() => mockDocs.delete(r.path)),
        };
        const result = await fn(tx);
        writes.forEach((w) => w());
        return result;
      },
    },
  };
});
jest.mock("../src/lib/auth-verify", () => ({
  withAuthorizedRequest:
    (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) => async (req: NextRequest) =>
      handler(req, { caller: { uid: mockUid }, requestId: "r" }),
}));

import { PATCH, DELETE } from "../src/app/api/courses/[id]/route";
import { POST as newCode } from "../src/app/api/courses/[id]/code/route";

const req = (path: string, method: string, body?: unknown) =>
  new NextRequest(`https://scorpio.test${path}`, {
    method,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

beforeEach(() => {
  mockDocs.clear();
  mockUid = "t1";
  mockDocs.set("courses/c1", { teacherId: "t1", name: "Period 5", code: "OLDCODE1" });
  mockDocs.set("course_codes/OLDCODE1", { courseId: "c1" });
  mockDocs.set("courses/c2", { teacherId: "t2", name: "Theirs", code: "THEIRS01" });
});

describe("class settings", () => {
  test("rename, period, archive and restore", async () => {
    expect(
      (await PATCH(req("/api/courses/c1", "PATCH", { name: " Period 6 ", period: "6" }))).status,
    ).toBe(200);
    expect(mockDocs.get("courses/c1")).toMatchObject({ name: "Period 6", period: "6" });
    await PATCH(req("/api/courses/c1", "PATCH", { archived: true }));
    expect(typeof mockDocs.get("courses/c1")!.archivedAt).toBe("string");
    await PATCH(req("/api/courses/c1", "PATCH", { archived: false }));
    expect(mockDocs.get("courses/c1")!.archivedAt).toBeNull();
  });

  test("only the owner; nothing empty", async () => {
    expect((await PATCH(req("/api/courses/c2", "PATCH", { name: "Mine" }))).status).toBe(403);
    expect((await PATCH(req("/api/courses/c1", "PATCH", {}))).status).toBe(400);
    expect((await PATCH(req("/api/courses/c1", "PATCH", { name: "  " }))).status).toBe(400);
    expect(mockDocs.get("courses/c2")!.name).toBe("Theirs");
  });

  test("a new join code is reserved and the old one freed", async () => {
    const res = await newCode(req("/api/courses/c1/code", "POST"));
    const { code } = await res.json();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(mockDocs.get("courses/c1")!.code).toBe(code);
    expect(mockDocs.get(`course_codes/${code}`)).toEqual({ courseId: "c1" });
    expect(mockDocs.has("course_codes/OLDCODE1")).toBe(false);
    expect((await newCode(req("/api/courses/c2/code", "POST"))).status).toBe(403);
  });

  test("deleting a class frees its code; not someone else's", async () => {
    expect((await DELETE(req("/api/courses/c2", "DELETE"))).status).toBe(403);
    expect(mockDocs.has("courses/c2")).toBe(true);
    expect((await DELETE(req("/api/courses/c1", "DELETE"))).status).toBe(200);
    expect(mockDocs.has("courses/c1")).toBe(false);
    expect(mockDocs.has("course_codes/OLDCODE1")).toBe(false);
  });

  test("codes avoid look-alike characters", () => {
    expect(newClassCode(() => new Uint8Array([0, 8, 14, 31, 32, 255, 7, 23]))).toMatch(
      /^[A-HJ-NP-Z2-9]{8}$/,
    );
  });
});
