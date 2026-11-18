import { NextRequest } from "next/server";

const verifyIdToken = jest.fn();
const updates: Array<Record<string, unknown>> = [];
const sets: Array<Record<string, unknown>> = [];
let tickets: Array<{ id: string; data: Record<string, unknown> }> = [];
let failSet = false;

const ticketsCol = {
  orderBy: () => ticketsCol,
  limit: () => ticketsCol,
  get: async () => ({ docs: tickets.map((t) => ({ id: t.id, data: () => t.data })) }),
  doc: (id: string) => ({
    get: async () => {
      const t = tickets.find((x) => x.id === id);
      return { exists: !!t, data: () => t?.data };
    },
    update: async (u: Record<string, unknown>) => {
      updates.push({ id, ...u });
    },
    set: async (d: Record<string, unknown>) => {
      if (failSet) throw new Error("unavailable");
      sets.push(d);
    },
  }),
};
jest.mock("../src/lib/firebase-admin", () => ({
  adminAuth: {
    verifyIdToken: (...a: unknown[]) => verifyIdToken(...a),
    verifySessionCookie: jest.fn(),
  },
  adminDb: {
    collection: (name: string) =>
      name === "support_tickets"
        ? ticketsCol
        : {
            add: async () => ({ id: "x" }),
            doc: () => ({ get: async () => ({ data: () => ({ role: "teacher" }) }) }),
          },
  },
}));

import { GET, PATCH } from "../src/app/api/admin/support/route";
import { POST as report } from "../src/app/api/support/report/route";
import { summariseTickets, serialiseTicket } from "../src/lib/support/tickets";
import { buildFeedbackPayload, feedbackAreaForPath } from "../src/lib/support/feedback";

const H = { Authorization: "Bearer t" };
const get = (qs = "") =>
  new NextRequest(`https://scorpio.test/api/admin/support${qs}`, { method: "GET", headers: H });
const patch = (body: unknown) =>
  new NextRequest("https://scorpio.test/api/admin/support", {
    method: "PATCH",
    headers: H,
    body: JSON.stringify(body),
  });
const asAdmin = () => verifyIdToken.mockResolvedValue({ uid: "root", admin: true });
const asTeacher = () => verifyIdToken.mockResolvedValue({ uid: "t1" });

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

beforeEach(() => {
  updates.length = 0;
  sets.length = 0;
  failSet = false;
  verifyIdToken.mockReset();
  tickets = [
    {
      id: "SC-A",
      data: {
        ticketId: "SC-A",
        description: "new",
        category: "bug",
        status: "open",
        createdAt: hoursAgo(2),
        screenshots: ["data:x"],
      },
    },
    {
      id: "SC-B",
      data: {
        ticketId: "SC-B",
        description: "old",
        category: "feature",
        status: "open",
        createdAt: hoursAgo(60),
      },
    },
    {
      id: "SC-C",
      data: { ticketId: "SC-C", description: "legacy", category: "bug", createdAt: hoursAgo(80) },
    },
    {
      id: "SC-D",
      data: {
        ticketId: "SC-D",
        description: "done",
        category: "bug",
        status: "done",
        createdAt: hoursAgo(100),
      },
    },
  ];
});

describe("GET /api/admin/support", () => {
  test("rejects non-admins and anonymous callers", async () => {
    expect((await GET(new NextRequest("https://scorpio.test/api/admin/support"))).status).toBe(401);
    asTeacher();
    expect((await GET(get())).status).toBe(403);
  });

  test("lists tickets with summary, without screenshot payloads", async () => {
    asAdmin();
    const res = await GET(get());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tickets).toHaveLength(4);
    expect(body.tickets[0].screenshotCount).toBe(1);
    expect(body.tickets[0].screenshots).toBeUndefined();
    expect(body.summary).toMatchObject({
      total: 4,
      open: 3,
      done: 1,
      newLast24h: 1,
      openOverTwoDays: 2,
    });
  });

  test("filters by status and category; summary still covers everything", async () => {
    asAdmin();
    const body = await (await GET(get("?status=open&category=bug"))).json();
    expect(body.tickets.map((t: { id: string }) => t.id)).toEqual(["SC-A", "SC-C"]);
    expect(body.summary.total).toBe(4);
  });

  test("rejects unknown filters", async () => {
    asAdmin();
    expect((await GET(get("?status=nope"))).status).toBe(400);
    expect((await GET(get("?category=nope"))).status).toBe(400);
  });
});

