// Server-side plan gates (src/lib/plan-gates.ts) and the shared pure rules in src/lib/plan-limits.ts.
const mockOrgs = new Map<string, Record<string, unknown>>();
let mockGlobalIds: string[] = [];
const mockLimit = jest.fn();

jest.mock("../src/lib/firebase-admin", () => ({
  adminDb: {
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => ({
          data: () => (name === "organizations" ? mockOrgs.get(id) : undefined),
        }),
      }),
      where: (field: string, op: string, value: unknown) => {
        expect([name, field, op, value]).toEqual(["assignments", "visibility", "==", "global"]);
        return {
          limit: (n: number) => {
            mockLimit(n);
            return {
              get: async () => ({
                docs: [...mockGlobalIds]
                  .sort()
                  .slice(0, n)
                  .map((id) => ({ id })),
              }),
            };
          },
        };
      },
    }),
  },
}));

import {
  PlanGateError,
  assertCanCloneAssignment,
  assertCanCreateAssignment,
  getStarterWaypointIds,
  planGateResponse,
  resolveCallerPlan,
} from "../src/lib/plan-gates";
import { ClientError } from "../src/lib/client-error";
import { isDepartmentPlanOrg, STARTER_WAYPOINT_COUNT } from "../src/lib/plan-limits";

beforeEach(() => {
  mockOrgs.clear();
  mockGlobalIds = ["g3", "g1", "g2", "g4"];
  mockLimit.mockClear();
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

test("starter waypoints are the first global assignments by document id", async () => {
  expect(await getStarterWaypointIds()).toEqual(["g1", "g2", "g3"]);
  expect(mockLimit).toHaveBeenCalledWith(STARTER_WAYPOINT_COUNT);
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
  const run = (plan: typeof free, sourceId: string, source: Record<string, unknown>) =>
    assertCanCloneAssignment({ plan, sourceId, source, callerUid: "me" });

  test("paid plans and own assignments are never gated", async () => {
    await expect(run(paid, "g4", { visibility: "global" })).resolves.toBeUndefined();
    await expect(run(paid, "n", { visibility: "network" })).resolves.toBeUndefined();
    await expect(
      run(free, "x", { teacherId: "me", visibility: "network" }),
    ).resolves.toBeUndefined();
  });
  test('free plan: starter waypoints allowed, others locked as "waypoints"', async () => {
    await expect(run(free, "g2", { visibility: "global" })).resolves.toBeUndefined();
    const error = await run(free, "g4", { visibility: "global" }).catch((e) => e);
    expect(error).toBeInstanceOf(PlanGateError);
    expect(error).toMatchObject({ status: 403, feature: "waypoints", hasNoOrg: false });
  });
  test('free plan: network waypoints locked as "network-share" without querying starters', async () => {
    await expect(
      run({ ...free, hasNoOrg: true }, "n", { visibility: "network" }),
    ).rejects.toMatchObject({ feature: "network-share", hasNoOrg: true });
    expect(mockLimit).not.toHaveBeenCalled();
  });
});

test("planGateResponse gives the client what it needs for the upgrade dialog", async () => {
  const res = planGateResponse(new PlanGateError("Upgrade", "waypoints", true));
  expect(res.status).toBe(403);
  expect(await res.json()).toEqual({
    error: "Upgrade",
    code: "plan_upgrade_required",
    feature: "waypoints",
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
