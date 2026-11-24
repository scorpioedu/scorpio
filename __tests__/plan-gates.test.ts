// Scorpio is free for every teacher: src/lib/plan-gates.ts locks nothing by plan.
import { assertCanCreateAssignment, resolveCallerPlan } from "../src/lib/plan-gates";
import { ClientError } from "../src/lib/client-error";

describe("resolveCallerPlan", () => {
  test("no organization (or an unsafe id) is hasNoOrg", () => {
    for (const id of [undefined, null, "", "a/b"]) {
      expect(resolveCallerPlan(id)).toEqual({ organizationId: null, hasNoOrg: true });
    }
  });
  test("a network id is passed through", () => {
    expect(resolveCallerPlan("o1")).toEqual({ organizationId: "o1", hasNoOrg: false });
  });
});

test("assertCanCreateAssignment: no count limit; network sharing needs an organization", () => {
  const plan = resolveCallerPlan(null);
  expect(() => assertCanCreateAssignment({ plan, visibility: "private" })).not.toThrow();
  expect(() => assertCanCreateAssignment({ plan, visibility: "global" })).not.toThrow();
  expect(() => assertCanCreateAssignment({ plan, visibility: "network" })).toThrow(ClientError);
  expect(() =>
    assertCanCreateAssignment({ plan: resolveCallerPlan("o"), visibility: "network" }),
  ).not.toThrow();
});
