// Server-side plan gates (src/lib/plan-gates.ts) and the shared pure rules in src/lib/plan-limits.ts.
const mockOrgs = new Map<string, Record<string, unknown>>();

jest.mock("../src/lib/firebase-admin", () => ({
  adminDb: {
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => ({
          data: () => (name === "organizations" ? mockOrgs.get(id) : undefined),
        }),
      }),
    }),
  },
}));

import {
  PlanGateError,
  assertCanCloneAssignment,
  assertCanCreateAssignment,
  planGateResponse,
  resolveCallerPlan,
} from "../src/lib/plan-gates";
import { ClientError } from "../src/lib/client-error";
import { isDepartmentPlanOrg } from "../src/lib/plan-limits";

beforeEach(() => {
  mockOrgs.clear();
});

describe("isDepartmentPlanOrg", () => {
  test.each([
    [null, false],
    [{}, false],
    [{ planId: "free", subscriptionStatus: "active" }, false],
    [{ planId: "dept", subscriptionStatus: "canceled" }, false],
    [{ planId: "dept", subscriptionStatus: "active" }, true],
  ])("%j -> %s", (org, expected) => expect(isDepartmentPlanOrg(org)).toBe(expected));
});

describe("resolveCallerPlan", () => {
  test("no organization (or an unsafe id) is the free plan with hasNoOrg", async () => {
    for (const id of [undefined, null, "", "a/b"]) {
      expect(await resolveCallerPlan(id)).toEqual({
        organizationId: null,
        planId: "free",
        subscriptionStatus: null,
        isDepartmentPlan: false,
        hasNoOrg: true,
      });
    }
  });
  test("reads planId and subscriptionStatus from organizations/{id}", async () => {
    mockOrgs.set("o1", { planId: "department-yearly", subscriptionStatus: "active" });
    expect(await resolveCallerPlan("o1")).toMatchObject({
      organizationId: "o1",
      planId: "department-yearly",
      isDepartmentPlan: true,
      hasNoOrg: false,
    });
    expect(await resolveCallerPlan("missing")).toMatchObject({
      planId: "free",
      isDepartmentPlan: false,
      hasNoOrg: false,
    });
  });
});

describe("assertCanCloneAssignment", () => {
  const free = {
    organizationId: "o1",
    planId: "free",
    subscriptionStatus: "active",
    isDepartmentPlan: false,
    hasNoOrg: false,
  };
  const paid = { ...free, planId: "dept", isDepartmentPlan: true };
  const run = (plan: typeof free, source: Record<string, unknown>) =>
    assertCanCloneAssignment({ plan, source, callerUid: "me" });

  test("paid plans and own assignments are never gated", () => {
    expect(() => run(paid, { visibility: "global" })).not.toThrow();
    expect(() => run(paid, { visibility: "network" })).not.toThrow();
    expect(() => run(free, { teacherId: "me", visibility: "network" })).not.toThrow();
  });
  test("free plan: every global waypoint can be copied (no cap)", () => {
    for (const _ of Array.from({ length: 50 })) {
      expect(() => run(free, { visibility: "global" })).not.toThrow();
    }
  });
  test('free plan: department/network waypoints stay locked as "network-share"', () => {
    for (const hasNoOrg of [true, false]) {
      let error: unknown;
      try {
        run({ ...free, hasNoOrg }, { visibility: "network" });
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(PlanGateError);
      expect(error).toMatchObject({ status: 403, feature: "network-share", hasNoOrg });
    }
  });
});

test("planGateResponse gives the client what it needs for the upgrade dialog", async () => {
  const res = planGateResponse(new PlanGateError("Upgrade", "network-share", true));
  expect(res.status).toBe(403);
  expect(await res.json()).toEqual({
    error: "Upgrade",
    code: "plan_upgrade_required",
    feature: "network-share",
    hasNoOrg: true,
  });
});

test("assertCanCreateAssignment: no free-plan count limit; network sharing needs an organization", () => {
  const plan = {
    organizationId: null,
    planId: "free",
    subscriptionStatus: null,
    isDepartmentPlan: false,
    hasNoOrg: true,
  };
  expect(() => assertCanCreateAssignment({ plan, visibility: "private" })).not.toThrow();
  expect(() => assertCanCreateAssignment({ plan, visibility: "global" })).not.toThrow();
  expect(() => assertCanCreateAssignment({ plan, visibility: "network" })).toThrow(ClientError);
  expect(() =>
    assertCanCreateAssignment({
      plan: { ...plan, organizationId: "o", hasNoOrg: false },
      visibility: "network",
    }),
  ).not.toThrow();
});