describe("PATCH /api/admin/support", () => {
  test("is admin only", async () => {
    asTeacher();
    expect((await PATCH(patch({ id: "SC-A", status: "done" }))).status).toBe(403);
    expect(updates).toHaveLength(0);
  });

  test("validates status and requires a change", async () => {
    asAdmin();
    expect((await PATCH(patch({ id: "SC-A", status: "archived" }))).status).toBe(400);
    expect((await PATCH(patch({ id: "SC-A" }))).status).toBe(400);
    expect((await PATCH(patch({ id: "../x", status: "done" }))).status).toBe(400);
    expect(updates).toHaveLength(0);
  });

  test("404 for a missing ticket", async () => {
    asAdmin();
    expect((await PATCH(patch({ id: "SC-NOPE", status: "done" }))).status).toBe(404);
  });

  test("sets status and note and records updatedAt/updatedBy", async () => {
    asAdmin();
    const res = await PATCH(patch({ id: "SC-A", status: "triaged", note: "replied by email" }));
    expect(res.status).toBe(200);
    expect(updates[0]).toMatchObject({
      id: "SC-A",
      status: "triaged",
      adminNote: "replied by email",
      updatedBy: "root",
    });
    expect(typeof updates[0].updatedAt).toBe("string");
    expect((await res.json()).ticket.status).toBe("triaged");
  });
});

describe("POST /api/support/report from the feedback widget", () => {
  const post = (body: unknown) =>
    new NextRequest("https://scorpio.test/api/support/report", {
      method: "POST",
      headers: H,
      body: JSON.stringify(body),
    });

  test("stores source, context and app area and returns the ticket id", async () => {
    verifyIdToken.mockResolvedValue({ uid: "t1" });
    const res = await report(
      post(
        buildFeedbackPayload({
          kind: "feature",
          text: "Dark mode",
          tryingTo: "grade at night",
          pathname: "/teacher/grades?x=1",
          area: "teacher",
          user: { uid: "t1", email: "t@example.test", displayName: null },
        }),
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ticketId).toMatch(/^SC-FEAT-/);
    expect(sets[0]).toMatchObject({
      source: "feedback-widget",
      category: "feature",
      context: "grade at night",
      appContext: "teacher",
      pageUrl: "/teacher/grades",
      status: "open",
    });
  });

  test("keeps the identity check", async () => {
    verifyIdToken.mockResolvedValue({ uid: "t1" });
    const res = await report(
      post({ description: "x", source: "feedback-widget", userId: "someone-else" }),
    );
    expect(res.status).toBe(403);
    expect(sets).toHaveLength(0);
  });

  test("rejects an unknown source", async () => {
    verifyIdToken.mockResolvedValue({ uid: "t1" });
    expect((await report(post({ description: "x", source: "other", userId: "t1" }))).status).toBe(
      400,
    );
  });

  test("returns 503 and never success when the ticket is not stored", async () => {
    verifyIdToken.mockResolvedValue({ uid: "t1" });
    failSet = true;
    const res = await report(post({ description: "x", source: "feedback-widget", userId: "t1" }));
    expect(res.status).toBe(503);
    expect((await res.json()).success).toBeUndefined();
  });
});

describe("support helpers", () => {
  test("summariseTickets counts the 2-day target against open tickets only", () => {
    const now = Date.parse("2026-12-05T12:00:00Z");
    const mk = (status: string, createdAt: string) => serialiseTicket("i", { status, createdAt });
    const s = summariseTickets(
      [
        mk("open", "2026-12-02T12:00:00Z"),
        mk("triaged", "2026-12-01T12:00:00Z"),
        mk("open", "2026-12-05T10:00:00Z"),
      ],
      now,
    );
    expect(s).toMatchObject({ open: 2, triaged: 1, openOverTwoDays: 1, newLast24h: 1 });
  });

  test("the widget shows only on signed-in app areas", () => {
    expect(feedbackAreaForPath("/teacher/grades")).toBe("teacher");
    expect(feedbackAreaForPath("/admin")).toBe("admin");
    expect(feedbackAreaForPath("/student")).toBe("student");
    for (const p of [
      "/",
      "/pricing",
      "/login",
      "/join/abc",
      "/teachers",
      "/student/tutor",
      "/student/assignment-view/1",
      null,
    ]) {
      expect(feedbackAreaForPath(p)).toBeNull();
    }
  });
});
